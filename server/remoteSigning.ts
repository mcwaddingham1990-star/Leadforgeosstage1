import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { randomBytes } from "crypto";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// A customer opening a "sign this remotely" link has no OwnersLocal login,
// so -- same reasoning as server/webLeadFormHandler.ts -- this can't go
// through the normal authenticated client SDK. It runs server-side with the
// Admin SDK (which bypasses Firestore security rules entirely), gated by a
// random per-document token instead of a Firebase Auth session. No security
// rule changes were needed anywhere for this.
let adminApp: App | null | undefined;

function getAdminApp(): App | null {
  if (adminApp !== undefined) return adminApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    adminApp = null;
    return adminApp;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    adminApp = getApps().length ? getApps()[0]! : initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for remote signing:", err);
    adminApp = null;
  }
  return adminApp;
}

function getDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
}

async function findByToken(token: string) {
  const db = getDb();
  if (!db) return { db: null as any, snap: null as any };
  const querySnap = await db.collection("documents").where("signingOptions.remoteToken", "==", token).limit(1).get();
  if (querySnap.empty) return { db, snap: null };
  return { db, snap: querySnap.docs[0] };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function customerInviteCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

async function createCustomerAccountInvite(db: FirebaseFirestore.Firestore, businessId: string, businessCustomerId: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = customerInviteCode();
    const clash = await db.collection("business_invite_codes").where("code", "==", code).limit(1).get();
    if (!clash.empty) continue;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const id = `invite_signed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.collection("business_invite_codes").doc(id).set({
      id,
      code,
      businessId,
      businessCustomerId,
      createdAt: now.toISOString(),
      expiresAt,
      usedAt: null,
      usedByCustomerAccountId: null,
      revoked: false,
      source: "bid_accepted"
    });
    return code;
  }
  return undefined;
}

async function notifySignedEstimateReadyForJob(
  db: FirebaseFirestore.Firestore,
  businessId: string,
  details: {
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    customerAddress?: string;
    estimateId: string;
    estimateNumber?: string;
    amount?: number;
    description?: string;
    notes?: string;
    sourceLeadId?: string;
    source?: string;
  }
): Promise<void> {
  const recipients = new Set<string>([businessId]);
  try {
    const employees = await db.collection("employees").where("businessEmail", "==", businessId).get();
    employees.forEach(employeeDoc => {
      const employee = employeeDoc.data();
      const permission = employee?.granularPermissions?.jobs;
      const granted = permission === "view" || permission === "edit" || permission === "delete"
        || permission?.view === true || permission?.edit === true || permission?.delete === true;
      if (granted && typeof employee?.email === "string" && employee.email) recipients.add(employee.email);
    });
  } catch (error) {
    console.error("Could not resolve job-notification recipients after remote signing:", error);
  }

  const timestamp = new Date().toISOString();
  const displayTime = timestamp.slice(0, 16).replace("T", " ");
  const estimateLabel = details.estimateNumber || details.estimateId;
  const description = `${details.customerName} signed estimate ${estimateLabel}${typeof details.amount === "number" ? ` for ${details.amount.toLocaleString()}` : ""}. Customer activated. Ready to create the job.`;

  await Promise.all(Array.from(recipients).map(recipientEmail => {
    const id = `notif_signed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return db.collection("notifications").doc(id).set({
      id,
      businessId,
      category: "jobs",
      screenId: "jobs",
      type: "signed_estimate_ready_for_job",
      actionable: true,
      title: "Signed estimate — create job",
      description,
      time: displayTime,
      isRead: false,
      isArchived: false,
      isPinned: false,
      priority: "High",
      assignedUser: "Owner",
      recipientEmail,
      createdBy: "Remote Signing",
      relatedCustomerId: details.customerId || null,
      relatedEstimateId: details.estimateId,
      jobPrefill: {
        customerId: details.customerId,
        customerName: details.customerName,
        customerPhone: details.customerPhone,
        customerEmail: details.customerEmail,
        customerAddress: details.customerAddress,
        title: details.description || `Job from ${estimateLabel}`,
        description: details.description || details.notes || "",
        notes: details.notes || "",
        budget: details.amount,
        sourceEstimateId: details.estimateId,
        sourceLeadId: details.sourceLeadId,
        source: details.source
      },
      history: [`${displayTime}: ${description}`],
      createdAt: timestamp
    });
  }));
}

async function resolveSignedEstimateCustomer(
  db: FirebaseFirestore.Firestore,
  document: any
): Promise<{ estimate?: any; customer?: any; customerId?: string }> {
  const businessId = String(document.businessId || "");
  if (!businessId) return {};

  let estimate: any;
  const estimateId = document.estimateId && document.estimateId !== "None" ? String(document.estimateId) : "";
  if (estimateId) {
    const estimateSnap = await db.collection("estimates").doc(estimateId).get();
    if (estimateSnap.exists && estimateSnap.data()?.businessId === businessId) {
      estimate = { id: estimateSnap.id, ...estimateSnap.data() };
    }
  }

  let customerId = String(estimate?.customerId || document.customerId || "");
  let customer: any;
  if (customerId) {
    const customerSnap = await db.collection("customers").doc(customerId).get();
    if (customerSnap.exists && customerSnap.data()?.businessId === businessId) {
      customer = { id: customerSnap.id, ...customerSnap.data() };
    } else {
      customerId = "";
    }
  }

  if (!customerId) {
    const expected = [estimate?.customerName, estimate?.company, document.customer]
      .filter(Boolean)
      .map(value => String(value).trim().toLowerCase());
    if (expected.length) {
      const customers = await db.collection("customers").where("businessId", "==", businessId).get();
      const matches = customers.docs.filter(customerDoc => {
        const value = customerDoc.data();
        return [value.contact, value.company]
          .filter(Boolean)
          .some(candidate => expected.includes(String(candidate).trim().toLowerCase()));
      });
      if (matches.length === 1) {
        customerId = matches[0].id;
        customer = { id: matches[0].id, ...matches[0].data() };
      }
    }
  }

  return { estimate, customer, customerId: customerId || undefined };
}

export interface RemoteSigningInfo {
  ok: boolean;
  error?: string;
  documentName?: string;
  businessName?: string;
  signerLabel?: string;
  signMethod?: "typed" | "drawn" | "both";
  alreadySigned?: boolean;
  pdfBase64?: string;
}

export async function getRemoteSigningInfo(token: string): Promise<RemoteSigningInfo> {
  const cleanToken = (token || "").trim();
  if (!cleanToken) return { ok: false, error: "Missing signing link token." };
  const db = getDb();
  if (!db) return { ok: false, error: "Remote signing isn't configured on this server yet." };
  const { snap } = await findByToken(cleanToken);
  if (!snap) return { ok: false, error: "This signing link is invalid or has expired." };
  const data = snap.data() as any;
  const options = data.signingOptions || {};
  if (options.remoteTokenExpiresAt && new Date(options.remoteTokenExpiresAt).getTime() < Date.now()) {
    return { ok: false, error: "This signing link has expired. Ask for a new one." };
  }
  let businessName = "";
  try {
    const businessSnap = await db.collection("business_profiles").doc(data.businessId).get();
    businessName = businessSnap.data()?.name || "";
  } catch {
    // Business name is cosmetic only -- a lookup failure shouldn't block signing.
  }
  return {
    ok: true,
    documentName: data.name || "Document",
    businessName,
    signerLabel: options.remoteSignerName || data.customer || "",
    signMethod: options.signMethod || "both",
    alreadySigned: !!options.remoteTokenUsedAt,
    pdfBase64: data.pdfBase64 || undefined
  };
}

export interface RemoteSignSubmission {
  token?: string;
  signerName?: string;
  method?: "typed" | "drawn";
  signatureImage?: string;
  consent?: boolean;
}

export interface RemoteSignResult {
  ok: boolean;
  error?: string;
  customerInviteCode?: string;
  businessName?: string;
}

async function appendRemoteSigningCertificate(pdfBase64: string, details: { signerName: string; timestamp: string; signatureImage?: string }) {
  const cleanBase64 = pdfBase64.includes(",") ? pdfBase64.split(",").pop() || "" : pdfBase64;
  const pdf = await PDFDocument.load(Buffer.from(cleanBase64, "base64"));
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.121, 0.208, 0.341);
  const slate = rgb(0.369, 0.451, 0.576);
  const green = rgb(0.075, 0.439, 0.306);
  let y = 720;

  page.drawText("Electronic Signature Certificate", { x: 54, y, size: 20, font: bold, color: navy });
  y -= 34;
  page.drawText("This page was added by OwnersLOCAL when the remote signer completed the signing link.", { x: 54, y, size: 10, font, color: slate });
  y -= 34;
  page.drawText("Document status: Signed", { x: 54, y, size: 12, font: bold, color: green });
  y -= 28;
  page.drawText(`Signer: ${details.signerName}`, { x: 54, y, size: 12, font, color: navy });
  y -= 24;
  page.drawText(`Signed at: ${details.timestamp}`, { x: 54, y, size: 12, font, color: navy });
  y -= 24;
  page.drawText("Consent: Signer agreed to sign this document electronically.", { x: 54, y, size: 12, font, color: navy });

  if (details.signatureImage) {
    try {
      const imageBase64 = details.signatureImage.split(",").pop() || "";
      const imageBytes = Buffer.from(imageBase64, "base64");
      const image = details.signatureImage.startsWith("data:image/png") ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
      const scaled = image.scaleToFit(220, 80);
      y -= 112;
      page.drawText("Drawn signature:", { x: 54, y: y + 84, size: 11, font: bold, color: navy });
      page.drawImage(image, { x: 54, y, width: scaled.width, height: scaled.height });
    } catch {
      y -= 28;
      page.drawText("Drawn signature image could not be embedded, but the signing audit record was saved.", { x: 54, y, size: 10, font, color: slate });
    }
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString("base64");
}

export async function submitRemoteSignature(body: RemoteSignSubmission): Promise<RemoteSignResult> {
  const db = getDb();
  if (!db) return { ok: false, error: "Remote signing isn't configured on this server yet." };
  const token = (body.token || "").trim();
  if (!token) return { ok: false, error: "Missing signing link token." };
  const name = (body.signerName || "").trim();
  if (!name) return { ok: false, error: "Your full legal name is required." };
  if (!body.consent) return { ok: false, error: "You must consent to sign electronically." };
  const method = body.method === "drawn" ? "drawn" : "typed";
  if (method === "drawn" && !body.signatureImage) return { ok: false, error: "Please draw your signature before submitting." };

  const { snap } = await findByToken(token);
  if (!snap) return { ok: false, error: "This signing link is invalid or has expired." };
  const data = snap.data() as any;
  const options = data.signingOptions || {};
  if (options.remoteTokenExpiresAt && new Date(options.remoteTokenExpiresAt).getTime() < Date.now()) {
    return { ok: false, error: "This signing link has expired. Ask for a new one." };
  }
  if (options.remoteTokenUsedAt) return { ok: false, error: "This document has already been signed." };

  const now = new Date();
  const remoteSignature: Record<string, unknown> = {
    name,
    method,
    consentedAt: now.toISOString(),
    timestamp: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(now)
  };
  if (method === "drawn" && body.signatureImage) remoteSignature.image = body.signatureImage;
  let signedPdfBase64 = data.pdfBase64;
  if (data.pdfBase64) {
    try {
      signedPdfBase64 = await appendRemoteSigningCertificate(data.pdfBase64, {
        signerName: name,
        timestamp: now.toISOString(),
        signatureImage: method === "drawn" ? body.signatureImage : undefined
      });
    } catch (err) {
      console.error("Remote signing certificate could not be appended:", err);
    }
  }
  await snap.ref.update({
    status: "Signed",
    customerVisible: true,
    ...(signedPdfBase64 ? { pdfBase64: signedPdfBase64 } : {}),
    "signingOptions.remoteTokenUsedAt": now.toISOString(),
    "signingOptions.remoteSignature": remoteSignature,
    auditTrail: [
      ...(Array.isArray(data.auditTrail) ? data.auditTrail : []),
      {
        id: `field_remote_${Date.now()}`,
        signerName: name,
        role: "remote_signer",
        action: "signed_remotely",
        timestamp: now.toISOString()
      }
    ],
    updatedAt: now.toISOString()
  });

  let businessName = "";
  try {
    const businessSnap = await db.collection("business_profiles").doc(data.businessId).get();
    businessName = businessSnap.data()?.name || "";
  } catch {
    // Cosmetic only.
  }

  // A signed Estimate is the acceptance event. Update the SAME Estimate and
  // Customer records the owner app is subscribed to; do not create parallel
  // customer/job copies. The owner still confirms the actual Job from the
  // existing Build Job modal so scheduling/crew/material decisions stay in
  // the business's hands.
  let inviteCode: string | undefined;
  try {
    const resolved = await resolveSignedEstimateCustomer(db, data);
    if (resolved.estimate?.id) {
      await db.collection("estimates").doc(resolved.estimate.id).update({
        status: "Accepted",
        acceptedAt: now.toISOString(),
        acceptedVia: "remote_signature",
        updatedAt: now.toISOString()
      });

      if (resolved.customerId && resolved.customer) {
        await db.collection("customers").doc(resolved.customerId).update({
          status: "Active",
          pendingConfirmation: false,
          updatedAt: now.toISOString()
        });
        inviteCode = await createCustomerAccountInvite(db, data.businessId, resolved.customerId);
      }

      await notifySignedEstimateReadyForJob(db, data.businessId, {
        customerId: resolved.customerId,
        customerName: resolved.customer?.contact || resolved.estimate.customerName || data.customer || name,
        customerPhone: resolved.customer?.phone || resolved.estimate.phone,
        customerEmail: resolved.customer?.email,
        customerAddress: resolved.customer?.address || resolved.estimate.address,
        estimateId: resolved.estimate.id,
        estimateNumber: resolved.estimate.number,
        amount: typeof resolved.estimate.amount === "number" ? resolved.estimate.amount : undefined,
        description: resolved.estimate.projectSpecifics,
        notes: resolved.estimate.notes,
        sourceLeadId: resolved.estimate.sourceLeadId,
        source: resolved.estimate.source
      });
    } else {
      // Non-estimate documents still create a normal document notification,
      // but never invent a Job workflow.
      const id = `notif_signed_doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await db.collection("notifications").doc(id).set({
        id,
        businessId: data.businessId,
        category: "documents",
        screenId: "documents",
        title: "Document signed",
        description: `${name} signed ${data.name || "a document"}.`,
        time: now.toISOString().slice(0, 16).replace("T", " "),
        isRead: false,
        isArchived: false,
        isPinned: false,
        priority: "Normal",
        assignedUser: "Owner",
        recipientEmail: data.businessId,
        createdBy: "Remote Signing",
        createdAt: now.toISOString()
      });
    }
  } catch (workflowError) {
    // The legal signature save is authoritative. A downstream CRM workflow
    // failure must not make the signer resubmit and risk duplicate signatures.
    console.error("Post-sign workflow could not fully complete:", workflowError);
  }

  return { ok: true, customerInviteCode: inviteCode, businessName };
}
