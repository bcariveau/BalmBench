import { GRAMS_PER_OZ } from "./format";
import { gramsForPct, scaleFormula } from "./scale";

const lines = [
  { ingredientId: "beeswax-yellow", pct: 20, phase: "oil" as const },
  { ingredientId: "castor-oil", pct: 80, phase: "oil" as const },
];

describe("percentage scaling", () => {
  it("converts ounces and applies percentages to a target batch weight", () => {
    expect(gramsForPct(100, 20)).toBe(20);
    const byWeight = scaleFormula(lines, {
      mode: "weight",
      weightValue: 2,
      weightUnit: "oz",
      containerCount: 0,
      fillG: 4.25,
      overagePct: 0,
    });
    expect(byWeight.batchG).toBeCloseTo(2 * GRAMS_PER_OZ, 6);
    expect(byWeight.lines[0].grams).toBeCloseTo(0.2 * 2 * GRAMS_PER_OZ, 6);
    expect(byWeight.units).toBe(Math.floor(byWeight.batchG / 4.25));
  });

  it("scales container count by fill weight and pouring overage", () => {
    const scaled = scaleFormula(lines, {
      mode: "count",
      weightValue: 0,
      weightUnit: "g",
      containerCount: 10,
      fillG: 4.25,
      overagePct: 5,
    });
    expect(scaled.units).toBe(10);
    expect(scaled.batchG).toBeCloseTo(10 * 4.25 * 1.05, 6);
    expect(scaled.lines[0].grams).toBeCloseTo(scaled.batchG * 0.2, 6);
    expect(scaled.lines[1].grams).toBeCloseTo(scaled.batchG * 0.8, 6);
  });

  it("ignores negative inputs", () => {
    const scaled = scaleFormula(lines, {
      mode: "count",
      weightValue: -20,
      weightUnit: "g",
      containerCount: -3,
      fillG: -4,
      overagePct: -5,
    });
    expect(scaled.batchG).toBe(0);
    expect(scaled.units).toBe(0);
    expect(scaled.lines.every((line) => line.grams === 0)).toBe(true);
  });
});
