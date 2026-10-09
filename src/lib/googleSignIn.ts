import { Capacitor } from "@capacitor/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithCredential,
  signInWithPopup,
  type Auth,
} from "firebase/auth";

/**
 * Authenticate with REAL Google credentials in both delivery modes:
 * - Browser/PWA: Firebase Auth Google popup (must be on a Firebase-authorized domain).
 * - Android Capacitor: native Google account chooser / Credential Manager, then use
 *   the returned Google ID token to establish the SAME Firebase JS Auth session
 *   the rest of Owner'sLOCAL uses (Firestore, subscription, roles and permissions).
 *
 * Do not use signInWithRedirect in an Android WebView: Google OAuth forbids
 * embedded WebView authentication, and Firebase's redirect bridge depends on
 * cross-origin storage that is routinely blocked on modern devices.
 */
export async function signInWithGoogle(auth: Auth, rememberMe: boolean): Promise<void> {
  await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);

  if (Capacitor.isNativePlatform()) {
    // The native plugin must be installed into a freshly built APK. The
    // google-services.json + SHA-1 Android OAuth setup is also required.
    // skipNativeAuth avoids maintaining a second, divergent Firebase session:
    // the verified native Google credential is used to sign in the JS SDK.
    const result = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
    });
    const idToken = result.credential?.idToken;
    if (!idToken) {
      throw new Error("GOOGLE_ID_TOKEN_MISSING");
    }
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
}

/** Display actionable, non-sensitive errors instead of a generic failure. */
export function googleSignInErrorMessage(error: unknown, hostname = ""): string | null {
  const code = String((error as { code?: string } | null)?.code || "");
  const detail = error instanceof Error ? error.message : "";
  if (["auth/popup-closed-by-user", "auth/cancelled-popup-request", "SIGN_IN_CANCELLED", "ERROR_CANCELED"].includes(code)) {
    return null;
  }
  if (code === "auth/unauthorized-domain") {
    return `Google sign-in needs Firebase Authentication → Settings → Authorized domains to include ${hostname || "this website"}.`;
  }
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is disabled in Firebase. Enable Google under Authentication → Sign-in method.";
  }
  if (code === "auth/popup-blocked") {
    return "Google account selection was blocked. Allow pop-ups or open Owner'sLOCAL in Chrome.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "This email already has a different sign-in method. Sign in with that method first to link Google.";
  }
  if (code === "auth/network-request-failed") {
    return "Cannot reach Google right now. Check your internet connection and retry.";
  }
  if (code === "auth/operation-not-supported-in-this-environment" || code === "auth/web-storage-unsupported") {
    return "Google sign-in is unavailable in this browser. Open Owner'sLOCAL in Chrome.";
  }
  if (code === "auth/invalid-credential" || code === "auth/invalid-idp-response") {
    return "Google did not provide a valid sign-in credential. Try selecting your account again.";
  }
  if (detail.includes("GOOGLE_ID_TOKEN_MISSING")) {
    return "Google did not return a usable account token. Check Android Google Sign-In setup and the app's SHA-1 fingerprint.";
  }
  if (code === "UNIMPLEMENTED" || /not implemented|not available.*native|plugin is not implemented/i.test(detail)) {
    return "This APK does not include native Google Sign-In. Install the newly rebuilt Owner'sLOCAL APK.";
  }
  return "Google sign-in failed. Check Firebase Google provider settings and try again.";
}
