// Analyze the three discrepancies
import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

console.log("=== FINDING 1: Secret split with newline ===");
const splitSecret = "wJalrXUtnFEMI/K7MDENG\n/bPxRfiCYEXAMPLEKEY";
console.log("Input (raw):", JSON.stringify(splitSecret));
console.log("Result:", looksLikeSecret(splitSecret));
console.log("Analysis:");
console.log("  - The function trims() at the start: v = s.trim()");
console.log("  - The trimmed version becomes: 'wJalrXUtnFEMI/K7MDENG' (first line only)");
console.log("  - Then it tests [A-Za-z0-9+/=_-]{32,} → false (21 chars)");
console.log("  - VERDICT: Actually not caught! Splitting across lines is a bypass.");

console.log("\n=== FINDING 2: Base64 blob 48 chars ===");
const base64 = "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODk=";
console.log("Input:", base64);
console.log("Length:", base64.length);
console.log("Result:", looksLikeSecret(base64));
console.log("Analysis:");
console.log("  - Matches /[A-Za-z0-9+/=_-]{32,}/ ? ", /[A-Za-z0-9+/=_-]{32,}/.test(base64));
console.log("  - This is a true positive for high-entropy detection (48 chars of base64)");
console.log("  - VERDICT: This is intentional — long high-entropy blobs are flagged.");

console.log("\n=== FINDING 3: Filename with extension ===");
const filename = "file_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9.tmp";
console.log("Input:", filename);
console.log("Length:", filename.length);
console.log("Result:", looksLikeSecret(filename));
console.log("Analysis:");
console.log("  - Ends with .tmp (known extension):", /\.(tmp)$/i.test(filename));
console.log("  - Should be caught by looksLikePath? ", /\.(env|json|ya?ml|txt|cfg|conf|ini|toml|md|pem|key|ppk|pub)$/i.test(filename));
console.log("  - Matches [A-Za-z0-9+/=_-]{32,}/ ? ", /[A-Za-z0-9+/=_-]{32,}/.test(filename));
console.log("  - VERDICT: .tmp extension is NOT in the whitelist, so high-entropy check triggers.");
console.log("     This is a FALSE POSITIVE on innocent filenames.");
