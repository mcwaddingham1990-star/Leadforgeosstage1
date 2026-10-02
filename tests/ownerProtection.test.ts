import { describe, expect, test } from "vitest";
import {
  buildProofTimeline, computeInvoiceAlerts, computeJobAlerts, computeJobProtection, looksLikeScopeChange,
  parseDurationHours, type ProtectionSources
} from "../src/lib/ownerProtection";
import type { DocumentItem, Estimate, SchedulingEvent, TextMessage } from "../src/types/domain";
import type { Invoice } from "../src/types/accounting";

const NOW = Date.parse("2026-06-20T12:00:00Z");

const job = (over: Partial<SchedulingEvent> = {}): SchedulingEvent => ({
  id: "job_1", eventType: "Job", date: "2026-06-10", startTime: "09:00", endTime: "15:00", customer: "Dana Smith",
  customerId: "cust_1", customerPhone: "(555) 123-4567", assignedEmployee: "Sam", priority: "Medium", status: "Working",
  sourceEstimateId: "est_1", createdAt: "2026-06-05T10:00:00Z", ...over,
});

const estimate = (over: Partial<Estimate> = {}): Estimate => ({
  id: "est_1", number: "EST-1", customerName: "Dana Smith", company: "", status: "Signed", salesRep: "Pat",
  amount: 2000, createdDate: "06/01/2026", expirationDate: "07/01/2026", ...over,
});

const doc = (over: Partial<DocumentItem>): DocumentItem => ({
  id: "doc", name: "file.pdf", customer: "Dana Smith", employee: "Sam", vendor: "None", job: "job_1", type: "Contracts",
  uploadedBy: "Sam", date: "2026-06-10", size: "1 KB", status: "Completed", isFavorite: false, isArchived: false, notes: "",
  tags: [], estimateId: "None", invoiceId: "None", lastModified: "2026-06-10 12:00:00", ...over,
});

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  id: "inv_1", invoiceNumber: "INV-1", customer: "Dana Smith", jobId: "job_1", lineItems: [{ id: "l1", description: "Work", quantity: 1, unitPrice: 2000 }],
  taxRate: 0, issuedDate: "2026-06-15", dueDate: "2026-06-30", status: "sent", amountPaid: 0, createdAt: "2026-06-15T10:00:00Z", ...over,
});

const sources = (over: Partial<ProtectionSources> = {}): ProtectionSources => ({
  estimates: [estimate()], documents: [], completionPlans: [], invoices: [], transactions: [],
  timeClockLogs: [{ id: "c1", employeeEmail: "sam@x.com", employeeName: "Sam", type: "Clock In", date: "2026-06-10", time: "9:00 AM", timestamp: "2026-06-10T09:00:00Z", gps: "1,1", jobId: "job_1" }],
  textMessages: [], conversations: [], now: NOW, ...over,
});

const fullyDocumented = () => sources({
  documents: [
    doc({ id: "before", name: "Before – site.jpg", type: "Progress Photos", tags: ["Before Photos"], lastModified: "2026-06-10 08:50:00", url: "data:image/jpeg;base64,AAA" }),
    doc({ id: "after", name: "After – done.jpg", type: "Progress Photos", tags: ["After Photos"], lastModified: "2026-06-12 16:00:00", url: "data:image/jpeg;base64,AAA" }),
    doc({ id: "signoff", name: "JOB-1-completion.pdf", status: "Signed", lastModified: "2026-06-12 16:30:00", auditTrail: [{ id: "a1", signerName: "Dana Smith", role: "Customer", action: "Signed", timestamp: "2026-06-12T16:30:00Z" }] }),
  ],
  completionPlans: [{ id: "job_1", jobId: "job_1", summary: "", overallGoal: "", projectStartDate: "", estimatedCompletionDate: "", goals: [], activity: [], finalCloseoutApproved: true, finalCloseoutApprovedAt: "2026-06-12T17:00:00Z", createdBy: "Owner", createdAt: "", updatedAt: "" }],
  invoices: [invoice({ status: "paid", amountPaid: 2000 })],
  textMessages: [{ id: "t1", businessId: "b", phoneNumber: "+15551234567", direction: "incoming", body: "Thanks, see you Tuesday", customerId: "cust_1", leadId: null, createdNewLead: false, timestamp: "2026-06-09T10:00:00Z", createdAt: "" }],
});

describe("job protection", () => {
  test("a fully documented, paid job is Protected with no alerts", () => {
    const j = job({ status: "Completed", completedAt: "2026-06-12T17:00:00Z" });
    const s = fullyDocumented();
    const p = computeJobProtection(j, s);
    expect(p.score).toBe(100);
    expect(p.level).toBe("Protected");
    expect(p.missingCritical).toHaveLength(0);
    expect(computeJobAlerts(j, p, s)).toHaveLength(0);
  });

  test("a completed job with no estimate, photos, signature or invoice is At Risk and lists every gap", () => {
    const j = job({ status: "Completed", completedAt: "2026-06-12T17:00:00Z", sourceEstimateId: undefined, budget: 1500 });
    const s = sources({ estimates: [] });
    const p = computeJobProtection(j, s);
    expect(p.level).toBe("At Risk");
    expect(p.missingCritical.map(c => c.id)).toEqual(expect.arrayContaining(["scope", "before_photos", "after_photos", "completion_signature"]));
    const types = computeJobAlerts(j, p, s).map(a => a.type);
    expect(types).toContain("completed_not_invoiced");
    expect(types).toContain("closing_without_proof");
  });

  test("an in-progress job treats after photos and completion signature as not yet due", () => {
    const p = computeJobProtection(job(), sources());
    expect(p.checks.find(c => c.id === "after_photos")!.status).toBe("pending");
    expect(p.checks.find(c => c.id === "completion_signature")!.status).toBe("pending");
    // ...but they're still flagged before completing.
    expect(p.missingCritical.map(c => c.id)).toContain("after_photos");
  });
});

describe("change orders", () => {
  const request: TextMessage = { id: "t2", businessId: "b", phoneNumber: "+1 555 123 4567", direction: "incoming", body: "While you're here can you also replace the bathroom fan?", customerId: null, leadId: null, createdNewLead: false, timestamp: "2026-06-10T13:00:00Z", createdAt: "" };

  test("a customer asking for extra work with no change order raises a high alert", () => {
    const s = sources({ textMessages: [request] });
    const p = computeJobProtection(job(), s);
    expect(p.checks.find(c => c.id === "change_orders")!.status).toBe("missing");
    const alert = computeJobAlerts(job(), p, s).find(a => a.type === "extra_work_no_change_order");
    expect(alert?.severity).toBe("high");
    expect(alert?.action.kind).toBe("create_change_order");
  });

  test("once a change order covers it, the alert becomes 'get it signed' and the signed amount adds to the approved value", () => {
    const co = estimate({ id: "co_1", number: "EST-2", amount: 350, status: "Sent", createdDate: "06/10/2026", changeOrderForJobId: "job_1" });
    let s = sources({ textMessages: [request], estimates: [estimate(), co] });
    let p = computeJobProtection(job(), s);
    let types = computeJobAlerts(job(), p, s).map(a => a.type);
    expect(types).toContain("unsigned_change_order");
    expect(types).not.toContain("extra_work_no_change_order");
    expect(p.approvedValue).toBe(2000);

    s = sources({ textMessages: [request], estimates: [estimate(), { ...co, status: "Signed" }] });
    p = computeJobProtection(job(), s);
    types = computeJobAlerts(job(), p, s).map(a => a.type);
    expect(types).not.toContain("unsigned_change_order");
    expect(p.approvedValue).toBe(2350);
    expect(p.checks.find(c => c.id === "change_orders")!.status).toBe("done");
  });

  test("costs over the approved amount ask for a change order and show the overage", () => {
    const s = sources({ costing: { estimatedRevenue: 2000, laborHours: 30, laborCost: 1800, materialCost: 600, otherCost: 0, totalCost: 2400, grossProfit: -400, marginPercent: -20 } });
    const p = computeJobProtection(job(), s);
    const alert = computeJobAlerts(job(), p, s).find(a => a.type === "over_estimate");
    expect(alert?.amount).toBe(400);
  });

  test("labor well past the estimated duration is flagged", () => {
    const s = sources({ costing: { estimatedRevenue: 2000, laborHours: 12, laborCost: 600, materialCost: 0, otherCost: 0, totalCost: 600, grossProfit: 1400, marginPercent: 70 } });
    const j = job({ estimatedDuration: "6 hours" });
    const alert = computeJobAlerts(j, computeJobProtection(j, s), s).find(a => a.type === "labor_overrun");
    expect(alert?.amount).toBe(300);
  });
});

describe("invoices", () => {
  test("a past-due unpaid invoice is overdue with its balance", () => {
    const alerts = computeInvoiceAlerts([invoice({ dueDate: "2026-05-01", amountPaid: 500 })], [job()], NOW);
    expect(alerts[0].type).toBe("invoice_overdue");
    expect(alerts[0].amount).toBe(1500);
    expect(alerts[0].severity).toBe("high");
  });

  test("paid and void invoices raise nothing", () => {
    expect(computeInvoiceAlerts([invoice({ dueDate: "2026-05-01", status: "paid", amountPaid: 2000 }), invoice({ id: "v", status: "void", dueDate: "2026-01-01" })], [], NOW)).toHaveLength(0);
  });
});

describe("proof timeline", () => {
  test("events from every source come back in chronological order", () => {
    const s = fullyDocumented();
    const events = buildProofTimeline(job({ status: "Completed", completedAt: "2026-06-12T17:00:00Z" }), s);
    const times = events.map(e => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    const kinds = new Set(events.map(e => e.kind));
    for (const k of ["estimate", "arrival", "photo", "signature", "completion", "message"]) expect(kinds).toContain(k);
  });
});

describe("helpers", () => {
  test("scope-change wording", () => {
    expect(looksLikeScopeChange("Could you also add two outlets in the garage?")).toBe(true);
    expect(looksLikeScopeChange("Thanks, see you tomorrow")).toBe(false);
    expect(looksLikeScopeChange("ok")).toBe(false);
  });

  test("duration parsing", () => {
    expect(parseDurationHours("2 hours")).toBe(2);
    expect(parseDurationHours("90 min")).toBe(1.5);
    expect(parseDurationHours("1 day")).toBe(8);
    expect(parseDurationHours("")).toBeNull();
  });
});
