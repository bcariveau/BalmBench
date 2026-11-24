export const GRAMS_PER_OZ = 28.3495;

export function round(n: number, places = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function clampNonNeg(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function gramsToOz(grams: number): number {
  return grams / GRAMS_PER_OZ;
}

export function ozToGrams(oz: number): number {
  return oz * GRAMS_PER_OZ;
}

export function formatAmount(value: number): string {
  const rounded = round(value, 2);
  if (!Number.isFinite(rounded) || Object.is(rounded, -0)) return "0";
  return String(rounded);
}

export function formatGrams(grams: number, digits = 2): string {
  if (digits === 2) return `${formatAmount(grams)} g`;
  return `${round(grams, digits).toFixed(digits)} g`;
}

export function formatWeight(grams: number, unit: "g" | "oz", digits = 2): string {
  const value = unit === "oz" ? gramsToOz(grams) : grams;
  if (digits === 2) return `${formatAmount(value)} ${unit}`;
  return `${round(value, digits).toFixed(digits)} ${unit}`;
}

export function formatTempParts(range?: { min?: number; max?: number } | null): { celsius: string; fahrenheit: string } | null {
  const min = range?.min;
  const max = range?.max;
  if (min == null && max == null) return null;
  if (min != null && max != null) return { celsius: `${min}–${max}°C`, fahrenheit: `${cToF(min)}–${cToF(max)}°F` };
  if (max != null) return { celsius: `≤ ${max}°C`, fahrenheit: `≤ ${cToF(max)}°F` };
  return { celsius: `≥ ${min}°C`, fahrenheit: `≥ ${cToF(min ?? 0)}°F` };
}

export function money(n: number, digits = 2): string {
  const value = Number.isFinite(n) ? n : 0;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function cToF(c: number): number {
  return round((c * 9) / 5 + 32, 1);
}

export function formatTempC(c: number): string {
  return `${round(c, 1)}°C (${cToF(c)}°F)`;
}

export function formatTempRange(range?: { min?: number; max?: number } | null): string {
  const min = range?.min;
  const max = range?.max;
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${min}–${max}°C (${cToF(min)}–${cToF(max)}°F)`;
  if (max != null) return `≤ ${max}°C (≤ ${cToF(max)}°F)`;
  return `≥ ${min}°C (≥ ${cToF(min ?? 0)}°F)`;
}

export function todayISO(date = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${z(date.getMonth() + 1)}-${z(date.getDate())}`;
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map((part) => Number(part));
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setMonth(date.getMonth() + months);
  return todayISO(date);
}

export function daysUntil(isoDate: string, today = todayISO()): number {
  const a = Date.parse(`${today}T00:00:00`);
  const b = Date.parse(`${isoDate}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function stamp(date = new Date()): string {
  return date.toISOString();
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function uid(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `${prefix}-${time}${rand}`;
}

export function productLabel(type: "lip" | "bodyLotion"): string {
  return type === "lip" ? "Lip" : "Body lotion";
}

export function phaseLabel(phase: "water" | "oil" | "cool_down"): string {
  if (phase === "water") return "Water";
  if (phase === "oil") return "Oil";
  return "Cool-down";
}

export function categoryLabel(category: string): string {
  return category.replaceAll("_", " ");
}
