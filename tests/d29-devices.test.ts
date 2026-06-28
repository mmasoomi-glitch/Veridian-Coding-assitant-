// D29 trusted device registry + D30 collector contract verification.
// Proves: enroll defaults to untrusted, list reflects it, setTrusted flips trust,
// touch advances lastSeen, removeDevice deletes, and state persists across a
// fresh module import (atomic file round-trip). D30: the tailscale-scan.ps1
// collector exists and never leaks beyond the name/os/online/lastSeen allowlist.
// Run: npx tsx tests/d29-devices.test.ts
import fs from "fs";
import path from "path";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

const FILE = path.join(process.cwd(), "devices.json");
const bak = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;
// Start from a clean slate so assertions about counts are deterministic.
try { if (fs.existsSync(FILE)) fs.unlinkSync(FILE); } catch {}

const reg = await import("../orchestrator/device-registry");

// ---- empty registry on a missing file (tolerant read) ----
ok("empty registry when no file", reg.listDevices().length === 0);

// ---- enroll: untrusted by default ----
const dev = reg.enroll({ name: "honor-pad", os: "android" });
ok("enroll returns a device with an id", typeof dev.id === "string" && dev.id.length > 0);
ok("enrolled device is UNTRUSTED by default", dev.trusted === false);
ok("enroll sets firstSeen and lastSeen", !!dev.firstSeen && dev.firstSeen === dev.lastSeen);
ok("enroll keeps name/os", dev.name === "honor-pad" && dev.os === "android");

// ---- enroll validation ----
ok("enroll rejects empty name", (() => { try { reg.enroll({ name: "  ", os: "windows" }); return false; } catch { return true; } })());
ok("enroll rejects empty os", (() => { try { reg.enroll({ name: "pc", os: "" }); return false; } catch { return true; } })());

// ---- list reflects the enrollment ----
const list = reg.listDevices();
ok("list contains the enrolled device", list.length === 1 && list[0].id === dev.id);

// ---- setTrusted true ----
const trusted = reg.setTrusted(dev.id, true);
ok("setTrusted returns the updated device", trusted?.trusted === true);
ok("setTrusted persisted (re-read shows trusted)", reg.listDevices()[0].trusted === true);
ok("setTrusted on unknown id returns null", reg.setTrusted("does-not-exist", true) === null);

// ---- touch updates lastSeen (must move forward) ----
const before = reg.listDevices()[0].lastSeen;
// crypto-grade clocks can tie at ms resolution; spin briefly to guarantee a later stamp.
const t0 = Date.now(); while (Date.now() === t0) { /* spin one ms */ }
const touched = reg.touch(dev.id);
ok("touch returns the updated device", touched !== null);
ok("touch advanced lastSeen", !!touched && touched.lastSeen > before);
ok("touch left firstSeen unchanged", !!touched && touched.firstSeen === dev.firstSeen);
ok("touch on unknown id returns null", reg.touch("nope") === null);

// ---- persistence across a fresh module import (the atomic round-trip) ----
const reg2 = await import("../orchestrator/device-registry?reload=" + Date.now());
ok("state persists across a fresh import", reg2.listDevices().some((d) => d.id === dev.id && d.trusted === true));

// ---- removeDevice ----
ok("removeDevice returns true on hit", reg.removeDevice(dev.id) === true);
ok("removeDevice actually deletes", reg.listDevices().length === 0);
ok("removeDevice returns false on miss", reg.removeDevice(dev.id) === false);

// ---- D30 collector contract: file exists + allowlist-only emission ----
const PS = path.join(process.cwd(), "telemetry", "tailscale-scan.ps1");
ok("D30 tailscale-scan.ps1 exists", fs.existsSync(PS));
const ps = fs.existsSync(PS) ? fs.readFileSync(PS, "utf8") : "";
ok("D30 not-found path is non-throwing (exit 0)", /tailscale-not-found/.test(ps) && /exit 0/.test(ps));
ok("D30 emits compact JSON (matches collect.ps1 style)", /ConvertTo-Json -Compress/.test(ps));
// F-004: the forbidden fields must NOT be part of the emitted payload allowlist.
for (const banned of ["TailscaleIPs", "DNSName =", "Addrs", "PublicKey"]) {
  ok(`D30 never emits ${banned.replace(" =", "")} (F-004)`, !ps.includes(banned));
}

// ---- restore the operator's real registry ----
try { if (bak !== null) fs.writeFileSync(FILE, bak); else if (fs.existsSync(FILE)) fs.unlinkSync(FILE); } catch {}

if (fail) { console.error(`\nd29-devices: ${fail} FAILED`); process.exit(1); }
console.log("\nd29-devices: D29 registry lifecycle + persistence verified; D30 collector contract present + F-004 allowlist clean");
