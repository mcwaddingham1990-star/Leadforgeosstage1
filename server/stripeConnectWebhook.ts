import type { Request, Response } from "express";
import Stripe from "stripe";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// Separate path, separate signing secret, separate handler from the
// platform webhook (server/stripeWebhook.ts) -- Stripe issues a distinct
// secret per webhook destination even if it pointed at the same URL, so
// two dedicated endpoints are simpler than one endpoint trying multiple
// secrets. This one is for events on BUSINESSES' connected accounts
// (connect: true in the Stripe Dashboard), not OwnersLOCAL's own platform
// account.
const API_VERSION = "2026-08-26.dahlia";

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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for the Stripe Connect webhook:", err);
    adminApp = null;
  }
  return adminApp;
}

/**
 * Every connected-account event carries the connected account id in its
 * top-level `account` field (per Stripe's own design, and per how this
 * project's direct-charges architecture was scoped) -- this resolves that
 * back to the OwnersLOCAL business it belongs to, since business_profiles
 * is keyed by businessId (the owner's email), not by Stripe account id.
 */
async function resolveBusinessIdForConnectedAccount(stripeAccountId: string): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const snap = await db.collection("business_profiles").where("stripeConnectedAccountId", "==", stripeAccountId).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function handleStripeConnectWebhook(req: Request, res: Response) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  if (!secret || typeof signature !== "string") {
    res.status(503).json({ error: "The Stripe Connect webhook is not configured on this server yet." });
    return;
  }

  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: API_VERSION });
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch (err) {
    console.error("Stripe Connect webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  // Acknowledge immediately, same reasoning as the platform webhook --
  // Stripe retries on anything but a fast 2xx.
  res.status(200).json({ received: true });

  try {
    const stripeAccountId = event.account;
    if (!stripeAccountId) {
      // Shouldn't happen for a connect-scoped webhook, but fail loud in the
      // log rather than silently dropping an event with nowhere to route.
      console.error(`Stripe Connect event ${event.type} (${event.id}) had no top-level account field.`);
      return;
    }
    const businessId = await resolveBusinessIdForConnectedAccount(stripeAccountId);
    if (!businessId) {
      console.error(`Stripe Connect event ${event.type} (${event.id}) for account ${stripeAccountId} matched no known business.`);
      return;
    }
    // No payment/refund/dispute/payout business logic is wired up yet
    // (see PaymentsPage.tsx / stripeConnectRoutes.ts) -- this just proves
    // the event resolves to the right business and logs it, so nothing
    // here is invented ahead of that being built.
    console.log(`[stripe-connect] ${event.type} (${event.id}) for business ${businessId} (account ${stripeAccountId}) -- no handler wired yet.`);
  } catch (err) {
    console.error(`Error handling Stripe Connect event ${event.type} (${event.id}):`, err);
  }
}
