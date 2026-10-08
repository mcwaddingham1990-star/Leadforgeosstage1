import { describe, expect, test } from "vitest";
import { countableIncome, incomeCountedAsJobRevenue } from "../src/lib/revenueDedup";
import type { Invoice } from "../src/types/accounting";
import type { RevenueEvent, Transaction } from "../src/types/domain";

const income = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction =>
  ({ id, type: "income", source: "manual", amount, description: id, date: "2026-10-01", createdAt: "2026-10-01T00:00:00Z", ...extra });
const invoice = (id: string, extra: Partial<Invoice> = {}): Invoice =>
  ({ id, invoiceNumber: id, customer: "Ridgeview HOA", lineItems: [], taxRate: 0, issuedDate: "2026-10-01", dueDate: "2026-10-15", status: "paid", amountPaid: 0, createdAt: "2026-10-01T00:00:00Z", ...extra });
const completed: RevenueEvent = { id: "rev1", date: "2026-10-01T12:00:00Z", amount: 2150, customer: "Ridgeview HOA", jobId: "job1", estimateId: "est1" };

describe("revenue double counting", () => {
  test("a paid invoice for a completed job isn't counted again", () => {
    const txns = [income("pay1", 2150, { source: "invoice_payment", invoiceId: "inv1" })];
    expect([...incomeCountedAsJobRevenue(txns, [invoice("inv1", { jobId: "job1" })], [completed])]).toEqual(["pay1"]);
    expect(countableIncome(txns, [invoice("inv1", { jobId: "job1" })], [completed])).toEqual([]);
  });

  test("matches on the estimate when the invoice has no job id", () => {
    const txns = [income("pay1", 2150, { invoiceId: "inv1" })];
    expect(countableIncome(txns, [invoice("inv1", { estimateId: "est1" })], [completed])).toEqual([]);
  });

  test("partial payments on the same invoice are all left out", () => {
    const txns = [income("dep", 1000, { invoiceId: "inv1" }), income("rest", 1150, { invoiceId: "inv1" })];
    expect(incomeCountedAsJobRevenue(txns, [invoice("inv1", { jobId: "job1" })], [completed]).size).toBe(2);
  });

  test("income not tied to a completed job still counts", () => {
    const txns = [
      income("manual", 300),
      income("membership", 99, { source: "recurring_membership", invoiceId: "invM" }),
      income("noJobInvoice", 500, { invoiceId: "inv2" }),
      income("notCompleted", 800, { invoiceId: "inv3" }),
      income("missingInvoice", 50, { invoiceId: "gone" })
    ];
    const invoices = [invoice("invM", { membershipId: "m1" }), invoice("inv2"), invoice("inv3", { jobId: "job9", estimateId: "est9" })];
    expect(countableIncome(txns, invoices, [completed]).map(t => t.id)).toEqual(["manual", "membership", "noJobInvoice", "notCompleted", "missingInvoice"]);
  });

  test("expenses are never returned as income", () => {
    const txns = [{ ...income("exp", 40), type: "expense" as const }];
    expect(countableIncome(txns, [], [completed])).toEqual([]);
  });
});
