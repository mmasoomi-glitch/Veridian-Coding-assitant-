import { parseTelemetry, RawTelemetry } from "../telemetry/parse";

let passed = 0;
let total = 0;

function test(desc: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`PASS ${desc}`);
    passed++;
  } catch (err) {
    console.error(`FAIL ${desc}: ${err}`);
  }
}

// Sample telemetry object for positive tests
const sampleTelemetry: RawTelemetry = {
  collectedAt: "2023-08-20T12:34:56.789Z",
  activeApp: "Notepad",
  windowTitle: "My Window 🚀 проект 文档",
  workspacePath: "/home/user/project",
  gitRepo: "repo",
  gitBranch: "feature/foo",
  latestCommit: "d1e2f3a",
  modifiedFiles: ["src/file1.ts", "src/file2.ts"],
  clipboard: "copy of something",
  recentCommands: ["git status", "npm run build"],
  virtualDesktop: "Desktop 2",
  browserTitle: "Google Search",
  browserUrl: "https://google.com",
};

function assertEqual(actual: any, expected: any, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function isSentinel(rt: RawTelemetry): boolean {
  return rt._telemetryError === "parse-failure";
}

// Positive cases
test("BOM prefix recovers", () => {
  const input = "﻿" + JSON.stringify(sampleTelemetry);
  const result = parseTelemetry(input);
  assertEqual(result, sampleTelemetry, "Parsed telemetry should match sample");
});

test("CRLF recovers (trailing newline)", () => {
  const input = JSON.stringify(sampleTelemetry) + "\r\n";
  const result = parseTelemetry(input);
  assertEqual(result, sampleTelemetry, "Parsed telemetry should match sample with CRLF");
});

test("Unicode windowTitle round-trips", () => {
  const input = JSON.stringify(sampleTelemetry);
  const result = parseTelemetry(input);
  if (result.windowTitle !== sampleTelemetry.windowTitle) {
    throw new Error(`Unicode windowTitle mismatch: ${result.windowTitle}`);
  }
});

test("Stray leading text recovers", () => {
  const input = "PowerShell output: 123\n" + JSON.stringify(sampleTelemetry);
  const result = parseTelemetry(input);
  assertEqual(result, sampleTelemetry, "Should extract JSON after leading text");
});

test("Trailing text recovers", () => {
  const input = JSON.stringify(sampleTelemetry) + "\nLog line after";
  const result = parseTelemetry(input);
  assertEqual(result, sampleTelemetry, "Should extract JSON before trailing text");
});

// Negative cases (sentinel)
test("Empty string -> sentinel", () => {
  if (!isSentinel(parseTelemetry(""))) throw new Error("Expected sentinel for empty input");
});
test("Whitespace-only -> sentinel", () => {
  if (!isSentinel(parseTelemetry("   \n\t "))) throw new Error("Expected sentinel for whitespace input");
});
test("PowerShell error text (no JSON) -> sentinel", () => {
  if (!isSentinel(parseTelemetry("Get-Error: Something went wrong"))) throw new Error("Expected sentinel for error text");
});
test("Truncated JSON -> sentinel", () => {
  if (!isSentinel(parseTelemetry('{"activeApp":"Notepad"'))) throw new Error("Expected sentinel for truncated JSON");
});
test("Valid but missing fields parses (not sentinel)", () => {
  const result = parseTelemetry(JSON.stringify({ workspacePath: "/some/path" }));
  if (isSentinel(result)) throw new Error("Should not be sentinel when valid JSON provided");
  if (result.workspacePath !== "/some/path") throw new Error("workspacePath should be preserved");
});
test("Top-level array -> sentinel", () => {
  if (!isSentinel(parseTelemetry("[1,2,3]"))) throw new Error("Expected sentinel for top-level array");
});

if (total === 0) {
  process.exit(0);
}
process.exit(passed === total ? 0 : 1);
