// D08 — Work-package dependency graph (PURE, no I/O, no imports).
//
// Drafted via OpenRouter (deepseek-chat, see docs/program-control/ai-evidence/D08/),
// then reviewed and corrected. Two bugs in the draft were fixed here:
//   1. topoOrder excluded the *missing dep ids* instead of the packages that HAVE an
//      unknown dep (it called unknownDeps(...).missing rather than .id).
//   2. The Tarjan SCC routine reused the same `index` variable already consumed by the
//      enclosing build loop, corrupting discovery indices.
//
// Every function is TOTAL: never throws, tolerates empty input, duplicate ids, self-loops,
// and missing deps. An "unknown dep" (a dep id not present in the package set) is treated as
// UNSATISFIABLE — such a package can never be ready and is excluded from topoOrder; it is
// reported via unknownDeps().

export type Pkg = { id: string; deps: string[] };

/** First package wins on duplicate ids; deps coerced to a clean string[]. */
function indexById(pkgs: Pkg[]): Map<string, Pkg> {
  const m = new Map<string, Pkg>();
  for (const p of pkgs) {
    if (!p || typeof p.id !== "string") continue;
    if (!m.has(p.id)) m.set(p.id, { id: p.id, deps: Array.isArray(p.deps) ? p.deps.filter((d) => typeof d === "string") : [] });
  }
  return m;
}

/** Packages whose deps reference ids that do not exist in the set. */
export function unknownDeps(pkgs: Pkg[]): { id: string; missing: string[] }[] {
  const byId = indexById(pkgs);
  const out: { id: string; missing: string[] }[] = [];
  for (const p of byId.values()) {
    const missing = Array.from(new Set(p.deps.filter((d) => !byId.has(d))));
    if (missing.length) out.push({ id: p.id, missing });
  }
  return out;
}

/**
 * Kahn's algorithm. Returns a topological ordering of the packages that CAN be ordered:
 * packages with an unknown (unsatisfiable) dep are dropped, and any package caught in a
 * cycle remains with positive in-degree and is therefore naturally excluded. Deterministic:
 * ties are broken by input order.
 */
export function topoOrder(pkgs: Pkg[]): string[] {
  const byId = indexById(pkgs);
  // Packages that have at least one unknown dep are unsatisfiable, AND so is anything that
  // (transitively) depends on them — they can never become ready, so they are not orderable.
  // (Fix #1: exclude the depending packages, not the missing target ids.)
  const unsatisfiable = new Set(unknownDeps(pkgs).map((u) => u.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of byId.values()) {
      if (unsatisfiable.has(p.id)) continue;
      if (p.deps.some((d) => unsatisfiable.has(d))) { unsatisfiable.add(p.id); grew = true; }
    }
  }

  const order = Array.from(byId.keys()).filter((id) => !unsatisfiable.has(id));
  const eligible = new Set(order);

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep -> packages depending on it
  for (const id of order) inDegree.set(id, 0);

  for (const id of order) {
    // A self-loop is a cycle; such a package can never be ordered. Give it a permanent
    // positive in-degree so Kahn's algorithm naturally drops it.
    if (byId.get(id)!.deps.includes(id)) { inDegree.set(id, (inDegree.get(id) || 0) + 1); }
    for (const dep of byId.get(id)!.deps) {
      if (dep === id) continue; // self-loop already accounted for above
      if (!eligible.has(dep)) continue;
      inDegree.set(id, (inDegree.get(id) || 0) + 1);
      (dependents.get(dep) || dependents.set(dep, []).get(dep)!).push(id);
    }
  }

  // Seed queue in input order for determinism.
  const queue = order.filter((id) => (inDegree.get(id) || 0) === 0);
  const result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    for (const child of dependents.get(id) || []) {
      const d = (inDegree.get(child) || 0) - 1;
      inDegree.set(child, d);
      if (d === 0) queue.push(child);
    }
  }
  return result; // packages stuck in cycles drop out (in-degree never reaches 0)
}

/**
 * Strongly-connected components of size > 1, plus self-loops, via Tarjan's algorithm.
 * Returns [] when the graph is acyclic. Only known deps form edges.
 */
export function detectCycles(pkgs: Pkg[]): string[][] {
  const byId = indexById(pkgs);
  const ids = Array.from(byId.keys());
  const adj = new Map<string, string[]>();
  const selfLoops = new Set<string>();
  for (const id of ids) {
    const edges: string[] = [];
    for (const dep of byId.get(id)!.deps) {
      if (!byId.has(dep)) continue;
      if (dep === id) selfLoops.add(id);
      else edges.push(dep);
    }
    adj.set(id, edges);
  }

  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  let counter = 0; // dedicated Tarjan counter (Fix #2)
  const cycles: string[][] = [];

  // Iterative Tarjan to avoid recursion limits on a 70-node graph (and for totality).
  for (const start of ids) {
    if (indices.has(start)) continue;
    const work: { node: string; i: number }[] = [{ node: start, i: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame.node;
      if (frame.i === 0) {
        indices.set(v, counter);
        lowlink.set(v, counter);
        counter++;
        stack.push(v);
        onStack.add(v);
      }
      const neighbors = adj.get(v)!;
      if (frame.i < neighbors.length) {
        const w = neighbors[frame.i++];
        if (!indices.has(w)) {
          work.push({ node: w, i: 0 });
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      } else {
        if (lowlink.get(v) === indices.get(v)) {
          const comp: string[] = [];
          let w: string;
          do {
            w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
          } while (w !== v);
          if (comp.length > 1 || selfLoops.has(v)) cycles.push(comp.reverse());
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].node;
          lowlink.set(parent, Math.min(lowlink.get(parent)!, lowlink.get(v)!));
        }
      }
    }
  }
  return cycles;
}

/**
 * Packages ready to start: not already done, and every dep already done. A package with an
 * unknown dep is never ready (the unknown dep can never be in `done`). Input order preserved.
 */
export function readyPackages(pkgs: Pkg[], done: Set<string>): string[] {
  const byId = indexById(pkgs);
  const out: string[] = [];
  for (const p of byId.values()) {
    if (done.has(p.id)) continue;
    // A package with an unknown dep can never legitimately be satisfied — never ready, even
    // if a phantom id happens to appear in `done`. Every dep must be a real, done package.
    if (p.deps.every((dep) => byId.has(dep) && done.has(dep))) out.push(p.id);
  }
  return out;
}

/** Direct dependents of `id` — packages that list `id` in their deps. Input order, deduped. */
export function dependentsOf(pkgs: Pkg[], id: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of pkgs) {
    if (!p || typeof p.id !== "string" || !Array.isArray(p.deps)) continue;
    if (p.deps.includes(id) && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p.id);
    }
  }
  return out;
}
