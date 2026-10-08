import { describe, expect, test } from "vitest";
import { agreementVisitStats, isAgreementExpiringSoon, isVisitDueSoon } from "../src/lib/serviceAgreements";

const agreement = { id: "mem_1", status: "Active", visitsIncluded: 2, startDate: "2026-01-01", endDate: "2026-12-31", nextMaintenanceDate: "2026-06-01" };

describe("agreementVisitStats", () => {
  test("no visits yet: all included visits left, next visit from the schedule", () => {
    const s = agreementVisitStats(agreement, [], []);
    expect(s.completedCount).toBe(0);
    expect(s.remaining).toBe(2);
    expect(s.nextVisitDate).toBe("2026-06-01");
    expect(s.openVisit).toBeUndefined();
  });

  test("a completed linked Job uses one visit; an open one is the next visit", () => {
    const events = [
      { id: "job_a", eventType: "Job", sourceMembershipId: "mem_1", status: "Completed", date: "2026-03-01" },
      { id: "job_b", eventType: "Job", sourceMembershipId: "mem_1", status: "Assigned", date: "2026-04-10" }
    ];
    const s = agreementVisitStats(agreement, [], events);
    expect(s.completedCount).toBe(1);
    expect(s.remaining).toBe(1);
    expect(s.openVisit?.id).toBe("job_b");
    expect(s.nextVisitDate).toBe("2026-04-10");
  });

  test("a Work Order and its calendar entry are one visit, completed by either", () => {
    const workOrders = [{ id: "wo_1", sourceMembershipId: "mem_1", status: "Scheduled", scheduledDate: "2026-02-01" }];
    const events = [{ id: "evt_wo_1", eventType: "Work Order", sourceWorkOrderId: "wo_1", status: "Completed", date: "2026-02-01" }];
    const s = agreementVisitStats(agreement, workOrders, events);
    expect(s.visits).toHaveLength(1);
    expect(s.completedCount).toBe(1);
    expect(s.remaining).toBe(1);
  });

  test("never goes below zero and ignores cancelled and other agreements' visits", () => {
    const events = [
      { id: "j1", eventType: "Job", sourceMembershipId: "mem_1", status: "Completed", date: "2026-02-01" },
      { id: "j2", eventType: "Job", sourceMembershipId: "mem_1", status: "Completed", date: "2026-03-01" },
      { id: "j3", eventType: "Job", sourceMembershipId: "mem_1", status: "Completed", date: "2026-04-01" },
      { id: "j4", eventType: "Job", sourceMembershipId: "mem_1", status: "Cancelled", date: "2026-05-01" },
      { id: "j5", eventType: "Job", sourceMembershipId: "mem_other", status: "Completed", date: "2026-05-01" }
    ];
    const s = agreementVisitStats(agreement, [], events);
    expect(s.completedCount).toBe(3);
    expect(s.remaining).toBe(0);
    expect(s.nextVisitDate).toBeUndefined();
  });

  test("a renewal's new term starts with all visits again; old visits stay in history", () => {
    const renewed = { ...agreement, startDate: "2027-01-01", endDate: "2027-12-31" };
    const events = [{ id: "j1", eventType: "Job", sourceMembershipId: "mem_1", status: "Completed", date: "2026-03-01" }];
    const s = agreementVisitStats(renewed, [], events);
    expect(s.visits).toHaveLength(1);
    expect(s.completedCount).toBe(0);
    expect(s.remaining).toBe(2);
  });

  test("renewed early: the current term keeps counting until the new term starts", () => {
    const renewedEarly = { ...agreement, startDate: "2027-01-01", endDate: "2027-12-31", previousStartDate: "2026-01-01" };
    const events = [{ id: "j1", eventType: "Job", sourceMembershipId: "mem_1", status: "Completed", date: "2026-03-01" }];
    expect(agreementVisitStats(renewedEarly, [], events, "2026-11-15").remaining).toBe(1);
    expect(agreementVisitStats(renewedEarly, [], events, "2027-01-02").remaining).toBe(2);
  });

  test("agreements without a visit limit (existing memberships) report no limit", () => {
    const s = agreementVisitStats({ id: "mem_1", status: "Active", nextMaintenanceDate: "2026-06-01" }, [], []);
    expect(s.remaining).toBeNull();
    expect(s.nextVisitDate).toBe("2026-06-01");
  });
});

describe("due soon / expiring soon", () => {
  test("visit due soon covers overdue and the next 30 days", () => {
    expect(isVisitDueSoon("2026-05-01", "2026-06-01")).toBe(true);
    expect(isVisitDueSoon("2026-06-25", "2026-06-01")).toBe(true);
    expect(isVisitDueSoon("2026-08-01", "2026-06-01")).toBe(false);
    expect(isVisitDueSoon(undefined, "2026-06-01")).toBe(false);
  });

  test("expiring soon is active, not yet ended, within 30 days", () => {
    expect(isAgreementExpiringSoon({ id: "a", status: "Active", endDate: "2026-06-20" }, "2026-06-01")).toBe(true);
    expect(isAgreementExpiringSoon({ id: "a", status: "Active", endDate: "2026-09-01" }, "2026-06-01")).toBe(false);
    expect(isAgreementExpiringSoon({ id: "a", status: "Canceled", endDate: "2026-06-20" }, "2026-06-01")).toBe(false);
    expect(isAgreementExpiringSoon({ id: "a", status: "Active", endDate: "2026-05-01" }, "2026-06-01")).toBe(false);
  });
});
