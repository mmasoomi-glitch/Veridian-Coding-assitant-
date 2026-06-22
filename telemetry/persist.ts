import fs from "fs";
import path from "path";

// --- Data shapes (compatible with src/types.ts, server-side plain objects) ---

export interface TimelineEvent {
  id: string;
  timestamp: string;
  type:
    | "desktop"
    | "repo"
    | "terminal"
    | "vscode"
    | "browser"
    | "clipboard"
    | "clutch";
  title: string;
  details: string;
  important: boolean;
}

export interface SessionHistory {
  sessionId: string;
  folderPath: string;
  claudeSessionId: string;
  activeTurn: "human" | "agent";
  lastTimestamp: string;
  clipboardContent: string;
  completedTasks: string[];
  pendingTasks: string[];
  timeline: TimelineEvent[];
}

const STORE_PATH = path.join(process.cwd(), "workspace-sessions.json");
const LIVE_SESSION_ID = "live-telemetry";
const MAX_TIMELINE = 60;
const MAX_PENDING = 4;
const SECRET_RE = /key|secret|token|password|api/i;

function readStore(): SessionHistory[] {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SessionHistory[]) : [];
  } catch {
    return [];
  }
}

function writeStore(sessions: SessionHistory[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(sessions, null, 2), "utf-8");
}

function makeLiveSession(): SessionHistory {
  return {
    sessionId: LIVE_SESSION_ID,
    folderPath: "",
    claudeSessionId: "",
    activeTurn: "human",
    lastTimestamp: new Date().toISOString(),
    clipboardContent: "",
    completedTasks: [],
    pendingTasks: [],
    timeline: [],
  };
}

/**
 * Records a shaped telemetry snapshot into a single rolling "live-telemetry"
 * session in workspace-sessions.json. Never throws.
 */
export function recordTelemetry(shaped: {
  currentState: any;
  timeline: any[];
  raw: any;
}): void {
  try {
    const currentState = shaped?.currentState ?? {};
    const raw = shaped?.raw ?? {};
    const incoming = Array.isArray(shaped?.timeline) ? shaped.timeline : [];

    const sessions = readStore();

    let session = sessions.find((s) => s && s.sessionId === LIVE_SESSION_ID);
    if (!session) {
      session = makeLiveSession();
      sessions.push(session);
    }

    // 3. Update fields from currentState / raw.
    session.folderPath = currentState.workspacePath || "";
    session.clipboardContent = currentState.clipboardContent || "";
    session.lastTimestamp = raw.collectedAt || new Date().toISOString();
    session.activeTurn = "human";
    session.claudeSessionId = "";

    if (!Array.isArray(session.timeline)) session.timeline = [];
    if (!Array.isArray(session.completedTasks)) session.completedTasks = [];
    if (!Array.isArray(session.pendingTasks)) session.pendingTasks = [];

    // 4. Merge incoming timeline events with dedupe + unique ids + cap.
    incoming.forEach((ev: any, index: number) => {
      if (!ev || typeof ev !== "object") return;
      const type = ev.type;
      const details = ev.details ?? "";

      // Find last stored event of this same type.
      let lastOfType: TimelineEvent | undefined;
      for (let i = session!.timeline.length - 1; i >= 0; i--) {
        if (session!.timeline[i].type === type) {
          lastOfType = session!.timeline[i];
          break;
        }
      }

      // Dedupe: skip if it matches the last event of the same type exactly.
      if (lastOfType && lastOfType.details === details) return;

      session!.timeline.push({
        id: `${type}-${Date.now()}-${index}`,
        timestamp: ev.timestamp || new Date().toISOString(),
        type,
        title: ev.title ?? "",
        details,
        important: Boolean(ev.important),
      });
    });

    // Cap timeline at most recent MAX_TIMELINE events.
    if (session.timeline.length > MAX_TIMELINE) {
      session.timeline = session.timeline.slice(-MAX_TIMELINE);
    }

    // 5. Derive lightweight pending task hints (best-effort).
    const pending: string[] = [];
    const modified = Array.isArray(currentState.modifiedFiles)
      ? currentState.modifiedFiles
      : [];
    if (modified.length > 0) {
      const repo = raw.gitRepo || currentState.gitRepo || "workspace";
      pending.push(
        `Commit ${modified.length} modified file(s) in ${repo}`
      );
    }
    const clip = currentState.clipboardContent || "";
    if (clip && SECRET_RE.test(clip)) {
      pending.push("Clear/rotate the secret currently sitting in clipboard");
    }

    // Dedupe and cap pending tasks.
    session.pendingTasks = Array.from(new Set(pending)).slice(0, MAX_PENDING);
    // completedTasks: preserved as-is (already normalized to an array above).

    // 6. Write back.
    writeStore(sessions);
  } catch (err) {
    console.error("recordTelemetry failed:", err);
  }
}

/** Returns the "live-telemetry" session or null. */
export function readLiveSession(): any | null {
  try {
    const sessions = readStore();
    return sessions.find((s) => s && s.sessionId === LIVE_SESSION_ID) || null;
  } catch (err) {
    console.error("readLiveSession failed:", err);
    return null;
  }
}
