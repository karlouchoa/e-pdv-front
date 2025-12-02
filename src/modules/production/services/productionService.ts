import {
  BomItemPayload,
  BomPayload,
  BomRecord,
  ProductionOrder,
  ProductionOrderPayload,
  OrderFinishedGood,
  OrderRawMaterial,
  ProductionStatus,
  ProductionStatusEvent,
  SessionData,
  CostBreakdown,
  RecordFinishedGoodPayload,
  RecordRawMaterialPayload,
} from "@/modules/core/types";
import { sessionRequest } from "@/modules/core/services/apiClient";
import { calculateBomTotals } from "@/modules/production/utils/calc";
import { api } from "@/modules/core/services/api";

const FORMULAS_ENDPOINT = "/T_FORMULAS";
const LAST_BOM_VERSION_ENDPOINT = "production/bom/product/";

const DEBUG_API =
  process.env.NEXT_PUBLIC_DEBUG_API?.toLowerCase() === "true";

const buildQueryPath = (
  basePath: string,
  query?: Record<string, string>,
) => {
  if (!query || Object.keys(query).length === 0) {
    return basePath;
  }
  const search = new URLSearchParams(query);
  return `${basePath}?${search.toString()}`;
};

export type ProductionOrderFilters = {
  externalCode?: string;
  productCode?: string;
};

export type ProductionOrderUpdatePayload = Partial<ProductionOrderPayload>;

export type BomUpdatePayload = Partial<Omit<BomPayload, "items">> & {
  items?: BomItemPayload[];
};

export type RegisterOrderStatusPayload = {
  status: ProductionStatus;
  responsible: string;
  eventTime?: string;
  remarks?: string;
};

type BomItemApiRecord = {
  component_code?: string;
  description?: string;
  quantity?: number;
  unit_cost?: number;
};

type BomApiRecord = {
  id: string;
  product_code?: string;
  version?: string;
  lot_size?: number;
  validity_days?: number;
  margin_target?: number;
  margin_achieved?: number;
  notes?: string;
  items?: BomItemApiRecord[];
  created_at?: string;
  updated_at?: string;
};

const sanitizeNotes = (value?: string) => {
  if (!value) return undefined;
  return value.length > 2000 ? value.slice(0, 2000) : value;
};

const mapBomItemFromApi = (item: BomItemApiRecord): BomItemPayload => ({
  componentCode: item.component_code ?? "",
  description: item.description ?? undefined,
  quantity: Number(item.quantity ?? 0),
  unitCost: Number(item.unit_cost ?? 0),
});

const mapBomItemToApiPayload = (item: BomItemPayload) => ({
  component_code: item.componentCode,
  description: item.description,
  quantity: item.quantity,
  unit_cost: item.unitCost,
});

const mapBomFromApi = (record: BomApiRecord): BomRecord => {
  const items = (record.items ?? []).map(mapBomItemFromApi);
  const payload: BomPayload = {
    productCode: record.product_code ?? "",
    version: record.version ?? "1.0",
    lotSize: Number(record.lot_size ?? 0),
    validityDays: Number(record.validity_days ?? 0),
    marginTarget: Number(record.margin_target ?? 0),
    marginAchieved: Number(record.margin_achieved ?? 0),
    notes: record.notes ?? undefined,
    items,
  };
  const totals = calculateBomTotals(payload);
  return {
    ...payload,
    marginAchieved:
      payload.marginAchieved || totals.marginAchieved,
    totalCost: totals.total,
    unitCost: totals.unit,
    id: record.id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
};

const mapBomToApiPayload = (payload: BomPayload) => ({
  product_code: payload.productCode,
  version: payload.version,
  lot_size: payload.lotSize,
  validity_days: payload.validityDays,
  margin_target: payload.marginTarget,
  margin_achieved: payload.marginAchieved,
  notes: sanitizeNotes(payload.notes),
  items: payload.items.map(mapBomItemToApiPayload),
});

const mapBomUpdateToApiPayload = (payload: BomUpdatePayload) => {
  const body: Record<string, unknown> = {};
  if (payload.productCode !== undefined) {
    body.product_code = payload.productCode;
  }
  if (payload.version !== undefined) {
    body.version = payload.version;
  }
  if (payload.lotSize !== undefined) {
    body.lot_size = payload.lotSize;
  }
  if (payload.validityDays !== undefined) {
    body.validity_days = payload.validityDays;
  }
  if (payload.marginTarget !== undefined) {
    body.margin_target = payload.marginTarget;
  }
  if (payload.marginAchieved !== undefined) {
    body.margin_achieved = payload.marginAchieved;
  }
  if (payload.notes !== undefined) {
    body.notes = sanitizeNotes(payload.notes);
  }
  if (payload.items) {
    body.items = payload.items.map(mapBomItemToApiPayload);
  }
  return body;
};

type ProductionOrderApiRecord = {
  id: string;
  external_code?: string;
  product_code?: string;
  quantity_planned?: number;
  unit?: string;
  start_date?: string;
  due_date?: string;
  notes?: string;
  status?: ProductionStatus;
  created_at?: string;
  updated_at?: string;
  finished_goods?: OrderFinishedGoodApi[];
  raw_materials?: OrderRawMaterialApi[];
  status_history?: ProductionStatusEventApi[];
  total_cost?: number;
  unit_cost?: number;
  cost_breakdown?: CostBreakdownApi;
  bom_id?: string; // Added bom_id property
};

type OrderFinishedGoodApi = {
  id: string;
  product_code?: string;
  lot_number?: string;
  quantity_good?: number;
  quantity_scrap?: number;
  unit_cost?: number;
  posted_at?: string;
};

type OrderRawMaterialApi = {
  id: string;
  component_code?: string;
  description?: string;
  quantity_used?: number;
  unit?: string;
  unit_cost?: number;
  warehouse?: string;
  batch_number?: string;
  consumed_at?: string;
};

type ProductionStatusEventApi = {
  id: string;
  order_id?: string;
  status?: ProductionStatus;
  event_time?: string;
  responsible?: string;
  notes?: string;
};

type CostBreakdownApi = {
  ingredients?: number;
  labor?: number;
  packaging?: number;
  taxes?: number;
  overhead?: number;
};

const mapFinishedGoodFromApi = (
  item: OrderFinishedGoodApi,
): OrderFinishedGood => ({
  id: item.id,
  productCode: item.product_code ?? "",
  lotNumber: item.lot_number,
  quantityGood: Number(item.quantity_good ?? 0),
  quantityScrap: Number(item.quantity_scrap ?? 0),
  unitCost:
    item.unit_cost === undefined ? undefined : Number(item.unit_cost),
  postedAt: item.posted_at,
});

const mapRawMaterialFromApi = (
  item: OrderRawMaterialApi,
): OrderRawMaterial => ({
  id: item.id,
  componentCode: item.component_code ?? "",
  description: item.description,
  quantityUsed: Number(item.quantity_used ?? 0),
  unit: item.unit ?? "UN",
  unitCost: item.unit_cost === undefined ? undefined : Number(item.unit_cost),
  warehouse: item.warehouse,
  batchNumber: item.batch_number,
  consumedAt: item.consumed_at,
});

const mapStatusEventFromApi = (
  item: ProductionStatusEventApi,
): ProductionStatusEvent => ({
  id: item.id,
  orderId: item.order_id ?? "",
  status: item.status ?? "SEPARACAO",
  timestamp: item.event_time ?? "",
  responsible: item.responsible ?? "Sistema",
  notes: item.notes,
});

const mapCostBreakdownFromApi = (
  value?: CostBreakdownApi,
): CostBreakdown => ({
  ingredients: Number(value?.ingredients ?? 0),
  labor: Number(value?.labor ?? 0),
  packaging: Number(value?.packaging ?? 0),
  taxes: Number(value?.taxes ?? 0),
  overhead: Number(value?.overhead ?? 0),
});

const mapOrderFromApi = (record: ProductionOrderApiRecord): ProductionOrder => ({
  id: record.id,
  productCode: record.product_code ?? "",
  quantityPlanned: Number(record.quantity_planned ?? 0),
  unit: record.unit ?? "UN",
  startDate: record.start_date ?? "",
  dueDate: record.due_date ?? "",
  externalCode: record.external_code ?? "",
  notes: record.notes ?? "",
  status: record.status ?? "SEPARACAO",
  createdAt: record.created_at,
  updatedAt: record.updated_at,
  finishedGoods: (record.finished_goods ?? []).map(mapFinishedGoodFromApi),
  rawMaterials: (record.raw_materials ?? []).map(mapRawMaterialFromApi),
  statusHistory: (record.status_history ?? []).map(mapStatusEventFromApi),
  totalCost:
    record.total_cost === undefined ? undefined : Number(record.total_cost),
  unitCost:
    record.unit_cost === undefined ? undefined : Number(record.unit_cost),
  costBreakdown: mapCostBreakdownFromApi(record.cost_breakdown),
  bomId: record.bom_id ?? "", // Ensure bomId is mapped
});

const mapOrderToApiPayload = (payload: ProductionOrderPayload) => ({
  external_code: payload.externalCode,
  product_code: payload.productCode,
  quantity_planned: payload.quantityPlanned,
  unit: payload.unit,
  start_date: payload.startDate,
  due_date: payload.dueDate,
  notes: sanitizeNotes(payload.notes) ?? "",
});

const mapOrderUpdateToApiPayload = (
  payload: ProductionOrderUpdatePayload,
) => {
  const body: Record<string, unknown> = {};
  if (payload.externalCode !== undefined) {
    body.external_code = payload.externalCode;
  }
  if (payload.productCode !== undefined) {
    body.product_code = payload.productCode;
  }
  if (payload.quantityPlanned !== undefined) {
    body.quantity_planned = payload.quantityPlanned;
  }
  if (payload.unit !== undefined) {
    body.unit = payload.unit;
  }
  if (payload.startDate !== undefined) {
    body.start_date = payload.startDate;
  }
  if (payload.dueDate !== undefined) {
    body.due_date = payload.dueDate;
  }
  if (payload.notes !== undefined) {
    body.notes = sanitizeNotes(payload.notes);
  }
  return body;
};

const mapStatusRegistrationToApiPayload = (
  payload: RegisterOrderStatusPayload,
) => ({
  status: payload.status,
  responsible: payload.responsible,
  event_time: payload.eventTime,
  remarks: payload.remarks,
});

const mapFinishedGoodToApiPayload = (
  payload: RecordFinishedGoodPayload,
) => ({
  product_code: payload.productCode,
  lot_number: payload.lotNumber,
  quantity_good: payload.quantityGood,
  quantity_scrap: payload.quantityScrap ?? 0,
  unit_cost: payload.unitCost,
  posted_at: payload.postedAt,
});

const mapRawMaterialToApiPayload = (
  payload: RecordRawMaterialPayload,
) => ({
  component_code: payload.componentCode,
  description: payload.description,
  quantity_used: payload.quantityUsed,
  unit: payload.unit,
  unit_cost: payload.unitCost,
  warehouse: payload.warehouse,
  batch_number: payload.batchNumber,
  consumed_at: payload.consumedAt,
});


// export async function listProductFormulas(
//   session: SessionData,
//   productCode: string,
// ) {
//   if (!productCode) {
//     return [];
//   }
  
//   const path = buildQueryPath(FORMULAS_ENDPOINT, {
//     tabela: "T_FORMULAS",
//     cditem: productCode,
//   });

//   if (DEBUG_API) {
//     console.debug("[productionService] listProductFormulas request", {
//       path,
//       productCode,
//       tenant: session.tenant?.slug,
//     });
//   }
//   try {
//     return await sessionRequest<unknown>(session, {
//       path,
//       method: "GET",
//     });
//   } catch (error) {
//     if (DEBUG_API) {
//       console.error(
//         "[productionService] listProductFormulas error",
//         { path, productCode },
//         error,
//       );
//     }
//     throw error;
//   }
// }

// productionService.ts


export interface BomResponse {
  id: string;
  product_code: string;
  version: string;
  lot_size: number | string;
  validity_days: number;
  margin_target: number | string;
  margin_achieved: number | string;
  total_cost: number | string;
  unit_cost: number | string;
  notes?: string | null;
  items: any[];
}

export async function listProductFormulas(
  session: SessionData,
  productCode: string,
): Promise<BomResponse | null> {
  if (!productCode) return null;

  return sessionRequest<BomResponse>(session, {
    path: buildQueryPath(LAST_BOM_VERSION_ENDPOINT + productCode),
    method: "GET",
  });
}



export async function listBoms(session: SessionData) {
  const response = await sessionRequest<BomApiRecord[]>(session, {
    path: "/production/bom",
    method: "GET",
  });
  return Array.isArray(response) ? response.map(mapBomFromApi) : [];
}

export async function getBom(session: SessionData, id: string) {
  const response = await sessionRequest<BomApiRecord>(session, {
    path: `/production/bom/${id}`,
    method: "GET",
  });
  return mapBomFromApi(response);
}

export async function createBom(session: SessionData, payload: BomPayload) {
  const response = await sessionRequest<BomApiRecord>(session, {
    path: "/production/bom",
    method: "POST",
    data: mapBomToApiPayload(payload),
  });
  return mapBomFromApi(response);
}

export async function updateBom(
  session: SessionData,
  id: string,
  payload: BomUpdatePayload,
) {
  const response = await sessionRequest<BomApiRecord>(session, {
    path: `/production/bom/${id}`,
    method: "PATCH",
    data: mapBomUpdateToApiPayload(payload),
  });
  return mapBomFromApi(response);
}

export async function deleteBom(session: SessionData, id: string) {
  await sessionRequest<void>(session, {
    path: `/production/bom/${id}`,
    method: "DELETE",
  });
}

export async function createProductionOrder(
  session: SessionData,
  payload: ProductionOrderPayload,
) {
  const response = await sessionRequest<ProductionOrderApiRecord>(session, {
    path: "/production/orders",
    method: "POST",
    data: mapOrderToApiPayload(payload),
  });
  return mapOrderFromApi(response);
}

export async function listProductionOrders(
  session: SessionData,
  filters?: ProductionOrderFilters,
) {
  const query: Record<string, string> = {};
  if (filters?.externalCode) {
    query.external_code = filters.externalCode;
  }
  if (filters?.productCode) {
    query.product_code = filters.productCode;
  }
  const path = buildQueryPath("/production/orders", query);
  const response = await sessionRequest<ProductionOrderApiRecord[]>(session, {
    path,
    method: "GET",
  });
  return Array.isArray(response) ? response.map(mapOrderFromApi) : [];
}

export async function getProductionOrder(
  session: SessionData,
  orderId: string,
) {
  const response = await sessionRequest<ProductionOrderApiRecord>(session, {
    path: `/production/orders/${orderId}`,
    method: "GET",
  });
  return mapOrderFromApi(response);
}

export async function updateProductionOrder(
  session: SessionData,
  orderId: string,
  payload: ProductionOrderUpdatePayload,
) {
  const response = await sessionRequest<ProductionOrderApiRecord>(session, {
    path: `/production/orders/${orderId}`,
    method: "PATCH",
    data: mapOrderUpdateToApiPayload(payload),
  });
  return mapOrderFromApi(response);
}

export async function registerOrderStatus(
  session: SessionData,
  orderId: string,
  payload: RegisterOrderStatusPayload,
) {
  const response = await sessionRequest<ProductionStatusEventApi>(session, {
    path: `/production/orders/${orderId}/status`,
    method: "POST",
    data: mapStatusRegistrationToApiPayload(payload),
  });
  return mapStatusEventFromApi(response);
}

export async function listOrderStatusEvents(
  session: SessionData,
  orderId: string,
) {
  const response = await sessionRequest<ProductionStatusEventApi[]>(session, {
    path: `/production/orders/${orderId}/status`,
    method: "GET",
  });
  return Array.isArray(response)
    ? response.map(mapStatusEventFromApi)
    : [];
}

export async function recordFinishedGood(
  session: SessionData,
  orderId: string,
  payload: RecordFinishedGoodPayload,
) {
  const response = await sessionRequest<OrderFinishedGoodApi>(session, {
    path: `/production/orders/${orderId}/finished-goods`,
    method: "POST",
    data: mapFinishedGoodToApiPayload(payload),
  });
  return mapFinishedGoodFromApi(response);
}

export async function listFinishedGoods(
  session: SessionData,
  orderId: string,
) {
  const response = await sessionRequest<OrderFinishedGoodApi[]>(session, {
    path: `/production/orders/${orderId}/finished-goods`,
    method: "GET",
  });
  return Array.isArray(response)
    ? response.map(mapFinishedGoodFromApi)
    : [];
}

export async function recordRawMaterial(
  session: SessionData,
  orderId: string,
  payload: RecordRawMaterialPayload,
) {
  const response = await sessionRequest<OrderRawMaterialApi>(session, {
    path: `/production/orders/${orderId}/raw-materials`,
    method: "POST",
    data: mapRawMaterialToApiPayload(payload),
  });
  return mapRawMaterialFromApi(response);
}

export async function listRawMaterials(
  session: SessionData,
  orderId: string,
) {
  const response = await sessionRequest<OrderRawMaterialApi[]>(session, {
    path: `/production/orders/${orderId}/raw-materials`,
    method: "GET",
  });
  return Array.isArray(response)
    ? response.map(mapRawMaterialFromApi)
    : [];
}
