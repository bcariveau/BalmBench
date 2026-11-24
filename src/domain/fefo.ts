export interface DeductibleLot {
  id: string;
  qty: number;
  expirationDate?: string | null;
  purchaseDate?: string | null;
}

export interface LotDeduction {
  id: string;
  qty: number;
}

export interface FefoResult {
  lots: DeductibleLot[];
  deductions: LotDeduction[];
  shortage: number;
}

const MG = 1000;

function toMilli(qty: number): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * MG);
}

function fromMilli(qty: number): number {
  return qty / MG;
}

function sortLots(lots: DeductibleLot[]): DeductibleLot[] {
  return [...lots].sort((a, b) => {
    const expA = a.expirationDate || "9999-12-31";
    const expB = b.expirationDate || "9999-12-31";
    if (expA !== expB) return expA < expB ? -1 : 1;
    const buyA = a.purchaseDate || "9999-12-31";
    const buyB = b.purchaseDate || "9999-12-31";
    if (buyA !== buyB) return buyA < buyB ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function fefoDeduct(lots: DeductibleLot[], need: number, mode: "weight" | "count" = "weight"): FefoResult {
  const normalize = (qty: number) => (mode === "count" ? Math.max(0, Math.round(qty)) : toMilli(qty));
  const denormalize = (qty: number) => (mode === "count" ? qty : fromMilli(qty));
  const working = new Map(lots.map((lot) => [lot.id, normalize(lot.qty)]));
  let remaining = normalize(need);
  const deductions: LotDeduction[] = [];

  for (const lot of sortLots(lots)) {
    if (remaining <= 0) break;
    const available = working.get(lot.id) ?? 0;
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    working.set(lot.id, available - take);
    remaining -= take;
    deductions.push({ id: lot.id, qty: denormalize(take) });
  }

  return {
    lots: lots.map((lot) => ({ ...lot, qty: denormalize(working.get(lot.id) ?? 0) })),
    deductions,
    shortage: denormalize(remaining),
  };
}

export function applyLotQty<T extends { id: string; qtyRemainingG?: number; qtyRemaining?: number }>(
  lots: T[],
  deductions: LotDeduction[],
  field: "qtyRemainingG" | "qtyRemaining",
): T[] {
  const taken = new Map(deductions.map((item) => [item.id, item.qty]));
  return lots.map((lot) => {
    const deduct = taken.get(lot.id) ?? 0;
    if (!deduct) return lot;
    const current = field === "qtyRemainingG" ? (lot.qtyRemainingG ?? 0) : (lot.qtyRemaining ?? 0);
    const next = Math.max(0, Math.round((current - deduct) * 1000) / 1000);
    return field === "qtyRemainingG" ? { ...lot, qtyRemainingG: next } : { ...lot, qtyRemaining: next };
  });
}
