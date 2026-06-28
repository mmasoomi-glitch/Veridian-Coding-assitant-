// Cross-device clipboard sync verification. Proves: E2E encrypt/decrypt round-trips
// with the shared key, fails closed on the wrong key, the central store holds only
// ciphertext (never plaintext), and a remote entry surfaces in the unified list.
// Run: npx tsx tests/clip-sync.test.ts
import fs from "fs";
import path from "path";

let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { console.error(`  FAIL ${name}`); fail++; }
}

// ---- 1. With NO key, the whole feature is inert -----------------------------
delete process.env.VERIDIAN_SYNC_KEY;
{
  const crypto = await import("../lib/sync-crypto");
  check("no key -> syncCryptoReady false", crypto.syncCryptoReady() === false);
  check("no key -> encryptToBlob null", crypto.encryptToBlob("x") === null);
}

// ---- 2. E2E round-trip + wrong-key fail-closed ------------------------------
process.env.VERIDIAN_SYNC_KEY = "shared-device-key-AAA";
const { encryptToBlob, decryptBlob, syncCryptoReady } = await import("../lib/sync-crypto");
check("key set -> ready", syncCryptoReady() === true);

const SECRETISH = "copied on PC-A: sk-or-v1-ABCDEF and a note";
const blob = encryptToBlob(SECRETISH)!;
check("blob produced", typeof blob === "string" && blob.startsWith("e2e:v1:"));
check("blob hides plaintext", !blob.includes("sk-or-v1-ABCDEF") && !blob.includes("PC-A"));
check("same key decrypts to original", decryptBlob(blob) === SECRETISH);

// Wrong key -> null (authenticated decryption fails closed). The module re-derives
// the key from the env passphrase on each call, so changing it simulates a device
// that doesn't share the key.
process.env.VERIDIAN_SYNC_KEY = "different-device-key-ZZZ";
check("wrong key cannot decrypt", decryptBlob(blob) === null);
process.env.VERIDIAN_SYNC_KEY = "shared-device-key-AAA"; // restore the shared key

// ---- 3. Central store keeps ciphertext only ---------------------------------
const STORE = path.join(process.cwd(), "clip-sync.json");
const bak = fs.existsSync(STORE) ? fs.readFileSync(STORE, "utf8") : null;
const { recordClipBlobs, listClipBlobs } = await import("../autopilot/clip-sync-store");
const entryA = { id: "a1", ts: "2026-06-28T10:00:00Z", blob, preview: "copied on PC-A: c…[secret]", isSecret: true, length: SECRETISH.length };
recordClipBlobs("machine-A", "PC-A", [entryA]);
const onDisk = fs.readFileSync(STORE, "utf8");
check("central file has NO plaintext", !onDisk.includes("sk-or-v1-ABCDEF") && !onDisk.includes("and a note"));
check("central file has the ciphertext blob", onDisk.includes(blob.slice(7, 30)));
const all = listClipBlobs();
check("listClipBlobs returns entry with origin", all.length >= 1 && all[0].origin === "PC-A");
check("exclude filters own machine", listClipBlobs("machine-A").every((e) => e.machineId !== "machine-A"));

// ---- 4. clip-history: export -> ingest -> unified ---------------------------
const HIST = path.join(process.cwd(), "clip-history.json");
const COUNTS = path.join(process.cwd(), "clip-counts.json");
const hbak = fs.existsSync(HIST) ? fs.readFileSync(HIST, "utf8") : null;
const cbak = fs.existsSync(COUNTS) ? fs.readFileSync(COUNTS, "utf8") : null;
const clip = await import("../autopilot/clip-history");
clip.clear();
clip.record("a normal note copied locally " + Date.now());
const exported = clip.exportForSync();
check("exportForSync produced blobs (key set)", exported.length >= 1);
check("exported blob decrypts back to the local value", (decryptBlob(exported[0].blob) || "").includes("a normal note copied locally"));

// Simulate receiving a remote entry from PC-A and verify it shows up as remote.
const n = clip.ingestRemote([{ id: "remote-x", ts: "2026-06-28T11:00:00Z", blob, preview: "copied on PC-A: c…[secret]", isSecret: true, length: 5, origin: "PC-A" }]);
check("ingestRemote decrypted 1", n === 1);
const unified = clip.unifiedList();
const remoteRow = unified.find((e) => e.id === "remote-x");
check("unified list includes the remote entry", !!remoteRow && remoteRow.remote === true && remoteRow.origin === "PC-A");
check("unified list still includes a local entry", unified.some((e) => e.remote === false));
check("syncInfo reports ready + remote count", clip.syncInfo().ready === true && clip.syncInfo().remoteCount >= 1);

// ---- restore originals ------------------------------------------------------
clip.clear();
function restoreFile(p: string, content: string | null) {
  if (content !== null) fs.writeFileSync(p, content); else { try { fs.unlinkSync(p); } catch {} }
}
restoreFile(STORE, bak);
restoreFile(HIST, hbak);
restoreFile(COUNTS, cbak);

if (fail) { console.error(`\nclip-sync: ${fail} FAILED`); process.exit(1); }
console.log("\nclip-sync: cross-device clipboard works end-to-end; central never sees plaintext");
