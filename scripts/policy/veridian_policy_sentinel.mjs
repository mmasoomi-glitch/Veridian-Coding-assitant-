#!/usr/bin/env node
// V00 — Veridian Policy Sentinel (READ-ONLY watchdog).
// Run by Windows Task Scheduler every 10 min while the user is logged in.
// It NEVER calls a model, edits source, commits, pushes, or deploys. It only reads
// git/filesystem state and WRITES evidence to docs/program-control/policy-sentinel/.
//
// On any violation it appends a `POLICY BLOCKED` record (reason · package · safe next
// action · timestamp). Opus reviews this evidence during active work.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { checkTruthLabels } from "./truth-label-check.mjs";

const REPO = process.env.VERIDIAN_REPO || "C:/Users/HI/veridian";
const OUT_DIR = path.join(REPO, "docs", "program-control", "policy-sentinel");
const LOG = path.join(OUT_DIR, "sentinel.log");
const LAST = path.join(OUT_DIR, "last-run.json");

function git(args) {
  try { return execFileSync("git", ["-C", REPO, ...args], { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return ""; }
}
const SENSITIVE = [/(^|[\\/])\.env($|\.(?!example))/i, /veridian\.cred/i, /auth-users\.json/i, /secret-references\.json/i,
  /devices\.json/i, /orchestrator-.*\.json/i, /feature-flags\.json/i, /clip-(history|counts|sync)\.json/i,
  /workspace-sessions\.json/i, /totp-config/i, /\.ai-private/i, /-(deepseek|bigllm)-raw\.md$/i];
const SECRET_RE = /(sk-or-v1-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{16,}|AKIA[A-Z0-9]{16}|gh[opsru]_[A-Za-z0-9]{20,}|GOCSPX-[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)/;

function nowIso() {
  // Date is allowed in a plain node script (only Workflow scripts forbid it).
  return new Date().toISOString();
}

function run() {
  const ts = nowIso();
  const violations = [];
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]) || "(unknown)";

  // boundary
  const remote = git(["remote", "get-url", "origin"]);
  if (remote && !/Veridian-Coding-assitant-/i.test(remote)) violations.push(["BOUNDARY", "origin is not the Veridian repo", "verify repo before any work"]);

  // git state
  const porcelain = git(["status", "--porcelain"]).split(/\r?\n/).filter(Boolean);
  const dirty = porcelain.length;
  let ahead = 0, behind = 0;
  const up = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (up) { const lr = git(["rev-list", "--left-right", "--count", "@{u}...HEAD"]).split(/\s+/); behind = +lr[0] || 0; ahead = +lr[1] || 0; }

  // tracked sensitive files (must be zero)
  const tracked = git(["ls-files"]).split(/\r?\n/).filter(Boolean);
  for (const f of tracked) if (SENSITIVE.some((re) => re.test(f))) violations.push(["TRACKED_SECRET", `sensitive file is tracked: ${f}`, "git rm --cached + add to .gitignore + ROTATE"]);

  // untracked sensitive that could be staged by mistake (informational, not blocking)
  const untracked = git(["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
  const untrackedSensitive = untracked.filter((f) => SENSITIVE.some((re) => re.test(f)));

  // staged secret-like content
  const staged = git(["diff", "--cached"]);
  if (SECRET_RE.test(staged)) violations.push(["STAGED_SECRET", "secret-like content found in staged diff", "unstage + use SECRET_REF:<name>"]);

  // local-only commits (unpushed) — risk of loss
  if (ahead > 0) violations.push(["UNPUSHED", `${ahead} local commit(s) not pushed on ${branch}`, "push the feature branch"]);

  // evidence integrity: any ai-evidence dir lacking a route manifest
  const evRoot = path.join(REPO, "docs", "program-control", "ai-evidence");
  try {
    for (const d of fs.readdirSync(evRoot)) {
      const dir = path.join(evRoot, d);
      if (fs.statSync(dir).isDirectory() && !fs.existsSync(path.join(dir, "model-route-manifest.json")) && d !== "" ) {
        // tolerate older dirs (D24 etc.) — only flag VC*/MC* writer packages
        if (/^(VC|MC)\d+/.test(d)) violations.push(["MISSING_ROUTE_EVIDENCE", `ai-evidence/${d} has no model-route-manifest.json`, "record the Big-LLM route manifest"]);
      }
    }
  } catch {}

  // truth-label enforcement (FIX-TRUTH-LABEL-01): reject RUNTIME VERIFIED without positive_path=PROVEN
  // and any label outside the closed vocabulary, read from the structured evidence ledger.
  try {
    const ledgerPath = path.join(REPO, "docs", "program-control", "evidence-ledger.json");
    if (fs.existsSync(ledgerPath)) {
      const records = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      for (const v of checkTruthLabels(records)) {
        violations.push([v.reason, `${v.package || "?"}: ${v.detail}`, "correct the label or prove positive_path with evidence"]);
      }
    }
  } catch {}

  const verdict = violations.length ? "POLICY BLOCKED" : "OK";
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let rec = `\n[${ts}] ${verdict} · branch=${branch} dirty=${dirty} ahead=${ahead} behind=${behind} untrackedSensitive=${untrackedSensitive.length}\n`;
  for (const [reason, detail, action] of violations) rec += `  POLICY BLOCKED · ${reason} · ${detail} · safe-next: ${action} · ${ts}\n`;
  fs.appendFileSync(LOG, rec);
  fs.writeFileSync(LAST, JSON.stringify({ ts, verdict, branch, dirty, ahead, behind, violations: violations.length, untrackedSensitive: untrackedSensitive.length }, null, 2));
  console.log(`${verdict} (${violations.length} violation(s)) @ ${ts}`);
  process.exit(0); // read-only watchdog never fails the scheduler
}
run();
