import { buildInciItems, formatInciList, inciExportRule, inciKey, moveMinorOrder } from "./inci";
import { createSeedState } from "./seed";
import type { FormulaVersion, Ingredient } from "../types";

const state = createSeedState("2026-11-23T00:00:00.000Z");

function version(ingredients: FormulaVersion["ingredients"], minorOrder: string[] = []): FormulaVersion {
  return {
    ...state.formulas[0].versions[0],
    ingredients,
    inciMinorOrder: minorOrder,
  };
}

describe("INCI export ordering", () => {
  it("sorts ingredients at or above 1% by weight, merges duplicates, and expands blends", () => {
    const items = buildInciItems(
      version([
        { ingredientId: "distilled-water", pct: 70, phase: "water" },
        { ingredientId: "beeswax-yellow", pct: 8, phase: "oil" },
        { ingredientId: "beeswax-white", pct: 4, phase: "oil" },
        { ingredientId: "olivem-1000", pct: 6, phase: "oil" },
        { ingredientId: "sweet-almond-oil", pct: 10.2, phase: "oil" },
        { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
        { ingredientId: "vitamin-e-t50", pct: 0.3, phase: "cool_down" },
        { ingredientId: "eo-lavender", pct: 0.5, phase: "cool_down" },
      ]),
      state.ingredients,
      { waterName: "Aqua", showCommonNames: false },
    );
    const above = items.filter((item) => !item.below).map((item) => item.inciName);
    expect(above[0]).toBe("Aqua");
    expect(items.find((item) => inciKey(item.inciName) === "cera alba")?.pct).toBe(12);
    expect(above).toContain("Cetearyl Olivate");
    expect(above).toContain("Sorbitan Olivate");
    expect(above).toContain("Phenoxyethanol");
    expect(above.indexOf("Prunus Amygdalus Dulcis (Sweet Almond) Oil")).toBeLessThan(above.indexOf("Cetearyl Olivate"));
    const weights = items.filter((item) => !item.below).map((item) => item.pct);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(items.filter((item) => item.below).every((item) => item.pct < 1)).toBe(true);
  });

  it("keeps a custom order for ingredients below 1% and can rename water", () => {
    const minor = [inciKey("Lavandula Angustifolia (Lavender) Oil"), inciKey("Tocopherol")];
    const reversed = moveMinorOrder(minor, minor[1], -1);
    const items = buildInciItems(
      version(
        [
          { ingredientId: "distilled-water", pct: 99.2, phase: "water" },
          { ingredientId: "vitamin-e-t50", pct: 0.3, phase: "cool_down" },
          { ingredientId: "eo-lavender", pct: 0.5, phase: "cool_down" },
        ],
        reversed,
      ),
      state.ingredients,
      { waterName: "Water (Aqua)", showCommonNames: true, minorOrder: reversed },
    );
    expect(formatInciList(items, { waterName: "Water (Aqua)", showCommonNames: true }).startsWith("Water (Aqua)")).toBe(true);
    const below = items.filter((item) => item.below).map((item) => item.key);
    expect(below).toEqual(reversed);
    const vitamin = items.find((item) => item.key === inciKey("Tocopherol"));
    expect(formatInciList([vitamin!], { waterName: "Aqua", showCommonNames: true })).toContain("Vitamin E");
  });

  it("merges duplicate components before applying the 1% line", () => {
    const tocopherol = state.ingredients.find((item) => item.id === "vitamin-e-t50") as Ingredient;
    const second = { ...tocopherol, id: "tocopherol-2", name: "Extra Tocopherol" };
    const items = buildInciItems(
      version([
        { ingredientId: "castor-oil", pct: 98.8, phase: "oil" },
        { ingredientId: "vitamin-e-t50", pct: 0.6, phase: "cool_down" },
        { ingredientId: "tocopherol-2", pct: 0.6, phase: "cool_down" },
      ]),
      [...state.ingredients, second],
      { waterName: "Aqua", showCommonNames: false },
    );
    const merged = items.find((item) => item.key === inciKey("Tocopherol"));
    expect(merged?.pct).toBeCloseTo(1.2, 6);
    expect(merged?.below).toBe(false);
    expect(inciExportRule().severity).toBe("info");
  });
});
