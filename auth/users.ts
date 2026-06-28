// Admin-managed login allowlist (the "who is who" the TOTP admin controls).
//
// Model: whoever holds the cloud TOTP secret is the ADMIN. The admin manages this
// store of users who are allowed to sign in with Google. A Google login is only
// accepted if the email is in this store; the role here decides whether that user
// is an "admin" (also gets the panel) or a plain "user".
//
// Persisted to auth-users.json (atomic write, git-ignored). Seeded once from
// VERIDIAN_GOOGLE_ALLOWED_EMAILS (those bootstrap emails become admins) so the
// owner can get in before anyone has been added by hand.

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
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeEmail(e: string): string {
  return String(e || "").trim().toLowerCase();
}
export function isValidEmail(e: string): boolean {
  return EMAIL_RE.test(normalizeEmail(e));
}

function readRaw(): AuthUser[] {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return Array.isArray(raw) ? (raw as AuthUser[]) : [];
  } catch {
    return [];
  }
}

function write(users: AuthUser[]): void {
  writeJsonAtomic(FILE, users);
}

// Seed admins from the env allowlist the first time, so the owner can always log in.
function ensureSeeded(): AuthUser[] {
  if (fs.existsSync(FILE)) return readRaw();
  const seed = (process.env.VERIDIAN_GOOGLE_ALLOWED_EMAILS || "")
    .split(",")
    .map(normalizeEmail)
    .filter(isValidEmail);
  const now = new Date().toISOString();
  const users: AuthUser[] = seed.map((email) => ({ email, role: "admin", note: "seeded from env", addedBy: "system", addedAt: now }));
  if (users.length) write(users);
  return users;
}

export function listUsers(): AuthUser[] {
  return ensureSeeded().slice().sort((a, b) => a.email.localeCompare(b.email));
}

export function isAllowed(email: string): boolean {
  const e = normalizeEmail(email);
  return ensureSeeded().some((u) => u.email === e);
}

export function roleFor(email: string): Role | null {
  const e = normalizeEmail(email);
  return ensureSeeded().find((u) => u.email === e)?.role || null;
}

/** Add or update a user. Returns the resulting list. Throws on a bad email. */
export function addUser(input: { email: string; role?: Role; note?: string; addedBy?: string }): AuthUser[] {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new Error("invalid email");
  const role: Role = input.role === "admin" ? "admin" : "user";
  const users = ensureSeeded();
  const existing = users.find((u) => u.email === email);
  if (existing) {
    existing.role = role;
    if (input.note !== undefined) existing.note = String(input.note);
  } else {
    users.push({ email, role, note: input.note ? String(input.note) : undefined, addedBy: input.addedBy || "admin", addedAt: new Date().toISOString() });
  }
  write(users);
  return listUsers();
}

/** Remove a user. Refuses to remove the last remaining admin (lockout guard). */
export function removeUser(email: string): { ok: boolean; error?: string; users: AuthUser[] } {
  const e = normalizeEmail(email);
  const users = ensureSeeded();
  const target = users.find((u) => u.email === e);
  if (!target) return { ok: false, error: "not found", users: listUsers() };
  if (target.role === "admin" && users.filter((u) => u.role === "admin").length <= 1) {
    return { ok: false, error: "cannot remove the last admin", users: listUsers() };
  }
  write(users.filter((u) => u.email !== e));
  return { ok: true, users: listUsers() };
}
