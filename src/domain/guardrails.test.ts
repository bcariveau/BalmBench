import { createSeedState } from "./seed";
import { evaluateGuardrails, guardrailCounts, implementedRuleIds, inciOrderingFinding } from "./guardrails";
import { guardrailRuleIds } from "./seed";
import type { FormulaVersion, Ingredient, PhWindow } from "../types";

const state = createSeedState("2026-11-23T00:00:00.000Z");

function ingredient(id: string): Ingredient {
  const found = state.ingredients.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

function version(partial: Partial<FormulaVersion>): FormulaVersion {
  return {
    id: "v1.0",
    versionLabel: "v1.0",
    createdAt: "2026-11-23T00:00:00.000Z",
    changeNote: "",
    name: "Test formula",
    productType: "lip",
    isAnhydrous: true,
    targetPhRange: null,
    recommendedContainerIds: [],
    defaultContainerId: null,
    batchSizeDefaultG: 100,
    estimatedShelfLifeMonths: 12,
    phaseTempsC: { coolDownAdd: { max: 65 } },
    ingredients: [],
    steps: [],
    notes: "",
    inciMinorOrder: [],
    ...partial,
  };
}

function ids(findings: { ruleId: string; severity: string }[], severity?: string): string[] {
  return findings.filter((item) => !severity || item.severity === severity).map((item) => item.ruleId);
}

describe("guardrail coverage", () => {
  it("implements every seed rule", () => {
    expect(implementedRuleIds().sort()).toEqual([...guardrailRuleIds()].sort());
    expect(inciOrderingFinding().ruleId).toBe("inci-export-ordering");
    expect(inciOrderingFinding().severity).toBe("info");
  });

  it("accepts both starter formulas without errors or warnings", () => {
    for (const formula of state.formulas) {
      const findings = evaluateGuardrails(formula.versions[0], state.ingredients);
      const counts = guardrailCounts(findings);
      expect(counts.error, formula.id).toBe(0);
      expect(counts.warning, formula.id).toBe(0);
    }
  });
});

describe("formula-sum-100", () => {
  const lines = [
    { ingredientId: "beeswax-yellow", pct: 50, phase: "oil" as const },
    { ingredientId: "castor-oil", pct: 50, phase: "oil" as const },
  ];

  it("errors when the total is outside ±0.01", () => {
    const findings = evaluateGuardrails(version({ ingredients: [{ ...lines[0], pct: 40 }, lines[1]] }), state.ingredients);
    expect(ids(findings, "error")).toContain("formula-sum-100");
  });

  it("accepts 100 and a 0.01 drift", () => {
    expect(ids(evaluateGuardrails(version({ ingredients: lines }), state.ingredients), "error")).not.toContain("formula-sum-100");
    const drifted = evaluateGuardrails(
      version({ ingredients: [{ ...lines[0], pct: 50.01 }, lines[1]] }),
      state.ingredients,
    );
    expect(ids(drifted, "error")).not.toContain("formula-sum-100");
  });
});

describe("water-requires-preservative", () => {
  it("blocks water, hydrosol, aloe juice, and witch hazel without a real preservative", () => {
    const aloe = { ...ingredient("distilled-water"), id: "aloe", name: "Aloe Juice", inciName: "Aloe Barbadensis Leaf Juice", category: "water" };
    const hazel = { ...ingredient("distilled-water"), id: "hazel", name: "Witch Hazel Hydrosol", inciName: "Hamamelis Virginiana Water", category: "hydrosol" };
    const catalog = [...state.ingredients, aloe, hazel];
    for (const id of ["distilled-water", "aloe", "hazel"]) {
      const findings = evaluateGuardrails(
        version({
          productType: "bodyLotion",
          isAnhydrous: false,
          targetPhRange: { min: 4.8, max: 5.5 },
          phaseTempsC: { coolDownAdd: { max: 45 } },
          ingredients: [
            { ingredientId: id, pct: 99.5, phase: "water" },
            { ingredientId: "vitamin-e-t50", pct: 0.5, phase: "cool_down" },
          ],
        }),
        catalog,
      );
      expect(ids(findings, "error")).toContain("water-requires-preservative");
    }
  });

  it("passes when a preservative is present and ignores antioxidants", () => {
    const findings = evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: { min: 4.8, max: 5.5 },
        phaseTempsC: { coolDownAdd: { max: 45 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 98.5, phase: "water" },
          { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
          { ingredientId: "vitamin-e-t50", pct: 0.5, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(findings, "error")).not.toContain("water-requires-preservative");
  });
});

describe("preservative-usage-range", () => {
  function lotion(pct: number) {
    return evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: { min: 4.8, max: 5.5 },
        phaseTempsC: { coolDownAdd: { max: 45 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 100 - pct, phase: "water" },
          { ingredientId: "optiphen-plus", pct, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
  }

  it("errors below the minimum and above the maximum", () => {
    expect(ids(lotion(0.5), "error")).toContain("preservative-usage-range");
    expect(ids(lotion(1.6), "error")).toContain("preservative-usage-range");
  });

  it("accepts the inclusive ends of the range", () => {
    expect(ids(lotion(0.75), "error")).not.toContain("preservative-usage-range");
    expect(ids(lotion(1.5), "error")).not.toContain("preservative-usage-range");
  });
});

describe("preservative-ph-window", () => {
  function lotion(target: PhWindow | null) {
    return evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: target,
        phaseTempsC: { coolDownAdd: { max: 45 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 99, phase: "water" },
          { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
  }

  it("errors when the target pH is missing or outside the preservative window", () => {
    expect(ids(lotion(null), "error")).toContain("preservative-ph-window");
    expect(ids(lotion({ min: 7, max: 8 }), "error")).toContain("preservative-ph-window");
  });

  it("warns when the target sits outside the skin-friendly 4.5–5.5 band but still overlaps the preservative", () => {
    const findings = lotion({ min: 4, max: 5 });
    expect(ids(findings, "error")).not.toContain("preservative-ph-window");
    expect(ids(findings, "warning")).toContain("preservative-ph-window");
  });

  it("stays quiet for a 4.8–5.5 target inside Optiphen Plus", () => {
    const findings = lotion({ min: 4.8, max: 5.5 });
    expect(ids(findings)).not.toContain("preservative-ph-window");
  });

  it("does not apply the pH rule to an anhydrous lip balm", () => {
    const findings = evaluateGuardrails(state.formulas[0].versions[0], state.ingredients);
    expect(ids(findings)).not.toContain("preservative-ph-window");
  });
});

describe("lip-safe-ingredients-only", () => {
  it("blocks ingredients that are not lip safe", () => {
    const findings = evaluateGuardrails(
      version({
        ingredients: [
          { ingredientId: "beeswax-yellow", pct: 99, phase: "oil" },
          { ingredientId: "geogard-ect", pct: 1, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(findings, "error")).toContain("lip-safe-ingredients-only");
  });

  it("does not apply the lip rule to body lotion", () => {
    const findings = evaluateGuardrails(state.formulas[1].versions[0], state.ingredients);
    expect(ids(findings)).not.toContain("lip-safe-ingredients-only");
  });
});

describe("IFRA essential-oil caps", () => {
  it("blocks a lip oil above maxSafePct.lip and warns above the 1% total comfort cap", () => {
    const findings = evaluateGuardrails(
      version({
        phaseTempsC: { coolDownAdd: { max: 65 } },
        ingredients: [
          { ingredientId: "beeswax-yellow", pct: 98.4, phase: "oil" },
          { ingredientId: "eo-peppermint", pct: 1.2, phase: "cool_down" },
          { ingredientId: "vitamin-e-t50", pct: 0.4, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(findings, "error")).toContain("eo-dermal-cap-ifra-cat1-lip");
    expect(ids(findings, "warning")).toContain("eo-dermal-cap-ifra-cat1-lip");
    expect(ids(findings, "info")).toContain("eo-dermal-cap-ifra-cat1-lip");
  });

  it("warns on total lip EO above 1% even when each oil is under its own cap", () => {
    const findings = evaluateGuardrails(
      version({
        ingredients: [
          { ingredientId: "castor-oil", pct: 98.3, phase: "oil" },
          { ingredientId: "eo-peppermint", pct: 0.8, phase: "cool_down" },
          { ingredientId: "eo-lavender", pct: 0.4, phase: "cool_down" },
          { ingredientId: "vitamin-e-t50", pct: 0.5, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    const errors = findings.filter((item) => item.ruleId === "eo-dermal-cap-ifra-cat1-lip" && item.severity === "error");
    expect(errors).toHaveLength(0);
    expect(ids(findings, "warning")).toContain("eo-dermal-cap-ifra-cat1-lip");
  });

  it("blocks a lotion oil above maxSafePct.bodyLotion and warns only above 2% total", () => {
    const overCap = evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: { min: 4.8, max: 5.5 },
        phaseTempsC: { coolDownAdd: { max: 45 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 95.5, phase: "water" },
          { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
          { ingredientId: "eo-lavender", pct: 3, phase: "cool_down" },
          { ingredientId: "vitamin-e-t50", pct: 0.5, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(overCap, "error")).toContain("eo-dermal-cap-ifra-cat5a-lotion");
    expect(ids(overCap, "warning")).toContain("eo-dermal-cap-ifra-cat5a-lotion");

    const mild = evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: { min: 4.8, max: 5.5 },
        phaseTempsC: { coolDownAdd: { max: 45 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 97.4, phase: "water" },
          { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
          { ingredientId: "eo-peppermint", pct: 1.6, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(mild, "warning")).not.toContain("eo-dermal-cap-ifra-cat5a-lotion");
    expect(ids(mild, "error")).not.toContain("eo-dermal-cap-ifra-cat5a-lotion");
    expect(ids(mild, "info")).toContain("eo-dermal-cap-ifra-cat5a-lotion");
  });
});

describe("eo-phototoxicity-flag", () => {
  function leaveOn(extra: Ingredient, pct = 1) {
    return evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: { min: 4.8, max: 5.5 },
        phaseTempsC: { coolDownAdd: { max: 45 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 99 - pct, phase: "water" },
          { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
          { ingredientId: extra.id, pct, phase: "cool_down" },
        ],
      }),
      [...state.ingredients, extra],
    );
  }

  it("errors when phototoxic is true", () => {
    const bergamot = {
      ...ingredient("eo-sweet-orange"),
      id: "bergamot",
      name: "Bergamot Essential Oil",
      inciName: "Citrus Aurantium Bergamia Peel Oil",
      phototoxic: true,
    };
    expect(ids(leaveOn(bergamot), "error")).toContain("eo-phototoxicity-flag");
  });

  it("warns on unspecified citrus and stays quiet for sweet orange, FCF, and explicit false", () => {
    const lemon = {
      ...ingredient("eo-sweet-orange"),
      id: "lemon",
      name: "Lemon Essential Oil",
      inciName: "Citrus Limon Peel Oil",
      phototoxic: null,
    };
    expect(ids(leaveOn(lemon), "warning")).toContain("eo-phototoxicity-flag");

    const fcf = { ...lemon, id: "berg-fcf", name: "Bergamot FCF", phototoxic: null };
    expect(ids(leaveOn(fcf))).not.toContain("eo-phototoxicity-flag");

    const sweet = ingredient("eo-sweet-orange");
    expect(ids(leaveOn(sweet))).not.toContain("eo-phototoxicity-flag");

    const declaredSafe = { ...lemon, id: "lime-safe", name: "Lime Steam Distilled", phototoxic: false };
    expect(ids(leaveOn(declaredSafe))).not.toContain("eo-phototoxicity-flag");
  });
});

describe("cool-down-temperature-guard", () => {
  it("warns for the wrong phase or a cool-down target above the emulsion or anhydrous limit", () => {
    const wrongPhase = evaluateGuardrails(
      version({
        ingredients: [
          { ingredientId: "castor-oil", pct: 98.5, phase: "oil" },
          { ingredientId: "eo-peppermint", pct: 1, phase: "oil" },
          { ingredientId: "vitamin-e-t50", pct: 0.5, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(wrongPhase, "warning")).toContain("cool-down-temperature-guard");
    expect(ids(wrongPhase, "info")).not.toContain("cool-down-temperature-guard");

    const hotEmulsion = evaluateGuardrails(
      version({
        productType: "bodyLotion",
        isAnhydrous: false,
        targetPhRange: { min: 4.8, max: 5.5 },
        phaseTempsC: { coolDownAdd: { max: 50 } },
        ingredients: [
          { ingredientId: "distilled-water", pct: 98.5, phase: "water" },
          { ingredientId: "optiphen-plus", pct: 1, phase: "cool_down" },
          { ingredientId: "vitamin-e-t50", pct: 0.5, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(hotEmulsion, "warning")).toContain("cool-down-temperature-guard");

    const hotBalm = evaluateGuardrails(
      version({
        phaseTempsC: { coolDownAdd: { max: 70 } },
        ingredients: [
          { ingredientId: "castor-oil", pct: 99, phase: "oil" },
          { ingredientId: "eo-lavender", pct: 1, phase: "cool_down" },
        ],
      }),
      state.ingredients,
    );
    expect(ids(hotBalm, "warning")).toContain("cool-down-temperature-guard");
  });

  it("leaves an info reminder when heat-sensitive ingredients are placed correctly", () => {
    const findings = evaluateGuardrails(state.formulas[0].versions[0], state.ingredients);
    expect(ids(findings, "info")).toContain("cool-down-temperature-guard");
    const lotion = evaluateGuardrails(state.formulas[1].versions[0], state.ingredients);
    expect(ids(lotion, "info")).toContain("cool-down-temperature-guard");
  });
});
