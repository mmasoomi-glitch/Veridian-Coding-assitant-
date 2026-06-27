// Secret/identifier scrubber for AI-Ask context (security gate F-012).
//
// Before ANY locally-gathered context is sent to an LLM over HTTP, run it
// through sanitizeContextForLLM() so raw secrets, tokens, and private paths
// never leave the device. Pure function: no I/O, no imports, no deps.
//
// Design notes:
// - Patterns are ordered most-specific-first so a key embedded in a URL or an
//   assignment is category-tagged before the coarser URL/path rules run.
// - URL query strings are STRIPPED (not re-emitted) because they routinely
//   carry auth tokens. We keep the scheme+host+path so the context stays useful.
// - Length anchors are deliberately permissive ({20,} etc.): a false-positive
//   redaction is harmless; a missed secret is not.

interface Rule {
  re: RegExp;
  replace: string | ((m: string, ...g: string[]) => string);
}

const RULES: Rule[] = [
  // PEM private key blocks (multiline) — do this first, it's unambiguous.
  {
    re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: "[REDACTED:private-key]"
  },
  // JWTs: three base64url segments separated by dots.
  {
    re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replace: "[REDACTED:jwt]"
  },
  // Anthropic keys (sk-ant-...). Before the generic sk- rule.
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, replace: "[REDACTED:anthropic-key]" },
  // OpenRouter keys (sk-or-v1-...). Before the generic sk- rule.
  { re: /\bsk-or-v1-[A-Za-z0-9]{20,}\b/g, replace: "[REDACTED:openrouter-key]" },
  // Stripe secret keys.
  { re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g, replace: "[REDACTED:stripe-key]" },
  // Generic OpenAI-style sk- keys (catch-all after the specific sk- forms).
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, replace: "[REDACTED:api-key]" },
  // AWS access key id.
  { re: /\bAKIA[0-9A-Z]{16}\b/g, replace: "[REDACTED:aws-key]" },
  // GitHub fine-grained PAT.
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replace: "[REDACTED:github-token]" },
  // GitHub classic tokens.
  { re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g, replace: "[REDACTED:github-token]" },
  // Google API keys.
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/g, replace: "[REDACTED:google-key]" },
  // Bearer tokens in an Authorization-style context.
  { re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g, replace: "Bearer [REDACTED:bearer]" },
  // key=/token=/secret=/password=/apikey= assignments with a non-trivial value.
  {
    re: /\b(api[_-]?key|key|token|secret|password|passwd|pwd|access[_-]?token|auth)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{12,}["']?/gi,
    replace: (_m, k: string) => `${k}=[REDACTED:secret-assign]`
  },
  // URL query strings — STRIP everything after '?' (may carry tokens); keep host+path.
  {
    re: /(https?:\/\/[^\s?#"']+)(\?[^\s"']*)/gi,
    replace: (_m, base: string) => `${base}?[REDACTED:url-query]`
  },
  // Windows user-home paths — mask only the username segment.
  { re: /([A-Za-z]:\\Users\\)[^\\\/\s"']+/g, replace: (_m, p: string) => `${p}[REDACTED]` },
  // POSIX-style home paths (defensive; app is Windows-first but contexts vary).
  { re: /(\/(?:home|Users)\/)[^\/\s"']+/g, replace: (_m, p: string) => `${p}[REDACTED]` }
];

export function sanitizeContextForLLM(rawContext: string): { sanitized: string; redactedCount: number } {
  let sanitized = String(rawContext ?? "");
  let redactedCount = 0;
  for (const rule of RULES) {
    sanitized = sanitized.replace(rule.re, (...args: any[]) => {
      redactedCount++;
      if (typeof rule.replace === "function") {
        return (rule.replace as (...a: any[]) => string)(...args);
      }
      return rule.replace;
    });
  }
  return { sanitized, redactedCount };
}
