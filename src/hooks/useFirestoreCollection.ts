import { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";
import { writeCollectionItem, subscribeToCollection, subscribeToCollectionByField, fetchCollectionFromServer } from "../lib/firestoreService";
import { emitCollectionEvent, emitRemoteCollectionEvent, hasRemoteCollectionListeners } from "../lib/eventBus";
import { beginSave, clearSaveFailure, describeError, isRetryableError, reportSaveFailure, RETRY_DELAYS_MS } from "../lib/syncStatus";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { enqueuePersistenceTask, trackPersistencePromise } from "../lib/persistenceQueue";

type WithId = { id?: string };

/**
 * Replaces the "intercepting setter + subscribeToCollection + cleanup" block
 * that used to be hand-duplicated once per Firestore-backed collection.
 * Clears local state whenever businessId goes falsy (logout), uniformly for
 * every caller — previously only 6 of 11 collections were cleared on logout.
 *
 * Also the Event Engine's auto-emission point: every collection's create/
 * update/delete is diffed here and emitted on the event bus, so cascade
 * subscribers (src/hooks/useEventEngineSubscribers.ts) work for every write
 * path in the app without any call site needing to wire anything itself.
 */
export function useFirestoreCollection<T extends WithId>(
  collectionName: string,
  businessId: string | undefined,
  options?: { normalize?: (item: T) => T; tenantField?: string; extraFilter?: { field: string; value: string | undefined } }
): [T[], Dispatch<SetStateAction<T[]>>, () => Promise<void>, boolean] {
  const [items, _setItems] = useState<T[]>([]);
  // True once the first server-confirmed snapshot for the current business has arrived.
  // Anything that seeds defaults "when the list is empty" must wait for
  // this -- before it, empty only means "not loaded yet".
  const [loaded, setLoaded] = useState(false);
  const itemsRef = useRef<T[]>([]);
  const collectionItemsRef = useRef<T[]>([]);
  const compatibilityItemsRef = useRef<T[]>([]);
  // Latest local version of every record that isn't confirmed saved yet
  // (null = deleted). Saves always send the version in here at the moment
  // they run, so a retry or a slow earlier save can never write stale data.
  const pendingItemsRef = useRef(new Map<string, T | null>());
  // Version of each record currently handed to Firestore, so an unchanged
  // record isn't re-sent while its first write is still on the way.
  const sentItemsRef = useRef(new Map<string, T | null>());
  const listenerHealthyRef = useRef(false);
  const businessIdRef = useRef(businessId);
  businessIdRef.current = businessId;
  const flushScheduledRef = useRef(false);
  const recentCreatesRef = useRef<RecentCreate[]>([]);

  const publish = () => {
    const merged = new Map<string | undefined, T>();
    compatibilityItemsRef.current.forEach(item => merged.set(item.id, item));
    collectionItemsRef.current.forEach(item => merged.set(item.id, item));
    pendingItemsRef.current.forEach((item, id) => {
      if (item === null) merged.delete(id);
      else merged.set(id, item);
    });
    const next = [...merged.values()];
    itemsRef.current = next;
    _setItems(next);
  };

  const persistenceKey = () => `${businessIdRef.current || "__no_business__"}:${collectionName}`;

  // Hands every not-yet-sent pending record to Firestore. Resolves when the
  // server has confirmed them all; rejects with the first failure.
  const flushPending = (bid: string): Promise<void> => {
    const writes: Promise<void>[] = [];
    pendingItemsRef.current.forEach((desired, id) => {
      if (sentItemsRef.current.has(id) && sentItemsRef.current.get(id) === desired) return;
      sentItemsRef.current.set(id, desired);
      const base = collectionItemsRef.current.find(item => item.id === id);
      const write = writeCollectionItem(
        collectionName,
        id,
        desired as Record<string, unknown> | null,
        base as Record<string, unknown> | undefined,
        bid
      ).then(
        () => {
          if (sentItemsRef.current.get(id) === desired) sentItemsRef.current.delete(id);
          // Confirmed by the server: let the live snapshot (which already
          // includes this write plus anything other devices changed) take
          // over. Only safe while the listener is alive and the query covers
          // every record we write; otherwise clear only once the server copy
          // matches.
          if (pendingItemsRef.current.get(id) !== desired) return;
          const serverItem = collectionItemsRef.current.find(item => item.id === id);
          const matchesServer = desired === null ? !serverItem : samePersistedItem(serverItem, desired);
          if ((listenerHealthyRef.current && !options?.extraFilter) || matchesServer) {
            pendingItemsRef.current.delete(id);
            publish();
          }
        },
        (error) => {
          if (sentItemsRef.current.get(id) === desired) sentItemsRef.current.delete(id);
          throw error;
        }
      );
      writes.push(write);
    });
    return Promise.allSettled(writes).then(results => {
      const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failure) throw failure.reason;
    });
  };

  const runSync = (attempt = 0) => {
    const bid = businessIdRef.current;
    if (!bid) return;
    const failureKey = persistenceKey();
    const finish = beginSave();
    const queued = enqueuePersistenceTask(failureKey, async () => {
      const writes = flushPending(bid);
      trackPersistencePromise(writes);
      // Offline, Firestore queues writes (in IndexedDB, so they survive a
      // refresh) but never resolves them. Don't let that block later saves
      // for this collection: stop waiting after a while and keep watching.
      const outcome = await Promise.race([
        writes.then(() => "saved" as const),
        new Promise<"waiting">(resolve => setTimeout(() => resolve("waiting"), ACK_WAIT_MS))
      ]);
      if (outcome === "waiting") {
        writes.then(
          () => { clearSaveFailure(failureKey); finish(true); },
          (error) => { finish(false); handleSyncFailure(error, attempt); }
        );
        return;
      }
      clearSaveFailure(failureKey);
      finish(true);
    });
    void queued.catch((error) => {
      finish(false);
      handleSyncFailure(error, attempt);
    });
  };

  const handleSyncFailure = (error: unknown, attempt: number) => {
    if (attempt < RETRY_DELAYS_MS.length && isRetryableError(error)) {
      console.warn(`Sync of ${collectionName} failed (attempt ${attempt + 1}); retrying.`, error);
      const retry = new Promise<void>(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt])).then(() => runSync(attempt + 1));
      trackPersistencePromise(retry);
      return;
    }
    console.error(`Failed to sync ${collectionName}; keeping the local change visible.`, error);
    // The change stays visible/editable locally, but it was never actually
    // written -- tell the user and give them a Retry.
    reportSaveFailure(
      persistenceKey(),
      `Couldn't save your ${humanizeCollectionName(collectionName)} change: ${describeError(error)}. Tap Retry, or it won't be saved if you reload.`,
      () => runSync(0)
    );
  };

  const setItems: Dispatch<SetStateAction<T[]>> = (value) => {
    const previous = itemsRef.current;
    const nextList: T[] = dropDoubleSubmits<T>(
      typeof value === "function" ? (value as (prev: T[]) => T[])(previous) : value,
      previous,
      recentCreatesRef.current
    );
    // A record without an id can't be saved (it used to be skipped silently
    // and vanish on reload) -- give it one.
    const withIds = nextList.map((item): T => (item && !item.id ? { ...item, id: generateRecordId(collectionName) } : item));
    const normalizedNext = options?.normalize ? withIds.map(options.normalize) : withIds;
    const normalizedPrev = options?.normalize ? previous.map(options.normalize) : previous;
    const previousById = new Map<string, T>(normalizedPrev.filter(item => item.id).map(item => [item.id as string, item]));
    const nextById = new Map<string, T>(normalizedNext.filter(item => item.id).map(item => [item.id as string, item]));

    let changed = false;
    nextById.forEach((item, id) => {
      if (JSON.stringify(previousById.get(id)) !== JSON.stringify(item)) {
        pendingItemsRef.current.set(id, item);
        changed = true;
      }
    });
    previousById.forEach((_item, id) => {
      if (!nextById.has(id)) {
        pendingItemsRef.current.set(id, null);
        changed = true;
      }
    });

    itemsRef.current = normalizedNext;
    _setItems(normalizedNext);
    emitDiffEvents(collectionName, normalizedPrev, normalizedNext);

    if (!changed || !businessIdRef.current) return;
    // Several setters called in the same tick (e.g. a bulk import or a
    // cascade) become one save.
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    queueMicrotask(() => {
      flushScheduledRef.current = false;
      runSync(0);
    });
  };

  const extraFilterField = options?.extraFilter?.field;
  const extraFilterValue = options?.extraFilter?.value;

  useEffect(() => {
    // When an extraFilter is configured (e.g. notifications' recipientEmail),
    // its value must be known before subscribing -- querying with `undefined`
    // throws, and querying without it would ask Firestore for documents the
    // security rules won't allow the whole list to return (permission-denied,
    // listener dies, collection looks permanently empty).
    collectionItemsRef.current = [];
    compatibilityItemsRef.current = [];
    pendingItemsRef.current.clear();
    sentItemsRef.current.clear();
    listenerHealthyRef.current = false;
    itemsRef.current = [];
    _setItems([]);
    setLoaded(false);
    if (!businessId || (extraFilterField && !extraFilterValue)) return;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let listenAttempt = 0;
    // The first snapshot is the initial load of existing records, not new
    // activity -- only later snapshots are diffed for the remote channel.
    let hasReceivedSnapshot = false;
    const handleDocs = (docs: any[], meta?: { fromCache: boolean }) => {
      listenAttempt = 0;
      listenerHealthyRef.current = true;
      const previousServerItems = collectionItemsRef.current;
      collectionItemsRef.current = options?.normalize ? (docs as T[]).map(options.normalize) : docs as T[];
      const serverById = new Map(collectionItemsRef.current.filter(item => item.id).map(item => [item.id as string, item]));
      pendingItemsRef.current.forEach((pending, id) => {
        if (sentItemsRef.current.has(id)) return; // still on its way; the ack clears it
        const serverItem = serverById.get(id);
        if ((pending === null && !serverItem) || (pending !== null && samePersistedItem(serverItem, pending))) {
          pendingItemsRef.current.delete(id);
        }
      });
      publish();
      if (hasReceivedSnapshot && hasRemoteCollectionListeners(collectionName)) {
        emitDiffEvents(collectionName, previousServerItems, collectionItemsRef.current, emitRemoteCollectionEvent, false);
      }
      // "Loaded" means confirmed by the server: a snapshot served from the
      // offline cache can be partial (or empty on a device that never
      // synced this business), and code that seeds defaults into an "empty"
      // collection would otherwise overwrite the real records.
      if (!meta?.fromCache) setLoaded(true);
      hasReceivedSnapshot = true;
    };
    // A Firestore listener that errors is dead for good. Re-open it with
    // backoff (a permission error right after sign-in, or a dropped
    // connection, usually clears up) instead of leaving the module frozen on
    // whatever it showed last.
    const handleError = (error: unknown) => {
      listenerHealthyRef.current = false;
      if (collectionName === "time_clock_logs") publish();
      if (disposed) return;
      unsubscribe?.();
      unsubscribe = undefined;
      const delay = LISTEN_RETRY_DELAYS_MS[Math.min(listenAttempt, LISTEN_RETRY_DELAYS_MS.length - 1)];
      listenAttempt += 1;
      console.warn(`Live updates for ${collectionName} stopped; reconnecting in ${delay / 1000}s.`, error);
      retryTimer = setTimeout(listen, delay);
    };
    const listen = () => {
      if (disposed) return;
      unsubscribe = options?.tenantField && options.tenantField !== "businessId"
        ? subscribeToCollectionByField(collectionName, options.tenantField, businessId, handleDocs, handleError)
        : subscribeToCollection(collectionName, businessId, handleDocs, handleError, extraFilterField ? { field: extraFilterField, value: extraFilterValue as string } : undefined);
    };
    listen();
    const unsubscribeCompatibility = collectionName === "time_clock_logs"
      ? onSnapshot(doc(db, "business_profiles", businessId), snapshot => {
          const stored = snapshot.data()?.timeClockLogs || {};
          compatibilityItemsRef.current = Object.values(stored).map((item: any) => {
            const { businessId: _, updatedAt: __, ...uiData } = item;
            return uiData as T;
          });
          publish();
        }, error => console.warn("Legacy time clock logs couldn't be loaded:", error))
      : undefined;
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      unsubscribe?.();
      unsubscribeCompatibility?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, businessId, extraFilterField, extraFilterValue]);

  // A live onSnapshot listener that hits a permission-denied/unavailable
  // error terminates for good rather than retrying — this gives the UI a
  // way to recover with a genuine server read instead of a listener that's
  // already dead, without triggering the two-way sync-to-Firestore writes
  // that the returned setItems performs.
  const refresh = async () => {
    if (!businessId) return;
    const fresh = (await fetchCollectionFromServer(collectionName, businessId, options?.tenantField)) as T[];
    collectionItemsRef.current = options?.normalize ? fresh.map(options.normalize) : fresh;
    publish();
  };

  return [items, setItems, refresh, loaded];
}

type RecentCreate = { signature: string; at: number };
const DOUBLE_SUBMIT_WINDOW_MS = 700;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A record's content with ids and timestamps removed -- what two copies made by one double-tap have in common. */
function contentSignature(value: unknown): string {
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (typeof v === "string" && ISO_TIMESTAMP.test(v)) return "<time>";
    if (typeof v === "number" && v > 1e12) return "<time>";
    if (v !== null && typeof v === "object") {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>)
        .filter(([key]) => key !== "id")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, strip(nested)]));
    }
    return v;
  };
  return JSON.stringify(strip(value));
}

/**
 * Drops a newly created record that is identical (apart from its generated
 * id and timestamps) to one created by a *separate* update less than 0.7s
 * earlier -- i.e. the same Save tapped twice. Copies created together in one
 * update (imports, bulk adds) are never touched.
 */
export function dropDoubleSubmits<T extends WithId>(next: T[], previous: T[], recent: RecentCreate[]): T[] {
  const now = Date.now();
  for (let i = recent.length - 1; i >= 0; i--) {
    if (now - recent[i].at > DOUBLE_SUBMIT_WINDOW_MS) recent.splice(i, 1);
  }
  const previousIds = new Set(previous.map(item => item.id));
  const created = next.filter(item => item && !previousIds.has(item.id));
  if (!created.length) return next;
  const recentSignatures = new Set(recent.map(entry => entry.signature));
  const dropped = new Set<T>();
  const kept: RecentCreate[] = [];
  created.forEach(item => {
    const signature = contentSignature(item);
    if (recentSignatures.has(signature)) {
      dropped.add(item);
      console.info("Ignored a duplicate record from a repeated save tap.");
    } else {
      kept.push({ signature, at: now });
    }
  });
  recent.push(...kept);
  return dropped.size ? next.filter(item => !dropped.has(item)) : next;
}

/** How long one save waits for the server before letting the next save for the same collection go ahead. */
const ACK_WAIT_MS = 10000;
const LISTEN_RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

function generateRecordId(collectionName: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 12);
  return `${collectionName}_${Date.now()}_${random}`;
}

function humanizeCollectionName(collectionName: string): string {
  return collectionName.replace(/_/g, " ");
}

// These fields are persistence metadata added on write and deliberately
// removed by collection subscriptions. Ignoring them lets acknowledged
// optimistic writes clear instead of masking later Firestore transactions.
function samePersistedItem<T>(serverItem: T | undefined, pendingItem: T): boolean {
  if (!serverItem) return false;
  const withoutMetadata = (item: T) => {
    const { businessId: _businessId, updatedAt: _updatedAt, ...rest } = item as T & {
      businessId?: unknown;
      updatedAt?: unknown;
    };
    return rest;
  };
  return JSON.stringify(withoutMetadata(serverItem)) === JSON.stringify(withoutMetadata(pendingItem));
}

function emitDiffEvents<T extends WithId>(
  collection: string,
  prev: T[],
  next: T[],
  emit: typeof emitCollectionEvent = emitCollectionEvent,
  includeDeletes = true
): void {
  const prevMap = new Map(prev.map((item) => [item.id, item]));
  const nextIds = new Set<string | undefined>();

  for (const item of next) {
    nextIds.add(item.id);
    const previous = prevMap.get(item.id);
    if (!previous) {
      emit({ collection, type: "created", item });
    } else if (JSON.stringify(previous) !== JSON.stringify(item)) {
      emit({ collection, type: "updated", item, previous });
    }
  }

  if (!includeDeletes) return;
  for (const item of prev) {
    if (!nextIds.has(item.id)) {
      emit({ collection, type: "deleted", item });
    }
  }
}
