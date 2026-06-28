// LOCAL side of multi-machine sync. Runs inside each local Veridian instance and
// periodically pushes this machine's state up to the CENTRAL server (CENTRAL_URL,
// e.g. https://pr.afaq24.store) so the central command dashboard can aggregate it.
//
// Opt-in: if CENTRAL_URL is not set, this does nothing at all. Every push is wrapped
// in try/catch — a network failure, an offline central server, or a bad response must
// NEVER crash the host (this runs alongside the normal local server).
//
// Env vars a local instance sets to sync:
//   CENTRAL_URL      required — base URL of the central server (no trailing slash needed)
//   MACHINE_ID       optional — stable id for this machine (defaults to os.hostname())
//   CENTRAL_AUTH     optional — "user:pass" sent as HTTP Basic auth to the central server
//   SYNC_INTERVAL_MS optional — push interval in ms (default 30000)

import os from "node:os";
import { setInterval } from "node:timers";
import { sanitizeOutboundSnapshot } from "./sync-sanitize";

/** True when CENTRAL_URL is configured and this instance should push state. */
export function syncEnabled(): boolean {
  return Boolean(process.env.CENTRAL_URL);
}

/**
 * Start the background push loop. `collect` is called every interval to gather this
 * machine's current state; the result is POSTed to ${CENTRAL_URL}/api/sync/push.
 * No-op (returns immediately) when CENTRAL_URL is not set.
 */
export function startSyncClient(
  collect: () => Promise<{ currentState: any; sessions: any[]; waiting: any[] }>
): void {
  const base = process.env.CENTRAL_URL;
  if (!base) return; // not configured → do nothing

  const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS || "30000", 10);
  const url = `${base.replace(/\/+$/, "")}/api/sync/push`;

  const push = async () => {
    try {
      const data = await collect();
      // F-004: strip all sensitive fields before anything leaves this machine.
      // Central only ever sees allowlisted, non-sensitive aggregation data.
      const safe = sanitizeOutboundSnapshot(data);
      const body = {
        machineId: process.env.MACHINE_ID || os.hostname(),
        hostname: os.hostname(),
        ...safe,
      };

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (process.env.CENTRAL_AUTH) {
        const token = Buffer.from(process.env.CENTRAL_AUTH).toString("base64");
        headers["Authorization"] = `Basic ${token}`;
      }

      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
    } catch {
      // Network/central-server failures are silent — never crash the host server.
    }
  };

  // Fire on the interval. (No immediate kick-off so startup stays quiet; the first
  // push lands after one interval.)
  setInterval(push, intervalMs).unref?.();
}

/**
 * Cross-device clipboard sync transport. Every interval it PUSHES this machine's
 * E2E-encrypted clip blobs to the central server and PULLS everyone else's, handing
 * the ciphertext to `ingest` (which decrypts locally). Transport only — it never
 * sees plaintext; `getEntries` returns already-encrypted blobs. No-op without
 * CENTRAL_URL. (Entries are also empty unless a VERIDIAN_SYNC_KEY is set, so a
 * misconfigured machine simply syncs nothing.)
 */
export function startClipSyncClient(
  getEntries: () => Array<{ id: string; ts: string; blob: string; preview: string; isSecret: boolean; length: number }>,
  ingest: (remote: any[]) => void
): void {
  const base = process.env.CENTRAL_URL;
  if (!base) return;

  const machineId = process.env.MACHINE_ID || os.hostname();
  const intervalMs = parseInt(process.env.SYNC_INTERVAL_MS || "30000", 10);
  const root = base.replace(/\/+$/, "");
  const pushUrl = `${root}/api/sync/clip/push`;
  const pullUrl = `${root}/api/sync/clip/pull?exclude=${encodeURIComponent(machineId)}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.CENTRAL_AUTH) {
    headers["Authorization"] = `Basic ${Buffer.from(process.env.CENTRAL_AUTH).toString("base64")}`;
  }

  const tick = async () => {
    try {
      const entries = getEntries();
      if (entries.length) {
        await fetch(pushUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({ machineId, hostname: os.hostname(), entries })
        });
      }
      const res = await fetch(pullUrl, { headers: process.env.CENTRAL_AUTH ? { Authorization: headers["Authorization"] } : {} });
      if (res.ok) {
        const remote = await res.json();
        ingest(Array.isArray(remote) ? remote : []);
      }
    } catch {
      // Network/central failures are silent — never crash the host server.
    }
  };

  setInterval(tick, intervalMs).unref?.();
}
