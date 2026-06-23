// src/components/LoginGate.tsx — gates the whole app behind admin TOTP (2FA).
//
// Renders {children} when auth isn't required or the session is already authed.
// Otherwise shows a centered dark login card matching CommandDeck styling.
//
// API contract (wired into server.ts):
//   GET  /api/auth/status -> { required, authed, configured }
//   POST /api/auth/login  { code? | recovery? } -> 200 {ok:true}+cookie | 401
//   GET  /api/auth/setup  -> { otpauthUri, qrDataUrl, recoveryCodes?, secret }
//   POST /api/auth/logout
//
// All fetches are try/caught; the component never crashes the app.

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ShieldCheck, KeyRound, Loader2, AlertTriangle, QrCode } from "lucide-react";

interface AuthStatus {
  required: boolean;
  authed: boolean;
  configured: boolean;
}

interface SetupInfo {
  otpauthUri?: string;
  qrDataUrl?: string;
  recoveryCodes?: string[];
  secret?: string;
}

function isLocalhost(): boolean {
  if (typeof location === "undefined") return false;
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

export default function LoginGate({
  apiBase,
  children,
}: {
  apiBase: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const [setup, setSetup] = useState<SetupInfo | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/auth/status`, { credentials: "include" });
      if (r.ok) {
        const s: AuthStatus = await r.json();
        setStatus(s);
      } else {
        // If status can't be read, fail open to the app rather than locking out.
        setStatus({ required: false, authed: true, configured: false });
      }
    } catch {
      setStatus({ required: false, authed: true, configured: false });
    } finally {
      setChecking(false);
    }
  }, [apiBase]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Load first-time setup info only on localhost when required & unconfigured.
  const needsSetup =
    !!status && status.required && !status.authed && !status.configured && isLocalhost();

  useEffect(() => {
    if (!needsSetup) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/auth/setup`, { credentials: "include" });
        if (r.ok && !cancelled) setSetup(await r.json());
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsSetup, apiBase]);

  const triggerError = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    const body = useRecovery ? { recovery: recovery.trim() } : { code: code.trim() };
    if (useRecovery ? !body.recovery : !body.code) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setCode("");
        setRecovery("");
        // Re-check status so {children} render. Fall back to reload if needed.
        await checkStatus();
        setStatus((prev) => (prev ? { ...prev, authed: true } : prev));
      } else {
        triggerError(useRecovery ? "Invalid recovery code" : "Invalid code");
      }
    } catch {
      triggerError("Network error — is the server running?");
    } finally {
      setSubmitting(false);
    }
  };

  // ---- render decisions ----

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!status || !status.required || status.authed) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeInOut" }}
        className="w-full max-w-md"
      >
        <motion.div
          animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
          transition={{ duration: 0.45 }}
          className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-5"
        >
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-100">Veridian — Admin Access</h1>
              <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                Two-factor required
              </p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {!useRecovery ? (
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Authenticator code
                </label>
                <input
                  autoFocus
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-center text-2xl font-mono tracking-[0.4em] text-emerald-300 placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all"
                />
              </div>
            ) : (
              <div>
                <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Recovery code
                </label>
                <input
                  autoFocus
                  value={recovery}
                  onChange={(ev) => setRecovery(ev.target.value)}
                  placeholder="xxxxx-xxxxx"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-center text-lg font-mono tracking-wider text-emerald-300 placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all"
                />
              </div>
            )}

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-rose-400 font-mono text-center"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-3 py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? "Verifying…" : "Unlock"}
            </button>
          </form>

          <button
            onClick={() => {
              setUseRecovery((v) => !v);
              setError("");
            }}
            className="w-full text-center text-[11px] font-mono text-slate-500 hover:text-cyan-300 transition-all"
          >
            {useRecovery ? "← Use an authenticator code" : "Use a recovery code"}
          </button>
        </motion.div>

        {/* First-time setup — localhost only, when not yet configured. */}
        <AnimatePresence>
          {needsSetup && setup && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="mt-4 bg-slate-900 border border-cyan-500/30 rounded-xl p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                <QrCode className="h-3.5 w-3.5" /> First-time setup
              </div>
              <p className="text-xs text-slate-400">
                Scan this QR code with Google Authenticator or Authy, then enter the
                6-digit code above.
              </p>
              {setup.qrDataUrl && (
                <div className="flex justify-center">
                  <img
                    src={setup.qrDataUrl}
                    alt="TOTP setup QR code"
                    className="rounded-lg bg-white p-2 h-44 w-44"
                  />
                </div>
              )}
              {setup.secret && (
                <div className="text-center">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">
                    Or enter this key manually
                  </div>
                  <code className="text-xs font-mono text-emerald-300 break-all">{setup.secret}</code>
                </div>
              )}
              {setup.recoveryCodes && setup.recoveryCodes.length > 0 && (
                <div className="bg-slate-950 border border-amber-500/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Save these recovery codes now
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Shown once. Each works a single time if you lose your authenticator.
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {setup.recoveryCodes.map((rc) => (
                      <code key={rc} className="text-xs font-mono text-amber-200 bg-slate-900 rounded px-2 py-1 text-center">
                        {rc}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
