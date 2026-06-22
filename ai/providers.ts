// Unified LLM provider.
//   - "claude": uses the LOCAL Claude Code CLI (your Max plan → Opus, big
//     context, no marginal API cost). Enable with AI_PROVIDER=claude.
//   - "openai": the API "hard brain" when OPENAI_API_KEY is set.
//   - "deepseek": fallback so everything keeps working today.
import { spawn } from "node:child_process";

interface ChatOpts {
  system: string;
  user: string;
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
}

function pickProvider(): "claude" | "openai" | "deepseek" | null {
  const forced = (process.env.AI_PROVIDER || "").toLowerCase();
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;
  if (forced === "claude") return "claude"; // local CLI; assumed logged in (Max)
  if (forced === "openai" && hasOpenAI) return "openai";
  if (forced === "deepseek" && hasDeepSeek) return "deepseek";
  if (hasOpenAI) return "openai";
  if (hasDeepSeek) return "deepseek";
  return null;
}

export function activeProvider(): string | null {
  return pickProvider();
}

// Pull the first balanced JSON object/array out of a string (Claude may wrap it).
function extractJson(text: string): string {
  const s = text.indexOf("{");
  const a = text.indexOf("[");
  const start = s < 0 ? a : a < 0 ? s : Math.min(s, a);
  if (start < 0) return text;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

// Run the local Claude Code CLI headless, prompt via stdin (avoids shell quoting).
function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const bin = process.env.CLAUDE_BIN || "claude";
    const model = process.env.CLAUDE_MODEL || "opus";
    const args = ["-p", "--output-format", "json", "--model", model];
    const child = spawn(bin, args, { shell: process.platform === "win32", windowsHide: true });
    let out = "", errOut = "";
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (errOut += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude exited ${code}: ${errOut.slice(0, 200)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function chatJSON(opts: ChatOpts): Promise<any> {
  const provider = pickProvider();
  if (!provider) {
    throw new Error("No AI provider configured. Set AI_PROVIDER=claude, or OPENAI_API_KEY / DEEPSEEK_API_KEY.");
  }

  if (provider === "claude") {
    const prompt = `${opts.system}\n\n${opts.user}\n\n${opts.json ? "Respond with ONLY valid JSON. No prose, no code fences." : ""}`;
    const raw = await runClaude(prompt);
    let resultText = raw;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const r = [...parsed].reverse().find((m: any) => m.type === "result");
        resultText = (r?.result ?? parsed[parsed.length - 1]?.result ?? raw);
      } else {
        resultText = parsed.result ?? parsed.content ?? raw;
      }
    } catch { /* not JSON; use raw */ }
    return opts.json ? JSON.parse(extractJson(String(resultText))) : String(resultText);
  }

  const cfg = provider === "openai"
    ? {
        url: (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1") + "/chat/completions",
        key: process.env.OPENAI_API_KEY as string,
        model: process.env.OPENAI_MODEL || "gpt-4o-mini"
      }
    : {
        url: (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com") + "/chat/completions",
        key: process.env.DEEPSEEK_API_KEY as string,
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat"
      };

  const body: any = {
    model: cfg.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user }
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 1024
  };
  if (opts.json) body.response_format = { type: "json_object" };

  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${cfg.key}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${provider} API ${res.status}: ${t.slice(0, 300)}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content || (opts.json ? "{}" : "");
  return opts.json ? JSON.parse(content) : content;
}
