// D06 + D21 + D24 verification. Run: npx tsx tests/orchestrator.test.ts
import fs from "fs";
import path from "path";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

// ---- D24 risk classifier (the OpenRouter-drafted, reviewed fn) ----
const { classifyRisk, scanRepos } = await import("../orchestrator/repo-registry");
ok("CRITICAL: dirty + no upstream", classifyRisk({ dirty: 3, untracked: 0, unpushed: 0, hasUpstream: false, staleDays: 0 }) === "CRITICAL");
ok("CRITICAL: unpushed + no upstream", classifyRisk({ dirty: 0, untracked: 0, unpushed: 2, hasUpstream: false, staleDays: 0 }) === "CRITICAL");
ok("HIGH: unpushed with upstream", classifyRisk({ dirty: 0, untracked: 0, unpushed: 2, hasUpstream: true, staleDays: 0 }) === "HIGH");
ok("MEDIUM: dirty with upstream", classifyRisk({ dirty: 1, untracked: 0, unpushed: 0, hasUpstream: true, staleDays: 0 }) === "MEDIUM");
ok("MEDIUM: stale clean", classifyRisk({ dirty: 0, untracked: 0, unpushed: 0, hasUpstream: true, staleDays: 30 }) === "MEDIUM");
ok("LOW: clean current", classifyRisk({ dirty: 0, untracked: 0, unpushed: 0, hasUpstream: true, staleDays: 1 }) === "LOW");

// ---- D21 registry is Veridian-scoped (includes self, not the whole disk) ----
const repos = scanRepos();
ok("registry returns >=1 entry (self)", repos.length >= 1);
ok("registry includes the veridian repo", repos.some((r) => r.name === "veridian"));
ok("every entry has a risk + branch", repos.every((r) => !!r.risk && typeof r.branch === "string"));
// Scope guard: only this repo + its worktrees + registered repos — NOT dozens of disk repos.
ok("registry is scoped (not a whole-disk scan)", repos.length <= 12);

// ---- D06 feature flags ----
const FLAGS = path.join(process.cwd(), "feature-flags.json");
const bak = fs.existsSync(FLAGS) ? fs.readFileSync(FLAGS, "utf8") : null;
const flags = await import("../autopilot/flags-store");
ok("orchestrator flag default ON", flags.isEnabled("orchestrator") === true);
ok("keystroke flag default OFF", flags.isEnabled("keystroke") === false);
ok("unknown flag defaults ON (never silently off)", flags.isEnabled("does-not-exist") === true);
flags.setFlag("telemetry", false);
ok("setFlag persists (telemetry off)", flags.isEnabled("telemetry") === false);
flags.setFlag("telemetry", true);
ok("setFlag toggles back", flags.isEnabled("telemetry") === true);
ok("unknown flag set throws", (() => { try { flags.setFlag("nope", true); return false; } catch { return true; } })());
ok("listFlags returns all known", flags.listFlags().length >= 8);
try { if (bak !== null) fs.writeFileSync(FLAGS, bak); else fs.unlinkSync(FLAGS); } catch {}

if (fail) { console.error(`\norchestrator: ${fail} FAILED`); process.exit(1); }
console.log("\norchestrator: D06 flags + D21 Veridian-scoped registry + D24 risk classifier verified");
