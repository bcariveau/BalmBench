import type {
  CompletedBatch,
  Container,
  ContainerLot,
  FormulaVersion,
  Ingredient,
  IngredientLot,
  IngredientSnapshot,
  Shortage,
} from "../types";
import { effectiveCostPerG, effectiveUnitCost } from "./catalog";
import { computeCogs, cogsFromDeductions } from "./cogs";
import { applyLotQty, fefoDeduct } from "./fefo";
import { addMonths, round, stamp, todayISO, uid } from "./format";
import { scaleFormula, type ScaleInput } from "./scale";

export interface BatchDraftInput {
  formulaId: string;
  version: FormulaVersion;
  ingredients: Ingredient[];
  containers: Container[];
  ingredientLots: IngredientLot[];
  containerLots: ContainerLot[];
  containerId: string;
  scale: ScaleInput;
  unitsOverride?: number | null;
  labelMisc?: number;
  lotCode: string;
  madeDate: string;
  notes: string;
  rdOverride: boolean;
}

export interface BatchPlan {
  batchG: number;
  units: number;
  fillG: number;
  overagePct: number;
  lines: {
    ingredientId: string;
    name: string;
    phase: FormulaVersion["ingredients"][number]["phase"];
    pct: number;
    grams: number;
    availableG: number;
    shortG: number;
    deductions: { lotId: string; lotCode: string; supplier: string; grams: number; unitCostPerG: number; expirationDate: string }[];
  }[];
  containerNeeded: number;
  containerAvailable: number;
  containerShort: number;
  containerDeductions: { lotId: string; lotCode: string; supplier: string; units: number; unitCostUsd: number; expirationDate: string; containerId: string; containerName: string }[];
  shortages: Shortage[];
  estimated: ReturnType<typeof computeCogs>;
  actual: ReturnType<typeof computeCogs>;
}

function snapshotIngredient(ingredient: Ingredient): IngredientSnapshot {
  return {
    id: ingredient.id,
    name: ingredient.name,
    inciName: ingredient.inciName,
    category: ingredient.category,
    defaultPhase: ingredient.defaultPhase,
    typicalUsagePct: { ...ingredient.typicalUsagePct },
    maxSafePct: { ...ingredient.maxSafePct },
    lipSafe: ingredient.lipSafe,
    shelfLifeMonths: ingredient.shelfLifeMonths,
    phWindow: ingredient.phWindow ? { ...ingredient.phWindow } : null,
    phototoxic: ingredient.phototoxic,
    notes: ingredient.notes,
  };
}

export function buildBatchPlan(input: BatchDraftInput): BatchPlan {
  const scaled = scaleFormula(input.version.ingredients, input.scale);
  const units = input.unitsOverride != null ? Math.max(0, Math.floor(input.unitsOverride)) : scaled.units;
  const ingredientById = new Map(input.ingredients.map((item) => [item.id, item]));
  const container = input.containers.find((item) => item.id === input.containerId);
  const shortages: Shortage[] = [];
  const lines = scaled.lines.map((line) => {
    const ingredient = ingredientById.get(line.ingredientId);
    const lots = input.ingredientLots.filter((lot) => lot.ingredientId === line.ingredientId && lot.qtyRemainingG > 0);
    const result = fefoDeduct(
      lots.map((lot) => ({ id: lot.id, qty: lot.qtyRemainingG, expirationDate: lot.expirationDate, purchaseDate: lot.purchaseDate })),
      line.grams,
      "weight",
    );
    const lotById = new Map(lots.map((lot) => [lot.id, lot]));
    const available = lots.reduce((sum, lot) => sum + lot.qtyRemainingG, 0);
    const short = round(result.shortage, 3);
    if (short > 0.0005) {
      shortages.push({
        kind: "ingredient",
        id: line.ingredientId,
        name: ingredient?.name ?? line.ingredientId,
        needed: round(line.grams, 3),
        available: round(available, 3),
        unit: "g",
      });
    }
    return {
      ingredientId: line.ingredientId,
      name: ingredient?.name ?? line.ingredientId,
      phase: line.phase,
      pct: line.pct,
      grams: line.grams,
      availableG: available,
      shortG: short,
      deductions: result.deductions.map((deduction) => {
        const lot = lotById.get(deduction.id);
        return {
          lotId: deduction.id,
          lotCode: lot?.lotCode ?? deduction.id,
          supplier: lot?.supplier ?? "",
          grams: deduction.qty,
          unitCostPerG: lot?.unitCostPerG ?? 0,
          expirationDate: lot?.expirationDate ?? "",
        };
      }),
    };
  });

  const containerLots = input.containerLots.filter((lot) => lot.containerId === input.containerId && lot.qtyRemaining > 0);
  const containerResult = fefoDeduct(
    containerLots.map((lot) => ({ id: lot.id, qty: lot.qtyRemaining, expirationDate: lot.expirationDate, purchaseDate: lot.purchaseDate })),
    units,
    "count",
  );
  const containerAvailable = containerLots.reduce((sum, lot) => sum + lot.qtyRemaining, 0);
  const containerShort = containerResult.shortage;
  if (container && containerShort > 0) {
    shortages.push({
      kind: "container",
      id: container.id,
      name: container.name,
      needed: units,
      available: containerAvailable,
      unit: "units",
    });
  }
  const lotById = new Map(containerLots.map((lot) => [lot.id, lot]));
  const containerDeductions = containerResult.deductions.map((deduction) => {
    const lot = lotById.get(deduction.id);
    return {
      lotId: deduction.id,
      lotCode: lot?.lotCode ?? deduction.id,
      supplier: lot?.supplier ?? "",
      units: deduction.qty,
      unitCostUsd: lot?.unitCostUsd ?? 0,
      expirationDate: lot?.expirationDate ?? "",
      containerId: input.containerId,
      containerName: container?.name ?? input.containerId,
    };
  });

  const estimated = computeCogs({
    lines: lines.map((line) => ({
      grams: line.grams,
      costPerG: ingredientById.get(line.ingredientId) ? effectiveCostPerG(ingredientById.get(line.ingredientId)!) ?? 0 : 0,
    })),
    units,
    containerUnitCost: container ? effectiveUnitCost(container) ?? 0 : 0,
    labelMisc: input.labelMisc ?? 0,
  });
  const actual = cogsFromDeductions({
    raw: lines.flatMap((line) => line.deductions.map((deduction) => ({ grams: deduction.grams, unitCostPerG: deduction.unitCostPerG }))),
    containers: containerDeductions.map((deduction) => ({ units: deduction.units, unitCostUsd: deduction.unitCostUsd })),
    labelMisc: input.labelMisc ?? 0,
    unitsProduced: units,
  });

  return {
    batchG: scaled.batchG,
    units,
    fillG: scaled.fillG,
    overagePct: scaled.overagePct,
    lines,
    containerNeeded: units,
    containerAvailable,
    containerShort,
    containerDeductions,
    shortages,
    estimated,
    actual,
  };
}

export function lotCodePrefix(productType: FormulaVersion["productType"]): string {
  return productType === "lip" ? "LB" : "LT";
}

export function nextBatchLotCode(existing: { lotCode: string }[], productType: FormulaVersion["productType"], date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const stem = `${lotCodePrefix(productType)}-${y}${m}${d}-`;
  const seq = existing
    .map((batch) => batch.lotCode)
    .filter((code) => code.startsWith(stem))
    .map((code) => Number(code.slice(stem.length)))
    .filter((n) => Number.isFinite(n));
  const next = (seq.length ? Math.max(...seq) : 0) + 1;
  return `${stem}${String(next).padStart(2, "0")}`;
}

export interface AppliedBatch {
  ingredientLots: IngredientLot[];
  containerLots: ContainerLot[];
  batch: CompletedBatch;
}

export function applyBatch(input: BatchDraftInput & { id?: string; now?: string }): AppliedBatch {
  const plan = buildBatchPlan(input);
  const ingredientLots = applyLotQty(
    input.ingredientLots,
    plan.lines.flatMap((line) => line.deductions.map((deduction) => ({ id: deduction.lotId, qty: deduction.grams }))),
    "qtyRemainingG",
  );
  const containerLots = applyLotQty(
    input.containerLots,
    plan.containerDeductions.map((deduction) => ({ id: deduction.lotId, qty: deduction.units })),
    "qtyRemaining",
  );
  const madeDate = input.madeDate || todayISO();
  const shortageNote = plan.shortages.length
    ? `Short stock at completion:\n${plan.shortages
        .map((item) => `${item.name}: needed ${item.needed} ${item.unit}, had ${item.available} ${item.unit}, short ${round(item.needed - item.available, 3)} ${item.unit}.`)
        .join("\n")}`
    : "";
  const overrideNote = input.rdOverride ? "Completed as a personal R&D test batch despite blocking guardrail errors." : "";
  const notes = [input.notes.trim(), shortageNote, overrideNote].filter(Boolean).join("\n\n");
  const container = input.containers.find((item) => item.id === input.containerId);
  const now = input.now ?? stamp();
  const batch: CompletedBatch = {
    id: input.id ?? uid("batch"),
    lotCode: input.lotCode.trim(),
    formulaId: input.formulaId,
    versionId: input.version.id,
    versionLabel: input.version.versionLabel,
    versionSnapshot: structuredClone(input.version),
    ingredientSnapshots: input.ingredients
      .filter((item) => input.version.ingredients.some((line) => line.ingredientId === item.id))
      .map(snapshotIngredient),
    containerId: input.containerId,
    containerName: container?.name ?? input.containerId,
    fillWeightG: plan.fillG,
    madeDate,
    expirationDate: addMonths(madeDate, input.version.estimatedShelfLifeMonths || 0),
    batchWeightG: round(plan.batchG, 3),
    unitsProduced: plan.units,
    unitsRemaining: plan.units,
    overagePct: plan.overagePct,
    scaleMode: input.scale.mode,
    rawDeductions: plan.lines.flatMap((line) =>
      line.deductions.map((deduction) => ({
        lotId: deduction.lotId,
        lotCode: deduction.lotCode,
        supplier: deduction.supplier,
        ingredientId: line.ingredientId,
        ingredientName: line.name,
        grams: round(deduction.grams, 3),
        unitCostPerG: deduction.unitCostPerG,
        expirationDate: deduction.expirationDate,
      })),
    ),
    containerDeductions: plan.containerDeductions.map((deduction) => ({
      lotId: deduction.lotId,
      lotCode: deduction.lotCode,
      supplier: deduction.supplier,
      containerId: deduction.containerId,
      containerName: deduction.containerName,
      units: deduction.units,
      unitCostUsd: deduction.unitCostUsd,
      expirationDate: deduction.expirationDate,
    })),
    shortages: plan.shortages,
    ingredientCogs: plan.actual.ingredient,
    containerCogs: plan.actual.container,
    labelMiscCost: plan.actual.labelMisc,
    batchCogs: plan.actual.batch,
    unitCogs: plan.actual.unit,
    notes,
    rdOverride: input.rdOverride,
    adjustments: [],
    createdAt: now,
  };
  return { ingredientLots, containerLots, batch };
}
