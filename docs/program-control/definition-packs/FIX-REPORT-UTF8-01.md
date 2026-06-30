# Definition Pack — FIX-REPORT-UTF8-01

**Package id:** FIX-REPORT-UTF8-01
**Owner (writer):** Big-LLM author → Opus gate → controlled apply
**Blast radius:** L0 (dev/evidence Python scripts + tests; no app/runtime/auth change)
**File scope:** `scripts/ai/*.py` — **disjoint from FIX-TELEMETRY-PARSE** (may run in parallel)
**Status:** READY FOR veridian-develop

## Business purpose
The pipeline-assessment and Big-LLM bundle scripts are the project's honesty/evidence layer:
they write a report file **and** their console exit code is consumed as the pass/fail signal.
A console-encoding crash makes a successful assessment look failed (exit 1 despite a written
file), and risks a written file being mistaken for success. Both undermine truthful labels.

## Confirmed defect trace (file:line)
- **Primary crash:** `scripts/ai/assess_reports.py:44` — `print(out)`. The file write at
  line 42 succeeds (`encoding="utf-8"`), then `print(out)` sends model content containing
  U+2011 (non-breaking hyphen), U+2018/2019/201C/201D (smart quotes), U+2014 (em dash) to a
  Windows **cp1252** console → `UnicodeEncodeError` → **exit=1 after the report was already
  written**.
- Same file `:21` — `print(f"REDACTION_ABORT: ... — not sending", file=sys.stderr)` contains
  a literal em dash → would itself crash on the redaction path.
- Shared hazard `scripts/ai/openrouter_bigllm_bundle.py:197` — `print(f"REDACTION_ABORT: ...
  — not sending", ...)` literal em dash; `:251/:254` echo `{e}` (may be non-ASCII).
  (`:245/:247/:249` `json.dumps` default `ensure_ascii=True` → safe.)
- `test_bigllm_gateway.py:12` — prints test names; ASCII today, unprotected.
- No `reconfigure` / `PYTHONUTF8` mitigation exists anywhere in these scripts (confirmed).

## Recommended minimal fix (no new dependencies)
At the top of each entry-point script, after imports and before any I/O:
```python
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass  # pre-3.7 / already-wrapped / detached stream — non-fatal
```
`errors="replace"` guarantees a print can never raise (worst case `?` substitution). This is
stdlib, Python 3.7+, dependency-free — preferred over `io.TextIOWrapper` (more code) and over
`PYTHONUTF8`/`PYTHONIOENCODING` (environment-dependent; document those only as a runbook note).

## Required outcome
1. `sys.stdout`/`sys.stderr` are UTF-8-safe on Windows for these scripts — no `print` of
   model/exception content can raise an encoding error.
2. A **successful** report generation **exits 0** AND leaves the report file written.
3. A **failed output path** (model/route blocked, redaction abort, returned-model mismatch,
   write failure) **exits non-zero** (preserve existing codes 2/4/5/6) AND a
   written-but-unverified file cannot be read as success.
4. Evidence records the **command exit code SEPARATELY** from report-file existence — both
   must be checked; neither alone proves success.
5. (Consistency, optional) `assess_reports.py:36` hash uses `content.encode("utf-8")` to match
   the gateway's UTF-8 hashing.

## Acceptance tests (add to `scripts/ai/test_bigllm_gateway.py` or a sibling)
- A1: assessment content with `‑ ‘ ’ “ ” —` under a simulated cp1252 stdout → process exits
  **0**, report file exists and contains the Unicode intact (UTF-8, lossless).
- A2: force redaction-abort (line 21, literal em dash) → prints without crashing, exits **4**.
- A3: no-key → exits **2**; returned-model mismatch → non-zero; simulated write failure →
  non-zero. In every failure case the run is NOT counted success even if a partial file exists.
- A4 (gateway): trigger `openrouter_bigllm_bundle.py` redaction-abort (`:197`) under cp1252
  stderr → prints cleanly, exits **4**; `--verify-route`/`--preflight` JSON still emits, exit 0.
- A5: harness captures `subprocess.run(...).returncode` AND file-existence independently and
  asserts BOTH (success ⇒ returncode==0 AND file present; never infer success from file alone).

## Files the writer may touch
`scripts/ai/assess_reports.py`, `scripts/ai/openrouter_bigllm_bundle.py`,
`scripts/ai/test_bigllm_gateway.py` (+ optional runbook note). Do NOT touch
`openrouter_deepseek_bundle.py` unless ownership is explicitly transferred (it shares the
hazard at `:146` but is out of scope).

## Hard stops
No app/runtime/auth change. F11 mandatory before commit. Run shows exit 0 on success before
the commit is authorized.
