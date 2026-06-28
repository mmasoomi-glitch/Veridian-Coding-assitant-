# AI Evidence Ledger

One folder per task: `docs/program-control/ai-evidence/<task-id>/` containing
`request-manifest.json`, `prompt-redacted.md`, `response-redacted.md`, `response-hash.txt`,
`decision.md`, `execution-summary.md`, `test-result.md`, `review-result.md`.

## HARD RULES
- NEVER store raw .env values, passwords, private keys, TOTP secrets, customer PII, payment
  details, or decrypted vault records.
- Scan BOTH prompt and response for secrets/PII before writing. On suspected secret:
  quarantine, store metadata + hash only, do not commit, do not show in UI.
- Git holds redacted metadata only. Full approved evidence (if ever needed) goes to the
  encrypted vault, not Git.
- Every recommendation traces to its work package + final decision.

Raw/unredacted captures must never be committed — see .gitignore (`ai-evidence/**/raw*`).
