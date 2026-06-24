// Veridian AI provider — ANTHROPIC-COMPATIBLE ONLY.
// No DeepSeek / OpenAI / Gemini / local-model / Claude-CLI fallback (remediation F-001).
// Config is read from process.env, or from a local env file pointed to by
// VERIDIAN_ENV_FILE. Keys are never logged, returned, or committed.
import fs from "node:fs";

interface AnthropicConfig { baseUrl: string; apiKey: string; model: string; }

function loadConfig(): AnthropicConfig {
  let baseUrl = process.env.ANTHROPIC_BASE_URL || "";
  let apiKey = process.env.ANTHROPIC_API_KEY || "";
  let model = process.env.ANTHROPIC_MODEL || "";
  const envFile = process.env.VERIDIAN_ENV_FILE;
  if ((!baseUrl || !apiKey || !model) && envFile && fs.existsSync(envFile)) {
    try {
      for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        const k = m[1];
        const v = m[2].trim().replace(/^["']|["']$/g, "");
        if (k === "ANTHROPIC_BASE_URL" && !baseUrl) baseUrl = v;
        if (k === "ANTHROPIC_API_KEY" && !apiKey) apiKey = v;
        if (k === "ANTHROPIC_MODEL" && !model) model = v;
      }
    } catch { /* keep whatever we have */ }
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model: model || "claude-opus-4-8" };
}

export function aiConfigured(): boolean {
  const c = loadConfig();
  return !!(c.baseUrl && c.apiKey);
}

// Kept for back-compat with existing route checks: returns the provider name or null.
export function activeProvider(): string | null {
  return aiConfigured() ? "anthropic" : null;
}

interface ChatOpts { system: string; user: string; json?: boolean; temperature?: number; maxTokens?: number; }

function extractJson(text: string): string {
  const s = text.indexOf("{"); const a = text.indexOf("[");
  const start = s < 0 ? a : a < 0 ? s : Math.min(s, a);
  if (start < 0) return text;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

async function callAnthropic(system: string, user: string, maxTokens: number, temperature: number): Promise<string> {
  const cfg = loadConfig();
  if (!cfg.baseUrl || !cfg.apiKey) {
    throw new Error("AI is not configured. Set ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY (via VERIDIAN_ENV_FILE).");
  }
  const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cfg.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  if (!res.ok) {
    // Never echo the provider error body (may contain sensitive context). Category only.
    throw new Error(`anthropic_http_${res.status}`);
  }
  const data: any = await res.json();
  const block = Array.isArray(data?.content) ? data.content.find((b: any) => b.type === "text") : null;
  return String(block?.text ?? "");
}

export async function chatJSON(opts: ChatOpts): Promise<any> {
  const text = await callAnthropic(
    opts.system,
    opts.json ? `${opts.user}\n\nRespond with ONLY valid JSON. No prose, no code fences.` : opts.user,
    opts.maxTokens ?? 1024,
    opts.temperature ?? 0.3
  );
  return opts.json ? JSON.parse(extractJson(text)) : text;
}

// Safe synthetic validation — sends NO personal/business/clipboard/repo content.
// Returns sanitized status only.
export async function validateProvider(): Promise<{
  configured: boolean; reachable: boolean; modelAccepted: boolean; errorCategory: string | null; checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  if (!aiConfigured()) return { configured: false, reachable: false, modelAccepted: false, errorCategory: "not_configured", checkedAt };
  try {
    const out = await callAnthropic("You are a connectivity probe.", "Reply with the single token: OK", 16, 0);
    return { configured: true, reachable: true, modelAccepted: out.length > 0, errorCategory: null, checkedAt };
  } catch (e: any) {
    const msg = String(e?.message || "");
    const cat = msg.includes("anthropic_http_401") || msg.includes("anthropic_http_403") ? "auth"
      : msg.includes("anthropic_http_404") || msg.includes("model") ? "model_or_endpoint"
      : msg.includes("anthropic_http_") ? "http_error"
      : "unreachable";
    return { configured: true, reachable: cat !== "unreachable", modelAccepted: false, errorCategory: cat, checkedAt };
  }
}
