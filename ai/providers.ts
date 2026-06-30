// Veridian AI provider — HTTP ONLY (no CLI/subprocess; no secret leakage).
// Routing: PRIMARY model (North Mini) -> silent FALLBACK (DeepSeek) on error/empty
// -> optional Opus verification (Anthropic) -> deliver. Keys never logged/returned/committed.
import fs from "node:fs";

interface Cfg {
  orKey: string;
  orModel: string;
  orBase: string;
  anthBase: string;
  anthKey: string;
  anthModel: string;
  aiPrimary: string;
  aiFallback: string;
  verify: boolean;
}

/**
 * Load configuration from environment variables and an optional .env file.
 * Reads the usual OpenRouter / Anthropic keys as well as the new primary/fallback
 * model and verification flag.
 */
function loadConfig(): Cfg {
  const env: Record<string, string> = {};

  // Seed from process.env
  const seedKeys = [
    "VERIDIAN_ENV",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "OPENROUTER_BASE_URL",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "VERIDIAN_AI_PRIMARY_MODEL",
    "OPENROUTER_PRIMARY_MODEL",
    "VERIDIAN_AI_FALLBACK_MODEL",
    "OPENROUTER_FALLBACK_MODEL",
    "VERIDIAN_AI_VERIFY"
  ];

  for (const k of seedKeys) {
    if (process.env[k]) env[k] = String(process.env[k]);
  }

  // Optionally load extra keys from a file
  const envFile = process.env.VERIDIAN_ENV_FILE;
  if (envFile && fs.existsSync(envFile)) {
    try {
      for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        const v = m[2].trim().replace(/^["']|["']$/g, "");
        if (env[k] === undefined && v) env[k] = v;
      }
    } catch {
      /* keep what we have */
    }
  }

  return {
    orKey: env.VERIDIAN_ENV || env.OPENROUTER_API_KEY || "",
    orModel: env.OPENROUTER_MODEL || "deepseek/deepseek-chat",
    orBase: (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    anthBase: (env.ANTHROPIC_BASE_URL || "").replace(/\/+$/, ""),
    anthKey: env.ANTHROPIC_API_KEY || "",
    anthModel: env.ANTHROPIC_MODEL || "claude-opus-4-8",
    aiPrimary: env.VERIDIAN_AI_PRIMARY_MODEL ||
               env.OPENROUTER_PRIMARY_MODEL ||
               env.OPENROUTER_MODEL ||
               "cohere/north-mini-code:free",
    aiFallback: env.VERIDIAN_AI_FALLBACK_MODEL ||
                env.OPENROUTER_FALLBACK_MODEL ||
                "deepseek/deepseek-chat",
    verify: env.VERIDIAN_AI_VERIFY === "1"
  };
}

export function activeProvider(): "openrouter" | "anthropic" | null {
  const c = loadConfig();
  if (c.orKey) return "openrouter";
  if (c.anthBase && c.anthKey) return "anthropic";
  return null;
}
export function aiConfigured(): boolean {
  return activeProvider() !== null;
}

interface ChatOpts { system: string; user: string; json?: boolean; temperature?: number; maxTokens?: number; }

function extractJson(text: string): string {
  const s = text.indexOf("{");
  const a = text.indexOf("[");
  const start = s < 0 ? a : a < 0 ? s : Math.min(s, a);
  if (start < 0) return text;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

/* ---------- internal provider calls ---------- */

async function orCall(model: string, system: string, user: string, maxTokens: number, temperature: number): Promise<string> {
  const c = loadConfig();
  const res = await fetch(`${c.orBase}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${c.orKey}`,
      "x-title": "Veridian"
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });
  if (!res.ok) throw new Error(`openrouter_http_${res.status}`);
  const data: any = await res.json();
  return String(data?.choices?.[0]?.message?.content ?? "");
}

async function anthCall(system: string, user: string, maxTokens: number, temperature: number): Promise<string> {
  const c = loadConfig();
  const res = await fetch(`${c.anthBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": c.anthKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: c.anthModel,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!res.ok) throw new Error(`anthropic_http_${res.status}`);
  const data: any = await res.json();
  const block = Array.isArray(data?.content) ? data.content.find((b: any) => b.type === "text") : null;
  return String(block?.text ?? "");
}

/* ---------- core LLM dispatcher ---------- */

async function callLLM(system: string, user: string, maxTokens: number, temperature: number): Promise<string> {
  const c = loadConfig();
  const provider = activeProvider();
  if (!provider) {
    throw new Error(
      "AI is not configured. Set VERIDIAN_ENV (OpenRouter) or ANTHROPIC_BASE_URL+ANTHROPIC_API_KEY."
    );
  }

  if (provider === "openrouter") {
    let candidate: string | null = null;
    let lastError: any = null;

    // Try primary model, then silently fall back to the fallback model
    for (const model of [c.aiPrimary, c.aiFallback]) {
      try {
        const result = await orCall(model, system, user, maxTokens, temperature);
        if (result && result.trim().length > 0) {
          candidate = result;
          break;
        } else {
          // Empty or whitespace result – treat as a failure and try fallback
          lastError = new Error("empty_response");
          continue;
        }
      } catch (e: any) {
        lastError = e;
        continue;
      }
    }

    if (candidate === null) {
      // Both attempts failed or returned empty
      throw lastError || new Error("both_primary_and_fallback_failed");
    }

    // Optional verification using Anthropic, if credentials are present
    if (c.verify && c.anthBase && c.anthKey) {
      try {
        const verificationSystem = "You verify and, if needed, correct an assistant answer. Return ONLY the final best answer.";
        const verificationUser = `${user}\n\nCandidate answer:\n${candidate}`;
        const verified = await anthCall(verificationSystem, verificationUser, maxTokens, temperature);
        if (verified && verified.trim().length > 0) {
          return verified;
        } else {
          return candidate;
        }
      } catch (e: any) {
        // Verification error – silently fall back to the candidate
        return candidate;
      }
    }

    return candidate;
  } else if (provider === "anthropic") {
    // Direct Anthropic path – no fallback or verification (maintains prior behavior)
    return await anthCall(system, user, maxTokens, temperature);
  } else {
    // Defensive – should never be reached because activeProvider returns null when not configured
    throw new Error("AI provider not recognized.");
  }
}

export async function chatJSON(opts: ChatOpts): Promise<any> {
  const text = await callLLM(
    opts.system,
    opts.json ? `${opts.user}\n\nRespond with ONLY valid JSON. No prose, no code fences.` : opts.user,
    opts.maxTokens ?? 1024,
    opts.temperature ?? 0.3
  );
  return opts.json ? JSON.parse(extractJson(text)) : text;
}

export async function validateProvider(): Promise<{
  provider: string | null;
  configured: boolean;
  reachable: boolean;
  modelAccepted: boolean;
  errorCategory: string | null;
  checkedAt: string;
}> {
  const provider = activeProvider();
  const checkedAt = new Date().toISOString();
  if (!provider) {
    return {
      provider: null,
      configured: false,
      reachable: false,
      modelAccepted: false,
      errorCategory: "not_configured",
      checkedAt
    };
  }

  try {
    const out = await callLLM(
      "You are a connectivity probe.",
      "Reply with the single token: OK",
      16,
      0
    );
    return {
      provider,
      configured: true,
      reachable: true,
      modelAccepted: out.length > 0,
      errorCategory: null,
      checkedAt
    };
  } catch (e: any) {
    const msg = String(e?.message || "");
    const cat = /_http_(401|403)/.test(msg)
      ? "auth"
      : /_http_(404|400)/.test(msg)
        ? "model_or_endpoint"
        : /_http_/.test(msg)
          ? "http_error"
          : "unreachable";
    return {
      provider,
      configured: true,
      reachable: cat !== "unreachable",
      modelAccepted: false,
      errorCategory: cat,
      checkedAt
    };
  }
}
