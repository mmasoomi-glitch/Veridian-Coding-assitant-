Return ONLY TypeScript, no prose, no fences. Write a pure function for a Veridian
git-risk classifier:

export type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export function classifyRisk(r: { dirty: number; untracked: number; unpushed: number; hasUpstream: boolean; staleDays: number }): Risk;

Rules (most severe wins):
- CRITICAL: (dirty+untracked > 0 AND !hasUpstream) OR (unpushed > 0 AND !hasUpstream)
- HIGH: unpushed > 0 (with upstream)
- MEDIUM: (dirty+untracked > 0) OR staleDays > 7
- LOW: otherwise
Keep it small and total (always returns a Risk). No imports.
