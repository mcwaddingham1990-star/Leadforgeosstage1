import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { normalizePermission, type GranularPermissions, type PermissionAction } from "../src/types/permissions";
import { callerCan, effectiveFlags, getAuthzDb, normalizeEmail, type CallerContext } from "./authz";

/**
 * Roster administration for DELEGATED roster admins (an Office Manager or
 * Manager the Owner gave Roster "Add or Edit"). Firestore rules only let the
 * actual Owner write role/permission fields directly, because rules can't
 * compare two permission maps field-by-field. These endpoints do that
 * comparison so a delegate can still manage the team without being able to
 * hand out (or keep for a second account) more power than the Owner gave
 * them:
 *
 *  - every capability granted must be one the delegate has themselves;
 *  - they can't change access for someone who has a capability they lack;
 *  - they can't create or edit an Owner, or edit their own access;
 *  - everything stays inside the delegate's own business.
 *
 * The Owner may use these too (no limits apply to them).
 */

const ACTIONS: PermissionAction[] = ["view", "edit", "delete"];
const MAX_INVITES_PER_REQUEST = 500;

const isOwnerRoleName = (role: unknown) => typeof role === "string" && role.trim().toLowerCase() === "owner";

/** Coerces client input into a clean { module: {view, edit, delete} } map. */
export function sanitizeGranular(input: unknown): GranularPermissions {
  const result: GranularPermissions = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [moduleId, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-z0-9_]{1,64}$/.test(moduleId)) continue;
    result[moduleId] = normalizePermission(value as any);
  }
  return result;
}

/** Legacy flat module list, derived from the granular map (same as the Roster UI does). */
export function modulesWithAnyAccess(granular: GranularPermissions): string[] {
  return Object.entries(granular)
    .filter(([, flags]) => ACTIONS.some(action => (flags as any)[action] === true))
    .map(([moduleId]) => moduleId);
}

/** Capabilities in `granular` the caller doesn't have, as "module:action" strings. */
export function grantsBeyondCaller(caller: CallerContext, granular: GranularPermissions): string[] {
  if (caller.isOwner) return [];
  const beyond: string[] = [];
  for (const [moduleId, flags] of Object.entries(granular)) {
    for (const action of ACTIONS) {
      if ((flags as any)[action] === true && !callerCan(caller, moduleId, action)) beyond.push(`${moduleId}:${action}`);
    }
  }
  return beyond;
}

/** Capabilities a target profile currently has that the caller doesn't. */
export function targetPowersBeyondCaller(caller: CallerContext, target: Record<string, any>): string[] {
  if (caller.isOwner) return [];
  const granular = target?.granularPermissions && typeof target.granularPermissions === "object" ? target.granularPermissions : undefined;
  const legacy: string[] | undefined = Array.isArray(target?.permissions) ? target.permissions : undefined;
  const modules = new Set<string>([...Object.keys(granular || {}), ...(legacy || [])]);
  const beyond: string[] = [];
  modules.forEach(moduleId => {
    const flags = effectiveFlags(granular, legacy, moduleId);
    for (const action of ACTIONS) {
      if (flags[action] && !callerCan(caller, moduleId, action)) beyond.push(`${moduleId}:${action}`);
    }
  });
  return beyond;
}

const describe = (items: string[]) => items.slice(0, 5).map(item => item.replace(":", " → ")).join(", ") + (items.length > 5 ? `, +${items.length - 5} more` : "");

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function inviteCodeFor(role: string): string {
  const bytes = randomBytes(6);
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  const prefix = role.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "STAFF";
  return `${prefix}-${suffix}`;
}

/**
 * POST /api/roster/employee-access
 * body: { employeeEmail, role, granularPermissions, requireTimeClockVerification? }
 */
export async function handleUpdateEmployeeAccess(req: Request, res: Response) {
  const caller = req.caller!;
  const db = getAuthzDb();
  if (!db) {
    res.status(503).json({ error: "This feature isn't configured on the server yet." });
    return;
  }
  try {
    const employeeEmail = normalizeEmail(req.body?.employeeEmail);
    const role = typeof req.body?.role === "string" ? req.body.role.trim().slice(0, 80) : "";
    const granularPermissions = sanitizeGranular(req.body?.granularPermissions);
    if (!employeeEmail || !role) {
      res.status(400).json({ error: "Employee and role are required." });
      return;
    }

    const employeeRef = db.collection("employees").doc(employeeEmail);
    const employeeSnap = await employeeRef.get();
    const employee = employeeSnap.data();
    // Never reveal whether an email exists in some other business.
    if (!employeeSnap.exists || employee?.businessEmail !== caller.businessId) {
      res.status(404).json({ error: "That employee isn't on your roster." });
      return;
    }
    if (normalizeEmail(employeeEmail) === normalizeEmail(caller.businessId)) {
      res.status(403).json({ error: "The Owner's access can't be changed." });
      return;
    }
    if (!caller.isOwner && normalizeEmail(employeeEmail) === normalizeEmail(caller.email)) {
      res.status(403).json({ error: "You can't change your own access. Ask the Owner." });
      return;
    }
    if (!caller.isOwner && (isOwnerRoleName(role) || isOwnerRoleName(employee?.role))) {
      res.status(403).json({ error: "Only the Owner can assign or change the Owner role." });
      return;
    }

    const userUid = typeof employee?.userUid === "string" ? employee.userUid : "";
    const profileRef = userUid ? db.collection("user_profiles").doc(userUid) : null;
    const profileSnap = profileRef ? await profileRef.get() : null;
    const profile = profileSnap?.data();
    if (profileRef && profile && profile.businessEmail !== caller.businessId) {
      res.status(404).json({ error: "That employee isn't on your roster." });
      return;
    }
    if (!caller.isOwner && userUid && userUid === caller.uid) {
      res.status(403).json({ error: "You can't change your own access. Ask the Owner." });
      return;
    }

    const targetBeyond = targetPowersBeyondCaller(caller, profile || employee || {});
    if (targetBeyond.length) {
      res.status(403).json({ error: `This person has access you don't (${describe(targetBeyond)}), so only the Owner can change it.` });
      return;
    }
    const grantBeyond = grantsBeyondCaller(caller, granularPermissions);
    if (grantBeyond.length) {
      res.status(403).json({ error: `You can only grant access you have yourself. Not allowed: ${describe(grantBeyond)}.` });
      return;
    }

    const access = {
      role,
      permissions: modulesWithAnyAccess(granularPermissions),
      granularPermissions,
      requireTimeClockVerification: req.body?.requireTimeClockVerification === true,
    };
    const batch = db.batch();
    batch.set(employeeRef, { ...access, updatedAt: new Date().toISOString(), accessUpdatedBy: caller.email }, { merge: true });
    if (profileRef && profile) batch.set(profileRef, access, { merge: true });
    await batch.commit();
    res.json({ ok: true, ...access });
  } catch (err) {
    console.error("Employee access update failed:", err);
    res.status(500).json({ error: "Couldn't save that employee's access. Nothing was changed." });
  }
}

type InviteInput = {
  role?: unknown;
  granularPermissions?: unknown;
  requireTimeClockVerification?: unknown;
  gpsTrackingEnabled?: unknown;
  prefilledName?: unknown;
  prefilledEmail?: unknown;
  prefilledPhone?: unknown;
};

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

/**
 * POST /api/roster/invites
 * body: { invites: InviteInput[] }  ->  { ok, invites: [{ code, role }] }
 */
export async function handleCreateEmployeeInvites(req: Request, res: Response) {
  const caller = req.caller!;
  const db = getAuthzDb();
  if (!db) {
    res.status(503).json({ error: "This feature isn't configured on the server yet." });
    return;
  }
  try {
    const inputs: InviteInput[] = Array.isArray(req.body?.invites) ? req.body.invites : [];
    if (!inputs.length || inputs.length > MAX_INVITES_PER_REQUEST) {
      res.status(400).json({ error: `Send between 1 and ${MAX_INVITES_PER_REQUEST} invites.` });
      return;
    }
    const prepared = [];
    for (const input of inputs) {
      const role = text(input.role, 80);
      if (!role) {
        res.status(400).json({ error: "Every invite needs a role." });
        return;
      }
      if (!caller.isOwner && isOwnerRoleName(role)) {
        res.status(403).json({ error: "Only the Owner can invite another Owner." });
        return;
      }
      const granularPermissions = sanitizeGranular(input.granularPermissions);
      const beyond = grantsBeyondCaller(caller, granularPermissions);
      if (beyond.length) {
        res.status(403).json({ error: `You can only grant access you have yourself. Not allowed for ${role}: ${describe(beyond)}.` });
        return;
      }
      prepared.push({ role, granularPermissions, input });
    }

    const created: Array<{ code: string; role: string }> = [];
    for (const { role, granularPermissions, input } of prepared) {
      // create() fails if the code already exists, so a collision can never
      // overwrite someone else's invite; retry with a fresh code.
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = inviteCodeFor(role);
        try {
          await db.collection("employee_invites").doc(code).create({
            code,
            role,
            businessEmail: caller.businessId,
            permissions: modulesWithAnyAccess(granularPermissions),
            granularPermissions,
            requireTimeClockVerification: input.requireTimeClockVerification === true,
            gpsTrackingEnabled: input.gpsTrackingEnabled === true,
            status: "pending",
            createdAt: new Date().toISOString(),
            createdBy: caller.email,
            ...(text(input.prefilledName, 120) ? { prefilledName: text(input.prefilledName, 120) } : {}),
            ...(text(input.prefilledEmail, 200) ? { prefilledEmail: text(input.prefilledEmail, 200) } : {}),
            ...(text(input.prefilledPhone, 40) ? { prefilledPhone: text(input.prefilledPhone, 40) } : {}),
          });
          created.push({ code, role });
          break;
        } catch (err: any) {
          const alreadyExists = err?.code === 6 || /already exists/i.test(String(err?.message || ""));
          if (!alreadyExists || attempt === 4) throw err;
        }
      }
    }
    res.json({ ok: true, invites: created });
  } catch (err) {
    console.error("Creating employee invites failed:", err);
    res.status(500).json({ error: "Couldn't create the invite code(s). Please try again." });
  }
}
