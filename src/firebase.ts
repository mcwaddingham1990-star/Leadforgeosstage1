import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the database ID specified in our configuration.
// ignoreUndefinedProperties: true -- without it, setDoc/updateDoc THROWS on
// any field literally set to `undefined` (e.g. `jobId: linkedJob?.id` when
// there's no linked job, or `attachments: undefined` on a message with none).
// That's an extremely common pattern across this app's optional-field
// writes, and every one of those throws was being caught and silently
// swallowed (console.error only) by each save path's try/catch -- so the
// write never reached Firestore even though the UI showed it as sent.
//
// persistentLocalCache: saves made while offline (or still on their way when
// the page is refreshed / the app is backgrounded) are queued in IndexedDB
// and sent on the next load, instead of living only in memory and being lost
// on refresh. Shared across tabs so two open tabs don't fight over the cache.
// Falls back to the in-memory cache where IndexedDB isn't available.
const canUsePersistentCache = typeof window !== "undefined" && typeof indexedDB !== "undefined";
const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: canUsePersistentCache
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : memoryLocalCache()
}, firebaseConfig.firestoreDatabaseId || "(default)");

const auth = getAuth(app);

export { app, db, auth, firebaseConfig };
