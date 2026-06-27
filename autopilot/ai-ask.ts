// Context-aware "AI Ask" — answers natural-language questions about the owner's
// own work using ONLY their local Veridian data: clipboard history, work-session
// timelines, per-desktop session summaries, notes, desktop briefs, and (if
// present) screenshot OCR/notes. Nothing here invents facts; the model is told to
// say so when the answer isn't in the gathered context.
//
// All file I/O is defensive (every source optional, wrapped in try/catch). The
// only thing that throws is a missing AI provider — ask() surfaces a clear error
// so the UI can tell the owner to configure one.
//
// Conversation memory: each Q&A is appended to ask-history.json (cap 50, newest
// first), readable via askHistory().

import fs from "fs";
import path from "path";
import { chatJSON } from "../ai/providers";
import { sanitizeContextForLLM } from "../ai/context-sanitizer";
import { writeJsonAtomic } from "../lib/atomic";

const HISTORY_FILE = path.join(process.cwd(), "ask-history.json");
const MAX_HISTORY = 50;
const CONTEXT_CHAR_CAP = 6000;

export interface AskEntry {
  q: string;
  a: string;
  ts: string;
}

// --- defensive readers ----------------------------------------------------

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8"));
  } catch {
    return null;
  }
}

function asArray(v: any): any[] {
  return Array.isArray(v) ? v : [];
}

function str(v: any): string {
  return v == null ? "" : String(v);
}

// Each builder returns a list of newest-first one-line snippets, or [] if the
// source is missing/empty. The label is used both as a section header and as the
// usedContext tag returned to the caller.
interface Source {
  label: string;
  lines: string[];
}

function clipSource(): Source {
  const raw = asArray(readJson("clip-history.json"));
  const lines = raw
    .map((c) => str(c?.preview))
    .filter((s) => s.trim().length > 0)
    .slice(0, 30);
  return { label: "clipboard", lines };
}

function workspaceSource(): Source {
  // workspace-sessions.json is an array of sessions; the rolling one is
  // "live-telemetry" with a timeline of events. Flatten timelines, newest first.
  const sessions = asArray(readJson("workspace-sessions.json"));
  const events: { ts: string; text: string }[] = [];
  for (const s of sessions) {
    for (const ev of asArray(s?.timeline)) {
      const title = str(ev?.title);
      const details = str(ev?.details);
      const text = [title, details].filter(Boolean).join(" — ");
      if (text.trim()) events.push({ ts: str(ev?.timestamp), text });
    }
    for (const t of asArray(s?.pendingTasks)) {
      if (str(t).trim()) events.push({ ts: str(s?.lastTimestamp), text: `pending: ${str(t)}` });
    }
  }
  events.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { label: "work-sessions", lines: events.slice(0, 40).map((e) => e.text) };
}

function sessionsSource(): Source {
  // sessions.json — per-desktop Claude session summaries.
  const sessions = asArray(readJson("sessions.json"));
  const withTs = sessions
    .map((s) => ({
      ts: str(s?.lastTs),
      text: `Desktop ${str(s?.desktop)}${s?.project ? ` (${str(s.project)})` : ""}: ${str(s?.lastSummary)}`
    }))
    .filter((s) => s.text.trim().length > 0 && str(s.text).length > 12);
  withTs.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { label: "desktop-sessions", lines: withTs.slice(0, 12).map((s) => s.text) };
}

function notebookSource(): Source {
  const notes = asArray(readJson("notebook.json"));
  const withTs = notes
    .map((n) => ({
      ts: str(n?.ts),
      text: `${str(n?.title) || "note"}: ${str(n?.content)}`.replace(/\s+/g, " ").trim()
    }))
    .filter((n) => n.text.length > 2);
  withTs.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { label: "notes", lines: withTs.slice(0, 25).map((n) => n.text) };
}

function briefsSource(): Source {
  // desktop-briefs.json is a map keyed by desktop label.
  const map = readJson("desktop-briefs.json");
  const lines: { ts: string; text: string }[] = [];
  if (map && typeof map === "object") {
    for (const key of Object.keys(map)) {
      const b = map[key];
      const parts: string[] = [];
      if (str(b?.wasDoing)) parts.push(`was doing: ${str(b.wasDoing)}`);
      if (str(b?.nextStep)) parts.push(`next: ${str(b.nextStep)}`);
      if (parts.length) lines.push({ ts: str(b?.updatedAt), text: `${str(b?.desktop) || key} — ${parts.join("; ")}` });
    }
  }
  lines.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { label: "desktop-briefs", lines: lines.map((l) => l.text) };
}

function screenshotsSource(): Source {
  // screenshots-index.json is optional. Best-effort across a few likely shapes:
  // either an array of entries, or { items: [...] }. Each entry may carry OCR
  // text under ocr/text/notes/caption, plus a timestamp.
  const raw = readJson("screenshots-index.json");
  if (!raw) return { label: "screenshots", lines: [] };
  const items = Array.isArray(raw) ? raw : asArray(raw?.items || raw?.screenshots);
  const withTs = items
    .map((it) => {
      const text = [it?.ocr, it?.text, it?.notes, it?.caption, it?.title]
        .map(str)
        .filter((s) => s.trim().length > 0)
        .join(" — ")
        .replace(/\s+/g, " ")
        .trim();
      return { ts: str(it?.ts || it?.timestamp || it?.capturedAt), text };
    })
    .filter((s) => s.text.length > 2);
  withTs.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return { label: "screenshots", lines: withTs.slice(0, 20).map((s) => s.text) };
}

// Assemble a compact, newest-first context string capped at ~6000 chars, and
// report which sources actually contributed data.
function gatherContext(): { context: string; usedContext: string[] } {
  const sources: Source[] = [
    clipSource(),
    workspaceSource(),
    sessionsSource(),
    notebookSource(),
    briefsSource(),
    screenshotsSource()
  ];

  const usedContext: string[] = [];
  let context = "";
  for (const src of sources) {
    if (!src.lines.length) continue;
    usedContext.push(src.label);
    let block = `## ${src.label}\n`;
    for (const line of src.lines) {
      const candidate = block + "- " + line + "\n";
      // Stop adding to this block if we'd blow the global cap.
      if (context.length + candidate.length > CONTEXT_CHAR_CAP) break;
      block = candidate;
    }
    if (context.length + block.length > CONTEXT_CHAR_CAP) {
      // No room for even the header+first line of this source; stop entirely.
      context += block.slice(0, Math.max(0, CONTEXT_CHAR_CAP - context.length));
      break;
    }
    context += block + "\n";
  }
  return { context: context.trim(), usedContext };
}

// --- history --------------------------------------------------------------

export function askHistory(): AskEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
    if (!Array.isArray(raw)) return [];
    return raw
      .map((e: any) => ({ q: str(e?.q), a: str(e?.a), ts: str(e?.ts) }))
      .filter((e: AskEntry) => e.q || e.a);
  } catch {
    return [];
  }
}

function appendHistory(entry: AskEntry): void {
  try {
    const next = [entry, ...askHistory()].slice(0, MAX_HISTORY);
    writeJsonAtomic(HISTORY_FILE, next);
  } catch (e) {
    console.error("ask-history write failed:", e);
  }
}

// --- ask ------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are Veridian's assistant. Answer the user's question using ONLY the provided " +
  "context from their clipboard history, work sessions, notes, and screenshots. If the " +
  "answer isn't in the context, say what you do know and that it may be incomplete. Be " +
  "concise and concrete.";

export async function ask(question: string): Promise<{ answer: string; usedContext: string[] }> {
  const q = str(question).trim();
  if (!q) throw new Error("Question is empty.");

  const { context, usedContext } = gatherContext();

  // F-012: scrub secrets/tokens/private paths out of the context before it ever
  // leaves the device. Raw clipboard/command/URL/key material must not reach the LLM.
  const { sanitized, redactedCount } = sanitizeContextForLLM(context);
  if (redactedCount > 0) {
    console.log(`[ai-ask] sanitized context: redacted ${redactedCount} secret-like span(s) before LLM send`);
  }

  let answer: string;
  try {
    const result = await chatJSON({
      system: SYSTEM_PROMPT,
      user: "CONTEXT:\n" + (sanitized || "(no local context available)") + "\n\nQUESTION: " + q,
      json: false
    });
    answer = str(result).trim();
  } catch (e: any) {
    // No provider configured (or the provider call failed) — surface clearly.
    throw new Error(`AI Ask failed: ${e?.message || e}`);
  }

  appendHistory({ q, a: answer, ts: new Date().toISOString() });
  return { answer, usedContext };
}
