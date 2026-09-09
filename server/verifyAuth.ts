import type { Request, Response, NextFunction } from "express";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

// Verifies a Firebase Auth ID token server-side. Deliberately uses the
// Identity Toolkit REST API with the app's already-public web API key
// (firebase-applet-config.json's `apiKey` -- the same one shipped to every
// browser, see src/firebase.ts) rather than firebase-admin's verifyIdToken,
// so every route below can require a real signed-in user without depending
// on the optional FIREBASE_SERVICE_ACCOUNT_JSON secret (only push
// notifications, recurring billing, and remote signing need that). Google
// validates the token's signature/expiry/audience server-side and returns
// the account it belongs to, or an error if it's invalid/expired/forged.
const LOOKUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`;

export interface VerifiedFirebaseUser {
  uid: string;
  email: string | null;
}

export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken) return null;
  try {
    const response = await fetch(LOOKUP_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const user = data?.users?.[0];
    if (!user?.localId) return null;
    return { uid: user.localId, email: user.email || null };
  } catch {
    return null;
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      firebaseUser?: VerifiedFirebaseUser;
    }
  }
}

/** Express middleware: requires `Authorization: Bearer <Firebase ID token>`. */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = String(req.headers.authorization || "");
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const user = await verifyFirebaseIdToken(token);
  if (!user) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  req.firebaseUser = user;
  next();
}
