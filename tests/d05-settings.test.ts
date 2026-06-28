// D05 settings/policy registry verification. Run: npx tsx tests/d05-settings.test.ts
//
// Covers: scope precedence (project > device > global > default), default fallback,
// unknown-key => undefined, target requirements, and disk persistence (round-trip
// through a fresh in-memory store via _resetForTests). Backs up and restores the real
// orchestrator-settings.json so running the test never clobbers live config.
import fs from "node:fs";
import path from "node:path";

let fail = 0;
const ok = (n: string, c: boolean) => { console.log((c ? "  ok   " : "  FAIL ") + n); if (!c) fail++; };

const SETTINGS_FILE = path.join(process.cwd(), "orchestrator-settings.json");
const backup = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, "utf8") : null;

// Start from a clean slate so precedence/persistence assertions are deterministic.
try { fs.unlinkSync(SETTINGS_FILE); } catch { /* not present */ }

const S = await import("../orchestrator/settings-store");

try {
  S._resetForTests();

  // ---- defaults ----
  ok("default telemetryPollMs = 30000", S.getEffective("telemetryPollMs") === 30000);
  ok("default voiceVerbosity = normal", S.getEffective("voiceVerbosity") === "normal");

  // ---- unknown key ----
  ok("unknown key => undefined", S.getEffective("nope-not-a-key") === undefined);
  ok("unknown key with ctx => undefined", S.getEffective("nope", { device: "d1", project: "p1" }) === undefined);

  // ---- global overrides default ----
  S.setSetting("global", "telemetryPollMs", 5000);
  ok("global overrides default", S.getEffective("telemetryPollMs") === 5000);

  // ---- device overrides global ----
  S.setSetting("device", "telemetryPollMs", 1000, "laptop");
  ok("device overrides global (matching ctx)", S.getEffective("telemetryPollMs", { device: "laptop" }) === 1000);
  ok("device scope only applies to its target", S.getEffective("telemetryPollMs", { device: "other" }) === 5000);
  ok("no ctx still sees global, not device", S.getEffective("telemetryPollMs") === 5000);

  // ---- project overrides device + global (most specific wins) ----
  S.setSetting("project", "telemetryPollMs", 250, "veridian");
  ok("project beats device+global", S.getEffective("telemetryPollMs", { device: "laptop", project: "veridian" }) === 250);
  ok("project miss falls back to device", S.getEffective("telemetryPollMs", { device: "laptop", project: "elsewhere" }) === 1000);

  // ---- explicit value shadows lower scope (incl. falsy / null) ----
  S.setSetting("project", "voiceVerbosity", null, "veridian");
  ok("explicit null shadows default", S.getEffective("voiceVerbosity", { project: "veridian" }) === null);
  S.setSetting("global", "featureZero", 0);
  ok("falsy 0 is returned, not treated as unset", S.getEffective("featureZero") === 0);

  // ---- target requirements + bad scope throw ----
  ok("device scope w/o target throws", (() => { try { S.setSetting("device", "k", 1); return false; } catch { return true; } })());
  ok("project scope w/o target throws", (() => { try { S.setSetting("project", "k", 1); return false; } catch { return true; } })());
  ok("bad scope throws", (() => { try { S.setSetting("nonsense" as any, "k", 1); return false; } catch { return true; } })());
  ok("empty key throws", (() => { try { S.setSetting("global", "", 1); return false; } catch { return true; } })());

  // ---- listSettings shape + immutability ----
  const listed = S.listSettings();
  ok("listSettings has all three scopes", !!listed.global && !!listed.device && !!listed.project);
  ok("listSettings reflects global set", listed.global.telemetryPollMs === 5000);
  (listed.global as any).telemetryPollMs = 999999; // mutate the copy
  ok("listSettings returns a copy (mutation does not leak)", S.getEffective("telemetryPollMs") === 5000);

  // ---- persistence: file exists, and a FRESH in-memory store re-reads it ----
  ok("settings file written to disk", fs.existsSync(SETTINGS_FILE));
  S._resetForTests(); // force re-load from disk
  ok("persisted global survives reload", S.getEffective("telemetryPollMs") === 5000);
  ok("persisted device survives reload", S.getEffective("telemetryPollMs", { device: "laptop" }) === 1000);
  ok("persisted project survives reload", S.getEffective("telemetryPollMs", { device: "laptop", project: "veridian" }) === 250);

  // ---- corrupt file => empty store, defaults restored, no throw ----
  fs.writeFileSync(SETTINGS_FILE, "{ this is not json");
  S._resetForTests();
  ok("corrupt file falls back to defaults (no throw)", S.getEffective("telemetryPollMs") === 30000);

  // no stray tmp files left behind by atomic writes
  const strays = fs.readdirSync(process.cwd()).filter((n) => n.includes("orchestrator-settings.json") && n.includes(".tmp"));
  ok("no stray .tmp files", strays.length === 0);
} finally {
  // Restore the real settings file exactly as we found it.
  try {
    if (backup !== null) fs.writeFileSync(SETTINGS_FILE, backup);
    else fs.unlinkSync(SETTINGS_FILE);
  } catch { /* ignore */ }
}

if (fail) { console.error(`\nd05-settings: ${fail} FAILED`); process.exit(1); }
console.log("\nd05-settings: scope precedence + default fallback + unknown-key + persistence verified");
