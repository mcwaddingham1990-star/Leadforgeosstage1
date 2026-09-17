import type { Request, Response } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// A manually-issued escape hatch around the real Stripe paywall -- one
// shared code (set/rotated only by the platform admin account below) that
// any business can redeem to unlock full access for 30 days, no payment
// involved. Meant for comped accounts, testers, and anyone the admin wants
// to let in without going through Stripe.
//
// SECURITY: the code is never stored in plaintext, and the hash lives in
// app_config/paywall_bypass -- a collection deliberately left unmatched in
// firestore.rules (default-deny for every client), so it's only ever
// reachable through this file's own Admin SDK calls, same as
// business_relationships/business_invite_codes in customerAccounts.ts. The
// redemption RESULT (bypassActive/bypassExpiresAt) is written onto the
// business's own business_profiles/{businessId} doc -- but firestore.rules
// now blocks a business's own client from setting those fields directly
// (see the SECURITY comment on that collection's rule), so the only way to
// turn bypassActive on is to actually know the real code and go through
// handleRedeemBypassCode below.
const ADMIN_BUSINESS_EMAIL = "the.owner@ownerslocal.com";
const BYPASS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CONFIG_DOC_PATH = ["app_config", "paywall_bypass"] as const;
const SCRYPT_KEYLEN = 64;

export function isAdminBusinessId(businessId: string | null | undefined): boolean {
  return !!businessId && businessId.trim().toLowerCase() === ADMIN_BUSINESS_EMAIL;
}

let adminApp: App | null | undefined;
function getAdminApp(): App | null {
  if (adminApp !== undefined) return adminApp;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    adminApp = null;
    return adminApp;
  }
  try {
    adminApp = getApps().length ? getApps()[0]! : initializeApp({ credential: cert(JSON.parse(raw)) });
  } catch (err) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is set but could not be parsed/used for the paywall bypass:", err);
    adminApp = null;
  }
  return adminApp;
}

function getDb() {
  const app = getAdminApp();
  if (!app) return null;
  return getFirestore(app, firebaseConfig.firestoreDatabaseId || "(default)");
}

async function resolveCallerBusinessId(uid: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const snap = await db.collection("user_profiles").doc(uid).get();
  const businessEmail = snap.data()?.businessEmail;
  return typeof businessEmail === "string" && businessEmail ? businessEmail : null;
}

/** scrypt with a random per-code salt -- Node's built-in crypto, no extra dependency. Stored as "salt:derivedKeyHex". */
function hashCode(code: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(code, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${derived}`;
}

function verifyCode(code: string, stored: string): boolean {
  const [salt, derivedHex] = stored.split(":");
  if (!salt || !derivedHex) return false;
  const expected = Buffer.from(derivedHex, "hex");
  const actual = scryptSync(code, salt, SCRYPT_KEYLEN);
  // Lengths must match before timingSafeEqual will even compare -- both
  // sides are always SCRYPT_KEYLEN bytes here, but guard it explicitly
  // rather than let a corrupt stored hash throw.
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/** POST /api/paywall/redeem -- any signed-in account can try a code against their own business. */
export async function handleRedeemBypassCode(req: Request, res: Response) {
  try {
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!code) {
      res.status(400).json({ error: "Enter an access code." });
      return;
    }
    const businessId = await resolveCallerBusinessId(req.firebaseUser!.uid);
    const db = getDb();
    if (!businessId || !db) {
      res.status(503).json({ error: "Your account has no business linked yet." });
      return;
    }

    const configSnap = await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).get();
    const storedHash = configSnap.data()?.codeHash;
    if (typeof storedHash !== "string" || !storedHash) {
      res.status(503).json({ error: "No access code has been set up yet." });
      return;
    }
    if (!verifyCode(code, storedHash)) {
      res.status(401).json({ error: "That access code isn't valid." });
      return;
    }

    const expiresAt = Date.now() + BYPASS_DURATION_MS;
    await db.collection("business_profiles").doc(businessId).set(
      { bypassActive: true, bypassExpiresAt: expiresAt },
      { merge: true }
    );
    res.json({ success: true, bypassExpiresAt: expiresAt });
  } catch (err) {
    console.error("Error redeeming paywall bypass code:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not redeem that code." });
  }
}

/** POST /api/paywall/set-code -- admin-only (the real, signed-in owner of the.owner@ownerslocal.com's own business). */
export async function handleSetBypassCode(req: Request, res: Response) {
  try {
    const businessId = await resolveCallerBusinessId(req.firebaseUser!.uid);
    // Owner-only, not "any member of the admin business" -- an employee
    // invited into the admin account shouldn't be able to rotate the
    // platform-wide bypass code. The caller's own auth email (not their
    // resolved businessId, which an employee also inherits) has to be the
    // admin email itself.
    const callerEmail = (req.firebaseUser!.email || "").trim().toLowerCase();
    if (!isAdminBusinessId(businessId) || callerEmail !== ADMIN_BUSINESS_EMAIL) {
      res.status(403).json({ error: "Only the platform admin account can change the access code." });
      return;
    }
    const newCode = typeof req.body?.newCode === "string" ? req.body.newCode.trim() : "";
    if (newCode.length < 6) {
      res.status(400).json({ error: "Access code must be at least 6 characters." });
      return;
    }
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: "Not configured on this server yet." });
      return;
    }
    await db.collection(CONFIG_DOC_PATH[0]).doc(CONFIG_DOC_PATH[1]).set(
      { codeHash: hashCode(newCode), updatedAt: Date.now(), updatedBy: callerEmail },
      { merge: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Error setting paywall bypass code:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Could not set the access code." });
  }
}
