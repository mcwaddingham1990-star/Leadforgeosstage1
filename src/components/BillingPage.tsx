import React, { useState } from "react";
import { CreditCard, CheckCircle2, AlertTriangle, Loader2, Receipt } from "lucide-react";
import { authedFetch } from "../lib/apiClient";
import { useNavTelemetry } from "../context/NavTelemetryContext";
import { useSubscriptionStatus } from "../hooks/useSubscriptionStatus";

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due -- update your payment method",
  unpaid: "Unpaid -- update your payment method",
  canceled: "Canceled",
  incomplete: "Incomplete -- payment did not complete",
  incomplete_expired: "Expired before payment completed",
  paused: "Paused",
};

/**
 * OwnersLOCAL's own SaaS subscription (the owner paywall) -- the business
 * owner subscribing to and paying OwnersLOCAL itself, not Stripe Connect
 * (PaymentsPage.tsx), which is a business collecting payment from ITS OWN
 * customers. See server/subscriptionRoutes.ts.
 */
export const BillingPage: React.FC = () => {
  const { triggerNotification } = useNavTelemetry();
  const subscription = useSubscriptionStatus();
  const [isRedirecting, setIsRedirecting] = useState<"checkout" | "portal" | null>(null);

  const startCheckout = async () => {
    setIsRedirecting("checkout");
    try {
      const res = await authedFetch("/api/subscription/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not start checkout.");
      window.location.href = data.url;
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : "Could not start checkout.");
      setIsRedirecting(null);
    }
  };

  const openBillingPortal = async () => {
    setIsRedirecting("portal");
    try {
      const res = await authedFetch("/api/subscription/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Could not open the billing portal.");
      window.location.href = data.url;
    } catch (err) {
      triggerNotification(err instanceof Error ? err.message : "Could not open the billing portal.");
      setIsRedirecting(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col gap-5 animate-fade-in text-[#1F3557] max-w-2xl">
      <div className="flex items-center gap-2">
        <Receipt className="w-5 h-5 text-[#315C9F]" />
        <h1 className="text-lg font-black">Billing</h1>
      </div>
      <p className="text-xs text-slate-500 -mt-3">
        Your business's own OwnersLOCAL subscription. This is separate from Payments, which is where you connect Stripe to charge your customers.
      </p>

      {subscription.loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking subscription status...
        </div>
      ) : !subscription.configured ? (
        <div className="bg-[#FFF6E3] border border-[#F0D999] rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#8A6D1F] shrink-0 mt-0.5" />
          <div className="text-xs text-[#5B4A15]">
            Subscription billing isn't configured on this deployment yet. An administrator needs to set <code className="font-mono">STRIPE_SUBSCRIPTION_PRICE_ID</code> (and Stripe keys) on the server.
          </div>
        </div>
      ) : subscription.error ? (
        <div className="bg-[#FEE9E9] border border-[#F3B9B9] rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#9F3535] shrink-0 mt-0.5" />
          <div className="text-xs text-[#7A2A2A]">{subscription.error}</div>
        </div>
      ) : subscription.subscriptionActive ? (
        <div className="bg-[#E7F7EE] border border-[#A9E0C0] rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-[#1F7A46] shrink-0 mt-0.5" />
          <div className="text-xs text-[#1F5C36] space-y-1">
            <div className="font-bold">
              {STATUS_LABELS[subscription.status || ""] || "Active"}
            </div>
            {subscription.currentPeriodEnd && (
              <div>
                {subscription.cancelAtPeriodEnd ? "Cancels" : "Renews"} on{" "}
                {new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#E3F3FF] border border-[#A9CDEE] rounded-2xl p-4 flex items-start gap-3">
          <CreditCard className="w-4 h-4 text-[#315C9F] shrink-0 mt-0.5" />
          <div className="text-xs text-[#1F3557]">
            {subscription.status
              ? STATUS_LABELS[subscription.status] || `Subscription status: ${subscription.status}`
              : "No active subscription."}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {subscription.configured && !subscription.subscriptionActive && (
          <button
            onClick={startCheckout}
            disabled={isRedirecting !== null}
            className="px-4 py-2.5 bg-[#315C9F] hover:bg-[#1F3557] disabled:opacity-50 text-white text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer"
          >
            {isRedirecting === "checkout" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
            Subscribe
          </button>
        )}
        {subscription.hasBillingAccount && (
          <button
            onClick={openBillingPortal}
            disabled={isRedirecting !== null}
            className="px-4 py-2.5 bg-white hover:bg-[#E3F3FF] disabled:opacity-50 text-[#315C9F] border border-[#A9CDEE] text-xs font-bold rounded-xl uppercase flex items-center gap-1.5 cursor-pointer"
          >
            {isRedirecting === "portal" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Receipt className="w-3.5 h-3.5" />}
            Manage Billing
          </button>
        )}
      </div>
    </div>
  );
};
