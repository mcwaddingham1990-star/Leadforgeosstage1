import type { Request, Response } from "express";
import Stripe from "stripe";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import { applyPortalInvoicePayment, applyChargeRefund, applyDisputeFundsMovement, notifyDisputeStatus, recordPayoutEvent } from "./customerPortal";

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
/**
 * Idempotency guard keyed by Stripe's own permanent event.id -- Stripe can
 * (and does) redeliver the same webhook event more than once (retries,
 * manual resends from the Dashboard). Recording the id BEFORE processing
 * means a near-simultaneous duplicate delivery sees it too, not just one
 * arriving after the first finished.
 */
async function wasAlreadyProcessed(eventId: string): Promise<boolean> {
  const app = getAdminApp();
  if (!app) return false; // Not configured -- nothing to dedup against; let it through.
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const ref = db.collection("stripe_webhook_events").doc(eventId);
  const snap = await ref.get();
  if (snap.exists) return true;
  await ref.set({ id: eventId, source: "connect", processedAt: new Date().toISOString() });
  return false;
}

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
    const alreadyProcessed = await wasAlreadyProcessed(event.id);
    if (alreadyProcessed) {
      console.log(`[stripe-connect] ${event.type} (${event.id}) already processed -- skipping duplicate delivery.`);
      return;
    }
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

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.metadata?.ownerslocalInvoiceId) await applyPortalInvoicePayment(businessId, session);
        return;
      }
      case "charge.refunded": {
        await applyChargeRefund(businessId, event.data.object as Stripe.Charge);
        return;
      }
      case "charge.dispute.funds_withdrawn": {
        await applyDisputeFundsMovement(businessId, event.data.object as Stripe.Dispute, "withdrawn", stripeAccountId);
        return;
      }
      case "charge.dispute.funds_reinstated": {
        await applyDisputeFundsMovement(businessId, event.data.object as Stripe.Dispute, "reinstated", stripeAccountId);
        return;
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed": {
        await notifyDisputeStatus(businessId, event.data.object as Stripe.Dispute, stripeAccountId);
        return;
      }
      case "payout.created":
      case "payout.paid":
      case "payout.failed":
      case "payout.canceled": {
        await recordPayoutEvent(businessId, event.data.object as Stripe.Payout, event.type);
        return;
      }
    }

    // Every other subscribed event type (SaaS subscription billing --
    // there's no paywall built yet to react to it; Financial Connections;
    // KYC/account.updated; saved payment methods; 1099 reporting; etc.) is
    // acknowledged and logged rather than invented ahead of the feature
    // that would actually use it. See the handoff doc's spec mapping for
    // what each of these is reserved for.
    console.log(`[stripe-connect] ${event.type} (${event.id}) for business ${businessId} (account ${stripeAccountId}) -- no handler wired yet.`);
  } catch (err) {
    console.error(`Error handling Stripe Connect event ${event.type} (${event.id}):`, err);
  }
}
