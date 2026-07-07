import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore with the database ID specified in our configuration
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");

export { app, db };
