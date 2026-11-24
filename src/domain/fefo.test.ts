import { applyBatch } from "./batch";
import { applyLotQty, fefoDeduct } from "./fefo";
import { createSeedState } from "./seed";

describe("FEFO deduction", () => {
  const lots = [
    { id: "later", qty: 10, expirationDate: "2026-06-01", purchaseDate: "2026-01-01" },
    { id: "same-newer", qty: 8, expirationDate: "2026-01-15", purchaseDate: "2026-02-01" },
    { id: "same-older", qty: 4, expirationDate: "2026-01-15", purchaseDate: "2026-01-01" },
    { id: "empty", qty: 0, expirationDate: "2025-01-01", purchaseDate: "2025-01-01" },
    { id: "no-date", qty: 6, expirationDate: "", purchaseDate: "2024-01-01" },
  ];

  it("consumes the earliest expiration, then the oldest purchase, and never the empty lot", () => {
    const result = fefoDeduct(lots, 13);
    expect(result.deductions.map((item) => item.id)).toEqual(["same-older", "same-newer", "later"]);
    expect(result.deductions.map((item) => item.qty)).toEqual([4, 8, 1]);
    expect(result.shortage).toBe(0);
    expect(result.lots.find((lot) => lot.id === "later")?.qty).toBe(9);
    expect(result.lots.find((lot) => lot.id === "no-date")?.qty).toBe(6);
    expect(lots.find((lot) => lot.id === "later")?.qty).toBe(10);
  });

  it("records the deficit and clamps depleted lots at zero", () => {
    const result = fefoDeduct(lots, 40);
    expect(result.shortage).toBeCloseTo(40 - 28, 6);
    expect(result.lots.every((lot) => lot.qty >= 0)).toBe(true);
    expect(result.lots.filter((lot) => lot.id !== "empty").every((lot) => lot.qty === 0 || lot.id === "empty")).toBe(true);
    const applied = applyLotQty(
      result.lots.map((lot) => ({ id: lot.id, qtyRemainingG: lot.id === "later" ? 1 : 0 })),
      [{ id: "later", qty: 5 }],
      "qtyRemainingG",
    );
    expect(applied.find((lot) => lot.id === "later")?.qtyRemainingG).toBe(0);
  });

  it("deducts container units as whole counts", () => {
    const result = fefoDeduct(
      [
        { id: "a", qty: 3, expirationDate: "2026-05-01", purchaseDate: "2026-01-02" },
        { id: "b", qty: 2, expirationDate: "2026-04-01", purchaseDate: "2026-01-01" },
      ],
      6,
      "count",
    );
    expect(result.deductions).toEqual([
      { id: "b", qty: 2 },
      { id: "a", qty: 3 },
    ]);
    expect(result.shortage).toBe(1);
    expect(result.lots.every((lot) => lot.qty === 0)).toBe(true);
  });
});

describe("batch completion stock", () => {
  it("does not create negative lot balances when the bench is short", () => {
    const state = createSeedState("2026-11-24T00:00:00.000Z");
    const formula = state.formulas[0];
    const original = {
      id: "wax-1",
      ingredientId: "beeswax-yellow",
      lotCode: "WAX-1",
      supplier: "Bramble Berry",
      qtyRemainingG: 5,
      qtyOriginalG: 5,
      unitCostPerG: 0.0264,
      purchaseDate: "2026-11-01",
      expirationDate: "2027-11-01",
      notes: "",
    };
    const applied = applyBatch({
      formulaId: formula.id,
      version: formula.versions[0],
      ingredients: state.ingredients,
      containers: state.containers,
      ingredientLots: [original],
      containerLots: [],
      containerId: "tube-lip-015oz",
      scale: { mode: "weight", weightValue: 100, weightUnit: "g", containerCount: 0, fillG: 4.25, overagePct: 0 },
      lotCode: "LB-20261124-01",
      madeDate: "2026-11-24",
      notes: "",
      rdOverride: false,
    });
    expect(original.qtyRemainingG).toBe(5);
    expect(applied.ingredientLots[0].qtyRemainingG).toBe(0);
    expect(applied.ingredientLots.every((lot) => lot.qtyRemainingG >= 0)).toBe(true);
    expect(applied.containerLots.every((lot) => lot.qtyRemaining >= 0)).toBe(true);
    const wax = applied.batch.shortages.find((item) => item.id === "beeswax-yellow");
    expect(wax).toMatchObject({ needed: 20, available: 5, unit: "g" });
    expect(applied.batch.rawDeductions.reduce((sum, row) => sum + row.grams, 0)).toBe(5);
    expect(applied.batch.notes).toContain("Short stock");
  });
});
