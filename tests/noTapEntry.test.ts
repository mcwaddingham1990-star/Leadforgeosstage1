import { describe, expect, it } from "vitest";
import { buildProposals, describeEffect, matchInventory, tomorrowISO, type CapturedPhoto, type VoiceExtraction } from "../src/lib/noTapEntry";
import type { InventoryItem } from "../src/types/domain";

const inv = [
  { id: "pex", name: "1/2in PEX tubing", unit: "ft", unitCost: 0.5 },
  { id: "elbow", name: "PEX elbow fitting", unit: "ea", unitCost: 2 },
  { id: "tee", name: "PEX tee fitting", unit: "ea", unitCost: 2 },
  { id: "caulk", name: "Silicone caulk", unit: "tube", unitCost: 6 },
] as unknown as InventoryItem[];

const voice = (over: Partial<VoiceExtraction> = {}): VoiceExtraction => ({
  transcript: "", workPerformed: null, jobNotes: null, progressSummary: null, materials: [], followUps: [],
  customerRequests: [], changeOrders: [], partsToOrder: [], issues: [], jobFinished: false, ...over,
});

describe("matchInventory", () => {
  it("matches by words and prefers a real AI id", () => {
    expect(matchInventory("caulk", inv)).toBe("caulk");
    expect(matchInventory("PEX tubing", inv)).toBe("pex");
    expect(matchInventory("anything", inv, "tee")).toBe("tee");
    expect(matchInventory("caulk", inv, "ghost")).toBe("caulk");
  });
  it("refuses ambiguous or unknown names", () => {
    expect(matchInventory("fittings", inv)).toBeNull();
    expect(matchInventory("drywall", inv)).toBeNull();
  });
});

describe("buildProposals", () => {
  it("turns a spoken update into proposals", () => {
    const out = buildProposals(voice({
      workPerformed: "Replaced shutoff valve",
      jobNotes: "Old valve corroded",
      customerRequests: ["Add a second outdoor faucet"],
      materials: [{ name: "caulk", quantity: 2, unit: null, inventoryId: null }],
      followUps: [{ description: "Come back to check", date: "2026-10-05", time: "09:00", kind: "appointment" }, { description: "Call supplier", date: null, time: null, kind: "task" }],
      partsToOrder: [{ name: "Valve handle", quantity: 1 }],
      issues: [{ description: "Leak came back", kind: "callback" }],
      jobFinished: true,
    }), [], inv);
    const kinds = out.map(p => p.kind);
    expect(kinds).toEqual(["work", "notes", "material", "followup", "followup", "change_order", "part_order", "issue", "finish"]);
    const mat = out.find(p => p.kind === "material");
    expect(mat).toMatchObject({ inventoryId: "caulk", quantity: 2, unit: "tube", unitCost: 6, selected: true, needs: ["inventory"] });
    const [dated, undated] = out.filter(p => p.kind === "followup");
    expect(dated.selected).toBe(true);
    expect(undated.selected).toBe(false);
    // A request with no spoken change order becomes an unticked draft one.
    expect(out.find(p => p.kind === "change_order")).toMatchObject({ approved: false, selected: false });
  });

  it("keeps spoken change orders and skips request-derived ones", () => {
    const out = buildProposals(voice({ customerRequests: ["add a faucet"], changeOrders: [{ description: "Second faucet", amount: 250, customerApproved: true }] }), [], inv);
    const cos = out.filter(p => p.kind === "change_order");
    expect(cos).toHaveLength(1);
    expect(cos[0]).toMatchObject({ amount: 250, approved: true, selected: true });
  });

  it("reads equipment, receipts and materials from photos", () => {
    const photo: CapturedPhoto = {
      id: "p1", dataUrl: "data:", fileName: "r.jpg", takenAt: 0, status: "done", category: "receipt",
      analysis: { category: "receipt", caption: null, brand: "Rheem", modelNumber: "XE50", serialNumber: "Q123", equipmentType: "Water heater", receiptVendor: "Ferguson", receiptTotal: 84.5, receiptDate: "2026-10-02", materials: [{ name: "Silicone caulk", quantity: 1, unit: null }] },
    };
    const out = buildProposals(null, [photo, { ...photo, id: "p2", status: "analyzing" }], inv);
    expect(out.map(p => p.kind)).toEqual(["equipment", "expense", "material"]);
    expect(out[1]).toMatchObject({ vendor: "Ferguson", amount: 84.5, date: "2026-10-02" });
    expect(out[2]).toMatchObject({ inventoryId: "caulk", fromReceipt: true, selected: false });
  });
});

describe("describeEffect", () => {
  it("routes inventory by permission", () => {
    const [mat] = buildProposals(voice({ materials: [{ name: "caulk", quantity: 1, unit: null, inventoryId: null }] }), [], inv);
    expect(describeEffect(mat, { canDeduct: true, hasTracking: true })).toMatch(/Deducts 1/);
    expect(describeEffect(mat, { canDeduct: false, hasTracking: true })).toMatch(/Job Tracking/);
    expect(describeEffect(mat, { canDeduct: false, hasTracking: false })).toMatch(/manager/);
  });
});

it("tomorrowISO rolls over months", () => {
  expect(tomorrowISO(new Date(2026, 9, 31))).toBe("2026-11-01");
});
