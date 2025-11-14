
import { api } from "@/modules/core/services/api";
import { BomPayload, BomRecord } from "@/modules/core/types";
import { calculateBomTotals } from "@/modules/production/utils/calc";

// ---------------------------------------------
// Conversão mínima da resposta da API
// ---------------------------------------------
const mapBom = (r: any): BomRecord => {
  const payload: BomPayload = {
    productCode: r.product_code ?? "",
    version: r.version ?? "1.0",
    lotSize: Number(r.lot_size ?? 0),
    validityDays: Number(r.validity_days ?? 0),
    marginTarget: Number(r.margin_target ?? 0),
    marginAchieved: Number(r.margin_achieved ?? 0),
    notes: r.notes ?? "",
    items: (r.items ?? []).map((i: any) => ({
      componentCode: i.component_code ?? "",
      description: i.description ?? "",
      quantity: Number(i.quantity ?? 0),
      unitCost: Number(i.unit_cost ?? 0),
    })),
  };

  // Calcula totais
  const totals = calculateBomTotals(payload);

  return {
    ...payload,
    totalCost: totals.total,
    unitCost: totals.unit,
    marginAchieved: totals.marginAchieved,
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
};

// ---------------------------------------------
// GET /production/bom
// ---------------------------------------------
export async function listBomsAxios(): Promise<BomRecord[]> {
  const { data } = await api.get("/production/bom");
  return Array.isArray(data) ? data.map(mapBom) : [];
}

// ---------------------------------------------
// GET /production/bom/:id
// ---------------------------------------------
export async function getBomAxios(id: string): Promise<BomRecord> {
  const { data } = await api.get(`/production/bom/${id}`);
  return mapBom(data);
}

// ---------------------------------------------
// POST /production/bom
// ---------------------------------------------
export async function createBomAxios(payload: BomPayload): Promise<BomRecord> {
  const body = {
    product_code: payload.productCode,
    version: payload.version,
    lot_size: payload.lotSize,
    validity_days: payload.validityDays,
    margin_target: payload.marginTarget,
    margin_achieved: payload.marginAchieved,
    notes: payload.notes,
    items: payload.items.map((i) => ({
      component_code: i.componentCode,
      description: i.description,
      quantity: i.quantity,
      unit_cost: i.unitCost,
    })),
  };

  const { data } = await api.post("/production/bom", body);
  return mapBom(data);
}

// ---------------------------------------------
// PATCH /production/bom/:id
// ---------------------------------------------
export async function updateBomAxios(
  id: string,
  payload: Partial<BomPayload>,
): Promise<BomRecord> {
  const body: any = {};

  if (payload.productCode !== undefined) body.product_code = payload.productCode;
  if (payload.version !== undefined) body.version = payload.version;
  if (payload.lotSize !== undefined) body.lot_size = payload.lotSize;
  if (payload.validityDays !== undefined) body.validity_days = payload.validityDays;
  if (payload.marginTarget !== undefined) body.margin_target = payload.marginTarget;
  if (payload.marginAchieved !== undefined)
    body.margin_achieved = payload.marginAchieved;
  if (payload.notes !== undefined) body.notes = payload.notes;

  if (payload.items) {
    body.items = payload.items.map((i) => ({
      component_code: i.componentCode,
      description: i.description,
      quantity: i.quantity,
      unit_cost: i.unitCost,
    }));
  }

  const { data } = await api.patch(`/production/bom/${id}`, body);
  return mapBom(data);
}

// ---------------------------------------------
// DELETE /production/bom/:id
// ---------------------------------------------
export async function deleteBomAxios(id: string): Promise<void> {
  await api.delete(`/production/bom/${id}`);
}
