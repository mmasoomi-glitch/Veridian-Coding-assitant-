import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import * as providers from "../ai/providers";

let failures = 0;

function logFailure(msg: string) {
  console.error(`TEST FAIL: ${msg}`);
  failures++;
}

/* helpers -------------------------------------------------------------- */
async function withEnv(updates: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const original: Record<string, string | undefined> = {};
  const keys = Object.keys(updates);
  for (const k of keys) {
    original[k] = process.env[k];
    process.env[k] = updates[k];
  }
  try {
    await fn();
  } finally {
    for (const k of keys) {
      if (original[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = original[k];
      }
    }
  }
}

function makeMockFetch(responses: any[]) {
  let callHistory: any[] = [];
  const mock = async (input: any, init?: any) => {
    const callInfo = { input, init, timestamp: Date.now() };
    callHistory.push(callInfo);
    if (responses.length === 0) {
      throw new Error(`Unexpected fetch call to ${input}`);
    }
    const response = responses.shift();
    return response;
  };
  (mock as any).callHistory = callHistory;
  return mock;
}

async function withFetchMock(responses: any[], fn: () => Promise<void>): Promise<void> {
  const mock = makeMockFetch(responses);
  const previous = global.fetch;
  global.fetch = mock as any;
  try {
    await fn();
  } finally {
    global.fetch = previous;
  }
}

/* response builders ---------------------------------------------------- */
function mockOk(body: any) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body)
  };
}
function mockError(status: number) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({})
  };
}

/* test suites ---------------------------------------------------------- */
async function testPrimaryOk() {
  await withEnv(
    {
      VERIDIAN_ENV: "test-key",
      VERIDIAN_AI_PRIMARY_MODEL: "cohere/north-mini-code:free",
      VERIDIAN_AI_FALLBACK_MODEL: "deepseek/deepseek-chat",
      VERIDIAN_AI_VERIFY: "0"
    },
    async () => {
      await withFetchMock(
        [
          mockOk({
            choices: [{ message: { content: "Hello primary" } }]
          })
        ],
        async () => {
          const result = await providers.chatJSON({
            system: "test system",
            user: "test user",
            json: false
          });
          if (result !== "Hello primary") {
            logFailure(`testPrimaryOk: expected 'Hello primary', got '${result}'`);
            return;
          }
          if ((global.fetch as any).callHistory.length !== 1) {
            logFailure(`testPrimaryOk: expected 1 fetch call, got ${(global.fetch as any).callHistory.length}`);
            return;
          }
          const first = (global.fetch as any).callHistory[0];
          if (!first.input.includes("/chat/completions")) {
            logFailure(`testPrimaryOk: first call not to openrouter endpoint`);
            return;
          }
        }
      );
    }
  );
}

async function testPrimaryThrowsThenFallback() {
  await withEnv(
    {
      VERIDIAN_ENV: "test-key",
      VERIDIAN_AI_PRIMARY_MODEL: "cohere/north-mini-code:free",
      VERIDIAN_AI_FALLBACK_MODEL: "deepseek/deepseek-chat",
      VERIDIAN_AI_VERIFY: "0"
    },
    async () => {
      await withFetchMock(
        [
          mockError(500),
          mockOk({
            choices: [{ message: { content: "Fallback success" } }]
          })
        ],
        async () => {
          let result: any;
          let thrown: any = null;
          try {
            result = await providers.chatJSON({
              system: "sys",
              user: "usr",
              json: false
            });
          } catch (e: any) {
            thrown = e;
          }
          if (thrown) {
            logFailure(`testPrimaryThrowsThenFallback: Expected success but threw ${thrown.message}`);
            return;
          }
          if (result !== "Fallback success") {
            logFailure(`testPrimaryThrowsThenFallback: expected 'Fallback success', got '${result}'`);
            return;
          }
          if ((global.fetch as any).callHistory.length !== 2) {
            logFailure(`testPrimaryThrowsThenFallback: expected 2 fetch calls, got ${(global.fetch as any).callHistory.length}`);
            return;
          }
        }
      );
    }
  );
}

async function testPrimaryEmptyThenFallback() {
  await withEnv(
    {
      VERIDIAN_ENV: "test-key",
      VERIDIAN_AI_PRIMARY_MODEL: "cohere/north-mini-code:free",
      VERIDIAN_AI_FALLBACK_MODEL: "deepseek/deepseek-chat",
      VERIDIAN_AI_VERIFY: "0"
    },
    async () => {
      await withFetchMock(
        [
          mockOk({ choices: [{ message: { content: "" } }] }),
          mockOk({
            choices: [{ message: { content: "Fallback content" } }]
          })
        ],
        async () => {
          const result = await providers.chatJSON({
            system: "sys",
            user: "usr",
            json: false
          });
          if (result !== "Fallback content") {
            logFailure(`testPrimaryEmptyThenFallback: expected 'Fallback content', got '${result}'`);
            return;
          }
          if ((global.fetch as any).callHistory.length !== 2) {
            logFailure(`testPrimaryEmptyThenFallback: expected 2 calls, got ${(global.fetch as any).callHistory.length}`);
            return;
          }
        }
      );
    }
  );
}

async function testBothFailThrows() {
  await withEnv(
    {
      VERIDIAN_ENV: "test-key",
      VERIDIAN_AI_PRIMARY_MODEL: "cohere/north-mini-code:free",
      VERIDIAN_AI_FALLBACK_MODEL: "deepseek/deepseek-chat",
      VERIDIAN_AI_VERIFY: "0"
    },
    async () => {
      await withFetchMock(
        [mockError(401), mockError(500)],
        async () => {
          let thrown: any = null;
          try {
            await providers.chatJSON({ system: "sys", user: "usr", json: false });
          } catch (e: any) {
            thrown = e;
          }
          if (!thrown) {
            logFailure(`testBothFailThrows: Expected error but succeeded`);
            return;
          }
          if (!thrown.message.startsWith("openrouter_http_")) {
            logFailure(`testBothFailThrows: error missing provider prefix: ${thrown.message}`);
            return;
          }
          if (thrown.message !== "openrouter_http_500") {
            logFailure(`testBothFailThrows: expected last error openrouter_http_500, got ${thrown.message}`);
            return;
          }
          if ((global.fetch as any).callHistory.length !== 2) {
            logFailure(`testBothFailThrows: expected 2 calls, got ${(global.fetch as any).callHistory.length}`);
            return;
          }
        }
      );
    }
  );
}

async function testVerifyOnAnthropicUsed() {
  await withEnv(
    {
      VERIDIAN_ENV: "test-key",
      VERIDIAN_AI_PRIMARY_MODEL: "cohere/north-mini-code:free",
      VERIDIAN_AI_FALLBACK_MODEL: "deepseek/deepseek-chat",
      VERIDIAN_AI_VERIFY: "1",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_MODEL: "claude-3"
    },
    async () => {
      await withFetchMock(
        [
          mockOk({
            choices: [{ message: { content: "Original answer" } }]
          }),
          mockOk({
            content: [{ type: "text", text: "Verified answer" }]
          })
        ],
        async () => {
          const result = await providers.chatJSON({
            system: "sys",
            user: "usr",
            json: false
          });
          if (result !== "Verified answer") {
            logFailure(`testVerifyOnAnthropicUsed: expected 'Verified answer', got '${result}'`);
            return;
          }
          if ((global.fetch as any).callHistory.length !== 2) {
            logFailure(`testVerifyOnAnthropicUsed: expected 2 calls, got ${(global.fetch as any).callHistory.length}`);
            return;
          }
          const second = (global.fetch as any).callHistory[1];
          const secondUrl = second.input;
          if (!secondUrl.includes("/v1/messages")) {
            logFailure(`testVerifyOnAnthropicUsed: second call not to anthropic endpoint: ${secondUrl}`);
            return;
          }
          const secondBody = second.init.body;
          let parsed: any;
          try { parsed = JSON.parse(secondBody); } catch {
            logFailure(`testVerifyOnAnthropicUsed: second call body not JSON`);
            return;
          }
          if (parsed.system !== "You verify and, if needed, correct an assistant answer. Return ONLY the final best answer.") {
            logFailure(`testVerifyOnAnthropicUsed: verification system mismatch`);
            return;
          }
          if (!Array.isArray(parsed.messages) || parsed.messages.length !== 1) {
            logFailure(`testVerifyOnAnthropicUsed: verification messages mismatch`);
            return;
          }
          const verificationUser = parsed.messages[0].content;
          const expectedUser = `usr\n\nCandidate answer:\nOriginal answer`;
          if (verificationUser !== expectedUser) {
            logFailure(`testVerifyOnAnthropicUsed: verification user mismatch. Expected "${expectedUser}", got "${verificationUser}"`);
            return;
          }
        }
      );
    }
  );
}

async function testVerifyOnAnthropicThrowsStillDeliversCandidate() {
  await withEnv(
    {
      VERIDIAN_ENV: "test-key",
      VERIDIAN_AI_PRIMARY_MODEL: "cohere/north-mini-code:free",
      VERIDIAN_AI_FALLBACK_MODEL: "deepseek/deepseek-chat",
      VERIDIAN_AI_VERIFY: "1",
      ANTHROPIC_BASE_URL: "https://api.anthropic.com",
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_MODEL: "claude-3"
    },
    async () => {
      await withFetchMock(
        [
          mockOk({ choices: [{ message: { content: "Candidate answer" } }] }),
          mockError(502) // anthropic verification error
        ],
        async () => {
          const result = await providers.chatJSON({
            system: "sys",
            user: "usr",
            json: false
          });
          if (result !== "Candidate answer") {
            logFailure(`testVerifyOnAnthropicThrowsStillDeliversCandidate: expected 'Candidate answer', got '${result}'`);
            return;
          }
          if ((global.fetch as any).callHistory.length !== 2) {
            logFailure(`testVerifyOnAnthropicThrowsStillDeliversCandidate: expected 2 calls, got ${(global.fetch as any).callHistory.length}`);
            return;
          }
          const second = (global.fetch as any).callHistory[1];
          if (!second.input.includes("/v1/messages")) {
            logFailure(`testVerifyOnAnthropicThrowsStillDeliversCandidate: second call not to anthropic endpoint`);
            return;
          }
        }
      );
    }
  );
}

/* final run ---------------------------------------------------------- */
async function runAll() {
  await testPrimaryOk();
  await testPrimaryThrowsThenFallback();
  await testPrimaryEmptyThenFallback();
  await testBothFailThrows();
  await testVerifyOnAnthropicUsed();
  await testVerifyOnAnthropicThrowsStillDeliversCandidate();

  console.log("All tests completed. Failures:", failures);
  process.exit(failures > 0 ? 1 : 0);
}

runAll().catch((e) => {
  console.error("Unexpected test runner error:", e);
  process.exit(1);
});
