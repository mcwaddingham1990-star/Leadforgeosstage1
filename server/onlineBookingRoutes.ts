import type { Express, Request, Response } from "express";
import { rateLimit } from "./rateLimit";
import { requireAuth } from "./verifyAuth";
import { resolvePortalBookingContext } from "./customerPortal";
import { resolveCustomerAccountBookingContext } from "./customerAccounts";
import { handleWebLeadFormSubmit, type WebLeadFormSubmission } from "./webLeadFormHandler";
import {
  createBooking, getBookingAvailability, getBookingDb, getBookingOptions, loadBookingSettings, originAllowed, resolveWebsiteBusiness,
  type BookingRequestInput, type CreateBookingResult
} from "./onlineBooking";

/**
 * HTTP surface for Online Booking. Three entry points, ONE pipeline
 * (server/onlineBooking.ts) -- each route only differs in how it proves
 * which business (and, for the portals, which customer) the caller is:
 *
 *   /api/portal/:token/booking/*          Customer Portal link (portalToken)
 *   /api/customer-accounts/booking/*      signed-in Customer Account (Firebase ID token + Active relationship)
 *   /api/booking/web/:token/*             business's own website (Website Lead Capture webFormToken)
 *
 * None of them read a businessId the caller chose without first proving
 * the caller is entitled to it.
 */

const send = (res: Response, result: { ok: boolean; code?: string }, failStatus = 400) => {
  const status = result.ok ? 200 : result.code === "SLOT_UNAVAILABLE" ? 409 : result.code === "DISABLED" ? 403 : failStatus;
  res.status(status).json(result);
};

const fail = (res: Response, err: unknown, fallback: string) => {
  console.error(fallback, err);
  res.status(500).json({ ok: false, code: "SERVER", error: fallback });
};

const NOT_CONFIGURED = { ok: false, error: "Online booking isn't configured on this server yet." };

function setWebsiteCors(req: Request, res: Response) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Vary", "Origin");
}

/** Public website booking: token -> business, then the business's own
 * allowed-origin list (if any) is enforced against the browser Origin. */
async function resolveWebsiteRequest(req: Request, res: Response): Promise<{ db: NonNullable<ReturnType<typeof getBookingDb>>; businessId: string } | null> {
  const db = getBookingDb();
  if (!db) { res.status(503).json(NOT_CONFIGURED); return null; }
  const businessId = await resolveWebsiteBusiness(db, req.params.token);
  if (!businessId) { res.status(404).json({ ok: false, error: "Invalid booking link -- this embed code may have been regenerated or removed." }); return null; }
  const { config } = await loadBookingSettings(db, businessId);
  if (!originAllowed(config, req.headers.origin)) { res.status(403).json({ ok: false, error: "This website isn't allowed to book for this business." }); return null; }
  return { db, businessId };
}

/** Shared by the dedicated website endpoint and the extended Website Lead
 * Capture endpoint (/api/leads/submit-web-form with a slot attached). */
export async function createWebsiteBooking(token: unknown, body: BookingRequestInput & { website?: unknown }, origin?: string): Promise<CreateBookingResult & { status: number }> {
  const db = getBookingDb();
  if (!db) return { ...NOT_CONFIGURED, status: 503 } as CreateBookingResult & { status: number };
  // Honeypot -- same convention as the lead form: pretend success, write nothing.
  if (body.website) return { ok: true, status: 200 };
  const businessId = await resolveWebsiteBusiness(db, token);
  if (!businessId) return { ok: false, code: "VALIDATION", error: "Invalid booking form -- this embed code may have been regenerated or removed.", status: 404 };
  const { config } = await loadBookingSettings(db, businessId);
  if (!originAllowed(config, origin)) return { ok: false, code: "VALIDATION", error: "This website isn't allowed to book for this business.", status: 403 };
  const result = await createBooking(db, businessId, "website", body, { kind: "contact" }, { requestOrigin: origin });
  const status = result.ok ? 200 : result.code === "SLOT_UNAVAILABLE" ? 409 : result.code === "DISABLED" ? 403 : 400;
  return { ...result, status };
}

/** POST /api/leads/submit-web-form -- the existing Website Lead Capture
 * webhook, extended: with a slot (serviceId/startTime) it books through the
 * canonical pipeline; without one it is the unchanged ordinary lead path. */
export async function handleWebFormSubmission(body: Record<string, any>, origin?: string): Promise<{ status: number; result: unknown }> {
  if (body.serviceId || body.startTime) {
    const { status, ...booking } = await createWebsiteBooking(body.token, body, origin);
    return { status, result: booking };
  }
  const result = await handleWebLeadFormSubmit(body as WebLeadFormSubmission);
  return { status: result.ok ? 200 : 400, result };
}

export function registerOnlineBookingRoutes(app: Express) {
  // ---------------- Customer Portal (token link) ----------------
  app.get("/api/portal/:token/booking/options", rateLimit("booking-read", 60_000, 60), async (req, res) => {
    try {
      const ctx = await resolvePortalBookingContext(req.params.token);
      if (ctx.ok === false) { res.status(404).json(ctx); return; }
      send(res, await getBookingOptions(ctx.db, ctx.businessId, "portal", ctx.customer));
    } catch (err) { fail(res, err, "Could not load booking options."); }
  });
  app.get("/api/portal/:token/booking/availability", rateLimit("booking-read", 60_000, 60), async (req, res) => {
    try {
      const ctx = await resolvePortalBookingContext(req.params.token);
      if (ctx.ok === false) { res.status(404).json(ctx); return; }
      send(res, await getBookingAvailability(ctx.db, ctx.businessId, "portal", req.query));
    } catch (err) { fail(res, err, "Could not load available times."); }
  });
  app.post("/api/portal/:token/booking", rateLimit("booking-write", 60_000, 10), async (req, res) => {
    try {
      const ctx = await resolvePortalBookingContext(req.params.token);
      if (ctx.ok === false) { res.status(404).json(ctx); return; }
      send(res, await createBooking(ctx.db, ctx.businessId, "portal", req.body || {}, { kind: "existing", customerId: ctx.customerId }));
    } catch (err) { fail(res, err, "Could not complete your booking."); }
  });

  // ---------------- Signed-in Customer Account ----------------
  app.get("/api/customer-accounts/booking/options", requireAuth, rateLimit("booking-read", 60_000, 60), async (req, res) => {
    try {
      const ctx = await resolveCustomerAccountBookingContext(req.firebaseUser!.uid, String(req.query.businessId || ""));
      if (ctx.ok === false) { res.status(400).json(ctx); return; }
      send(res, await getBookingOptions(ctx.db, ctx.businessId, "portal", ctx.customer));
    } catch (err) { fail(res, err, "Could not load booking options."); }
  });
  app.get("/api/customer-accounts/booking/availability", requireAuth, rateLimit("booking-read", 60_000, 60), async (req, res) => {
    try {
      const ctx = await resolveCustomerAccountBookingContext(req.firebaseUser!.uid, String(req.query.businessId || ""));
      if (ctx.ok === false) { res.status(400).json(ctx); return; }
      send(res, await getBookingAvailability(ctx.db, ctx.businessId, "portal", req.query));
    } catch (err) { fail(res, err, "Could not load available times."); }
  });
  app.post("/api/customer-accounts/booking", requireAuth, rateLimit("booking-write", 60_000, 10), async (req, res) => {
    try {
      const ctx = await resolveCustomerAccountBookingContext(req.firebaseUser!.uid, String(req.body?.businessId || ""));
      if (ctx.ok === false) { res.status(400).json(ctx); return; }
      send(res, await createBooking(ctx.db, ctx.businessId, "portal", req.body || {}, { kind: "existing", customerId: ctx.customerId }));
    } catch (err) { fail(res, err, "Could not complete your booking."); }
  });

  // ---------------- Business website (Website Lead Capture token) ----------------
  app.options("/api/booking/web/:token/*", (req, res) => { setWebsiteCors(req, res); res.sendStatus(204); });
  app.options("/api/booking/web/:token", (req, res) => { setWebsiteCors(req, res); res.sendStatus(204); });

  app.get("/api/booking/web/:token/options", rateLimit("web-booking-read", 60_000, 60), async (req, res) => {
    setWebsiteCors(req, res);
    try {
      const ctx = await resolveWebsiteRequest(req, res);
      if (!ctx) return;
      send(res, await getBookingOptions(ctx.db, ctx.businessId, "website"));
    } catch (err) { fail(res, err, "Could not load booking options."); }
  });
  app.get("/api/booking/web/:token/availability", rateLimit("web-booking-read", 60_000, 60), async (req, res) => {
    setWebsiteCors(req, res);
    try {
      const ctx = await resolveWebsiteRequest(req, res);
      if (!ctx) return;
      send(res, await getBookingAvailability(ctx.db, ctx.businessId, "website", req.query));
    } catch (err) { fail(res, err, "Could not load available times."); }
  });
  app.post("/api/booking/web/:token/book", rateLimit("web-booking-write", 60_000, 6), async (req, res) => {
    setWebsiteCors(req, res);
    try {
      const { status, ...result } = await createWebsiteBooking(req.params.token, req.body || {}, req.headers.origin);
      res.status(status).json(result);
    } catch (err) { fail(res, err, "Could not complete your booking."); }
  });
}
