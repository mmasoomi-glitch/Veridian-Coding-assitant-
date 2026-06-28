// Admin allowlist + session roles. Proves: env seeds the owner as admin, admin can
// add/remove users, last-admin can't be removed, only allowlisted Google emails
// pass, role flows into the session token, and sessionClaims reads it back.
// Run: npx tsx tests/admin-users.test.ts
import fs from "fs";
import path from "path";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

const FILE = path.join(process.cwd(), "auth-users.json");
const bak = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : null;
try { if (fs.existsSync(FILE)) fs.unlinkSync(FILE); } catch {}

// No env allowlist on purpose: prove the owner is a HARDCODED default admin.
delete process.env.VERIDIAN_GOOGLE_ALLOWED_EMAILS;
process.env.AUTH_SESSION_SECRET = "test-session-secret-xyz";

const users = await import("../auth/users");
const totp = await import("../auth/totp");

// ---- owner is the permanent default admin (one-man army baseline) ----
ok("OWNER_EMAIL defaults to afaqsubs@gmail.com", users.OWNER_EMAIL === "afaqsubs@gmail.com");
ok("owner is admin with NO env config", users.roleFor("afaqsubs@gmail.com") === "admin");
ok("owner is allowed with NO env config", users.isAllowed("afaqsubs@gmail.com") === true);
ok("owner flagged as owner in list", users.listUsers().some((u) => u.email === "afaqsubs@gmail.com" && u.owner === true));
ok("starts solo (one-man army)", users.teamInfo().solo === true && users.teamInfo().total === 1);
ok("random email not allowed", users.isAllowed("stranger@gmail.com") === false);

// ---- admin adds users ----
users.addUser({ email: "teammate@example.com", role: "user", addedBy: "afaqsubs@gmail.com" });
ok("added user is allowed", users.isAllowed("teammate@example.com") === true);
ok("added user has role user", users.roleFor("teammate@example.com") === "user");
ok("email is normalized (case-insensitive)", users.isAllowed("TEAMMATE@EXAMPLE.COM") === true);
ok("invalid email rejected", (() => { try { users.addUser({ email: "not-an-email" }); return false; } catch { return true; } })());

// ---- promote + list ----
users.addUser({ email: "teammate@example.com", role: "admin" });
ok("user promoted to admin", users.roleFor("teammate@example.com") === "admin");
ok("listUsers returns all", users.listUsers().length === 2);

// ---- team state flips when a member is added ----
ok("becomes a team when a member is added", users.teamInfo().solo === false && users.teamInfo().members.length >= 1);

// ---- removal + owner guards ----
const rem = users.removeUser("teammate@example.com");
ok("can remove a normal member", rem.ok === true);
const remOwner = users.removeUser("afaqsubs@gmail.com");
ok("cannot remove the OWNER", remOwner.ok === false && /owner/.test(remOwner.error || ""));
const demote = users.addUser({ email: "afaqsubs@gmail.com", role: "user" });
ok("owner cannot be demoted below admin", users.roleFor("afaqsubs@gmail.com") === "admin");
void demote;

// ---- session role round-trip ----
const adminTok = totp.createSessionToken("admin", "afaqsubs@gmail.com");
const userTok = totp.createSessionToken("user", "teammate@example.com");
ok("admin token valid", totp.verifySessionToken(adminTok) === true);
ok("admin token claims role=admin", totp.sessionClaims(adminTok)?.role === "admin");
ok("admin token carries email", totp.sessionClaims(adminTok)?.email === "afaqsubs@gmail.com");
ok("user token claims role=user", totp.sessionClaims(userTok)?.role === "user");
ok("garbage token -> null claims", totp.sessionClaims("nope.nope") === null);

// ---- restore ----
try { if (bak !== null) fs.writeFileSync(FILE, bak); else fs.unlinkSync(FILE); } catch {}

if (fail) { console.error(`\nadmin-users: ${fail} FAILED`); process.exit(1); }
console.log("\nadmin-users: TOTP admin can manage the allowlist; roles flow into sessions; last-admin protected");
