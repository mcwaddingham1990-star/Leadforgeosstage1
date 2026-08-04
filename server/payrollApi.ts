import { createHash, randomUUID } from "crypto";
import type { Request, Response } from "express";

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
  const plaidConfigured = Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
  const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
  const achConfigured = Boolean(process.env.PAYROLL_ACH_SUBMISSION_URL && process.env.PAYROLL_ACH_API_KEY);
  res.json({
    engine: "owners-native",
    plaid: { configured: plaidConfigured, purpose: "bank_linking_and_approved_transfer_rail" },
    stripe: { configured: stripeConfigured, purpose: "approved_connect_payment_rail" },
    bankAch: { configured: achConfigured, purpose: "direct_odfi_or_processor_submission" },
    liveDisbursementEnabled: achConfigured,
    message: achConfigured
      ? "A live ACH submission rail is configured."
      : "Payroll calculation is live. Add an approved ACH provider endpoint before money movement."
  });
}

export async function submitPayrollBatch(req: Request, res: Response) {
  const body = req.body as PayrollSubmission;
  const errors = validateSubmission(body);
  if (errors.length) {
    res.status(400).json({ status: "rejected", errors });
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
