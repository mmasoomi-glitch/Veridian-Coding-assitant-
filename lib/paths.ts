import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = (process.env.VERIDIAN_DATA_DIR && process.env.VERIDIAN_DATA_DIR.trim() !== "")
  ? process.env.VERIDIAN_DATA_DIR.trim()
  : process.cwd();

try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (_) {
  // best-effort; ignore errors
}

export function dataPath(...segs: string[]): string {
  return path.join(DATA_DIR, ...segs);
}
