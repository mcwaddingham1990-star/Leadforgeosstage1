/**
 * App-wide save status: what the little "Saving… / All changes saved /
 * Couldn't save — Retry" indicator shows, plus the retry registry behind its
 * Retry button.
 *
 * Every Firestore save path reports into this one place:
 *  - useFirestoreCollection (all optimistic collection setters)
 *  - trackSave() below (direct setDoc/updateDoc calls such as settings blobs)
 *
 * Framework-agnostic (no React import, mirrors syncErrorBus.ts) so it can be
 * used from hooks, components and plain lib code alike.
 */
import { trackPersistencePromise, waitForPersistenceQueueWithin } from "./persistenceQueue";
import { emitSyncError } from "./syncErrorBus";

export type SyncState = "idle" | "saving" | "saved" | "offline" | "error";

export interface SyncSnapshot {
  state: SyncState;
  /** Number of saves still in flight. */
  pending: number;
  /** Human-readable failure messages, newest last (only while state === "error"). */
  errors: string[];
}

type Listener = (snapshot: SyncSnapshot) => void;

const listeners = new Set<Listener>();
let inFlight = 0;
let lastResult: "none" | "saved" = "none";
const failures = new Map<string, { message: string; retry: () => void }>();

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export function getSyncSnapshot(): SyncSnapshot {
  const errors = [...failures.values()].map(f => f.message);
  let state: SyncState = "idle";
  if (errors.length) state = "error";
  else if (inFlight > 0) state = isOffline() ? "offline" : "saving";
  else if (lastResult === "saved") state = "saved";
  return { state, pending: inFlight, errors };
}

function notify() {
  const snapshot = getSyncSnapshot();
  listeners.forEach(listener => listener(snapshot));
}

export function onSyncStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(getSyncSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

/** Marks one save as started; call the returned function exactly once when it settles. */
export function beginSave(): (ok: boolean) => void {
  inFlight += 1;
  notify();
  let done = false;
  return (ok: boolean) => {
    if (done) return;
    done = true;
    inFlight = Math.max(0, inFlight - 1);
    if (ok) lastResult = "saved";
    notify();
  };
}

/**
 * Records a save that failed after its retries. `key` de-duplicates repeat
 * failures of the same thing (e.g. the same collection); `retry` is what the
 * Retry button (and coming back online) runs.
 */
export function reportSaveFailure(key: string, message: string, retry: () => void): void {
  const isNew = !failures.has(key);
  failures.set(key, { message, retry });
  notify();
  if (isNew) emitSyncError(message);
}

export function clearSaveFailure(key: string): void {
  if (failures.delete(key)) notify();
}

export function hasSaveFailures(): boolean {
  return failures.size > 0;
}

/**
 * Hides the failure pill without retrying (e.g. an employee whose role can't
 * edit something). Unsaved collection changes stay pending and go out again
 * with the next save to that collection.
 */
export function dismissSaveFailures(): void {
  if (!failures.size) return;
  failures.clear();
  notify();
}

/** Re-runs every failed save. Wired to the indicator's Retry button and the browser's `online` event. */
export function retryFailedSaves(): void {
  const pending = [...failures.entries()];
  failures.clear();
  notify();
  pending.forEach(([, failure]) => {
    try {
      failure.retry();
    } catch (error) {
      console.error("Retrying a failed save threw:", error);
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    notify();
    if (failures.size) retryFailedSaves();
  });
  window.addEventListener("offline", notify);
}

const NON_RETRYABLE_CODES = new Set([
  "invalid-argument",
  "not-found",
  "already-exists",
  "failed-precondition",
  "out-of-range",
  "unimplemented",
  "data-loss",
]);

/**
 * Whether a failed Firestore call is worth retrying. Network/availability
 * problems are; malformed data is not. permission-denied gets retried too:
 * right after sign-in the rules' profile lookups can briefly lag behind auth.
 */
export function isRetryableError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (!code) return true;
  return !NON_RETRYABLE_CODES.has(code.replace(/^firestore\//, ""));
}

export function describeError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code?.replace(/^firestore\//, "");
  if (code === "permission-denied") return "you don't have permission to save this";
  if (code === "unavailable" || code === "deadline-exceeded") return "the connection dropped";
  if (code === "resource-exhausted") return "the record is too large or the quota was hit";
  if (code === "invalid-argument") return "the data couldn't be stored";
  const message = error instanceof Error ? error.message : "";
  // handleFirestoreError wraps details as JSON; show just the readable part.
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed.error === "string") return parsed.error;
  } catch { /* not JSON */ }
  return message || "unknown error";
}

export const RETRY_DELAYS_MS = [1000, 3000, 8000];

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Runs a save with automatic retry (backoff 1s / 3s / 8s), reports it to the
 * save indicator, keeps logout waiting until it settles, and on final failure
 * registers a Retry instead of failing silently. Rethrows the final error so
 * callers that show their own message (e.g. a form's inline error) still can.
 */
export async function trackSave<T>(label: string, operation: () => Promise<T>, options?: { key?: string }): Promise<T> {
  const key = options?.key || `save:${label}`;
  clearSaveFailure(key);
  const finish = beginSave();
  const run = (async () => {
    let attempt = 0;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= RETRY_DELAYS_MS.length || !isRetryableError(error)) throw error;
        console.warn(`Saving ${label} failed (attempt ${attempt + 1}); retrying.`, error);
        await sleep(RETRY_DELAYS_MS[attempt]);
        attempt += 1;
      }
    }
  })();
  trackPersistencePromise(run);
  try {
    const result = await run;
    finish(true);
    return result;
  } catch (error) {
    console.error(`Couldn't save ${label}:`, error);
    finish(false);
    reportSaveFailure(key, `Couldn't save ${label}: ${describeError(error)}.`, () => {
      void trackSave(label, operation, options).catch(() => undefined);
    });
    throw error;
  }
}

/**
 * For "don't say Saved until it really is" flows (Build Job, project
 * completion): waits for the app's queued saves and then the SDK's own
 * pending writes. Resolves "saved" once the server has confirmed everything,
 * or "queued" if that takes longer than `timeoutMs` (typically offline) --
 * the writes are then safely queued on this device and will sync later.
 * A write the server refuses is reported (with Retry) by the save indicator.
 */
export async function waitForSavesToReachServer(
  waitForPendingWrites: () => Promise<void>,
  timeoutMs = 10000
): Promise<"saved" | "queued"> {
  // Let saves scheduled in this tick (setter -> microtask -> queue) start first.
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  const started = Date.now();
  const drained = await waitForPersistenceQueueWithin(timeoutMs);
  if (!drained) return "queued";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      waitForPendingWrites().then(() => "saved" as const),
      new Promise<"queued">(resolve => {
        timer = setTimeout(() => resolve("queued"), Math.max(1000, timeoutMs - (Date.now() - started)));
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
