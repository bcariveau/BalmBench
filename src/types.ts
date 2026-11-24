export type ProductType = "lip" | "bodyLotion";
export type Phase = "water" | "oil" | "cool_down";
export type Severity = "error" | "warning" | "info";
export type ThemeMode = "light" | "dark";
export type WeightUnit = "g" | "oz";
export type WaterInciName = "Aqua" | "Water (Aqua)";

export interface UsageRange {
  min: number;
  max: number;
}

export interface PhWindow {
  min: number;
  max: number;
}

export interface TempRange {
  min?: number;
  max?: number;
}

export interface MaxSafePct {
  lip: number | null;
  bodyLotion: number | null;
  notes?: string;
}

export interface IngredientQuote {
  id: string;
  supplier: string;
  packSizeG: number;
  packLabel: string;
  priceUsd: number;
  costPerG: number;
  url: string;
  checkedDate: string;
  unitBasis?: string;
  notes?: string;
}

export interface Ingredient {
  id: string;
  name: string;
  inciName: string;
  category: string;
  defaultPhase: Phase;
  typicalUsagePct: UsageRange;
  maxSafePct: MaxSafePct;
  lipSafe: boolean;
  shelfLifeMonths: number;
  phWindow: PhWindow | null;
  phototoxic: boolean | null;
  notes: string;
  pricingStatus?: string;
  quotes: IngredientQuote[];
  activeQuoteId: string | null;
  costOverridePerG: number | null;
  reorderThresholdG: number;
}

export interface ContainerQuote {
  id: string;
  supplier: string;
  packQty: number;
  priceUsd: number;
  unitCostUsd: number;
  url: string;
  checkedDate: string;
  notes?: string;
}

export interface Container {
  id: string;
  name: string;
  type: string;
  sizeLabel: string;
  approxFillG: number;
  notes: string;
  quotes: ContainerQuote[];
  activeQuoteId: string | null;
  costOverrideUsd: number | null;
  reorderThresholdUnits: number;
}

export interface FormulaIngredient {
  ingredientId: string;
  pct: number;
  phase: Phase;
}

export interface FormulaVersion {
  id: string;
  versionLabel: string;
  createdAt: string;
  changeNote: string;
  name: string;
  productType: ProductType;
  isAnhydrous: boolean;
  targetPhRange: PhWindow | null;
  recommendedContainerIds: string[];
  defaultContainerId: string | null;
  batchSizeDefaultG: number;
  estimatedShelfLifeMonths: number;
  phaseTempsC: {
    melt?: TempRange;
    waterHeat?: TempRange;
    oilHeat?: TempRange;
    coolDownAdd?: TempRange;
    pour?: TempRange;
  };
  ingredients: FormulaIngredient[];
  steps: string[];
  notes: string;
  inciMinorOrder: string[];
}

export interface Formula {
  id: string;
  createdAt: string;
  versions: FormulaVersion[];
  draft: FormulaVersion | null;
}

export interface IngredientLot {
  id: string;
  ingredientId: string;
  lotCode: string;
  supplier: string;
  qtyRemainingG: number;
  qtyOriginalG: number;
  unitCostPerG: number;
  purchaseDate: string;
  expirationDate: string;
  notes: string;
}

export interface ContainerLot {
  id: string;
  containerId: string;
  lotCode: string;
  supplier: string;
  qtyRemaining: number;
  qtyOriginal: number;
  unitCostUsd: number;
  purchaseDate: string;
  expirationDate: string;
  notes: string;
}

export interface RawDeduction {
  lotId: string;
  lotCode: string;
  supplier: string;
  ingredientId: string;
  ingredientName: string;
  grams: number;
  unitCostPerG: number;
  expirationDate: string;
}

export interface ContainerDeduction {
  lotId: string;
  lotCode: string;
  supplier: string;
  containerId: string;
  containerName: string;
  units: number;
  unitCostUsd: number;
  expirationDate: string;
}

export interface Shortage {
  kind: "ingredient" | "container";
  id: string;
  name: string;
  needed: number;
  available: number;
  unit: "g" | "units";
}

export interface IngredientSnapshot {
  id: string;
  name: string;
  inciName: string;
  category: string;
  defaultPhase: Phase;
  typicalUsagePct: UsageRange;
  maxSafePct: MaxSafePct;
  lipSafe: boolean;
  shelfLifeMonths: number;
  phWindow: PhWindow | null;
  phototoxic: boolean | null;
  notes: string;
}

export interface FinishedAdjustment {
  at: string;
  delta: number;
  reason: "personal" | "gifted" | "sold" | "damaged" | "correction";
  note: string;
}

export interface CompletedBatch {
  id: string;
  lotCode: string;
  formulaId: string;
  versionId: string;
  versionLabel: string;
  versionSnapshot: FormulaVersion;
  ingredientSnapshots: IngredientSnapshot[];
  containerId: string;
  containerName: string;
  fillWeightG: number;
  madeDate: string;
  expirationDate: string;
  batchWeightG: number;
  unitsProduced: number;
  unitsRemaining: number;
  overagePct: number;
  scaleMode: "weight" | "count";
  rawDeductions: RawDeduction[];
  containerDeductions: ContainerDeduction[];
  shortages: Shortage[];
  ingredientCogs: number;
  containerCogs: number;
  labelMiscCost: number;
  batchCogs: number;
  unitCogs: number;
  notes: string;
  rdOverride: boolean;
  adjustments: FinishedAdjustment[];
  createdAt: string;
}

export interface AppSettings {
  theme: ThemeMode;
  weightUnit: WeightUnit;
  waterInciName: WaterInciName;
  showCommonNames: boolean;
  githubToken: string;
  gistId: string | null;
  lastSyncedAt: string | null;
  lastSyncedRevision: string | null;
  localRevision: number;
  syncedLocalRevision: number;
  dataUpdatedAt: string;
}

export interface AppState {
  schemaVersion: number;
  ingredients: Ingredient[];
  containers: Container[];
  formulas: Formula[];
  ingredientLots: IngredientLot[];
  containerLots: ContainerLot[];
  batches: CompletedBatch[];
  caveats: string[];
  settings: AppSettings;
}

export interface GuardrailFinding {
  ruleId: string;
  severity: Severity;
  message: string;
  ingredientId?: string;
}
