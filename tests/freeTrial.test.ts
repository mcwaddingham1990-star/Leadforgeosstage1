import { describe, expect, test } from "vitest";
import { FREE_TRIAL_DAYS, freeTrialDaysLeft, freeTrialEndsAt, isFreeTrialActive } from "../src/lib/freeTrial";

const DAY = 24 * 60 * 60 * 1000;
const signup = Date.parse("2026-10-01T15:00:00Z");

describe("free trial", () => {
  test("lasts 7 days from the owner's signup", () => {
    expect(FREE_TRIAL_DAYS).toBe(7);
    expect(freeTrialEndsAt(signup)).toBe(signup + 7 * DAY);
  });

  test("active until the end moment, then over", () => {
    const ends = freeTrialEndsAt(signup);
    expect(isFreeTrialActive(ends, signup)).toBe(true);
    expect(isFreeTrialActive(ends, ends - 1)).toBe(true);
    expect(isFreeTrialActive(ends, ends)).toBe(false);
    expect(isFreeTrialActive(ends, ends + DAY)).toBe(false);
  });

  test("no trial when the end can't be determined", () => {
    expect(isFreeTrialActive(null, signup)).toBe(false);
    expect(isFreeTrialActive(undefined, signup)).toBe(false);
    expect(freeTrialDaysLeft(null, signup)).toBe(0);
  });

  test("days left rounds up and hits 0 when over", () => {
    const ends = freeTrialEndsAt(signup);
    expect(freeTrialDaysLeft(ends, signup)).toBe(7);
    expect(freeTrialDaysLeft(ends, signup + 1)).toBe(7);
    expect(freeTrialDaysLeft(ends, ends - DAY - 1)).toBe(2);
    expect(freeTrialDaysLeft(ends, ends - 1)).toBe(1);
    expect(freeTrialDaysLeft(ends, ends)).toBe(0);
  });

  test("accounts older than 7 days (all existing businesses) have no trial", () => {
    const longAgo = Date.parse("2026-01-01T00:00:00Z");
    expect(isFreeTrialActive(freeTrialEndsAt(longAgo), Date.parse("2026-10-08T00:00:00Z"))).toBe(false);
  });
});
