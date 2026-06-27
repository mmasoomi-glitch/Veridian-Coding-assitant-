// F-004 verification: sensitive fields must never survive sanitizeOutboundSnapshot,
// and payloadHasForbiddenFields must flag them. Run: npx tsx tests/sync-sanitize.test.ts
import { sanitizeOutboundSnapshot, payloadHasForbiddenFields } from "../autopilot/sync-sanitize";

let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}`); fail++; }
}

const dirty = {
  currentState: {
    virtualDesktop: "Desktop 2",
    activeApp: "Code",
    gitRepo: "veridian",
    gitBranch: "main",
    browserTitle: "GitHub",
    clipboardIsSecret: true,
    // sensitive — must be stripped:
    windowTitle: "C:\\Users\\HI\\secret.ts — Code",
    workspacePath: "C:\\Users\\HI\\veridian",
    modifiedFiles: ["C:\\Users\\HI\\veridian\\server.ts", "C:\\Users\\HI\\.env"],
    clipboardContent: "sk-or-v1-REALSECRET",
    browserTabUrl: "https://x.com/?token=abc123",
    recentCommands: ["deploy --key=sk-live-xxx"]
  },
  sessions: [
    { id: "s1", desktop: "2", project: "veridian", clipboardContent: "sk-secret",
      timeline: [{ timestamp: "t", type: "terminal", title: "cmd", details: "rm -rf --token=sk-x" }] }
  ],
  waiting: [{ id: "w1", type: "claude", title: "needs input", details: "error: /home/hi/key.pem", raw: "stack" }]
};

const flagged = payloadHasForbiddenFields(dirty);
check("forbidden fields flagged on dirty payload", flagged === true);

const safe = sanitizeOutboundSnapshot(dirty);
const blob = JSON.stringify(safe);

check("no clipboardContent value", !blob.includes("sk-or-v1-REALSECRET") && !blob.includes("sk-secret"));
check("no windowTitle", !blob.includes("secret.ts"));
check("no workspacePath / file paths", !blob.includes("server.ts") && !blob.includes(".env"));
check("no browser URL", !blob.includes("token=abc123"));
check("no recent commands", !blob.includes("sk-live-xxx"));
check("no timeline details", !blob.includes("rm -rf"));
check("no waiting details/raw", !blob.includes("key.pem") && !blob.includes("stack"));

// Safe fields preserved
check("keeps virtualDesktop", safe.currentState.virtualDesktop === "Desktop 2");
check("keeps gitBranch", safe.currentState.gitBranch === "main");
check("keeps clipboardIsSecret flag", safe.currentState.clipboardIsSecret === true);
check("modifiedFiles -> count", safe.currentState.modifiedCount === 2 && safe.currentState.modifiedFiles === undefined);
check("keeps session title-level timeline", safe.sessions[0].timeline[0].title === "cmd");
check("keeps waiting title", safe.waiting[0].title === "needs input");

// A clean payload should not be flagged
const cleanFlag = payloadHasForbiddenFields(sanitizeOutboundSnapshot(dirty));
check("re-sanitized payload no longer flagged", cleanFlag === false);

if (fail) { console.error(`\nsync-sanitize: ${fail} FAILED`); process.exit(1); }
console.log("\nsync-sanitize: all checks passed");
