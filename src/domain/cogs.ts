import { round } from "./format";

export interface CogsResult {
  ingredient: number;
  container: number;
  labelMisc: number;
  batch: number;
  unit: number;
}

export function computeCogs(input: {
  lines: { grams: number; costPerG: number }[];
  units: number;
  containerUnitCost: number;
  labelMisc?: number;
}): CogsResult {
  const ingredient = input.lines.reduce((sum, line) => sum + line.grams * (Number.isFinite(line.costPerG) ? line.costPerG : 0), 0);
  const units = Math.max(0, input.units);
  const container = units * (Number.isFinite(input.containerUnitCost) ? input.containerUnitCost : 0);
  const labelMisc = Number.isFinite(input.labelMisc) ? input.labelMisc ?? 0 : 0;
  const batch = ingredient + container + labelMisc;
  const unit = units > 0 ? batch / units : 0;
  return {
    ingredient: round(ingredient, 4),
    container: round(container, 4),
    labelMisc: round(labelMisc, 4),
    batch: round(batch, 4),
    unit: round(unit, 4),
  };
}

export function cogsFromDeductions(input: {
  raw: { grams: number; unitCostPerG: number }[];
  containers: { units: number; unitCostUsd: number }[];
  labelMisc?: number;
  unitsProduced: number;
}): CogsResult {
  return computeCogs({
    lines: input.raw.map((row) => ({ grams: row.grams, costPerG: row.unitCostPerG })),
    units: input.unitsProduced,
    containerUnitCost:
      input.unitsProduced > 0
        ? input.containers.reduce((sum, row) => sum + row.units * row.unitCostUsd, 0) / input.unitsProduced
        : 0,
    labelMisc: input.labelMisc,
  });
}

export function priceFromMargin(unitCogs: number, marginPct: number): number {
  const margin = marginPct / 100;
  if (margin >= 1) return 0;
  if (!Number.isFinite(unitCogs)) return 0;
  return round(unitCogs / (1 - margin), 4);
}

export function marginFromPrice(unitCogs: number, price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return round(((price - unitCogs) / price) * 100, 2);
}
