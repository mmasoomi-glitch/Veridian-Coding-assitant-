// Atomic JSON persistence (durability gates F-013/F-014/F-015).
//
// The app persists state to flat JSON files. The naive `fs.writeFileSync(file, …)`
// truncates the target THEN writes — so a crash/power-loss mid-write leaves a
// truncated or empty file and the data is gone. This helper writes to a temp file
// in the same directory, fsyncs it to disk, then atomically renames it over the
// target (libuv uses MOVEFILE_REPLACE_EXISTING on Windows / rename(2) on POSIX,
// both atomic on the same filesystem). A crash can leave a stray .tmp but never a
// corrupted target — the previous good file stays intact until the rename lands.
//
// This is the low-risk, no-native-dependency durability fix. A full SQLite/WAL
// migration (see docs/remediation) remains the longer-term durability story.

import fs from "fs";
import path from "path";

let counter = 0;

/** Atomically write `data` as JSON to `file` (tmp + fsync + rename). Throws on failure. */
export function writeJsonAtomic(file: string, data: unknown, pretty = true): void {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${counter++}.tmp`);
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmp, "w");
    fs.writeFileSync(fd, json, "utf8");
    fs.fsyncSync(fd); // flush to disk before we rename over the good copy
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch { /* ignore */ }
    }
  }
  try {
    fs.renameSync(tmp, file); // atomic replace
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
}
