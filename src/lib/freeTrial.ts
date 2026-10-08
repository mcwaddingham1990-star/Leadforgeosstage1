/**
 * Owner'sLOCAL's no-card free trial. Every new business gets full access for
 * FREE_TRIAL_DAYS days, counted from when the owner's login account was
 * created (Firebase Auth's own creation time -- set by Firebase, so it can't
 * be edited to stretch a trial). Shared by the server (subscription status)
 * and the app (banner, Billing page). Pure functions only.
 */
export const FREE_TRIAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function freeTrialEndsAt(accountCreatedAtMs: number): number {
  return accountCreatedAtMs + FREE_TRIAL_DAYS * DAY_MS;
}

export function isFreeTrialActive(trialEndsAtMs: number | null | undefined, nowMs = Date.now()): boolean {
  return typeof trialEndsAtMs === "number" && Number.isFinite(trialEndsAtMs) && nowMs < trialEndsAtMs;
}

/** Whole days left, rounded up (so the last partial day shows as "1 day left"). */
export function freeTrialDaysLeft(trialEndsAtMs: number | null | undefined, nowMs = Date.now()): number {
  if (!isFreeTrialActive(trialEndsAtMs, nowMs)) return 0;
  return Math.ceil(((trialEndsAtMs as number) - nowMs) / DAY_MS);
}
