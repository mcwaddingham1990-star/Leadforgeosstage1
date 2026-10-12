type PersistenceTask = () => Promise<void>;

const tails = new Map<string, Promise<void>>();
const active = new Set<Promise<void>>();

/**
 * Serializes persistence work per logical resource key while still allowing
 * unrelated collections to save in parallel.
 *
 * This closes a real stale-write race in optimistic UI flows: two fast state
 * updates used to launch two Firestore syncs at once, allowing the older
 * write to finish after the newer one and become the value seen after the
 * next login.
 */
export function enqueuePersistenceTask(key: string, task: PersistenceTask): Promise<void> {
  const previous = tails.get(key) ?? Promise.resolve();

  const run = previous
    .catch(() => undefined)
    .then(task);

  tails.set(key, run);
  active.add(run);

  void run.finally(() => {
    active.delete(run);
    if (tails.get(key) === run) {
      tails.delete(key);
    }
  }).catch(() => undefined);

  return run;
}

/**
 * Wait until every app-level persistence task is finished, including work
 * that is still queued behind another save or sitting in its retry delay.
 */
export async function waitForPersistenceQueue(): Promise<void> {
  while (active.size > 0) {
    await Promise.allSettled([...active]);
  }
}

export function hasPendingPersistenceTasks(): boolean {
  return active.size > 0;
}

/**
 * Registers save work that runs outside enqueuePersistenceTask (direct
 * setDoc calls, writes still waiting on a server ack) so logout and the
 * "unsaved changes" guard wait for it too.
 */
export function trackPersistencePromise(work: Promise<unknown>): void {
  const tracked = work.then(() => undefined, () => undefined);
  active.add(tracked);
  void tracked.finally(() => active.delete(tracked));
}

/**
 * Like waitForPersistenceQueue, but gives up after `timeoutMs` (e.g. offline,
 * where a write never resolves) and reports whether everything finished.
 */
export async function waitForPersistenceQueueWithin(timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([waitForPersistenceQueue().then(() => true as const), timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
