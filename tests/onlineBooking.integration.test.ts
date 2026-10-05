/**
 * End-to-end Online Booking suite: real Express routes (the same
 * registerOnlineBookingRoutes / handleWebFormSubmission server.ts mounts),
 * real Firebase Admin SDK, real Firestore emulator. Run via
 * `npm run test:booking` (firebase emulators:exec sets FIRESTORE_EMULATOR_HOST).
 *
 * Covers both entry points (Customer Portal + business website) landing in
 * the same records, double-booking and stale-slot rejection, cross-tenant
 * isolation, and that ordinary Website Lead Capture still works.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

const PROJECT_ID = "demo-ownerslocal-booking-test";
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";
const BIZ_A = "ownerA@example.com";
const BIZ_B = "ownerB@example.com";
const BIZ_C = "ownerC@example.com";
const TOKEN_A = "webtokenalpha000000000000000000a";
const TOKEN_B = "webtokenbravo000000000000000000b";
const TOKEN_C = "webtokencharlie0000000000000000c";
const TZ = "America/Chicago";

let db: Firestore;
let server: Server;
let baseUrl = "";
let ipCounter = 0;
let routes: typeof import("../server/onlineBookingRoutes");
let portal: typeof import("../server/customerPortal");
let accounts: typeof import("../server/customerAccounts");

const bookingConfig = (patch: Record<string, unknown> = {}) => ({
  enabled: true, websiteEnabled: true, workingDays: [0, 1, 2, 3, 4, 5, 6], dayStart: "08:00", dayEnd: "17:00",
  slotIntervalMinutes: 60, bufferMinutes: 0, minNoticeHours: 0, maxDaysAhead: 30, capacity: 1, timeZone: TZ,
  services: [{ id: "repair", name: "Drain Repair", durationMinutes: 60 }], allowedOrigins: [], ...patch
});

function chicagoDate(offsetDays: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}
const D = () => chicagoDate(3);

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() as any, headers: res.headers };
}

const websiteBooking = (token: string, patch: Record<string, unknown> = {}) => ({
  serviceId: "repair", date: D(), startTime: "10:00", name: "Walter Visitor", phone: "555-999-0000", email: "walter@example.com",
  address: "12 Main St, Springfield", description: "Kitchen sink backs up", ...patch
});

async function clearEmulator() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const res = await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not clear emulator: ${res.status}`);
}

async function seed() {
  await Promise.all([
    db.collection("business_profiles").doc(BIZ_A).set({ name: "Alpha Plumbing", webFormToken: TOKEN_A, onlineBooking: bookingConfig() }),
    db.collection("business_profiles").doc(BIZ_B).set({ name: "Bravo HVAC", webFormToken: TOKEN_B, onlineBooking: bookingConfig() }),
    db.collection("business_profiles").doc(BIZ_C).set({ name: "Charlie Roofing", webFormToken: TOKEN_C, onlineBooking: bookingConfig({ websiteEnabled: false }) }),
    db.collection("customers").doc("custA1").set({
      id: "custA1", businessId: BIZ_A, contact: "Jane Homeowner", company: "", email: "jane@example.com", phone: "(555) 111-2222",
      address: "", status: "Active", portalEnabled: true, portalToken: "portalTokenA1"
    }),
    db.collection("customers").doc("custB1").set({
      id: "custB1", businessId: BIZ_B, contact: "Bob Bravo", company: "", email: "bob@example.com", phone: "555-333-4444",
      address: "9 Elm", status: "Active", portalEnabled: true, portalToken: "portalTokenB1"
    }),
    db.collection("business_relationships").doc("rel1").set({
      id: "rel1", customerAccountId: "acct1", businessId: BIZ_A, businessCustomerId: "custA1", businessName: "Alpha Plumbing", status: "Active"
    })
  ]);
}

const eventsFor = async (businessId: string) => (await db.collection("scheduling_events").where("businessId", "==", businessId).get()).docs.map(d => d.data());

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:booking` (needs the Firestore emulator).");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const serviceAccount = { type: "service_account", project_id: PROJECT_ID, private_key: privateKey, client_email: "test@demo-ownerslocal-booking-test.iam.gserviceaccount.com" };
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount);
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount as any), projectId: PROJECT_ID });
  db = getFirestore(app, DATABASE_ID);

  routes = await import("../server/onlineBookingRoutes");
  portal = await import("../server/customerPortal");
  accounts = await import("../server/customerAccounts");

  const http = express();
  http.use(express.json({ limit: "10mb" }));
  http.post("/api/leads/submit-web-form", async (req, res) => {
    const { status, result } = await routes.handleWebFormSubmission(req.body || {}, req.headers.origin);
    res.status(status).json(result);
  });
  http.get("/api/portal/:token", async (req, res) => res.json(await portal.getPortalData(req.params.token)));
  routes.registerOnlineBookingRoutes(http);
  await new Promise<void>(resolve => { server = http.listen(0, "127.0.0.1", () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
});

beforeEach(async () => {
  await clearEmulator();
  await seed();
});

describe("Business website booking", () => {
  test("options -> availability -> book creates customer, Job, booking record and notification", async () => {
    const options = await call("GET", `/api/booking/web/${TOKEN_A}/options`);
    expect(options.status).toBe(200);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
    expect(options.body).toMatchObject({ ok: true, businessName: "Alpha Plumbing", timeZone: TZ });
    expect(options.body.services).toEqual([{ id: "repair", name: "Drain Repair", durationMinutes: 60 }]);
    expect(options.body.customer).toBeUndefined();

    const availability = await call("GET", `/api/booking/web/${TOKEN_A}/availability?serviceId=repair&from=${D()}&days=1`);
    expect(availability.status).toBe(200);
    expect(availability.body.days[0].date).toBe(D());
    expect(availability.body.days[0].slots.map((s: any) => s.startTime)).toContain("10:00");

    const booked = await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A), { Origin: "https://alpha.example" });
    expect(booked.status).toBe(200);
    expect(booked.body.confirmation).toMatchObject({
      businessName: "Alpha Plumbing", serviceName: "Drain Repair", date: D(), startTime: "10:00", endTime: "11:00",
      address: "12 Main St, Springfield", source: "Website Booking"
    });
    expect(booked.body.confirmation.bookingId).toBeTruthy();

    const [job] = await eventsFor(BIZ_A);
    expect(job).toMatchObject({
      eventType: "Job", date: D(), startTime: "10:00", endTime: "11:00", status: "Scheduled", businessId: BIZ_A,
      bookingSource: "Website Booking", source: "Website", onlineBookingId: booked.body.confirmation.bookingId,
      customer: "Walter Visitor", customerAddress: "12 Main St, Springfield", title: "Drain Repair"
    });
    expect(job.jobNumber).toMatch(/^JOB-\d{4}-0001$/);

    const customer = (await db.collection("customers").doc(job.customerId).get()).data()!;
    expect(customer).toMatchObject({ businessId: BIZ_A, contact: "Walter Visitor", email: "walter@example.com", source: "Website", status: "Active" });

    const booking = (await db.collection("online_bookings").doc(booked.body.confirmation.bookingId).get()).data()!;
    expect(booking).toMatchObject({ businessId: BIZ_A, source: "Website Booking", schedulingEventId: job.id, customerId: job.customerId, description: "Kitchen sink backs up", requestOrigin: "https://alpha.example" });

    const notifications = (await db.collection("notifications").where("businessId", "==", BIZ_A).get()).docs.map(d => d.data());
    expect(notifications.some(n => n.recipientEmail === BIZ_A && n.title === "New online booking" && n.description.includes("Website Booking"))).toBe(true);

    const after = await call("GET", `/api/booking/web/${TOKEN_A}/availability?serviceId=repair&from=${D()}&days=1`);
    expect(after.body.days[0].slots.map((s: any) => s.startTime)).not.toContain("10:00");
  });

  test("matches an existing customer by email instead of duplicating, fills blanks only, and shows in their portal", async () => {
    const booked = await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { name: "Someone Else", email: "JANE@example.com", phone: "" }));
    expect(booked.status).toBe(200);
    const [job] = await eventsFor(BIZ_A);
    expect(job.customerId).toBe("custA1");
    const customers = (await db.collection("customers").where("businessId", "==", BIZ_A).get()).docs;
    expect(customers).toHaveLength(1);
    const jane = (await db.collection("customers").doc("custA1").get()).data()!;
    expect(jane.contact).toBe("Jane Homeowner"); // never overwritten by a website visitor
    expect(jane.address).toBe("12 Main St, Springfield"); // blank filled

    const portalView = await call("GET", "/api/portal/portalTokenA1");
    expect(portalView.body.jobs.map((j: any) => j.id)).toContain(job.id);
    expect(portalView.body.appointments.map((a: any) => a.id)).toContain(job.id);
  });

  test("the existing lead webhook books when a slot is attached and stays an ordinary lead otherwise", async () => {
    const lead = await call("POST", "/api/leads/submit-web-form", { token: TOKEN_A, name: "Lead Only", phone: "555-000-1111", notes: "Call me" });
    expect(lead.status).toBe(200);
    expect(lead.body).toEqual({ ok: true });
    const leads = (await db.collection("leads").where("businessId", "==", BIZ_A).get()).docs.map(d => d.data());
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ name: "Lead Only", source: "Website", status: "New" });
    expect(await eventsFor(BIZ_A)).toHaveLength(0);

    const booking = await call("POST", "/api/leads/submit-web-form", { token: TOKEN_A, ...websiteBooking(TOKEN_A, { startTime: "13:00" }) });
    expect(booking.status).toBe(200);
    expect(booking.body.confirmation).toMatchObject({ startTime: "13:00", source: "Website Booking" });
    const events = await eventsFor(BIZ_A);
    expect(events).toHaveLength(1);
    expect(events[0].bookingSource).toBe("Website Booking");
    expect((await db.collection("leads").where("businessId", "==", BIZ_A).get()).size).toBe(1);
  });

  test("honeypot submissions pretend success and write nothing", async () => {
    const res = await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { website: "http://spam" }));
    expect(res.status).toBe(200);
    expect(await eventsFor(BIZ_A)).toHaveLength(0);
  });

  test("validation: required fields, bad photos, past or off-grid slots", async () => {
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { name: "" }))).status).toBe(400);
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { phone: "", email: "" }))).status).toBe(400);
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { address: "" }))).status).toBe(400);
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { photos: ["data:text/html;base64,AAAA"] }))).status).toBe(400);
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { serviceId: "nope" }))).status).toBe(400);
    const past = await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { date: chicagoDate(-1) }));
    expect(past.status).toBe(409);
    expect(past.body.code).toBe("SLOT_UNAVAILABLE");
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { startTime: "10:30" }))).status).toBe(409);
    expect(await eventsFor(BIZ_A)).toHaveLength(0);
  });

  test("photos are accepted and stored on the booking record", async () => {
    const photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const res = await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { photos: [photo] }));
    expect(res.status).toBe(200);
    const booking = (await db.collection("online_bookings").doc(res.body.confirmation.bookingId).get()).data()!;
    expect(booking.photos).toEqual([photo]);
  });

  test("idempotency key: a retried submit returns the same booking, not a second Job", async () => {
    const body = websiteBooking(TOKEN_A, { idempotencyKey: "retry-key-1" });
    const first = await call("POST", `/api/booking/web/${TOKEN_A}/book`, body);
    const second = await call("POST", `/api/booking/web/${TOKEN_A}/book`, body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.confirmation.bookingId).toBe(first.body.confirmation.bookingId);
    expect(await eventsFor(BIZ_A)).toHaveLength(1);
  });

  test("website booking can be turned off, and an origin allow-list is enforced", async () => {
    const disabled = await call("GET", `/api/booking/web/${TOKEN_C}/options`);
    expect(disabled.status).toBe(403);
    expect((await call("POST", `/api/booking/web/${TOKEN_C}/book`, websiteBooking(TOKEN_C))).status).toBe(403);
    expect(await eventsFor(BIZ_C)).toHaveLength(0);

    await db.collection("business_profiles").doc(BIZ_A).set({ onlineBooking: bookingConfig({ allowedOrigins: ["https://alpha.example"] }) }, { merge: true });
    expect((await call("GET", `/api/booking/web/${TOKEN_A}/options`, undefined, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A), { Origin: "https://evil.example" })).status).toBe(403);
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A), { Origin: "https://alpha.example" })).status).toBe(200);
  });

  test("info endpoint (all-in-one widget) shows only public contact details, and works while booking is off", async () => {
    await db.collection("business_profiles").doc(BIZ_A).set({
      businessPhones: ["(555) 222-3333"], businessAddresses: ["1 Pipe Way, Springfield"],
      companySettings: { company: { email: "hello@alpha.example", businessHours: "08:00 AM - 05:00 PM" } }
    }, { merge: true });
    const a = await call("GET", `/api/booking/web/${TOKEN_A}/info`);
    expect(a.status).toBe(200);
    expect(a.body).toEqual({ ok: true, businessName: "Alpha Plumbing", phone: "(555) 222-3333", email: "hello@alpha.example", address: "1 Pipe Way, Springfield", hours: "08:00 AM - 05:00 PM", bookingEnabled: true });
    expect(JSON.stringify(a.body)).not.toContain(BIZ_A);
    expect(JSON.stringify(a.body)).not.toContain(TOKEN_A);

    const c = await call("GET", `/api/booking/web/${TOKEN_C}/info`);
    expect(c.status).toBe(200);
    expect(c.body).toMatchObject({ ok: true, businessName: "Charlie Roofing", bookingEnabled: false, email: "" });
    // The contact half of the widget still creates a lead while booking is off.
    expect((await call("POST", "/api/leads/submit-web-form", { token: TOKEN_C, name: "Contact Only", email: "c@example.com" })).status).toBe(200);
    expect((await db.collection("leads").where("businessId", "==", BIZ_C).get()).size).toBe(1);
    expect((await call("GET", `/api/booking/web/bogus/info`)).status).toBe(404);
  });

  test("an unknown or regenerated token is rejected", async () => {
    expect((await call("GET", `/api/booking/web/not-a-real-token/options`)).status).toBe(404);
    expect((await call("POST", `/api/booking/web/not-a-real-token/book`, websiteBooking("x"))).status).toBe(404);
  });
});

describe("Customer Portal booking", () => {
  test("token portal: book -> Job linked to the same customer, visible in the portal, source Customer Portal", async () => {
    const options = await call("GET", "/api/portal/portalTokenA1/booking/options");
    expect(options.body).toMatchObject({ ok: true, businessName: "Alpha Plumbing", customer: { name: "Jane Homeowner", email: "jane@example.com" } });

    const res = await call("POST", "/api/portal/portalTokenA1/booking", { serviceId: "repair", date: D(), startTime: "09:00", address: "77 Oak Ave", description: "Leak" });
    expect(res.status).toBe(200);
    expect(res.body.confirmation).toMatchObject({ businessName: "Alpha Plumbing", serviceName: "Drain Repair", date: D(), startTime: "09:00", address: "77 Oak Ave", source: "Customer Portal" });

    const [job] = await eventsFor(BIZ_A);
    expect(job).toMatchObject({ customerId: "custA1", customer: "Jane Homeowner", bookingSource: "Customer Portal", source: "Customer Portal", businessId: BIZ_A });
    expect((await db.collection("customers").where("businessId", "==", BIZ_A).get()).size).toBe(1);

    // Survives "logout/login": a completely fresh read of the portal shows it.
    const portalView = await call("GET", "/api/portal/portalTokenA1");
    expect(portalView.body.jobs.find((j: any) => j.id === job.id)).toMatchObject({ date: D(), startTime: "09:00", status: "Scheduled" });
  });

  test("signed-in Customer Account: only connected businesses resolve; booking lands on the linked customer", async () => {
    const denied = await accounts.resolveCustomerAccountBookingContext("acct1", BIZ_B);
    expect(denied.ok).toBe(false);
    const stranger = await accounts.resolveCustomerAccountBookingContext("someone-else", BIZ_A);
    expect(stranger.ok).toBe(false);

    const ctx = await accounts.resolveCustomerAccountBookingContext("acct1", BIZ_A);
    expect(ctx.ok).toBe(true);
    if (!ctx.ok) return;
    const { createBooking } = await import("../server/onlineBooking");
    const result = await createBooking(ctx.db, ctx.businessId, "portal", { serviceId: "repair", date: D(), startTime: "14:00", address: "77 Oak Ave" }, { kind: "existing", customerId: ctx.customerId });
    expect(result.ok).toBe(true);
    const appointments = await accounts.getAppointments("acct1");
    expect(appointments.appointments?.map(a => a.id)).toContain(result.confirmation!.jobId);
  });

  test("disabled online booking blocks the portal too", async () => {
    await db.collection("business_profiles").doc(BIZ_A).set({ onlineBooking: bookingConfig({ enabled: false }) }, { merge: true });
    expect((await call("GET", "/api/portal/portalTokenA1/booking/options")).status).toBe(403);
    expect((await call("POST", "/api/portal/portalTokenA1/booking", { serviceId: "repair", date: D(), startTime: "09:00", address: "x" })).status).toBe(403);
  });
});

describe("Availability integrity", () => {
  test("two customers racing for the same slot: exactly one wins, the other gets 409 + refreshed availability", { timeout: 60_000 }, async () => {
    // Losers retry behind the per-day lock; the emulator's contention
    // backoff makes this take a few seconds, hence the longer timeout.
    const attempts = await Promise.all([
      call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { email: "one@example.com", phone: "555-100-0001" })),
      call("POST", "/api/portal/portalTokenA1/booking", { serviceId: "repair", date: D(), startTime: "10:00", address: "77 Oak Ave" }),
      call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { email: "three@example.com", phone: "555-100-0003" })),
      call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { email: "four@example.com", phone: "555-100-0004" }))
    ]);
    const statuses = attempts.map(a => a.status).sort();
    expect(statuses).toEqual([200, 409, 409, 409]);
    const loser = attempts.find(a => a.status === 409)!;
    expect(loser.body.code).toBe("SLOT_UNAVAILABLE");
    const loserDay = loser.body.availability.find((d: any) => d.date === D());
    expect(loserDay.slots.map((s: any) => s.startTime)).not.toContain("10:00");
    const events = (await eventsFor(BIZ_A)).filter(e => e.date === D() && e.startTime === "10:00");
    expect(events).toHaveLength(1);
    expect((await db.collection("online_bookings").where("businessId", "==", BIZ_A).get()).size).toBe(1);
  });

  test("a stale slot (taken on the Scheduling calendar after it was shown) is rejected", async () => {
    const shown = await call("GET", `/api/booking/web/${TOKEN_A}/availability?serviceId=repair&from=${D()}&days=1`);
    expect(shown.body.days[0].slots.map((s: any) => s.startTime)).toContain("15:00");
    // Staff schedule something over it in the business app.
    await db.collection("scheduling_events").doc("staff_evt").set({ id: "staff_evt", businessId: BIZ_A, eventType: "Estimate", date: D(), startTime: "14:30", endTime: "15:30", status: "Scheduled", customer: "Walk-in" });
    const res = await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { startTime: "15:00" }));
    expect(res.status).toBe(409);
    expect(res.body.availability[0].slots.map((s: any) => s.startTime)).not.toContain("15:00");
    expect(await eventsFor(BIZ_A)).toHaveLength(1);
  });

  test("a cancelled appointment frees its slot again", async () => {
    await db.collection("scheduling_events").doc("cancelled_evt").set({ id: "cancelled_evt", businessId: BIZ_A, eventType: "Job", date: D(), startTime: "11:00", endTime: "12:00", status: "Cancelled", customer: "X" });
    expect((await call("POST", `/api/booking/web/${TOKEN_A}/book`, websiteBooking(TOKEN_A, { startTime: "11:00" }))).status).toBe(200);
  });
});

describe("Cross-tenant isolation", () => {
  test("one business's schedule never affects or leaks into another's availability", async () => {
    await db.collection("scheduling_events").doc("a_job").set({ id: "a_job", businessId: BIZ_A, eventType: "Job", date: D(), startTime: "08:00", endTime: "17:00", status: "Scheduled", customer: "Secret Customer A" });
    const a = await call("GET", `/api/booking/web/${TOKEN_A}/availability?serviceId=repair&from=${D()}&days=1`);
    const b = await call("GET", `/api/booking/web/${TOKEN_B}/availability?serviceId=repair&from=${D()}&days=1`);
    expect(a.body.days[0].slots).toEqual([]);
    expect(b.body.days[0].slots.length).toBe(9);
    expect(JSON.stringify(a.body)).not.toContain("Secret Customer A");
  });

  test("a client-supplied businessId/customerId is ignored -- the token decides the business", async () => {
    const res = await call("POST", `/api/booking/web/${TOKEN_B}/book`, { ...websiteBooking(TOKEN_B), businessId: BIZ_A, customerId: "custA1" });
    expect(res.status).toBe(200);
    expect(await eventsFor(BIZ_A)).toHaveLength(0);
    const [job] = await eventsFor(BIZ_B);
    expect(job.businessId).toBe(BIZ_B);
    expect(job.customerId).not.toBe("custA1");
    expect((await db.collection("customers").doc(job.customerId).get()).data()!.businessId).toBe(BIZ_B);
  });

  test("a website visitor using another business's customer email never gets linked across tenants", async () => {
    // jane@example.com is Business A's customer; booking at Business B must create B's own record.
    const res = await call("POST", `/api/booking/web/${TOKEN_B}/book`, websiteBooking(TOKEN_B, { email: "jane@example.com" }));
    expect(res.status).toBe(200);
    const [job] = await eventsFor(BIZ_B);
    expect(job.customerId).not.toBe("custA1");
    const janeA = (await db.collection("customers").doc("custA1").get()).data()!;
    expect(janeA.address).toBe("");
  });

  test("a portal token only ever books with its own business", async () => {
    const res = await call("POST", "/api/portal/portalTokenB1/booking", { serviceId: "repair", date: D(), startTime: "10:00", address: "9 Elm", businessId: BIZ_A });
    expect(res.status).toBe(200);
    expect(res.body.confirmation.businessName).toBe("Bravo HVAC");
    expect(await eventsFor(BIZ_A)).toHaveLength(0);
    expect((await eventsFor(BIZ_B))[0].customerId).toBe("custB1");
    expect((await call("GET", "/api/portal/bogus-token/booking/options")).status).toBe(404);
  });
});
