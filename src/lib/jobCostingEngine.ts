import type { SchedulingEvent, Estimate, TimeClockLog, EmployeeRecord, Transaction } from "../types/domain";
import { computePayrollHoursForRange } from "./payrollHours";

export interface JobCostBreakdown {
  estimatedRevenue: number;
  laborHours: number;
  laborCost: number;
  materialCost: number;
  otherCost: number;
  totalCost: number;
  grossProfit: number;
  /** null when there's no revenue basis yet (no estimate/budget) to measure against. */
  marginPercent: number | null;
}

// Wide enough to cover every real time clock log against a job without
// needing the job's own creation date as a lower bound.
const EARLIEST = "2000-01-01";
const LATEST = "2999-12-31";

/**
 * Actual job profitability from the same linked records already shown
 * elsewhere on the job (Materials & Inventory section, Time Clock, Log
 * Transaction) -- nothing here is a duplicate record, it's a read-time
 * rollup: Estimated Revenue - Labor - Materials - Other Costs = Gross Profit.
 *
 * Labor reuses computePayrollHoursForRange (the same regular/overtime split
 * payroll runs use), scoped to just this job's time_clock_logs. One caveat:
 * overtime here is evaluated within this job's hours alone, not across an
 * employee's whole workweek -- if they also worked other jobs that week,
 * real payroll may allocate OT differently than this per-job estimate does.
 * Materials reuse job.materials[] (same field JobsPage already reduces for
 * its "Materials Used" tile). Other costs are job-linked expense
 * Transactions (Transaction.jobId, set from the Log Expense form), excluding
 * payroll-sourced transactions so labor isn't counted twice.
 */
export function computeJobCosting(
  job: SchedulingEvent,
  estimates: Estimate[],
  timeClockLogs: TimeClockLog[],
  employees: EmployeeRecord[],
  transactions: Transaction[]
): JobCostBreakdown {
  const estimatedRevenue = estimates.find(e => e.id === job.sourceEstimateId)?.amount || job.budget || 0;

  const jobLogs = timeClockLogs.filter(l => l.jobId === job.id);
  const employeeEmails = Array.from(new Set(jobLogs.map(l => l.employeeEmail)));
  let laborHours = 0;
  let laborCost = 0;
  for (const email of employeeEmails) {
    const rate = employees.find(e => e.email === email)?.hourlyRate;
    if (!rate) continue;
    const { hours, regularHours, overtimeHours } = computePayrollHoursForRange(
      jobLogs.filter(l => l.employeeEmail === email), EARLIEST, LATEST, 0
    );
    laborHours += hours;
    laborCost += regularHours * rate + overtimeHours * rate * 1.5;
  }

  const materialCost = (job.materials || []).reduce((s, m) => s + m.quantity * m.unitCost, 0);

  const otherCost = transactions
    .filter(t => t.type === "expense" && t.jobId === job.id && t.source !== "payroll")
    .reduce((s, t) => s + t.amount, 0);

  const totalCost = laborCost + materialCost + otherCost;
  const grossProfit = estimatedRevenue - totalCost;
  const marginPercent = estimatedRevenue > 0 ? (grossProfit / estimatedRevenue) * 100 : null;

  return { estimatedRevenue, laborHours, laborCost, materialCost, otherCost, totalCost, grossProfit, marginPercent };
}
