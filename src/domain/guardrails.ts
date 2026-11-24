import type { FormulaVersion, GuardrailFinding, Ingredient, PhWindow, Severity } from "../types";
import { round } from "./format";

const CITRUS_MARKERS = [
  "bergamot",
  "citrus aurantium bergamia",
  "bitter orange",
  "citrus aurantium peel oil",
  "lemon",
  "citrus limon",
  "lime",
  "citrus aurantifolia",
  "grapefruit",
  "citrus paradisi",
];

const HEAT_SENSITIVE = new Set(["preservative", "antioxidant", "essential_oil"]);

export function implementedRuleIds(): string[] {
  return [
    "formula-sum-100",
    "water-requires-preservative",
    "preservative-usage-range",
    "preservative-ph-window",
    "lip-safe-ingredients-only",
    "eo-dermal-cap-ifra-cat1-lip",
    "eo-dermal-cap-ifra-cat5a-lotion",
    "eo-phototoxicity-flag",
    "cool-down-temperature-guard",
    "inci-export-ordering",
  ];
}

export function isAqueousIngredient(ingredient: Pick<Ingredient, "category" | "inciName" | "name">): boolean {
  if (ingredient.category === "water") return true;
  const inci = ingredient.inciName.toLowerCase();
  if (["aqua", "water", "hydrosol"].some((token) => inci.includes(token))) return true;
  const name = ingredient.name.toLowerCase();
  return ["hydrosol", "aloe juice", "witch hazel"].some((token) => name.includes(token));
}

function rangesOverlap(a: PhWindow, b: PhWindow): boolean {
  return a.min <= b.max + 1e-9 && b.min <= a.max + 1e-9;
}

function containedIn(inner: PhWindow, outer: PhWindow): boolean {
  return inner.min >= outer.min - 1e-9 && inner.max <= outer.max + 1e-9;
}

function finding(ruleId: string, severity: Severity, message: string, ingredientId?: string): GuardrailFinding {
  return ingredientId ? { ruleId, severity, message, ingredientId } : { ruleId, severity, message };
}

function sorted(findings: GuardrailFinding[]): GuardrailFinding[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  return [...findings].sort((a, b) => rank[a.severity] - rank[b.severity] || a.ruleId.localeCompare(b.ruleId));
}

function named(ingredients: Map<string, Ingredient>, id: string): string {
  return ingredients.get(id)?.name ?? id;
}

function explicitNonPhototoxic(ingredient: Ingredient): boolean {
  if (ingredient.phototoxic === false) return true;
  const blob = `${ingredient.name} ${ingredient.inciName}`.toLowerCase();
  return (
    blob.includes("sweet orange") ||
    blob.includes("citrus aurantium dulcis") ||
    blob.includes("citrus sinensis") ||
    blob.includes("steam-distilled") ||
    blob.includes("steam distilled") ||
    blob.includes("furanocoumarin-free") ||
    /\bfcf\b/.test(blob)
  );
}

function mentionsPhototoxicCitrus(ingredient: Ingredient): boolean {
  const blob = `${ingredient.name} ${ingredient.inciName}`.toLowerCase();
  return CITRUS_MARKERS.some((marker) => blob.includes(marker));
}

export function evaluateGuardrails(version: FormulaVersion, catalog: Ingredient[]): GuardrailFinding[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const findings: GuardrailFinding[] = [];
  const lines = version.ingredients.map((line) => ({ line, ingredient: byId.get(line.ingredientId) }));
  const sum = version.ingredients.reduce((total, line) => total + (Number.isFinite(line.pct) ? line.pct : 0), 0);

  if (Math.abs(sum - 100) > 0.01) {
    findings.push(
      finding(
        "formula-sum-100",
        "error",
        `Ingredient percentages total ${round(sum, 2)}%. They must add up to 100% (tolerance 0.01).`,
      ),
    );
  }

  const aqueousLines = lines.filter((row) => row.ingredient && isAqueousIngredient(row.ingredient));
  const preservatives = lines.filter((row) => row.ingredient?.category === "preservative");
  const needsPreservative = aqueousLines.length > 0;
  if (needsPreservative && preservatives.length < 1) {
    const names = aqueousLines.map((row) => row.ingredient?.name ?? row.line.ingredientId).join(", ");
    findings.push(
      finding(
        "water-requires-preservative",
        "error",
        `${names} makes this formula aqueous. Add a broad-spectrum preservative. Vitamin E and other antioxidants do not count.`,
      ),
    );
  }

  for (const row of preservatives) {
    const ingredient = row.ingredient;
    if (!ingredient) continue;
    const { min, max } = ingredient.typicalUsagePct;
    if (row.line.pct < min - 1e-9 || row.line.pct > max + 1e-9) {
      findings.push(
        finding(
          "preservative-usage-range",
          "error",
          `${ingredient.name} is at ${round(row.line.pct, 2)}%. Use it within ${min}–${max}%.`,
          ingredient.id,
        ),
      );
    }
  }

  const aqueousFormula = !version.isAnhydrous || needsPreservative;
  if (aqueousFormula) {
    if (!version.targetPhRange) {
      findings.push(
        finding(
          "preservative-ph-window",
          "error",
          "Aqueous and emulsion formulas need a target pH range that overlaps the preservative's active window.",
        ),
      );
    } else {
      for (const row of preservatives) {
        const ingredient = row.ingredient;
        if (!ingredient) continue;
        if (!ingredient.phWindow) {
          findings.push(
            finding(
              "preservative-ph-window",
              "info",
              `${ingredient.name} has no pH window on file. Confirm the supplier's effective range before selling.`,
              ingredient.id,
            ),
          );
          continue;
        }
        if (!rangesOverlap(version.targetPhRange, ingredient.phWindow)) {
          findings.push(
            finding(
              "preservative-ph-window",
              "error",
              `Target pH ${version.targetPhRange.min}–${version.targetPhRange.max} sits outside ${ingredient.name}'s window of ${ingredient.phWindow.min}–${ingredient.phWindow.max}.`,
              ingredient.id,
            ),
          );
        }
      }
      const skin = { min: 4.5, max: 5.5 };
      if (!containedIn(version.targetPhRange, skin)) {
        findings.push(
          finding(
            "preservative-ph-window",
            "warning",
            "A finished-product pH of 4.5–5.5 is generally more skin-friendly. Keep the target inside the preservative window as well.",
          ),
        );
      }
    }
  }

  if (version.productType === "lip") {
    for (const row of lines) {
      if (row.ingredient && row.ingredient.lipSafe !== true) {
        findings.push(
          finding(
            "lip-safe-ingredients-only",
            "error",
            `${row.ingredient.name} is not marked lip-safe and cannot be used in a lip formula.`,
            row.ingredient.id,
          ),
        );
      } else if (!row.ingredient) {
        findings.push(
          finding("lip-safe-ingredients-only", "error", `Unknown ingredient ${row.line.ingredientId} cannot be confirmed lip-safe.`, row.line.ingredientId),
        );
      }
    }
  }

  const essentialOils = lines.filter((row) => row.ingredient?.category === "essential_oil");
  const totalEo = essentialOils.reduce((total, row) => total + row.line.pct, 0);

  if (version.productType === "lip") {
    for (const row of essentialOils) {
      const cap = row.ingredient?.maxSafePct.lip;
      if (row.ingredient && cap != null && row.line.pct > cap + 1e-9) {
        findings.push(
          finding(
            "eo-dermal-cap-ifra-cat1-lip",
            "error",
            `${row.ingredient.name} is ${round(row.line.pct, 2)}%, above its lip max of ${cap}% (IFRA Category 1).`,
            row.ingredient.id,
          ),
        );
      }
    }
    if (totalEo > 1 + 1e-9) {
      findings.push(
        finding(
          "eo-dermal-cap-ifra-cat1-lip",
          "warning",
          `Total essential oil is ${round(totalEo, 2)}%, above the 1.0% lip comfort cap.`,
        ),
      );
    }
    if (essentialOils.length > 0) {
      findings.push(
        finding(
          "eo-dermal-cap-ifra-cat1-lip",
          "info",
          "Verify the supplier batch IFRA Category 1 certificate before selling this lip formula.",
        ),
      );
    }
  }

  if (version.productType === "bodyLotion") {
    for (const row of essentialOils) {
      const cap = row.ingredient?.maxSafePct.bodyLotion;
      if (row.ingredient && cap != null && row.line.pct > cap + 1e-9) {
        findings.push(
          finding(
            "eo-dermal-cap-ifra-cat5a-lotion",
            "error",
            `${row.ingredient.name} is ${round(row.line.pct, 2)}%, above its body-lotion max of ${cap}% (IFRA Category 5A).`,
            row.ingredient.id,
          ),
        );
      }
    }
    if (totalEo > 2 + 1e-9) {
      findings.push(
        finding(
          "eo-dermal-cap-ifra-cat5a-lotion",
          "warning",
          `Total essential oil is ${round(totalEo, 2)}%, above the 2.0% leave-on warning line. A typical lotion range is 0.5–1.5%.`,
        ),
      );
    }
    if (essentialOils.length > 0) {
      findings.push(
        finding(
          "eo-dermal-cap-ifra-cat5a-lotion",
          "info",
          "Verify the supplier batch IFRA Category 5A certificate before selling this lotion.",
        ),
      );
    }
  }

  for (const row of lines) {
    const ingredient = row.ingredient;
    if (!ingredient) continue;
    if (ingredient.phototoxic === true) {
      findings.push(
        finding(
          "eo-phototoxicity-flag",
          "error",
          `${ingredient.name} is marked phototoxic. Do not use it in this leave-on formula at an unspecified safe level.`,
          ingredient.id,
        ),
      );
      continue;
    }
    if (explicitNonPhototoxic(ingredient)) continue;
    if (mentionsPhototoxicCitrus(ingredient)) {
      findings.push(
        finding(
          "eo-phototoxicity-flag",
          "warning",
          `${ingredient.name} looks like a phototoxic citrus (bergamot, bitter orange, lemon, lime, or grapefruit) and phototoxic is not explicitly false. Confirm the grade or remove it.`,
          ingredient.id,
        ),
      );
    }
  }

  const sensitive = lines.filter((row) => row.ingredient && HEAT_SENSITIVE.has(row.ingredient.category));
  if (sensitive.length > 0) {
    const limit = version.isAnhydrous ? 65 : 45;
    const coolMax = version.phaseTempsC.coolDownAdd?.max;
    const wrongPhase = sensitive.filter((row) => row.line.phase !== "cool_down");
    for (const row of wrongPhase) {
      findings.push(
        finding(
          "cool-down-temperature-guard",
          "warning",
          `${named(byId, row.line.ingredientId)} is in the ${row.line.phase.replace("_", " ")} phase. Add preservatives, antioxidants, and essential oils in cool-down.`,
          row.line.ingredientId,
        ),
      );
    }
    if (coolMax != null && coolMax > limit + 1e-9) {
      findings.push(
        finding(
          "cool-down-temperature-guard",
          "warning",
          `Cool-down target reaches ${coolMax}°C. Keep it at or below ${limit}°C for this ${version.isAnhydrous ? "anhydrous" : "emulsion"} formula.`,
        ),
      );
    }
    if (wrongPhase.length === 0 && (coolMax == null || coolMax <= limit + 1e-9)) {
      findings.push(
        finding(
          "cool-down-temperature-guard",
          "info",
          `Preservatives, antioxidants, and essential oils are in cool-down. Hold that phase at or below ${limit}°C (${version.isAnhydrous ? "anhydrous balm" : "emulsion"}).`,
        ),
      );
    }
  }

  return sorted(findings);
}

export function guardrailCounts(findings: GuardrailFinding[]): Record<Severity, number> {
  return {
    error: findings.filter((item) => item.severity === "error").length,
    warning: findings.filter((item) => item.severity === "warning").length,
    info: findings.filter((item) => item.severity === "info").length,
  };
}

export function inciOrderingFinding(): GuardrailFinding {
  return finding(
    "inci-export-ordering",
    "info",
    "INCI lists go in descending order by weight at or above 1.0%. Ingredients strictly below 1.0% may follow any order after that. List water as Aqua or Water (Aqua), expand multi-component INCI names, and merge duplicates.",
  );
}
