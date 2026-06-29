# model-evidence/

Route-proof artifacts for the DeepSeek gateway (separate from per-package code evidence in
`../ai-evidence/<package-id>/`). Each gateway run records a `model-route-manifest.json`
(provider, configured model, returned model, approved prefix, timestamp, response hash,
redaction status). RAW model output never lives here or in git — it goes to the git-ignored
private artifact dir (`VERIDIAN_AI_PRIVATE_ARTIFACT_DIR`, default `.ai-private/`). Never store
secrets, vault content, clipboard, OTP, credentials, or PII.
