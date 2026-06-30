export interface RawTelemetry {
  collectedAt?: string;
  activeApp?: string;
  windowTitle?: string;
  workspacePath?: string;
  gitRepo?: string;
  gitBranch?: string;
  latestCommit?: string;
  modifiedFiles?: string[];
  clipboard?: string;
  recentCommands?: string[];
  virtualDesktop?: string;
  browserTitle?: string;
  browserUrl?: string;
  _telemetryError?: string;
}

function unavailableTelemetry(): RawTelemetry {
  return {
    collectedAt: new Date().toISOString(),
    activeApp: "unknown",
    virtualDesktop: "unknown",
    browserTitle: "unknown",
    browserUrl: "unknown",
    windowTitle: "",
    workspacePath: "",
    gitRepo: "",
    gitBranch: "",
    latestCommit: "",
    modifiedFiles: [],
    clipboard: "",
    recentCommands: [],
    _telemetryError: "parse-failure",
  };
}

// Internal helper to extract JSON envelope from arbitrary text
// (mirrors extractJson in ai/providers.ts: first { or [ ... last } or ]).
function extractJson(text: string): string {
  const s = text.indexOf("{");
  const a = text.indexOf("[");
  const start = s < 0 ? a : a < 0 ? s : Math.min(s, a);
  if (start < 0) return text;
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return end > start ? text.slice(start, end + 1) : text.slice(start);
}

export function parseTelemetry(stdout: string): RawTelemetry {
  // Coerce null or undefined to empty string
  let input = stdout;
  if (input == null) input = "";
  // Strip UTF-8 BOM if present
  if (typeof input === "string" && input.startsWith("﻿")) {
    input = input.slice(1);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return unavailableTelemetry();
  }

  const envelope = extractJson(trimmed);
  try {
    const parsed = JSON.parse(envelope);
    // Reject null, arrays, or non-object values
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return unavailableTelemetry();
    }
    return parsed as RawTelemetry;
  } catch {
    return unavailableTelemetry();
  }
}
