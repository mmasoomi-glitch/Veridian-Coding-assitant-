// AI provider remediation tests (TC-AI-04/05/06). Run: npm run test:ai
// No real provider call, no secret, no quota use.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

let pass = 0, fail = 0;
async function t(name: string, fn: () => void | Promise<void>) {
  try { await fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (e: any) { fail++; console.log(`  FAIL  ${name}\n        ${e?.message || e}`); }
}

(async () => {
  // Fresh import so config is read against our manipulated env.
  const providers = await import("../ai/providers.ts");

  // TC-AI-04: no DeepSeek/OpenAI/Gemini/CLI path exists in the provider source.
  await t("TC-AI-04 no forbidden provider/CLI paths in ai/providers.ts", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "ai", "providers.ts"), "utf8");
    for (const bad of [/deepseek/i, /openai/i, /gemini/i, /child_process/i, /\bspawn\b/i, /claude\s+-p/i, /CLAUDE_BIN/i, /CLAUDE_CODE_OAUTH/i, /--resume/i]) {
      assert.ok(!bad.test(src), `forbidden token present: ${bad}`);
    }
  });

  // TC-AI-05: missing config => AI disabled, no fallback, chatJSON rejects honestly.
  await t("TC-AI-05 missing config disables AI (no fallback)", async () => {
    const save = { b: process.env.ANTHROPIC_BASE_URL, k: process.env.ANTHROPIC_API_KEY, f: process.env.VERIDIAN_ENV_FILE };
    delete process.env.ANTHROPIC_BASE_URL; delete process.env.ANTHROPIC_API_KEY;
    process.env.VERIDIAN_ENV_FILE = path.join(process.cwd(), "tests", "__no_such_env__.env");
    try {
      assert.strictEqual(providers.aiConfigured(), false, "should be unconfigured");
      assert.strictEqual(providers.activeProvider(), null, "no provider when unconfigured");
      await assert.rejects(() => providers.chatJSON({ system: "x", user: "y" }), /not configured/i);
    } finally {
      if (save.b) process.env.ANTHROPIC_BASE_URL = save.b; else delete process.env.ANTHROPIC_BASE_URL;
      if (save.k) process.env.ANTHROPIC_API_KEY = save.k; else delete process.env.ANTHROPIC_API_KEY;
      if (save.f) process.env.VERIDIAN_ENV_FILE = save.f; else delete process.env.VERIDIAN_ENV_FILE;
    }
  });

  // TC-AI-06: provider failure returns a sanitized unavailable state, not a fabricated answer.
  await t("TC-AI-06 unreachable provider => sanitized unavailable (no fabrication)", async () => {
    const save = { b: process.env.ANTHROPIC_BASE_URL, k: process.env.ANTHROPIC_API_KEY, f: process.env.VERIDIAN_ENV_FILE };
    delete process.env.VERIDIAN_ENV_FILE;
    process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:9"; // closed port
    process.env.ANTHROPIC_API_KEY = "test-not-a-real-key";
    try {
      const v = await providers.validateProvider();
      assert.strictEqual(v.configured, true);
      assert.strictEqual(v.modelAccepted, false, "must not claim model accepted on failure");
      assert.ok(v.errorCategory && v.errorCategory !== null, "must report an error category, not a fake answer");
    } finally {
      if (save.b) process.env.ANTHROPIC_BASE_URL = save.b; else delete process.env.ANTHROPIC_BASE_URL;
      if (save.k) process.env.ANTHROPIC_API_KEY = save.k; else delete process.env.ANTHROPIC_API_KEY;
      if (save.f) process.env.VERIDIAN_ENV_FILE = save.f; else delete process.env.VERIDIAN_ENV_FILE;
    }
  });

  console.log(`\nAI provider tests: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
