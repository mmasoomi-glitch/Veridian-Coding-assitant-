// Verbatim folder backup/restore to a Hetzner server volume over SSH.
//
// Uses OpenSSH's `ssh`/`scp` (on PATH on modern Windows) to copy a chosen local
// folder EXACTLY to a remote backup root, and restore it back. SSH may not be
// authorized yet — every operation is wrapped so failures surface a clear
// "SSH not ready" style note instead of crashing.
//
// Manual reuse (for the owner): the same scp command this module runs is logged
// and also surfaced in the UI's "config for future use" block.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "../lib/atomic";

// --- Config (env-overridable) -----------------------------------------------

const SSH_KEY = process.env.DEPLOY_SSH_KEY || path.join(process.env.USERPROFILE || "", ".ssh", "veridian_deploy");
const HOST = process.env.DEPLOY_HOST || "root@89.167.49.209";
const BACKUP_ROOT = process.env.BACKUP_ROOT || "/mnt/HC_Volume_106116955/veridian-backups";

const LOG_FILE = path.join(process.cwd(), "backup-log.json");

// Common ssh options: never prompt (BatchMode), auto-accept new host keys so a
// first connection doesn't hang waiting on interactive confirmation.
const SSH_OPTS = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new"];

export interface BackupRecord {
  id: string;
  ts: string;
  name: string;
  localPath: string;
  remotePath: string;
  fileCount: number;
  bytes: number;
  ok: boolean;
  note: string;
}

// Surfaced in the UI so the owner can reproduce a backup by hand if needed.
export const backupConfig = {
  host: HOST,
  remoteRoot: BACKUP_ROOT,
  sshKey: SSH_KEY,
  scpTemplate: `scp -r -i "${SSH_KEY}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "<LOCAL_PATH>/." ${HOST}:"${BACKUP_ROOT}/<NAME>/"`
};

// --- Helpers -----------------------------------------------------------------

// Run a command, collecting output; resolves (never rejects) with a code+output.
function run(cmd: string, args: string[], timeoutMs = 10 * 60 * 1000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    let out = "", err = "";
    let child;
    try {
      child = spawn(cmd, args, { shell: process.platform === "win32", windowsHide: true });
    } catch (e: any) {
      return resolve({ code: -1, out: "", err: e?.message || String(e) });
    }
    const timer = setTimeout(() => { try { child!.kill(); } catch { /* ignore */ } }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); resolve({ code: -1, out: "", err: e.message }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? -1, out, err }); });
  });
}

// Turn an ssh/scp failure into a friendly, human-readable note.
function sshErrorNote(code: number, err: string): string {
  const e = (err || "").trim();
  const lower = e.toLowerCase();
  if (
    lower.includes("permission denied") ||
    lower.includes("could not resolve hostname") ||
    lower.includes("connection refused") ||
    lower.includes("connection timed out") ||
    lower.includes("host key verification failed") ||
    lower.includes("no such file") && lower.includes(SSH_KEY.toLowerCase()) ||
    lower.includes("identity file") ||
    code === 255
  ) {
    return `SSH not ready: ${e || "could not reach the server"}. Authorize the deploy key on ${HOST} and try again.`;
  }
  return e || `command failed (exit ${code})`;
}

// Local two-digit-padded timestamp: YYYYMMDD-HHMMSS.
function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Walk a directory; tally file count + total bytes. Best-effort (skips on error).
function inventory(dir: string): { fileCount: number; bytes: number } {
  let fileCount = 0, bytes = 0;
  const stack: string[] = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch { continue; }
    for (const ent of entries) {
      const full = path.join(cur, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        try { bytes += fs.statSync(full).size; fileCount++; } catch { /* ignore */ }
      }
    }
  }
  return { fileCount, bytes };
}

function readLog(): BackupRecord[] {
  try { return JSON.parse(fs.readFileSync(LOG_FILE, "utf8")); } catch { return []; }
}
function appendLog(rec: BackupRecord): void {
  const all = readLog();
  all.unshift(rec);
  try { writeJsonAtomic(LOG_FILE, all.slice(0, 500)); } catch (e) { console.error("backup log write:", e); }
}

// --- Public API --------------------------------------------------------------

export async function backupFolder(localPath: string): Promise<BackupRecord> {
  const now = new Date();
  const base = localPath ? path.basename(path.resolve(localPath)) : "backup";
  const name = `${base}-${stamp(now)}`;
  const remotePath = `${BACKUP_ROOT}/${name}`;
  const rec: BackupRecord = {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: now.toISOString(),
    name,
    localPath,
    remotePath,
    fileCount: 0,
    bytes: 0,
    ok: false,
    note: ""
  };

  try {
    if (!localPath || !fs.existsSync(localPath) || !fs.statSync(localPath).isDirectory()) {
      rec.note = `Local folder not found (or not a directory): ${localPath}`;
      appendLog(rec);
      return rec;
    }

    // Quick local inventory (recorded regardless of SSH outcome).
    const inv = inventory(localPath);
    rec.fileCount = inv.fileCount;
    rec.bytes = inv.bytes;

    // 1) Ensure remote dir exists.
    const mk = await run("ssh", ["-i", SSH_KEY, ...SSH_OPTS, HOST, `mkdir -p "${remotePath}"`]);
    if (mk.code !== 0) {
      rec.note = sshErrorNote(mk.code, mk.err);
      appendLog(rec);
      return rec;
    }

    // 2) Copy the folder contents verbatim. The "/." suffix copies the directory
    // contents (not the dir itself) into the remote target.
    const src = `${localPath.replace(/[\\/]+$/, "")}/.`;
    const cp = await run("scp", ["-r", "-i", SSH_KEY, ...SSH_OPTS, src, `${HOST}:"${remotePath}/"`]);
    if (cp.code !== 0) {
      rec.note = sshErrorNote(cp.code, cp.err);
      appendLog(rec);
      return rec;
    }

    rec.ok = true;
    rec.note = `Backed up ${rec.fileCount} file(s), ${rec.bytes} byte(s) to ${remotePath}.`;
    appendLog(rec);
    return rec;
  } catch (e: any) {
    rec.ok = false;
    rec.note = `Backup failed: ${e?.message || String(e)}`;
    try { appendLog(rec); } catch { /* ignore */ }
    return rec;
  }
}

export async function listBackups(): Promise<{ local: BackupRecord[]; remote: string[] }> {
  const local = readLog();
  let remote: string[] = [];
  try {
    const ls = await run("ssh", ["-i", SSH_KEY, ...SSH_OPTS, HOST, `ls -1 "${BACKUP_ROOT}"`], 60 * 1000);
    if (ls.code === 0) {
      remote = ls.out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    }
  } catch { /* SSH not ready — leave remote empty */ }
  return { local, remote };
}

export async function restoreFolder(name: string, destPath: string): Promise<{ ok: boolean; note: string }> {
  try {
    if (!name || /[\\/]/.test(name) || name.includes("..")) {
      return { ok: false, note: "Invalid backup name." };
    }
    if (!destPath || !destPath.trim()) {
      return { ok: false, note: "Destination path is required." };
    }

    const dest = path.resolve(destPath);
    // Refuse to write to a drive root (e.g. C:\ or /) — too dangerous.
    const parsed = path.parse(dest);
    if (dest === parsed.root || dest === path.sep) {
      return { ok: false, note: "Refusing to restore into a drive/filesystem root." };
    }
    // Parent of the destination must already exist.
    const parent = path.dirname(dest);
    if (!fs.existsSync(parent)) {
      return { ok: false, note: `Destination parent does not exist: ${parent}` };
    }
    // Make sure the destination dir itself exists to receive the contents.
    try { fs.mkdirSync(dest, { recursive: true }); } catch { /* may already exist */ }

    const remoteSrc = `${HOST}:"${BACKUP_ROOT}/${name}/."`;
    const cp = await run("scp", ["-r", "-i", SSH_KEY, ...SSH_OPTS, remoteSrc, `${dest.replace(/[\\/]+$/, "")}/`]);
    if (cp.code !== 0) {
      return { ok: false, note: sshErrorNote(cp.code, cp.err) };
    }
    return { ok: true, note: `Restored "${name}" into ${dest}.` };
  } catch (e: any) {
    return { ok: false, note: `Restore failed: ${e?.message || String(e)}` };
  }
}
