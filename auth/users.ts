// Admin-managed login allowlist + team model.
//
// Model:
//   - The OWNER (afaqsubs@gmail.com by default) is a PERMANENT admin — always
//     allowed, always admin, can never be removed or demoted. This is the
//     guaranteed "one-man army" baseline: even with an empty/missing store, the
//     owner can always get in.
//   - Whoever holds the cloud TOTP secret authenticates as admin too.
//   - The admin (the developer) curates the TEAM: additional emails allowed to sign
//     in with Google, each as "admin" or "user". With no team members added, it's
//     just the owner — solo. Add members to turn it into a team.
//
// Persisted to auth-users.json (atomic, git-ignored), seeded from
// VERIDIAN_OWNER_EMAIL/VERIDIAN_GOOGLE_ALLOWED_EMAILS on first run.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic } from "../lib/atomic";

const FILE = path.join(process.cwd(), "auth-users.json");

export type Role = "admin" | "user";

export interface AuthUser {
  email: string;
  role: Role;
  note?: string;
  addedBy?: string;
  addedAt: string;
  owner?: boolean; // true for the permanent owner (UI badge; never removable)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(e: string): string {
  return String(e || "").trim().toLowerCase();
}
export function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(normalizeEmail(e));
}

// The permanent owner. Hardcoded default; overridable via env if ever needed.
export const OWNER_EMAIL = normalizeEmail(process.env.VERIDIAN_OWNER_EMAIL || "afaqsubs@gmail.com");
export function isOwner(email: string): boolean {
  return normalizeEmail(email) === OWNER_EMAIL;
}

function readRaw(): AuthUser[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? (raw as AuthUser[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(users: AuthUser[]): void {
  writeJsonAtomic(FILE, users);
}

// Load the store, guaranteeing the owner is present as an admin (persisting that
// fix if needed) and folding in any env-seeded emails on first run.
function load(): AuthUser[] {
  let users = readRaw();
  let changed = false;

  // First-run seed from env (besides the owner).
  if (!fs.existsSync(FILE)) {
    const seed = (process.env.VERIDIAN_GOOGLE_ALLOWED_EMAILS || "")
      .split(",")
      .map(normalizeEmail)
      .filter((e) => isValidEmail(e) && e !== OWNER_EMAIL);
    const now = new Date().toISOString();
    users = seed.map((email) => ({ email, role: "admin" as Role, note: "seeded from env", addedBy: "system", addedAt: now }));
    changed = true;
  }

  // Guarantee the owner row exists, is admin, and is flagged.
  const owner = users.find((u) => u.email === OWNER_EMAIL);
  if (!owner) {
    users.unshift({ email: OWNER_EMAIL, role: "admin", note: "owner (default admin)", addedBy: "system", addedAt: new Date().toISOString(), owner: true });
    changed = true;
  } else if (owner.role !== "admin" || !owner.owner) {
    owner.role = "admin";
    owner.owner = true;
    changed = true;
  }

  if (changed) writeRaw(users);
  return users;
}

export function listUsers(): AuthUser[] {
  return load()
    .map((u) => ({ ...u, owner: u.email === OWNER_EMAIL }))
    .sort((a, b) => (a.owner ? -1 : b.owner ? 1 : a.email.localeCompare(b.email)));
}

export function isAllowed(email: string): boolean {
  const e = normalizeEmail(email);
  if (e === OWNER_EMAIL) return true; // owner always allowed
  return load().some((u) => u.email === e);
}

export function roleFor(email: string): Role | null {
  const e = normalizeEmail(email);
  if (e === OWNER_EMAIL) return "admin"; // owner always admin
  return load().find((u) => u.email === e)?.role || null;
}

/** Team summary: the owner, member list (non-owner), and whether it's solo. */
export function teamInfo(): { owner: string; members: AuthUser[]; total: number; solo: boolean } {
  const all = listUsers();
  const members = all.filter((u) => !u.owner);
  return { owner: OWNER_EMAIL, members, total: all.length, solo: members.length === 0 };
}

/** Add or update a team member. The owner is always forced to admin. Throws on a bad email. */
export function addUser(input: { email: string; role?: Role; note?: string; addedBy?: string }): AuthUser[] {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("invalid email");
  const role: Role = email === OWNER_EMAIL ? "admin" : input.role === "admin" ? "admin" : "user";
  const users = load();
  const existing = users.find((u) => u.email === email);
  if (existing) {
    existing.role = role;
    if (input.note !== undefined) existing.note = String(input.note);
  } else {
    users.push({ email, role, note: input.note ? String(input.note) : undefined, addedBy: input.addedBy || "admin", addedAt: new Date().toISOString() });
  }
  writeRaw(users);
  return listUsers();
}

/** Remove a member. Refuses to remove the owner or the last admin. */
export function removeUser(email: string): { ok: boolean; error?: string; users: AuthUser[] } {
  const e = normalizeEmail(email);
  if (e === OWNER_EMAIL) return { ok: false, error: "cannot remove the owner", users: listUsers() };
  const users = load();
  const target = users.find((u) => u.email === e);
  if (!target) return { ok: false, error: "not found", users: listUsers() };
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length <= 1) {
    return { ok: false, error: "cannot remove the last admin", users: listUsers() };
  }
  writeRaw(users.filter((u) => u.email !== e));
  return { ok: true, users: listUsers() };
}
