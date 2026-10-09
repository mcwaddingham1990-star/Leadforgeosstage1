import { beforeEach, describe, expect, test } from "vitest";
import {
  estimateBuildJobPrompt, estimatePromptKey, getBuildJobPrompts, isAcceptedEstimateStatus, requestBuildJobPrompt,
  resetBuildJobPrompts, resolveBuildJobPrompt, suppressBuildJobPrompt
} from "../src/lib/buildJobPrompts";
import type { Estimate } from "../src/types/domain";

const ESTIMATE = {
  id: "est_9", number: "EST-9", customerName: "Ann Lee", company: "", status: "Accepted", salesRep: "Owner", amount: 4200,
  createdDate: "", expirationDate: "", address: "9 Oak St", phone: "555 222 3333", projectSpecifics: "Re-pipe kitchen"
} as Estimate;

describe("build-job prompts", () => {
  beforeEach(() => resetBuildJobPrompts());

  test("signed and accepted both count as accepted", () => {
    expect(isAcceptedEstimateStatus("Signed")).toBe(true);
    expect(isAcceptedEstimateStatus("Accepted")).toBe(true);
    for (const s of ["Draft", "Sent", "Viewed", "Declined", "Completed", undefined]) expect(isAcceptedEstimateStatus(s)).toBe(false);
  });

  test("prefills the Build Job form from the estimate", () => {
    const prompt = estimateBuildJobPrompt(ESTIMATE, { id: "cust_9", email: "ann@example.com", phone: "", address: "" } as any);
    expect(prompt.key).toBe("estimate:est_9");
    expect(prompt.prefill).toMatchObject({ sourceEstimateId: "est_9", customerId: "cust_9", customerName: "Ann Lee", customerEmail: "ann@example.com", customerAddress: "9 Oak St", description: "Re-pipe kitchen", budget: 4200 });
    expect(prompt.detail).toContain("EST-9");
  });

  test("each estimate is asked about once per session, however many times acceptance is seen", () => {
    expect(requestBuildJobPrompt(estimateBuildJobPrompt(ESTIMATE))).toBe(true);
    expect(requestBuildJobPrompt(estimateBuildJobPrompt(ESTIMATE))).toBe(false);
    expect(getBuildJobPrompts()).toHaveLength(1);
    resolveBuildJobPrompt(estimatePromptKey("est_9"));
    expect(getBuildJobPrompts()).toHaveLength(0);
    expect(requestBuildJobPrompt(estimateBuildJobPrompt(ESTIMATE))).toBe(false); // answered "Later" -- not re-asked
  });

  test("Convert to Job clicked by hand suppresses the prompt for that estimate", () => {
    requestBuildJobPrompt(estimateBuildJobPrompt(ESTIMATE));
    suppressBuildJobPrompt(estimatePromptKey("est_9"));
    expect(getBuildJobPrompts()).toEqual([]);
    expect(requestBuildJobPrompt(estimateBuildJobPrompt(ESTIMATE))).toBe(false);
  });
});
