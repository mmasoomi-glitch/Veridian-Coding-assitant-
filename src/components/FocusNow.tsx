import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Home, GitBranch, Bell, AlertTriangle } from 'lucide-react';
import { summarizeFocus, type FocusSummary, type CurrentState } from './focus-summary';

interface WaitingItem {
  title?: string;
  label?: string;
  id?: string;
}

export default function FocusNow({ apiBase }: { apiBase: string }) {
  const baseUrl = apiBase.replace(/\/$/, ''); // remove trailing slash if any

  // States
  const [telemetry, setTelemetry] = useState<FocusSummary | 'error' | null>(null);
  const [waitingItems, setWaitingItems] = useState<WaitingItem[] | 'error' | null>(null);
  const [loading, setLoading] = useState(true);

  // Ref to prevent flicker: only update state when serialised value changes
  const prevTelemetryRef = useRef<string>('');
  const prevWaitingRef = useRef<string>('');

  const fetchTelemetry = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/telemetry/current`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Telemetry fetch failed');
      const data = await res.json();
      const cs: CurrentState | null | undefined = data?.currentState;
      const summary = summarizeFocus(cs);
      const summaryStr = JSON.stringify(summary);

      if (summaryStr !== prevTelemetryRef.current) {
        setTelemetry(summary);
        prevTelemetryRef.current = summaryStr;
      }
    } catch {
      const errState = 'error' as const;
      if (prevTelemetryRef.current !== errState) {
        setTelemetry(errState);
        prevTelemetryRef.current = errState;
      }
    }
  };

  const fetchWaiting = async () => {
    try {
      const res = await fetch(`${baseUrl}/api/waiting`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Waiting fetch failed');
      const data: WaitingItem[] = await res.json();
      const itemsStr = JSON.stringify(data);

      if (itemsStr !== prevWaitingRef.current) {
        setWaitingItems(data);
        prevWaitingRef.current = itemsStr;
      }
    } catch {
      const errState = 'error' as const;
      if (prevWaitingRef.current !== errState) {
        setWaitingItems(errState);
        prevWaitingRef.current = errState;
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    const initialFetch = async () => {
      await Promise.all([fetchTelemetry(), fetchWaiting()]);
      if (mounted) setLoading(false);
    };
    initialFetch();

    const interval = setInterval(async () => {
      await Promise.all([fetchTelemetry(), fetchWaiting()]);
      // keep loading false (in case of transient errors we still show last successful data)
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  // ----------------------------------------------------------------
  //  Focus Now card
  // ----------------------------------------------------------------
  const renderFocusNow = () => {
    if (loading) {
      return (
        <motion.div
          key="focus-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="p-4 font-mono text-slate-400"
        >
          loading…
        </motion.div>
      );
    }

    if (telemetry === 'error') {
      return (
        <motion.div
          key="focus-error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="p-4 rounded-md border border-slate-700 bg-slate-800/50"
        >
          <AlertTriangle className="mr-2 inline-block h-5 w-5 text-amber-500" />
          <span className="font-mono text-slate-400">telemetry unavailable</span>
        </motion.div>
      );
    }

    if (telemetry) {
      const {
        project,
        activity,
        modifiedCount,
        latestCommit,
        clipboardSecret,
        unknowns,
      } = telemetry;
      return (
        <motion.div
          key={JSON.stringify(telemetry)} // guarantee re-animation on value change
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="space-y-3 rounded-md border border-slate-700 bg-slate-800 p-4"
        >
          {/* Project */}
          <div className="flex items-center gap-2">
            <Home className="h-5 w-5 text-emerald-400" />
            <span className="font-mono text-slate-300">{project}</span>
          </div>

          {/* Activity */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-slate-500">activity</span>
            <span className="font-mono text-slate-300">{activity}</span>
          </div>

          {/* Modified count + latest commit */}
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-cyan-400" />
            <span className="font-mono text-slate-300">
              {modifiedCount} modified
            </span>
            <span className="font-mono text-slate-500">·</span>
            <span className="font-mono text-slate-300">
              latest commit: {latestCommit}
            </span>
          </div>

          {/* Clipboard secret indicator (only if true) */}
          {clipboardSecret && (
            <div className="inline-block rounded bg-red-900/30 px-2 py-1 font-mono text-sm text-red-400">
              clipboard holds a secret
            </div>
          )}

          {/* Missing fields (informational) */}
          {unknowns.length > 0 && (
            <div className="font-mono text-xs text-slate-600">
              missing: {unknowns.join(', ')}
            </div>
          )}
        </motion.div>
      );
    }

    return null; // should not happen
  };

  // ----------------------------------------------------------------
  //  Waiting on you card
  // ----------------------------------------------------------------
  const renderWaiting = () => {
    if (loading) return null; // don't show a separate loading for waiting

    if (waitingItems === 'error') {
      return (
        <motion.div
          key="waiting-error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-4 rounded-md border border-slate-700 bg-slate-800/50 p-4"
        >
          <AlertTriangle className="mr-2 inline-block h-5 w-5 text-amber-500" />
          <span className="font-mono text-slate-400">
            unable to load waiting list
          </span>
        </motion.div>
      );
    }

    if (!waitingItems || waitingItems.length === 0) {
      return (
        <motion.div
          key="waiting-empty"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-4 rounded-md border border-slate-700 bg-slate-800 p-4"
        >
          <Bell className="mr-2 inline-block h-5 w-5 text-slate-500" />
          <span className="font-mono text-slate-400">
            Nothing waiting on you
          </span>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={JSON.stringify(waitingItems)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="mt-4 space-y-2 rounded-md border border-slate-700 bg-slate-800 p-4"
      >
        <h3 className="flex items-center gap-2 font-mono text-sm text-slate-300">
          <Bell className="h-5 w-5 text-cyan-400" />
          Waiting on you
        </h3>
        <ul className="space-y-1">
          {waitingItems.map((item, idx) => (
            <li
              key={item.id || idx}
              className="font-mono text-sm text-slate-400"
            >
              {item.title || item.label || `Item #${idx + 1}`}
              {item.label &&
              item.title &&
              item.label !== item.title
                ? ` (${item.label})`
                : ''}
            </li>
          ))}
        </ul>
      </motion.div>
    );
  };

  // ----------------------------------------------------------------
  //  Main render
  // ----------------------------------------------------------------
  return (
    <div className="p-4">
      <AnimatePresence>
        {renderFocusNow()}
        {renderWaiting()}
      </AnimatePresence>
    </div>
  );
}
