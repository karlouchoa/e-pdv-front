import { BomPayload } from "@/modules/core/types";

export const calculateBomTotals = (payload: BomPayload) => {
  const ingredients = payload.items.reduce(
    (sum, item) => sum + item.quantity * item.unitCost,
    0,
  );
  const lotSize = Math.max(payload.lotSize || 0, 1);
  const labor = ingredients * 0.12;
  const packaging = ingredients * 0.08;
  const taxes = ingredients * 0.1;
  const overhead = ingredients * 0.05;
  const total = ingredients + labor + packaging + taxes + overhead;
  const unit = total / lotSize;
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
