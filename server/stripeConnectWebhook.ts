import type { Request, Response } from "express";
import Stripe from "stripe";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import { processStripeEventOnce } from "./stripeWebhookDelivery";
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
 * Existing event records are treated as completed for backward compatibility.
 * New deliveries are recorded only after the connected-account update succeeds.
 */
async function wasAlreadyProcessed(eventId: string): Promise<boolean> {
  const app = getAdminApp();
  if (!app) return false;
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const snap = await db.collection("stripe_webhook_events").doc(eventId).get();
  return snap.exists;
}

async function markProcessed(eventId: string): Promise<void> {
  const app = getAdminApp();
  if (!app) throw new Error("Firebase Admin is not configured for Stripe Connect webhook idempotency.");
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  await db.collection("stripe_webhook_events").doc(eventId).set({
    id: eventId,
    source: "connect",
    status: "processed",
    processedAt: new Date().toISOString()
  });
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

  try {
    const result = await processStripeEventOnce({
      eventId: event.id,
      alreadyProcessed: wasAlreadyProcessed,
      process: async () => {
        const stripeAccountId = event.account;
        if (!stripeAccountId) {
          throw new Error(`Stripe Connect event ${event.type} (${event.id}) had no top-level account field.`);
        }
        const businessId = await resolveBusinessIdForConnectedAccount(stripeAccountId);
        if (!businessId) {
          // This can be transient immediately after account creation. Return
          // a retryable failure instead of permanently discarding the event.
          throw new Error(`Stripe Connect event ${event.type} (${event.id}) for account ${stripeAccountId} matched no known business.`);
        }

        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            if (session.metadata?.ownerslocalInvoiceId) await applyPortalInvoicePayment(businessId, session);
            break;
          }
          case "charge.refunded": {
            await applyChargeRefund(businessId, event.data.object as Stripe.Charge);
            break;
          }
          case "charge.dispute.funds_withdrawn": {
            await applyDisputeFundsMovement(businessId, event.data.object as Stripe.Dispute, "withdrawn", stripeAccountId);
            break;
          }
          case "charge.dispute.funds_reinstated": {
            await applyDisputeFundsMovement(businessId, event.data.object as Stripe.Dispute, "reinstated", stripeAccountId);
            break;
          }
          case "charge.dispute.created":
          case "charge.dispute.updated":
          case "charge.dispute.closed": {
            await notifyDisputeStatus(businessId, event.data.object as Stripe.Dispute, stripeAccountId);
            break;
          }
          case "payout.created":
          case "payout.paid":
          case "payout.failed":
          case "payout.canceled": {
            await recordPayoutEvent(businessId, event.data.object as Stripe.Payout, event.type);
            break;
          }
          default:
            console.log(`[stripe-connect] ${event.type} (${event.id}) for business ${businessId} (account ${stripeAccountId}) -- no handler wired yet.`);
        }
      },
      markProcessed,
    });

    if (result === "duplicate") {
      console.log(`[stripe-connect] ${event.type} (${event.id}) already processed -- skipping duplicate delivery.`);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error handling Stripe Connect event ${event.type} (${event.id}):`, err);
    res.status(500).json({ error: "Stripe Connect event processing failed; retry requested." });
  }
}
