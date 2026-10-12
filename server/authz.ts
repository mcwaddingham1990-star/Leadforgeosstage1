import type { Request, Response, NextFunction } from "express";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";
import {
  normalizePermission,
  type GranularPermissions,
  type PermissionAction,
  type PermissionFlags,
} from "../src/types/permissions";

/**
 * Server-side role/permission enforcement, mirroring firestore.rules'
 * hasModulePermission() exactly so the backend and the database agree:
 *
 *  - The tenant is ALWAYS re-derived from the caller's own user_profiles doc
 *    (never from the request body), so no endpoint can be pointed at another
 *    business.
 *  - The Owner is the account whose verified auth email IS the business id
 *    (same test as the rules) and has every capability in their business.
 *  - Everyone else (Office Manager, Manager, Employee...) has exactly what the
 *    Owner granted in the Permission Bank: an explicit granularPermissions
 *    entry is authoritative; older profiles fall back to the legacy
 *    permissions[] list for View / Add-or-Edit only, never Delete. A role
 *    NAME never grants anything by itself.
 */

let adminApp: App | null | undefined;
function getAdminApp(): App | null {
  if (adminApp !== undefined) return adminApp;
  if (getApps().length) {
    adminApp = getApps()[0]!;
    return adminApp;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    adminApp = null;
    return adminApp;
  }
  try {
    adminApp = initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be used for authorization checks:", err);
    adminApp = null;
  }
  return adminApp;
}

export function getAuthzDb(): Firestore | null {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app, process.env.FIREBASE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || "(default)");
}

export interface CallerContext {
  uid: string;
  email: string;
  businessId: string;
  isOwner: boolean;
  role: string;
  granularPermissions: GranularPermissions | undefined;
  legacyPermissions: string[] | undefined;
}

export const normalizeEmail = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

/** Builds the caller's authorization context from their own profile. */
export function callerFromProfile(uid: string, email: string | null | undefined, profile: Record<string, any> | undefined): CallerContext | null {
  const businessId = typeof profile?.businessEmail === "string" ? profile.businessEmail : "";
  if (!businessId) return null;
  const callerEmail = typeof email === "string" ? email : "";
  return {
    uid,
    email: callerEmail,
    businessId,
    // Exactly the rules' owner test: token email == businessId.
    isOwner: !!callerEmail && callerEmail === businessId,
    role: typeof profile?.role === "string" ? profile.role : "",
    granularPermissions: profile?.granularPermissions && typeof profile.granularPermissions === "object" ? profile.granularPermissions : undefined,
    legacyPermissions: Array.isArray(profile?.permissions) ? profile.permissions : undefined,
  };
}

export async function loadCaller(db: Firestore, uid: string, email: string | null | undefined): Promise<CallerContext | null> {
  const snap = await db.collection("user_profiles").doc(uid).get();
  return callerFromProfile(uid, email, snap.data());
}

/** The permissions a non-owner profile actually has for one module (rules' employeeHasModulePermission). */
export function effectiveFlags(
  granular: GranularPermissions | undefined,
  legacy: string[] | undefined,
  moduleId: string
): PermissionFlags {
  const hasExplicit = !!granular && Object.prototype.hasOwnProperty.call(granular, moduleId);
  if (hasExplicit) return normalizePermission(granular![moduleId]);
  const legacyAllowed = !!legacy?.includes(moduleId);
  return { view: legacyAllowed, edit: legacyAllowed, delete: false };
}

export function callerCan(caller: CallerContext, moduleId: string, action: PermissionAction): boolean {
  if (caller.isOwner) return true;
  return effectiveFlags(caller.granularPermissions, caller.legacyPermissions, moduleId)[action];
}

export function callerCanAny(caller: CallerContext, checks: Array<[string, PermissionAction]>): boolean {
  return checks.some(([moduleId, action]) => callerCan(caller, moduleId, action));
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      caller?: CallerContext;
    }
  }
}

/**
 * Express middleware (after requireAuth): resolves the caller's business and
 * permissions, and rejects with 403 unless at least one of `checks` passes.
 * `"owner"` requires the actual business Owner.
 */
export function requirePermission(checks: Array<[string, PermissionAction]> | "owner" | "member", deniedMessage?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getAuthzDb();
      if (!db) {
        res.status(503).json({ error: "This feature isn't configured on the server yet." });
        return;
      }
      const user = req.firebaseUser;
      if (!user) {
        res.status(401).json({ error: "Sign in required." });
        return;
      }
      const caller = await loadCaller(db, user.uid, user.email);
      if (!caller) {
        res.status(403).json({ error: "Your account isn't linked to a business yet." });
        return;
      }
      const allowed = checks === "member"
        ? true
        : checks === "owner"
          ? caller.isOwner
          : callerCanAny(caller, checks);
      if (!allowed) {
        res.status(403).json({ error: deniedMessage || "Your role doesn't have permission to do that. Ask the business Owner to grant it in Roles & Permissions." });
        return;
      }
      req.caller = caller;
      next();
    } catch (err) {
      console.error("Permission check failed:", err);
      res.status(500).json({ error: "Couldn't verify your permissions. Please try again." });
    }
  };
}
