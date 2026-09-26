import { describe, expect, test } from "vitest";
import { normalizeContactPhone, normalizeEstimateCompany } from "../src/lib/contactNormalization";

describe("estimate/customer contact data normalization", () => {
  test("deduplicates the same phone repeated with different formatting", () => {
    expect(normalizeContactPhone("(817) 555-1212, 817-555-1212")).toBe("(817) 555-1212");
  });

  test("deduplicates a phone appended directly twice", () => {
    expect(normalizeContactPhone("(817) 555-1212817-555-1212")).toBe("(817) 555-1212");
  });

  test("preserves two genuinely different phone numbers", () => {
    expect(normalizeContactPhone("(817) 555-1212, (817) 555-3434")).toBe("(817) 555-1212, (817) 555-3434");
  });

  test("suppresses historical invented company fallbacks", () => {
    expect(normalizeEstimateCompany("Jane Smith", "Jane Smith Inc")).toBe("");
    expect(normalizeEstimateCompany("Jane Smith", "Jane Smith")).toBe("");
  });

  test("preserves a real company name", () => {
    expect(normalizeEstimateCompany("Jane Smith", "Smith Roofing LLC")).toBe("Smith Roofing LLC");
  });
});
