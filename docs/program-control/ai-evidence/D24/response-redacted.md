export type Risk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export function classifyRisk(r: { dirty: number; untracked: number; unpushed: number; hasUpstream: boolean; staleDays: number }): Risk {
    const hasChanges = r.dirty + r.untracked > 0;
    if ((hasChanges && !r.hasUpstream) || (r.unpushed > 0 && !r.hasUpstream)) return "CRITICAL";
    if (r.unpushed > 0) return "HIGH";
    if (hasChanges || r.staleDays > 7) return "MEDIUM";
    return "LOW";
}