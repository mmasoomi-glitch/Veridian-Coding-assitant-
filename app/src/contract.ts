// Versioned API contract types — mirror docs/program-control/INTERFACE_CONTRACTS.md.
// Android consumes ONLY these. Do not invent endpoints. Bump CONTRACT_VERSION with Desktop.

export const CONTRACT_VERSION = "v0.1";

export interface AuthStatus {
  required: boolean;
  authed: boolean;
  role: "admin" | "user" | null;
  email: string | null;
  configured: boolean;
  needsSetup: boolean;
  sealing: "dpapi" | "machine" | "none";
  google: boolean;
  googleClientId: string;
  cloudTotp: boolean;
  locked: boolean;
  lockedMs: number;
}

// Orchestrator surfaces (DRAFT until marked STABLE in INTERFACE_CONTRACTS.md).
export interface OrchHealth { ok: boolean; version: string; uptimeMs: number; checks: Record<string, boolean>; }
export interface RepoRisk {
  name: string; branch: string; ahead: number; behind: number;
  dirty: number; untracked: number; unpushed: number;
  risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; lastCommit: string;
}
export interface FeatureFlag { id: string; enabled: boolean; description?: string; updatedAt: string; }

// Truthful availability wrapper for every call.
export type Availability<T> =
  | { state: "ok"; data: T }
  | { state: "unavailable"; reason: string; status?: number }
  | { state: "unauthorized" }
  | { state: "contract-mismatch"; expected: string };
