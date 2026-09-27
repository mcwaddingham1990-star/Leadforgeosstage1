import { describe, expect, test } from "vitest";
import type { Invoice } from "../src/types/accounting";
import type { SchedulingEvent } from "../src/types/domain";
import {
  buildJobInvoicePrefill,
  findExistingInvoiceForJob,
  parsePendingInvoicePrefill,
} from "../src/lib/jobInvoiceHandoff";

describe("job to invoice handoff", () => {
  test("preserves the completed job's billing links and context", () => {
    const job = {
      id: "job-123",
      sourceEstimateId: "est-456",
      customerId: "cust-789",
      customer: "Acme Homeowner",
      title: "Kitchen remodel",
      description: "Cabinets and tile",
      budget: 4250,
    } as SchedulingEvent;

    expect(buildJobInvoicePrefill(job)).toEqual({
      jobId: "job-123",
      estimateId: "est-456",
      customerId: "cust-789",
      customerName: "Acme Homeowner",
      description: "Kitchen remodel",
      amount: 4250,
    });
  });

  test("falls back to the job description and a safe zero amount", () => {
    const job = {
      id: "job-plain",
      customer: "Customer",
      description: "Service call",
    } as SchedulingEvent;

    expect(buildJobInvoicePrefill(job)).toEqual({
      jobId: "job-plain",
      estimateId: undefined,
      customerId: undefined,
      customerName: "Customer",
      description: "Service call",
      amount: 0,
    });
  });

  test("parses only valid invoice prefill values from session storage", () => {
    expect(parsePendingInvoicePrefill(JSON.stringify({
      jobId: " job-123 ",
      estimateId: "est-456",
      customerName: "Acme",
      description: "Completed work",
      amount: 99.5,
      ignored: "not part of the handoff",
    }))).toEqual({
      jobId: "job-123",
      estimateId: "est-456",
      customerName: "Acme",
      description: "Completed work",
      amount: 99.5,
    });

    expect(parsePendingInvoicePrefill("{bad json")).toBeNull();
    expect(parsePendingInvoicePrefill(JSON.stringify({ amount: -50 }))).toBeNull();
  });

  test("prevents a second active invoice for the same job but permits a replacement after void", () => {
    const base = {
      invoiceNumber: "INV-1001",
      customer: "Acme",
      lineItems: [],
      taxRate: 0,
      issuedDate: "2026-09-26",
      dueDate: "2026-10-26",
      amountPaid: 0,
      createdAt: "2026-09-26T00:00:00.000Z",
    };

    const active = { ...base, id: "inv-active", jobId: "job-123", status: "sent" as const };
    const voided = { ...base, id: "inv-void", jobId: "job-999", status: "void" as const };

    expect(findExistingInvoiceForJob([active, voided] as Invoice[], "job-123")?.id).toBe("inv-active");
    expect(findExistingInvoiceForJob([active, voided] as Invoice[], "job-999")).toBeUndefined();
  });
});
