import { createHash, randomUUID } from "crypto";
import type { Request, Response } from "express";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// SECURITY: this handler is not currently wired to any route in server.ts
// (grep server.ts for "payroll" -- there's nothing), so it isn't reachable
// today. It's hardened anyway because it moves real money (ACH payroll
// disbursement) and the request body carries a client-supplied businessId
// with nothing else tying it to the caller -- if this were ever wired up
// with just `requireAuth` and no additional check, any signed-in user could
// submit a real payroll batch for ANY business by naming it in the body.
// The same resolveCallerBusinessId pattern server/stripeConnectRoutes.ts and
// server/customerAccounts.ts already use for the same reason.
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
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for payroll submission:", err);
    adminApp = null;
  }
  return adminApp;
}

async function resolveCallerBusinessId(uid: string): Promise<string | null> {
  const app = getAdminApp();
  if (!app) return null;
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
  const snap = await db.collection("user_profiles").doc(uid).get();
  const businessEmail = snap.data()?.businessEmail;
  return typeof businessEmail === "string" && businessEmail ? businessEmail : null;
}

type PaymentInstruction = {
  employeeId: string;
  employeeName: string;
  amount: number;
  method: "direct_deposit" | "paper_check";
};

type PayrollSubmission = {
  runId: string;
  businessId: string;
  payDate: string;
  fundingAmount: number;
  taxAmount: number;
  payments: PaymentInstruction[];
};

const cents = (value: number) => Math.round(value * 100);

function validateSubmission(body: PayrollSubmission): string[] {
  const errors: string[] = [];
  if (!body?.runId) errors.push("runId is required.");
  if (!body?.businessId) errors.push("businessId is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body?.payDate || "")) errors.push("payDate must be YYYY-MM-DD.");
  if (!Number.isFinite(body?.fundingAmount) || body.fundingAmount <= 0) errors.push("fundingAmount must be positive.");
  if (!Array.isArray(body?.payments) || !body.payments.length) errors.push("At least one payment is required.");
  for (const payment of body?.payments || []) {
    if (!payment.employeeId || !payment.employeeName) errors.push("Every payment needs an employee.");
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) errors.push(`Invalid payment amount for ${payment.employeeName || "employee"}.`);
  }
  const expected = cents((body?.payments || []).reduce((sum, item) => sum + item.amount, 0) + (body?.taxAmount || 0));
  if (Number.isFinite(body?.fundingAmount) && Math.abs(expected - cents(body.fundingAmount)) > 1) {
    errors.push("Funding amount does not balance to net payments plus taxes.");
  }
  return errors;
}

export function getPayrollCapabilities(_req: Request, res: Response) {
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const achConfigured = Boolean(process.env.PAYROLL_ACH_SUBMISSION_URL && process.env.PAYROLL_ACH_API_KEY);
  res.json({
    engine: "owners-native",
    stripe: { configured: stripeConfigured, purpose: "approved_connect_payment_rail" },
    bankAch: { configured: achConfigured, purpose: "direct_odfi_or_processor_submission" },
    liveDisbursementEnabled: achConfigured,
    message: achConfigured
      ? "A live ACH submission rail is configured."
      : "Payroll calculation is live. Add an approved ACH provider endpoint before money movement."
  });
}

export async function submitPayrollBatch(req: Request, res: Response) {
  // Requires requireAuth to have already run (sets req.firebaseUser) --
  // checked explicitly rather than assumed, since this handler isn't wired
  // to a route yet and can't rely on whoever wires it up remembering the
  // middleware. The submitted businessId must match the CALLER's own,
  // server-resolved businessId -- never trust the body's claim alone.
  const caller = req.firebaseUser;
  if (!caller) {
    res.status(401).json({ status: "rejected", errors: ["Sign in required."] });
    return;
  }
  const body = req.body as PayrollSubmission;
  const errors = validateSubmission(body);
  if (errors.length) {
    res.status(400).json({ status: "rejected", errors });
    return;
  }
  const callerBusinessId = await resolveCallerBusinessId(caller.uid);
  if (!callerBusinessId || callerBusinessId !== body.businessId) {
    res.status(403).json({ status: "rejected", errors: ["You are not authorized to submit payroll for this business."] });
    return;
  }

  const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const submissionUrl = process.env.PAYROLL_ACH_SUBMISSION_URL;
  const apiKey = process.env.PAYROLL_ACH_API_KEY;
  if (!submissionUrl || !apiKey) {
    res.status(409).json({
      status: "rail_configuration_required",
      runId: body.runId,
      batchDigest: digest,
      message: "The run is approved and balanced, but no licensed ACH submission rail is configured. No money moved."
    });
    return;
  }

  try {
    const upstream = await fetch(submissionUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${apiKey}`,
        "idempotency-key": body.runId
      },
      body: JSON.stringify({ ...body, batchDigest: digest })
    });
    const responseText = await upstream.text();
    let providerResponse: unknown = responseText;
    try { providerResponse = JSON.parse(responseText); } catch {}
    if (!upstream.ok) {
      res.status(502).json({ status: "provider_failed", providerStatus: upstream.status, providerResponse });
      return;
    }
    res.json({
      status: "submitted",
      providerBatchId: (providerResponse as any)?.id || randomUUID(),
      batchDigest: digest,
      providerResponse
    });
  } catch (error) {
    res.status(502).json({
      status: "provider_unreachable",
      message: error instanceof Error ? error.message : "ACH provider request failed"
    });
  }
}
