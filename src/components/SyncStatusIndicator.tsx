import { useEffect, useRef, useState } from "react";
import { CheckCircle, CloudOff, Loader2, AlertTriangle, RotateCw, X } from "lucide-react";
import { dismissSaveFailures, getSyncSnapshot, onSyncStatus, retryFailedSaves, SyncSnapshot } from "../lib/syncStatus";
import { hasPendingPersistenceTasks } from "../lib/persistenceQueue";

/**
 * Small save-status pill (bottom-left, clear of the System Alert toast and the
 * AI widget on the right): "Saving…" while any save is in flight, a brief
 * "All changes saved" confirmation afterwards, "Offline" while saves are
 * queued without a connection, and "Couldn't save" with a Retry button when a
 * save failed after its automatic retries.
 */
export function SyncStatusIndicator() {
  const [snapshot, setSnapshot] = useState<SyncSnapshot>(getSyncSnapshot);
  const [showSaved, setShowSaved] = useState(false);
  const [showSaving, setShowSaving] = useState(false);
  const previousState = useRef(snapshot.state);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>();
  const savingTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => onSyncStatus(setSnapshot), []);

  useEffect(() => {
    const was = previousState.current;
    previousState.current = snapshot.state;
    if (snapshot.state === "saving" || snapshot.state === "offline") {
      setShowSaved(false);
      // Most saves finish in well under a second; only show "Saving…" when
      // one is actually slow, so the pill doesn't flicker on every keystroke.
      clearTimeout(savingTimer.current);
      savingTimer.current = setTimeout(() => setShowSaving(true), 600);
      return;
    }
    clearTimeout(savingTimer.current);
    setShowSaving(false);
    if (snapshot.state === "saved" && (was === "saving" || was === "offline")) {
      setShowSaved(true);
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setShowSaved(false), 2000);
    }
  }, [snapshot.state]);

  useEffect(() => () => {
    clearTimeout(savedTimer.current);
    clearTimeout(savingTimer.current);
  }, []);

  // Closing or refreshing the tab while a save is still on its way is the
  // classic way to lose the last edit -- let the browser ask first.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingPersistenceTasks()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const base = "fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold shadow-lg max-w-[calc(100vw-3rem)]";

  if (snapshot.state === "error") {
    const latest = snapshot.errors[snapshot.errors.length - 1];
    return (
      <div role="alert" className={`${base} rounded-2xl bg-slate-900 border-red-500/40 text-red-200`}>
        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
        <span className="leading-tight">
          {snapshot.errors.length > 1 ? `${snapshot.errors.length} changes couldn't be saved.` : latest}
        </span>
        <button
          type="button"
          onClick={retryFailedSaves}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-red-100 hover:bg-red-500/30 cursor-pointer shrink-0"
        >
          <RotateCw className="w-3 h-3" /> Retry
        </button>
        <button
          type="button"
          onClick={dismissSaveFailures}
          aria-label="Dismiss"
          className="rounded-full p-0.5 text-red-300 hover:bg-red-500/20 cursor-pointer shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (snapshot.state === "offline" && showSaving) {
    return (
      <div role="status" className={`${base} bg-slate-900 border-amber-500/40 text-amber-200`}>
        <CloudOff className="w-4 h-4 text-amber-400" />
        Offline -- changes will save when you reconnect
      </div>
    );
  }

  if (snapshot.state === "saving" && showSaving) {
    return (
      <div role="status" className={`${base} bg-slate-900 border-blue-500/30 text-slate-200`}>
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        Saving…
      </div>
    );
  }

  if (showSaved) {
    return (
      <div role="status" className={`${base} bg-slate-900 border-emerald-500/30 text-emerald-200`}>
        <CheckCircle className="w-4 h-4 text-emerald-400" />
        All changes saved
      </div>
    );
  }

  return null;
}
