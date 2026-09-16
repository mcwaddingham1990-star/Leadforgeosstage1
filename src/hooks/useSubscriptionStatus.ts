import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "../lib/apiClient";

/**
 * OwnersLOCAL's own SaaS subscription status (the owner paywall) -- NOT the
 * same thing as useStripeConnectStatus, which is a business's own Stripe
 * Connect account for charging THEIR customers. See
 * server/subscriptionRoutes.ts for the server side of this.
 */
export type SubscriptionState =
  | {
      loading: true;
      configured: false;
      subscriptionActive: false;
      status: null;
      hasBillingAccount: false;
      currentPeriodEnd: null;
      cancelAtPeriodEnd: false;
    }
  | {
      loading: false;
      configured: boolean;
      subscriptionActive: boolean;
      status: string | null;
      hasBillingAccount: boolean;
      currentPeriodEnd: number | null;
      cancelAtPeriodEnd: boolean;
      error?: string;
    };

const initialState: SubscriptionState = {
  loading: true,
  configured: false,
  subscriptionActive: false,
  status: null,
  hasBillingAccount: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export function useSubscriptionStatus(): SubscriptionState & { refresh: () => void } {
  const [state, setState] = useState<SubscriptionState>(initialState);

  const refresh = useCallback(() => {
    setState(initialState);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    (async () => {
      try {
        const res = await authedFetch("/api/subscription/status", { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) {
          setState({
            loading: false,
            configured: false,
            subscriptionActive: false,
            status: null,
            hasBillingAccount: false,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: false,
            error: data.error || "Could not check subscription status.",
          });
          return;
        }
        setState({
          loading: false,
          configured: !!data.configured,
          subscriptionActive: !!data.subscriptionActive,
          status: data.status ?? null,
          hasBillingAccount: !!data.hasBillingAccount,
          currentPeriodEnd: typeof data.currentPeriodEnd === "number" ? data.currentPeriodEnd : null,
          cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
        });
      } catch (err) {
        const timedOut = err instanceof DOMException && err.name === "AbortError";
        setState({
          loading: false,
          configured: false,
          subscriptionActive: false,
          status: null,
          hasBillingAccount: false,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          error: timedOut ? "Checking subscription status timed out." : (err instanceof Error ? err.message : "Could not check subscription status."),
        });
      } finally {
        clearTimeout(timeout);
      }
    })();
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...state, refresh };
}
