import type { Container, Ingredient, IngredientLot, ContainerLot } from "../types";

export function effectiveCostPerG(ingredient: Ingredient): number | null {
  if (ingredient.costOverridePerG != null && Number.isFinite(ingredient.costOverridePerG)) {
    return ingredient.costOverridePerG;
  }
  const quote = ingredient.quotes.find((item) => item.id === ingredient.activeQuoteId);
  if (quote && Number.isFinite(quote.costPerG)) return quote.costPerG;
  return null;
}

export function effectiveUnitCost(container: Container): number | null {
  if (container.costOverrideUsd != null && Number.isFinite(container.costOverrideUsd)) {
    return container.costOverrideUsd;
  }
  const quote = container.quotes.find((item) => item.id === container.activeQuoteId);
  if (quote && Number.isFinite(quote.unitCostUsd)) return quote.unitCostUsd;
  return null;
}

export function ingredientOnHand(lots: IngredientLot[], ingredientId: string): number {
  return lots.filter((lot) => lot.ingredientId === ingredientId).reduce((sum, lot) => sum + lot.qtyRemainingG, 0);
}

export function containerOnHand(lots: ContainerLot[], containerId: string): number {
  return lots.filter((lot) => lot.containerId === containerId).reduce((sum, lot) => sum + lot.qtyRemaining, 0);
}

export function ingredientMap(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map((item) => [item.id, item]));
}

export function recomputeIngredientQuote(quote: Ingredient["quotes"][number]): Ingredient["quotes"][number] {
  const costPerG = quote.packSizeG > 0 ? quote.priceUsd / quote.packSizeG : quote.costPerG;
  return { ...quote, costPerG };
}

export function recomputeContainerQuote(quote: Container["quotes"][number]): Container["quotes"][number] {
  const unitCostUsd = quote.packQty > 0 ? quote.priceUsd / quote.packQty : quote.unitCostUsd;
  return { ...quote, unitCostUsd };
}
