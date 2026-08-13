import type { Dispatch, SetStateAction } from "react";
import type { AppNotification, EmployeeRecord, TimeClockLog } from "../types/domain";

/**
 * Owner/Manager-role heuristic, matching the same check TimeClockPage's
 * manager-verification flow and firestore.rules' isManager() already use --
 * kept in one place so "who counts as a manager" can't drift between them.
 */
export function isManagerRole(role: string | undefined): boolean {
  if (!role) return false;
  return role === "Owner" || role.toLowerCase().includes("manager");
}

/**
 * Who should be notified to review a given employee's clock in/out: their
 * specifically assigned manager if one is set, otherwise every Owner/
 * Manager-role staff member in the business, plus the account owner
 * themselves as a guaranteed fallback (the owner may not have their own
 * EmployeeRecord row).
 */
export function resolveApproverEmails(
  employee: EmployeeRecord | undefined,
  allEmployees: EmployeeRecord[],
  businessEmail: string | undefined
): string[] {
  if (employee?.assignedManagerEmail) return [employee.assignedManagerEmail];
  const emails = new Set(
    allEmployees.filter(e => isManagerRole(e.role)).map(e => e.email)
  );
  if (businessEmail) emails.add(businessEmail);
  emails.delete(employee?.email || "");
  return Array.from(emails);
}

export function buildTimeClockApprovalNotifications(params: {
  businessId: string;
  employeeName: string;
  logId: string;
  punchType: string;
  time: string;
  recipientEmails: string[];
}): AppNotification[] {
  const now = new Date().toISOString();
  return params.recipientEmails.map((recipientEmail, index) => ({
    id: `notif_tc_${params.logId}_${index}`,
    businessId: params.businessId,
    recipientEmail,
    type: "time_clock_approval",
    title: "Clock Verification Needed",
    description: `${params.employeeName} needs approval for ${params.punchType} at ${params.time}.`,
    time: params.time,
    isRead: false,
    screenId: "timeclock",
    relatedLogId: params.logId,
    actionable: true,
    createdAt: now
  }));
}

/**
 * Approves or rejects one specific pending punch -- the remote-approval
 * step, performed entirely from the manager's own already-authenticated
 * session (Time Clock page or the sidebar Alert Center), never by anyone
 * entering credentials on the employee's device. Shared by both surfaces so
 * the approval logic can't drift between them.
 */
export function resolveTimeClockApproval(params: {
  logId: string;
  decision: "approved" | "rejected";
  rejectionReason?: string;
  timeClockLogs: TimeClockLog[];
  setTimeClockLogs: Dispatch<SetStateAction<TimeClockLog[]>>;
  setNotifications: Dispatch<SetStateAction<AppNotification[]>>;
  businessId: string | undefined;
  actingUserEmail: string | undefined;
  actingUserName: string | undefined;
  logOperationalEvent?: (type: string, desc: string, icon: string) => void;
  notify?: (message: string) => void;
}): void {
  const { logId, decision, rejectionReason, timeClockLogs, setTimeClockLogs, setNotifications, businessId, actingUserEmail, actingUserName, logOperationalEvent, notify } = params;
  const targetLog = timeClockLogs.find(l => l.id === logId);
  if (!targetLog) return;
  const now = new Date().toISOString();

  setTimeClockLogs(prev => prev.map(l => l.id === logId ? {
    ...l,
    approvalStatus: decision,
    ...(decision === "approved"
      ? { approved: true, approvedBy: actingUserEmail, approvedAt: now }
      : { rejectedBy: actingUserEmail, rejectedAt: now, rejectionReason: rejectionReason || "" })
  } : l));

  setNotifications(prev => prev.map(n =>
    n.relatedLogId === logId ? { ...n, isRead: true, actionedAt: now } : n
  ));

  if (businessId) {
    setNotifications(prev => [...prev, {
      id: `notif_tc_result_${logId}_${Date.now()}`,
      businessId,
      recipientEmail: targetLog.employeeEmail,
      type: "general",
      title: decision === "approved" ? "Punch Approved" : "Punch Rejected",
      description: decision === "approved"
        ? `Your ${targetLog.type} at ${targetLog.time} on ${targetLog.date} was approved.`
        : `Your ${targetLog.type} at ${targetLog.time} on ${targetLog.date} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isRead: false,
      screenId: "timeclock",
      createdAt: now
    }]);
  }

  if (logOperationalEvent) {
    logOperationalEvent(
      decision === "approved" ? "Punch Approved" : "Punch Rejected",
      `${actingUserName || "A manager"} ${decision} ${targetLog.employeeName}'s ${targetLog.type} at ${targetLog.time}.`,
      decision === "approved" ? "✅" : "🚫"
    );
  }
  notify?.(decision === "approved" ? "Punch approved." : "Punch rejected.");
}

/**
 * Best-effort push to each recipient's registered device(s), on top of the
 * real-time in-app notification (App.tsx's Alert Center, wired to the same
 * Firestore-backed `notifications` collection these are written into).
 * Silently no-ops if push isn't configured yet -- see server/pushNotifications.ts
 * for exactly what's needed (VAPID key + Firebase service account) and how
 * this degrades gracefully without them. Never throws: a failed push must
 * never block the clock-in/out itself from completing.
 */
export async function sendPushBestEffort(recipientEmails: string[], title: string, body: string, data?: Record<string, string>): Promise<void> {
  try {
    await fetch("/api/notifications/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipientEmails, title, body, data }),
    });
  } catch {
    // Push is a nice-to-have on top of the in-app notification; never let a
    // network hiccup here surface as a clock-in/out failure to the user.
  }
}
