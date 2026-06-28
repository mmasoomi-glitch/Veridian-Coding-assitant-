// Detailed investigation of the two discrepancies
import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

console.log("=== CASE 1: 'the password is super123secret' ===");
const case1 = "the password is super123secret";
console.log("Input:", case1);
console.log("Result:", looksLikeSecret(case1));
console.log("Expected: true (matches password= pattern)");
console.log("Analysis: regex is /[Pp]assword|passwd|pwd\s*[:=]\s*\S{4,}/i");
console.log("Does it have 'password =' or 'password:' ? ", /(password|passwd|pwd)\s*[:=]/i.test(case1));

console.log("\n=== CASE 2: 'AWSX...X/secret/key' ===");
const case2 = "AWS" + "X".repeat(20) + "/secret/key";
console.log("Input:", case2);
console.log("Result:", looksLikeSecret(case2));
console.log("Expected: false (NOT high-entropy because of path-like structure)");
console.log("Length:", case2.length);
console.log("Contains /:", case2.includes("/"));
// Check if it matches the high-entropy pattern
console.log("Matches [A-Za-z0-9+/=_-]{32,}:", /[A-Za-z0-9+/=_-]{32,}/.test(case2));

console.log("\n=== CASE 3: Let's test password pattern more carefully ===");
const passwordTests = [
  "password=Zx9q7Wv2_kP",
  "Password=secret123",
  "the password is super123",
  "password: mysecret123",
  "Pass=abc123",
  "pwd: toolong",
];

for (const test of passwordTests) {
  const result = looksLikeSecret(test);
  console.log(`  ${test}: ${result}`);
}
