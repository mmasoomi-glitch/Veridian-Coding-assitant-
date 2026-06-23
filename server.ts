import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { execFile } from "child_process";
import { createServer as createViteServer } from "vite";
import { recordTelemetry } from "./telemetry/persist";
import { getWaitingItems } from "./telemetry/watcher";
import { chatJSON, activeProvider } from "./ai/providers";
import { recordFeedback, autonomyFor } from "./autopilot/learn";
import { saveBrief, getBrief, allBriefs } from "./autopilot/desktop-briefs";
import { readProjects, writeProjects, fleetStatus, startFleetRun } from "./autopilot/fleet";
import { listSessions, runDesktopSession } from "./autopilot/sessions";
import * as notebook from "./autopilot/notebook";
import * as clipHistory from "./autopilot/clip-history";
import { getGitStats } from "./telemetry/gitstats";
import { generatePdr, listPdrs, getPdr } from "./autopilot/pdr";
import * as prompts from "./autopilot/prompts-store";
import { backupFolder, listBackups, restoreFolder } from "./autopilot/backup";
import { recordMachine, listMachines, getMachine } from "./autopilot/sync-store";
import { startSyncClient } from "./autopilot/sync-client";
import { saveScratch, getScratch } from "./autopilot/scratch-store";
import * as totp from "./auth/totp";
import os from "os";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
const SESSION_DB_PATH = path.join(process.cwd(), "workspace-sessions.json");

// CORS — allow the packaged APK WebView (capacitor://, http(s)://localhost)
// and browsers to call the API cross-origin. No cookies/credentials are used,
// so reflecting the origin (or "*") is safe here.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Middleware
app.use(express.json());

// --- Admin TOTP auth (active only when VERIDIAN_AUTH=totp; local stays open) ---
function getCookie(req: any, name: string): string {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}
app.use((req, res, next) => {
  if (!totp.authRequired()) return next();
  const p = req.path;
  // Allow auth endpoints + the SPA shell/static through; gate the data APIs.
  if (p.startsWith("/api/auth/") || !p.startsWith("/api/")) return next();
  if (totp.verifySessionToken(getCookie(req, "vsess"))) return next();
  return res.status(401).json({ error: "auth required" });
});
app.get("/api/auth/status", (req, res) => res.json({
  required: totp.authRequired(),
  authed: totp.verifySessionToken(getCookie(req, "vsess")),
  configured: totp.isConfigured()
}));
app.post("/api/auth/login", (req, res) => {
  const { code, recovery } = req.body || {};
  const ok = recovery ? totp.verifyRecovery(String(recovery)) : totp.verifyCode(String(code || ""));
  if (!ok) return res.status(401).json({ ok: false, error: "invalid code" });
  const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `vsess=${encodeURIComponent(totp.createSessionToken())}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${secure}`);
  res.json({ ok: true });
});
app.get("/api/auth/setup", async (req, res) => {
  const local = ["localhost", "127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.hostname) || String(req.ip || "").includes("127.0.0.1");
  if (!local && totp.isConfigured()) return res.status(403).json({ error: "setup locked" });
  res.json(await totp.getSetupInfo());
});
app.post("/api/auth/logout", (req, res) => {
  res.setHeader("Set-Cookie", "vsess=; HttpOnly; Path=/; Max-Age=0");
  res.json({ ok: true });
});

// Helper to read database
function readSessionDb() {
  try {
    if (fs.existsSync(SESSION_DB_PATH)) {
      const data = fs.readFileSync(SESSION_DB_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error reading session database:", error);
  }
  return [];
}

// Helper to write database
function writeSessionDb(data: any) {
  try {
    fs.writeFileSync(SESSION_DB_PATH, JSON.stringify(data, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error writing session database:", error);
    return false;
  }
}

// No fictional seeding. Start from a clean, empty session store; real data is
// captured live via the telemetry collector (/api/telemetry/current).
function maybeSeedDatabase() {
  if (readSessionDb().length === 0) {
    writeSessionDb([]);
  }
}

// Run seed checks on setup
maybeSeedDatabase();

// --- API ROUTES ---

// 1. Fetch raw config metadata
app.get("/api/db-config", (req, res) => {
  res.json({
    dbPath: SESSION_DB_PATH,
    status: fs.existsSync(SESSION_DB_PATH) ? "active" : "failed",
    apiKeyConfigured: !!process.env.DEEPSEEK_API_KEY
  });
});

// 2. Read database sessions list
app.get("/api/sessions", (req, res) => {
  const sessions = readSessionDb();
  res.json(sessions);
});

// 3. Save or update session
app.post("/api/sessions", (req, res) => {
  const newSessionList = req.body;
  if (Array.isArray(newSessionList)) {
    const success = writeSessionDb(newSessionList);
    if (success) {
      return res.json({ success: true, message: "Database saved successfully" });
    }
  }
  return res.status(400).json({ success: false, message: "Invalid session array payload" });
});

// 3b. Live telemetry — collect REAL machine state via PowerShell collector.
function collectTelemetry(): Promise<any> {
  return new Promise((resolve, reject) => {
    const script = path.join(process.cwd(), "telemetry", "collect.ps1");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err);
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          reject(new Error("Telemetry parse failure: " + (stdout || "").slice(0, 200)));
        }
      }
    );
  });
}

// Map raw telemetry into the WorkspaceState + timeline shape the UI/AI use.
// Redact secret-looking clipboard content. Keeps the "a secret is here" signal
// (so the AI can still warn you) WITHOUT persisting/transmitting the real value.
function redactSecret(s: string): { value: string; isSecret: boolean } {
  if (!s) return { value: "", isSecret: false };
  const looksSecret =
    /\b(sk-[A-Za-z0-9]{6,}|sk_[A-Za-z0-9]{6,}|xi-[A-Za-z0-9]{6,}|AKIA[0-9A-Z]{12,}|gh[pousr]_[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_\-]{20,}|eyJ[A-Za-z0-9_\-]{10,})\b/.test(s) ||
    /(secret|password|api[\s_-]?key|access[\s_-]?token|private[\s_-]?key|bearer)\b/i.test(s) ||
    /^\S{40,}$/.test(s.trim());
  if (looksSecret) {
    return { value: `${s.trim().slice(0, 4)}…[redacted secret]`, isSecret: true };
  }
  return { value: s, isSecret: false };
}

function shapeTelemetry(t: any) {
  const appLower = (t.activeApp || "").toLowerCase();
  const winType =
    appLower.includes("code") ? "vscode" :
    appLower.includes("powershell") || appLower.includes("cmd") || appLower.includes("windowsterminal") ? "terminal" :
    appLower.includes("chrome") || appLower.includes("firefox") || appLower.includes("edge") || appLower.includes("brave") ? "browser" :
    "repo";

  const clip = redactSecret(t.clipboard || "");

  const currentState = {
    virtualDesktop: t.virtualDesktop || "unknown",
    activeApp: t.activeApp || "unknown",
    windowTitle: t.windowTitle || "",
    workspacePath: t.workspacePath || "",
    gitRepo: t.gitRepo || "",
    gitBranch: t.gitBranch || "",
    latestCommit: t.latestCommit || "",
    modifiedFiles: Array.isArray(t.modifiedFiles) ? t.modifiedFiles : [],
    clipboardContent: clip.value,
    clipboardIsSecret: clip.isSecret,
    clipboardPasted: false,
    browserTitle: t.browserTitle && t.browserTitle !== "unknown" ? t.browserTitle : "",
    browserTabUrl: t.browserUrl && t.browserUrl !== "unknown" ? t.browserUrl : ""
  };

  const ts = t.collectedAt || new Date().toISOString();
  const timeline: any[] = [];
  timeline.push({
    id: "tele-active",
    timestamp: ts,
    type: winType,
    title: `Active: ${t.activeApp}`,
    details: `Foreground window: "${t.windowTitle}".`,
    important: false
  });
  if (t.gitBranch) {
    timeline.push({
      id: "tele-git",
      timestamp: ts,
      type: "repo",
      title: `Repo ${t.gitRepo} @ ${t.gitBranch}`,
      details: `${(t.modifiedFiles || []).length} modified file(s). Last commit: ${t.latestCommit || "n/a"}.`,
      important: (t.modifiedFiles || []).length > 0
    });
  }
  if (t.browserTitle && t.browserTitle !== "unknown") {
    const url = t.browserUrl && t.browserUrl !== "unknown" ? ` — ${t.browserUrl}` : "";
    timeline.push({
      id: "tele-browser",
      timestamp: ts,
      type: "browser",
      title: "Active browser tab",
      details: `${t.browserTitle}${url}`,
      important: false
    });
  }
  if (Array.isArray(t.recentCommands)) {
    t.recentCommands.slice(-5).forEach((cmd: string, i: number) => {
      timeline.push({
        id: `tele-cmd-${i}`,
        timestamp: ts,
        type: "terminal",
        title: "Terminal command",
        details: cmd,
        important: false
      });
    });
  }
  if (clip.value) {
    timeline.push({
      id: "tele-clip",
      timestamp: ts,
      type: "clipboard",
      title: clip.isSecret ? "Clipboard holds a SECRET (unpasted)" : "Clipboard contents",
      details: clip.isSecret
        ? `A secret/API key is sitting in the clipboard (value redacted): ${clip.value}`
        : `Currently holding: "${String(clip.value).slice(0, 120)}".`,
      important: clip.isSecret
    });
  }

  return { currentState, timeline, raw: t };
}

app.get("/api/telemetry/current", async (req, res) => {
  try {
    const raw = await collectTelemetry();
    const shaped = shapeTelemetry(raw);
    recordTelemetry(shaped); // persist into the rolling live-telemetry session
    if (raw.clipboard) clipHistory.record(String(raw.clipboard)); // local clipboard history
    res.json(shaped);
  } catch (error: any) {
    console.error("Telemetry collection failed:", error);
    res.status(500).json({ error: "Telemetry collection failed.", details: error?.message || String(error) });
  }
});

// Background poller: capture real telemetry on an interval so the live session
// accumulates a genuine timeline even when the UI isn't open. Off by default
// unless TELEMETRY_POLL_MS is set (e.g. 30000). Failures are swallowed.
function startTelemetryPoller() {
  const ms = parseInt(process.env.TELEMETRY_POLL_MS || "0", 10);
  if (!ms || ms < 5000) return;
  console.log(`Telemetry poller active: every ${ms}ms`);
  setInterval(async () => {
    try {
      const raw = await collectTelemetry();
      recordTelemetry(shapeTelemetry(raw));
      if (raw.clipboard) clipHistory.record(String(raw.clipboard));
    } catch (e) {
      // best-effort; ignore transient collection errors
    }
  }, ms);
}

// 4. Summarize workspace memory timeline via the active AI provider (OpenAI/DeepSeek).
app.post("/api/ai/summarize", async (req, res) => {
  const { currentState, timelineLog, customResumeTask } = req.body;

  if (!activeProvider()) {
    return res.status(503).json({
      error: "No AI provider configured. Add OPENAI_API_KEY or DEEPSEEK_API_KEY to the server .env."
    });
  }

  try {
    const activeApp = currentState?.activeApp || "unknown";
    const gitRepo = currentState?.gitRepo || "(none)";
    const gitBranch = currentState?.gitBranch || "(none)";
    const lastFile = currentState?.windowTitle || "(none)";
    const currentDesktop = currentState?.virtualDesktop || "unknown";
    const clipboard = currentState?.clipboardContent || "None";
    const modifiedCount = currentState?.modifiedFiles?.length || 0;

    const timelineStr = Array.isArray(timelineLog)
      ? timelineLog.map((ev: any) => `[${ev.timestamp}] (${ev.type}) ${ev.title}: ${ev.details}`).join("\n")
      : "No events recorded.";

    const systemPrompt = `You are the AI engine of "Veridian Workspace Memory" — a personalized second brain for ADHD/Autistic developers working across multiple desktops, terminals, and AI agents (like Claude Code/Cline).
The developer frequently context-switches, loses track of "Where was I?", and needs an instantly readable, high-contrast, non-verbal-overload BRIEF.

The input is REAL captured machine telemetry. Do NOT invent details that are not present in the data. If a field is unknown, say so or omit it.

Synthesize a direct, concise "Where was I?" overview as strict JSON matching this schema:
{
  "currentProject": "Short clean project name inferred from the repo/folder/window",
  "focus": "One precise sentence describing the active task",
  "completed": ["Recently completed item"],
  "pending": ["Urgent next step"],
  "risks": ["Concrete risk, e.g. uncommitted changes, secret left in clipboard"]
}

Rules:
- Ground every item in the provided telemetry. No fiction.
- Limit each array to 2-3 prioritized items (lockscreen/small-card friendly).
- If modified file count is high, remind them to commit.
- If a secret/API key sits unpasted in the clipboard, flag it in risks.`;

    const userPrompt = `
Live Captured State:
- Desktop: ${currentDesktop}
- App: ${activeApp} (Window: "${lastFile}")
- Git Repo: ${gitRepo} (Branch: "${gitBranch}")
- Modified file count: ${modifiedCount}
- Clipboard (unpasted): "${clipboard}"
- Additional context requested: ${customResumeTask || "None"}

Recorded Timeline History:
${timelineStr}
`;

    const parsedData = await chatJSON({ system: systemPrompt, user: userPrompt, json: true, temperature: 0.3, maxTokens: 1024 });

    // Retain context per desktop: save a brief keyed by desktop number so that
    // switching back to that desktop later resurfaces where you left off.
    try {
      const m = String(currentDesktop).match(/Desktop\s+(\d+)/i);
      if (m) {
        saveBrief(`Desktop ${m[1]}`, {
          wasDoing: parsedData?.focus || "",
          nextStep: (Array.isArray(parsedData?.pending) && parsedData.pending[0]) || "",
          raw: { label: currentDesktop }
        });
      }
    } catch { /* non-fatal */ }

    res.json(parsedData);
  } catch (error: any) {
    console.error("AI context summary failure:", error);
    res.status(500).json({
      error: "Failed to generate AI context summary.",
      rawError: error?.message || String(error)
    });
  }
});

// 4b. Click-to-switch virtual desktop (native Win+Ctrl+Arrow keystrokes).
//     On success, returns the brief retained for the desktop you land on.
app.post("/api/desktop/switch", (req, res) => {
  const target = parseInt(String(req.body?.target), 10);
  if (!target || target < 1) {
    return res.status(400).json({ error: "Provide a 1-based 'target' desktop number." });
  }
  const script = path.join(process.cwd(), "telemetry", "desktop-switch.ps1");
  execFile(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Target", String(target)],
    { timeout: 15000, windowsHide: true },
    (err, stdout) => {
      if (err) {
        return res.status(500).json({ error: "Desktop switch failed.", details: err.message });
      }
      let result: any = {};
      try { result = JSON.parse((stdout || "").trim()); } catch { result = { raw: stdout }; }
      const brief = getBrief(`Desktop ${target}`) || allBriefs()[`Desktop ${target}`] || null;
      res.json({ ...result, brief });
    }
  );
});

// 4c. Per-desktop context briefs (retain "where I was" per desktop).
app.get("/api/desktop/briefs", (req, res) => {
  res.json(allBriefs());
});
app.post("/api/desktop/brief", (req, res) => {
  const { desktop, wasDoing, nextStep, raw } = req.body || {};
  if (!desktop) return res.status(400).json({ error: "desktop label required" });
  saveBrief(desktop, { wasDoing, nextStep, raw });
  res.json({ ok: true, brief: getBrief(desktop) });
});

// 4c-ii. Per-desktop info for hover tooltips: project, what you were doing,
//        next step, and (once a session exists) the Claude session id.
app.get("/api/desktop/info", (req, res) => {
  const n = parseInt(String(req.query.n), 10);
  const label = `Desktop ${n}`;
  const brief = getBrief(label);
  const project = readProjects().find((p) => p.desktop === n);
  const session = listSessions().find((s) => s.desktop === n);
  res.json({
    desktop: n,
    project: project?.name || (brief?.raw?.label) || null,
    projectPath: project?.path || null,
    goal: project?.goal || null,
    mode: project?.mode || null,
    wasDoing: brief?.wasDoing || null,
    nextStep: brief?.nextStep || null,
    updatedAt: brief?.updatedAt || null,
    sessionId: session?.sessionId || null,
    sessionSummary: session?.lastSummary || null
  });
});

// 4d. "Waiting on you" — agents/terminals/logs that finished and need input.
app.get("/api/waiting", async (req, res) => {
  try {
    res.json(await getWaitingItems());
  } catch (e: any) {
    res.status(500).json({ error: "Waiting scan failed.", details: e?.message || String(e) });
  }
});

// 4e. Autopilot: propose the next step. Auto-run ONLY safe+reversible actions at
//     >=95% confidence once the action type is "trusted" (learned). Everything
//     else is returned as a suggestion requiring your explicit approval.
const SAFE_AUTO_TYPES = new Set(["switch-desktop", "none", "refresh-brief"]);

app.post("/api/autopilot/next", async (req, res) => {
  if (!activeProvider()) {
    return res.status(503).json({ error: "No AI provider configured." });
  }
  const { currentState, timeline, waiting } = req.body || {};
  try {
    const system = `You are the AUTOPILOT for a burnt-out developer's workspace assistant. Given REAL telemetry, decide the single highest-leverage next step and whether it is safe to perform automatically.

Return strict JSON:
{
  "summary": "one line on the current situation",
  "nextStep": "the single concrete next action, imperative",
  "actionType": "switch-desktop | refresh-brief | draft-text | run-check | open-waiting | manual | none",
  "params": { "target": <desktop number if switch-desktop>, "text": "<draft if draft-text>" },
  "confidence": 0.0-1.0,
  "safety": "safe | confirm",
  "why": "brief reason"
}

Safety rules you MUST follow:
- "safe" ONLY for purely local, reversible, non-destructive actions (switching desktop, refreshing a brief, doing nothing).
- ANYTHING that sends, posts, deletes, authenticates, pays, edits files, or is irreversible/outward-facing => "confirm".
- "draft-text" only PREPARES text, never sends => may be "safe" but the app will still show it for review.
- If unsure, choose "confirm" and lower confidence.`;

    const user = `Telemetry:\n${JSON.stringify(currentState || {}, null, 2)}\n\nRecent timeline:\n${JSON.stringify((timeline || []).slice(-12), null, 2)}\n\nWaiting-on-you items:\n${JSON.stringify((waiting || []).slice(0, 8), null, 2)}`;

    const proposal = await chatJSON({ system, user, json: true, temperature: 0.2, maxTokens: 600 });

    const actionType = String(proposal?.actionType || "manual");
    const confidence = Number(proposal?.confidence) || 0;
    const safety = proposal?.safety === "safe" ? "safe" : "confirm";
    const learning = autonomyFor(actionType);

    // Auto-run gate: must be a whitelisted safe type, classified safe, >=95%
    // confident, AND already trusted through repeated approvals.
    const autoRun = SAFE_AUTO_TYPES.has(actionType)
      && safety === "safe"
      && confidence >= 0.95
      && learning.trusted;

    res.json({ ...proposal, actionType, confidence, safety, learning, autoRun });
  } catch (e: any) {
    console.error("Autopilot failure:", e);
    res.status(500).json({ error: "Autopilot failed.", details: e?.message || String(e) });
  }
});

// 4f. Record approve/reject so the autopilot earns autonomy over time.
app.post("/api/autopilot/feedback", (req, res) => {
  const { actionKey, approved } = req.body || {};
  if (!actionKey) return res.status(400).json({ error: "actionKey required" });
  recordFeedback(String(actionKey), !!approved);
  res.json({ ok: true, autonomy: autonomyFor(String(actionKey)) });
});

// 4g. Autopilot FLEET — one headless Opus (Claude Code / Max) session per
//     desktop's project. Assesses + advances each project; logs progress.
app.get("/api/fleet/projects", (req, res) => res.json(readProjects()));
app.post("/api/fleet/projects", (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: "expected an array of projects" });
  writeProjects(req.body);
  res.json({ ok: true, projects: readProjects() });
});
app.get("/api/fleet/status", (req, res) => res.json(fleetStatus()));
app.post("/api/fleet/run", (req, res) => {
  const mode = String(req.body?.mode || "assess");
  const desktop = req.body?.desktop ? parseInt(String(req.body.desktop), 10) : undefined;
  const result = startFleetRun(mode, desktop);
  res.status(result.started ? 202 : 409).json(result);
});

// 4h. Persistent per-desktop Claude sessions (independent, --resume).
app.get("/api/sessions/list", (req, res) => res.json(listSessions()));
app.post("/api/sessions/run", async (req, res) => {
  const { desktop, project, cwd, event, mode } = req.body || {};
  if (!desktop || !event) return res.status(400).json({ error: "desktop and event required" });
  res.json(await runDesktopSession({ desktop: parseInt(String(desktop), 10), project, cwd, event: String(event), mode }));
});

// 4i. Copybook — notes / files / snippets.
app.get("/api/notebook", (req, res) => res.json(notebook.listEntries()));
app.post("/api/notebook", (req, res) => {
  const { type, title, content, project } = req.body || {};
  res.json(notebook.addEntry({ type: type || "note", title: title || "", content: content || "", project }));
});
app.post("/api/notebook/file", (req, res) => {
  const { name, base64, project } = req.body || {};
  if (!name || !base64) return res.status(400).json({ error: "name and base64 required" });
  res.json(notebook.saveFile(String(name), String(base64), project));
});
app.delete("/api/notebook/:id", (req, res) => { notebook.deleteEntry(req.params.id); res.json({ ok: true }); });
app.get("/api/notebook/file/:id", (req, res) => {
  const entry = notebook.listEntries().find((e: any) => e.id === req.params.id);
  if (!entry || entry.type !== "file") return res.status(404).json({ error: "not found" });
  res.sendFile(path.join(process.cwd(), entry.content));
});

// 4j. Clipboard history (last 50, click-to-restore). Local only.
app.get("/api/clipboard/history", (req, res) => res.json(clipHistory.list()));
app.post("/api/clipboard/restore", async (req, res) => {
  const ok = await clipHistory.restore(String(req.body?.id));
  res.json({ ok });
});
app.post("/api/clipboard/clear", (req, res) => { clipHistory.clear(); res.json({ ok: true }); });

// 4k. Per-project git stats.
app.get("/api/gitstats", async (req, res) => res.json(await getGitStats(String(req.query.path || ""))));

// 4l. PDR — idea -> structured product spec (via the active AI provider).
app.post("/api/pdr/generate", async (req, res) => {
  try {
    res.json(await generatePdr(String(req.body?.idea || "")));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) });
  }
});
app.get("/api/pdr", (req, res) => res.json(listPdrs()));
app.get("/api/pdr/:id", (req, res) => {
  const p = getPdr(req.params.id);
  return p ? res.json(p) : res.status(404).json({ error: "not found" });
});

// 4m. Prompt inventory.
app.get("/api/prompts", (req, res) => res.json(prompts.listPrompts()));
app.post("/api/prompts", (req, res) => {
  const { title, body, tags } = req.body || {};
  res.json(prompts.addPrompt({ title: title || "", body: body || "", tags: tags || [] }));
});
app.delete("/api/prompts/:id", (req, res) => { prompts.deletePrompt(req.params.id); res.json({ ok: true }); });

// 4n. Backup / restore to the Hetzner volume (over SSH).
app.post("/api/backup", async (req, res) => res.json(await backupFolder(String(req.body?.path || ""))));
app.get("/api/backups", async (req, res) => res.json(await listBackups()));
app.post("/api/restore", async (req, res) => res.json(await restoreFolder(String(req.body?.name || ""), String(req.body?.dest || ""))));

// 4n-ii. Central command — multi-machine sync.
app.post("/api/sync/push", (req, res) => { recordMachine(req.body || {}); res.json({ ok: true }); });
app.get("/api/sync/machines", (req, res) => res.json(listMachines()));
app.get("/api/sync/machine/:id", (req, res) => {
  const m = getMachine(req.params.id);
  return m ? res.json(m) : res.status(404).json({ error: "not found" });
});

// 4n-iii. Scratch / typing-recovery buffer (local).
app.get("/api/scratch", (req, res) => res.json(getScratch()));
app.post("/api/scratch", (req, res) => res.json(saveScratch(String(req.body?.text ?? ""))));

// 4n-iv. Lightweight machine stats for the HUD (RAM + uptime, cross-platform).
app.get("/api/stats", (req, res) => {
  const total = os.totalmem(), free = os.freemem();
  res.json({
    ramTotalGB: +(total / 1073741824).toFixed(1),
    ramUsedGB: +((total - free) / 1073741824).toFixed(1),
    ramPct: Math.round(((total - free) / total) * 100),
    cpus: os.cpus().length,
    loadavg: os.loadavg()[0] || 0,
    uptimeHrs: +(os.uptime() / 3600).toFixed(1),
    hostname: os.hostname(),
    platform: os.platform()
  });
});

// 4o. Launch a safe, whitelisted local tool (for the command palette).
app.post("/api/launch", (req, res) => {
  const what = String(req.body?.what || "");
  const cwd = process.env.VERIDIAN_WATCH_DIR || process.cwd();
  const map: Record<string, { cmd: string; args: string[] }> = {
    vscode: { cmd: "code", args: [cwd] },
    terminal: { cmd: "wt", args: ["-d", cwd] },
    repo: { cmd: "cmd", args: ["/c", "start", "", "https://github.com/mmasoomi-glitch/Veridian-Coding-assitant-"] }
  };
  const entry = map[what];
  if (!entry) return res.status(400).json({ error: "unknown target" });
  try {
    execFile(entry.cmd, entry.args, { shell: true, windowsHide: true }, () => {});
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// 5. ElevenLabs Text-to-Speech v3 BYOK Proxy
app.post("/api/elevenlabs/tts", async (req, res) => {
  const { text, apiKey, voiceId, modelId } = req.body;

  // Prioritize request body custom key, then server env key
  const finalApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
  const finalVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM"; // default: Rachel
  const finalModelId = modelId || "eleven_monolingual_v1";

  if (!finalApiKey) {
    return res.status(400).json({
      error: "ElevenLabs API key is missing. Please configuration your BYOK inside the Mobile Companion setting or verify your server configuration."
    });
  }

  try {
    const fetchResponse = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${finalVoiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": finalApiKey
      },
      body: JSON.stringify({
        text,
        model_id: finalModelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      return res.status(fetchResponse.status).json({
        error: `ElevenLabs API answered with error status: ${fetchResponse.status}`,
        details: errorText
      });
    }

    // Set headers to stream binary audio directly back to the client browser
    res.setHeader("Content-Type", "audio/mpeg");
    const arrayBuffer = await fetchResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("ElevenLabs proxy failed:", error);
    res.status(500).json({
      error: "Server ElevenLabs proxy failed to generate audio.",
      details: error?.message || String(error)
    });
  }
});

// --- EXPOSE VITE OR STATIC FILES ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html for all client routes (React SPA)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Veridian Server listening at http://localhost:${PORT}`);
    console.log(`Database store allocated at: ${SESSION_DB_PATH}`);
    startTelemetryPoller();
    // Push this machine's state to the central command server (if CENTRAL_URL set).
    startSyncClient(async () => {
      const shaped = shapeTelemetry(await collectTelemetry());
      return { currentState: shaped.currentState, sessions: listSessions(), waiting: await getWaitingItems() };
    });
  });
}

startServer();
