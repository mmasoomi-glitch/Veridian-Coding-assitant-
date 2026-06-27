import fs from "fs"; import path from "path"; import { writeJsonAtomic } from "../lib/atomic";
const f = path.join(process.cwd(), "tests", ".atomic-smoke.json");
writeJsonAtomic(f, { a: 1, b: [2,3] });
const back = JSON.parse(fs.readFileSync(f, "utf8"));
const ok = back.a === 1 && back.b[1] === 3;
// no stray tmp files left
const strays = fs.readdirSync(path.join(process.cwd(),"tests")).filter(n => n.includes(".tmp"));
fs.unlinkSync(f);
if (!ok || strays.length) { console.error("FAIL atomic", {ok, strays}); process.exit(1); }
console.log("ok: atomic write round-trips, no stray tmp files");
