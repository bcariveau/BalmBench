import rawSeed from "../data/starter-sourcing.json";
import type {
  AppState,
  Container,
  ContainerQuote,
  Formula,
  FormulaVersion,
  Ingredient,
  IngredientQuote,
  Phase,
  PhWindow,
  ProductType,
} from "../types";
import { stamp } from "./format";

export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "balmbench.v1";

interface RawQuote {
  supplier: string;
  packSizeG?: number;
  packLabel?: string;
  packQty?: number;
  priceUsd: number;
  costPerG?: number;
  unitCostUsd?: number;
  url: string;
  checkedDate: string;
  unitBasis?: string;
  notes?: string;
}

interface RawIngredient {
  id: string;
  name: string;
  inciName: string;
  category: string;
  defaultPhase: Phase;
  typicalUsagePct: { min: number; max: number };
  maxSafePct: { lip: number | null; bodyLotion: number | null; notes?: string };
  lipSafe: boolean;
  shelfLifeMonths: number;
  phWindow: PhWindow | null;
  phototoxic?: boolean | null;
  notes?: string;
  pricingStatus?: string;
  quotes?: RawQuote[];
}

interface RawContainer {
  id: string;
  name: string;
  type: string;
  sizeLabel: string;
  approxFillG: number;
  notes?: string;
  quotes?: RawQuote[];
}

interface RawFormula {
  id: string;
  name: string;
  isAnhydrous: boolean;
  targetPhRange: PhWindow | null;
  recommendedContainerIds: string[];
  batchSizeDefaultG: number;
  estimatedShelfLifeMonths: number;
  phaseTempsC: FormulaVersion["phaseTempsC"];
  ingredients: { ingredientId: string; pct: number; phase: Phase }[];
  steps: string[];
  notes?: string;
}

interface RawFile {
  generatedDate: string;
  caveats: string[];
  ingredients: RawIngredient[];
  containers: RawContainer[];
  starterFormulas: RawFormula[];
  guardrailRules: { id: string; severity: string; message: string }[];
}

const seed = rawSeed as unknown as RawFile;

export function bundledSeed(): RawFile {
  return seed;
}

export function guardrailRuleIds(): string[] {
  return seed.guardrailRules.map((rule) => rule.id);
}

function mapIngredientQuotes(ownerId: string, quotes: RawQuote[] | undefined): IngredientQuote[] {
  return (quotes ?? []).map((quote, index) => ({
    id: `${ownerId}-q${index + 1}`,
    supplier: quote.supplier,
    packSizeG: quote.packSizeG ?? 0,
    packLabel: quote.packLabel ?? "",
    priceUsd: quote.priceUsd,
    costPerG: quote.costPerG ?? (quote.packSizeG ? quote.priceUsd / quote.packSizeG : 0),
    url: quote.url,
    checkedDate: quote.checkedDate,
    unitBasis: quote.unitBasis,
    notes: quote.notes,
  }));
}

function cheapestId(quotes: { id: string; cost: number }[]): string | null {
  let best: { id: string; cost: number } | null = null;
  for (const quote of quotes) {
    if (!Number.isFinite(quote.cost)) continue;
    if (!best || quote.cost < best.cost) best = quote;
  }
  return best?.id ?? null;
}

export function mapIngredient(raw: RawIngredient): Ingredient {
  const quotes = mapIngredientQuotes(raw.id, raw.quotes);
  return {
    id: raw.id,
    name: raw.name,
    inciName: raw.inciName,
    category: raw.category,
    defaultPhase: raw.defaultPhase,
    typicalUsagePct: { min: raw.typicalUsagePct.min, max: raw.typicalUsagePct.max },
    maxSafePct: {
      lip: raw.maxSafePct.lip,
      bodyLotion: raw.maxSafePct.bodyLotion,
      notes: raw.maxSafePct.notes,
    },
    lipSafe: raw.lipSafe,
    shelfLifeMonths: raw.shelfLifeMonths,
    phWindow: raw.phWindow ? { min: raw.phWindow.min, max: raw.phWindow.max } : null,
    phototoxic: raw.phototoxic ?? null,
    notes: raw.notes ?? "",
    pricingStatus: raw.pricingStatus,
    quotes,
    activeQuoteId: cheapestId(quotes.map((quote) => ({ id: quote.id, cost: quote.costPerG }))),
    costOverridePerG: null,
    reorderThresholdG: 0,
  };
}

function mapContainerQuotes(ownerId: string, quotes: RawQuote[] | undefined): ContainerQuote[] {
  return (quotes ?? []).map((quote, index) => ({
    id: `${ownerId}-q${index + 1}`,
    supplier: quote.supplier,
    packQty: quote.packQty ?? 0,
    priceUsd: quote.priceUsd,
    unitCostUsd: quote.unitCostUsd ?? (quote.packQty ? quote.priceUsd / quote.packQty : 0),
    url: quote.url,
    checkedDate: quote.checkedDate,
    notes: quote.notes,
  }));
}

export function mapContainer(raw: RawContainer): Container {
  const quotes = mapContainerQuotes(raw.id, raw.quotes);
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    sizeLabel: raw.sizeLabel,
    approxFillG: raw.approxFillG,
    notes: raw.notes ?? "",
    quotes,
    activeQuoteId: cheapestId(quotes.map((quote) => ({ id: quote.id, cost: quote.unitCostUsd }))),
    costOverrideUsd: null,
    reorderThresholdUnits: 0,
  };
}

export function inferProductType(formula: { id: string; name: string; isAnhydrous: boolean }): ProductType {
  const blob = `${formula.id} ${formula.name}`.toLowerCase();
  if (blob.includes("lip")) return "lip";
  if (blob.includes("lotion") || blob.includes("body") || blob.includes("cream")) return "bodyLotion";
  return formula.isAnhydrous ? "lip" : "bodyLotion";
}

export function mapFormula(raw: RawFormula, createdAt: string): Formula {
  const productType = inferProductType(raw);
  const version: FormulaVersion = {
    id: "v1.0",
    versionLabel: "v1.0",
    createdAt,
    changeNote: "Starter formula from the 2026-11-23 sourcing seed.",
    name: raw.name,
    productType,
    isAnhydrous: raw.isAnhydrous,
    targetPhRange: raw.targetPhRange ? { ...raw.targetPhRange } : null,
    recommendedContainerIds: [...raw.recommendedContainerIds],
    defaultContainerId: raw.recommendedContainerIds[0] ?? null,
    batchSizeDefaultG: raw.batchSizeDefaultG,
    estimatedShelfLifeMonths: raw.estimatedShelfLifeMonths,
    phaseTempsC: structuredClone(raw.phaseTempsC),
    ingredients: raw.ingredients.map((line) => ({ ...line })),
    steps: [...raw.steps],
    notes: raw.notes ?? "",
    inciMinorOrder: [],
  };
  return {
    id: raw.id,
    createdAt,
    versions: [version],
    draft: null,
  };
}

export function defaultSettings(now = stamp()): AppState["settings"] {
  return {
    theme: "light",
    weightUnit: "g",
    waterInciName: "Aqua",
    showCommonNames: false,
    githubToken: "",
    gistId: null,
    lastSyncedAt: null,
    lastSyncedRevision: null,
    localRevision: 1,
    syncedLocalRevision: 1,
    dataUpdatedAt: now,
  };
}

export function createSeedState(now = stamp()): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    ingredients: seed.ingredients.map((item) => mapIngredient(item)),
    containers: seed.containers.map((item) => mapContainer(item)),
    formulas: seed.starterFormulas.map((item) => mapFormula(item, now)),
    ingredientLots: [],
    containerLots: [],
    batches: [],
    caveats: [...seed.caveats],
    settings: defaultSettings(now),
  };
}

export function blankVersion(partial?: Partial<FormulaVersion>): FormulaVersion {
  return {
    id: "draft",
    versionLabel: "draft",
    createdAt: stamp(),
    changeNote: "",
    name: "Untitled formula",
    productType: "lip",
    isAnhydrous: true,
    targetPhRange: null,
    recommendedContainerIds: [],
    defaultContainerId: null,
    batchSizeDefaultG: 100,
    estimatedShelfLifeMonths: 12,
    phaseTempsC: { melt: { min: 75, max: 80 }, coolDownAdd: { min: 60, max: 65 }, pour: { min: 58, max: 62 } },
    ingredients: [],
    steps: ["Weigh every ingredient."],
    notes: "",
    inciMinorOrder: [],
    ...partial,
  };
}
