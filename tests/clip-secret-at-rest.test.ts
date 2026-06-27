import fs from "fs";
import path from "path";
import * as clip from "../autopilot/clip-history";

const HIST = path.join(process.cwd(), "clip-history.json");
const COUNTS = path.join(process.cwd(), "clip-counts.json");
// snapshot existing files to restore after
const histBak = fs.existsSync(HIST) ? fs.readFileSync(HIST, "utf8") : null;
const countsBak = fs.existsSync(COUNTS) ? fs.readFileSync(COUNTS, "utf8") : null;

let fail = 0;
const SECRET = "sk-or-v1-" + "Z".repeat(64);
const NORMAL = "just some normal copied text " + Date.now();

clip.clear();
clip.record(SECRET);
clip.record(NORMAL);

const histRaw = fs.existsSync(HIST) ? fs.readFileSync(HIST, "utf8") : "";
const countsRaw = fs.existsSync(COUNTS) ? fs.readFileSync(COUNTS, "utf8") : "";

if (histRaw.includes(SECRET)) { console.error("FAIL: secret raw value found in clip-history.json"); fail++; }
else console.log("ok: secret NOT in clip-history.json");
if (countsRaw.includes(SECRET)) { console.error("FAIL: secret raw value found in clip-counts.json"); fail++; }
else console.log("ok: secret NOT in clip-counts.json");
// list never leaks raw
const leaked = clip.list().some(e => (e as any).value || e.preview.includes(SECRET.slice(8)));
if (leaked) { console.error("FAIL: list() leaked raw/secret"); fail++; } else console.log("ok: list() returns redacted preview only");
// restore works within session for the secret (ephemeral cache)
const secId = clip.list().find(e => e.isSecret)?.id;
clip.restore(secId || "").then((okR) => {
  console.log(okR ? "ok: in-session secret restore works (ephemeral)" : "note: restore returned false (clipboard set may fail headless) — acceptable");
  // restore originals
  if (histBak !== null) fs.writeFileSync(HIST, histBak); else try { fs.unlinkSync(HIST); } catch {}
  if (countsBak !== null) fs.writeFileSync(COUNTS, countsBak); else try { fs.unlinkSync(COUNTS); } catch {}
  if (fail) { console.error(`\nclip-secret-at-rest: ${fail} FAILED`); process.exit(1); }
  console.log("\nclip-secret-at-rest: secrets are not persisted at rest");
});
