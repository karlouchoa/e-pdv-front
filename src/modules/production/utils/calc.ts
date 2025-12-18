import { BomPayload } from "@/modules/core/types";

export const calculateBomTotals = (payload: BomPayload) => {
  const toThree = (value: number) => Number(value.toFixed(3));

  const ingredients = payload.items.reduce((sum, item) => {
    const baseQty = Number(
      Number.isFinite((item as any).quantity_base)
        ? (item as any).quantity_base
        : item.quantity ?? 0,
    );
    const factor = (() => {
      if (Number.isFinite((item as any).fator)) {
        return Number((item as any).fator);
      }
      if (Number.isFinite(item.percentage)) {
        return Number(item.percentage) / 100;
      }
      return 1;
    })();

    const normalizedQty = toThree(baseQty);
    const normalizedFactor = toThree(factor);
    const effectiveQty = toThree(normalizedQty * normalizedFactor);
    const lineTotal = toThree(effectiveQty * item.unitCost);

    return sum + lineTotal;
  }, 0);

  // console.log("Ingredients cost:", ingredients);
  const lotSize = Math.max(payload.lotSize || 0, 1);
  const labor = ingredients * 0.12;
  const packaging = ingredients * 0.08;
  const taxes = ingredients * 0.1;
  const overhead = ingredients * 0.05;
  const total = ingredients; //+ labor + packaging + taxes + overhead;
  const unit = total; //total / lotSize;
  const marginAchieved =
    payload.marginTarget > 0
      ? ((payload.marginTarget - unit) / payload.marginTarget) * 100
      : 0;

  return {
    ingredients,
    labor,
    packaging,
    taxes,
    overhead,
    total,
    unit,
    marginAchieved,
  };
};
