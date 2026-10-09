import { describe, expect, it } from "vitest";
import { googleSignInErrorMessage } from "../src/lib/googleSignIn";

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
