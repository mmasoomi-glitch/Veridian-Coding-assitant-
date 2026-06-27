// AI provider tests (TC-AI-04/05/06). Run: npm run test:ai
// No real provider call, no secret, no quota use.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e: any) { fail++; console.log(`  FAIL  ${name}\n        ${e?.message || e}`); }
}

const PROVIDER_ENV = ["VERIDIAN_ENV", "OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_BASE_URL", "ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"];
function snapshotEnv() { const s: Record<string, string | undefined> = {}; for (const k of [...PROVIDER_ENV, "VERIDIAN_ENV_FILE"]) s[k] = process.env[k]; return s; }
function restoreEnv(s: Record<string, string | undefined>) { for (const k of Object.keys(s)) { if (s[k] === undefined) delete process.env[k]; else process.env[k] = s[k]!; } }
function clearProviders() { for (const k of PROVIDER_ENV) delete process.env[k]; process.env.VERIDIAN_ENV_FILE = path.join(process.cwd(), "tests", "__no_such_env__.env"); }

(async () => {
  const providers = await import("../ai/providers.ts");

  // TC-AI-04: no CLI/subprocess AI path in ai/providers.ts (HTTP only).
  await t("TC-AI-04 no CLI/subprocess path in ai/providers.ts", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "ai", "providers.ts"), "utf8");
    for (const bad of [/child_process/i, /\bspawn\(/i, /\bexecFile\(/i, /claude\s+-p/i, /CLAUDE_BIN/i, /CLAUDE_CODE_OAUTH/i, /--resume/i]) {
      assert.ok(!bad.test(src), `forbidden CLI token present: ${bad}`);
    }
  });

  // TC-AI-05: no provider config => AI disabled, no fallback, chatJSON rejects honestly.
  await t("TC-AI-05 missing config disables AI (no fallback)", async () => {
    const save = snapshotEnv();
    clearProviders();
    try {
      assert.strictEqual(providers.aiConfigured(), false, "should be unconfigured");
      assert.strictEqual(providers.activeProvider(), null, "no provider when unconfigured");
      await assert.rejects(() => providers.chatJSON({ system: "x", user: "y" }), /not configured/i);
    } finally { restoreEnv(save); }
  });

  // TC-AI-06: provider failure returns a sanitized unavailable state, not a fabrication.
  await t("TC-AI-06 unreachable provider => sanitized unavailable (no fabrication)", async () => {
    const save = snapshotEnv();
    clearProviders();
    // configure ONLY a bogus OpenRouter endpoint (closed port) so the probe fails fast
    process.env.VERIDIAN_ENV = "test-not-a-real-key";
    process.env.OPENROUTER_BASE_URL = "http://127.0.0.1:9";
    try {
      const v = await providers.validateProvider();
      assert.strictEqual(v.configured, true);
      assert.strictEqual(v.modelAccepted, false, "must not claim model accepted on failure");
      assert.ok(v.errorCategory, "must report an error category, not a fake answer");
    } finally { restoreEnv(save); }
  });

  console.log(`\nAI provider tests: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
