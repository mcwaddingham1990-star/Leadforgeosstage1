import { describe, expect, it } from "vitest";
import { googleSignInErrorMessage, needsGoogleOwnerLegalAcceptance } from "../src/lib/googleSignIn";

describe("Google sign-in troubleshooting", () => {
  it("explains Firebase authorized-domain problems", () => {
    expect(googleSignInErrorMessage({ code: "auth/unauthorized-domain" }, "leadforgeosstage1.onrender.com"))
      .toContain("leadforgeosstage1.onrender.com");
  });

  it("explains when Google provider is disabled", () => {
    expect(googleSignInErrorMessage({ code: "auth/operation-not-allowed" }))
      .toContain("Enable Google");
  });

  it("does not claim success or display an error on a cancelled popup", () => {
    expect(googleSignInErrorMessage({ code: "auth/popup-closed-by-user" })).toBeNull();
  });

  it("identifies old APKs without the native plugin", () => {
    expect(googleSignInErrorMessage({ code: "UNIMPLEMENTED" })).toContain("newly rebuilt");
  });

  it("shows when native Google did not provide a verified ID token", () => {
    expect(googleSignInErrorMessage(new Error("GOOGLE_ID_TOKEN_MISSING"))).toContain("SHA-1");
  });

  it("does not expose raw credentials or low-level error details", () => {
    expect(googleSignInErrorMessage(new Error("token=secret123"))).not.toContain("secret123");
  });
});

describe("New Google owner legal acceptance gate", () => {
  const googleUser = { providerData: [{ providerId: "google.com" }] };

  it("requires agreement for a Google account with no owner profile", () => {
    expect(needsGoogleOwnerLegalAcceptance(googleUser, false)).toBe(true);
  });

  it("lets a returning Google owner with an existing profile sign in normally", () => {
    expect(needsGoogleOwnerLegalAcceptance(googleUser, true)).toBe(false);
  });

  it("does not change password-only account onboarding", () => {
    expect(needsGoogleOwnerLegalAcceptance({ providerData: [{ providerId: "password" }] }, false)).toBe(false);
  });

  it("does not assume an unknown provider is Google", () => {
    expect(needsGoogleOwnerLegalAcceptance({ providerData: [] }, false)).toBe(false);
    expect(needsGoogleOwnerLegalAcceptance({}, false)).toBe(false);
  });

  it("still gates unregistered Google identities after a browser reload", () => {
    // This decision depends on Firebase's persisted provider data and the
    // existence of an owner profile, not an in-memory checkbox or loginMethod.
    expect(needsGoogleOwnerLegalAcceptance({ providerData: [{ providerId: "google.com" }] }, false)).toBe(true);
  });
});
