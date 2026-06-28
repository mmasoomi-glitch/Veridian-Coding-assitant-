// src/components/LoginGate.tsx — gates the whole app behind the STRONG LOGIN
// (master passphrase + TOTP 2FA, sealed on-device with Windows DPAPI).
//
// Renders {children} when auth isn't required or the session is already authed.
// Otherwise shows a centered dark login card matching CommandDeck styling and
// drives one of three flows: first-run setup, unlock, or the post-setup
// "save your recovery codes" confirmation.
//
// API contract (wired into server.ts):
//   GET  /api/auth/status -> { required, authed, configured, needsSetup, sealing, locked, lockedMs }
//   POST /api/auth/setup  { passphrase, syncKey? } -> { ok, otpauthUri, qrDataUrl, recoveryCodes, secret } (local, once)
//   POST /api/auth/login  { passphrase, code } | { passphrase, recovery } -> 200 {ok} | 401 | 429 (both carry lockedMs)
//   POST /api/auth/logout
//
// All fetches are try/caught; the component never crashes the app.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ShieldCheck,
  KeyRound,
  Loader2,
  AlertTriangle,
  QrCode,
  Lock,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";

type Sealing = "dpapi" | "machine" | "none";

interface AuthStatus {
  required: boolean;
  authed: boolean;
  configured: boolean;
  needsSetup: boolean;
  sealing?: Sealing;
  locked?: boolean;
  lockedMs?: number;
}

interface SetupInfo {
  otpauthUri?: string;
  qrDataUrl?: string;
  recoveryCodes?: string[];
  secret?: string;
}

const fade = { duration: 0.4, ease: "easeInOut" } as const;

/* ---------- small shared bits ---------- */

function SealChip({ sealing }: { sealing?: Sealing }) {
  if (sealing === "machine") {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-amber-400/80">
        <AlertTriangle className="h-3 w-3" /> device sealing: fallback (not DPAPI)
      </div>
    );
  }
  if (sealing === "dpapi") {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-emerald-400/70">
        <Lock className="h-3 w-3" /> sealed to this Windows account
      </div>
    );
  }
  return null;
}

function Field({
  label,
  icon,
  ...rest
}: {
  label: string;
  icon: React.ReactNode;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
        {icon} {label}
      </label>
      <input
        {...rest}
        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-emerald-200 placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all disabled:opacity-50"
      />
    </div>
  );
}

function CardShell({
  children,
  shake,
  accent,
}: {
  children: React.ReactNode;
  shake?: boolean;
  accent?: "emerald" | "cyan";
}) {
  return (
    <motion.div
      animate={shake ? { x: [0, -8, 8, -6, 6, -3, 3, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
      className={`bg-slate-900 border rounded-xl p-6 shadow-2xl space-y-5 ${
        accent === "cyan" ? "border-cyan-500/30" : "border-slate-800"
      }`}
    >
      {children}
    </motion.div>
  );
}

function Header({ title, sub, sealing }: { title: string; sub: string; sealing?: Sealing }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-100">{title}</h1>
          <p className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">{sub}</p>
        </div>
      </div>
      <SealChip sealing={sealing} />
    </div>
  );
}

/* ---------- main gate ---------- */

export default function LoginGate({
  apiBase,
  children,
}: {
  apiBase: string;
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [checking, setChecking] = useState(true);

  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // unlock state
  const [passphrase, setPassphrase] = useState("");
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);

  // lock countdown (seconds remaining)
  const [lockLeft, setLockLeft] = useState(0);
  const lockTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // setup state
  const [setupPass, setSetupPass] = useState("");
  const [setupConfirm, setSetupConfirm] = useState("");
  const [syncKey, setSyncKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [setupInfo, setSetupInfo] = useState<SetupInfo | null>(null);
  const [copied, setCopied] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/auth/status`, { credentials: "include" });
      if (r.ok) {
        setStatus((await r.json()) as AuthStatus);
      } else {
        // If status can't be read, fail open to the app rather than locking out.
        setStatus({ required: false, authed: true, configured: false, needsSetup: false });
      }
    } catch {
      setStatus({ required: false, authed: true, configured: false, needsSetup: false });
    } finally {
      setChecking(false);
    }
  }, [apiBase]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Seed / drive the lock countdown from status.
  const startCountdown = useCallback((ms: number) => {
    if (lockTimer.current) clearInterval(lockTimer.current);
    const until = Date.now() + ms;
    const tick = () => {
      const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setLockLeft(left);
      if (left <= 0 && lockTimer.current) {
        clearInterval(lockTimer.current);
        lockTimer.current = null;
      }
    };
    tick();
    lockTimer.current = setInterval(tick, 250);
  }, []);

  useEffect(() => {
    if (status?.locked && status.lockedMs && status.lockedMs > 0) {
      startCountdown(status.lockedMs);
    }
    return () => {
      if (lockTimer.current) clearInterval(lockTimer.current);
    };
  }, [status?.locked, status?.lockedMs, startCountdown]);

  const triggerError = (msg: string) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const locked = lockLeft > 0;

  /* ---- unlock submit ---- */
  const submitLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (locked) return;
    setError("");
    const pass = passphrase.trim();
    const secret = useRecovery ? recovery.trim() : code.trim();
    if (!pass || !secret) return;
    setSubmitting(true);
    try {
      const body = useRecovery
        ? { passphrase: pass, recovery: secret }
        : { passphrase: pass, code: secret };
      const r = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (r.ok) {
        setPassphrase("");
        setCode("");
        setRecovery("");
        await checkStatus();
        setStatus((prev) => (prev ? { ...prev, authed: true } : prev));
      } else {
        let lockedMs = 0;
        try {
          const j = await r.json();
          lockedMs = Number(j?.lockedMs) || 0;
        } catch {
          /* ignore */
        }
        if (r.status === 429 || lockedMs > 0) {
          startCountdown(lockedMs || 30000);
          triggerError("too many attempts — locked");
        } else {
          triggerError("invalid passphrase or code");
        }
      }
    } catch {
      triggerError("network error — is the server running?");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---- first-run setup submit ---- */
  const passTooShort = setupPass.length > 0 && setupPass.length < 8;
  const passMismatch = setupConfirm.length > 0 && setupConfirm !== setupPass;
  const setupValid = setupPass.length >= 8 && setupConfirm === setupPass;

  const submitSetup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    if (!setupValid) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${apiBase}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          passphrase: setupPass,
          ...(syncKey.trim() ? { syncKey: syncKey.trim() } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.ok) {
        setSetupPass("");
        setSetupConfirm("");
        setSyncKey("");
        setSetupInfo(j as SetupInfo); // shows the one-time recovery screen
      } else {
        triggerError(j?.error || "setup failed");
      }
    } catch {
      triggerError("network error — is the server running?");
    } finally {
      setSubmitting(false);
    }
  };

  // After setup the server has already set the session cookie. Confirming the
  // recovery codes re-reads status so {children} render.
  const confirmSavedAndEnter = async () => {
    setSetupInfo(null);
    await checkStatus();
    setStatus((prev) => (prev ? { ...prev, authed: true, needsSetup: false } : prev));
  };

  const copySecret = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable; the text is selectable as a fallback */
    }
  };

  /* ---------- render decisions ---------- */

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  // Authed (or auth not required) -> render the app, exactly as before.
  if (!status || !status.required || status.authed) {
    return <>{children}</>;
  }

  const Wrap = ({ children: inner }: { children: React.ReactNode }) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={fade}
        className="w-full max-w-md"
      >
        {inner}
      </motion.div>
    </div>
  );

  /* ===== STATE: post-setup recovery confirmation (shown once) ===== */
  if (setupInfo) {
    return (
      <Wrap>
        <CardShell accent="cyan">
          <Header
            title="Vault created"
            sub="Save your recovery codes"
            sealing={status.sealing}
          />

          <div className="space-y-2">
            <p className="text-xs text-slate-400">
              Scan this QR code in an authenticator app (Google Authenticator, Authy, 1Password…).
            </p>
            {setupInfo.qrDataUrl && (
              <div className="flex justify-center">
                <img
                  src={setupInfo.qrDataUrl}
                  alt="TOTP setup QR code"
                  className="rounded-lg bg-white p-2 h-44 w-44"
                />
              </div>
            )}
            {setupInfo.secret && (
              <div className="text-center space-y-1">
                <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                  Or enter this key manually
                </div>
                <div className="flex items-center justify-center gap-2">
                  <code className="text-xs font-mono text-emerald-300 break-all select-all">
                    {setupInfo.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => copySecret(setupInfo.secret!)}
                    className="text-slate-500 hover:text-cyan-300 transition-all"
                    aria-label="Copy secret"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {setupInfo.recoveryCodes && setupInfo.recoveryCodes.length > 0 && (
            <div className="bg-slate-950 border border-amber-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Recovery codes — shown only once
              </div>
              <p className="text-[10px] text-slate-500">
                Store these somewhere safe. Each works a single time if you lose your
                authenticator. They will never be shown again.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {setupInfo.recoveryCodes.map((rc) => (
                  <code
                    key={rc}
                    className="text-xs font-mono text-amber-200 bg-slate-900 rounded px-2 py-1 text-center select-all"
                  >
                    {rc}
                  </code>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={confirmSavedAndEnter}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="h-4 w-4" /> I&apos;ve saved these — enter Veridian
          </button>
        </CardShell>
      </Wrap>
    );
  }

  /* ===== STATE: first-run setup ===== */
  if (status.needsSetup) {
    return (
      <Wrap>
        <CardShell shake={shake} accent="cyan">
          <Header
            title="Veridian — First-run setup"
            sub="Create your strong login"
            sealing={status.sealing}
          />
          <p className="text-xs text-slate-400">
            Choose a master passphrase. It seals an on-device vault and pairs with a
            TOTP authenticator for 2FA. This can only be done once, locally.
          </p>

          <form onSubmit={submitSetup} className="space-y-3">
            <Field
              label="Master passphrase"
              icon={<KeyRound className="h-3.5 w-3.5" />}
              type="password"
              autoFocus
              autoComplete="new-password"
              value={setupPass}
              onChange={(ev) => setSetupPass(ev.target.value)}
              placeholder="at least 8 characters"
            />
            <div>
              <Field
                label="Confirm passphrase"
                icon={<KeyRound className="h-3.5 w-3.5" />}
                type="password"
                autoComplete="new-password"
                value={setupConfirm}
                onChange={(ev) => setSetupConfirm(ev.target.value)}
                placeholder="repeat passphrase"
              />
              <AnimatePresence>
                {(passTooShort || passMismatch) && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-[11px] text-rose-400 font-mono mt-1.5"
                  >
                    {passTooShort
                      ? "passphrase must be at least 8 characters"
                      : "passphrases don't match"}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* advanced: cross-device sync key */}
            <div className="border-t border-slate-800 pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className="w-full flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-slate-500 hover:text-cyan-300 transition-all"
              >
                <span>Advanced — cross-device sync key</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={fade}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 space-y-2">
                      <Field
                        label="Sync key (optional)"
                        icon={<KeyRound className="h-3.5 w-3.5" />}
                        type="text"
                        autoComplete="off"
                        value={syncKey}
                        onChange={(ev) => setSyncKey(ev.target.value)}
                        placeholder="leave blank to keep this device independent"
                      />
                      <p className="text-[10px] text-slate-500">
                        Enter the same value on each device to share clipboard across them.
                        Leave blank to keep devices independent.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
              disabled={submitting || !setupValid}
              className="w-full px-3 py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? "Creating vault…" : "Create vault"}
            </button>
          </form>
        </CardShell>
      </Wrap>
    );
  }

  /* ===== STATE: unlock (configured && !authed) ===== */
  return (
    <Wrap>
      <CardShell shake={shake}>
        <Header
          title="Veridian — Admin Access"
          sub="Passphrase + 2FA required"
          sealing={status.sealing}
        />

        <form onSubmit={submitLogin} className="space-y-3">
          <Field
            label="Master passphrase"
            icon={<KeyRound className="h-3.5 w-3.5" />}
            type="password"
            autoFocus
            autoComplete="current-password"
            disabled={locked || submitting}
            value={passphrase}
            onChange={(ev) => setPassphrase(ev.target.value)}
            placeholder="master passphrase"
          />

          {!useRecovery ? (
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Authenticator code
              </label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                disabled={locked || submitting}
                value={code}
                onChange={(ev) => setCode(ev.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-center text-2xl font-mono tracking-[0.4em] text-emerald-300 placeholder-slate-700 focus:border-emerald-500/50 focus:outline-none transition-all disabled:opacity-50"
              />
            </div>
          ) : (
            <Field
              label="Recovery code"
              icon={<KeyRound className="h-3.5 w-3.5" />}
              type="text"
              autoComplete="off"
              disabled={locked || submitting}
              value={recovery}
              onChange={(ev) => setRecovery(ev.target.value)}
              placeholder="xxxxx-xxxxx"
            />
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
            disabled={submitting || locked}
            className="w-full px-3 py-2.5 rounded-lg text-sm font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {locked ? (
              <>
                <Lock className="h-4 w-4" /> locked, try again in {lockLeft}s
              </>
            ) : submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" /> Unlock
              </>
            )}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError("");
            setCode("");
            setRecovery("");
          }}
          className="w-full text-center text-[11px] font-mono text-slate-500 hover:text-cyan-300 transition-all"
        >
          {useRecovery ? "← Use an authenticator code" : "Use a recovery code instead"}
        </button>
      </CardShell>
    </Wrap>
  );
}
