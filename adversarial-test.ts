// Adversarial test of looksLikeSecret — try to find bypasses the repair may have missed
import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

const tests = [
  // EXPECTED REJECTS (should be caught):
  ["PEM block", "-----BEGIN PRIVATE KEY-----\nABCD\n-----END PRIVATE KEY-----", true],
  ["AWS secret with /", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", true],
  ["connection string password=", "Server=db;Password=Zx9q7Wv2_kP", true],
  ["URI with user:pass@host", "postgresql://user:Zx9q7Wv2kP@localhost:5432/db", true],
  
  // EXPECTED FALSE POSITIVES (should pass):
  ["Windows path", "C:\Users\HI\.env", false],
  ["Relative path", "./config/app.json", false],
  ["SSH key file path", "C:\Users\HI\.ssh\id_ed25519", false],
  ["Human name", "Alice's secret (prod)", false],
  
  // ADVERSARIAL BYPASSES — try to slip through:
  ["Base64 secret (40+ chars)", "dGhpcyBpcyBhIGZha2Ugc2VjcmV0IHNvIEknbS9zdHVmZi9nb2luZ2JhY2tFbGFtaWY", true, "base64-like 64 chars should trigger"],
  ["High entropy without dividers", "a".repeat(40), true, "40 hex chars should trigger"],
  ["URI without credentials", "https://example.com/path", false, "no embedded user:pass"],
  ["Password in natural language", "the password is super123secret", true, "password= pattern"],
  ["Fake AWS secret (multiple /)", "AWS" + "X".repeat(20) + "/secret/key", false, "has slashes but not high-entropy run"],
  ["Path-like but has :// (URI)", "file://C:/Users/secret.txt", false, "file:// is a path protocol, no user:pass"],
  ["Multiple /path/segments/secret", "api/auth/token/Zx9q7Wv2kP123456789012", true, "long string with / should trigger entropy check"],
];

let passed = 0, failed = 0;
for (const [name, input, expected, note] of tests) {
  const result = looksLikeSecret(input as string);
  const status = result === expected ? "PASS" : "FAIL";
  if (status === "PASS") {
    console.log(`  [${status}] ${name}`);
  } else {
    console.log(`  [${status}] ${name}: got ${result}, expected ${expected} — ${note}`);
  }
  if (result === expected) passed++; else failed++;
}

console.log(`\nResult: ${passed}/${tests.length} passed`);
if (failed > 0) {
  console.log(`BYPASSES FOUND: ${failed}`);
  process.exit(1);
}
