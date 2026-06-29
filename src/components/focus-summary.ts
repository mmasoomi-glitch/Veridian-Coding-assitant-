// Pure helper module – no imports, no I/O

export interface CurrentState {
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

export interface FocusSummary {
  project: string;
  activity: string;
  modifiedCount: number;
  latestCommit: string;
  clipboardSecret: boolean;
  unknowns: string[];
}

/**
 * Summarise the raw telemetry into a safe, read-only FocusSummary.
 * NEVER returns workspacePath or any absolute path.
 * NEVER returns a secret value.
 */
export function summarizeFocus(
  cs: CurrentState | null | undefined
): FocusSummary {
  // All possible fields we care about
  const fields: (keyof CurrentState)[] = [
    'virtualDesktop',
    'activeApp',
    'windowTitle',
    'gitRepo',
    'gitBranch',
    'latestCommit',
    'modifiedFiles',
    'clipboardIsSecret',
    'browserTitle',
  ];

  // Determine which fields are missing or empty
  const unknowns = fields.filter((f) => {
    if (cs == null) return true;
    const val = cs[f];
    if (val === undefined || val === null) return true;
    if (typeof val === 'string' && val.trim() === '') return true;
    if (f === 'modifiedFiles' && !Array.isArray(val)) return true; // safety
    return false;
  });

  // Safe defaults for missing / empty
  const repoName = cs?.gitRepo ? (cs.gitRepo.split(/[\\/]/).filter(Boolean).pop() || cs.gitRepo) : '';
  const project = repoName
    ? repoName + (cs.gitBranch ? `@${cs.gitBranch}` : '')
    : 'unknown project';

  const activity =
    cs?.activeApp
      ? cs.activeApp + (cs.windowTitle ? ` — ${cs.windowTitle}` : '')
      : 'unknown';

  const modifiedCount = cs?.modifiedFiles?.length ?? 0;
  const latestCommit = cs?.latestCommit || 'none';
  const clipboardSecret = !!cs?.clipboardIsSecret; // boolean, NEVER the value

  return {
    project,
    activity,
    modifiedCount,
    latestCommit,
    clipboardSecret,
    unknowns,
  };
}
