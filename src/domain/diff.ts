import type { FormulaVersion, Ingredient } from "../types";
import { formatTempRange } from "./format";

export interface FormulaDiff {
  ingredients: { ingredientId: string; name: string; from: number | null; to: number | null; phaseFrom: string | null; phaseTo: string | null }[];
  temps: { key: string; from: string; to: string }[];
  ph: { from: string; to: string } | null;
  stepsAdded: string[];
  stepsRemoved: string[];
  stepsReordered: boolean;
  fields: { label: string; from: string; to: string }[];
}

function phText(version: FormulaVersion): string {
  if (!version.targetPhRange) return "none";
  return `${version.targetPhRange.min}–${version.targetPhRange.max}`;
}

function tempText(version: FormulaVersion, key: keyof FormulaVersion["phaseTempsC"]): string {
  return formatTempRange(version.phaseTempsC[key]);
}

export function diffVersions(from: FormulaVersion, to: FormulaVersion, ingredients: Ingredient[]): FormulaDiff {
  const names = new Map(ingredients.map((item) => [item.id, item.name]));
  const fromMap = new Map(from.ingredients.map((line) => [line.ingredientId, line]));
  const toMap = new Map(to.ingredients.map((line) => [line.ingredientId, line]));
  const ids = [...new Set([...fromMap.keys(), ...toMap.keys()])];
  const ingredientDiffs = ids
    .map((id) => {
      const a = fromMap.get(id);
      const b = toMap.get(id);
      return {
        ingredientId: id,
        name: names.get(id) ?? id,
        from: a?.pct ?? null,
        to: b?.pct ?? null,
        phaseFrom: a?.phase ?? null,
        phaseTo: b?.phase ?? null,
      };
    })
    .filter((row) => row.from !== row.to || row.phaseFrom !== row.phaseTo);

  const tempKeys = ["melt", "waterHeat", "oilHeat", "coolDownAdd", "pour"] as const;
  const temps = tempKeys
    .map((key) => ({ key, from: tempText(from, key), to: tempText(to, key) }))
    .filter((row) => row.from !== row.to);

  const ph = phText(from) === phText(to) ? null : { from: phText(from), to: phText(to) };
  const fromSteps = new Set(from.steps);
  const toSteps = new Set(to.steps);
  const stepsRemoved = from.steps.filter((step) => !toSteps.has(step));
  const stepsAdded = to.steps.filter((step) => !fromSteps.has(step));
  const sharedFrom = from.steps.filter((step) => toSteps.has(step));
  const sharedTo = to.steps.filter((step) => fromSteps.has(step));
  const stepsReordered = sharedFrom.join("\n") !== sharedTo.join("\n");

  const fields: FormulaDiff["fields"] = [];
  const push = (label: string, a: string, b: string) => {
    if (a !== b) fields.push({ label, from: a, to: b });
  };
  push("Name", from.name, to.name);
  push("Product", from.productType, to.productType);
  push("Anhydrous", from.isAnhydrous ? "yes" : "no", to.isAnhydrous ? "yes" : "no");
  push("Default batch", `${from.batchSizeDefaultG} g`, `${to.batchSizeDefaultG} g`);
  push("Shelf life", `${from.estimatedShelfLifeMonths} mo`, `${to.estimatedShelfLifeMonths} mo`);
  push("Containers", from.recommendedContainerIds.join(", ") || "—", to.recommendedContainerIds.join(", ") || "—");
  push("Notes", from.notes || "—", to.notes || "—");

  return { ingredients: ingredientDiffs, temps, ph, stepsAdded, stepsRemoved, stepsReordered, fields };
}

export function diffIsEmpty(diff: FormulaDiff): boolean {
  return (
    diff.ingredients.length === 0 &&
    diff.temps.length === 0 &&
    !diff.ph &&
    diff.stepsAdded.length === 0 &&
    diff.stepsRemoved.length === 0 &&
    !diff.stepsReordered &&
    diff.fields.length === 0
  );
}
