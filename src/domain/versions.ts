import type { Formula, FormulaVersion } from "../types";
import { stamp } from "./format";

export function latestVersion(formula: Formula): FormulaVersion | null {
  return formula.versions[formula.versions.length - 1] ?? null;
}

export function findVersion(formula: Formula, versionId: string): FormulaVersion | null {
  return formula.versions.find((version) => version.id === versionId || version.versionLabel === versionId) ?? null;
}

export function nextVersionLabel(versions: { versionLabel: string }[]): string {
  if (versions.length === 0) return "v1.0";
  let minor = -1;
  for (const version of versions) {
    const match = version.versionLabel.match(/^v(\d+)\.(\d+)$/);
    if (match && match[1] === "1") minor = Math.max(minor, Number(match[2]));
  }
  return `v1.${minor + 1}`;
}

export function cloneVersion(version: FormulaVersion, patch?: Partial<FormulaVersion>): FormulaVersion {
  return { ...structuredClone(version), ...patch };
}

export function startDraft(version: FormulaVersion): FormulaVersion {
  return cloneVersion(version, {
    id: "draft",
    versionLabel: "draft",
    changeNote: "",
    createdAt: stamp(),
  });
}

export function commitDraft(formula: Formula, draft: FormulaVersion, changeNote: string, now = stamp()): Formula {
  const label = nextVersionLabel(formula.versions);
  const snapshot = cloneVersion(draft, {
    id: label,
    versionLabel: label,
    createdAt: now,
    changeNote: changeNote.trim(),
  });
  return { ...formula, versions: [...formula.versions, snapshot], draft: null };
}

export function restoreAsNewVersion(formula: Formula, versionId: string, changeNote?: string, now = stamp()): Formula {
  const source = findVersion(formula, versionId);
  if (!source) return formula;
  const label = nextVersionLabel(formula.versions);
  const snapshot = cloneVersion(source, {
    id: label,
    versionLabel: label,
    createdAt: now,
    changeNote: changeNote?.trim() || `Restored from ${source.versionLabel}.`,
  });
  return { ...formula, versions: [...formula.versions, snapshot], draft: null };
}

export function cloneFormula(formula: Formula, versionId: string, newId: string, now = stamp()): Formula {
  const source = findVersion(formula, versionId) ?? latestVersion(formula);
  if (!source) {
    return { id: newId, createdAt: now, versions: [], draft: startDraft({ ...sourceFallback(formula.id), name: `${formula.id} copy` }) };
  }
  const snapshot = cloneVersion(source, {
    id: "v1.0",
    versionLabel: "v1.0",
    createdAt: now,
    changeNote: `Cloned from ${formula.id} ${source.versionLabel}.`,
    name: `${source.name} copy`,
  });
  return { id: newId, createdAt: now, versions: [snapshot], draft: null };
}

function sourceFallback(name: string): FormulaVersion {
  return {
    id: "draft",
    versionLabel: "draft",
    createdAt: stamp(),
    changeNote: "",
    name,
    productType: "lip",
    isAnhydrous: true,
    targetPhRange: null,
    recommendedContainerIds: [],
    defaultContainerId: null,
    batchSizeDefaultG: 100,
    estimatedShelfLifeMonths: 12,
    phaseTempsC: {},
    ingredients: [],
    steps: [],
    notes: "",
    inciMinorOrder: [],
  };
}
