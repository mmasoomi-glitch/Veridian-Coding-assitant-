#!/usr/bin/env node
// safe-stage — the ONLY approved way to stage files (no blind `git add -A`/`.`).
// Stages exactly the explicit paths you pass; refuses wildcard/all-staging and any
// known-sensitive data file. Usage: node scripts/git/safe-stage.mjs <file> [file ...]
import { execFileSync } from "node:child_process";

const FORBIDDEN_ARGS = new Set(["-A", "--all", ".", "*", "-u", "--update"]);
// Never stage these even if explicitly named (defense in depth).
const SENSITIVE = [
  /(^|[\\/])\.env($|\.)/i, /veridian\.cred/i, /auth-users\.json/i, /secret-references\.json/i,
  /devices\.json/i, /orchestrator-.*\.json/i, /feature-flags\.json/i, /registered-repos\.json/i,
  /clip-(history|counts|sync)\.json/i, /workspace-sessions\.json/i, /totp-config/i,
  /(^|[\\/])\.ai-private([\\/]|$)/i, /-deepseek-raw\.md$/i,
];

export function validateStageArgs(args) {
  if (!Array.isArray(args) || args.length === 0) return { ok: false, error: "no files given — list explicit paths" };
  for (const a of args) {
    if (FORBIDDEN_ARGS.has(a)) return { ok: false, error: `forbidden blanket-stage arg: ${a}` };
    if (a.includes("*")) return { ok: false, error: `globs not allowed: ${a}` };
    if (SENSITIVE.some((re) => re.test(a))) return { ok: false, error: `refusing to stage sensitive/data file: ${a}` };
  }
  return { ok: true, files: args };
}

function main() {
  const args = process.argv.slice(2);
  const v = validateStageArgs(args);
  if (!v.ok) { console.error("safe-stage: " + v.error); process.exit(2); }
  try {
    execFileSync("git", ["add", "--", ...v.files], { stdio: "inherit" });
    console.log("safe-stage: staged " + v.files.length + " file(s)");
  } catch (e) {
    console.error("safe-stage: git add failed:", String(e?.message || e)); process.exit(1);
  }
}
// run only as CLI, not when imported by the test (robust on Windows + POSIX)
if (process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/git/safe-stage.mjs")) main();
