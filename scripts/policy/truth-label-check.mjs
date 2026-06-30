/** @type {readonly string[]} */
export const LABELS = [
  "SCOPED",
  "SCAFFOLDED",
  "IMPLEMENTED-UNTESTED",
  "LOCAL TESTED",
  "RUNTIME VERIFIED",
  "INDEPENDENTLY REVIEWED",
  "INTEGRATED",
  "DEPLOYED",
  "BLOCKED"
];

export function checkTruthLabels(records) {
  const violations = [];
  for (const rec of records) {
    const { package: pkg, label, positive_path, negative_path } = rec;
    const lbl = label;
    if (!LABELS.includes(lbl)) {
      violations.push({
        reason: "LABEL_NOT_IN_VOCAB",
        package: pkg,
        detail: `Label "${lbl}" is not in the label vocabulary.`
      });
      continue;
    }
    if (lbl === "RUNTIME VERIFIED") {
      const pos = positive_path ?? "NOT_PROVEN";
      if (pos !== "PROVEN") {
        violations.push({
          reason: "TRUTH_LABEL",
          package: pkg,
          detail: `RUNTIME VERIFIED record has positive_path "${pos}" which must be "PROVEN".`
        });
      }
    }
  }
  return violations;
}

export function scanReportsForRuntimeClaim(text) {
  // case-sensitive detection of "RUNTIME VERIFIED" optionally followed by "(error path)" or "(negative path)"
  const pattern = /\bRUNTIME VERIFIED(?:\s+\(error path\))?(?:\s+\(negative path\))?\b/;
  return pattern.test(text);
}
