import type { Request, Response } from "express";
import Stripe from "stripe";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import { isAdminBusinessId } from "./paywallBypass";

// OwnersLOCAL's own SaaS subscription -- the platform charging the business
// owners who use it (distinct from Stripe Connect in stripeConnect.ts /
// stripeConnectRoutes.ts, which lets a business charge ITS OWN customers).
// Same per-file getAdminApp()/resolveCallerBusinessId() duplication as the
// rest of server/*.ts (see payrollApi.ts's comment for why).
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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for subscription billing:", err);
    adminApp = null;
  }
  return adminApp;
}

function getDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
}

/**
 * Resolves the caller's own businessId (the business owner's email, used as
 * the tenant key throughout this app) from their verified uid -- never
 * trusts a client-supplied businessId, for the same reason
 * stripeConnectRoutes.ts and payrollApi.ts don't: it would let one
 * business's member start/manage billing for a DIFFERENT business just by
 * naming it in the request.
 */
async function resolveCallerBusinessId(uid: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection("user_profiles").doc(uid).get();
  const businessEmail = snap.data()?.businessEmail;
  return typeof businessEmail === "string" && businessEmail ? businessEmail : null;
}

const API_VERSION = "2026-08-26.dahlia";
let stripeClient: Stripe | null = null;
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured on the server.");
  if (!stripeClient) stripeClient = new Stripe(secretKey, { apiVersion: API_VERSION });
  return stripeClient;
}

function isSubscriptionBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_BASE_PRICE);
}

// The offer: $49.50 for the first month, then the full configured price
// (STRIPE_BASE_PRICE -- an administrator sets that price to
// $99.00/month in the Stripe Dashboard) every month after. Modeled as a
// `duration: "once"` coupon applied automatically at checkout, NOT a
// customer-entered promotion code -- there is no "add promo code" box, the
// discount is just always there for a first-time subscription.
const FIRST_MONTH_PRICE_CENTS = 4950;
const FIRST_MONTH_COUPON_ID = "ownerslocal-first-month-49-50-off";
let firstMonthCouponEnsured = false;

/**
 * Idempotent get-or-create for the first-month coupon -- a fixed coupon id
 * so repeat calls (across requests, across server restarts) always resolve
 * to the same coupon instead of creating a new one every checkout. Cached
 * in-process after the first successful check so steady-state checkouts
 * don't pay for an extra Stripe API round trip.
 */
async function ensureFirstMonthCoupon(stripe: Stripe): Promise<void> {
  if (firstMonthCouponEnsured) return;
  try {
    await stripe.coupons.retrieve(FIRST_MONTH_COUPON_ID);
    firstMonthCouponEnsured = true;
    return;
  } catch (err) {
    const isMissing = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";
    if (!isMissing) throw err;
  }
  try {
    await stripe.coupons.create({
      id: FIRST_MONTH_COUPON_ID,
      name: "First month: $49.50",
      amount_off: FIRST_MONTH_PRICE_CENTS,
      currency: "usd",
      duration: "once",
    });
    firstMonthCouponEnsured = true;
  } catch (err) {
    // A concurrent request created it between our retrieve and this create --
    // that's fine, it exists now either way. Anything else is a real failure.
    const alreadyExists = err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_already_exists";
    if (!alreadyExists) throw err;
    firstMonthCouponEnsured = true;
  }
}

// Seat pricing: the base price includes the owner plus 5 employees: every
// additional block of 5 employees beyond that costs $20/month
// (STRIPE_ADDITIONAL_SEATS_PRICE, a flat-rate Stripe price where quantity =
// number of extra 5-employee blocks). The owner isn't in the `employees`
// collection (only invited staff get a record there -- see
// webLeadFormHandler.ts/customerPortal.ts/customerAccounts.ts, which query
// it the same way), so this counts that collection directly rather than
// adding 1 for the owner and subtracting it back out.
const INCLUDED_EMPLOYEES = 5;
const EMPLOYEES_PER_ADDITIONAL_BLOCK = 5;
const ADDITIONAL_SEAT_PRICE_DOLLARS = 20;

async function countEmployees(db: FirebaseFirestore.Firestore, businessId: string): Promise<number> {
  const snap = await db.collection("employees").where("businessEmail", "==", businessId).get();
  return snap.size;
}

function extraSeatBlocksFor(employeeCount: number): number {
  const extraEmployees = Math.max(0, employeeCount - INCLUDED_EMPLOYEES);
  return Math.ceil(extraEmployees / EMPLOYEES_PER_ADDITIONAL_BLOCK);
}

/** Prefer the configured APP_URL (same var used for OAuth/self-referential links elsewhere); fall back to the request itself so this still works before APP_URL is set. */
function resolveAppUrl(req: Request): string {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : req.protocol;
  return `${proto}://${req.get("host")}`;
}

export async function handleGetSubscriptionStatus(req: Request, res: Response) {
  try {
    const businessId = await resolveCallerBusinessId(req.firebaseUser!.uid);
    if (!businessId) {
      res.status(503).json({ error: "Your account has no business linked yet." });
      return;
    }
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: "Subscription billing is not configured on this server yet." });
      return;
    }
    const snap = await db.collection("business_profiles").doc(businessId).get();
    const data = snap.data() || {};
    const employeeCount = await countEmployees(db, businessId);
    const extraSeatBlocks = extraSeatBlocksFor(employeeCount);
    const bypassExpiresAt = typeof data.bypassExpiresAt === "number" ? data.bypassExpiresAt : null;
    const bypassActive = !!data.bypassActive && !!bypassExpiresAt && bypassExpiresAt > Date.now();
    res.json({
      configured: isSubscriptionBillingConfigured(),
      hasBillingAccount: typeof data.stripeSubscriptionCustomerId === "string" && !!data.stripeSubscriptionCustomerId,
      subscriptionActive: !!data.subscriptionActive,
      status: typeof data.subscriptionStatus === "string" ? data.subscriptionStatus : null,
      currentPeriodEnd: typeof data.subscriptionCurrentPeriodEnd === "number" ? data.subscriptionCurrentPeriodEnd : null,
      cancelAtPeriodEnd: !!data.subscriptionCancelAtPeriodEnd,
      // The manually-issued bypass code (see paywallBypass.ts) and the
      // hardcoded platform-admin business, which is never gated at all
      // regardless of subscriptionActive/bypassActive.
      bypassActive,
      bypassExpiresAt: bypassActive ? bypassExpiresAt : null,
      isAdminBusiness: isAdminBusinessId(businessId),
      seatPricing: {
        includedEmployees: INCLUDED_EMPLOYEES,
        employeesPerAdditionalBlock: EMPLOYEES_PER_ADDITIONAL_BLOCK,
        additionalBlockPriceDollars: ADDITIONAL_SEAT_PRICE_DOLLARS,
        employeeCount,
        extraSeatBlocks,
        additionalMonthlyCostDollars: extraSeatBlocks * ADDITIONAL_SEAT_PRICE_DOLLARS,
      },
    });
  } catch (err) {
    console.error("Error checking subscription status:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not check subscription status." });
  }
}

export async function handleCreateSubscriptionCheckout(req: Request, res: Response) {
  try {
    const priceId = process.env.STRIPE_BASE_PRICE;
    if (!isSubscriptionBillingConfigured() || !priceId) {
      res.status(503).json({ error: "Subscription billing is not configured on this server yet." });
      return;
    }
    const businessId = await resolveCallerBusinessId(req.firebaseUser!.uid);
    const db = getDb();
    if (!businessId || !db) {
      res.status(503).json({ error: "Your account has no business linked yet." });
      return;
    }

    const stripe = getStripeClient();
    const profileRef = db.collection("business_profiles").doc(businessId);
    const profileSnap = await profileRef.get();
    let customerId = profileSnap.data()?.stripeSubscriptionCustomerId;
    if (typeof customerId !== "string" || !customerId) {
      const customer = await stripe.customers.create({
        email: businessId,
        metadata: { ownerslocalBusinessId: businessId },
      });
      customerId = customer.id;
      await profileRef.set({ stripeSubscriptionCustomerId: customerId }, { merge: true });
    }

    // Refuse to start a second subscription for a business that already has
    // a live one on this customer -- checked against Stripe itself (not
    // just business_profiles.subscriptionActive) so a webhook that hasn't
    // landed yet doesn't leave a window where a reload + re-click doubles
    // the charge. past_due/unpaid still count as "has a subscription" (it
    // needs fixing via the billing portal, not a second one).
    const existingSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const stillLive = existingSubscriptions.data.find((sub) =>
      ["active", "trialing", "past_due", "unpaid"].includes(sub.status)
    );
    if (stillLive) {
      res.status(409).json({ error: "This business already has a subscription. Use Manage Billing to update or cancel it instead of subscribing again." });
      return;
    }

    // Add the additional-seats price if this business has more than the 5
    // included employees. Refuse to under-charge silently: if extra seats
    // are owed but the price isn't configured, this must fail loudly
    // rather than let a large business subscribe at the small-business rate.
    const employeeCount = await countEmployees(db, businessId);
    const extraSeatBlocks = extraSeatBlocksFor(employeeCount);
    const additionalSeatsPriceId = process.env.STRIPE_ADDITIONAL_SEATS_PRICE;
    if (extraSeatBlocks > 0 && !additionalSeatsPriceId) {
      res.status(503).json({ error: "This business has more than the 5 included employees, but additional-seat pricing isn't configured yet. An administrator needs to set STRIPE_ADDITIONAL_SEATS_PRICE on the server." });
      return;
    }
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: priceId, quantity: 1 }];
    if (extraSeatBlocks > 0 && additionalSeatsPriceId) {
      lineItems.push({ price: additionalSeatsPriceId, quantity: extraSeatBlocks });
    }

    await ensureFirstMonthCoupon(stripe);

    const appUrl = resolveAppUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: businessId,
      line_items: lineItems,
      // $49.50 off the first invoice's total (base + any extra-seat line
      // item together) via an automatically-applied coupon -- NOT
      // allow_promotion_codes (that shows a customer-facing "add promo
      // code" box, which this offer must not have). A fixed-dollar coupon
      // applied to the invoice as a whole is equivalent to applying it to
      // just the base price, since it's the same total either way.
      discounts: [{ coupon: FIRST_MONTH_COUPON_ID }],
      subscription_data: { metadata: { ownerslocalBusinessId: businessId } },
      success_url: `${appUrl}/app/billing?checkout=success`,
      cancel_url: `${appUrl}/app/billing?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating subscription checkout session:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not start checkout." });
  }
}

export async function handleCreateBillingPortalSession(req: Request, res: Response) {
  try {
    if (!isSubscriptionBillingConfigured()) {
      res.status(503).json({ error: "Subscription billing is not configured on this server yet." });
      return;
    }
    const businessId = await resolveCallerBusinessId(req.firebaseUser!.uid);
    const db = getDb();
    if (!businessId || !db) {
      res.status(503).json({ error: "Your account has no business linked yet." });
      return;
    }
    const profileSnap = await db.collection("business_profiles").doc(businessId).get();
    const customerId = profileSnap.data()?.stripeSubscriptionCustomerId;
    if (typeof customerId !== "string" || !customerId) {
      res.status(404).json({ error: "No billing account yet -- subscribe first." });
      return;
    }

    const stripe = getStripeClient();
    const appUrl = resolveAppUrl(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/app/billing`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating billing portal session:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not open the billing portal." });
  }
}
