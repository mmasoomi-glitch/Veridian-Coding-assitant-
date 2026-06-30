# Definition Pack — FIX-TELEMETRY-PARSE

**Package id:** FIX-TELEMETRY-PARSE
**Owner (writer):** Big-LLM author (`cohere/north-mini-code:free`) → Opus gate → controlled apply (Sonnet/Haiku)
**Blast radius:** L1 (single server function + new pure module + test; no auth/route/secret/git change)
**Skill route:** veridian-debug (this pack) → veridian-develop (bundle → gates → apply → F11)
**Status:** READY FOR veridian-develop

## Business purpose
This is the **#1 product blocker**. `/api/telemetry/current` and `/api/context/current`
(VC02 — the first assistant feature) currently fail because the telemetry collector's JSON
parse is brittle. Until it is fixed and **positive** telemetry is proven, "where was I,"
One Next Step, live agent truth, and the mobile command-center cannot be treated as
functional.

## Confirmed root cause (file:line)
`server.ts:308–325`, function `collectTelemetry()`. The parse at **`server.ts:318`** is a
bare:
```ts
resolve(JSON.parse(stdout.trim()));
```
`.trim()` removes only ASCII whitespace — **not a UTF-8 BOM** (`﻿`) and not stray
lines. Any of: BOM prefix, leading/trailing non-JSON text, PowerShell error text on stdout,
empty/whitespace-only stdout, or truncated JSON → `JSON.parse` throws → the promise rejects
→ both routes return HTTP 500:
- `/api/telemetry/current` (server.ts ~430–441) → 500 "Telemetry collection failed."
- `/api/context/current` (server.ts ~443–454) → 500 "context unavailable" (calls the same
  `collectTelemetry()`; dies identically — this is the VC02 block).

The collector `telemetry/collect.ps1` itself emits valid JSON (`ConvertTo-Json -Compress`
at ~line 203). On the current machine the happy path is BOM-free, so the bug is **latent
fragility**, not a deterministic crash — it triggers under different PowerShell hosts,
transient `Add-Type`/UI-Automation errors, timeouts, or BOM-emitting redirection. The repo
already contains the correct tolerant pattern: `extractJson` at `ai/providers.ts:49–55`
(first `{`/`[` … last `}`/`]`) and a soft-fallback precedent at `server.ts:573`
(`/api/desktop/switch`: `try {...} catch { result = { raw: stdout } }`).

## Required outcome
1. Extract the parse into a **pure, importable, never-throwing** function — recommended new
   file `telemetry/parse.ts` exporting `parseTelemetry(stdout: string): RawTelemetry` and an
   `unavailableTelemetry()` sentinel builder. (Extraction is required so it is unit-testable
   without spawning PowerShell.)
2. `parseTelemetry` must: strip a leading UTF-8 BOM (`replace(/^﻿/, "")`), trim, return
   the `unavailableTelemetry()` sentinel on empty/whitespace-only input, slice to the JSON
   envelope (reuse/export `extractJson` from `ai/providers.ts` rather than duplicate),
   `JSON.parse` inside try/catch, reject non-object/array results to the sentinel, and
   **never throw**.
3. Wire `collectTelemetry()` (server.ts:308–325) to use `parseTelemetry` and resolve the
   sentinel instead of rejecting on a parse problem. Keep the existing
   `if (err) return reject(err)` for genuine spawn/timeout failure only.
4. `shapeTelemetry()` already coerces every field (`|| "unknown"`, `Array.isArray? :[]`), so
   the sentinel flows through and `/api/context/current` stops 500-ing on parse — it returns
   an honest all-unknown snapshot (matching the project's "honest unknown, never fake" rule).

## Telemetry JSON contract (13 keys, producer = collect.ps1)
`collectedAt`(ISO str), `activeApp`(str,"unknown"), `windowTitle`(str,""; **Unicode allowed**),
`workspacePath`(str,""), `gitRepo`(str,""), `gitBranch`(str,""), `latestCommit`(str,""),
`modifiedFiles`(str[]), `clipboard`(str,""; redacted downstream), `recentCommands`(str[]),
`virtualDesktop`(str,"unknown"), `browserTitle`(str,"unknown"), `browserUrl`(str,"unknown").
Every field optional/defensive at the parser layer. `clipboardIsSecret` is derived later in
`shapeTelemetry`, NOT part of raw telemetry.

## Fail-soft sentinel (raw)
```jsonc
{ "collectedAt":"<now ISO>","activeApp":"unknown","windowTitle":"","workspacePath":"",
  "gitRepo":"","gitBranch":"","latestCommit":"","modifiedFiles":[],"clipboard":"",
  "recentCommands":[],"virtualDesktop":"unknown","browserTitle":"unknown",
  "browserUrl":"unknown","_telemetryError":"parse-failure" }
```

## Acceptance tests — new `tests/telemetry-parse.test.ts` (tsx, mc01-style counting harness)
For each: **return a value OR the sentinel; NEVER throw / NEVER 500.**
1. BOM prefix `﻿{...}` → recover, fields intact (today throws).
2. CRLF around JSON → recover.
3. Unicode windowTitle (emoji / non-Latin / CJK) → recover, round-trips equal.
4. Stray leading text before `{` → recover (envelope slice).
5. Trailing text after `}` → recover.
6. Two JSON objects → defined: first balanced object OR sentinel; never throw.
7. Empty stdout `""` → sentinel.
8. Whitespace-only → sentinel.
9. PowerShell error text, no JSON → sentinel (must NOT surface raw error text as value).
10. Truncated/malformed JSON → sentinel.
11. Valid JSON missing fields → parse ok; downstream fills sentinels; `unknowns[]` lists them.
12. Valid JSON wrong types (`modifiedFiles:"oops"`) → shapeTelemetry coerces to `[]`.
13. Top-level array → sentinel (collector never emits an array).
Plus: `npx tsc --noEmit` clean; `/api/telemetry/current` returns 200 with a real object on a
clean run; `/api/context/current` returns 200 (not 500) even when the collector yields garbage.

## Runtime proof required (positive path — the whole point)
- POSITIVE: with the live collector returning real JSON, `GET /api/telemetry/current` → 200
  with real `activeApp`/`gitRepo`; `GET /api/context/current` → 200 with a populated snapshot
  (brief/risk/recent), captured to `docs/program-control/browser-evidence/VC02/`.
- NEGATIVE: with forced garbage stdout, both routes → 200 honest-unavailable (no 500, no throw).
**VC02 stays BLOCKED until the POSITIVE path is proven** (per FIX-TRUTH-LABEL-01 + F11).

## Files the writer may touch
`telemetry/parse.ts` (new), `server.ts` (collectTelemetry 308–325 only),
`ai/providers.ts` (export `extractJson` for reuse — optional), `tests/telemetry-parse.test.ts`
(new). **Must NOT** replace `server.ts` with a skeleton or touch any other route. No
`git add -A` — safe-stage only.

## Hard stops
No change to auth, bind, routing, secrets, vault, or git behavior. Read-only git. F11
Applied-Code Reality Check is mandatory before commit; commit only on PASS / PASS WITH RELABEL.
