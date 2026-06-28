// D11 — secret-reference-registry tests (tsx). Run: npx tsx tests/d11-secretref.test.ts
//
// Verifies: add/list/markUsed/remove happy path, secret-VALUE rejection (throws),
// forbidden value-field stripping, and that secret-references.json never contains a
// secret value. Backs up and RESTORES the real json file so a dev's registry survives.

import fs from "node:fs";
import path from "node:path";
import {
  addRef,
  listRefs,
  markUsed,
  removeRef,
  looksLikeSecret,
} from "../orchestrator/secret-reference-registry";

const FILE = path.join(process.cwd(), "secret-references.json");
const BACKUP = `${FILE}.d11-test-backup`;

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    console.error(`  FAIL: ${name}`);
    failures++;
  }
}

// --- isolate: stash any existing registry, start from empty ---
const hadFile = fs.existsSync(FILE);
if (hadFile) fs.copyFileSync(FILE, BACKUP);
try {
  if (fs.existsSync(FILE)) fs.unlinkSync(FILE);

  // 1. add a clean reference + list it
  const ref = addRef({
    name: "OpenRouter dev key",
    kind: "openrouter-key",
    scope: "global",
    provenance: "Desktop\\env\\.env",
    repo: "veridian",
  });
  check("addRef returns an id", typeof ref.id === "string" && ref.id.length > 0);
  check("addRef sets firstSeen ISO", !Number.isNaN(Date.parse(ref.firstSeen)));
  check("addRef has no value/secret field", !("value" in ref) && !("secret" in ref));

  let list = listRefs();
  check("listRefs sees the added ref", list.length === 1 && list[0].id === ref.id);
  check("provenance is a location, not a value", list[0].provenance === "Desktop\\env\\.env");

  // 2. markUsed updates lastUsed
  check("new ref has no lastUsed yet", list[0].lastUsed === undefined);
  const used = markUsed(ref.id);
  check("markUsed returns the ref", used !== null && used!.id === ref.id);
  check("markUsed sets lastUsed ISO", !!used?.lastUsed && !Number.isNaN(Date.parse(used!.lastUsed!)));
  check("markUsed unknown id returns null", markUsed("no-such-id") === null);
  list = listRefs();
  check("lastUsed persisted to disk", !!list[0].lastUsed);

  // 3. looksLikeSecret guard recognizes real-looking secrets
  const fakeOR = "sk-or-v1-" + "a".repeat(48);
  check("looksLikeSecret: openrouter key", looksLikeSecret(fakeOR));
  check("looksLikeSecret: aws akia", looksLikeSecret("AKIAIOSFODNN7EXAMPLE"));
  check("looksLikeSecret: github token", looksLikeSecret("ghp_" + "B".repeat(36)));
  check("looksLikeSecret: google client secret", looksLikeSecret("GOCSPX-abcdEFGH1234ijkl"));
  check("looksLikeSecret: jwt", looksLikeSecret("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc_DEF-123"));
  check("looksLikeSecret: long hex blob", looksLikeSecret("a".repeat(40)));
  // ...and does NOT flag legit metadata
  check("looksLikeSecret: plain name ok", !looksLikeSecret("OpenRouter dev key"));
  check("looksLikeSecret: env path ok", !looksLikeSecret("Desktop\\env\\.env"));
  check("looksLikeSecret: short word ok", !looksLikeSecret("totp"));

  // 4. addRef REJECTS a ref whose metadata carries a real-looking secret
  let threwOnName = false;
  try {
    addRef({ name: fakeOR, kind: "openrouter-key", scope: "global", provenance: "x" });
  } catch {
    threwOnName = true;
  }
  check("addRef throws when NAME looks like a secret", threwOnName);

  let threwOnProvenance = false;
  try {
    addRef({
      name: "leaky",
      kind: "openrouter-key",
      scope: "global",
      provenance: "key is " + fakeOR,
    });
  } catch {
    threwOnProvenance = true;
  }
  check("addRef throws when PROVENANCE contains a secret", threwOnProvenance);

  // 5. a stray `value` field must be silently stripped, never stored
  const sneaky = addRef({
    name: "has stray value field",
    kind: "totp",
    scope: "service",
    provenance: "totp-config.json",
    // @ts-expect-error — intentionally passing a forbidden field
    value: "JBSWY3DPEHPK3PXP",
  });
  check("stripped: stored ref has no value field", !("value" in sneaky));

  // 6. the rejected refs were NOT added; only the 2 legit refs exist
  list = listRefs();
  check("only legit refs persisted (rejected ones absent)", list.length === 2);

  // 7. CRITICAL: the on-disk file contains NO secret value anywhere
  const raw = fs.readFileSync(FILE, "utf8");
  check("file does NOT contain the openrouter secret", !raw.includes(fakeOR));
  check("file does NOT contain the totp value", !raw.includes("JBSWY3DPEHPK3PXP"));
  check("file has no 'value' key", !/"value"\s*:/.test(raw));

  // 8. removeRef works
  check("removeRef returns true for existing", removeRef(ref.id) === true);
  check("removeRef returns false for missing", removeRef("no-such-id") === false);
  check("list shrank after remove", listRefs().length === 1);
} finally {
  // --- restore the developer's real registry exactly ---
  if (hadFile) {
    fs.copyFileSync(BACKUP, FILE);
    fs.unlinkSync(BACKUP);
  } else if (fs.existsSync(FILE)) {
    fs.unlinkSync(FILE);
  }
}

if (failures > 0) {
  console.error(`\nD11 secret-reference-registry: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nok: D11 secret-reference-registry — all checks passed");
