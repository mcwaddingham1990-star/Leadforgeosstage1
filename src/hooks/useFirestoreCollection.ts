import { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";
import { syncArrayToFirestore, subscribeToCollection, subscribeToCollectionByField, fetchCollectionFromServer } from "../lib/firestoreService";
import { emitCollectionEvent } from "../lib/eventBus";
import { emitSyncError } from "../lib/syncErrorBus";
import { db } from "../firebase";
import { doc, onSnapshot } from "firebase/firestore";

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
): [T[], Dispatch<SetStateAction<T[]>>, () => Promise<void>] {
  const [items, _setItems] = useState<T[]>([]);
  const itemsRef = useRef<T[]>([]);
  const collectionItemsRef = useRef<T[]>([]);
  const compatibilityItemsRef = useRef<T[]>([]);
  const pendingItemsRef = useRef(new Map<string, T | null>());

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

  const setItems: Dispatch<SetStateAction<T[]>> = (value) => {
    const previous = itemsRef.current;
    const nextList = typeof value === "function" ? (value as (prev: T[]) => T[])(previous) : value;
    const normalizedNext = options?.normalize ? nextList.map(options.normalize) : nextList;
    const normalizedPrev = options?.normalize ? previous.map(options.normalize) : previous;
    const previousById = new Map(normalizedPrev.filter(item => item.id).map(item => [item.id as string, item]));
    const nextById = new Map(normalizedNext.filter(item => item.id).map(item => [item.id as string, item]));

    nextById.forEach((item, id) => {
      if (JSON.stringify(previousById.get(id)) !== JSON.stringify(item)) pendingItemsRef.current.set(id, item);
    });
    previousById.forEach((_item, id) => {
      if (!nextById.has(id)) pendingItemsRef.current.set(id, null);
    });

    itemsRef.current = normalizedNext;
    _setItems(normalizedNext);
    emitDiffEvents(collectionName, normalizedPrev, normalizedNext);
    void syncArrayToFirestore(collectionName, normalizedPrev, normalizedNext, businessId).catch(async firstError => {
      // A transient network blip (the exact kind seen around sign-up/reload)
      // shouldn't need a user-visible failure -- retry once before treating
      // this as a real, reportable failure.
      console.warn(`Sync of ${collectionName} failed once; retrying.`, firstError);
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        await syncArrayToFirestore(collectionName, normalizedPrev, normalizedNext, businessId);
      } catch (secondError) {
        console.error(`Failed to sync ${collectionName} after a retry; keeping the local change visible.`, secondError);
        // The change stays visible/editable locally, but it was never actually
        // written -- without this, the user has no way to know it will vanish
        // the next time the page reloads and re-subscribes to real server data.
        emitSyncError(`Couldn't save your ${humanizeCollectionName(collectionName)} change: ${secondError instanceof Error ? secondError.message : "unknown error"}. It won't be saved if you reload.`);
      }
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
    if (!businessId || (extraFilterField && !extraFilterValue)) {
      collectionItemsRef.current = [];
      compatibilityItemsRef.current = [];
      pendingItemsRef.current.clear();
      itemsRef.current = [];
      _setItems([]);
      return;
    }
    collectionItemsRef.current = [];
    compatibilityItemsRef.current = [];
    pendingItemsRef.current.clear();
    itemsRef.current = [];
    _setItems([]);
    const handleDocs = (docs: any[]) => {
      collectionItemsRef.current = options?.normalize ? (docs as T[]).map(options.normalize) : docs as T[];
      const serverById = new Map(collectionItemsRef.current.filter(item => item.id).map(item => [item.id as string, item]));
      pendingItemsRef.current.forEach((pending, id) => {
        const serverItem = serverById.get(id);
        if ((pending === null && !serverItem) || (pending !== null && samePersistedItem(serverItem, pending))) {
          pendingItemsRef.current.delete(id);
        }
      });
      publish();
    };
    const handleError = collectionName === "time_clock_logs" ? () => publish() : undefined;
    const unsubscribe = options?.tenantField && options.tenantField !== "businessId"
      ? subscribeToCollectionByField(collectionName, options.tenantField, businessId, handleDocs, handleError)
      : subscribeToCollection(collectionName, businessId, handleDocs, handleError, extraFilterField ? { field: extraFilterField, value: extraFilterValue as string } : undefined);
    const unsubscribeCompatibility = collectionName === "time_clock_logs"
      ? onSnapshot(doc(db, "business_profiles", businessId), snapshot => {
          const stored = snapshot.data()?.timeClockLogs || {};
          compatibilityItemsRef.current = Object.values(stored).map((item: any) => {
            const { businessId: _, updatedAt: __, ...uiData } = item;
            return uiData as T;
          });
          publish();
        })
      : undefined;
    return () => {
      unsubscribe();
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

  return [items, setItems, refresh];
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

function emitDiffEvents<T extends WithId>(collection: string, prev: T[], next: T[]): void {
  const prevMap = new Map(prev.map((item) => [item.id, item]));
  const nextIds = new Set<string | undefined>();

  for (const item of next) {
    nextIds.add(item.id);
    const previous = prevMap.get(item.id);
    if (!previous) {
      emitCollectionEvent({ collection, type: "created", item });
    } else if (JSON.stringify(previous) !== JSON.stringify(item)) {
      emitCollectionEvent({ collection, type: "updated", item, previous });
    }
  }

  for (const item of prev) {
    if (!nextIds.has(item.id)) {
      emitCollectionEvent({ collection, type: "deleted", item });
    }
  }
}
