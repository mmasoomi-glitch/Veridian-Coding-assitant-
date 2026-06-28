// Google ID-token verification — proves signature + claim checks with a locally
// minted RSA key and injected JWKS (no network). Covers: valid token, wrong
// audience, disallowed email, expired, tampered signature, multi-audience (future
// Android/iOS/Linux clients). Run: npx tsx tests/google-auth.test.ts
import crypto from "node:crypto";

process.env.GOOGLE_AUTH_CLIENT = "web-client.apps.googleusercontent.com";
process.env.GOOGLE_AUTH_CLIENTS = "android-client.apps.googleusercontent.com,ios-client.apps.googleusercontent.com";
process.env.VERIDIAN_GOOGLE_ALLOWED_EMAILS = "afaqsubs@gmail.com";

const g = await import("../auth/google");

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

// Mint an RSA keypair and expose its public half as a JWKS the verifier will use.
const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk: any = publicKey.export({ format: "jwk" });
const KID = "test-key-1";
jwk.kid = KID; jwk.alg = "RS256"; jwk.use = "sig";
g.__setTestJwks({ keys: [jwk] });

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function mint(payload: any, opts?: { kid?: string; tamper?: boolean }) {
  const header = b64url(Buffer.from(JSON.stringify({ alg: "RS256", kid: opts?.kid || KID, typ: "JWT" })));
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(header + "." + body), privateKey);
  let sigB64 = b64url(sig);
  if (opts?.tamper) sigB64 = sigB64.slice(0, -4) + "AAAA";
  return `${header}.${body}.${sigB64}`;
}
const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 3600;
const base = { iss: "https://accounts.google.com", aud: "web-client.apps.googleusercontent.com", email: "afaqsubs@gmail.com", email_verified: true, exp: future };

// valid
ok("valid token accepted + returns email", (await g.verifyIdToken(mint(base))).ok === true);
const good = await g.verifyIdToken(mint(base));
ok("returns the verified email", good.email === "afaqsubs@gmail.com");

// wrong audience
ok("wrong audience rejected", (await g.verifyIdToken(mint({ ...base, aud: "someone-else.apps.googleusercontent.com" }))).ok === false);

// disallowed email
ok("disallowed email rejected", (await g.verifyIdToken(mint({ ...base, email: "attacker@gmail.com" }))).ok === false);

// unverified email
ok("unverified email rejected", (await g.verifyIdToken(mint({ ...base, email_verified: false }))).ok === false);

// expired
ok("expired token rejected", (await g.verifyIdToken(mint({ ...base, exp: past }))).ok === false);

// bad issuer
ok("bad issuer rejected", (await g.verifyIdToken(mint({ ...base, iss: "evil.com" }))).ok === false);

// tampered signature
ok("tampered signature rejected", (await g.verifyIdToken(mint(base, { tamper: true })).then((r) => r.ok)) === false);

// unknown key id
ok("unknown kid rejected", (await g.verifyIdToken(mint(base, { kid: "nope" }))).ok === false);

// multi-platform: android audience is also accepted (future-proofing)
ok("android client audience accepted", (await g.verifyIdToken(mint({ ...base, aud: "android-client.apps.googleusercontent.com" }))).ok === true);
ok("ios client audience accepted", (await g.verifyIdToken(mint({ ...base, aud: "ios-client.apps.googleusercontent.com" }))).ok === true);

// config helpers
ok("allowedAudiences lists all 3 clients", g.allowedAudiences().length === 3);
ok("googleConfigured true", g.googleConfigured() === true);

if (fail) { console.error(`\ngoogle-auth: ${fail} FAILED`); process.exit(1); }
console.log("\ngoogle-auth: ID-token verification works (sig + aud-list + email allowlist); ready for web + android + ios");
