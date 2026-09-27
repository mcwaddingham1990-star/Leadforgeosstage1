import type { Invoice } from "../types/accounting";
import type { SchedulingEvent } from "../types/domain";

export interface PendingInvoicePrefill {
  jobId?: string;
  estimateId?: string;
  customerId?: string;
  customerName?: string;
  description?: string;
  amount?: number;
}

export function buildJobInvoicePrefill(job: SchedulingEvent): PendingInvoicePrefill {
  return {
    jobId: job.id,
    estimateId: job.sourceEstimateId || undefined,
    customerId: job.customerId || undefined,
    customerName: job.customer || undefined,
    description: job.title || job.description || "Completed job",
    amount: Number(job.budget) || 0,
  };
}

export function parsePendingInvoicePrefill(raw: string | null): PendingInvoicePrefill | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const result: PendingInvoicePrefill = {};
    for (const key of ["jobId", "estimateId", "customerId", "customerName", "description"] as const) {
      if (typeof value[key] === "string" && value[key].trim()) {
        result[key] = value[key].trim();
      }
    }
    if (typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0) {
      result.amount = value.amount;
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export function findExistingInvoiceForJob(invoices: Invoice[], jobId?: string): Invoice | undefined {
  if (!jobId) return undefined;
  return invoices.find(invoice => invoice.jobId === jobId && invoice.status !== "void");
}
