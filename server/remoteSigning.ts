import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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
  return { ok: true };
}
