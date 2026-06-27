// Sync payload sanitizer (security gate F-004 — local-agent vs cloud-dashboard split).
//
// The central command server (e.g. pr.afaq24.store) is a READ-ONLY aggregator and
// must only ever see safe, non-sensitive aggregation data. Raw clipboard, window
// titles, absolute file paths, shell command history, and browser URLs are
// collected LOCALLY and must NEVER leave the machine.
//
// This is enforced with an ALLOWLIST (we build brand-new objects containing only
// the fields we explicitly permit), so adding a new sensitive telemetry field can
// never silently start syncing. Applied on BOTH sides:
//   - outbound (sync-client): scrub before the push leaves the machine.
//   - inbound (sync-store): scrub again on receipt (defense in depth) so a stale or
//     misconfigured local agent can't write sensitive data into the central store.
//
// Pure functions; no I/O, no deps.

// Fields on currentState that are SAFE to aggregate centrally.
const SAFE_STATE_FIELDS = [
  "virtualDesktop",
  "activeApp",
  "gitRepo",
  "gitBranch",
  "latestCommit",
  "browserTitle",        // tab title only — NOT the URL
  "clipboardIsSecret"    // boolean flag only — NOT the value
] as const;

// Fields that must NEVER be synced (documented here for auditability).
export const FORBIDDEN_STATE_FIELDS = [
  "windowTitle",
  "workspacePath",
  "modifiedFiles",
  "clipboardContent",
  "clipboardPasted",
  "browserTabUrl",
  "recentCommands"
] as const;

function safeState(cs: any): any {
  const out: any = {};
  if (cs && typeof cs === "object") {
    for (const f of SAFE_STATE_FIELDS) {
      if (cs[f] !== undefined) out[f] = cs[f];
    }
    // Replace the raw modifiedFiles list (paths) with a harmless count.
    if (Array.isArray(cs.modifiedFiles)) out.modifiedCount = cs.modifiedFiles.length;
  }
  return out;
}

function safeSession(s: any): any {
  if (!s || typeof s !== "object") return {};
  // Keep high-level, non-sensitive session fields; drop clipboardContent and
  // reduce the timeline to type/title/timestamp (no `details`, which can carry
  // commands, paths, or clipboard text).
  const timeline = Array.isArray(s.timeline)
    ? s.timeline.map((e: any) => ({
        timestamp: e?.timestamp ?? "",
        type: e?.type ?? "",
        title: e?.title ?? ""
      }))
    : [];
  return {
    id: s.id,
    desktop: s.desktop,
    project: s.project,
    lastTimestamp: s.lastTimestamp ?? s.lastTs ?? "",
    lastSummary: s.lastSummary,
    pendingTasks: Array.isArray(s.pendingTasks) ? s.pendingTasks.map((t: any) => String(t)) : [],
    timeline
  };
}

function safeWaiting(w: any): any {
  if (!w || typeof w !== "object") return {};
  // Keep the "what is waiting" signal (title/type/age); drop free-text details/raw
  // which can contain log snippets, paths, or secrets.
  return {
    id: w.id,
    type: w.type,
    title: w.title,
    since: w.since ?? w.ts ?? ""
  };
}

export interface SyncSnapshot {
  currentState?: any;
  sessions?: any[];
  waiting?: any[];
}

/** Build a cloud-safe copy of a snapshot: only allowlisted, non-sensitive fields. */
export function sanitizeOutboundSnapshot<T extends SyncSnapshot>(snap: T): SyncSnapshot {
  return {
    currentState: safeState(snap?.currentState),
    sessions: Array.isArray(snap?.sessions) ? snap.sessions.map(safeSession) : [],
    waiting: Array.isArray(snap?.waiting) ? snap.waiting.map(safeWaiting) : []
  };
}

/**
 * Inbound guard for the central server: returns true if a payload contains any
 * forbidden sensitive field (so the caller can log/scrub). Used alongside the
 * allowlist re-sanitize as belt-and-suspenders.
 */
export function payloadHasForbiddenFields(payload: SyncSnapshot): boolean {
  const cs = payload?.currentState;
  if (cs && typeof cs === "object") {
    for (const f of FORBIDDEN_STATE_FIELDS) {
      if (cs[f] !== undefined && cs[f] !== "" && !(Array.isArray(cs[f]) && cs[f].length === 0)) {
        return true;
      }
    }
  }
  if (Array.isArray(payload?.sessions)) {
    if (payload.sessions.some((s) => s && s.clipboardContent)) return true;
  }
  if (Array.isArray(payload?.waiting)) {
    if (payload.waiting.some((w) => w && (w.details || w.raw))) return true;
  }
  return false;
}
