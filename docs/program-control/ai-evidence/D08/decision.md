# D08 — decision

**Outcome:** ADOPTED-WITH-FIXES. The OpenRouter draft (deepseek-chat) gave a sound skeleton
(Kahn + Tarjan) but had bugs; the final module is hand-authored from the reviewed draft.

## Bugs found in the draft and corrected
1. **topoOrder exclusion set was wrong.** Draft built `missingDeps` from
   `unknownDeps(...).flatMap(x => x.missing)` — the *missing target ids* — and excluded those,
   instead of excluding the *packages that have* an unknown dep. Final excludes the depending
   packages (and, transitively, anything depending on an unsatisfiable package).
2. **Tarjan reused a live counter.** Draft reused the `index` variable already consumed by the
   `pkgs.forEach` build loop as Tarjan's discovery counter, corrupting indices. Final uses a
   dedicated `counter` and an iterative (stack-based) Tarjan for totality on the 70-node graph.
3. **Self-loops were orderable.** Draft's readyPackages/topoOrder let a `x->x` self-loop node
   order normally. Final treats a self-loop as a cycle (excluded from topoOrder, reported by
   detectCycles).
4. **readyPackages trusted phantom ids.** Draft considered a dep satisfied if it was in `done`
   even when the dep id is unknown. Final requires every dep to be a real, done package, so a
   package with an unknown dep is never ready.

## Verification
- `npx tsc --noEmit` → exit 0.
- `npx tsx tests/d08-depgraph.test.ts` → 32/32 ok, exit 0. Covers linear chain topo order,
  ready-set computation, cycle detection (A<->B), self-loop, diamond deps, unknown-dep handling,
  and totality edge cases (empty input, duplicate ids, deduped dependents).

## Scope
Only `orchestrator/dep-graph.ts` + `tests/d08-depgraph.test.ts` + this evidence dir were
created/modified. server.ts and all other files untouched.
