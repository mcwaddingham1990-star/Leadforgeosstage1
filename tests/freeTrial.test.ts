import { describe, expect, test } from "vitest";
import { FREE_TRIAL_DAYS, freeTrialDaysLeft, freeTrialEndsAt, isFreeTrialActive } from "../src/lib/freeTrial";

const DAY = 24 * 60 * 60 * 1000;
const signup = Date.parse("2026-10-01T15:00:00Z");

describe("free trial", () => {
  test("lasts 7 days from the owner's signup", () => {
    expect(FREE_TRIAL_DAYS).toBe(7);
    expect(freeTrialEndsAt(signup)).toBe(signup + 7 * DAY);
  });

  test("active until the end moment, then over", () => {
    const ends = freeTrialEndsAt(signup);
    expect(isFreeTrialActive(ends, signup)).toBe(true);
    expect(isFreeTrialActive(ends, ends - 1)).toBe(true);
    expect(isFreeTrialActive(ends, ends)).toBe(false);
    expect(isFreeTrialActive(ends, ends + DAY)).toBe(false);
  });

  test("no trial when the end can't be determined", () => {
    expect(isFreeTrialActive(null, signup)).toBe(false);
    expect(isFreeTrialActive(undefined, signup)).toBe(false);
    expect(freeTrialDaysLeft(null, signup)).toBe(0);
  });

  test("days left rounds up and hits 0 when over", () => {
    const ends = freeTrialEndsAt(signup);
    expect(freeTrialDaysLeft(ends, signup)).toBe(7);
    expect(freeTrialDaysLeft(ends, signup + 1)).toBe(7);
    expect(freeTrialDaysLeft(ends, ends - DAY - 1)).toBe(2);
    expect(freeTrialDaysLeft(ends, ends - 1)).toBe(1);
    expect(freeTrialDaysLeft(ends, ends)).toBe(0);
  });

  test("accounts older than 7 days (all existing businesses) have no trial", () => {
    const longAgo = Date.parse("2026-01-01T00:00:00Z");
    expect(isFreeTrialActive(freeTrialEndsAt(longAgo), Date.parse("2026-10-08T00:00:00Z"))).toBe(false);
  });
});

import { normalizeTrialAddress, normalizeTrialBusinessName, normalizeTrialEmail, normalizeTrialPhone, sharedTrialField, trialIdentityKeys } from "../src/lib/freeTrial";

describe("one trial per business: matching", () => {
  test("phones compare digits only, with or without the US 1", () => {
    for (const p of ["(555) 201-4432", "555.201.4432", "+1 555 201 4432", "15552014432"]) expect(normalizeTrialPhone(p)).toBe("5552014432");
    expect(normalizeTrialPhone("12")).toBeNull();
  });

  test("business names ignore case, punctuation and LLC/Inc endings", () => {
    const base = normalizeTrialBusinessName("Smith Plumbing");
    for (const n of ["SMITH PLUMBING, LLC", "Smith Plumbing Inc.", "smith-plumbing", "The Smith Plumbing Co"]) expect(normalizeTrialBusinessName(n)).toBe(base);
    expect(normalizeTrialBusinessName("Jones Plumbing")).not.toBe(base);
    expect(normalizeTrialBusinessName("A")).toBeNull();
  });

  test("addresses treat Street/St, Suite/#, North/N as the same", () => {
    const base = normalizeTrialAddress("4400 Ridgeview Dr, Suite 3, Haslet TX");
    for (const a of ["4400 ridgeview drive ste 3 haslet tx", "4400 Ridgeview Dr. #3, Haslet, TX"]) expect(normalizeTrialAddress(a)).toBe(base);
    expect(normalizeTrialAddress("12 N Main St")).toBe(normalizeTrialAddress("12 North Main Street"));
    expect(normalizeTrialAddress("4401 Ridgeview Dr")).not.toBe(normalizeTrialAddress("4400 Ridgeview Dr"));
    expect(normalizeTrialAddress("TX")).toBeNull();
  });

  test("emails ignore +tags and Gmail dots", () => {
    expect(normalizeTrialEmail("John.Smith+trial2@Gmail.com")).toBe("johnsmith@gmail.com");
    expect(normalizeTrialEmail("john.smith@googlemail.com")).toBe("johnsmith@gmail.com");
    expect(normalizeTrialEmail("john.smith+x@company.com")).toBe("john.smith@company.com");
    expect(normalizeTrialEmail("not-an-email")).toBeNull();
  });

  test("businesses share a key when any of phone, name, address or email match", () => {
    const original = trialIdentityKeys({ ownerEmail: "bob@gmail.com", businessNames: ["Bob's HVAC LLC"], businessPhones: ["(555) 111-2222"], businessAddresses: ["10 Elm Street"] });
    expect(sharedTrialField(trialIdentityKeys({ ownerEmail: "new1@x.com", businessPhones: ["555-111-2222"] }), original)).toBe("phone");
    expect(sharedTrialField(trialIdentityKeys({ ownerEmail: "new2@x.com", businessNames: ["Bobs HVAC"] }), original)).toBe("business name");
    expect(sharedTrialField(trialIdentityKeys({ ownerEmail: "new3@x.com", businessAddresses: ["10 Elm St."] }), original)).toBe("address");
    expect(sharedTrialField(trialIdentityKeys({ ownerEmail: "b.o.b+2@gmail.com" }), original)).toBe("email");
    expect(sharedTrialField(trialIdentityKeys({ ownerEmail: "someone@else.com", businessNames: ["Different Co"], ownerPhones: ["555-999-0000"], businessAddresses: ["99 Oak Ave"] }), original)).toBeNull();
  });
});
