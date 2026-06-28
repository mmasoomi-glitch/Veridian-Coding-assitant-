// Strong-login verification: DPAPI-sealed vault + passphrase + TOTP 2FA + lockout.
// Proves the cred file holds NO plaintext, passphrase verifies (and wrong fails),
// TOTP verifies, both factors are required to log in, sessions validate, and
// brute-force locks out. Run: npx tsx tests/auth-vault.test.ts
import fs from "fs";
import path from "path";
import { authenticator } from "otplib";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

const CRED = path.join(process.cwd(), "veridian.cred");
const bak = fs.existsSync(CRED) ? fs.readFileSync(CRED, "utf8") : null;
try { if (fs.existsSync(CRED)) fs.unlinkSync(CRED); } catch {}

const vault = await import("../auth/vault");
const totp = await import("../auth/totp");

const PASS = "correct horse battery staple";
const SYNCKEY = "shared-device-key-123";

// ---- not configured yet ----
ok("starts uninitialized", vault.isInitialized() === false);
ok("authRequired false before setup (loopback)", totp.authRequired() === false);

// ---- setup ----
const info = await totp.setupVault(PASS, SYNCKEY);
ok("setup returns TOTP secret", !!info.secret);
ok("setup returns recovery codes once", Array.isArray(info.recoveryCodes) && info.recoveryCodes!.length === 8);
ok("now initialized", vault.isInitialized() === true);
ok("authRequired true after setup", totp.authRequired() === true);
ok("syncKey stored + readable", vault.getSyncKey() === SYNCKEY);

// ---- cred file has NO plaintext ----
const onDisk = fs.readFileSync(CRED, "utf8");
ok("cred file does not contain passphrase", !onDisk.includes(PASS));
ok("cred file does not contain TOTP secret", !onDisk.includes(info.secret));
ok("cred file does not contain syncKey", !onDisk.includes(SYNCKEY));
ok("cred file is sealed (dpapi on win)", onDisk.includes("dpapi") || onDisk.includes("machine"));

// ---- passphrase factor ----
ok("correct passphrase verifies", totp.verifyPassphrase(PASS) === true);
ok("wrong passphrase rejected", totp.verifyPassphrase("nope") === false);

// ---- TOTP factor ----
const goodCode = authenticator.generate(info.secret);
ok("valid TOTP code verifies", totp.verifyCode(goodCode) === true);
ok("garbage TOTP code rejected", totp.verifyCode("000000") === false);

// ---- combined login requires BOTH factors ----
const onlyPass = await totp.login(PASS, "000000");
ok("login fails with right pass + wrong code", onlyPass.ok === false);
const onlyCode = await totp.login("wrong", authenticator.generate(info.secret));
ok("login fails with wrong pass + right code", onlyCode.ok === false);
const both = await totp.login(PASS, authenticator.generate(info.secret));
ok("login succeeds with BOTH factors", both.ok === true && !!both.token);

// ---- session token ----
ok("issued session token validates", totp.verifySessionToken(both.token) === true);
ok("garbage session token rejected", totp.verifySessionToken("abc.def") === false);

// ---- recovery code is single-use ----
const rec = info.recoveryCodes![0];
const recLogin = await totp.login(PASS, "", rec);
ok("recovery code logs in", recLogin.ok === true);
const recAgain = await totp.login(PASS, "", rec);
ok("same recovery code cannot be reused", recAgain.ok === false);

// ---- lockout after repeated failures ----
for (let i = 0; i < 5; i++) await totp.login("bad", "000000");
const locked = await totp.login(PASS, authenticator.generate(info.secret));
ok("locks out after 5 failures (even with good creds)", locked.ok === false && locked.error === "locked");
ok("lockState reports locked", totp.lockState().locked === true);

// ---- re-unseal from disk proves persistence ----
const fresh = await vault.unseal();
ok("vault re-unseals from disk", fresh === true && vault.getSyncKey() === SYNCKEY);

// ---- restore ----
try { if (bak !== null) fs.writeFileSync(CRED, bak); else fs.unlinkSync(CRED); } catch {}

if (fail) { console.error(`\nauth-vault: ${fail} FAILED`); process.exit(1); }
console.log("\nauth-vault: strong login (passphrase + TOTP, DPAPI-sealed) works; no plaintext at rest");
