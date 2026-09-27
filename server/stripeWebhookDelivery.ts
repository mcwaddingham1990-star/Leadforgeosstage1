/**
 * Stripe retries a webhook only when the endpoint does not acknowledge it
 * successfully. Keep the idempotency marker AFTER the business-side work so
 * a transient Firestore/Stripe failure can be retried instead of becoming a
 * permanently lost event.
 */
export async function processStripeEventOnce(args: {
  eventId: string;
  alreadyProcessed: (eventId: string) => Promise<boolean>;
  process: () => Promise<void>;
  markProcessed: (eventId: string) => Promise<void>;
}): Promise<"processed" | "duplicate"> {
  if (await args.alreadyProcessed(args.eventId)) return "duplicate";
  await args.process();
  await args.markProcessed(args.eventId);
  return "processed";
}
