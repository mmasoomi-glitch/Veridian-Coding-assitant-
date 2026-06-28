import { looksLikeSecret } from "./orchestrator/secret-reference-registry";

const awsSecret = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

console.log("Direct test of the normal secret:");
console.log("Input:", awsSecret);
console.log("Result:", looksLikeSecret(awsSecret));
console.log("Length:", awsSecret.length);
console.log();

console.log("With leading space:");
const withLead = " " + awsSecret;
console.log("Input: '" + withLead + "'");
console.log("Result:", looksLikeSecret(withLead));
console.log();

console.log("With trailing space:");
const withTrail = awsSecret + " ";
console.log("Input: '" + withTrail + "'");
console.log("Result:", looksLikeSecret(withTrail));
