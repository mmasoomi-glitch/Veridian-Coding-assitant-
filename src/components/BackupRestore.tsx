import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Database, HardDriveDownload, FolderUp, RotateCcw, Loader2, Check, X, Server, Terminal } from "lucide-react";

interface BackupRecord {
  id: string;
  ts: string;
  name: string;
  localPath: string;
  remotePath: string;
  fileCount: number;
  bytes: number;
  ok: boolean;
  note: string;
}

interface BackupListing {
  local: BackupRecord[];
  remote: string[];
}

// For the "config for future use" block — mirrors autopilot/backup.ts defaults.
// Purely informational; the server holds the authoritative (env-overridable) values.
const CFG = {
  host: "root@89.167.49.209",
  remoteRoot: "/mnt/volume-hel1-1/veridian-backups",
  key: "%USERPROFILE%\\.ssh\\veridian_deploy"
};
const SCP_TEMPLATE = `scp -r -i "${CFG.key}" -o BatchMode=yes -o StrictHostKeyChecking=accept-new "<LOCAL_PATH>/." ${CFG.host}:"${CFG.remoteRoot}/<NAME>/"`;

function fmtBytes(n: number): string {
  if (!n || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

export default function BackupRestore({ apiBase }: { apiBase: string }) {
  const [localPath, setLocalPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BackupRecord | null>(null);
  const [error, setError] = useState<string>("");

  const [listing, setListing] = useState<BackupListing>({ local: [], remote: [] });

  // Per-row restore state.
  const [restoreFor, setRestoreFor] = useState<string | null>(null);
  const [restoreDest, setRestoreDest] = useState("");
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<{ ok: boolean; note: string } | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/backups`);
      if (!r.ok) return;
      const data: BackupListing = await r.json();
      setListing({ local: data.local || [], remote: data.remote || [] });
    } catch { /* offline; ignore */ }
  }, [apiBase]);

  useEffect(() => { loadBackups(); }, [loadBackups]);

  const doBackup = async () => {
    if (!localPath.trim()) { setError("Enter a folder path to back up."); return; }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch(`${apiBase}/api/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: localPath.trim() })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const rec: BackupRecord = await r.json();
      setResult(rec);
      await loadBackups();
    } catch (e: any) {
      setError(`Backup failed (is the server running?): ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  const doRestore = async (name: string) => {
    if (!restoreDest.trim()) { setRestoreMsg({ ok: false, note: "Enter a destination path." }); return; }
    setRestoreBusy(true);
    setRestoreMsg(null);
    try {
      const r = await fetch(`${apiBase}/api/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dest: restoreDest.trim() })
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      const data: { ok: boolean; note: string } = await r.json();
      setRestoreMsg(data);
      if (data.ok) { setRestoreFor(null); setRestoreDest(""); }
    } catch (e: any) {
      setRestoreMsg({ ok: false, note: `Restore failed (is the server running?): ${e?.message || e}` });
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-cyan-400">
        <Database className="h-3.5 w-3.5" /> Backup &amp; Restore &rarr; Hetzner Volume
      </div>

      {/* Backup now */}
      <div className="space-y-2">
        <label className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Local folder to back up</label>
        <div className="flex gap-2">
          <input
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="C:\path\to\folder"
            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
          />
          <button
            onClick={doBackup}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardDriveDownload className="h-3.5 w-3.5" />}
            {busy ? "Backing up…" : "Backup now"}
          </button>
        </div>

        {error && <p className="text-[11px] text-rose-400 font-mono">{error}</p>}

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className={`rounded-lg p-3 border text-xs space-y-1 ${result.ok ? "bg-emerald-500/5 border-emerald-500/30" : "bg-amber-500/5 border-amber-500/30"}`}
            >
              <div className="flex items-center gap-1.5 font-semibold">
                {result.ok
                  ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> <span className="text-emerald-300">Backed up</span></>
                  : <><X className="h-3.5 w-3.5 text-amber-400" /> <span className="text-amber-300">Not completed</span></>}
                <span className="text-slate-200 font-mono truncate">{result.name}</span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">{fmtDate(result.ts)}</p>
              {result.ok && (
                <p className="text-[11px] text-slate-400 font-mono">
                  {result.fileCount} file(s) · {fmtBytes(result.bytes)} · &rarr; {result.remotePath}
                </p>
              )}
              {result.note && <p className="text-[11px] text-slate-300">{result.note}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Backup list */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-purple-400">
            <Server className="h-3.5 w-3.5" /> Backups ({listing.local.length})
          </div>
          {listing.remote.length > 0 && (
            <span className="text-[10px] text-slate-500 font-mono">{listing.remote.length} on volume</span>
          )}
        </div>

        {listing.local.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">No backups recorded yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto">
            <AnimatePresence initial={false}>
              {listing.local.map((b) => {
                const onVolume = listing.remote.includes(b.name);
                return (
                  <motion.div
                    key={b.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: "easeInOut" }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-200 font-semibold truncate">{b.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-mono ${b.ok ? "text-emerald-400" : "text-amber-400"}`}>
                          {b.ok ? "ok" : "failed"}{onVolume ? " · on volume" : ""}
                        </span>
                        <button
                          onClick={() => { setRestoreFor(restoreFor === b.name ? null : b.name); setRestoreMsg(null); setRestoreDest(""); }}
                          className="px-2 py-1 rounded-lg text-[11px] font-bold border border-slate-700 text-slate-300 hover:border-cyan-500/50 hover:text-cyan-300 transition-all flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" /> Restore
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">
                      {fmtDate(b.ts)} · {b.fileCount} file(s) · {fmtBytes(b.bytes)}
                    </p>
                    <p className="text-[10px] text-slate-600 font-mono truncate">{b.localPath} &rarr; {b.remotePath}</p>

                    <AnimatePresence>
                      {restoreFor === b.name && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-2 pt-1.5">
                            <input
                              value={restoreDest}
                              onChange={(e) => setRestoreDest(e.target.value)}
                              placeholder="restore into… C:\path\to\dest"
                              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none"
                            />
                            <button
                              onClick={() => doRestore(b.name)}
                              disabled={restoreBusy}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all disabled:opacity-60 flex items-center gap-1 whitespace-nowrap"
                            >
                              {restoreBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderUp className="h-3 w-3" />}
                              Restore here
                            </button>
                          </div>
                          {restoreMsg && (
                            <p className={`text-[10px] font-mono mt-1 ${restoreMsg.ok ? "text-emerald-400" : "text-amber-400"}`}>
                              {restoreMsg.note}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Config for future use */}
      <div className="border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-slate-500 mb-2">
          <Terminal className="h-3.5 w-3.5" /> Config for future use
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-2.5 space-y-1 text-[10px] font-mono text-slate-400 break-all">
          <p><span className="text-slate-600">host: </span>{CFG.host}</p>
          <p><span className="text-slate-600">remote root: </span>{CFG.remoteRoot}</p>
          <p><span className="text-slate-600">key: </span>{CFG.key}</p>
          <p className="text-slate-600 pt-1">scp template:</p>
          <pre className="text-cyan-300/80 whitespace-pre-wrap break-all">{SCP_TEMPLATE}</pre>
        </div>
      </div>
    </div>
  );
}
