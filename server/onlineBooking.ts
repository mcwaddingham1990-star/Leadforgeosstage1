import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, FieldValue, type Firestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import {
  normalizeOnlineBookingConfig,
  type BookingConfirmation, type BookingDayAvailability, type BookingSource, type OnlineBookingConfig, type OnlineBookingService
} from "../src/types/onlineBooking";
import { buildNewCustomerRecord } from "../src/lib/customerDefaults";
import {
  availabilityDateRange, buildAvailability, checkSlot, eventToBusyInterval, isValidDateString, isValidTimeString,
  SLOT_REJECTION_MESSAGES, type BusyInterval, type CalendarEventLike
} from "./bookingAvailability";

/**
 * Online Booking -- the ONE canonical booking pipeline. The Customer Portal
 * (token link), the signed-in Customer Account app, and the business's own
 * website (Website Lead Capture embed token) all end up in the functions
 * below with an already-verified businessId; nothing here ever takes a
 * businessId from the request body. Every booking:
 *
 *   1. re-validates the chosen slot inside a Firestore transaction against
 *      the business's live `scheduling_events` (the Scheduling source of
 *      truth), serialized per business-day by a lock document so two
 *      customers can never take the same slot;
 *   2. finds or creates/updates the business's own Customer record;
 *   3. writes a normal `scheduling_events` Job (the canonical Job record,
 *      see SchedulingEvent.jobNumber) -- so it shows up in Scheduling, Jobs,
 *      Dispatch and the customer's portal immediately with no new UI path;
 *   4. writes an `online_bookings` record (source, photos, description);
 *   5. notifies the business.
 */

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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for Online Booking:", err);
    adminApp = null;
  }
  return adminApp;
}

export function getBookingDb(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
}

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export type BookingChannel = "portal" | "website";

export interface BookingSettings {
  businessId: string;
  businessName: string;
  config: OnlineBookingConfig;
}

export async function loadBookingSettings(db: Firestore, businessId: string): Promise<BookingSettings> {
  const snap = await db.collection("business_profiles").doc(businessId).get();
  const profile = snap.data() || {};
  return {
    businessId,
    businessName: profile.name || profile.businessNames?.[0] || profile.companySettings?.company?.dba || "",
    config: normalizeOnlineBookingConfig(profile.onlineBooking, profile.companySettings)
  };
}

function channelError(settings: BookingSettings, channel: BookingChannel): string | null {
  if (!settings.config.enabled) return "Online booking isn't turned on for this business yet.";
  if (channel === "website" && !settings.config.websiteEnabled) return "Website booking isn't turned on for this business.";
  return null;
}

/** Website-only: resolves the Website Lead Capture embed token to the one
 * business that issued it. The token is the ONLY tenant signal accepted
 * from a website -- a client-supplied businessId is never read. */
export async function resolveWebsiteBusiness(db: Firestore, token: unknown): Promise<string | null> {
  const clean = typeof token === "string" ? token.trim() : "";
  if (!clean || clean.length > 200) return null;
  const snap = await db.collection("business_profiles").where("webFormToken", "==", clean).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

/** True when a browser Origin is allowed to call website booking for this
 * business. Server-to-server calls (no Origin header) are allowed -- the
 * token is the credential; the origin list only stops other sites from
 * embedding someone else's booking form. */
export function originAllowed(config: OnlineBookingConfig, origin: string | undefined): boolean {
  if (!config.allowedOrigins.length || !origin) return true;
  return config.allowedOrigins.includes(origin.replace(/\/+$/, ""));
}

// ---------------------------------------------------------------------------
// Read side: options + availability
// ---------------------------------------------------------------------------

export interface BookingOptionsResult {
  ok: boolean;
  error?: string;
  code?: "DISABLED";
  businessName?: string;
  services?: OnlineBookingService[];
  timeZone?: string;
  maxDaysAhead?: number;
  customer?: { name: string; phone: string; email: string; address: string };
}

export async function getBookingOptions(db: Firestore, businessId: string, channel: BookingChannel, customer?: FirebaseFirestore.DocumentData): Promise<BookingOptionsResult> {
  const settings = await loadBookingSettings(db, businessId);
  const blocked = channelError(settings, channel);
  if (blocked) return { ok: false, code: "DISABLED", error: blocked };
  return {
    ok: true,
    businessName: settings.businessName,
    services: settings.config.services,
    timeZone: settings.config.timeZone,
    maxDaysAhead: settings.config.maxDaysAhead,
    ...(customer ? { customer: { name: customer.contact || customer.company || "", phone: customer.phone || "", email: customer.email || "", address: customer.address || "" } } : {})
  };
}

async function eventsForDates(db: Firestore, businessId: string, dates: string[]): Promise<Map<string, CalendarEventLike[]>> {
  // Equality-only (businessId + date) per day: served by single-field
  // indexes, no composite index deployment needed.
  const snaps = await Promise.all(dates.map(date => db.collection("scheduling_events").where("businessId", "==", businessId).where("date", "==", date).get()));
  const map = new Map<string, CalendarEventLike[]>();
  dates.forEach((date, i) => map.set(date, snaps[i].docs.map(d => d.data())));
  return map;
}

export interface BookingAvailabilityResult {
  ok: boolean;
  error?: string;
  code?: "DISABLED";
  timeZone?: string;
  serviceId?: string;
  days?: BookingDayAvailability[];
}

export async function getBookingAvailability(
  db: Firestore, businessId: string, channel: BookingChannel,
  query: { serviceId?: unknown; from?: unknown; days?: unknown },
  nowMs: number = Date.now()
): Promise<BookingAvailabilityResult> {
  const settings = await loadBookingSettings(db, businessId);
  const blocked = channelError(settings, channel);
  if (blocked) return { ok: false, code: "DISABLED", error: blocked };
  const service = settings.config.services.find(s => s.id === query.serviceId);
  if (!service) return { ok: false, error: "Choose a service first." };
  const dates = availabilityDateRange(settings.config, query.from, query.days, nowMs);
  const events = await eventsForDates(db, businessId, dates);
  return { ok: true, timeZone: settings.config.timeZone, serviceId: service.id, days: buildAvailability(settings.config, service, dates, events, nowMs) };
}

// ---------------------------------------------------------------------------
// Write side: the canonical createBooking
// ---------------------------------------------------------------------------

export interface BookingRequestInput {
  serviceId?: unknown;
  date?: unknown;
  startTime?: unknown;
  address?: unknown;
  description?: unknown;
  photos?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  company?: unknown;
  idempotencyKey?: unknown;
}

/** Who the booking is for: an already-verified Customer (portal/account),
 * or contact details typed on a public website (find-or-create). */
export type BookingCustomerTarget =
  | { kind: "existing"; customerId: string }
  | { kind: "contact" };

export interface CreateBookingResult {
  ok: boolean;
  error?: string;
  code?: "VALIDATION" | "DISABLED" | "SLOT_UNAVAILABLE" | "SERVER";
  confirmation?: BookingConfirmation;
  /** On SLOT_UNAVAILABLE: freshly recomputed availability for that date onward. */
  availability?: BookingDayAvailability[];
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const PHOTO_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_PHOTOS = 4;
const MAX_PHOTO_CHARS = 350_000;
const MAX_TOTAL_PHOTO_CHARS = 800_000; // keeps the online_bookings doc under Firestore's 1 MiB limit

export function validatePhotos(raw: unknown): { ok: true; photos: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, photos: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Photos must be a list of images." };
  if (raw.length > MAX_PHOTOS) return { ok: false, error: `Attach at most ${MAX_PHOTOS} photos.` };
  let total = 0;
  for (const photo of raw) {
    if (typeof photo !== "string" || !PHOTO_RE.test(photo)) return { ok: false, error: "Photos must be JPEG, PNG, WebP or GIF images." };
    if (photo.length > MAX_PHOTO_CHARS) return { ok: false, error: "One of the photos is too large -- try a smaller image." };
    total += photo.length;
  }
  if (total > MAX_TOTAL_PHOTO_CHARS) return { ok: false, error: "The photos are too large together -- attach fewer or smaller images." };
  return { ok: true, photos: raw as string[] };
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const phoneKey = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** Same tolerant matching a person would do: an existing Customer of THIS
 * business with the same email, or the same 10-digit phone number. */
async function findExistingCustomerId(db: Firestore, businessId: string, email: string, phone: string): Promise<string | null> {
  const emailKey = email ? normalizeEmail(email) : "";
  const phoneDigits = phone ? phoneKey(phone) : "";
  if (!emailKey && !phoneDigits) return null;
  const snap = await db.collection("customers").where("businessId", "==", businessId).get();
  let phoneMatch: string | null = null;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (emailKey && typeof data.email === "string" && normalizeEmail(data.email) === emailKey) return doc.id;
    if (!phoneMatch && phoneDigits && typeof data.phone === "string") {
      const storedKeys = data.phone.split(/\s*(?:,|;|\||\n)\s*/).map(phoneKey).filter(Boolean);
      if (storedKeys.includes(phoneDigits)) phoneMatch = doc.id;
    }
  }
  return phoneMatch;
}

/** Per business-day lock document (default-deny in firestore.rules). Every
 * booking transaction reads + writes it, so concurrent bookings for the
 * same business and date are serialized: the loser retries and sees the
 * winner's appointment. */
function slotLockRef(db: Firestore, businessId: string, date: string) {
  const id = createHash("sha256").update(`${businessId}\u0000${date}`).digest("hex");
  return db.collection("booking_slot_locks").doc(id);
}

class SlotUnavailableError extends Error {
  constructor(public reason: keyof typeof SLOT_REJECTION_MESSAGES) {
    super(SLOT_REJECTION_MESSAGES[reason]);
  }
}

async function notifyBusinessOfBooking(db: Firestore, businessId: string, title: string, description: string): Promise<void> {
  // Owner + any employee with Scheduling access -- same fan-out pattern as
  // customerPortal.ts / webLeadFormHandler.ts.
  const recipients = new Set<string>([businessId]);
  try {
    const employeesSnap = await db.collection("employees").where("businessEmail", "==", businessId).get();
    employeesSnap.forEach(employeeDoc => {
      const data = employeeDoc.data();
      const permission = data?.granularPermissions?.scheduling;
      const granted = permission === "view" || permission === "edit" || permission === "delete"
        || permission?.view === true || permission?.edit === true || permission?.delete === true;
      if (granted && typeof data?.email === "string" && data.email) recipients.add(data.email);
    });
  } catch (err) {
    console.error("Error resolving employees for online-booking notification (continuing with owner only):", err);
  }
  const time = nowIso().slice(0, 16).replace("T", " ");
  await Promise.all(Array.from(recipients).map(recipientEmail => {
    const notifId = uid("notif_booking");
    return db.collection("notifications").doc(notifId).set({
      id: notifId, businessId, category: "scheduling", screenId: "scheduling", title, description, time,
      isRead: false, isArchived: false, isPinned: false, priority: "High", assignedUser: "Owner",
      recipientEmail, createdBy: "Online Booking", history: [`${time}: ${description}`]
    });
  }));
}

export async function createBooking(
  db: Firestore,
  businessId: string,
  channel: BookingChannel,
  input: BookingRequestInput,
  target: BookingCustomerTarget,
  options: { nowMs?: number; requestOrigin?: string } = {}
): Promise<CreateBookingResult> {
  const settings = await loadBookingSettings(db, businessId);
  const blocked = channelError(settings, channel);
  if (blocked) return { ok: false, code: "DISABLED", error: blocked };
  const { config } = settings;
  const source: BookingSource = channel === "website" ? "Website Booking" : "Customer Portal";

  // ---- Validation (no writes yet) ----
  const service = config.services.find(s => s.id === input.serviceId);
  if (!service) return { ok: false, code: "VALIDATION", error: "Choose a service." };
  if (!isValidDateString(input.date) || !isValidTimeString(input.startTime)) return { ok: false, code: "VALIDATION", error: "Choose an available date and time." };
  const date = input.date;
  const startTime = input.startTime;
  const address = str(input.address, 300);
  if (!address) return { ok: false, code: "VALIDATION", error: "Enter the service address." };
  const description = str(input.description, 2000);
  const photosCheck = validatePhotos(input.photos);
  if (photosCheck.ok === false) return { ok: false, code: "VALIDATION", error: photosCheck.error };
  const name = str(input.name, 120);
  const phone = str(input.phone, 40);
  const email = str(input.email, 200);
  if (email && !isEmail(email)) return { ok: false, code: "VALIDATION", error: "Enter a valid email address." };
  if (target.kind === "contact") {
    if (!name) return { ok: false, code: "VALIDATION", error: "Name is required." };
    if (!phone && !email) return { ok: false, code: "VALIDATION", error: "A phone number or email is required." };
  }
  const idempotencyKey = str(input.idempotencyKey, 100);
  const nowMs = options.nowMs ?? Date.now();

  // Cheap pre-check outside the transaction for a clear early answer; the
  // authoritative check is repeated inside the transaction below.
  const preCheck = checkSlot(config, service, date, startTime, [], nowMs);
  if (preCheck.ok === false && preCheck.reason !== "unavailable") {
    return { ok: false, code: "SLOT_UNAVAILABLE", error: SLOT_REJECTION_MESSAGES[preCheck.reason], availability: await refreshedAvailability(db, settings, service, date, nowMs) };
  }

  // ---- Customer lookup (read-only, outside the transaction) ----
  let customerId: string | null = target.kind === "existing" ? target.customerId : await findExistingCustomerId(db, businessId, email, phone);

  // Job numbering follows useDomainActions.createJob: JOB-<year>-<n+1>.
  const jobCountSnap = await db.collection("scheduling_events").where("businessId", "==", businessId).where("eventType", "==", "Job").count().get();
  const jobNumber = `JOB-${new Date(nowMs).getFullYear()}-${String(jobCountSnap.data().count + 1).padStart(4, "0")}`;

  const bookingRef = db.collection("online_bookings").doc(uid("booking"));
  const jobRef = db.collection("scheduling_events").doc(uid("job_booking"));
  const lockRef = slotLockRef(db, businessId, date);

  try {
    const outcome = await db.runTransaction(async tx => {
      // ---- reads (all before any write) ----
      const lockSnap = await tx.get(lockRef);
      if (idempotencyKey) {
        const dup = await tx.get(db.collection("online_bookings").where("businessId", "==", businessId).where("idempotencyKey", "==", idempotencyKey).limit(1));
        if (!dup.empty) return { duplicate: dup.docs[0].data() };
      }
      const eventsSnap = await tx.get(db.collection("scheduling_events").where("businessId", "==", businessId).where("date", "==", date));
      let customerSnap: FirebaseFirestore.DocumentSnapshot | null = null;
      if (customerId) {
        customerSnap = await tx.get(db.collection("customers").doc(customerId));
        // Never attach a booking to a customer of a different business.
        if (!customerSnap.exists || customerSnap.data()?.businessId !== businessId) {
          if (target.kind === "existing") throw new Error("CUSTOMER_MISMATCH");
          customerSnap = null;
          customerId = null;
        }
      }

      const busy = eventsSnap.docs.map(d => eventToBusyInterval(d.data())).filter((b): b is BusyInterval => !!b);
      const check = checkSlot(config, service, date, startTime, busy, nowMs);
      if (check.ok === false) throw new SlotUnavailableError(check.reason);
      const endTime = check.endTime;
      const now = nowIso();

      // ---- customer: find-or-create, and only ever FILL blanks ----
      let customer: FirebaseFirestore.DocumentData;
      if (customerSnap) {
        customer = { id: customerSnap.id, ...customerSnap.data() };
        const fill: Record<string, unknown> = {};
        if (!customer.address && address) fill.address = address;
        if (!customer.phone && phone) fill.phone = phone;
        if (!customer.email && email) fill.email = email;
        if (customer.status === "Potential") fill.status = "Active";
        if (Object.keys(fill).length) {
          tx.update(customerSnap.ref, { ...fill, updatedAt: now });
          customer = { ...customer, ...fill };
        }
      } else {
        const record = buildNewCustomerRecord({
          name, company: str(input.company, 120) || name, phone, email, address,
          status: "Active", openJobs: 1, source: "Website", pendingConfirmation: true
        });
        // The shared record builder leaves optional fields undefined, which
        // the Admin SDK rejects -- drop them rather than store nulls.
        customer = Object.fromEntries(Object.entries({ ...record, businessId, createdAt: now, updatedAt: now }).filter(([, v]) => v !== undefined));
        customerId = record.id;
        tx.set(db.collection("customers").doc(record.id), customer);
      }
      const customerName = customer.contact || customer.company || name || "Customer";
      const contactPhone = phone || customer.phone || "";
      const contactEmail = email || customer.email || "";

      // ---- the Job / scheduling appointment (canonical record) ----
      const noteLines = [`Booked online via ${source}.`, `Service: ${service.name}`];
      if (description) noteLines.push(`Customer notes: ${description}`);
      if (photosCheck.photos.length) noteLines.push(`${photosCheck.photos.length} photo(s) attached to the online booking.`);
      tx.set(jobRef, {
        id: jobRef.id,
        eventType: "Job",
        jobNumber,
        date, startTime, endTime,
        customerId,
        customer: customerName,
        customerPhone: contactPhone,
        customerEmail: contactEmail,
        customerAddress: address,
        location: address,
        title: service.name,
        customType: service.name,
        jobType: service.name,
        description: description || service.name,
        notes: noteLines.join("\n"),
        estimatedDuration: `${service.durationMinutes} min`,
        assignedEmployee: "",
        priority: "Medium",
        status: "Scheduled",
        source: channel === "website" ? "Website" : "Customer Portal",
        bookingSource: source,
        onlineBookingId: bookingRef.id,
        customerVisible: true,
        progress: 0,
        checklist: [],
        materials: [],
        activity: [{ id: uid("activity"), timestamp: now, action: `Job booked online (${source})`, by: customerName }],
        createdAt: now,
        updatedAt: now,
        businessId
      });

      // ---- the booking / service-request record ----
      tx.set(bookingRef, {
        id: bookingRef.id,
        businessId,
        source,
        channel,
        status: "Confirmed",
        schedulingEventId: jobRef.id,
        jobNumber,
        customerId,
        customerName,
        contactName: name || customerName,
        contactPhone,
        contactEmail,
        serviceId: service.id,
        serviceName: service.name,
        durationMinutes: service.durationMinutes,
        date, startTime, endTime,
        timeZone: config.timeZone,
        address,
        description,
        photos: photosCheck.photos,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(options.requestOrigin ? { requestOrigin: options.requestOrigin.slice(0, 200) } : {}),
        createdAt: now,
        updatedAt: now
      });

      tx.set(lockRef, { businessId, date, bookings: FieldValue.increment(1), updatedAt: now, ...(lockSnap.exists ? {} : { createdAt: now }) }, { merge: true });

      return { customerName, endTime };
    });

    if ("duplicate" in outcome) {
      const d = outcome.duplicate as FirebaseFirestore.DocumentData;
      return {
        ok: true,
        confirmation: {
          bookingId: d.id, jobId: d.schedulingEventId, jobNumber: d.jobNumber, businessName: settings.businessName, serviceName: d.serviceName,
          date: d.date, startTime: d.startTime, endTime: d.endTime, timeZone: d.timeZone, address: d.address, source: d.source
        }
      };
    }

    try {
      await notifyBusinessOfBooking(
        db, businessId, "New online booking",
        `${outcome.customerName} booked ${service.name} on ${date} at ${startTime} (${source}).`
      );
    } catch (err) {
      // The booking itself is committed; a notification failure must not undo it.
      console.error("Online booking saved but the business notification failed:", err);
    }

    return {
      ok: true,
      confirmation: {
        bookingId: bookingRef.id, jobId: jobRef.id, jobNumber, businessName: settings.businessName, serviceName: service.name,
        date, startTime, endTime: outcome.endTime, timeZone: config.timeZone, address, source
      }
    };
  } catch (err) {
    if (err instanceof SlotUnavailableError) {
      return { ok: false, code: "SLOT_UNAVAILABLE", error: err.message, availability: await refreshedAvailability(db, settings, service, date, nowMs) };
    }
    if (err instanceof Error && err.message === "CUSTOMER_MISMATCH") {
      return { ok: false, code: "VALIDATION", error: "We couldn't find your customer record. Contact the business." };
    }
    throw err;
  }
}

async function refreshedAvailability(db: Firestore, settings: BookingSettings, service: OnlineBookingService, fromDate: string, nowMs: number): Promise<BookingDayAvailability[]> {
  const dates = availabilityDateRange(settings.config, isValidDateString(fromDate) ? fromDate : undefined, 7, nowMs);
  const events = await eventsForDates(db, settings.businessId, dates);
  return buildAvailability(settings.config, service, dates, events, nowMs);
}
