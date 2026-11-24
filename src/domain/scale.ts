import type { FormulaIngredient, Phase } from "../types";
import { GRAMS_PER_OZ, clampNonNeg, round } from "./format";

export interface ScaleInput {
  mode: "weight" | "count";
  weightValue: number;
  weightUnit: "g" | "oz";
  containerCount: number;
  fillG: number;
  overagePct: number;
}

export interface ScaledLine {
  ingredientId: string;
  pct: number;
  phase: Phase;
  grams: number;
}

export interface ScaleResult {
  batchG: number;
  units: number;
  fillG: number;
  overagePct: number;
  lines: ScaledLine[];
}

export function gramsForPct(batchG: number, pct: number): number {
  return (clampNonNeg(batchG) * pct) / 100;
}

export function scaleFormula(ingredients: FormulaIngredient[], input: ScaleInput): ScaleResult {
  const fillG = clampNonNeg(input.fillG);
  const overagePct = clampNonNeg(input.overagePct);
  let batchG = 0;
  let units = 0;
  if (input.mode === "count") {
    units = Math.max(0, Math.floor(clampNonNeg(input.containerCount)));
    batchG = units * fillG * (1 + overagePct / 100);
  } else {
    const entered = clampNonNeg(input.weightValue);
    batchG = input.weightUnit === "oz" ? entered * GRAMS_PER_OZ : entered;
    units = fillG > 0 ? Math.floor(batchG / fillG) : 0;
  }
  return {
    batchG,
    units,
    fillG,
    overagePct,
    lines: ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      pct: line.pct,
      phase: line.phase,
      grams: gramsForPct(batchG, line.pct),
    })),
  };
}

export function displayScale(result: ScaleResult, digits = 3): ScaleResult {
  return {
    ...result,
    batchG: round(result.batchG, digits),
    lines: result.lines.map((line) => ({ ...line, grams: round(line.grams, digits) })),
  };
}
