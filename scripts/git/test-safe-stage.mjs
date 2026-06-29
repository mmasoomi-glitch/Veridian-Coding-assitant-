// Run: node scripts/git/test-safe-stage.mjs
import { validateStageArgs } from "./safe-stage.mjs";
let fail = 0;
const ok = (n, c) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

ok("rejects empty (no blind stage)", validateStageArgs([]).ok === false);
ok("rejects -A", validateStageArgs(["-A"]).ok === false);
ok("rejects --all", validateStageArgs(["--all"]).ok === false);
ok("rejects .", validateStageArgs(["."]).ok === false);
ok("rejects glob *", validateStageArgs(["src/*.ts"]).ok === false);
ok("rejects .env", validateStageArgs(["Desktop/env/.env"]).ok === false);
ok("rejects veridian.cred", validateStageArgs(["veridian.cred"]).ok === false);
ok("rejects .ai-private raw", validateStageArgs([".ai-private/VC02-deepseek-raw.md"]).ok === false);
ok("accepts explicit source files", validateStageArgs(["server.ts", "orchestrator/repo-registry.ts"]).ok === true);

console.log();
if (fail) { console.error(`test-safe-stage: ${fail} FAILED`); process.exit(1); }
console.log("test-safe-stage: blanket-stage + sensitive-file rejection verified");
