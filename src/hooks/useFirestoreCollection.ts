import { useEffect, useState, Dispatch, SetStateAction } from "react";
import { syncArrayToFirestore, subscribeToCollection } from "../lib/firestoreService";
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
  options?: { normalize?: (item: T) => T }
): [T[], Dispatch<SetStateAction<T[]>>] {
  const [items, _setItems] = useState<T[]>([]);

  const setItems: Dispatch<SetStateAction<T[]>> = (value) => {
    _setItems((prev) => {
      const nextList = typeof value === "function" ? (value as (prev: T[]) => T[])(prev) : value;
      const normalizedNext = options?.normalize ? nextList.map(options.normalize) : nextList;
      const normalizedPrev = options?.normalize ? prev.map(options.normalize) : prev;
      syncArrayToFirestore(collectionName, normalizedPrev, normalizedNext, businessId);
      emitDiffEvents(collectionName, normalizedPrev, normalizedNext);
      return normalizedNext;
    });
  };

  useEffect(() => {
    if (!businessId) {
      _setItems([]);
      return;
    }
    let collectionItems: T[] = [];
    let compatibilityItems: T[] = [];
    const publish = () => {
      const merged = new Map<string | undefined, T>();
      compatibilityItems.forEach(item => merged.set(item.id, item));
      collectionItems.forEach(item => merged.set(item.id, item));
      _setItems([...merged.values()]);
    };
    const unsubscribe = subscribeToCollection(collectionName, businessId, (docs) => {
      collectionItems = docs as T[];
      publish();
    }, collectionName === "time_clock_logs" ? () => publish() : undefined);
    const unsubscribeCompatibility = collectionName === "time_clock_logs"
      ? onSnapshot(doc(db, "business_profiles", businessId), snapshot => {
          const stored = snapshot.data()?.timeClockLogs || {};
          compatibilityItems = Object.values(stored).map((item: any) => {
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

  return [items, setItems];
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
