// src/components/AdminPanel.tsx — admin-only "Access" panel.
//
// Lets the admin (whoever holds the TOTP) manage who may sign in. People added
// here can sign in with Google; admins also get this panel.
//
// API contract (admin session cookie required, sent with credentials):
//   GET    /api/admin/users                 -> AuthUser[]
//   POST   /api/admin/users { email, role?, note? } -> { ok, users } | 400 { ok:false, error }
//   DELETE /api/admin/users/:email          -> { ok, users } | 400 { ok:false, error }
//
// Flicker-sensitive: list state only updates when the content actually changes.

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  Loader2,
  Crown,
  User as UserIcon,
  AlertTriangle,
} from "lucide-react";

type Role = "admin" | "user";

interface AuthUser {
  email: string;
  role: Role;
  note?: string;
  addedBy?: string;
  addedAt: string;
}

// Stable signature so polling / refreshes only re-render when content changes.
const sig = (xs: AuthUser[]) =>
  xs
    .map((x) => `${x.email}:${x.role}:${x.note || ""}:${x.addedBy || ""}:${x.addedAt}`)
    .join("|");

function fmtDate(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function RoleBadge({ role }: { role: Role }) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono uppercase tracking-wider">
        <Crown className="h-2.5 w-2.5" /> admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-700/40 text-slate-300 border border-slate-600/40 text-[10px] font-mono uppercase tracking-wider">
      <UserIcon className="h-2.5 w-2.5" /> user
    </span>
  );
}

export default function AdminPanel({ apiBase }: { apiBase: string }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Add-person form state.
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  // Per-row inline remove confirmation + error.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ email: string; msg: string } | null>(null);

  const applyUsers = useCallback((next: AuthUser[]) => {
    if (!Array.isArray(next)) return;
    setUsers((prev) => (sig(prev) === sig(next) ? prev : next));
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/admin/users`, { credentials: "include" });
      if (!r.ok) return;
      const next = (await r.json()) as AuthUser[];
      applyUsers(next);
    } catch {
      /* offline; ignore */
    } finally {
      setLoading(false);
    }
  }, [apiBase, applyUsers]);

  useEffect(() => {
    load();
  }, [load]);

  const addPerson = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setAddError("");
    const addr = email.trim();
    if (!addr) {
      setAddError("enter an email address");
      return;
    }
    setAdding(true);
    try {
      const r = await fetch(`${apiBase}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: addr, role, ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setEmail("");
        setNote("");
        setRole("user");
        if (Array.isArray(j.users)) applyUsers(j.users);
        else await load();
      } else {
        setAddError(j?.error || "could not add this person");
      }
    } catch {
      setAddError("network error — is the server running?");
    } finally {
      setAdding(false);
    }
  };

  const removePerson = async (addr: string) => {
    setRowError(null);
    setRemovingEmail(addr);
    try {
      const r = await fetch(`${apiBase}/api/admin/users/${encodeURIComponent(addr)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setConfirmEmail(null);
        if (Array.isArray(j.users)) applyUsers(j.users);
        else await load();
      } else {
        setRowError({ email: addr, msg: j?.error || "could not remove this person" });
      }
    } catch {
      setRowError({ email: addr, msg: "network error — is the server running?" });
    } finally {
      setRemovingEmail(null);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
          <ShieldCheck className="h-3.5 w-3.5" /> Access
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Whoever holds the TOTP is the admin. People added here can sign in with Google; admins
          also get this panel.
        </p>
      </div>

      {/* Add-person form */}
      <form
        onSubmit={addPerson}
        className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5"
      >
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
          <UserPlus className="h-3.5 w-3.5" /> Add person
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder="person@example.com"
            disabled={adding}
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-emerald-200 placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all disabled:opacity-50"
          />
          <select
            value={role}
            onChange={(ev) => setRole(ev.target.value as Role)}
            disabled={adding}
            className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:border-emerald-500/50 focus:outline-none transition-all disabled:opacity-50"
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <input
          type="text"
          autoComplete="off"
          value={note}
          onChange={(ev) => setNote(ev.target.value)}
          placeholder="note (optional)"
          disabled={adding}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all disabled:opacity-50"
        />
        <AnimatePresence>
          {addError && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-rose-400 font-mono flex items-center gap-1.5"
            >
              <AlertTriangle className="h-3 w-3 shrink-0" /> {addError}
            </motion.p>
          )}
        </AnimatePresence>
        <button
          type="submit"
          disabled={adding}
          className="px-3 py-2 rounded-lg text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          {adding ? "Allowing…" : "Allow"}
        </button>
      </form>

      {/* People list */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-2">
          <ShieldCheck className="h-3.5 w-3.5" /> Allowed people ({users.length})
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> loading…
          </div>
        ) : users.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No one added yet.</p>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence initial={false}>
              {users.map((u) => (
                <motion.div
                  key={u.email}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeInOut" }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-100 truncate">{u.email}</span>
                    <RoleBadge role={u.role} />
                    <div className="flex-1" />
                    {confirmEmail === u.email ? (
                      <span className="flex items-center gap-2 text-[11px] font-mono">
                        <span className="text-slate-400">Remove?</span>
                        <button
                          type="button"
                          onClick={() => removePerson(u.email)}
                          disabled={removingEmail === u.email}
                          className="px-2 py-0.5 rounded text-rose-300 border border-rose-500/40 hover:bg-rose-500/15 transition-all disabled:opacity-50 flex items-center gap-1"
                        >
                          {removingEmail === u.email ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : null}
                          yes
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmEmail(null);
                            setRowError(null);
                          }}
                          disabled={removingEmail === u.email}
                          className="px-2 py-0.5 rounded text-slate-400 border border-slate-700 hover:text-slate-200 transition-all disabled:opacity-50"
                        >
                          no
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmEmail(u.email);
                          setRowError(null);
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-bold border border-slate-700 text-slate-300 hover:text-rose-300 hover:border-rose-500/50 transition-all flex items-center gap-1.5"
                      >
                        <Trash2 className="h-3 w-3" /> Remove
                      </button>
                    )}
                  </div>
                  {u.note && <div className="mt-1 text-[11px] text-slate-400 font-mono">{u.note}</div>}
                  <div className="mt-0.5 text-[10px] font-mono text-slate-600 flex items-center gap-2 flex-wrap">
                    {u.addedBy && <span>added by {u.addedBy}</span>}
                    {fmtDate(u.addedAt) && <span>· {fmtDate(u.addedAt)}</span>}
                  </div>
                  <AnimatePresence>
                    {rowError && rowError.email === u.email && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="mt-1 text-[11px] text-rose-400 font-mono flex items-center gap-1.5"
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" /> {rowError.msg}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
