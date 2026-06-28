// A04 — Versioned API client for the Android control client.
// - Talks only to the cloud base URL (configurable; no hardcoded provider/secret).
// - Sends the session cookie (credentials) — never stores or sends raw secrets.
// - Normalizes every result into Availability<T> so the UI shows TRUTHFUL states
//   (ok / unavailable / unauthorized / contract-mismatch) instead of crashing or faking.

import { CONTRACT_VERSION, type Availability, type AuthStatus, type OrchHealth, type RepoRisk, type FeatureFlag } from "./contract";

export interface ClientConfig {
  baseUrl: string;            // e.g. https://pr.afaq24.store
  timeoutMs?: number;         // default 8000
}

async function call<T>(cfg: ClientConfig, path: string, init?: RequestInit): Promise<Availability<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 8000);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Accept": "application/json", "X-Veridian-Contract": CONTRACT_VERSION, ...(init?.headers || {}) },
      signal: ctrl.signal
    });
    if (res.status === 401 || res.status === 403) return { state: "unauthorized" };
    const serverContract = res.headers.get("X-Veridian-Contract");
    if (serverContract && serverContract !== CONTRACT_VERSION) {
      return { state: "contract-mismatch", expected: CONTRACT_VERSION };
    }
    if (!res.ok) return { state: "unavailable", reason: `http ${res.status}`, status: res.status };
    const data = (await res.json()) as T;
    return { state: "ok", data };
  } catch (e: any) {
    return { state: "unavailable", reason: e?.name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

export function createClient(cfg: ClientConfig) {
  return {
    authStatus: () => call<AuthStatus>(cfg, "/api/auth/status"),
    health: () => call<OrchHealth>(cfg, "/api/orch/health"),
    repos: () => call<RepoRisk[]>(cfg, "/api/orch/repos"),
    risk: () => call<RepoRisk[]>(cfg, "/api/orch/risk"),
    flags: () => call<FeatureFlag[]>(cfg, "/api/flags"),
    loginGoogle: (credential: string) =>
      call<{ ok: boolean; email: string; role: string }>(cfg, "/api/auth/google", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential })
      }),
    loginTotp: (code: string) =>
      call<{ ok: boolean }>(cfg, "/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code })
      }),
    logout: () => call<{ ok: boolean }>(cfg, "/api/auth/logout", { method: "POST" })
  };
}
export type VeridianClient = ReturnType<typeof createClient>;
