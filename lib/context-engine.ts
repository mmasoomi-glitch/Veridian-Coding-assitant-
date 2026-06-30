export interface CSLike {
  virtualDesktop?: string;
  activeApp?: string;
  windowTitle?: string;
  workspacePath?: string;
  gitRepo?: string;
  gitBranch?: string;
  latestCommit?: string;
  modifiedFiles?: string[];
  clipboardIsSecret?: boolean;
  browserTitle?: string;
}

export interface TimelineEvt {
  id?: string;
  timestamp?: string;
  type?: string;
  title?: string;
  details?: string;
}

export interface BriefLike {
  desktop?: string;
  updatedAt?: string;
  wasDoing?: string;
  nextStep?: string;
}

export interface WaitingLike {
  source?: string;
  title?: string;
  detail?: string;
  ageSec?: number;
  status?: string;
  path?: string;
}

export interface RepoLike {
  name?: string;
  branch?: string;
  ahead?: number;
  behind?: number;
  dirty?: number;
  untracked?: number;
  unpushed?: number;
  risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastCommit?: string;
}

export interface ContextSnapshot {
  timestamp: string;
  project: string;
  activity: string;
  modifiedCount: number;
  latestCommit: string;
  clipboardSecret: boolean;
  brief: { wasDoing: string; nextStep: string; updatedAt: string } | null;
  topRisk: { name: string; branch: string; risk: string } | null;
  waiting: { title: string; detail: string; status: string; ageSec: number }[];
  recentEvents: { type: string; title: string; timestamp: string }[];
  unknowns: string[];
}

/**
 * Pure function that builds a context snapshot from provided data.
 * All input values are optional / may be null. The function never throws.
 */
export function buildContextSnapshot(input: {
  currentState?: CSLike | null;
  timeline?: TimelineEvt[];
  brief?: BriefLike | null;
  waiting?: WaitingLike[];
  repos?: RepoLike[];
  now?: string;
}): ContextSnapshot {
  const now = input.now ?? new Date().toISOString();

  // ----- currentState safe access -----
  const cs = input.currentState ?? {};

  const virtualDesktop = cs.virtualDesktop;
  const activeApp = cs.activeApp;
  const windowTitle = cs.windowTitle;
  const gitRepo = cs.gitRepo;
  const gitBranch = cs.gitBranch;
  const latestCommitFromState = cs.latestCommit;
  const modifiedFiles = cs.modifiedFiles;
  const clipboardIsSecret = cs.clipboardIsSecret;

  // Project: basename of gitRepo + "@" + branch
  let project: string;
  if (!gitRepo) {
    project = "unknown project";
  } else {
    // Strip any path separators and take the last segment
    const parts = gitRepo.split(/[\\/]/);
    const base = parts[parts.length - 1] || gitRepo;
    const branchPart = gitBranch ? "@" + gitBranch : "";
    project = base + branchPart;
  }

  // Activity: activeApp + " — " + windowTitle
  let activity: string;
  if (!activeApp) {
    activity = "unknown";
  } else {
    activity = windowTitle ? `${activeApp} — ${windowTitle}` : activeApp;
  }

  // Modified count
  const modifiedCount = Array.isArray(modifiedFiles) ? modifiedFiles.length : 0;

  // Latest commit
  const latestCommit = latestCommitFromState || "none";

  // Clipboard secret
  const clipboardSecret = !!clipboardIsSecret;

  // Brief mapping
  const brief = input.brief
    ? {
        wasDoing: input.brief.wasDoing || "",
        nextStep: input.brief.nextStep || "",
        updatedAt: input.brief.updatedAt || "",
      }
    : null;

  // Top risk selection (CRITICAL > HIGH > MEDIUM; LOW is not surfaced as a top risk)
  let topRisk: { name: string; branch: string; risk: string } | null = null;
  let maxRiskLevel = 0; // 0 = none, 2=MEDIUM,3=HIGH,4=CRITICAL
  for (const repo of input.repos ?? []) {
    const risk = repo.risk;
    if (!risk) continue;
    const level = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 0 }[risk] ?? 0;
    if (level > maxRiskLevel) {
      maxRiskLevel = level;
      topRisk = {
        name: repo.name ?? "",
        branch: repo.branch ?? "",
        risk,
      };
    }
  }

  // Waiting items – first 8
  const waiting = (input.waiting ?? [])
    .slice(0, 8)
    .map((w) => ({
      title: w.title ?? "",
      detail: w.detail ?? "",
      status: w.status ?? "",
      ageSec: typeof w.ageSec === "number" ? w.ageSec : 0,
    }));

  // Recent events – last 3, newest‑first preference
  const timeline = input.timeline ?? [];
  let recentEventsSlice: TimelineEvt[] = [];
  if (timeline.length) {
    const firstTs = timeline[0]?.timestamp ? new Date(timeline[0].timestamp).getTime() : 0;
    const lastTs = timeline[timeline.length - 1]?.timestamp ? new Date(timeline[timeline.length - 1].timestamp).getTime() : 0;
    const newestFirst = firstTs >= lastTs;
    if (newestFirst) {
      recentEventsSlice = timeline.slice(0, 3);
    } else {
      recentEventsSlice = timeline.slice(-3);
    }
  }

  const recentEvents = recentEventsSlice.map((e) => ({
    type: e.type ?? "",
    title: e.title ?? "",
    timestamp: e.timestamp ?? "",
  }));

  // Unknowns – missing or empty among the listed keys
  const unknowns: string[] = [];
  if (!virtualDesktop) unknowns.push("virtualDesktop");
  if (!activeApp) unknowns.push("activeApp");
  if (!gitRepo) unknowns.push("gitRepo");
  if (!gitBranch) unknowns.push("gitBranch");
  if (!latestCommitFromState) unknowns.push("latestCommit");
  if (!modifiedFiles || modifiedFiles.length === 0) unknowns.push("modifiedFiles");

  // Assemble snapshot
  const snapshot: ContextSnapshot = {
    timestamp: now,
    project,
    activity,
    modifiedCount,
    latestCommit,
    clipboardSecret,
    brief,
    topRisk,
    waiting,
    recentEvents,
    unknowns,
  };
  return snapshot;
}
