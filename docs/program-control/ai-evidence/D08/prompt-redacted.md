# D08 — dep-graph draft prompt (redacted)

Provider: OpenRouter (key `VERIDIAN_ENV`, never printed). Model: `deepseek/deepseek-chat`.
No secrets / PII / paths sent — pure algorithm spec only.

## Prompt

```
Return ONLY TypeScript, no prose, no code fences. Write a PURE module (no imports, no I/O)
for a Veridian work-package dependency graph. Exact API:

export type Pkg = { id: string; deps: string[] };
export function topoOrder(pkgs: Pkg[]): string[];        // Kahn's algorithm, stable order
export function detectCycles(pkgs: Pkg[]): string[][];   // each cycle as an ordered id list
export function readyPackages(pkgs: Pkg[], done: Set<string>): string[]; // all deps in done, not already done
export function unknownDeps(pkgs: Pkg[]): { id: string; missing: string[] }[]; // deps referencing ids not in the package set
export function dependentsOf(pkgs: Pkg[], id: string): string[]; // ids that directly depend on `id`

Requirements:
- TOTAL functions: never throw, handle empty input, duplicate ids, self-loops, and missing deps gracefully.
- Treat an unknown dep (a dep id not present in pkgs) as UNSATISFIABLE: such a package can never be ready and is excluded from a complete topoOrder; report it via unknownDeps.
- topoOrder returns only the packages that CAN be ordered (no cycle, no unknown dep). Deterministic: break ties by input order.
- detectCycles returns the strongly-connected components of size>1 plus self-loops; empty array when acyclic.
- readyPackages: a pkg is ready if it is not in done AND every dep is in done. (A pkg with an unknown dep is never ready.)
- dependentsOf: direct dependents only, in input order, deduped.
Keep it small, clean, well-commented.
```
