import type { Request, Response } from "express";
import Stripe from "stripe";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for the Stripe webhook:", err);
    adminApp = null;
  }
  return adminApp;
}

/**
 * Idempotency guard keyed by Stripe's own permanent event.id -- Stripe can
 * (and does) redeliver the same webhook event more than once (retries,
 * manual resends from the Dashboard). Recording the id BEFORE processing
 * means a near-simultaneous duplicate delivery sees it too.
 */
async function wasAlreadyProcessed(eventId: string): Promise<boolean> {
  const app = getAdminApp();
  if (!app) return false; // Not configured -- nothing to dedup against; let it through.
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const ref = db.collection("stripe_webhook_events").doc(eventId);
  const snap = await ref.get();
  if (snap.exists) return true;
  await ref.set({ id: eventId, source: "platform", processedAt: new Date().toISOString() });
  return false;
}

// Verifies the request actually came from Stripe (not a forged POST from
// anywhere on the internet) using the raw request body + the signing
// secret Stripe shows you when you create a webhook destination in the
// Dashboard. This is why server.ts wires this route to express.raw()
// instead of the app's normal express.json() -- signature verification
// needs the exact, unparsed byte stream Stripe signed, not a
// re-serialized JS object that may not byte-for-byte match it.
export async function handleStripeWebhook(req: Request, res: Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers["stripe-signature"];
  if (!secret || typeof signature !== "string") {
    res.status(503).json({ error: "Stripe webhook is not configured on this server yet." });
    return;
  }

  let event: Stripe.Event;
  try {
    // apiVersion pinned so Stripe's event payload shape doesn't shift
    // under us on their end without a deliberate upgrade here.
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", { apiVersion: "2026-08-26.dahlia" });
    event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    res.status(400).json({ error: "Invalid signature." });
    return;
  }

  // Acknowledge immediately -- Stripe retries on anything but a fast 2xx,
  // and none of the handling below needs to finish before responding.
  res.status(200).json({ received: true });

  try {
    if (await wasAlreadyProcessed(event.id)) {
      console.log(`[stripe] ${event.type} (${event.id}) already processed -- skipping duplicate delivery.`);
      return;
    }
    await routeEvent(event);
  } catch (err) {
    // Nothing to do about a failure after the 200 has already gone out --
    // log it so it's visible, rather than throwing into an unhandled
    // rejection. Stripe's own Dashboard also records delivery + payload
    // for every event, so this is a convenience log, not the only record.
    console.error(`Error handling Stripe event ${event.type} (${event.id}):`, err);
  }
}

async function routeEvent(event: Stripe.Event): Promise<void> {
  switch (true) {
    // Bank-account linking (Financial Connections) -- the bank
    // reconciliation feature these events feed is being built separately;
    // this just gets them landing somewhere real and logged rather than
    // 404ing, so nothing from Stripe's side needs to change again once
    // that feature reads these itself.
    case event.type.startsWith("financial_connections."):
      console.log(`[stripe] ${event.type} (${event.id}) -- Financial Connections event received, no handler wired yet.`);
      break;

    // Subscription billing (the owner paywall) -- same story: the paywall
    // itself isn't built, so these just get acknowledged and logged for
    // now rather than silently dropped.
    case event.type === "checkout.session.completed":
    case event.type === "invoice.paid":
    case event.type === "invoice.payment_failed":
    case event.type.startsWith("customer.subscription."):
      console.log(`[stripe] ${event.type} (${event.id}) -- subscription event received, no handler wired yet.`);
      break;

    default:
      console.log(`[stripe] Unhandled event type ${event.type} (${event.id}).`);
  }
}
