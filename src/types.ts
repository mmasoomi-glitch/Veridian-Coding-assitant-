export interface WorkspaceState {
  virtualDesktop: string;
  activeApp: string;
  windowTitle: string;
  workspacePath: string;
  gitRepo: string;
  gitBranch: string;
  latestCommit: string;
  modifiedFiles: string[];
  terminalDir: string;
  terminalCommand: string;
  browserDomain: string;
  browserTitle: string;
  browserTabUrl: string;
  clipboardContent: string;
  clipboardCopiedAt: string | null;
  clipboardPasted: boolean;
  claudeSessionId: string;
  activeTurn: 'human' | 'agent';
}

export interface TimelineEvent {
  id: string;
  timestamp: string; // ISO string
  type: 'desktop' | 'repo' | 'terminal' | 'vscode' | 'browser' | 'clipboard' | 'clutch';
  title: string;
  details: string;
  important: boolean;
}

export interface SessionHistory {
  sessionId: string;
  folderPath: string;
  claudeSessionId: string;
  activeTurn: 'human' | 'agent';
  lastTimestamp: string;
  clipboardContent: string;
  completedTasks: string[];
  pendingTasks: string[];
  timeline: TimelineEvent[];
}

export interface AISummary {
  currentProject: string;
  focus: string;
  completed: string[];
  pending: string[];
  risks: string[];
}
