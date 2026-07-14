import { useEffect, useState, Dispatch, SetStateAction } from "react";
import { syncArrayToFirestore, subscribeToCollection } from "../lib/firestoreService";

/**
 * Replaces the "intercepting setter + subscribeToCollection + cleanup" block
 * that used to be hand-duplicated once per Firestore-backed collection.
 * Clears local state whenever businessId goes falsy (logout), uniformly for
 * every caller — previously only 6 of 11 collections were cleared on logout.
 */
export function useFirestoreCollection<T>(
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
      return normalizedNext;
    });
  };

  useEffect(() => {
    if (!businessId) {
      _setItems([]);
      return;
    }
    const unsubscribe = subscribeToCollection(collectionName, businessId, (docs) => {
      _setItems(docs as T[]);
    });
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, businessId]);

  return [items, setItems];
}
