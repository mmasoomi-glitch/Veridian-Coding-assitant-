import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface WaitingItem {
  source: string;
  title: string;
  detail: string;
  ageSec: number;
  status: "idle" | "finished";
  path: string;
}

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const TAIL_BYTES = 2 * 1024; // ~2KB tail
const MAX_FILES = 200;
const FINISHED_SEC = 60;

function getIdleSec(): number {
  const raw = process.env.CLAUDE_IDLE_SEC;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 15;
}

function getRoots(): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();
  const add = (p: string | undefined) => {
    if (!p) return;
    const norm = path.resolve(p);
    const key = norm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    roots.push(norm);
  };

  if (process.env.CLAUDE_LOG_ROOT) {
    add(process.env.CLAUDE_LOG_ROOT);
  } else {
    add(path.join(os.tmpdir(), "claude"));
    if (process.env.LOCALAPPDATA) {
      add(path.join(process.env.LOCALAPPDATA, "Temp", "claude"));
    }
  }
  return roots;
}

interface Candidate {
  path: string;
  mtimeMs: number;
  size: number;
}

async function collectFiles(root: string, out: Candidate[]): Promise<void> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return; // root or subdir doesn't exist / not accessible
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    try {
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        await collectFiles(full, out);
      } else if (entry.isFile()) {
        const lower = entry.name.toLowerCase();
        if (!lower.endsWith(".output") && !lower.endsWith(".jsonl")) continue;
        const st = await fs.stat(full);
        out.push({ path: full, mtimeMs: st.mtimeMs, size: st.size });
      }
    } catch {
      // skip unreadable entry
    }
  }
}

async function readTail(filePath: string, size: number): Promise<string> {
  const readLen = Math.min(TAIL_BYTES, size);
  if (readLen <= 0) return "";
  const start = Math.max(0, size - readLen);
  const fh = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(readLen);
    await fh.read(buf, 0, readLen, start);
    return buf.toString("utf8");
  } finally {
    await fh.close();
  }
}

function lastNonEmptyLine(text: string): string {
  const lines = text.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      return trimmed.length > 160 ? trimmed.slice(0, 160) : trimmed;
    }
  }
  return "";
}

// Infrastructure / build noise that is NOT a real "waiting on you" item — e.g.
// this app's own dev-server, gradle, vite, and npm background logs. These live
// in the same temp/claude task dir, so we filter them out by content.
const NOISE = /\[vite\]|hmr update|page reload|gradlew|operable program|> Task :|BUILD (SUCCESSFUL|FAILED)|Telemetry poller|Veridian Server listening|npm (warn|error|run)|vite v\d|^[{}\s]*$/i;

function isNoise(tail: string, detail: string): boolean {
  if (!detail) return true;
  if (NOISE.test(detail)) return true;
  // If the whole tail is dominated by build/dev-server chatter, skip it.
  if (/\[vite\]|> Task :|gradlew|Telemetry poller/i.test(tail)) return true;
  return false;
}

export async function getWaitingItems(): Promise<WaitingItem[]> {
  try {
    const roots = getRoots();
    const candidates: Candidate[] = [];
    for (const root of roots) {
      await collectFiles(root, candidates);
    }

    // Cap at MAX_FILES by mtime desc (most recent first)
    candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const limited = candidates.slice(0, MAX_FILES);

    const idleSec = getIdleSec();
    const now = Date.now();
    const items: WaitingItem[] = [];

    for (const c of limited) {
      try {
        if (c.size <= 0) continue; // non-empty required
        const ageSec = (now - c.mtimeMs) / 1000;
        if (ageSec < idleSec) continue;

        // Only ever read the tail (<= TAIL_BYTES) regardless of file size, so even
        // files larger than MAX_FILE_BYTES are cheap to inspect. readTail uses the
        // real size to compute the correct end offset.
        const tail = await readTail(c.path, c.size);
        const detail = lastNonEmptyLine(tail);

        if (isNoise(tail, detail)) continue; // drop infra/build log noise

        const lower = c.path.toLowerCase();
        let source: string;
        let title: string;
        if (lower.endsWith(".output")) {
          source = "task";
          title = path.basename(c.path, path.extname(c.path));
        } else {
          source = "transcript";
          title = path.basename(path.dirname(c.path));
        }

        const status: "idle" | "finished" = ageSec >= FINISHED_SEC ? "finished" : "idle";

        items.push({ source, title, detail, ageSec, status, path: c.path });
      } catch {
        // skip this file on any per-file error
      }
    }

    items.sort((a, b) => a.ageSec - b.ageSec);
    return items;
  } catch {
    return [];
  }
}
