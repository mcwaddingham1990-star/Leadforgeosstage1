/**
 * Free trial against the real Firebase Auth + Firestore emulators: the 7-day
 * window from the owner's signup, and "one trial per business" -- a newer
 * business matching an older one on phone, business name, address or email
 * gets no trial, permanently, even after editing or deleting profiles.
 *
 * Run with `npm run test:booking`.
 */
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

const PROJECT_ID = "demo-ownerslocal-booking-test";
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";
let db: Firestore;
let auth: Auth;
let routes: typeof import("../server/subscriptionRoutes");

async function clearEmulators() {
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  await fetch(`http://${fsHost}/emulator/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`, { method: "DELETE" });
  await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}

/** Signs up an owner (Auth + user/business profile) like the app does. */
async function signUpOwner(email: string, profile: Record<string, unknown> = {}) {
  const user = await auth.createUser({ email, password: "secret123" });
  await db.collection("user_profiles").doc(user.uid).set({ businessEmail: email, role: "Owner" });
  await db.collection("business_profiles").doc(email).set({ businessNames: [""], businessPhones: [""], businessAddresses: [""], ownerPhones: [""], ...profile });
  // Auth creation times have 1-second precision in the emulator -- keep signups ordered.
  await new Promise(r => setTimeout(r, 1100));
  return user.uid;
}

async function status(uid: string) {
  let body: any;
  const res: any = { status() { return res; }, json(b: any) { body = b; return res; } };
  await routes.handleGetSubscriptionStatus({ firebaseUser: { uid } } as any, res);
  return body;
}

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Run via `npm run test:booking` (needs the Firestore + Auth emulators).");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const serviceAccount = { type: "service_account", project_id: PROJECT_ID, private_key: privateKey, client_email: "test@demo-ownerslocal-booking-test.iam.gserviceaccount.com" };
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount);
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";
  process.env.STRIPE_BASE_PRICE = process.env.STRIPE_BASE_PRICE || "price_placeholder";
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount as any), projectId: PROJECT_ID });
  db = getFirestore(app, DATABASE_ID);
  auth = getAuth(app);
  routes = await import("../server/subscriptionRoutes");
});

beforeEach(async () => {
  await clearEmulators();
});

describe("7-day free trial", () => {
  test("a brand-new business gets 7 days; subscribing ends the trial state", async () => {
    const uid = await signUpOwner("fresh@example.com", { businessNames: ["Fresh Air HVAC"] });
    let s = await status(uid);
    expect(s.trialActive).toBe(true);
    expect(s.trialBlocked).toBe(false);
    expect(Math.round((s.trialEndsAt - Date.now()) / 86400000)).toBe(7);
    await db.collection("business_profiles").doc("fresh@example.com").set({ subscriptionActive: true }, { merge: true });
    s = await status(uid);
    expect(s.trialActive).toBe(false);
  });
});

describe("one trial per business", () => {
  const original = { businessNames: ["Bob's HVAC LLC"], businessPhones: ["(555) 111-2222"], businessAddresses: ["10 Elm Street, Austin TX"], ownerPhones: ["555-333-4444"] };

  test.each([
    ["business phone", { businessPhones: ["555.111.2222"] }],
    ["owner phone", { ownerPhones: ["+1 555 333 4444"] }],
    ["business name", { businessNames: ["Bobs HVAC"] }],
    ["address", { businessAddresses: ["10 Elm St., Austin, TX"] }]
  ])("a newer business matching on %s gets no trial; the older one keeps its trial", async (_label, repeat) => {
    const firstUid = await signUpOwner("bob@example.com", original);
    const repeatUid = await signUpOwner("bob.new@example.com", repeat);
    const s = await status(repeatUid);
    expect(s.trialActive).toBe(false);
    expect(s.trialBlocked).toBe(true);
    expect((await status(firstUid)).trialActive).toBe(true);
  });

  test("a Gmail alias of an earlier owner's email gets no trial", async () => {
    await signUpOwner("john.smith@gmail.com", { businessNames: ["Smith Lawn"] });
    const aliasUid = await signUpOwner("johnsmith+again@gmail.com", { businessNames: ["Totally New Lawn"] });
    expect((await status(aliasUid)).trialBlocked).toBe(true);
  });

  test("an unrelated new business still gets its trial", async () => {
    await signUpOwner("bob@example.com", original);
    const otherUid = await signUpOwner("someone@else.com", { businessNames: ["Different Co"], businessPhones: ["555-999-0000"], businessAddresses: ["99 Oak Ave, Dallas TX"] });
    const s = await status(otherUid);
    expect(s.trialActive).toBe(true);
    expect(s.trialBlocked).toBe(false);
  });

  test("editing details after being blocked doesn't bring the trial back", async () => {
    await signUpOwner("bob@example.com", original);
    const repeatUid = await signUpOwner("bob.new@example.com", { businessPhones: ["555-111-2222"] });
    expect((await status(repeatUid)).trialBlocked).toBe(true);
    await db.collection("business_profiles").doc("bob.new@example.com").set({ businessPhones: ["555-000-0001"], businessNames: ["Brand New Name"], businessAddresses: ["1 Nowhere Rd 5"] }, { merge: true });
    expect((await status(repeatUid)).trialBlocked).toBe(true);
  });

  test("deleting the old business's profile doesn't free its details for a new trial", async () => {
    const firstUid = await signUpOwner("bob@example.com", original);
    await status(firstUid); // fingerprinted on its normal status check
    await db.collection("business_profiles").doc("bob@example.com").delete();
    const repeatUid = await signUpOwner("bob.new@example.com", { businessAddresses: ["10 Elm St, Austin TX"] });
    expect((await status(repeatUid)).trialBlocked).toBe(true);
  });

  test("a business fingerprinted with old details still matches after it changes them", async () => {
    const firstUid = await signUpOwner("bob@example.com", original);
    await status(firstUid);
    await db.collection("business_profiles").doc("bob@example.com").set({ businessPhones: ["555-777-8888"] }, { merge: true });
    await status(firstUid);
    const repeatUid = await signUpOwner("bob.new@example.com", { businessPhones: ["(555) 111-2222"] });
    expect((await status(repeatUid)).trialBlocked).toBe(true);
  });
});
