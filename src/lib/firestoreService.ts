import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  getDocFromServer
} from "firebase/firestore";

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

// Hardened error handler required by SKILL.md
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "simulated_owner_uid", // App uses simplified email-based login, so we fill what is available
      email: localStorage.getItem("ownerslocal_logged_in_user_email") || "unknown"
    },
    operationType,
    path
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Syncs changes from a local state array back to Firestore.
 * Performs highly efficient individual document writes and deletions.
 */
export async function syncArrayToFirestore(
  collectionName: string,
  oldArray: any[],
  newArray: any[],
  businessId: string | undefined
) {
  if (!businessId) return;

  const oldMap = new Map(oldArray.map((item) => [item.id, item]));
  
  // 1. Identify additions or updates
  for (const item of newArray) {
    if (!item.id) continue;
    const oldItem = oldMap.get(item.id);
    
    // Check if the item is new or has fields that changed
    if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(item)) {
      const docRef = doc(db, collectionName, item.id);
      try {
        await setDoc(docRef, {
          ...item,
          businessId,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${item.id}`);
      }
    }
  }

  // 2. Identify deletions
  const newSet = new Set(newArray.map((item) => item.id));
  for (const item of oldArray) {
    if (!item.id) continue;
    if (!newSet.has(item.id)) {
      const docRef = doc(db, collectionName, item.id);
      try {
        await deleteDoc(docRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${item.id}`);
      }
    }
  }
}

/**
 * Subscribes to a Firestore collection filtered by businessId.
 */
export function subscribeToCollection(
  collectionName: string,
  businessId: string,
  onUpdate: (data: any[]) => void
) {
  const q = query(collection(db, collectionName), where("businessId", "==", businessId));
  
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
      onUpdate(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, collectionName);
    }
  );
}
