import { checkTruthLabels, scanReportsForRuntimeClaim } from './truth-label-check.mjs';

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures++;
  }
}

// T1: TRUTH_LABEL violation when positive_path is NOT_PROVEN
const t1Input = [{ package: "X", label: "RUNTIME VERIFIED", positive_path: "NOT_PROVEN", negative_path: "PROVEN" }];
const t1Violations = checkTruthLabels(t1Input);
assert(t1Violations.length === 1, "T1: expected exactly one TRUTH_LABEL violation");
assert(t1Violations[0].reason === "TRUTH_LABEL", "T1: violation reason should be TRUTH_LABEL");
assert(t1Violations[0].package === "X", "T1: violation package should be X");

// T2: No violation when positive_path is PROVEN (missing negative_path is okay)
const t2Input = [{ label: "RUNTIME VERIFIED", positive_path: "PROVEN" }];
const t2Violations = checkTruthLabels(t2Input);
assert(t2Violations.length === 0, "T2: expected no violations");

// T3: Non-RUNTIME VERIFIED label does not trigger check
const t3Input = [{ label: "BLOCKED", positive_path: "NOT_PROVEN", negative_path: "PROVEN" }];
const t3Violations = checkTruthLabels(t3Input);
assert(t3Violations.length === 0, "T3: expected no violations");

// T4: scanReportsForRuntimeClaim detects qualified claim
assert(scanReportsForRuntimeClaim("VC02 = RUNTIME VERIFIED (error path)") === true, "T4: runtime claim not detected");

// T5: LABEL_NOT_IN_VOCAB when label not in enum
const t5Input = [{ label: "WORKS" }];
const t5Violations = checkTruthLabels(t5Input);
assert(t5Violations.length === 1, "T5: expected exactly one LABEL_NOT_IN_VOCAB violation");
assert(t5Violations[0].reason === "LABEL_NOT_IN_VOCAB", "T5: violation reason should be LABEL_NOT_IN_VOCAB");

// T6: Missing positive_path on RUNTIME VERIFIED is treated as NOT_PROVEN -> TRUTH_LABEL violation (no throw)
const t6Input = [{ label: "RUNTIME VERIFIED" }];
const t6Violations = checkTruthLabels(t6Input);
assert(t6Violations.length === 1, "T6: expected TRUTH_LABEL violation for missing positive_path");
assert(t6Violations[0].reason === "TRUTH_LABEL", "T6: violation reason should be TRUTH_LABEL");

// Exit with non-zero code if any assertions failed
process.exit(failures ? 1 : 0);
