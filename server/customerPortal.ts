import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import { createInvoiceCheckoutSession, getConnectAccountStatus } from "./stripeConnect";

// A customer opening their Portal link has no OwnersLocal login -- same
// reasoning as server/remoteSigning.ts and server/webLeadFormHandler.ts.
// This runs server-side with the Admin SDK (bypasses Firestore security
// rules entirely), gated by the random portalToken stored directly on
// their own Customer record instead of a Firebase Auth session. No new
// collection, no duplicate customer data -- the token IS the existing
// Customer doc's own field.
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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for the Customer Portal:", err);
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

/** A customer's own name/company/id -- the same three values every existing
 * "find this customer's records" lookup in the app already matches against
 * (see CustomersPage.compileCustomerDocuments), used here as the fallback
 * for the many Estimate/Invoice/Document records that predate a real
 * customerId link. */
function customerMatchValues(customer: FirebaseFirestore.DocumentData): string[] {
  return [customer.id, customer.contact, customer.company].filter(Boolean);
}

interface ResolvedPortalCustomer {
  db: Firestore;
  businessId: string;
  customerId: string;
  customer: FirebaseFirestore.DocumentData;
}

async function resolvePortalCustomer(token: string): Promise<{ ok: true; value: ResolvedPortalCustomer } | { ok: false; error: string }> {
  const db = getDb();
  if (!db) return { ok: false, error: "The Customer Portal isn't configured on this server yet." };
  const cleanToken = (token || "").trim();
  if (!cleanToken) return { ok: false, error: "Missing portal link." };
  const snap = await db.collection("customers").where("portalToken", "==", cleanToken).limit(1).get();
  if (snap.empty) return { ok: false, error: "This portal link is invalid." };
  const doc = snap.docs[0];
  const data = doc.data();
  if (!data.portalEnabled) return { ok: false, error: "Portal access has been turned off for this account. Contact the business for a new link." };
  const businessId = data.businessId;
  if (typeof businessId !== "string" || !businessId) return { ok: false, error: "This portal link is invalid." };
  return { ok: true, value: { db, businessId, customerId: doc.id, customer: { id: doc.id, ...data } } };
}

/**
 * Notifies the owner (businessId itself) plus any employee individually
 * granted view access to the given permission module -- same fan-out
 * pattern as webLeadFormHandler.ts's notifyNewWebsiteLead, generalized so
 * every Customer Portal action (message, service request, estimate
 * decision, signed document, invoice payment) can reuse it instead of each
 * re-implementing the employee scan.
 */
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
    console.error("Error resolving employees for Customer Portal notification (continuing with owner only):", err);
  }

  const time = nowIso().slice(0, 16).replace("T", " ");
  const writes = Array.from(recipients).map(recipientEmail => {
    const notifId = uid("notif_portal");
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
      createdBy: "Customer Portal",
      history: [`${time}: ${description}`]
    });
  });
  await Promise.all(writes);
}

function customerDisplayName(customer: FirebaseFirestore.DocumentData): string {
  return customer.contact || customer.company || "Customer";
}

// ---------------------------------------------------------------------------
// READ: everything the portal shows, in one call -- allowlisted fields only,
// per point 6's "never expose internal-only information" (job costing,
// profit/margin, employee pay, internal notes, accounting, private employee
// info never appear in any of the shapes below).
// ---------------------------------------------------------------------------

export interface PortalDataResult {
  ok: boolean;
  error?: string;
  businessName?: string;
  customer?: { id: string; name: string; company: string; phone: string; email: string; address: string };
  estimates?: Array<{ id: string; number: string; status: string; amount: number; createdDate: string; expirationDate: string; projectSpecifics?: string; lineItems?: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }>;
  jobs?: Array<{ id: string; jobNumber?: string; title?: string; description?: string; date: string; startTime: string; endTime: string; status: string; priority: string; assignedEmployee?: string; location?: string; progress?: number; checklist?: Array<{ id: string; label: string; completed: boolean }> }>;
  appointments?: Array<{ id: string; eventType: string; title?: string; date: string; startTime: string; endTime: string; status: string; assignedEmployee?: string; location?: string }>;
  workOrders?: Array<{ id: string; workOrderNumber?: string; jobDescription: string; date: string; scheduledDate?: string; scheduledTime?: string; status?: string; priority?: string; estimatedValue?: number }>;
  invoices?: Array<{ id: string; invoiceNumber: string; issuedDate: string; dueDate: string; status: string; total: number; amountPaid: number; balanceDue: number; notes?: string; lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }> }>;
  memberships?: Array<{ id: string; membershipNumber?: string; planName: string; description?: string; price: number; billingFrequency: string; includedServices?: Array<{ id: string; description: string; quantity: number; unitPrice: number }>; maintenanceFrequency?: any; startDate: string; endDate?: string; status: string; nextMaintenanceDate?: string; nextPaymentDate?: string }>;
  documents?: Array<{ id: string; name: string; date: string; status: string; folder?: string; hasPdf: boolean; canSign: boolean; remoteToken?: string }>;
  conversation?: { messages: Array<{ id: string; sender: string; senderRole: string; content: string; timestamp: string }> };
}

// Business-internal-only folders (job costing/profit stay out simply by
// never being read into any shape above; these folders are excluded
// outright since nothing in them is ever customer-facing).
// "Customer Notes" is deliberately included here even though its name
// sounds customer-facing -- DocumentsPage.inferFolderForDoc uses it as the
// catch-all for anything that doesn't match a known type, which in
// practice includes plain internal staff notes about a customer. Safer to
// under-expose than leak one of those through the portal.
const INTERNAL_DOCUMENT_FOLDERS = new Set(["Employees", "Taxes", "Expenses/Receipts", "Snapshots", "Employee Snapshot", "Purchase Orders", "Customer Notes"]);

export async function getPortalData(token: string): Promise<PortalDataResult> {
  const resolved = await resolvePortalCustomer(token);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, businessId, customerId, customer } = resolved.value;
  const names = customerMatchValues(customer);

  let businessName = "";
  try {
    const businessSnap = await db.collection("business_profiles").doc(businessId).get();
    businessName = businessSnap.data()?.name || "";
  } catch {
    // Cosmetic only.
  }

  const [estimatesSnap, jobsSnap, workOrdersSnap, invoicesSnap, membershipsSnap, documentsSnap, conversationSnap] = await Promise.all([
    db.collection("estimates").where("businessId", "==", businessId).get(),
    db.collection("scheduling_events").where("businessId", "==", businessId).get(),
    db.collection("work_orders").where("businessId", "==", businessId).get(),
    db.collection("invoices").where("businessId", "==", businessId).get(),
    db.collection("memberships").where("businessId", "==", businessId).where("customerId", "==", customerId).get(),
    db.collection("documents").where("businessId", "==", businessId).get(),
    db.collection("conversations").where("businessId", "==", businessId).where("customerId", "==", customerId).limit(1).get()
  ]);

  const estimates = estimatesSnap.docs
    .map(d => d.data())
    .filter(e => e.customerId === customerId || names.includes(e.customerName) || names.includes(e.company))
    .map(e => ({
      id: e.id, number: e.number, status: e.status, amount: e.amount, createdDate: e.createdDate, expirationDate: e.expirationDate,
      projectSpecifics: e.projectSpecifics || undefined,
      lineItems: Array.isArray(e.lineItems) ? e.lineItems.map((li: any) => ({ id: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice })) : undefined
    }));

  const allEvents = jobsSnap.docs.map(d => d.data()).filter(e => e.customerId === customerId || names.includes(e.customer));
  const jobs = allEvents.filter(e => e.eventType === "Job").map(j => ({
    id: j.id, jobNumber: j.jobNumber, title: j.title, description: j.description, date: j.date, startTime: j.startTime, endTime: j.endTime,
    status: j.status, priority: j.priority, assignedEmployee: j.assignedEmployee, location: j.location || j.customerAddress, progress: j.progress,
    checklist: Array.isArray(j.checklist) ? j.checklist.map((c: any) => ({ id: c.id, label: c.label, completed: !!c.completed })) : undefined
  }));
  const today = new Date().toISOString().slice(0, 10);
  const appointments = allEvents.filter(e => e.date >= today).map(a => ({
    id: a.id, eventType: a.eventType, title: a.title, date: a.date, startTime: a.startTime, endTime: a.endTime,
    status: a.status, assignedEmployee: a.assignedEmployee, location: a.location || a.customerAddress
  }));

  const workOrders = workOrdersSnap.docs
    .map(d => d.data())
    .filter(w => w.customerId === customerId || names.includes(w.customerName))
    .map(w => ({
      id: w.id, workOrderNumber: w.workOrderNumber, jobDescription: w.jobDescription, date: w.date, scheduledDate: w.scheduledDate,
      scheduledTime: w.scheduledTime, status: w.status, priority: w.priority, estimatedValue: w.estimatedValue
    }));

  const invoices = invoicesSnap.docs
    .map(d => d.data())
    .filter(inv => inv.customerId === customerId || names.includes(inv.customer))
    .map(inv => {
      const subtotal = (inv.lineItems || []).reduce((s: number, li: any) => s + li.quantity * li.unitPrice, 0);
      const total = subtotal + subtotal * ((inv.taxRate || 0) / 100);
      return {
        id: inv.id, invoiceNumber: inv.invoiceNumber, issuedDate: inv.issuedDate, dueDate: inv.dueDate, status: inv.status,
        total, amountPaid: inv.amountPaid || 0, balanceDue: Math.max(0, total - (inv.amountPaid || 0)), notes: inv.notes,
        lineItems: (inv.lineItems || []).map((li: any) => ({ id: li.id, description: li.description, quantity: li.quantity, unitPrice: li.unitPrice }))
      };
    });

  const memberships = membershipsSnap.docs.map(d => d.data()).map(m => ({
    id: m.id, membershipNumber: m.membershipNumber, planName: m.planName, description: m.description, price: m.price,
    billingFrequency: m.billingFrequency, includedServices: m.includedServices, maintenanceFrequency: m.maintenanceFrequency,
    startDate: m.startDate, endDate: m.endDate, status: m.status, nextMaintenanceDate: m.nextMaintenanceDate, nextPaymentDate: m.nextPaymentDate
  }));

  const linkedDocIds = new Set([
    ...estimates.map(e => e.id), ...invoices.map(i => i.id), ...workOrders.map(w => w.id), ...memberships.map(m => m.id)
  ]);
  const documents = documentsSnap.docs
    .map(d => d.data())
    .filter(doc => {
      const folder = doc.folder || doc.type;
      if (INTERNAL_DOCUMENT_FOLDERS.has(folder)) return false;
      if (names.includes(doc.customer)) return true;
      if (doc.estimateId && linkedDocIds.has(doc.estimateId)) return true;
      if (doc.invoiceId && linkedDocIds.has(doc.invoiceId)) return true;
      if (doc.workOrderId && linkedDocIds.has(doc.workOrderId)) return true;
      if (doc.membershipId && linkedDocIds.has(doc.membershipId)) return true;
      return false;
    })
    .map(doc => ({
      id: doc.id, name: doc.name, date: doc.date, status: doc.status, folder: doc.folder || doc.type,
      hasPdf: !!doc.pdfBase64,
      canSign: doc.status === "Awaiting Signature" && !!doc.signingOptions?.remoteToken && !doc.signingOptions?.remoteTokenUsedAt,
      remoteToken: doc.status === "Awaiting Signature" ? doc.signingOptions?.remoteToken : undefined
    }));

  const conversation = conversationSnap.empty ? { messages: [] } : {
    messages: (conversationSnap.docs[0].data().messages || []).map((m: any) => ({ id: m.id, sender: m.sender, senderRole: m.senderRole, content: m.content, timestamp: m.timestamp }))
  };

  return {
    ok: true,
    businessName,
    customer: { id: customerId, name: customerDisplayName(customer), company: customer.company || "", phone: customer.phone || "", email: customer.email || "", address: customer.address || "" },
    estimates, jobs, appointments, workOrders, invoices, memberships, documents, conversation
  };
}

/** True when a document actually belongs to this customer -- checked
 * independently of the big getPortalData listing (a document id isn't a
 * secret the way portalToken is, so a single-document fetch has to prove
 * ownership itself rather than trusting whatever id it's asked for). Same
 * rule as getPortalData: match by customer name, or by being linked to one
 * of THIS customer's own Estimates/Invoices/Work Orders/Memberships. */
async function documentBelongsToCustomer(db: Firestore, businessId: string, customerId: string, names: string[], doc: FirebaseFirestore.DocumentData): Promise<boolean> {
  if (names.includes(doc.customer)) return true;
  const linkChecks: Array<[string | undefined, string]> = [
    [doc.estimateId, "estimates"], [doc.invoiceId, "invoices"], [doc.workOrderId, "work_orders"], [doc.membershipId, "memberships"]
  ];
  for (const [linkedId, collection] of linkChecks) {
    if (linkedId && linkedId !== "None") {
      const linkedSnap = await db.collection(collection).doc(linkedId).get();
      const linked = linkedSnap.data();
      if (linked && linked.businessId === businessId && (linked.customerId === customerId || names.includes(linked.customerName) || names.includes(linked.customer) || names.includes(linked.company))) return true;
    }
  }
  return false;
}

export async function getPortalDocumentPdf(token: string, documentId: string): Promise<{ ok: boolean; error?: string; pdfBase64?: string; name?: string }> {
  const resolved = await resolvePortalCustomer(token);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, businessId, customerId, customer } = resolved.value;
  const snap = await db.collection("documents").doc(documentId).get();
  if (!snap.exists) return { ok: false, error: "Document not found." };
  const data = snap.data()!;
  if (data.businessId !== businessId) return { ok: false, error: "Document not found." };
  if (INTERNAL_DOCUMENT_FOLDERS.has(data.folder || data.type)) return { ok: false, error: "Document not found." };
  const belongs = await documentBelongsToCustomer(db, businessId, customerId, customerMatchValues(customer), data);
  if (!belongs) return { ok: false, error: "Document not found." };
  if (!data.pdfBase64) return { ok: false, error: "No PDF is available for this document yet." };
  return { ok: true, pdfBase64: data.pdfBase64, name: data.name };
}

// ---------------------------------------------------------------------------
// WRITE: every customer action updates the same real records the staff
// side already uses, and notifies the business -- point 7.
// ---------------------------------------------------------------------------

export async function submitEstimateDecision(token: string, estimateId: string, decision: "Accepted" | "Declined"): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolvePortalCustomer(token);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, businessId, customerId, customer } = resolved.value;
  const names = customerMatchValues(customer);
  const ref = db.collection("estimates").doc(estimateId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Estimate not found." };
  const data = snap.data()!;
  if (data.businessId !== businessId) return { ok: false, error: "Estimate not found." };
  const belongs = data.customerId === customerId || names.includes(data.customerName) || names.includes(data.company);
  if (!belongs) return { ok: false, error: "Estimate not found." };
  if (data.status === "Accepted" || data.status === "Declined") return { ok: false, error: `This estimate was already ${data.status.toLowerCase()}.` };

  await ref.update({ status: decision, updatedAt: nowIso() });
  await notifyBusinessUsers(
    db, businessId, "estimates",
    decision === "Accepted" ? "Estimate approved by customer" : "Estimate declined by customer",
    `${customerDisplayName(customer)} ${decision === "Accepted" ? "approved" : "declined"} estimate ${data.number}.`,
    "estimates"
  );
  return { ok: true };
}

export interface ServiceRequestSubmission {
  description?: string;
  preferredDate?: string;
  address?: string;
  notes?: string;
  photos?: string[];
}

/**
 * Creates a real Lead the same way every other lead-capture path in this
 * app does (see webLeadFormHandler.ts) -- never a completed Job, and never
 * a second/duplicate Customer record; sourceCustomerId links straight back
 * to the real one this request came from.
 */
export async function submitServiceRequest(token: string, body: ServiceRequestSubmission): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolvePortalCustomer(token);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, businessId, customerId, customer } = resolved.value;
  const description = (body.description || "").trim();
  if (!description) return { ok: false, error: "Tell us what you need done." };
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 6).filter(p => typeof p === "string" && p.length < 900_000) : [];

  const noteParts = [description];
  if (body.preferredDate) noteParts.push(`Preferred date: ${body.preferredDate}`);
  if (body.notes) noteParts.push(body.notes.trim());

  const id = uid("lead_portal");
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
    sourceCustomerId: customerId,
    photos,
    businessId,
    updatedAt: nowIso()
  });

  await notifyBusinessUsers(db, businessId, "leads", "New service request", `${customerDisplayName(customer)} requested service: ${description.slice(0, 120)}`, "leads");
  return { ok: true };
}

/** Appends to the same `conversations` collection MessagesPage itself
 * reads/writes (type "Customer Chat"), reusing that one Conversation
 * record per customer instead of a separate portal-only thread. */
export async function submitPortalMessage(token: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const resolved = await resolvePortalCustomer(token);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, businessId, customerId, customer } = resolved.value;
  const content = (body || "").trim();
  if (!content) return { ok: false, error: "Type a message first." };

  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
  const message = { id: uid("msg"), sender: customerDisplayName(customer), senderRole: "Customer", content, timestamp };

  const existingSnap = await db.collection("conversations").where("businessId", "==", businessId).where("customerId", "==", customerId).limit(1).get();
  if (existingSnap.empty) {
    const convoId = uid("convo_portal");
    await db.collection("conversations").doc(convoId).set({
      id: convoId,
      title: customerDisplayName(customer),
      type: "Customer Chat",
      participants: [customerDisplayName(customer)],
      unreadCount: 1,
      lastMessage: content,
      lastMessageTime: timestamp,
      lastMessageSender: customerDisplayName(customer),
      isRead: false,
      isArchived: false,
      priority: "Normal",
      customerId,
      customerName: customerDisplayName(customer),
      messages: [message],
      createdDate: timestamp,
      businessId,
      updatedAt: nowIso()
    });
  } else {
    const convoDoc = existingSnap.docs[0];
    const existing = convoDoc.data();
    await convoDoc.ref.update({
      messages: [...(existing.messages || []), message],
      lastMessage: content,
      lastMessageTime: timestamp,
      lastMessageSender: customerDisplayName(customer),
      unreadCount: (existing.unreadCount || 0) + 1,
      isRead: false,
      updatedAt: nowIso()
    });
  }

  await notifyBusinessUsers(db, businessId, "messages", "New portal message", `${customerDisplayName(customer)}: ${content.slice(0, 120)}`, "messages");
  return { ok: true };
}

export async function createInvoiceCheckout(token: string, invoiceId: string, originUrl: string): Promise<{ ok: boolean; error?: string; url?: string }> {
  const resolved = await resolvePortalCustomer(token);
  if (resolved.ok === false) return { ok: false, error: resolved.error };
  const { db, businessId, customerId, customer } = resolved.value;
  const names = customerMatchValues(customer);
  const ref = db.collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: "Invoice not found." };
  const inv = snap.data()!;
  if (inv.businessId !== businessId) return { ok: false, error: "Invoice not found." };
  const belongs = inv.customerId === customerId || names.includes(inv.customer);
  if (!belongs) return { ok: false, error: "Invoice not found." };

  const subtotal = (inv.lineItems || []).reduce((s: number, li: any) => s + li.quantity * li.unitPrice, 0);
  const total = subtotal + subtotal * ((inv.taxRate || 0) / 100);
  const balanceDue = Math.max(0, total - (inv.amountPaid || 0));
  if (balanceDue <= 0) return { ok: false, error: "This invoice is already paid." };

  const profileSnap = await db.collection("business_profiles").doc(businessId).get();
  const accountId = profileSnap.data()?.stripeConnectedAccountId;
  if (typeof accountId !== "string" || !accountId) return { ok: false, error: "This business hasn't turned on card payments yet. Contact them to pay another way." };
  const status = await getConnectAccountStatus(accountId);
  if (!status.chargesEnabled) return { ok: false, error: "This business hasn't finished setting up card payments yet. Contact them to pay another way." };

  const { url } = await createInvoiceCheckoutSession({
    accountId,
    amountCents: Math.round(balanceDue * 100),
    description: `Invoice ${inv.invoiceNumber}`,
    successUrl: `${originUrl}&paid=1`,
    cancelUrl: originUrl,
    metadata: { ownerslocalInvoiceId: invoiceId, ownerslocalBusinessId: businessId }
  });
  if (!url) return { ok: false, error: "Could not start checkout. Try again." };
  return { ok: true, url };
}

/** Applies a completed portal Checkout Session to the real Invoice --
 * called from the Stripe Connect webhook (server/stripeConnectWebhook.ts).
 * Guarded by stripeSessionId against Stripe redelivering the same event. */
export async function applyPortalInvoicePayment(businessId: string, session: Stripe.Checkout.Session): Promise<void> {
  const db = getDb();
  if (!db) return;
  const invoiceId = session.metadata?.ownerslocalInvoiceId;
  if (!invoiceId) return;

  const already = await db.collection("transactions").where("stripeSessionId", "==", session.id).limit(1).get();
  if (!already.empty) return; // Already applied -- Stripe redelivered this event.

  const ref = db.collection("invoices").doc(invoiceId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.businessId !== businessId) return;
  const inv = snap.data()!;
  const amount = (session.amount_total || 0) / 100;
  const subtotal = (inv.lineItems || []).reduce((s: number, li: any) => s + li.quantity * li.unitPrice, 0);
  const total = subtotal + subtotal * ((inv.taxRate || 0) / 100);
  const newAmountPaid = (inv.amountPaid || 0) + amount;
  const newStatus = newAmountPaid >= total - 0.01 ? "paid" : "partial";
  const now = nowIso();

  const txnId = uid("txn_portal_pay");
  const journalId = uid("je_portal_pay");
  await Promise.all([
    ref.update({ amountPaid: newAmountPaid, status: newStatus, updatedAt: now }),
    db.collection("transactions").doc(txnId).set({
      id: txnId, type: "income", source: "invoice_payment", amount,
      description: `Invoice ${inv.invoiceNumber} paid via Customer Portal`,
      date: now.slice(0, 10), createdAt: now, invoiceId, stripeSessionId: session.id, businessId
    }),
    db.collection("journal_entries").doc(journalId).set({
      id: journalId, date: now.slice(0, 10), memo: `Payment received: Invoice ${inv.invoiceNumber}`,
      source: "invoice_payment", sourceId: invoiceId,
      lines: [
        { accountId: "acct_cash", debit: amount, credit: 0 },
        { accountId: "acct_ar", debit: 0, credit: amount }
      ],
      createdAt: now, businessId
    }),
    notifyBusinessUsers(db, businessId, "invoices", "Invoice paid online", `Invoice ${inv.invoiceNumber} was paid ($${amount.toFixed(2)}) through the Customer Portal.`, "invoices")
  ]);
}
