import { dpapiProtect, dpapiUnprotect, dpapiAvailable } from "../lib/dpapi";
let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c?"  ok   ":"  FAIL ")+n); if(!c) fail++; };
console.log("dpapiAvailable:", dpapiAvailable());
const secret = "veridian-sync-key::sk-or-v1-SECRET::" + "x".repeat(20);
const sealed = await dpapiProtect(secret);
ok("protect returns ciphertext", !!sealed && sealed.length > 20);
ok("ciphertext hides plaintext", !!sealed && !sealed.includes("sk-or-v1-SECRET"));
const back = await dpapiUnprotect(sealed || "");
ok("unprotect round-trips to original", back === secret);
const tampered = await dpapiUnprotect((sealed||"").slice(0,-6) + "AAAAAA");
ok("tampered ciphertext fails closed (null)", tampered === null);
if (fail) { console.error(`\ndpapi: ${fail} FAILED`); process.exit(1); }
console.log("\ndpapi: DPAPI(CurrentUser) seal/unseal works on this machine");
