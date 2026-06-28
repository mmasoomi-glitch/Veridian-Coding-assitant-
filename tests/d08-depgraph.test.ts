// D08 — work-package dependency graph verification. Run: npx tsx tests/d08-depgraph.test.ts
import {
  type Pkg,
  topoOrder,
  detectCycles,
  readyPackages,
  unknownDeps,
  dependentsOf,
} from "../orchestrator/dep-graph";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ---- linear chain: a -> b -> c -> d (deps point at predecessor) ----
const chain: Pkg[] = [
  { id: "d", deps: ["c"] },
  { id: "c", deps: ["b"] },
  { id: "b", deps: ["a"] },
  { id: "a", deps: [] },
];
ok("linear chain topo order", eq(topoOrder(chain), ["a", "b", "c", "d"]));
ok("linear chain has no cycles", eq(detectCycles(chain), []));
ok("linear chain has no unknown deps", eq(unknownDeps(chain), []));

// ---- ready-set computation ----
ok("ready: only root with nothing done", eq(readyPackages(chain, new Set()), ["a"]));
ok("ready: b unlocks after a done", eq(readyPackages(chain, new Set(["a"])), ["b"]));
ok("ready: nothing left when all done", eq(readyPackages(chain, new Set(["a", "b", "c", "d"])), []));
ok("ready: done pkg never re-listed", !readyPackages(chain, new Set(["a"])).includes("a"));

// ---- cycle detection: A -> B -> A ----
const twoCycle: Pkg[] = [
  { id: "A", deps: ["B"] },
  { id: "B", deps: ["A"] },
];
const c2 = detectCycles(twoCycle);
ok("cycle A<->B detected (1 component)", c2.length === 1);
ok("cycle A<->B contains both", c2.length === 1 && eq([...c2[0]].sort(), ["A", "B"]));
ok("cyclic nodes excluded from topoOrder", eq(topoOrder(twoCycle), []));

// ---- self-loop ----
const selfLoop: Pkg[] = [{ id: "x", deps: ["x"] }];
ok("self-loop detected as a cycle", eq(detectCycles(selfLoop), [["x"]]));
ok("self-loop excluded from topoOrder", eq(topoOrder(selfLoop), []));

// ---- diamond deps: a -> b, a -> c, b -> d, c -> d ----
const diamond: Pkg[] = [
  { id: "a", deps: [] },
  { id: "b", deps: ["a"] },
  { id: "c", deps: ["a"] },
  { id: "d", deps: ["b", "c"] },
];
const dorder = topoOrder(diamond);
ok("diamond: all four ordered", dorder.length === 4);
ok("diamond: a before b/c/d", dorder.indexOf("a") < dorder.indexOf("b") && dorder.indexOf("a") < dorder.indexOf("d"));
ok("diamond: b and c before d", dorder.indexOf("b") < dorder.indexOf("d") && dorder.indexOf("c") < dorder.indexOf("d"));
ok("diamond: deterministic (b before c by input order)", dorder.indexOf("b") < dorder.indexOf("c"));
ok("diamond: no cycles", eq(detectCycles(diamond), []));
ok("diamond: dependents of a are b,c", eq(dependentsOf(diamond, "a"), ["b", "c"]));
ok("diamond: dependents of d are none", eq(dependentsOf(diamond, "d"), []));
ok("diamond: a ready first, then b,c after a", eq(readyPackages(diamond, new Set(["a"])), ["b", "c"]));

// ---- unknown-dep handling: p depends on a ghost id ----
const unknown: Pkg[] = [
  { id: "p", deps: ["ghost"] },
  { id: "q", deps: ["p"] },
  { id: "r", deps: [] },
];
ok("unknown dep reported", eq(unknownDeps(unknown), [{ id: "p", missing: ["ghost"] }]));
ok("unknown-dep pkg excluded from topoOrder", !topoOrder(unknown).includes("p"));
ok("only satisfiable r is orderable (p unsat, q blocked by p)", eq(topoOrder(unknown), ["r"]));
ok("unknown-dep pkg never ready", !readyPackages(unknown, new Set(["ghost"])).includes("p"));
ok("r is ready (no deps)", readyPackages(unknown, new Set()).includes("r"));

// ---- totality / edge cases ----
ok("empty input: topoOrder []", eq(topoOrder([]), []));
ok("empty input: detectCycles []", eq(detectCycles([]), []));
ok("empty input: readyPackages []", eq(readyPackages([], new Set()), []));
ok("empty input: unknownDeps []", eq(unknownDeps([]), []));
ok("empty input: dependentsOf []", eq(dependentsOf([], "z"), []));
const dups: Pkg[] = [{ id: "a", deps: [] }, { id: "a", deps: ["b"] }, { id: "b", deps: [] }];
ok("duplicate ids tolerated (first wins, no throw)", eq(topoOrder(dups).sort(), ["a", "b"]));
ok("dependentsOf deduped", eq(dependentsOf([{ id: "x", deps: ["y", "y"] }, { id: "x", deps: ["y"] }], "y"), ["x"]));

if (fail) { console.error(`\nd08-depgraph: ${fail} FAILED`); process.exit(1); }
console.log("\nd08-depgraph: linear chain + ready-set + cycle (A<->B) + self-loop + diamond + unknown-dep + totality verified");
