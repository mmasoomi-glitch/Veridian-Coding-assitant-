# D08 — dep-graph draft response (redacted)

Raw OpenRouter reply (TypeScript). Reviewed, NOT adopted verbatim — see decision.md.
No secrets/PII in response.

```typescript
```typescript
export type Pkg = { id: string; deps: string[] };

export function topoOrder(pkgs: Pkg[]): string[] {
    const idToPkg = new Map<string, Pkg>();
    const idToInDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();
    const missingDeps = new Set(unknownDeps(pkgs).flatMap(x => x.missing));

    pkgs.forEach(pkg => {
        if (missingDeps.has(pkg.id)) return;
        idToPkg.set(pkg.id, pkg);
        idToInDegree.set(pkg.id, 0);
    });

    pkgs.forEach(pkg => {
        if (missingDeps.has(pkg.id)) return;
        pkg.deps.forEach(dep => {
            if (idToPkg.has(dep) && !missingDeps.has(dep)) {
                if (!graph.has(dep)) graph.set(dep, []);
                graph.get(dep)!.push(pkg.id);
                idToInDegree.set(pkg.id, (idToInDegree.get(pkg.id) || 0) + 1);
            }
        });
    });

    const queue = pkgs.filter(pkg => 
        !missingDeps.has(pkg.id) && idToInDegree.get(pkg.id) === 0
    ).map(pkg => pkg.id);
    const order: string[] = [];

    while (queue.length > 0) {
        const id = queue.shift()!;
        order.push(id);
        graph.get(id)?.forEach(depId => {
            const newInDegree = (idToInDegree.get(depId) || 0) - 1;
            idToInDegree.set(depId, newInDegree);
            if (newInDegree === 0) queue.push(depId);
        });
    }

    return order;
}

export function detectCycles(pkgs: Pkg[]): string[][] {
    const idToIndex = new Map<string, number>();
    const indexToId: string[] = [];
    const graph: number[][] = [];
    let index = 0;

    pkgs.forEach(pkg => {
        idToIndex.set(pkg.id, index);
        indexToId.push(pkg.id);
        graph.push([]);
        index++;
    });

    pkgs.forEach(pkg => {
        const from = idToIndex.get(pkg.id)!;
        pkg.deps.forEach(dep => {
            const to = idToIndex.get(dep);
            if (to !== undefined) graph[from].push(to);
        });
    });

    const indices: number[] = [];
    const lowlinks: number[] = [];
    const onStack: boolean[] = [];
    const stack: number[] = [];
    const cycles: string[][] = [];

    for (let i = 0; i < graph.length; i++) {
        indices[i] = -1;
        lowlinks[i] = -1;
        onStack[i] = false;
    }

    function strongconnect(v: number) {
        indices[v] = index;
        lowlinks[v] = index;
        index++;
        stack.push(v);
        onStack[v] = true;

        graph[v].forEach(w => {
            if (indices[w] === -1) {
                strongconnect(w);
                lowlinks[v] = Math.min(lowlinks[v], lowlinks[w]);
            } else if (onStack[w]) {
                lowlinks[v] = Math.min(lowlinks[v], indices[w]);
            }
        });

        if (lowlinks[v] === indices[v]) {
            const cycle: number[] = [];
            let w: number;
            do {
                w = stack.pop()!;
                onStack[w] = false;
                cycle.push(w);
            } while (w !== v);

            if (cycle.length > 1 || graph[v].includes(v)) {
                cycles.push(cycle.map(i => indexToId[i]));
            }
        }
    }

    for (let i = 0; i < graph.length; i++) {
        if (indices[i] === -1) strongconnect(i);
    }

    return cycles;
}

export function readyPackages(pkgs: Pkg[], done: Set<string>): string[] {
    const pkgSet = new Set(pkgs.map(pkg => pkg.id));
    return pkgs.filter(pkg => {
        if (done.has(pkg.id)) return false;
        return pkg.deps.every(dep => done.has(dep) && pkgSet.has(dep));
    }).map(pkg => pkg.id);
}

export function unknownDeps(pkgs: Pkg[]): { id: string; missing: string[] }[] {
    const pkgIds = new Set(pkgs.map(pkg => pkg.id));
    return pkgs.map(pkg => ({
        id: pkg.id,
        missing: pkg.deps.filter(dep => !pkgIds.has(dep))
    })).filter(x => x.missing.length > 0);
}

export function dependentsOf(pkgs: Pkg[], id: string): string[] {
    const dependents = new Set<string>();
    pkgs.forEach(pkg => {
        if (pkg.deps.includes(id)) dependents.add(pkg.id);
    });
    return Array.from(dependents);
}
``````
