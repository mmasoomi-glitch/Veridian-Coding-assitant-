// Real adversarial tests — try to slip credentials past looksLikeSecret
import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

console.log("=== REAL ADVERSARIAL BYPASS ATTEMPTS ===\n");

const adversarial = [
  // Bypass attempt 1: Base64-encoded secret under 32 chars (should pass)
  {
    name: "Base64 secret < 32 chars",
    input: "dGhpcyBpcyBzaG9ydA==",  // "this is short" base64
    expect: false,
    why: "only 20 chars, shouldn't trigger 32+ rule",
  },
  // Bypass attempt 2: High-entropy string split across lines
  {
    name: "Secret split with newline",
    input: "wJalrXUtnFEMI/K7MDENG\n/bPxRfiCYEXAMPLEKEY",  // AWS secret with \n
    expect: true,
    why: "trimmed first, then each line checked? Or one string?",
  },
  // Bypass attempt 3: SSH key URL format (valid but carries a secret)
  {
    name: "SSH key in git-clone URL",
    input: "git@github.com:user/repo.git",
    expect: false,
    why: "no embedded secret, just host",
  },
  // Bypass attempt 4: .env file path with embedded secret-like word
  {
    name: ".env path (NOT the secret itself)",
    input: "/app/config/production.env",
    expect: false,
    why: "path with .env extension should be safe",
  },
  // Bypass attempt 5: Base64 of a PEM key (not the key block itself)
  {
    name: "Base64 blob (no delimiter)",
    input: "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODk=",  // random base64
    expect: false,
    why: "base64 without structure, only 48 chars",
  },
  // Bypass attempt 6: Very long filename that looks like a token
  {
    name: "Long filename with hash",
    input: "file_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9.tmp",
    expect: false,
    why: "filename with extension, not a secret",
  },
  // Bypass attempt 7: GitHub token without prefix
  {
    name: "Token-like hex without ghp_ prefix",
    input: "A".repeat(32),  // 32 hex chars
    expect: true,
    why: "32-char hex blob should trigger",
  },
  // Bypass attempt 8: Case variation of PEM header
  {
    name: "PEM with mixed case",
    input: "-----begin private key-----\nDATA\n-----end private key-----",
    expect: false,
    why: "regex is case-insensitive with [A-Z0-9 ], won't match lowercase",
  },
  // Bypass attempt 9: URI with only one @ (user without pass)
  {
    name: "URI with user@ but no :pass",
    input: "postgresql://admin@localhost:5432/db",
    expect: false,
    why: "no user:pass pattern, just user@",
  },
  // Bypass attempt 10: Secret in comment-like metadata
  {
    name: "Comment-like metadata",
    input: "# Secret: sk_live_" + "z".repeat(20),
    expect: true,
    why: "still contains stripe key pattern",
  },
];

let passed = 0, failed = 0;
for (const test of adversarial) {
  const result = looksLikeSecret(test.input);
  const status = result === test.expect ? "PASS" : "FAIL/BYPASS";
  const symbol = result === test.expect ? "  [OK]" : "★ [XX]";
  console.log(`${symbol} ${test.name}`);
  console.log(`     Result: ${result}, Expected: ${test.expect} (${test.why})`);
  if (result !== test.expect) {
    console.log(`     INPUT: "${test.input}"`);
    failed++;
  } else {
    passed++;
  }
  console.log();
}

console.log(`\nSummary: ${passed}/${adversarial.length} passed`);
if (failed > 0) {
  console.log(`POTENTIAL BYPASSES: ${failed}`);
  process.exit(1);
}
