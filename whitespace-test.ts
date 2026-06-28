// Test other whitespace variants of the bypass
import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

const awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

console.log("=== WHITESPACE BYPASS VARIANTS ===\n");

const variants = [
  ["Normal (no split)", awsSecret],
  ["Tab separator", "wJalrXUtnFEMI/K7MDENG\t/bPxRfiCYEXAMPLEKEY"],
  ["Space separator", "wJalrXUtnFEMI/K7MDENG /bPxRfiCYEXAMPLEKEY"],
  ["Double newline", "wJalrXUtnFEMI/K7MDENG\n\n/bPxRfiCYEXAMPLEKEY"],
  ["Leading space", " wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"],
  ["Trailing space", "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY "],
  ["Carriage return", "wJalrXUtnFEMI/K7MDENG\r/bPxRfiCYEXAMPLEKEY"],
];

for (const [desc, input] of variants) {
  const result = looksLikeSecret(input as string);
  console.log(`${result ? "✗ BYPASSED" : "✓ CAUGHT"}: ${desc}`);
}
