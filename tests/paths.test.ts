import { dataPath, DATA_DIR } from "../lib/paths";
import path from "node:path";

let passed = 0;
const total = 4;

function check(cond: boolean, msg = ""): void {
    if (cond) {
        passed++;
    } else {
        console.error(`FAIL: ${msg}`);
    }
}

// 1. dataPath("a.json") ends correctly
const p1 = dataPath("a.json");
check(p1.endsWith("a.json") || p1.endsWith(path.sep + "a.json"), `p1=${p1}`);

// 2. dataPath("sub","b.json") contains sub and ends with b.json
const p2 = dataPath("sub", "b.json");
check(p2.includes("sub") && p2.endsWith("b.json"), `p2=${p2}`);

// 3. path.isAbsolute(dataPath("x")) matches isAbsolute(process.cwd())
const p3 = dataPath("x");
check(path.isAbsolute(p3) === path.isAbsolute(process.cwd()), `p3=${p3}`);

// 4. dataPath() equals DATA_DIR
const p4 = dataPath();
check(p4 === DATA_DIR, `p4=${p4}, DATA_DIR=${DATA_DIR}`);

// Print results
console.log(`paths.test: ${passed} passed`);

const failed = total - passed;
process.exit(failed > 0 ? 1 : 0);
