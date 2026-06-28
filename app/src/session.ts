// A02 — Device registration + session lifecycle (skeleton).
// The app holds ONLY a session reference (the cookie is managed by the webview / native
// store) and a non-secret device descriptor. No passwords, TOTP seeds, vault payloads,
// or provider keys are ever stored here.

import type { VeridianClient } from "./api-client";

export interface DeviceDescriptor {
  deviceId: string;     // random, app-generated, non-secret
  label: string;        // user-facing, e.g. "Afaq's Phone"
  platform: "android";
  trusted: boolean;     // set by the cloud admin (device registry, D29)
}

export interface SessionState {
  authed: boolean;
  role: "admin" | "user" | null;
  email: string | null;
}

export async function refreshSession(client: VeridianClient): Promise<SessionState> {
  const r = await client.authStatus();
  if (r.state !== "ok") return { authed: false, role: null, email: null };
  return { authed: r.data.authed, role: r.data.role, email: r.data.email };
}

// Device id is generated once and persisted via storage.ts (non-secret).
export function newDeviceId(rand: () => string): string {
  return `and-${rand()}`;
}
