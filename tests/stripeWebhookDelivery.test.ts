import { describe, expect, test, vi } from "vitest";
import { processStripeEventOnce } from "../server/stripeWebhookDelivery";

describe("Stripe webhook retry safety", () => {
  test("does not mark an event processed when business-side handling fails", async () => {
    const alreadyProcessed = vi.fn(async () => false);
    const process = vi.fn(async () => {
      throw new Error("transient Firestore failure");
    });
    const markProcessed = vi.fn(async () => undefined);

    await expect(processStripeEventOnce({
      eventId: "evt_retry_me",
      alreadyProcessed,
      process,
      markProcessed,
    })).rejects.toThrow("transient Firestore failure");

    expect(alreadyProcessed).toHaveBeenCalledWith("evt_retry_me");
    expect(process).toHaveBeenCalledTimes(1);
    expect(markProcessed).not.toHaveBeenCalled();
  });

  test("marks the event only after successful processing", async () => {
    const calls: string[] = [];

    const result = await processStripeEventOnce({
      eventId: "evt_success",
      alreadyProcessed: async () => {
        calls.push("check");
        return false;
      },
      process: async () => {
        calls.push("process");
      },
      markProcessed: async () => {
        calls.push("mark");
      },
    });

    expect(result).toBe("processed");
    expect(calls).toEqual(["check", "process", "mark"]);
  });

  test("skips already completed duplicate deliveries", async () => {
    const process = vi.fn(async () => undefined);
    const markProcessed = vi.fn(async () => undefined);

    const result = await processStripeEventOnce({
      eventId: "evt_duplicate",
      alreadyProcessed: async () => true,
      process,
      markProcessed,
    });

    expect(result).toBe("duplicate");
    expect(process).not.toHaveBeenCalled();
    expect(markProcessed).not.toHaveBeenCalled();
  });

  test("a failed first delivery can succeed when Stripe retries it", async () => {
    let processed = false;
    let attempts = 0;

    const alreadyProcessed = async () => processed;
    const markProcessed = async () => {
      processed = true;
    };
    const process = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary outage");
    };

    await expect(processStripeEventOnce({
      eventId: "evt_eventual_success",
      alreadyProcessed,
      process,
      markProcessed,
    })).rejects.toThrow("temporary outage");

    expect(processed).toBe(false);

    await expect(processStripeEventOnce({
      eventId: "evt_eventual_success",
      alreadyProcessed,
      process,
      markProcessed,
    })).resolves.toBe("processed");

    expect(attempts).toBe(2);
    expect(processed).toBe(true);
  });
});
