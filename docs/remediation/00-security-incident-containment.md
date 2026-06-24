# 00 — Security Incident Containment (sanitized)

Branch: `fix/veridian-pretest-release-gates`. No values are recorded in this document.

## Storage categories that contained secrets
- Local clipboard history store — contained secret-pattern values (provider-key-shaped).
- Local clipboard frequency-count store — contained secret-pattern values.
- AI Ask conversation history store — contained secret-pattern values (and AI Ask could echo them back on request).

(All three were **git-ignored** → never entered git history. Verified.)

## Application paths that could expose them
- `GET /api/clipboard/history` / restore — raw clipboard values were retained for "restore."
- `POST /api/ask` → context builder read the clipboard/ask stores and could send/echo secret-bearing text to the AI provider.
- `GET /api/clipboard/suggest` autocomplete drew from stored values.

## Containment actions completed
- Stopped the local dev server (poller could otherwise re-persist a secret still on the OS clipboard).
- Moved the three secret-bearing files into `quarantine/` (git-ignored), timestamped. Active stores are now absent and will regenerate empty/clean.
- Verified active project dir has **0** secret-pattern matches after quarantine.
- Removed DeepSeek from the AI runtime entirely (new `ai/providers.ts` reads only Anthropic-compatible config; the `DEEPSEEK_API_KEY` user env var is now **ignored by the app**).
- Hardened `.gitignore` (`quarantine/`, plus all data stores already ignored).

## Files quarantined locally (git-ignored, values not shown)
- `quarantine/clip-history.json.20260624.quarantine`
- `quarantine/clip-counts.json.20260624.quarantine`
- `quarantine/ask-history.json.20260624.quarantine`

## Files scrubbed
- Active `clip-history.json`, `clip-counts.json`, `ask-history.json` removed (regenerate clean).

## OPERATOR ACTION REQUIRED (cannot be done from this repo)
1. **Rotate the exposed Anthropic API key** outside this repo — it appeared in the quarantined stores and was readable by the app.
2. **Rotate / remove the `DEEPSEEK_API_KEY`** that exists as a Windows **User environment variable** on this machine (the audit observed its value). The app no longer uses it, but it remains exposed in the OS env until you remove/rotate it.
3. After rotating, shred the `quarantine/` files.

## Still required (not yet done — see remaining gates)
- Make clipboard/ask persistence store only redacted preview + non-reversible hash (Gate 3).
- Fail-closed auth on all sensitive routes (Gate 2).
- Pre-send secret scanning for AI context (Gate 4 context allowlist).
