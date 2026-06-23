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
      const body = {
        machineId: process.env.MACHINE_ID || os.hostname(),
        hostname: os.hostname(),
        ...data,
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
