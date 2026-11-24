import { cogsFromDeductions, computeCogs, marginFromPrice, priceFromMargin } from "./cogs";

describe("COGS", () => {
  it("sums ingredient, container, and label costs into batch and unit cost", () => {
    const estimated = computeCogs({
      lines: [
        { grams: 10, costPerG: 0.5 },
        { grams: 5, costPerG: 0.2 },
      ],
      units: 4,
      containerUnitCost: 0.17,
      labelMisc: 1,
    });
    expect(estimated.ingredient).toBe(6);
    expect(estimated.container).toBeCloseTo(0.68, 4);
    expect(estimated.batch).toBeCloseTo(7.68, 4);
    expect(estimated.unit).toBeCloseTo(1.92, 4);
  });

  it("prices a completed batch from the lots that were actually deducted", () => {
    const actual = cogsFromDeductions({
      raw: [
        { grams: 20, unitCostPerG: 0.0264 },
        { grams: 12, unitCostPerG: 0.0323 },
      ],
      containers: [{ units: 20, unitCostUsd: 0.17 }],
      labelMisc: 0.4,
      unitsProduced: 20,
    });
    const ingredient = 20 * 0.0264 + 12 * 0.0323;
    const container = 20 * 0.17;
    expect(actual.ingredient).toBeCloseTo(ingredient, 4);
    expect(actual.container).toBeCloseTo(container, 4);
    expect(actual.batch).toBeCloseTo(ingredient + container + 0.4, 4);
    expect(actual.unit).toBeCloseTo((ingredient + container + 0.4) / 20, 4);
  });

  it("converts between target margin and price", () => {
    expect(priceFromMargin(2, 50)).toBe(4);
    expect(marginFromPrice(2, 4)).toBe(50);
    expect(computeCogs({ lines: [], units: 0, containerUnitCost: 1 }).unit).toBe(0);
  });
});
