import type { FormulaVersion, Ingredient, WaterInciName } from "../types";
import { inciOrderingFinding } from "./guardrails";
import type { GuardrailFinding } from "../types";

export interface InciItem {
  key: string;
  inciName: string;
  pct: number;
  below: boolean;
  commonNames: string[];
}

export interface InciOptions {
  waterName: WaterInciName;
  showCommonNames: boolean;
  minorOrder?: string[];
}

export interface InciExportInput {
  productName: string;
  items: InciItem[];
  waterName: WaterInciName;
  showCommonNames: boolean;
  netWeight: number;
  netUnit: "g" | "oz";
  lotCode: string;
}

function splitInci(inciName: string): string[] {
  const parts = inciName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [inciName.trim()];
}

function waterKey(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  return normalized === "aqua" || normalized === "water" || normalized === "water aqua";
}

export function inciKey(name: string): string {
  const base = name.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (waterKey(name) || base === "aqua" || base === "water") return "water";
  return base;
}

function decorate(name: string, waterName: WaterInciName, showCommonNames: boolean, commons: string[]): string {
  if (waterKey(name) || inciKey(name) === "water") return waterName;
  if (!showCommonNames || name.includes("(") || commons.length === 0) return name;
  return `${name} (${commons[0]})`;
}

export function buildInciItems(
  version: FormulaVersion,
  catalog: Pick<Ingredient, "id" | "name" | "inciName">[],
  options: InciOptions,
): InciItem[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const grouped = new Map<string, InciItem>();

  version.ingredients.forEach((line, lineIndex) => {
    const ingredient = byId.get(line.ingredientId);
    const sourceName = ingredient?.inciName || line.ingredientId;
    const parts = splitInci(sourceName);
    parts.forEach((part, partIndex) => {
      const key = inciKey(part);
      const existing = grouped.get(key);
      const common = ingredient?.name ? [ingredient.name] : [];
      if (existing) {
        existing.pct += line.pct;
        for (const name of common) {
          if (!existing.commonNames.includes(name)) existing.commonNames.push(name);
        }
        return;
      }
      grouped.set(key, {
        key,
        inciName: part,
        pct: line.pct,
        below: false,
        commonNames: partIndex === 0 ? common : [],
      });
      void lineIndex;
    });
  });

  const items = [...grouped.values()].map((item) => ({ ...item, below: item.pct < 1 - 1e-9 }));
  const above = items
    .filter((item) => !item.below)
    .sort((a, b) => b.pct - a.pct || a.inciName.localeCompare(b.inciName));
  const below = items.filter((item) => item.below);
  const order = options.minorOrder ?? version.inciMinorOrder ?? [];
  const rank = new Map(order.map((key, index) => [key, index]));
  below.sort((a, b) => {
    const ar = rank.has(a.key) ? rank.get(a.key)! : Number.POSITIVE_INFINITY;
    const br = rank.has(b.key) ? rank.get(b.key)! : Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return a.inciName.localeCompare(b.inciName);
  });
  return [...above, ...below];
}

export function formatInciList(items: InciItem[], options: Pick<InciOptions, "waterName" | "showCommonNames">): string {
  return items
    .map((item) => decorate(item.inciName, options.waterName, options.showCommonNames, item.commonNames))
    .join(", ");
}

export function inciLabelText(input: InciExportInput): string {
  const weight =
    input.netUnit === "oz"
      ? `${input.netWeight} oz`
      : `${input.netWeight} g`;
  const list = formatInciList(input.items, input);
  const lines = [
    input.productName,
    `Net wt. ${weight}`,
    input.lotCode ? `Lot ${input.lotCode}` : "",
    "",
    `Ingredients: ${list}`,
    "",
    "Confirm the batch IFRA certificate and applicable labeling rules before selling.",
  ].filter((line, index, all) => line !== "" || (index > 0 && all[index - 1] !== ""));
  return lines.join("\n");
}

export function inciExportRule(): GuardrailFinding {
  return inciOrderingFinding();
}

export function moveMinorOrder(order: string[], key: string, direction: -1 | 1): string[] {
  const next = [...order];
  const index = next.indexOf(key);
  if (index < 0) return order;
  const target = index + direction;
  if (target < 0 || target >= next.length) return order;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}
