/**
 * Service Agreements server behavior against the real Firestore emulator:
 * recurring visit generation (visit limit, no duplicates, booked-visit
 * skip, existing unlimited memberships unchanged), reminder notifications
 * (created once), and the Customer Portal's visits-left figure.
 *
 * Run with `npm run test:booking` (firebase emulators:exec sets
 * FIRESTORE_EMULATOR_HOST).
 */
import { beforeAll, beforeEach, describe, expect, test } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

const PROJECT_ID = "demo-ownerslocal-booking-test";
const DATABASE_ID = firebaseConfig.firestoreDatabaseId || "(default)";
const BIZ = "owner@example.com";

let db: Firestore;
let scheduler: typeof import("../server/recurringScheduler");
let portal: typeof import("../server/customerPortal");

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => {
  const d = new Date(`${today()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// Firestore Admin rejects undefined values -- drop them, like the app does.
const clean = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const agreement = (patch: Record<string, unknown> = {}) => clean({
  id: "mem_hvac", businessId: BIZ, planName: "HVAC Annual Plan", customerId: "cust1", customerName: "Pat Customer",
  price: 25, billingFrequency: "monthly", includedServices: [{ id: "s1", description: "Annual inspection", quantity: 1, unitPrice: 0 }],
  maintenanceFrequency: { unit: "months", interval: 6 }, startDate: plusDays(-30), endDate: plusDays(335),
  status: "Active", nextMaintenanceDate: today(), visitsIncluded: 2,
  coveredEquipment: [{ id: "eq1", type: "AC", manufacturer: "Trane", model: "XR14" }, { id: "eq2", type: "Furnace", manufacturer: "Carrier" }],
  createdAt: new Date().toISOString(), ...patch
} as Record<string, unknown>);

async function clearEmulator() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const res = await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Could not clear emulator: ${res.status}`);
}

const workOrdersFor = async (id: string) => (await db.collection("work_orders").where("sourceMembershipId", "==", id).get()).docs.map(d => d.data());

beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run via `npm run test:booking` (needs the Firestore emulator).");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  const serviceAccount = { type: "service_account", project_id: PROJECT_ID, private_key: privateKey, client_email: "test@demo-ownerslocal-booking-test.iam.gserviceaccount.com" };
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(serviceAccount);
  process.env.FIREBASE_DATABASE_ID = DATABASE_ID;
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount as any), projectId: PROJECT_ID });
  db = getFirestore(app, DATABASE_ID);
  scheduler = await import("../server/recurringScheduler");
  portal = await import("../server/customerPortal");
});

beforeEach(async () => {
  await clearEmulator();
});

describe("recurring visit generation", () => {
  test("generates one visit per due date, never twice for the same date", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement());
    await scheduler.processDueMembershipMaintenance();
    await scheduler.processDueMembershipMaintenance();
    const wos = await workOrdersFor("mem_hvac");
    expect(wos).toHaveLength(1);
    const m = (await db.collection("memberships").doc("mem_hvac").get()).data()!;
    expect(m.visitsGenerated).toBe(1);
    expect(m.nextMaintenanceDate > today()).toBe(true);
  });

  test("stops generating once the included visits have been created", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement({ visitsGenerated: 1, visitsCountedFrom: plusDays(-30) }));
    await scheduler.processDueMembershipMaintenance();
    let m = (await db.collection("memberships").doc("mem_hvac").get()).data()!;
    expect(m.visitsGenerated).toBe(2);
    expect(m.nextMaintenanceDate).toBeNull();
    expect(await workOrdersFor("mem_hvac")).toHaveLength(1);

    // Even if a due date is set again, a third visit is not created.
    await db.collection("memberships").doc("mem_hvac").update({ nextMaintenanceDate: today() });
    await scheduler.processDueMembershipMaintenance();
    m = (await db.collection("memberships").doc("mem_hvac").get()).data()!;
    expect(m.visitsGenerated).toBe(2);
    expect(await workOrdersFor("mem_hvac")).toHaveLength(1);
  });

  test("after a Renew, the visit count starts over for the new term", async () => {
    // Old term used both visits; renewed so the new term starts today.
    await db.collection("memberships").doc("mem_hvac").set(agreement({
      startDate: today(), previousStartDate: plusDays(-365), visitsGenerated: 2, visitsCountedFrom: plusDays(-365)
    }));
    await scheduler.processDueMembershipMaintenance();
    expect(await workOrdersFor("mem_hvac")).toHaveLength(1);
    const m = (await db.collection("memberships").doc("mem_hvac").get()).data()!;
    expect(m.visitsGenerated).toBe(1);
    expect(m.visitsCountedFrom).toBe(today());
  });

  test("a visit already booked by hand covers the cycle (no second visit)", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement());
    await db.collection("scheduling_events").doc("job_booked").set({
      id: "job_booked", eventType: "Job", businessId: BIZ, sourceMembershipId: "mem_hvac", status: "Assigned", date: plusDays(2), customer: "Pat Customer"
    });
    await scheduler.processDueMembershipMaintenance();
    expect(await workOrdersFor("mem_hvac")).toHaveLength(0);
    const m = (await db.collection("memberships").doc("mem_hvac").get()).data()!;
    expect(m.nextMaintenanceDate > today()).toBe(true);
  });

  test("existing memberships without a visit limit keep generating as before", async () => {
    await db.collection("memberships").doc("mem_legacy").set(agreement({ id: "mem_legacy", visitsIncluded: undefined, coveredEquipment: undefined, visitsGenerated: 5 }));
    await scheduler.processDueMembershipMaintenance();
    expect(await workOrdersFor("mem_legacy")).toHaveLength(1);
  });

  test("paused or canceled agreements generate nothing", async () => {
    await db.collection("memberships").doc("mem_p").set(agreement({ id: "mem_p", status: "Paused" }));
    await db.collection("memberships").doc("mem_c").set(agreement({ id: "mem_c", status: "Canceled" }));
    await scheduler.processDueMembershipMaintenance();
    expect(await workOrdersFor("mem_p")).toHaveLength(0);
    expect(await workOrdersFor("mem_c")).toHaveLength(0);
  });
});

describe("reminders", () => {
  test("upcoming visit and expiring agreement reminders are created once, addressed to the owner", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement({ nextMaintenanceDate: plusDays(5), endDate: plusDays(20) }));
    await scheduler.processServiceAgreementReminders();
    await scheduler.processServiceAgreementReminders();
    const notifs = (await db.collection("notifications").where("businessId", "==", BIZ).get()).docs.map(d => d.data());
    expect(notifs).toHaveLength(2);
    expect(notifs.every(n => n.recipientEmail === BIZ && n.screenId === "service_agreements" && n.isRead === false)).toBe(true);
    expect(notifs.map(n => n.title).sort()).toEqual(["Maintenance visit coming up", "Service agreement expiring"]);
  });

  test("no reminders for far-off dates or inactive agreements", async () => {
    await db.collection("memberships").doc("mem_far").set(agreement({ id: "mem_far", nextMaintenanceDate: plusDays(60), endDate: plusDays(300) }));
    await db.collection("memberships").doc("mem_off").set(agreement({ id: "mem_off", status: "Canceled", nextMaintenanceDate: plusDays(2), endDate: plusDays(10) }));
    await scheduler.processServiceAgreementReminders();
    expect((await db.collection("notifications").get()).size).toBe(0);
  });
});

describe("customer portal", () => {
  test("shows covered equipment and visits left from completed visits", async () => {
    await db.collection("customers").doc("cust1").set({
      id: "cust1", businessId: BIZ, contact: "Pat Customer", company: "", email: "pat@example.com", phone: "555-000-1111",
      address: "1 Elm St", status: "Active", portalEnabled: true, portalToken: "portalTokenPat"
    });
    await db.collection("business_profiles").doc(BIZ).set({ name: "Cool Air HVAC" });
    await db.collection("memberships").doc("mem_hvac").set(agreement());
    await db.collection("scheduling_events").doc("job_done").set({
      id: "job_done", eventType: "Job", businessId: BIZ, customerId: "cust1", customer: "Pat Customer",
      sourceMembershipId: "mem_hvac", status: "Completed", date: plusDays(-5)
    });
    const result: any = await portal.getPortalData("portalTokenPat");
    expect(result.ok).toBe(true);
    const m = result.memberships.find((x: any) => x.id === "mem_hvac");
    expect(m.visitsIncluded).toBe(2);
    expect(m.visitsCompleted).toBe(1);
    expect(m.visitsRemaining).toBe(1);
    expect(m.coveredEquipment.map((eq: any) => eq.type)).toEqual(["AC", "Furnace"]);
  });
});

describe("billing ($25 monthly)", () => {
  test("invoice billing creates one invoice per billing date, never twice", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement({ billingMethod: "invoice", nextPaymentDate: today() }));
    await scheduler.processDueMembershipBilling();
    await scheduler.processDueMembershipBilling();
    const invoices = (await db.collection("invoices").where("membershipId", "==", "mem_hvac").get()).docs.map(d => d.data());
    expect(invoices).toHaveLength(1);
    expect(invoices[0].lineItems[0].unitPrice).toBe(25);
    const m = (await db.collection("memberships").doc("mem_hvac").get()).data()!;
    expect(m.nextPaymentDate > today()).toBe(true);
  });

  test("Stripe billing never charges -- it only tells the owner a charge is due", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement({ billingMethod: "stripe", nextPaymentDate: today() }));
    await scheduler.processDueMembershipBilling();
    await scheduler.processDueMembershipBilling();
    expect((await db.collection("invoices").get()).size).toBe(0);
    expect((await db.collection("transactions").get()).size).toBe(0);
    const notifs = (await db.collection("notifications").get()).docs.map(d => d.data());
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toBe("Stripe membership charge due");
  });

  test("canceled agreements are not billed", async () => {
    await db.collection("memberships").doc("mem_hvac").set(agreement({ status: "Canceled", billingMethod: "invoice", nextPaymentDate: today() }));
    await scheduler.processDueMembershipBilling();
    expect((await db.collection("invoices").get()).size).toBe(0);
  });
});

describe("repeating expenses (Log Expense › Repeating)", () => {
  const repeating = (patch: Record<string, unknown> = {}) => ({
    id: "rec_rent", businessId: BIZ, type: "expense", templateName: "Landlord", frequency: "monthly", nextRunDate: today(), active: true,
    payload: { customerOrVendor: "Landlord", lineItems: [{ id: "l1", description: "Landlord", quantity: 1, unitPrice: 1200 }], category: "Rent", dueInDays: 0 },
    createdAt: new Date().toISOString(), ...patch
  });

  test("logs the expense (with its ledger entry) once on its due date and moves to the next one", async () => {
    await db.collection("recurring_transactions").doc("rec_rent").set(repeating());
    await scheduler.processDueRecurringTransactions();
    await scheduler.processDueRecurringTransactions();
    const txns = (await db.collection("transactions").get()).docs.map(d => d.data());
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ type: "expense", source: "recurring_expense", amount: 1200, category: "Rent", date: today(), businessId: BIZ, recurringTransactionId: "rec_rent" });
    const entry = (await db.collection("journal_entries").doc(`je_for_${txns[0].id}`).get()).data()!;
    expect(entry.lines).toEqual([{ accountId: "acct_rent_expense", debit: 1200, credit: 0 }, { accountId: "acct_cash", debit: 0, credit: 1200 }]);
    expect((await db.collection("bills").get()).size).toBe(0);
    const rec = (await db.collection("recurring_transactions").doc("rec_rent").get()).data()!;
    expect(rec.nextRunDate > today()).toBe(true);
  });

  test("a stopped or not-yet-due repeating expense logs nothing", async () => {
    await db.collection("recurring_transactions").doc("rec_rent").set(repeating({ active: false }));
    await db.collection("recurring_transactions").doc("rec_later").set(repeating({ id: "rec_later", nextRunDate: plusDays(5) }));
    await scheduler.processDueRecurringTransactions();
    expect((await db.collection("transactions").get()).size).toBe(0);
  });
});
