import { describe, expect, test, vi } from "vitest";
import type { BuildJobPromptRequest } from "../src/lib/buildJobPrompts";
import type { Automation, AutomationRun } from "../src/types/automation";
import type { Customer, Estimate, Lead, SchedulingEvent, AppNotification } from "../src/types/domain";
import type { Invoice, JournalEntry } from "../src/types/accounting";
import type { ReviewRequest } from "../src/types/reviewRequest";
import {
  AUTOMATION_TEMPLATES,
  automationFromTemplate,
  automationRunId,
  buildAutomationFacts,
  computeRunStatus,
  deriveAutomationEvents,
  duplicateAutomation,
  evaluateConditions,
  executeAutomation,
  findOverdueInvoiceEvents,
  validateAutomation,
  type AutomationEvent,
  type AutomationRunStore
} from "../src/lib/automationEngine";
import { createAutomationActionHandlers, type AutomationActionDeps } from "../src/lib/automationActions";
import { buildInvoiceFromJob } from "../src/lib/jobInvoiceHandoff";

const BIZ = "owner@example.com";

// ---------------------------------------------------------------------------
// In-memory harness: a tiny stand-in for the app's state + the run log.
// ---------------------------------------------------------------------------

function memoryStore() {
  const runs = new Map<string, AutomationRun>();
  const lastRuns = new Map<string, unknown>();
  const store: AutomationRunStore = {
    claim: vi.fn(async run => {
      if (runs.has(run.id)) return false;
      runs.set(run.id, { ...run });
      return true;
    }),
    recordSkip: vi.fn(async run => {
      if (!runs.has(run.id)) runs.set(run.id, { ...run });
    }),
    finish: vi.fn(async (id, patch) => {
      runs.set(id, { ...(runs.get(id) as AutomationRun), ...patch });
    }),
    updateLastRun: vi.fn(async (id, patch) => {
      lastRuns.set(id, patch);
    })
  };
  return { store, runs, lastRuns };
}

function stateSetter<T>(box: { value: T[] }) {
  return (value: T[] | ((prev: T[]) => T[])) => {
    box.value = typeof value === "function" ? (value as (prev: T[]) => T[])(box.value) : value;
  };
}

function memoryApp(seed: Partial<{ customers: Customer[]; estimates: Estimate[]; leads: Lead[]; jobs: SchedulingEvent[]; invoices: Invoice[] }> = {}) {
  const customers = { value: seed.customers || [] };
  const leads = { value: seed.leads || [] };
  const estimates = { value: seed.estimates || [] };
  const schedulingEvents = { value: seed.jobs || [] };
  const invoices = { value: seed.invoices || [] };
  const journal = { value: [] as JournalEntry[] };
  const notifications = { value: [] as AppNotification[] };
  const reviewRequests = { value: [] as ReviewRequest[] };
  const messages: Array<{ customerId: string; id: string; content: string }> = [];

  // Mirrors useDomainActions.createJob's contract: one job per sourceEstimateId.
  const createJob = vi.fn((input: any): SchedulingEvent => {
    if (input.sourceEstimateId) {
      const existing = schedulingEvents.value.find(e => e.sourceEstimateId === input.sourceEstimateId);
      if (existing) return existing;
    }
    const job = {
      id: `job_${schedulingEvents.value.length + 1}`,
      eventType: "Job",
      jobNumber: `JOB-2026-${String(schedulingEvents.value.length + 1).padStart(4, "0")}`,
      status: "Scheduled",
      priority: "Medium",
      assignedEmployee: "",
      activity: [],
      ...input
    } as SchedulingEvent;
    schedulingEvents.value = [job, ...schedulingEvents.value];
    return job;
  });

  // Mirrors requestBuildJobPrompt's contract: each estimate/lead is asked about once.
  const prompts: BuildJobPromptRequest[] = [];
  const promptBuildJob = vi.fn((request: BuildJobPromptRequest) => {
    if (prompts.some(p => p.key === request.key)) return false;
    prompts.push(request);
    return true;
  });

  const deps: AutomationActionDeps = {
    businessId: BIZ,
    businessName: "Acme Services",
    actorEmail: BIZ,
    getData: () => ({
      customers: customers.value,
      leads: leads.value,
      estimates: estimates.value,
      schedulingEvents: schedulingEvents.value,
      invoices: invoices.value,
      employees: [{ id: "mgr@example.com", email: "mgr@example.com", role: "Office Manager" } as any],
      reviewRequests: reviewRequests.value,
      reviewAutomationSettings: { enabled: false, trigger: "manual", daysAfterCompletion: 3, message: "Please review us", reviewLink: "https://g.page/r/x", excludedCustomerIds: [] },
      salesTaxRates: []
    }),
    createJob,
    promptBuildJob,
    createAppointment: vi.fn((input: any) => {
      const id = `appt_${String(input.dedupeKey).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120)}`;
      const existing = schedulingEvents.value.find(e => e.id === id);
      if (existing) return existing;
      const entry = { id, status: "Unassigned", priority: "Medium", assignedEmployee: "", ...input } as SchedulingEvent;
      schedulingEvents.value = [entry, ...schedulingEvents.value];
      return entry;
    }),
    updateJob: vi.fn((id: string, updates: Partial<SchedulingEvent>, label?: string) => {
      let updated: SchedulingEvent | null = null;
      schedulingEvents.value = schedulingEvents.value.map(e => {
        if (e.id !== id) return e;
        updated = { ...e, ...updates, activity: [...(e.activity || []), { id: "a", timestamp: "", action: label || "", by: "x" }] };
        return updated;
      });
      return updated;
    }),
    setLeads: stateSetter(leads) as any,
    setInvoices: stateSetter(invoices) as any,
    setJournalEntries: stateSetter(journal) as any,
    setEstimates: stateSetter(estimates) as any,
    setNotifications: stateSetter(notifications) as any,
    setReviewRequests: stateSetter(reviewRequests) as any,
    postCustomerMessage: vi.fn(async ({ customer, messageId, content }) => {
      if (messages.some(m => m.id === messageId)) return "exists" as const;
      messages.push({ customerId: customer.id, id: messageId, content });
      return "posted" as const;
    }),
    logOperationalEvent: vi.fn(),
    now: () => new Date("2026-10-05T12:00:00Z")
  };

  return { customers, leads, estimates, schedulingEvents, invoices, journal, notifications, reviewRequests, messages, deps, createJob, promptBuildJob, prompts };
}

const CUSTOMER: Customer = {
  id: "cust_1", company: "Jane Doe", contact: "Jane Doe", phone: "5551234567", email: "jane@example.com", address: "1 Main St",
  openJobs: 0, outstandingBalance: 0, lifetimeValue: 0, status: "Active", type: "Residential", isVIP: false, recentlyAdded: false
};

const ESTIMATE: Estimate = {
  id: "est_1", number: "EST-1001", customerName: "Jane Doe", company: "", customerId: "cust_1", status: "Sent",
  salesRep: "Owner", amount: 7200, createdDate: "Oct 1, 2026", expirationDate: "Oct 31, 2026", address: "1 Main St", phone: "5551234567"
};

function enabledFromTemplate(templateId: string): Automation {
  const template = AUTOMATION_TEMPLATES.find(t => t.id === templateId)!;
  return { ...automationFromTemplate(template, BIZ), enabled: true, enabledAt: "2026-10-01T00:00:00.000Z" };
}

function acceptedEvent(estimate: Estimate = ESTIMATE): AutomationEvent {
  const [event] = deriveAutomationEvents({ collection: "estimates", type: "updated", previous: estimate, item: { ...estimate, status: "Accepted" } });
  return event;
}

async function runAll(automations: Automation[], events: AutomationEvent[], app: ReturnType<typeof memoryApp>, store: AutomationRunStore) {
  const handlers = createAutomationActionHandlers(app.deps);
  const outcomes = [];
  for (const event of events) {
    for (const automation of automations) {
      outcomes.push(await executeAutomation(automation, event, { businessId: BIZ, store, handlers, log: () => undefined }));
    }
  }
  return outcomes;
}

// ---------------------------------------------------------------------------
// Acceptance tests
// ---------------------------------------------------------------------------

describe("Acceptance 1: all automations OFF leaves the workflow untouched", () => {
  test("every starter template is created disabled, and duplicates are disabled", () => {
    for (const template of AUTOMATION_TEMPLATES) {
      const automation = automationFromTemplate(template);
      expect(automation.enabled).toBe(false);
      expect(validateAutomation(automation)).toEqual([]);
      expect(duplicateAutomation({ ...automation, enabled: true }).enabled).toBe(false);
    }
  });

  test("the full Lead → Estimate → Job → Completion → Invoice → Paid chain triggers nothing while everything is OFF", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [ESTIMATE] });
    const { store } = memoryStore();
    const automations = AUTOMATION_TEMPLATES.map(t => automationFromTemplate(t)); // all OFF
    const job = { id: "job_9", eventType: "Job", status: "Scheduled", customer: "Jane Doe", sourceEstimateId: "est_1", budget: 7200 } as SchedulingEvent;
    const invoice = { id: "inv_1", invoiceNumber: "INV-1001", customer: "Jane Doe", lineItems: [{ id: "l", description: "x", quantity: 1, unitPrice: 7200 }], taxRate: 0, issuedDate: "2026-10-01", dueDate: "2026-10-02", status: "sent", amountPaid: 0, createdAt: "" } as Invoice;
    const events = [
      { collection: "leads", type: "created", item: { id: "lead_1", name: "Jane Doe", source: "Website", notes: "EMERGENCY leak" } },
      { collection: "estimates", type: "created", item: ESTIMATE },
      { collection: "estimates", type: "updated", previous: ESTIMATE, item: { ...ESTIMATE, status: "Accepted" } },
      { collection: "scheduling_events", type: "created", item: job },
      { collection: "scheduling_events", type: "updated", previous: job, item: { ...job, status: "Completed" } },
      { collection: "invoices", type: "created", item: invoice },
      { collection: "invoices", type: "updated", previous: invoice, item: { ...invoice, status: "paid", amountPaid: 7200 } }
    ].flatMap(e => deriveAutomationEvents(e as any));
    events.push(...findOverdueInvoiceEvents([invoice], undefined));

    const outcomes = await runAll(automations, events, app, store);
    expect(outcomes.every(o => o === "not_applicable")).toBe(true);
    expect(store.claim).not.toHaveBeenCalled();
    expect(store.recordSkip).not.toHaveBeenCalled();
    expect(app.createJob).not.toHaveBeenCalled();
    expect(app.schedulingEvents.value).toEqual([]);
    expect(app.invoices.value).toEqual([]);
    expect(app.notifications.value).toEqual([]);
    expect(app.messages).toEqual([]);
  });
});

describe("Acceptance 2 + 3: Estimate Accepted → Build Job prompts once and never creates a bare job", () => {
  test("asks to build the job with the Build Job form pre-filled from the estimate -- no job is created", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [{ ...ESTIMATE, status: "Accepted" }] });
    const { store, runs } = memoryStore();
    const automation = enabledFromTemplate("estimate_accepted_job");

    const [outcome] = await runAll([automation], [acceptedEvent()], app, store);

    expect(outcome).toBe("Completed");
    expect(app.createJob).not.toHaveBeenCalled();
    expect(app.schedulingEvents.value).toEqual([]);
    expect(app.prompts).toHaveLength(1);
    expect(app.prompts[0].key).toBe("estimate:est_1");
    expect(app.prompts[0].prefill).toMatchObject({ sourceEstimateId: "est_1", customerId: "cust_1", customerName: "Jane Doe", budget: 7200, customerAddress: "1 Main St" });
    // Notify owner + customer confirmation also ran.
    expect(app.notifications.value.map(n => n.recipientEmail)).toEqual([BIZ]);
    expect(app.notifications.value[0].description).toContain("build the job");
    expect(app.messages).toHaveLength(1);
    const run = runs.get(automationRunId(automation.id, "estimate.accepted:est_1"))!;
    expect(run.status).toBe("Completed");
    expect(run.businessId).toBe(BIZ);
    expect(run.actionResults.map(r => r.status)).toEqual(["completed", "completed", "completed"]);
    expect(run.actionResults[0].detail).toContain("no job created automatically");
  });

  test("a signed estimate counts as accepted", () => {
    const [event] = deriveAutomationEvents({ collection: "estimates", type: "updated", previous: ESTIMATE, item: { ...ESTIMATE, status: "Signed" } });
    expect(event?.trigger).toBe("estimate.accepted");
    // ...and Signed -> Accepted is not a second acceptance.
    expect(deriveAutomationEvents({ collection: "estimates", type: "updated", previous: { ...ESTIMATE, status: "Signed" }, item: { ...ESTIMATE, status: "Accepted" } })).toEqual([]);
  });

  test("replaying the same event (retry, echo, second tab) never prompts again", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [{ ...ESTIMATE, status: "Accepted" }] });
    const { store } = memoryStore();
    const automation = enabledFromTemplate("estimate_accepted_job");

    const outcomes = await runAll([automation], [acceptedEvent(), acceptedEvent(), acceptedEvent()], app, store);

    expect(outcomes).toEqual(["Completed", "duplicate", "duplicate"]);
    expect(app.prompts).toHaveLength(1);
    expect(app.createJob).not.toHaveBeenCalled();
    expect(app.notifications.value).toHaveLength(1);
    expect(app.messages).toHaveLength(1);
  });

  test("even if the run log were lost, the action itself refuses a second prompt, notification, or message", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [{ ...ESTIMATE, status: "Accepted" }] });
    const automation = enabledFromTemplate("estimate_accepted_job");
    await runAll([automation], [acceptedEvent()], app, memoryStore().store);
    const [second] = await runAll([automation], [acceptedEvent()], app, memoryStore().store);

    expect(second).toBe("Skipped");
    expect(app.prompts).toHaveLength(1);
    expect(app.createJob).not.toHaveBeenCalled();
    expect(app.notifications.value).toHaveLength(1);
    expect(app.messages).toHaveLength(1);
  });

  test("a job already built by hand is respected (skipped, no prompt)", async () => {
    const manualJob = { id: "job_manual", eventType: "Job", jobNumber: "JOB-2026-0007", sourceEstimateId: "est_1", customer: "Jane Doe", status: "Assigned" } as SchedulingEvent;
    const app = memoryApp({ customers: [CUSTOMER], estimates: [{ ...ESTIMATE, status: "Accepted" }], jobs: [manualJob] });
    const automation = { ...enabledFromTemplate("estimate_accepted_job"), actions: [{ id: "a1", type: "create_job" as const }], actionTypes: ["create_job" as const] };
    const [outcome] = await runAll([automation], [acceptedEvent()], app, memoryStore().store);
    expect(outcome).toBe("Skipped");
    expect(app.prompts).toEqual([]);
    expect(app.createJob).not.toHaveBeenCalled();
    expect(app.schedulingEvents.value).toEqual([manualJob]);
  });
});

describe("Acceptance 4: an automation failure never breaks the manual action", () => {
  test("a throwing action is logged as Partial, other actions still run, and nothing throws", async () => {
    const accepted = { ...ESTIMATE, status: "Accepted" as const };
    const app = memoryApp({ customers: [CUSTOMER], estimates: [accepted] });
    app.deps.promptBuildJob = () => { throw new Error("Firestore unavailable"); };
    const { store, runs } = memoryStore();
    const automation = enabledFromTemplate("estimate_accepted_job");

    const [outcome] = await runAll([automation], [acceptedEvent()], app, store);

    expect(outcome).toBe("Partial");
    const run = runs.get(automationRunId(automation.id, "estimate.accepted:est_1"))!;
    expect(run.status).toBe("Partial");
    expect(run.errors[0]).toContain("Firestore unavailable");
    expect(run.actionResults.map(r => r.status)).toEqual(["failed", "completed", "completed"]);
    // The manual action's result (the accepted estimate) is untouched.
    expect(app.estimates.value).toEqual([accepted]);
  });

  test("a broken run store doesn't throw either", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [ESTIMATE] });
    const store: AutomationRunStore = {
      claim: async () => { throw new Error("offline"); },
      recordSkip: async () => { throw new Error("offline"); },
      finish: async () => { throw new Error("offline"); },
      updateLastRun: async () => { throw new Error("offline"); }
    };
    await expect(runAll([enabledFromTemplate("estimate_accepted_job")], [acceptedEvent()], app, store)).resolves.toEqual(["duplicate"]);
    expect(app.createJob).not.toHaveBeenCalled();
  });

  test("all actions failing is Failed", () => {
    expect(computeRunStatus([{ actionId: "a", type: "create_job", status: "failed", detail: "" }])).toBe("Failed");
    expect(computeRunStatus([{ actionId: "a", type: "create_job", status: "skipped", detail: "" }])).toBe("Skipped");
  });
});

describe("Acceptance 5 (engine side): runs are stamped with the session's own business", () => {
  test("the business id on a run comes from the signed-in session, not the automation or record", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [ESTIMATE] });
    const { store, runs } = memoryStore();
    const automation = { ...enabledFromTemplate("estimate_accepted_job"), businessId: "attacker@example.com" } as Automation;
    const event = acceptedEvent();
    event.record = { ...event.record, businessId: "attacker@example.com" };
    await executeAutomation(automation, event, { businessId: BIZ, store, handlers: createAutomationActionHandlers(app.deps), log: () => undefined });
    expect([...runs.values()][0].businessId).toBe(BIZ);
  });

  test("a session without permission for an action leaves the run unclaimed", async () => {
    const app = memoryApp({ customers: [CUSTOMER], estimates: [ESTIMATE] });
    const { store } = memoryStore();
    const outcome = await executeAutomation(enabledFromTemplate("estimate_accepted_job"), acceptedEvent(), {
      businessId: BIZ, store, handlers: createAutomationActionHandlers(app.deps), canRunActions: () => false, log: () => undefined
    });
    expect(outcome).toBe("no_permission");
    expect(store.claim).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// WHEN / IF / DO details
// ---------------------------------------------------------------------------

describe("WHEN: deriving business events", () => {
  test("maps collection changes to the supported events", () => {
    const triggers = (e: any) => deriveAutomationEvents(e).map(x => x.trigger);
    expect(triggers({ collection: "leads", type: "created", item: { id: "l", source: "Website" } })).toEqual(["lead.created", "booking.website.created"]);
    expect(triggers({ collection: "leads", type: "created", item: { id: "l", source: "Customer Portal" } })).toEqual(["lead.created", "booking.portal.created"]);
    expect(triggers({ collection: "estimates", type: "updated", previous: { id: "e", status: "Accepted" }, item: { id: "e", status: "Accepted", notes: "x" } })).toEqual([]);
    expect(triggers({ collection: "scheduling_events", type: "created", item: { id: "s", eventType: "Site Visit" } })).toEqual(["appointment.created"]);
    expect(triggers({ collection: "scheduling_events", type: "created", item: { id: "s", eventType: "Follow-Up" } })).toEqual([]);
    expect(triggers({ collection: "scheduling_events", type: "updated", previous: { id: "j", eventType: "Job", status: "Working" }, item: { id: "j", eventType: "Job", status: "Completed" } })).toEqual(["job.completed"]);
    expect(triggers({ collection: "invoices", type: "updated", previous: { id: "i", status: "partial" }, item: { id: "i", status: "paid" } })).toEqual(["invoice.paid"]);
    expect(triggers({ collection: "customers", type: "created", item: { id: "c" } })).toEqual([]);
  });

  test("Online Booking jobs fire the booking triggers (plus job.created)", () => {
    const triggers = (e: any) => deriveAutomationEvents(e).map(x => x.trigger);
    expect(triggers({ collection: "scheduling_events", type: "created", item: { id: "job_booking_1", eventType: "Job", bookingSource: "Website Booking" } })).toEqual(["job.created", "booking.website.created"]);
    expect(triggers({ collection: "scheduling_events", type: "created", item: { id: "job_booking_2", eventType: "Job", bookingSource: "Customer Portal" } })).toEqual(["job.created", "booking.portal.created"]);
  });

  test("Website emergency booking template also handles a booked job: High priority + managers notified", async () => {
    const booked = { id: "job_booking_3", eventType: "Job", jobNumber: "JOB-2026-0011", customer: "Sam", status: "Scheduled", priority: "Medium", bookingSource: "Website Booking", source: "Website", description: "Furnace out, emergency", activity: [] } as unknown as SchedulingEvent;
    const app = memoryApp({ jobs: [booked] });
    const automation = enabledFromTemplate("website_emergency_priority");
    const events = deriveAutomationEvents({ collection: "scheduling_events", type: "created", item: booked });
    const outcomes = await runAll([automation], events, app, memoryStore().store);
    expect(outcomes).toContain("Completed");
    expect(app.schedulingEvents.value[0].priority).toBe("High");
    expect(app.notifications.value.map(n => n.recipientEmail)).toEqual(["mgr@example.com"]);
  });

  test("records created by an automation don't fire '...created' automations (no loops)", async () => {
    const automation: Automation = { ...automationFromTemplate(AUTOMATION_TEMPLATES[0]), trigger: "job.created", enabled: true, actions: [{ id: "a", type: "notify_team" }], actionTypes: ["notify_team"] };
    const [event] = deriveAutomationEvents({ collection: "scheduling_events", type: "created", item: { id: "j", eventType: "Job", createdByAutomationId: "auto_other" } });
    const { store } = memoryStore();
    expect(await executeAutomation(automation, event, { businessId: BIZ, store, handlers: {} })).toBe("not_applicable");
  });

  test("overdue scan only covers invoices due on/after the day the automation was turned on", () => {
    const base = { lineItems: [{ id: "l", description: "x", quantity: 1, unitPrice: 100 }], taxRate: 0, amountPaid: 0, status: "sent" };
    const invoices = [
      { ...base, id: "old", dueDate: "2026-09-01" },
      { ...base, id: "new", dueDate: "2026-10-01" },
      { ...base, id: "paid", dueDate: "2026-10-01", status: "paid", amountPaid: 100 },
      { ...base, id: "future", dueDate: "2026-10-20" }
    ];
    const events = findOverdueInvoiceEvents(invoices, "2026-09-15T10:00:00Z", new Date("2026-10-05T12:00:00Z"));
    expect(events.map(e => e.record.id)).toEqual(["new"]);
    expect(events[0].eventKey).toBe("invoice.overdue:new:2026-10-01");
    expect(buildAutomationFacts(events[0], new Date("2026-10-05T12:00:00Z")).daysOverdue).toBe(4);
    expect(findOverdueInvoiceEvents(invoices, undefined)).toEqual([]);
  });
});

describe("IF: simple AND conditions", () => {
  const facts = (collection: AutomationEvent["collection"], record: any) => buildAutomationFacts({ trigger: "lead.created", collection, record, eventKey: "k", occurredAt: "" }, new Date("2026-10-05T12:00:00Z"));
  const cond = (field: any, operator: any, value: string) => ({ id: "c", field, operator, value });

  test("amount > $5,000", () => {
    expect(evaluateConditions([cond("amount", "greater_than", "$5,000")], facts("estimates", { amount: 7200 })).passed).toBe(true);
    expect(evaluateConditions([cond("amount", "greater_than", "5000")], facts("estimates", { amount: 5000 })).passed).toBe(false);
  });

  test("priority = Emergency matches Urgent jobs and emergency website requests", () => {
    expect(evaluateConditions([cond("priority", "equals", "Emergency")], facts("scheduling_events", { priority: "Urgent" })).passed).toBe(true);
    expect(evaluateConditions([cond("priority", "equals", "Emergency")], facts("leads", { notes: "Pipe burst, EMERGENCY please" })).passed).toBe(true);
    expect(evaluateConditions([cond("priority", "equals", "Emergency")], facts("leads", { notes: "quote for next month" })).passed).toBe(false);
  });

  test("source = Website, service type = HVAC, invoice overdue > 3 days, all ANDed", () => {
    expect(evaluateConditions([cond("source", "equals", "website")], facts("leads", { source: "Website" })).passed).toBe(true);
    expect(evaluateConditions([cond("serviceType", "equals", "HVAC")], facts("scheduling_events", { jobType: "hvac" })).passed).toBe(true);
    expect(evaluateConditions([cond("serviceType", "contains", "HVAC")], facts("estimates", { projectSpecifics: "Replace HVAC condenser" })).passed).toBe(true);
    const overdue = { dueDate: "2026-09-30", status: "sent", amountPaid: 0, taxRate: 0, lineItems: [{ quantity: 1, unitPrice: 6000 }] };
    expect(evaluateConditions([cond("daysOverdue", "greater_than", "3"), cond("amount", "greater_than", "5000")], facts("invoices", overdue)).passed).toBe(true);
    expect(evaluateConditions([cond("daysOverdue", "greater_than", "3"), cond("amount", "greater_than", "9000")], facts("invoices", overdue)).passed).toBe(false);
  });

  test("a condition-skipped run is logged once and doesn't block a later qualifying pass", async () => {
    const app = memoryApp({ customers: [CUSTOMER] });
    const { store, runs } = memoryStore();
    const automation = enabledFromTemplate("invoice_overdue_reminder"); // daysOverdue > 3
    const invoice = { id: "inv_7", invoiceNumber: "INV-1007", customer: "Jane Doe", customerId: "cust_1", dueDate: "2026-10-03", status: "sent", amountPaid: 0, taxRate: 0, lineItems: [{ id: "l", description: "x", quantity: 1, unitPrice: 250 }] };
    const handlers = createAutomationActionHandlers(app.deps);
    const scan = (now: string) => findOverdueInvoiceEvents([invoice], automation.enabledAt, new Date(now));

    for (const event of scan("2026-10-05T12:00:00Z")) {
      expect(await executeAutomation(automation, event, { businessId: BIZ, store, handlers, now: () => new Date("2026-10-05T12:00:00Z") })).toBe("skipped");
    }
    for (const event of scan("2026-10-08T12:00:00Z")) {
      expect(await executeAutomation(automation, event, { businessId: BIZ, store, handlers, now: () => new Date("2026-10-08T12:00:00Z") })).toBe("Completed");
      expect(await executeAutomation(automation, event, { businessId: BIZ, store, handlers, now: () => new Date("2026-10-08T12:00:00Z") })).toBe("duplicate");
    }
    expect([...runs.values()].map(r => r.status).sort()).toEqual(["Completed", "Skipped"]);
    expect(app.messages).toHaveLength(1);
    expect(app.messages[0].content).toContain("INV-1007");
    expect(app.messages[0].content).toContain("$250.00");
  });
});

describe("DO: actions reuse canonical logic and stay safe", () => {
  test("validation rejects actions outside the allowlist or not applicable to the trigger", () => {
    const base = { name: "x", trigger: "invoice.paid" as const, conditions: [] };
    expect(validateAutomation({ ...base, actions: [{ id: "a", type: "issue_refund" as any }] })).toContain("Action 1: that action isn't allowed.");
    expect(validateAutomation({ ...base, actions: [{ id: "a", type: "create_job" }] })[0]).toContain("can't run on");
    expect(validateAutomation({ ...base, trigger: "job.created", actions: [{ id: "a", type: "update_status", config: { status: "Cancelled" } }] })[0]).toContain("choose one of");
    expect(validateAutomation({ ...base, actions: [] })).toContain("Add at least one DO action.");
  });

  test("Job Completed → Create Invoice builds the same invoice as the manual handoff, once", async () => {
    const job = { id: "job_5", eventType: "Job", jobNumber: "JOB-2026-0005", customer: "Jane Doe", customerId: "cust_1", sourceEstimateId: "est_1", status: "Completed", budget: 7000 } as SchedulingEvent;
    const app = memoryApp({ customers: [CUSTOMER], estimates: [{ ...ESTIMATE, status: "Accepted" }], jobs: [job] });
    const automation = enabledFromTemplate("job_completed_invoice");
    const [event] = deriveAutomationEvents({ collection: "scheduling_events", type: "updated", previous: { ...job, status: "Working" }, item: job });

    expect(await runAll([automation], [event], app, memoryStore().store)).toEqual(["Completed"]);
    // A second run (even with no run log) can't add a second open invoice.
    expect(await runAll([automation], [event], app, memoryStore().store)).toEqual(["Skipped"]);

    expect(app.invoices.value).toHaveLength(1);
    const invoice = app.invoices.value[0];
    expect(invoice).toMatchObject({ jobId: "job_5", estimateId: "est_1", customer: "Jane Doe", status: "sent", createdByAutomationId: automation.id });
    expect(invoice.lineItems).toEqual([expect.objectContaining({ description: "Estimate EST-1001", quantity: 1, unitPrice: 7200 })]);
    expect(app.journal.value).toHaveLength(1);
    expect(app.estimates.value[0].status).toBe("Completed");
    // Notify office reaches owner + managers.
    expect(app.notifications.value.map(n => n.recipientEmail).sort()).toEqual([BIZ, "mgr@example.com"].sort());
  });

  test("Create Invoice refuses to bill $0 instead of guessing", () => {
    const result = buildInvoiceFromJob({ job: { id: "j", customer: "Jane" } as SchedulingEvent, invoices: [], estimates: [], customers: [] });
    expect("error" in result).toBe(true);
  });

  test("Website emergency booking → mark lead High priority + notify managers", async () => {
    const lead = { id: "lead_web_1", name: "Sam", company: "", phone: "1", email: "", source: "Website", salesRep: "Unassigned", status: "New", estimatedValue: 0, dateAdded: "", addedDaysAgo: 0, notes: "No heat -- emergency!" } as Lead;
    const app = memoryApp({ leads: [lead] });
    const automation = enabledFromTemplate("website_emergency_priority");
    const events = deriveAutomationEvents({ collection: "leads", type: "created", item: lead });
    const outcomes = await runAll([automation], events, app, memoryStore().store);
    expect(outcomes).toContain("Completed");
    expect(app.leads.value[0].priority).toBe("High");
    expect(app.notifications.value.map(n => n.recipientEmail)).toEqual(["mgr@example.com"]);
  });

  test("Invoice Paid → Request Review creates one review request", async () => {
    const invoice = { id: "inv_2", invoiceNumber: "INV-1002", customer: "Jane Doe", customerId: "cust_1", status: "paid", amountPaid: 100, taxRate: 0, lineItems: [{ id: "l", description: "x", quantity: 1, unitPrice: 100 }] } as Invoice;
    const app = memoryApp({ customers: [CUSTOMER], invoices: [invoice] });
    const automation = enabledFromTemplate("invoice_paid_review");
    const [event] = deriveAutomationEvents({ collection: "invoices", type: "updated", previous: { ...invoice, status: "sent" }, item: invoice });
    expect(await runAll([automation], [event, event], app, memoryStore().store)).toEqual(["Completed", "duplicate"]);
    expect(app.reviewRequests.value).toHaveLength(1);
    expect(app.reviewRequests.value[0]).toMatchObject({ customerId: "cust_1", invoiceId: "inv_2", trigger: "invoice_paid", status: "Scheduled" });
  });

  test("Update Status never moves a job to Completed/Cancelled, even if a bad config slipped in", async () => {
    const appt = { id: "appt_1", eventType: "Site Visit", status: "Unassigned", customer: "Jane Doe", priority: "Medium" } as SchedulingEvent;
    const app = memoryApp({ jobs: [appt] });
    const automation: Automation = {
      ...automationFromTemplate(AUTOMATION_TEMPLATES[0]), trigger: "appointment.created", enabled: true,
      actions: [{ id: "a", type: "update_status", config: { status: "Cancelled" } }], actionTypes: ["update_status"]
    };
    const [event] = deriveAutomationEvents({ collection: "scheduling_events", type: "created", item: appt });
    expect(await runAll([automation], [event], app, memoryStore().store)).toEqual(["Failed"]);
    expect(app.schedulingEvents.value[0].status).toBe("Unassigned");
  });
});
