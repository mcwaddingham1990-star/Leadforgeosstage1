import Stripe from "stripe";

// Same reasoning as stripeWebhook.ts's pinned apiVersion -- keeps Stripe's
// request/response shapes stable under us instead of drifting with
// whatever's "current" on their end.
const API_VERSION = "2026-08-26.dahlia";

let client: Stripe | null = null;
function getStripeClient(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not configured on the server.");
  if (!client) client = new Stripe(secretKey, { apiVersion: API_VERSION });
  return client;
}

/**
 * Creates a new Stripe Connect connected account for a business, if one
 * doesn't already exist. Controller-based (not a plain "Express" account):
 * the account has no Stripe-hosted dashboard of its own -- the whole point
 * is every Stripe feature this business uses shows up inside OwnersLOCAL's
 * own Payments tab (via embedded components) instead of a separate
 * Stripe-branded page. Each business is still the merchant of record on
 * its own charges (Connect *direct* charges -- see the payment flow once
 * that's built); this only controls who runs the account management/
 * dashboard experience and who Stripe holds liable at the platform level.
 *
 * requirement_collection is explicitly "stripe" because onboarding itself
 * (ConnectAccountOnboarding in PaymentsPage.tsx) is Stripe's own embedded
 * component collecting the KYC/bank info, not a custom form OwnersLOCAL
 * built -- Stripe requires that whoever collects those requirements also
 * be the one liable for negative balances/refunds/chargebacks (losses),
 * so losses.payments must match at "stripe" too. Fees still route to the
 * platform, since that's independent of who did the KYC.
 */
export async function createConnectedAccount(businessEmail: string): Promise<{ accountId: string }> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.create({
    controller: {
      fees: { payer: "application" },
      losses: { payments: "stripe" },
      stripe_dashboard: { type: "none" },
      requirement_collection: "stripe",
    },
    business_type: "company",
    email: businessEmail,
    metadata: { ownerslocalBusinessId: businessEmail },
  });
  return { accountId: account.id };
}

/**
 * A short-lived client_secret the frontend uses to initialize Stripe's
 * embedded Connect components (onboarding now; payments/payouts/account
 * management components reuse this same call later with more components
 * enabled). Must be re-fetched fresh each time the embedded UI loads --
 * these aren't meant to be cached or reused across sessions.
 */
export async function createAccountSession(accountId: string): Promise<{ clientSecret: string }> {
  const stripe = getStripeClient();
  const accountSession = await stripe.accountSessions.create({
    account: accountId,
    components: {
      account_onboarding: { enabled: true },
    },
  });
  return { clientSecret: accountSession.client_secret };
}

export interface ConnectAccountStatus {
  accountId: string;
  detailsSubmitted: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

/**
 * Authoritative onboarding/payment-readiness status, read live from Stripe
 * rather than trusted from a client-writable Firestore flag -- a business
 * could otherwise mark itself "onboarded" without Stripe actually agreeing,
 * which would just break their own payment flow, but there's no reason to
 * accept that risk when asking Stripe directly is one API call.
 */
export async function getConnectAccountStatus(accountId: string): Promise<ConnectAccountStatus> {
  const stripe = getStripeClient();
  const account = await stripe.accounts.retrieve(accountId);
  return {
    accountId: account.id,
    detailsSubmitted: !!account.details_submitted,
    chargesEnabled: !!account.charges_enabled,
    payoutsEnabled: !!account.payouts_enabled,
  };
}
