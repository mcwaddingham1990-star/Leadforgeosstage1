import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import { createInvoiceCheckoutSession, getConnectAccountStatus } from "./stripeConnect";

/**
 * Owner'sLOCAL Customer -- the real, global customer-account system. A
 * signed-in CustomerAccount (its own Firebase Auth user, see
 * CustomerLoginPanel.tsx) can be linked to many completely separate
 * businesses at once via a BusinessRelationship (src/types/customerAccount.ts).
 * Every read/write below re-derives businessId from a confirmed, Active
 * relationship server-side -- never from a client-supplied businessId alone
 * -- so one customer's connection to Business A can never be used to reach
 * Business B's data, and a customer can never see a business's records
 * before that business (or the customer, via a redeemed invite code) has
 * actually established the relationship. Same Admin-SDK pattern as
 * server/customerPortal.ts, entirely separate collections/tokens.
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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for Customer Accounts:", err);
    adminApp = null;
  }
  return adminApp;
}

function getDb(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
}

const uid = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

/** Same tolerant name-matching fallback as customerPortal.ts, needed since
 * most existing Estimate/Job/Invoice/Document/Work Order records predate a
 * real customerId link and only ever captured the customer's name/company. */
function customerMatchValues(customer: FirebaseFirestore.DocumentData): string[] {
  return [customer.id, customer.contact, customer.company].filter(Boolean);
}

function customerDisplayName(customer: FirebaseFirestore.DocumentData): string {
  return customer.contact || customer.company || "Customer";
}

// Same internal-only folder exclusion list as customerPortal.ts.
const INTERNAL_DOCUMENT_FOLDERS = new Set(["Employees", "Taxes", "Expenses/Receipts", "Snapshots", "Employee Snapshot", "Purchase Orders", "Customer Notes"]);

function invoiceTotals(inv: FirebaseFirestore.DocumentData): { total: number; balanceDue: number } {
  const subtotal = (inv.lineItems || []).reduce((s: number, li: any) => s + li.quantity * li.unitPrice, 0);
  const total = subtotal + subtotal * ((inv.taxRate || 0) / 100);
  return { total, balanceDue: Math.max(0, total - (inv.amountPaid || 0)) };
}

async function writeAuditLog(db: Firestore, businessId: string, customerAccountId: string, action: string, detail: string): Promise<void> {
  const id = uid("audit");
  try {
    await db.collection("audit_logs").doc(id).set({ id, businessId, customerAccountId, action, detail, createdAt: nowIso() });
  } catch (err) {
    console.error("Error writing Customer Account audit log entry (continuing):", err);
  }
}

/** Same fan-out-to-owner-plus-permitted-employees pattern as
 * customerPortal.ts's notifyBusinessUsers, duplicated here rather than
 * imported since each server/*.ts file in this project owns its own copy. */
async function notifyBusinessUsers(db: Firestore, businessId: string, permissionModule: string, title: string, description: string, screenId?: string): Promise<void> {
  const recipients = new Set<string>([businessId]);
  try {
    const employeesSnap = await db.collection("employees").where("businessEmail", "==", businessId).get();
    employeesSnap.forEach(employeeDoc => {
      const data = employeeDoc.data();
      const permission = data?.granularPermissions?.[permissionModule];
      const granted = permission === "view" || permission === "edit" || permission === "delete"
        || permission?.view === true || permission?.edit === true || permission?.delete === true;
      if (granted && typeof data?.email === "string" && data.email) recipients.add(data.email);
    });
  } catch (err) {
    console.error("Error resolving employees for Customer Account notification (continuing with owner only):", err);
  }

  const time = nowIso().slice(0, 16).replace("T", " ");
  const writes = Array.from(recipients).map(recipientEmail => {
    const notifId = uid("notif_acct");
    return db.collection("notifications").doc(notifId).set({
      id: notifId,
      businessId,
      category: permissionModule,
      screenId: screenId || permissionModule,
      title,
      description,
      time,
      isRead: false,
      isArchived: false,
      isPinned: false,
      priority: "Normal",
      assignedUser: "Owner",
      recipientEmail,
      createdBy: "Customer Account",
      history: [`${time}: ${description}`]
    });
  });
  await Promise.all(writes);
}

/** Resolves a signed-in BUSINESS user's own businessId (tenant key) from
 * their uid -- same rule as stripeConnectRoutes.ts's resolveBusinessId --
 * used only by the business-side endpoints below (generating invite codes,
 * disconnecting a customer). Never trusts a client-supplied businessId. */
async function resolveCallerBusinessId(db: Firestore, uidToResolve: string): Promise<string | null> {
  const snap = await db.collection("user_profiles").doc(uidToResolve).get();
  const businessEmail = snap.data()?.businessEmail;
  return typeof businessEmail === "string" && businessEmail ? businessEmail : null;
}

// ---------------------------------------------------------------------------
// Business Relationships -- redeem/accept/decline/remove (points 8-12)
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}
const INVITE_CODE_TTL_DAYS = 14;

export interface ServiceProfessionalCard {
  relationshipId: string;
  businessId: string;
  businessName: string;
  logo?: string;
  phone?: string;
  status: string;
  activeJobs: number;
  nextAppointment?: string;
  amountDue: number;
}

export interface PendingConnection {
  relationshipId: string;
  businessId: string;
  businessName: string;
  source: string;
}

export async function getServiceProfessionals(customerAccountId: string): Promise<{ ok: boolean; error?: string; professionals?: ServiceProfessionalCard[]; pending?: PendingConnection[] }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const relSnap = await db.collection("business_relationships").where("customerAccountId", "==", customerAccountId).get();
  const relationships = relSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
  const active = relationships.filter(r => r.status === "Active");
  const pendingList = relationships.filter(r => r.status === "Pending");

  const professionals = await Promise.all(active.map(async (rel): Promise<ServiceProfessionalCard> => {
    const [profileSnap, customerSnap] = await Promise.all([
      db.collection("business_profiles").doc(rel.businessId).get(),
      db.collection("customers").doc(rel.businessCustomerId).get()
    ]);
    const profile = profileSnap.data() || {};
    let activeJobs = 0;
    let nextAppointment: string | undefined;
    let amountDue = 0;
    if (customerSnap.exists) {
      const customer = { id: customerSnap.id, ...customerSnap.data() };
      const names = customerMatchValues(customer);
      const [jobsSnap, invoicesSnap] = await Promise.all([
        db.collection("scheduling_events").where("businessId", "==", rel.businessId).get(),
        db.collection("invoices").where("businessId", "==", rel.businessId).get()
      ]);
      const myEvents = jobsSnap.docs.map(d => d.data()).filter(e => e.customerId === rel.businessCustomerId || names.includes(e.customer));
      const today = new Date().toISOString().slice(0, 10);
      activeJobs = myEvents.filter(e => e.eventType === "Job" && e.status !== "Completed" && e.status !== "Cancelled").length;
      const upcoming = myEvents.filter(e => e.date >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      nextAppointment = upcoming[0]?.date;
      const myInvoices = invoicesSnap.docs.map(d => d.data()).filter(inv => inv.customerId === rel.businessCustomerId || names.includes(inv.customer));
      amountDue = myInvoices.reduce((sum, inv) => sum + invoiceTotals(inv).balanceDue, 0);
    }
    return {
      relationshipId: rel.id, businessId: rel.businessId, businessName: profile.name || rel.businessName || "Service Professional",
      logo: profile.logo || undefined, phone: profile.phone || undefined, status: rel.status, activeJobs, nextAppointment, amountDue
    };
  }));

  const pending = await Promise.all(pendingList.map(async (rel): Promise<PendingConnection> => {
    const profileSnap = await db.collection("business_profiles").doc(rel.businessId).get();
    return { relationshipId: rel.id, businessId: rel.businessId, businessName: profileSnap.data()?.name || rel.businessName || "Service Professional", source: rel.source };
  }));

  return { ok: true, professionals, pending };
}

export async function redeemInviteCode(customerAccountId: string, rawCode: string): Promise<{ ok: boolean; error?: string; businessName?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const code = (rawCode || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!code) return { ok: false, error: "Enter an invite code." };

  const snap = await db.collection("business_invite_codes").where("code", "==", code).limit(1).get();
  if (snap.empty) return { ok: false, error: "That code isn't valid." };
  const codeDoc = snap.docs[0];
  const data = codeDoc.data();
  if (data.revoked) return { ok: false, error: "This invite code has been cancelled." };
  if (data.usedAt) return { ok: false, error: "This invite code has already been used." };
  if (new Date(data.expiresAt).getTime() < Date.now()) return { ok: false, error: "This invite code has expired -- ask the business for a new one." };

  const businessId = data.businessId as string;
  const businessCustomerId = data.businessCustomerId as string;
  const customerSnap = await db.collection("customers").doc(businessCustomerId).get();
  if (!customerSnap.exists || customerSnap.data()?.businessId !== businessId) return { ok: false, error: "This invite code is no longer valid." };

  const profileSnap = await db.collection("business_profiles").doc(businessId).get();
  const businessName = profileSnap.data()?.name || "";
  const now = nowIso();

  // Never create a second relationship to the same business -- refresh the
  // existing one instead (point 7: never merge/duplicate CRM records).
  const existingSnap = await db.collection("business_relationships")
    .where("customerAccountId", "==", customerAccountId)
    .where("businessId", "==", businessId)
    .get();

  if (!existingSnap.empty) {
    const existing = existingSnap.docs[0];
    if (existing.data().status !== "Active") {
      await existing.ref.update({
        status: "Pending", businessCustomerId, businessName, source: data.source || "invite_code",
        updatedAt: now, respondedAt: null, removedAt: null, removedBy: null
      });
    }
  } else {
    const relId = uid("rel");
    await db.collection("business_relationships").doc(relId).set({
      id: relId, customerAccountId, businessId, businessCustomerId, businessName,
      status: "Pending", source: data.source || "invite_code", createdAt: now, updatedAt: now
    });
  }
  await codeDoc.ref.update({ usedAt: now, usedByCustomerAccountId: customerAccountId });
  return { ok: true, businessName };
}

async function loadOwnRelationship(db: Firestore, customerAccountId: string, relationshipId: string) {
  const ref = db.collection("business_relationships").doc(relationshipId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.customerAccountId !== customerAccountId) return null;
  return { ref, data: snap.data()! };
}

export async function acceptRelationship(customerAccountId: string, relationshipId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const found = await loadOwnRelationship(db, customerAccountId, relationshipId);
  if (!found) return { ok: false, error: "Connection request not found." };
  if (found.data.status !== "Pending") return { ok: false, error: "This connection isn't waiting for a response." };
  const now = nowIso();
  await found.ref.update({ status: "Active", respondedAt: now, updatedAt: now });
  await writeAuditLog(db, found.data.businessId, customerAccountId, "business_connection_accepted", "Customer accepted the business connection.");
  await notifyBusinessUsers(db, found.data.businessId, "customers", "Customer connected their free account", "A customer accepted your connection request and can now see their jobs, estimates, and invoices in their Owner'sLOCAL account.", "customers");
  return { ok: true };
}

export async function declineRelationship(customerAccountId: string, relationshipId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const found = await loadOwnRelationship(db, customerAccountId, relationshipId);
  if (!found) return { ok: false, error: "Connection request not found." };
  if (found.data.status !== "Pending") return { ok: false, error: "This connection isn't waiting for a response." };
  const now = nowIso();
  await found.ref.update({ status: "Inactive", removedBy: "customer", removedAt: now, respondedAt: now, updatedAt: now });
  await writeAuditLog(db, found.data.businessId, customerAccountId, "business_connection_removed", "Customer declined the business connection.");
  return { ok: true };
}

export async function removeRelationship(customerAccountId: string, relationshipId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const found = await loadOwnRelationship(db, customerAccountId, relationshipId);
  if (!found) return { ok: false, error: "Connection not found." };
  if (found.data.status !== "Active") return { ok: false, error: "Only a connected business can be removed." };
  const now = nowIso();
  await found.ref.update({ status: "Inactive", removedBy: "customer", removedAt: now, updatedAt: now });
  await writeAuditLog(db, found.data.businessId, customerAccountId, "business_connection_removed", "Customer removed this service professional.");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Business-side: invite codes + disconnect (used by CustomerPortalControls)
// ---------------------------------------------------------------------------

export async function createBusinessInviteCode(callerUid: string, businessCustomerId: string, source: "invite_code" | "bid_accepted" | "visit_scheduled" = "invite_code"): Promise<{ ok: boolean; error?: string; code?: string; expiresAt?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const businessId = await resolveCallerBusinessId(db, callerUid);
  if (!businessId) return { ok: false, error: "Your account has no business linked." };
  const customerSnap = await db.collection("customers").doc(businessCustomerId).get();
  if (!customerSnap.exists || customerSnap.data()?.businessId !== businessId) return { ok: false, error: "Customer not found." };

  let code = "";
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = generateInviteCode();
    const clash = await db.collection("business_invite_codes").where("code", "==", candidate).limit(1).get();
    if (clash.empty) code = candidate;
  }
  if (!code) return { ok: false, error: "Could not generate a code -- try again." };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_CODE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const id = uid("invite");
  await db.collection("business_invite_codes").doc(id).set({
    id, code, businessId, businessCustomerId, createdAt: now.toISOString(), expiresAt,
    usedAt: null, usedByCustomerAccountId: null, revoked: false, source
  });
  return { ok: true, code, expiresAt };
}

/** "Disconnect Customer" (business side) -- ends the app connection only.
 * Never touches the business's own Customer/Job/Estimate/Invoice/Document
 * records, so nothing historical is ever deleted (point 12). */
export async function disconnectCustomer(callerUid: string, businessCustomerId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const businessId = await resolveCallerBusinessId(db, callerUid);
  if (!businessId) return { ok: false, error: "Your account has no business linked." };
  const relSnap = await db.collection("business_relationships").where("businessId", "==", businessId).where("businessCustomerId", "==", businessCustomerId).get();
  const openDocs = relSnap.docs.filter(d => d.data().status === "Active" || d.data().status === "Pending");
  if (!openDocs.length) return { ok: false, error: "This customer has no connected app account." };
  const now = nowIso();
  await Promise.all(openDocs.map(d => d.ref.update({ status: "Inactive", removedBy: "business", removedAt: now, updatedAt: now })));
  await Promise.all(openDocs.map(d => writeAuditLog(db, businessId, d.data().customerAccountId, "business_connection_removed", "Business disconnected this customer's app access.")));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Aggregated cross-business reads -- every one re-derives businessId from a
// confirmed Active relationship, never from the client (points 14-23, 37).
// ---------------------------------------------------------------------------

interface RelationshipContext {
  businessId: string;
  businessName: string;
  businessCustomerId: string;
  customer: FirebaseFirestore.DocumentData;
  names: string[];
}

async function getActiveRelationshipContexts(db: Firestore, customerAccountId: string, businessIdFilter?: string): Promise<RelationshipContext[]> {
  let query: FirebaseFirestore.Query = db.collection("business_relationships").where("customerAccountId", "==", customerAccountId);
  if (businessIdFilter) query = query.where("businessId", "==", businessIdFilter);
  const snap = await query.get();
  const relationships = snap.docs.map(d => d.data()).filter(r => r.status === "Active");
  const contexts = await Promise.all(relationships.map(async (rel): Promise<RelationshipContext | null> => {
    const customerSnap = await db.collection("customers").doc(rel.businessCustomerId).get();
    if (!customerSnap.exists || customerSnap.data()?.businessId !== rel.businessId) return null;
    const customer = { id: customerSnap.id, ...customerSnap.data() };
    return { businessId: rel.businessId, businessName: rel.businessName || "", businessCustomerId: rel.businessCustomerId, customer, names: customerMatchValues(customer) };
  }));
  return contexts.filter((c): c is RelationshipContext => !!c);
}

/** businessIdFilter of "" (falsy) means "All Businesses" -- point 13. A
 * non-empty filter the customer isn't Active-connected to simply yields an
 * empty context list (never an error), so this can't be used to probe
 * whether some other business exists. */
async function resolveContexts(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: true; db: Firestore; contexts: RelationshipContext[] } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "This isn't configured on the server yet." };
  const contexts = await getActiveRelationshipContexts(db, customerAccountId, businessIdFilter || undefined);
  return { ok: true, db, contexts };
}

export interface TaggedJob { id: string; businessId: string; businessName: string; jobNumber?: string; title?: string; description?: string; date: string; startTime: string; endTime: string; status: string; priority: string; assignedEmployee?: string; location?: string; progress?: number; checklist?: Array<{ id: string; label: string; completed: boolean }> }

export async function getJobs(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: boolean; error?: string; jobs?: TaggedJob[] }> {
  const resolved = await resolveContexts(customerAccountId, businessIdFilter);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, contexts } = resolved;
  const jobs: TaggedJob[] = [];
  for (const ctx of contexts) {
    const snap = await db.collection("scheduling_events").where("businessId", "==", ctx.businessId).get();
    snap.docs.map(d => d.data())
      .filter(e => e.eventType === "Job" && e.customerVisible !== false && (e.customerId === ctx.businessCustomerId || ctx.names.includes(e.customer)))
      .forEach(j => jobs.push({
        id: j.id, businessId: ctx.businessId, businessName: ctx.businessName,
        jobNumber: j.jobNumber, title: j.title, description: j.description, date: j.date, startTime: j.startTime, endTime: j.endTime,
        status: j.status, priority: j.priority, assignedEmployee: j.assignedEmployee, location: j.location || j.customerAddress,
        progress: j.progress, checklist: j.checklist
      }));
  }
  jobs.sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, jobs };
}

export interface TaggedAppointment { id: string; businessId: string; businessName: string; eventType: string; title?: string; date: string; startTime: string; endTime: string; status: string; assignedEmployee?: string; location?: string }

export async function getAppointments(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: boolean; error?: string; appointments?: TaggedAppointment[] }> {
  const resolved = await resolveContexts(customerAccountId, businessIdFilter);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, contexts } = resolved;
  const today = new Date().toISOString().slice(0, 10);
  const appointments: TaggedAppointment[] = [];
  for (const ctx of contexts) {
    const snap = await db.collection("scheduling_events").where("businessId", "==", ctx.businessId).get();
    snap.docs.map(d => d.data())
      .filter(e => e.date >= today && e.customerVisible !== false && (e.customerId === ctx.businessCustomerId || ctx.names.includes(e.customer)))
      .forEach(a => appointments.push({
        id: a.id, businessId: ctx.businessId, businessName: ctx.businessName, eventType: a.eventType, title: a.title,
        date: a.date, startTime: a.startTime, endTime: a.endTime, status: a.status, assignedEmployee: a.assignedEmployee, location: a.location || a.customerAddress
      }));
  }
  appointments.sort((a, b) => a.date.localeCompare(b.date));
  return { ok: true, appointments };
}

export interface TaggedEstimate { id: string; businessId: string; businessName: string; number: string; status: string; amount: number; createdDate: string; expirationDate: string; projectSpecifics?: string; declineReason?: string; lineItems?: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }

export async function getEstimates(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: boolean; error?: string; estimates?: TaggedEstimate[] }> {
  const resolved = await resolveContexts(customerAccountId, businessIdFilter);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, contexts } = resolved;
  const estimates: TaggedEstimate[] = [];
  for (const ctx of contexts) {
    const snap = await db.collection("estimates").where("businessId", "==", ctx.businessId).get();
    snap.docs.map(d => d.data())
      .filter(e => e.customerId === ctx.businessCustomerId || ctx.names.includes(e.customerName) || ctx.names.includes(e.company))
      .forEach(e => estimates.push({
        id: e.id, businessId: ctx.businessId, businessName: ctx.businessName, number: e.number, status: e.status, amount: e.amount,
        createdDate: e.createdDate, expirationDate: e.expirationDate, projectSpecifics: e.projectSpecifics || undefined, declineReason: e.customerDeclineReason || undefined,
        lineItems: Array.isArray(e.lineItems) ? e.lineItems.map((li: any) => ({ id: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })) : undefined
      }));
  }
  estimates.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  return { ok: true, estimates };
}

export interface TaggedInvoice { id: string; businessId: string; businessName: string; invoiceNumber: string; issuedDate: string; dueDate: string; status: string; total: number; amountPaid: number; balanceDue: number; lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }

export async function getInvoices(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: boolean; error?: string; invoices?: TaggedInvoice[] }> {
  const resolved = await resolveContexts(customerAccountId, businessIdFilter);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, contexts } = resolved;
  const invoices: TaggedInvoice[] = [];
  for (const ctx of contexts) {
    const snap = await db.collection("invoices").where("businessId", "==", ctx.businessId).get();
    snap.docs.map(d => d.data())
      .filter(inv => inv.customerId === ctx.businessCustomerId || ctx.names.includes(inv.customer))
      .forEach(inv => {
        const { total, balanceDue } = invoiceTotals(inv);
        invoices.push({
          id: inv.id, businessId: ctx.businessId, businessName: ctx.businessName, invoiceNumber: inv.invoiceNumber, issuedDate: inv.issuedDate,
          dueDate: inv.dueDate, status: inv.status, total, amountPaid: inv.amountPaid || 0, balanceDue,
          lineItems: (inv.lineItems || []).map((li: any) => ({ id: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice }))
        });
      });
  }
  invoices.sort((a, b) => b.issuedDate.localeCompare(a.issuedDate));
  return { ok: true, invoices };
}

export interface TaggedMembership { id: string; businessId: string; businessName: string; membershipNumber?: string; planName: string; description?: string; price: number; billingFrequency: string; includedServices?: Array<{ id: string; description: string; quantity: number; unitPrice: number }>; startDate: string; endDate?: string; status: string; nextMaintenanceDate?: string; nextPaymentDate?: string }

export async function getMemberships(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: boolean; error?: string; memberships?: TaggedMembership[] }> {
  const resolved = await resolveContexts(customerAccountId, businessIdFilter);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, contexts } = resolved;
  const memberships: TaggedMembership[] = [];
  for (const ctx of contexts) {
    const snap = await db.collection("memberships").where("businessId", "==", ctx.businessId).where("customerId", "==", ctx.businessCustomerId).get();
    snap.docs.map(d => d.data()).forEach(m => memberships.push({
      id: m.id, businessId: ctx.businessId, businessName: ctx.businessName, membershipNumber: m.membershipNumber, planName: m.planName,
      description: m.description, price: m.price, billingFrequency: m.billingFrequency, includedServices: m.includedServices,
      startDate: m.startDate, endDate: m.endDate, status: m.status, nextMaintenanceDate: m.nextMaintenanceDate, nextPaymentDate: m.nextPaymentDate
    }));
  }
  return { ok: true, memberships };
}

export interface TaggedDocument { id: string; businessId: string; businessName: string; name: string; date: string; status: string; folder?: string; hasPdf: boolean; canSign: boolean }

/** Documents are opt-IN only (DocumentItem.customerVisible === true) -- per
 * point 20, never shown just for matching the customer's name/links the way
 * the legacy token-based Customer Portal still does. */
export async function getDocuments(customerAccountId: string, businessIdFilter?: string): Promise<{ ok: boolean; error?: string; documents?: TaggedDocument[] }> {
  const resolved = await resolveContexts(customerAccountId, businessIdFilter);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, contexts } = resolved;
  const documents: TaggedDocument[] = [];
  for (const ctx of contexts) {
    const snap = await db.collection("documents").where("businessId", "==", ctx.businessId).get();
    snap.docs.map(d => d.data())
      .filter(doc => doc.customerVisible === true && !INTERNAL_DOCUMENT_FOLDERS.has(doc.folder || doc.type)
        && (ctx.names.includes(doc.customer) || doc.customerId === ctx.businessCustomerId))
      .forEach(doc => documents.push({
        id: doc.id, businessId: ctx.businessId, businessName: ctx.businessName, name: doc.name, date: doc.date, status: doc.status,
        folder: doc.folder || doc.type, hasPdf: !!doc.pdfBase64,
        canSign: doc.status === "Awaiting Signature" && !!doc.signingOptions?.remoteToken && !doc.signingOptions?.remoteTokenUsedAt
      }));
  }
  documents.sort((a, b) => b.date.localeCompare(a.date));
  return { ok: true, documents };
}

export async function getDocumentPdf(customerAccountId: string, businessId: string, documentId: string): Promise<{ ok: boolean; error?: string; pdfBase64?: string; name?: string }> {
  const resolved = await resolveContexts(customerAccountId, businessId);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const ctx = resolved.contexts[0];
  if (!ctx) return { ok: false, error: "Document not found." };
  const snap = await resolved.db.collection("documents").doc(documentId).get();
  if (!snap.exists) return { ok: false, error: "Document not found." };
  const doc = snap.data()!;
  if (doc.businessId !== businessId || doc.customerVisible !== true || INTERNAL_DOCUMENT_FOLDERS.has(doc.folder || doc.type)) return { ok: false, error: "Document not found." };
  const belongs = ctx.names.includes(doc.customer) || doc.customerId === ctx.businessCustomerId;
  if (!belongs) return { ok: false, error: "Document not found." };
  if (!doc.pdfBase64) return { ok: false, error: "No PDF is available for this document yet." };
  return { ok: true, pdfBase64: doc.pdfBase64, name: doc.name };
}

// ---------------------------------------------------------------------------
// Actions -- estimate decisions, service requests, messages, invoice pay
// (points 16, 24-27, 19)
// ---------------------------------------------------------------------------

async function resolveSingleActiveContext(customerAccountId: string, businessId: string): Promise<{ ok: true; db: Firestore; ctx: RelationshipContext } | { ok: false; error: string }> {
  if (!businessId) return { ok: false, error: "A business must be selected." };
  const resolved = await resolveContexts(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const ctx = resolved.contexts[0];
  if (!ctx) return { ok: false, error: "You're not connected to this business." };
  return { ok: true, db: resolved.db, ctx };
}

export async function submitEstimateDecision(customerAccountId: string, businessId: string, estimateId: string, decision: "Accepted" | "Declined", declineReason?: string): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveSingleActiveContext(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const { db, ctx } = resolved;
  const ref = db.collection("estimates").doc(estimateId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Estimate not found." };
  const data = snap.data()!;
  if (data.businessId !== businessId) return { ok: false, error: "Estimate not found." };
  const belongs = data.customerId === ctx.businessCustomerId || ctx.names.includes(data.customerName) || ctx.names.includes(data.company);
  if (!belongs) return { ok: false, error: "Estimate not found." };
  if (data.status === "Accepted" || data.status === "Declined") return { ok: false, error: `This estimate was already ${data.status.toLowerCase()}.` };

  const update: Record<string, unknown> = { status: decision, updatedAt: nowIso() };
  if (decision === "Declined" && declineReason?.trim()) update.customerDeclineReason = declineReason.trim().slice(0, 2000);
  await ref.update(update);

  const customerName = customerDisplayName(ctx.customer);
  const description = decision === "Accepted"
    ? `${customerName} approved estimate ${data.number}.`
    : `${customerName} declined estimate ${data.number}.${declineReason ? ` Reason: ${declineReason.trim().slice(0, 200)}` : ""}`;
  await notifyBusinessUsers(db, businessId, "estimates", decision === "Accepted" ? "Estimate approved by customer" : "Estimate declined by customer", description, "estimates");
  await writeAuditLog(db, businessId, customerAccountId, decision === "Accepted" ? "estimate_approved" : "estimate_declined", description);
  return { ok: true };
}

export interface CustomerServiceRequestSubmission {
  description?: string;
  preferredDate?: string;
  address?: string;
  notes?: string;
  photos?: string[];
}

/** Creates a real Lead scoped to ONLY the selected business -- never a Job,
 * and never a request visible to any other business the customer is
 * connected to (point 26). */
export async function submitServiceRequest(customerAccountId: string, businessId: string, body: CustomerServiceRequestSubmission): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveSingleActiveContext(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const { db, ctx } = resolved;
  const description = (body.description || "").trim();
  if (!description) return { ok: false, error: "Tell us what you need done." };
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 6).filter(p => typeof p === "string" && p.length < 900_000) : [];

  const noteParts = [description];
  if (body.preferredDate) noteParts.push(`Preferred date: ${body.preferredDate}`);
  if (body.notes) noteParts.push(body.notes.trim());

  const customer = ctx.customer;
  const id = uid("lead_acct");
  const now = new Date();
  await db.collection("leads").doc(id).set({
    id,
    name: customerDisplayName(customer),
    company: customer.company || "",
    phone: customer.phone || "",
    email: customer.email || "",
    source: "Customer Portal",
    salesRep: "Unassigned",
    status: "New",
    estimatedValue: 0,
    dateAdded: now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    addedDaysAgo: 0,
    address: (body.address || customer.address || "").trim(),
    notes: noteParts.join("\n"),
    sourceCustomerId: ctx.businessCustomerId,
    photos,
    businessId,
    updatedAt: nowIso()
  });

  const description120 = description.slice(0, 120);
  await notifyBusinessUsers(db, businessId, "leads", "New service request", `${customerDisplayName(customer)} requested service: ${description120}`, "leads");
  await writeAuditLog(db, businessId, customerAccountId, "service_requested", `Requested service: ${description120}`);
  return { ok: true };
}

export interface TaggedMessage { id: string; sender: string; senderRole: string; content: string; timestamp: string }

export async function getMessages(customerAccountId: string, businessId: string): Promise<{ ok: boolean; error?: string; messages?: TaggedMessage[] }> {
  const resolved = await resolveSingleActiveContext(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const { db, ctx } = resolved;
  const snap = await db.collection("conversations").where("businessId", "==", businessId).where("customerId", "==", ctx.businessCustomerId).limit(1).get();
  const messages = snap.empty ? [] : (snap.docs[0].data().messages || []).map((m: any) => ({ id: m.id, sender: m.sender, senderRole: m.senderRole, content: m.content, timestamp: m.timestamp }));
  return { ok: true, messages };
}

/** Appends to the same `conversations` collection MessagesPage reads/writes
 * (type "Customer Chat") -- a separate thread per business, keyed by that
 * business's own customerId, same as the legacy token portal (point 27). */
export async function submitMessage(customerAccountId: string, businessId: string, content: string): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolveSingleActiveContext(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const { db, ctx } = resolved;
  const clean = (content || "").trim();
  if (!clean) return { ok: false, error: "Type a message first." };
  const customerName = customerDisplayName(ctx.customer);

  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
  const message = { id: uid("msg"), sender: customerName, senderRole: "Customer", content: clean, timestamp };

  const existingSnap = await db.collection("conversations").where("businessId", "==", businessId).where("customerId", "==", ctx.businessCustomerId).limit(1).get();
  if (existingSnap.empty) {
    const convoId = uid("convo_acct");
    await db.collection("conversations").doc(convoId).set({
      id: convoId, title: customerName, type: "Customer Chat", participants: [customerName], unreadCount: 1,
      lastMessage: clean, lastMessageTime: timestamp, lastMessageSender: customerName, isRead: false, isArchived: false,
      priority: "Normal", customerId: ctx.businessCustomerId, customerName, messages: [message], createdDate: timestamp,
      businessId, updatedAt: nowIso()
    });
  } else {
    const convoDoc = existingSnap.docs[0];
    const existing = convoDoc.data();
    await convoDoc.ref.update({
      messages: [...(existing.messages || []), message], lastMessage: clean, lastMessageTime: timestamp,
      lastMessageSender: customerName, unreadCount: (existing.unreadCount || 0) + 1, isRead: false, updatedAt: nowIso()
    });
  }
  await notifyBusinessUsers(db, businessId, "messages", "New message", `${customerName}: ${clean.slice(0, 120)}`, "messages");
  return { ok: true };
}

export async function createInvoiceCheckout(customerAccountId: string, businessId: string, invoiceId: string, originUrl: string): Promise<{ ok: boolean; error?: string; url?: string }> {
  const resolved = await resolveSingleActiveContext(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const { db, ctx } = resolved;
  const ref = db.collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Invoice not found." };
  const inv = snap.data()!;
  if (inv.businessId !== businessId) return { ok: false, error: "Invoice not found." };
  const belongs = inv.customerId === ctx.businessCustomerId || ctx.names.includes(inv.customer);
  if (!belongs) return { ok: false, error: "Invoice not found." };

  const { total, balanceDue } = invoiceTotals(inv);
  if (balanceDue <= 0) return { ok: false, error: "This invoice is already paid." };

  const profileSnap = await db.collection("business_profiles").doc(businessId).get();
  const accountId = profileSnap.data()?.stripeConnectedAccountId;
  if (typeof accountId !== "string" || !accountId) return { ok: false, error: "This business hasn't turned on card payments yet. Contact them to pay another way." };
  const status = await getConnectAccountStatus(accountId);
  if (!status.chargesEnabled) return { ok: false, error: "This business hasn't finished setting up card payments yet. Contact them to pay another way." };

  // Every business's payments route to that SAME business's own Stripe
  // connected account (direct charge) -- never a shared/platform charge, so
  // one customer paying multiple businesses can never mix funds (point 19).
  const { url } = await createInvoiceCheckoutSession({
    accountId,
    amountCents: Math.round(balanceDue * 100),
    description: `Invoice ${inv.invoiceNumber}`,
    successUrl: `${originUrl}&paid=1`,
    cancelUrl: originUrl,
    metadata: { ownerslocalInvoiceId: invoiceId, ownerslocalBusinessId: businessId }
  });
  if (!url) return { ok: false, error: "Could not start checkout. Try again." };
  void total;
  return { ok: true, url };
}

// ---------------------------------------------------------------------------
// View Business -- allowlisted profile fields only, structured so a future
// marketplace listing can reuse this same shape without a rebuild (points 31-32).
// ---------------------------------------------------------------------------

export interface BusinessProfileView {
  businessId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  logo?: string;
  description?: string;
  trades?: string[];
  serviceArea?: string;
  hours?: string;
  photos?: string[];
  licenses?: string[];
  acceptingNewCustomers?: boolean;
  relationship: { status: string; activeJobs: number; nextAppointment?: string; amountDue: number };
}

export async function getBusinessProfile(customerAccountId: string, businessId: string): Promise<{ ok: boolean; error?: string; profile?: BusinessProfileView }> {
  const resolved = await resolveSingleActiveContext(customerAccountId, businessId);
  if (resolved.ok === false) return resolved;
  const { db, ctx } = resolved;
  const profileSnap = await db.collection("business_profiles").doc(businessId).get();
  const profile = profileSnap.data() || {};

  const [jobsSnap, invoicesSnap] = await Promise.all([
    db.collection("scheduling_events").where("businessId", "==", businessId).get(),
    db.collection("invoices").where("businessId", "==", businessId).get()
  ]);
  const myEvents = jobsSnap.docs.map(d => d.data()).filter(e => e.customerId === ctx.businessCustomerId || ctx.names.includes(e.customer));
  const today = new Date().toISOString().slice(0, 10);
  const activeJobs = myEvents.filter(e => e.eventType === "Job" && e.status !== "Completed" && e.status !== "Cancelled").length;
  const upcoming = myEvents.filter(e => e.date >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const myInvoices = invoicesSnap.docs.map(d => d.data()).filter(inv => inv.customerId === ctx.businessCustomerId || ctx.names.includes(inv.customer));
  const amountDue = myInvoices.reduce((sum, inv) => sum + invoiceTotals(inv).balanceDue, 0);

  return {
    ok: true,
    profile: {
      businessId, name: profile.name || ctx.businessName || "Service Professional", phone: profile.phone, email: profile.email,
      address: profile.address, logo: profile.logo,
      // Reserved for the future marketplace listing -- read only if a
      // business has already set them, never required or auto-generated.
      description: profile.description, trades: profile.trades, serviceArea: profile.serviceArea, hours: profile.hours,
      photos: profile.photos, licenses: profile.licenses, acceptingNewCustomers: profile.acceptingNewCustomers,
      relationship: { status: "Active", activeJobs, nextAppointment: upcoming[0]?.date, amountDue }
    }
  };
}
