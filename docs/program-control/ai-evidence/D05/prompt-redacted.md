You are helping design a small TypeScript module for a local dev-assist app.

Task: D05 — a settings/policy registry with SCOPED effective-setting resolution.

Requirements:
- Three scopes with precedence (most specific wins): global < device < project.
- Persist atomically to `orchestrator-settings.json` via an existing helper:
  `import { writeJsonAtomic } from "../lib/atomic"`.
- API surface:
  - `getEffective(key, ctx?: {device?:string; project?:string}): any`
    resolves the value by checking project target, then device target, then global, then a known default; unknown key => undefined.
  - `setSetting(scope, key, value, target?)` — target is the device id or project id for device/project scopes; global ignores target.
  - `listSettings()` — returns the full stored structure.
- Provide a few known defaults: telemetryPollMs=30000, voiceVerbosity="normal".
- NO secrets stored here.
- Load persisted file lazily/safely (missing or corrupt file => fall back to empty store, never throw on read).
- Strict TypeScript (tsconfig: ESNext modules, bundler resolution, isolatedModules).

Please propose:
1. A clean type model for the on-disk shape and the scopes.
2. The resolution algorithm for getEffective.
3. Edge cases to handle (unknown key, missing target, corrupt file, value explicitly set to undefined/null).
Keep it tight; pseudocode/TS sketch is fine.
