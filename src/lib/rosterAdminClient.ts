import { doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { authedFetch } from "./apiClient";
import type { GranularPermissions } from "../types/permissions";
import type { EmployeeRecord } from "../types/domain";

/**
 * Invites and employee role/permission changes.
 *
 * The Owner writes these directly (Firestore rules allow the Owner anything in
 * their own business). Anyone else -- an Office Manager or Manager the Owner
 * gave Roster access -- goes through the server, which only lets them grant
 * permissions they have themselves. Firestore rules refuse a delegate's direct
 * write of role/permission fields, so this is the only path that works for
 * them, and it can't be used to escalate.
 */

export interface InviteDraft {
  /** Used for the Owner's direct write; the server generates its own codes. */
  code: string;
  role: string;
  permissions: string[];
  granularPermissions: GranularPermissions;
  requireTimeClockVerification?: boolean;
  gpsTrackingEnabled?: boolean;
  prefilledName?: string;
  prefilledEmail?: string;
  prefilledPhone?: string;
}

const normalize = (value: string | undefined | null) => (value || "").trim().toLowerCase();

/** Same test the rules and server use: the Owner's own email is the business id. */
export function isBusinessOwner(loggedInEmail: string | undefined | null, businessId: string | undefined | null): boolean {
  return !!businessId && normalize(loggedInEmail) === normalize(businessId);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await authedFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "The server refused this change.");
  return data as T;
}

/** Creates invites; returns the code actually saved for each (in order). */
export async function createEmployeeInvites(params: {
  isOwner: boolean;
  businessId: string;
  invites: InviteDraft[];
}): Promise<Array<{ code: string; role: string }>> {
  if (!params.isOwner) {
    const result = await postJson<{ invites: Array<{ code: string; role: string }> }>("/api/roster/invites", {
      invites: params.invites.map(({ code: _code, permissions: _permissions, ...rest }) => rest),
    });
    return result.invites;
  }
  const created: Array<{ code: string; role: string }> = [];
  for (const invite of params.invites) {
    const { prefilledName, prefilledEmail, prefilledPhone, ...core } = invite;
    await setDoc(doc(db, "employee_invites", invite.code), {
      ...core,
      requireTimeClockVerification: !!invite.requireTimeClockVerification,
      gpsTrackingEnabled: !!invite.gpsTrackingEnabled,
      businessEmail: params.businessId,
      status: "pending",
      createdAt: new Date().toISOString(),
      ...(prefilledName !== undefined ? { prefilledName } : {}),
      ...(prefilledEmail !== undefined ? { prefilledEmail } : {}),
      ...(prefilledPhone !== undefined ? { prefilledPhone } : {}),
    });
    created.push({ code: invite.code, role: invite.role });
  }
  return created;
}

const ACCESS_FIELDS = ["role", "permissions", "granularPermissions"] as const;

/** Saves an employee edit from the Roster editor. */
export async function saveEmployeeAccess(params: {
  isOwner: boolean;
  businessId: string;
  employee: EmployeeRecord & { permissions: string[] };
}): Promise<void> {
  const { employee, businessId } = params;
  const updatedAt = new Date().toISOString();

  if (params.isOwner) {
    // Role/permission edits must be one atomic server operation. The roster
    // record is what the Owner sees; user_profiles is what the employee
    // actually receives on their next login. Saving them separately can
    // leave those two sources disagreeing after a network failure.
    const batch = writeBatch(db);
    batch.set(doc(db, "employees", employee.email), { ...employee, businessEmail: businessId, businessId, updatedAt }, { merge: true });
    if (employee.userUid) {
      batch.set(doc(db, "user_profiles", employee.userUid), {
        role: employee.role,
        permissions: employee.permissions,
        granularPermissions: employee.granularPermissions,
        requireTimeClockVerification: !!employee.requireTimeClockVerification,
      }, { merge: true });
    }
    await batch.commit();
    return;
  }

  // Delegate: access goes through the server's no-escalation check first, so
  // a refused grant leaves nothing half-saved; then the ordinary roster fields.
  await postJson("/api/roster/employee-access", {
    employeeEmail: employee.email,
    role: employee.role,
    granularPermissions: employee.granularPermissions || {},
    requireTimeClockVerification: !!employee.requireTimeClockVerification,
  });
  const rest: Record<string, unknown> = { ...employee };
  ACCESS_FIELDS.forEach(field => delete rest[field]);
  delete rest.userUid;
  delete rest.email;
  await setDoc(doc(db, "employees", employee.email), { ...rest, businessEmail: businessId, updatedAt }, { merge: true });
}
