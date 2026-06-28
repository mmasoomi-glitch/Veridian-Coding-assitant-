// Wave-2 repair regression tests. Run: npx tsx tests/wave2-repairs.test.ts
// Covers: R02 D07 BLOCKER (owner-checked release) + the backslash false-positive,
// and R04 D11 CRITICAL (PEM / AWS-slash / connection-string bypasses now caught).
import fs from "fs";
import path from "path";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

// ---------- D07 repair ----------
{
  const LK = path.join(process.cwd(), "orchestrator-locks.json");
  const bak = fs.existsSync(LK) ? fs.readFileSync(LK, "utf8") : null;
  const lm = await import("../orchestrator/lock-manager");
  // clear any state
  for (const l of lm.listLocks()) lm.release(l.id);

  const a = lm.acquire("alice", ["src/secret.ts"]);
  ok("alice acquires", a.ok && !!a.id);
  // R02 BLOCKER: bob cannot release alice's lock when owner is enforced
  ok("bob CANNOT release alice's lock (owner enforced)", lm.release(a.id!, "bob") === false);
  ok("alice's lock still held after bob's attempt", lm.isLocked("src/secret.ts") === true);
  ok("alice CAN release her own lock", lm.release(a.id!, "alice") === true);
  ok("lock gone after owner release", lm.isLocked("src/secret.ts") === false);

  // R02 D2 was a FALSE POSITIVE — prove backslash paths DO normalize + overlap.
  const b = lm.acquire("carol", ["src\\win\\file.ts"]);
  ok("backslash path overlaps its forward-slash form (regex correct)", lm.isLocked("src/win/file.ts") === true);
  lm.release(b.id!, "carol");

  for (const l of lm.listLocks()) lm.release(l.id);
  if (bak !== null) fs.writeFileSync(LK, bak); else try { fs.unlinkSync(LK); } catch {}
}

// ---------- D11 repair ----------
{
  const sr = await import("../orchestrator/secret-reference-registry");
  const L = sr.looksLikeSecret;
  // Fixtures are BUILT FROM FRAGMENTS on purpose so no scannable secret literal is
  // committed to git (GitHub push-protection / the project's own no-secret-in-repo rule),
  // while still exercising the real guard.
  const BEGIN = "-----BEGIN ", END = "-----END ", PK = "PRIVATE KEY-----";
  const pem = BEGIN + PK + "\nMIIEvQIBADANBgkqhkiG9w0BAQEF\n" + END + PK;
  const openssh = BEGIN + "OPENSSH " + PK + "\nb3BlbnNzaC1rZXk\n" + END + "OPENSSH " + PK;
  // Newly-caught (were bypasses before):
  ok("PEM private key caught", L(pem) === true);
  ok("OpenSSH private key caught", L(openssh) === true);
  ok("AWS secret with slashes caught", L("wJalr" + "XUtnFEMI/K7MDENG/bPxRfiCY" + "EXAMPLEKEY") === true);
  ok("connection string password= caught", L("Server=db;User Id=sa;" + "Pass" + "word=" + "Zx9q7" + "Wv2_kP;Database=x") === true);
  ok("uri user:pass@host caught", L("postgresql://user:" + "Zx9q7Wv2kP" + "@localhost:5432/db") === true);
  ok("slack token caught", L("xox" + "b-123456789012-abcdefABCDEF1234") === true);
  ok("stripe key caught", L("sk_" + "live_" + "z".repeat(24)) === true);
  // R04b CRITICAL: newline-split secret must now be caught...
  ok("newline-split AWS secret caught", L("wJalr" + "XUtnFEMI/K7MDENG" + "\n" + "/bPxRfiCY" + "EXAMPLEKEY") === true);
  // ...without flagging ordinary multi-line prose (spaces keep contiguity broken).
  ok("multi-line prose NOT flagged", L("the quick brown fox\njumped over the lazy dog near the river") === false);
  // Still-caught originals:
  ok("openrouter key still caught", L("sk-" + "or-v1-" + "z".repeat(40)) === true);
  ok("jwt still caught", L("eyJ" + "hbGci.eyJzdWIiOiIx.SflKxwRJ") === true);
  // Real provenance PATHS must NOT be flagged (no false positives):
  ok("windows .env path NOT flagged", L("C:\\Users\\HI\\Desktop\\env\\.env") === false);
  ok("relative path NOT flagged", L("./config/app.json") === false);
  ok("ssh key file location NOT flagged", L("C:\\Users\\HI\\.ssh\\id_ed25519") === false);
  ok("short human name NOT flagged", L("OpenRouter key (prod)") === false);

  // End-to-end: addRef rejects a PEM in provenance; nothing lands on disk.
  const FILE = path.join(process.cwd(), "secret-references.json");
  const bak = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;
  let threw = false;
  try { sr.addRef({ name: "leak", kind: "ssh", scope: "infrastructure", provenance: pem } as any); } catch { threw = true; }
  ok("addRef THROWS on PEM in provenance", threw === true);
  const onDisk = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
  ok("no PEM body written to disk", !onDisk.includes(PK));
  if (bak !== null) fs.writeFileSync(FILE, bak); else try { fs.unlinkSync(FILE); } catch {}
}

if (fail) { console.error(`\nwave2-repairs: ${fail} FAILED`); process.exit(1); }
console.log("\nwave2-repairs: D07 owner-checked release + D11 guard hardening verified");
