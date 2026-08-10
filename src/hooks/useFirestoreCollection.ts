import { useEffect, useRef, useState, Dispatch, SetStateAction } from "react";
import { syncArrayToFirestore, subscribeToCollection, fetchCollectionFromServer } from "../lib/firestoreService";
import { emitCollectionEvent } from "../lib/eventBus";
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
  options?: { normalize?: (item: T) => T; onSyncError?: (error: unknown) => void }
): [T[], Dispatch<SetStateAction<T[]>>, () => Promise<void>] {
  const [items, _setItems] = useState<T[]>([]);
  const collectionItemsRef = useRef<T[]>([]);
  const compatibilityItemsRef = useRef<T[]>([]);

  const setItems: Dispatch<SetStateAction<T[]>> = (value) => {
    _setItems((prev) => {
      const nextList = typeof value === "function" ? (value as (prev: T[]) => T[])(prev) : value;
      const normalizedNext = options?.normalize ? nextList.map(options.normalize) : nextList;
      const normalizedPrev = options?.normalize ? prev.map(options.normalize) : prev;
      // This write runs in the background relative to the optimistic local
      // update above (a React state setter can't be async). Without this
      // catch, a rejected write — permission-denied, offline, a dropped
      // auth token — vanished silently: the UI kept showing the edit as
      // saved while Firestore never received it. Surface it so callers can
      // tell the user their change didn't actually persist.
      syncArrayToFirestore(collectionName, normalizedPrev, normalizedNext, businessId)
        .catch((error) => options?.onSyncError?.(error));
      emitDiffEvents(collectionName, normalizedPrev, normalizedNext);
      return normalizedNext;
    });
  };

  useEffect(() => {
    if (!businessId) {
      _setItems([]);
      return;
    }
    const publish = () => {
      const merged = new Map<string | undefined, T>();
      compatibilityItemsRef.current.forEach(item => merged.set(item.id, item));
      collectionItemsRef.current.forEach(item => merged.set(item.id, item));
      _setItems([...merged.values()]);
    };
    // A live onSnapshot listener that hits a permission-denied/unavailable
    // error terminates for good rather than retrying (Firestore JS SDK
    // behavior, not a bug in this app) — and this effect only re-runs when
    // collectionName/businessId change. businessId is identical for an
    // owner and every employee under them, so switching from an employee's
    // session back to the owner's does NOT tear down and recreate this
    // subscription. A rules-evaluation hiccup during that switch (e.g. the
    // brief window right after a brand-new employee account exists in Auth
    // but its user_profiles doc hasn't propagated yet) can kill the one
    // shared listener, and every session downstream — including the
    // owner's next login — is then stuck on whatever it last saw, which is
    // often nothing. Recover with a direct one-shot server read instead of
    // going permanently stale.
    const recover = () => {
      fetchCollectionFromServer(collectionName, businessId)
        .then((docs) => {
          collectionItemsRef.current = docs as T[];
          publish();
        })
        .catch((error) => console.error(`Couldn't recover collection "${collectionName}" after a listener error:`, error));
    };
    const unsubscribe = subscribeToCollection(collectionName, businessId, (docs) => {
      collectionItemsRef.current = docs as T[];
      publish();
    }, collectionName === "time_clock_logs" ? () => { publish(); recover(); } : recover);
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
  }, [collectionName, businessId]);

  // Same recovery fetch as above, exposed for manual "Refresh" actions in
  // the UI that want a guaranteed fresh read without waiting on a listener.
  const refresh = async () => {
    if (!businessId) return;
    collectionItemsRef.current = (await fetchCollectionFromServer(collectionName, businessId)) as T[];
    const merged = new Map<string | undefined, T>();
    compatibilityItemsRef.current.forEach(item => merged.set(item.id, item));
    collectionItemsRef.current.forEach(item => merged.set(item.id, item));
    _setItems([...merged.values()]);
  };

  return [items, setItems, refresh];
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
