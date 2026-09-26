import { describe, expect, test } from "vitest";
import { calculateEstimatePricing } from "../src/lib/estimatePricing";

describe("estimate pricing", () => {
  test("calculates subtotal, discount, tax, and final total in that order", () => {
    const pricing = calculateEstimatePricing([
      { quantity: 2, unitPrice: 100 },
      { quantity: 3, unitPrice: 50 }
    ], 10, 8.25);

    expect(pricing.subtotal).toBe(350);
    expect(pricing.discountAmount).toBe(35);
    expect(pricing.taxableAmount).toBe(315);
    expect(pricing.taxAmount).toBe(25.99);
    expect(pricing.total).toBe(340.99);
  });

  test("treats missing tax and discount as zero", () => {
    expect(calculateEstimatePricing([{ quantity: 1, unitPrice: 125 }]).total).toBe(125);
  });

  test("clamps invalid percentages and negative line inputs", () => {
    const pricing = calculateEstimatePricing([
      { quantity: -2, unitPrice: 100 },
      { quantity: 1, unitPrice: -50 }
    ], 150, -5);

    expect(pricing.subtotal).toBe(0);
    expect(pricing.discountPercent).toBe(100);
    expect(pricing.taxRate).toBe(0);
    expect(pricing.total).toBe(0);
  });
});
