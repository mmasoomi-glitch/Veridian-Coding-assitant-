// Test the newline bypass carefully
import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

console.log("=== CRITICAL: Newline Bypass Test ===\n");

// The AWS secret from the test: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
const awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
console.log("1. Whole AWS secret (40 chars):");
console.log("   Input:", awsSecret);
console.log("   Result:", looksLikeSecret(awsSecret));
console.log("   ✓ Caught: it has / and is 40 chars high-entropy\n");

// Split on the /
const splitAtSlash = "wJalrXUtnFEMI/K7MDENG\n/bPxRfiCYEXAMPLEKEY";
console.log("2. Same secret split at / with \n:");
console.log("   Input:", JSON.stringify(splitAtSlash));
console.log("   After trim():", JSON.stringify(splitAtSlash.trim()));
console.log("   Result:", looksLikeSecret(splitAtSlash));
console.log("   ✗ BYPASS: trim() removes the \n, first line is only 21 chars\n");

// Alternative split
const splitByTwo = "wJalrXUtnFEMI/K7M\nDENG/bPxRfiCYEXAMPLEKEY";
console.log("3. Same secret split differently:");
console.log("   Input:", JSON.stringify(splitByTwo));
console.log("   After trim():", JSON.stringify(splitByTwo.trim()));
console.log("   Result:", looksLikeSecret(splitByTwo));
console.log("   ✗ BYPASS: first line is 18 chars\n");

// Three-way split
const splitThreeWay = "wJalrXUtn\nFEMI/K7M\nDENG/bPxRfiCYEXAMPLEKEY";
console.log("4. Secret split three ways:");
console.log("   Input:", JSON.stringify(splitThreeWay));
console.log("   Result:", looksLikeSecret(splitThreeWay));
console.log("   ✗ BYPASS: first line is 9 chars\n");

console.log("SEVERITY: The repair processes string values line-by-line (trim), ");
console.log("allowing a secret to be obfuscated with newlines in the provenance string.");
