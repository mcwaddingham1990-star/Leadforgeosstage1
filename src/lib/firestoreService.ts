import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  arrayUnion,
  FieldPath,
  getDocFromServer,
  getDocsFromServer
} from "firebase/firestore";
import { auth } from "../firebase";

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

// Global connection check
export async function validateConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration or network status.");
    }
  }
}

function readStoredLoginEmail(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("ownerslocal_logged_in_user_email") : null;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); never let
    // that replace the real Firestore error being reported.
    return null;
  }
}

// Hardened error handler required by SKILL.md
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null, cause?: unknown): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || readStoredLoginEmail()
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  const wrapped = new Error(JSON.stringify(errInfo)) as Error & { code?: string; cause?: unknown };
  // Keep the Firestore error code so retry logic can tell a dropped
  // connection (retry) from bad data (don't).
  const code = (cause as { code?: string } | null)?.code;
  if (code) wrapped.code = code;
  if (cause) wrapped.cause = cause;
  throw wrapped;
}

/**
 * Firestore rejects undefined values anywhere inside a document. UI records
 * commonly use optional fields, so remove undefined properties recursively
 * before persisting while preserving arrays and all other values.
 */
function removeUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUndefined);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, removeUndefined(nestedValue)])
    );
  }

  return value;
}

/** Persistence metadata added on every write and stripped by every subscription. */
const METADATA_FIELDS = new Set(["businessId", "updatedAt"]);

export type FieldChange =
  | { field: string; kind: "set"; value: unknown }
  | { field: string; kind: "append"; values: unknown[] }
  | { field: string; kind: "delete" };

const stableJson = (value: unknown) => JSON.stringify(value === undefined ? null : value);

/**
 * Top-level fields that differ between what this device last knew (`base`)
 * and what the user now wants (`desired`). Only these get written, so an edit
 * on one device can no longer overwrite a different field another device
 * changed in the meantime (the old code re-wrote the whole stale document).
 *
 * A field that only had items appended (chat messages, activity logs, notes)
 * becomes an "append" so two devices adding to the same list both survive.
 */
export function diffTopLevelFields(base: Record<string, unknown>, desired: Record<string, unknown>): FieldChange[] {
  const changes: FieldChange[] = [];
  const fields = new Set([...Object.keys(base), ...Object.keys(desired)]);
  fields.forEach(field => {
    if (METADATA_FIELDS.has(field)) return;
    const before = base[field];
    const after = desired[field];
    if (stableJson(before) === stableJson(after)) return;
    if (after === undefined) {
      if (field in base && before !== undefined) changes.push({ field, kind: "delete" });
      return;
    }
    if (Array.isArray(before) && Array.isArray(after) && after.length > before.length && before.length > 0) {
      const isPureAppend = before.every((item, index) => stableJson(item) === stableJson(after[index]));
      const appended = after.slice(before.length);
      const beforeJson = new Set(before.map(stableJson));
      // arrayUnion de-duplicates by value, so only use it for appended
      // objects that are genuinely new -- never for primitive lists like
      // [1, 1] where the duplicate is meaningful.
      const safeToUnion = appended.every(item => item !== null && typeof item === "object" && !beforeJson.has(stableJson(item)))
        && new Set(appended.map(stableJson)).size === appended.length;
      if (isPureAppend && safeToUnion) {
        changes.push({ field, kind: "append", values: appended });
        return;
      }
    }
    changes.push({ field, kind: "set", value: after });
  });
  return changes;
}

function firestoreErrorCode(error: unknown): string {
  return String((error as { code?: string } | null)?.code || "").replace(/^firestore\//, "");
}

/**
 * Persists one record. `desired === null` deletes it; no `base` means a new
 * record (full write); otherwise only the changed fields are sent. If the
 * document turns out not to exist server-side (created elsewhere under a
 * legacy path, or its create never landed) the full record is written so the
 * user's change is never dropped.
 */
export async function writeCollectionItem(
  collectionName: string,
  docId: string,
  desired: Record<string, unknown> | null,
  base: Record<string, unknown> | undefined,
  businessId: string
): Promise<void> {
  const docRef = doc(db, collectionName, docId);
  const path = `${collectionName}/${docId}`;
  if (desired === null) {
    try {
      await deleteDoc(docRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path, err);
    }
    return;
  }

  const fullWrite = async () => {
    try {
      await setDoc(docRef, removeUndefined({
        ...desired,
        businessId,
        updatedAt: new Date().toISOString()
      }) as Record<string, unknown>);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path, err);
    }
  };

  if (!base) {
    await fullWrite();
    return;
  }

  const changes = diffTopLevelFields(base, desired);
  if (!changes.length) return;

  const fieldsAndValues: unknown[] = [];
  changes.forEach(change => {
    fieldsAndValues.push(new FieldPath(change.field));
    if (change.kind === "delete") fieldsAndValues.push(deleteField());
    else if (change.kind === "append") fieldsAndValues.push(arrayUnion(...(removeUndefined(change.values) as unknown[])));
    else fieldsAndValues.push(removeUndefined(change.value));
  });
  try {
    await (updateDoc as (...args: unknown[]) => Promise<void>)(
      docRef,
      new FieldPath("businessId"), businessId,
      new FieldPath("updatedAt"), new Date().toISOString(),
      ...fieldsAndValues
    );
  } catch (err) {
    if (firestoreErrorCode(err) === "not-found") {
      await fullWrite();
      return;
    }
    handleFirestoreError(err, OperationType.UPDATE, path, err);
  }
}

/**
 * Syncs changes from a local state array back to Firestore: new records are
 * written whole, edited records send only their changed fields, removed
 * records are deleted. Writes run in parallel; the first failure is rethrown
 * after every write has settled so callers can retry the whole (idempotent)
 * diff.
 */
export async function syncArrayToFirestore(
  collectionName: string,
  oldArray: any[],
  newArray: any[],
  businessId: string | undefined,
  options?: { key?: (item: any) => string; docId?: (key: string) => string }
) {
  if (!businessId) return;
  const keyOf = options?.key || ((item: any) => item?.id);
  const docIdOf = options?.docId || ((key: string) => key);

  const oldMap = new Map(oldArray.filter(item => keyOf(item)).map((item) => [keyOf(item), item]));
  const newKeys = new Set<string>();
  const writes: Promise<void>[] = [];

  for (const item of newArray) {
    const key = keyOf(item);
    if (!key) continue;
    newKeys.add(key);
    const oldItem = oldMap.get(key);
    if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
      writes.push(writeCollectionItem(collectionName, docIdOf(key), item, oldItem, businessId));
    }
  }

  for (const [key] of oldMap) {
    if (!newKeys.has(key)) writes.push(writeCollectionItem(collectionName, docIdOf(key), null, undefined, businessId));
  }

  const results = await Promise.allSettled(writes);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}

/**
 * Subscribes to a Firestore collection filtered by businessId, optionally
 * narrowed by one extra equality filter (e.g. `notifications` also scopes
 * reads to `recipientEmail` -- the security rule requires it, and Firestore
 * denies the entire listen request if the query doesn't already guarantee
 * every possible result satisfies the rule).
 */
export function subscribeToCollection(
  collectionName: string,
  businessId: string,
  onUpdate: (data: any[], meta: { fromCache: boolean }) => void,
  onError?: (error: unknown) => void,
  extraFilter?: { field: string; value: string }
) {
  const constraints = [where("businessId", "==", businessId)];
  if (extraFilter) constraints.push(where(extraFilter.field, "==", extraFilter.value));
  const q = query(collection(db, collectionName), ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        // Exclude internal sync properties when feeding back to UI state
        const { businessId: _, updatedAt: __, ...uiData } = data;
        items.push({ id: docSnap.id, ...uiData });
      });
      onUpdate(items, { fromCache: snapshot.metadata.fromCache });
    },
    (error) => {
      if (onError) {
        onError(error);
        return;
      }
      // Throwing here would only surface as an uncaught error from inside the
      // SDK's callback; log it with the same detail instead.
      console.error(`Listening to ${collectionName} failed:`, error);
    }
  );
}

/**
 * Subscribes to a collection using an explicit tenant field. Employee records
 * historically used `businessEmail` before the rest of the app standardized
 * on `businessId`; keeping this read path prevents valid employees from
 * disappearing while newer writes continue adding `businessId`.
 */
export function subscribeToCollectionByField(
  collectionName: string,
  tenantField: string,
  businessId: string,
  onUpdate: (data: any[], meta: { fromCache: boolean }) => void,
  onError?: (error: unknown) => void
) {
  const q = query(collection(db, collectionName), where(tenantField, "==", businessId));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const { businessId: _, updatedAt: __, ...uiData } = data;
        items.push({ id: docSnap.id, ...uiData });
      });
      onUpdate(items, { fromCache: snapshot.metadata.fromCache });
    },
    (error) => onError?.(error)
  );
}

/**
 * One-off, bypass-the-local-cache read of a collection, filtered by
 * businessId. The realtime onSnapshot listener in subscribeToCollection
 * normally keeps state current, but a Firestore JS SDK listener that hits a
 * permission-denied/unavailable error terminates permanently rather than
 * retrying — so a stuck view needs a way to force a brand-new server read
 * rather than waiting on a listener that's already dead. Used by manual
 * "Refresh" actions in the UI.
 */
export async function fetchCollectionFromServer(collectionName: string, businessId: string, tenantField = "businessId"): Promise<any[]> {
  const q = query(collection(db, collectionName), where(tenantField, "==", businessId));
  const snapshot = await getDocsFromServer(q);
  const items: any[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const { businessId: _, updatedAt: __, ...uiData } = data;
    items.push({ id: docSnap.id, ...uiData });
  });
  return items;
}
