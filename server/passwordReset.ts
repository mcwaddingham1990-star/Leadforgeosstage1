import type { Request, Response } from "express";
// @ts-ignore
import firebaseConfig from "../firebase-applet-config.json";

const PASSWORD_RESET_URL =
  `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${firebaseConfig.apiKey}`;

function firebaseErrorMessage(payload: any): string {
  const raw = String(payload?.error?.message || "");
  if (!raw) return "Password reset failed.";
  if (raw.includes("TOO_MANY_ATTEMPTS_TRY_LATER") || raw.includes("TOO_MANY_REQUESTS")) {
    return "Too many password-reset attempts. Please wait and try again.";
  }
  if (raw.includes("QUOTA_EXCEEDED")) {
    return "The password-reset email limit has been reached for this Firebase project.";
  }
  if (raw.includes("OPERATION_NOT_ALLOWED")) {
    return "Password sign-in is not enabled for this Firebase project.";
  }
  if (raw.includes("INVALID_EMAIL")) {
    return "Enter a valid email address.";
  }
  return "Firebase could not send the password-reset email right now.";
}

/**
 * Public password-reset request endpoint.
 *
 * Firebase's browser SDK deliberately resolves successfully for unknown
 * email addresses when Email Enumeration Protection is enabled. That is a
 * good anti-enumeration behavior, but it made the OwnersLOCAL UI claim
 * "sent" even when no message could possibly arrive. Routing the actual
 * send through the server gives us reliable transport/quota/config errors
 * while still returning the SAME generic success response for an unknown
 * address so this endpoint cannot be used to enumerate registered users.
 */
export async function handlePasswordResetRequest(req: Request, res: Response) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ ok: false, error: "Enter a valid email address." });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(PASSWORD_RESET_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));

    if (response.ok) {
      res.json({ ok: true });
      return;
    }

    const firebaseCode = String(payload?.error?.message || "");
    if (firebaseCode.includes("EMAIL_NOT_FOUND")) {
      // Do not reveal whether an email is registered.
      console.warn("Password reset requested for an email with no Firebase Auth account.");
      res.json({ ok: true });
      return;
    }

    console.error("Firebase password reset request failed:", firebaseCode || response.status);
    res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({
      ok: false,
      error: firebaseErrorMessage(payload),
    });
  } catch (err) {
    console.error("Password reset transport failed:", err);
    res.status(502).json({
      ok: false,
      error: err instanceof Error && err.name === "AbortError"
        ? "Firebase did not respond in time. Please try again."
        : "Could not reach Firebase to send the password-reset email.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
