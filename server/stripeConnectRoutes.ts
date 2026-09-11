import type { Request, Response } from "express";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import { createConnectedAccount, createAccountSession, getConnectAccountStatus } from "./stripeConnect";

// Same pattern as the rest of server/*.ts (pushNotifications.ts,
// remoteSigning.ts, etc.) -- each file's getAdminApp() is independently
// idempotent (getApps() is checked first), so this doesn't re-initialize
// anything if another handler already has.
let adminApp: App | null | undefined;
function getAdminApp(): App | null {
  if (adminApp !== undefined) return adminApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    adminApp = null;
    return adminApp;
  }
  try {
    adminApp = getApps().length ? getApps()[0]! : initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for Stripe Connect:", err);
    adminApp = null;
  }
  return adminApp;
}

/**
 * Resolves the caller's own businessId (tenant key) from their verified
 * uid -- never trusts a client-supplied businessId for anything that
 * creates or touches a Stripe connected account, since that would let one
 * business's member attach a payments account under a different business
 * just by naming it in the request body.
 */
async function resolveBusinessId(uid: string): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const snap = await db.collection("user_profiles").doc(uid).get();
  const businessEmail = snap.data()?.businessEmail;
  return typeof businessEmail === "string" && businessEmail ? businessEmail : null;
}

async function getOrCreateConnectedAccountId(businessId: string): Promise<string> {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin is not configured on the server.");
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const profileRef = db.collection("business_profiles").doc(businessId);
  const profileSnap = await profileRef.get();
  const existing = profileSnap.data()?.stripeConnectedAccountId;
  if (typeof existing === "string" && existing) return existing;

  const { accountId } = await createConnectedAccount(businessId);
  await profileRef.set({ stripeConnectedAccountId: accountId }, { merge: true });
  return accountId;
}

export async function handleGetOrCreateAccount(req: Request, res: Response) {
  try {
    const businessId = await resolveBusinessId(req.firebaseUser!.uid);
    if (!businessId) {
      res.status(503).json({ error: "This server isn't configured for Stripe Connect yet, or your account has no business linked." });
      return;
    }
    const accountId = await getOrCreateConnectedAccountId(businessId);
    res.json({ accountId });
  } catch (err) {
    console.error("Error creating/looking up Stripe connected account:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not set up Stripe for this business." });
  }
}

export async function handleCreateAccountSession(req: Request, res: Response) {
  try {
    const businessId = await resolveBusinessId(req.firebaseUser!.uid);
    if (!businessId) {
      res.status(503).json({ error: "This server isn't configured for Stripe Connect yet, or your account has no business linked." });
      return;
    }
    const accountId = await getOrCreateConnectedAccountId(businessId);
    const { clientSecret } = await createAccountSession(accountId);
    res.json({ clientSecret });
  } catch (err) {
    console.error("Error creating Stripe Account Session:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not start Stripe onboarding." });
  }
}

export async function handleGetAccountStatus(req: Request, res: Response) {
  try {
    const businessId = await resolveBusinessId(req.firebaseUser!.uid);
    if (!businessId) {
      res.status(503).json({ error: "This server isn't configured for Stripe Connect yet, or your account has no business linked." });
      return;
    }
    const app = getAdminApp();
    if (!app) {
      res.status(503).json({ error: "This server isn't configured for Stripe Connect yet." });
      return;
    }
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
    const profileSnap = await db.collection("business_profiles").doc(businessId).get();
    const accountId = profileSnap.data()?.stripeConnectedAccountId;
    if (typeof accountId !== "string" || !accountId) {
      res.json({ connected: false });
      return;
    }
    const status = await getConnectAccountStatus(accountId);
    res.json({ connected: true, ...status });
  } catch (err) {
    console.error("Error checking Stripe Connect status:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not check Stripe status." });
  }
}
