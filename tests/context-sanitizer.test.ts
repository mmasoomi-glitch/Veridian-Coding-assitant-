// F-012 verification: sanitizeContextForLLM must remove secrets/tokens/paths
// and must NOT re-emit a stripped URL query. Run: npx tsx tests/context-sanitizer.test.ts
import { sanitizeContextForLLM } from "../ai/context-sanitizer";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    console.error(`  FAIL ${name}`);
    failures++;
  }
}
function mustNotContain(name: string, haystack: string, needle: string) {
  check(`${name} (no leak of "${needle.slice(0, 12)}…")`, !haystack.includes(needle));
}

// 1. OpenRouter key (73 chars) — the exact form deepseek's rigid {48} missed.
{
  const secret = "sk-or-v1-" + "a".repeat(64);
  const { sanitized, redactedCount } = sanitizeContextForLLM(`my key is ${secret} ok`);
  mustNotContain("openrouter key", sanitized, secret);
  check("openrouter key tagged", sanitized.includes("[REDACTED:openrouter-key]"));
  check("openrouter key counted", redactedCount >= 1);
}

// 2. URL with token in query — the leak in the cheap-model draft.
{
  const url = "https://api.example.com/v1/data?token=supersecrettoken1234567890&x=1";
  const { sanitized } = sanitizeContextForLLM(`visited ${url}`);
  mustNotContain("url query token", sanitized, "supersecrettoken1234567890");
  check("url base preserved", sanitized.includes("https://api.example.com/v1/data"));
  check("url query tagged", sanitized.includes("[REDACTED:url-query]"));
}

// 3. Windows user path — username masked.
{
  const { sanitized } = sanitizeContextForLLM("opened C:\\Users\\HI\\veridian\\server.ts");
  mustNotContain("windows username", sanitized, "Users\\HI");
  check("windows path masked", sanitized.includes("C:\\Users\\[REDACTED]"));
}

// 4. Anthropic key, AWS key, GitHub token, JWT, Bearer, assignment.
{
  const aws = "AKIA" + "ABCDEFGHIJKLMNOP";
  const gh = "ghp_" + "a".repeat(36);
  const jwt = "eyJabcdefgh.eyJpayloadxx.signaturee";
  const ant = "sk-ant-" + "x".repeat(40);
  const txt = `aws ${aws} gh ${gh} jwt ${jwt} ant ${ant} Authorization: Bearer ${"t".repeat(40)} password=hunter2hunter2`;
  const { sanitized } = sanitizeContextForLLM(txt);
  mustNotContain("aws", sanitized, aws);
  mustNotContain("github", sanitized, gh);
  mustNotContain("jwt", sanitized, jwt);
  mustNotContain("anthropic", sanitized, ant);
  check("bearer tagged", sanitized.includes("[REDACTED:bearer]"));
  check("assignment tagged", sanitized.includes("[REDACTED:secret-assign]"));
}

// 5. PEM private key block.
{
  const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\nabcd\n-----END RSA PRIVATE KEY-----";
  const { sanitized } = sanitizeContextForLLM(`key:\n${pem}\nend`);
  mustNotContain("pem body", sanitized, "MIIEpAIBAAKCAQEA");
  check("pem tagged", sanitized.includes("[REDACTED:private-key]"));
}

// 6. Ordinary prose is left intact (no over-redaction of normal words).
{
  const prose = "I was refactoring the dashboard layout and fixing the timeline sort order.";
  const { sanitized, redactedCount } = sanitizeContextForLLM(prose);
  check("prose untouched", sanitized === prose && redactedCount === 0);
}

if (failures > 0) {
  console.error(`\ncontext-sanitizer: ${failures} FAILED`);
  process.exit(1);
} else {
  console.log("\ncontext-sanitizer: all checks passed");
}
