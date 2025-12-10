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
  status?: string;
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

export type RawMaterialIssueItemPayload = {
  componentCode: string;
  quantityUsed: number;
  unit: string;
  unitCost?: number;
  warehouse?: string | null;
  batchNumber?: string | null;
  consumedAt?: string | null;
  description?: string | null;
};

export type IssueRawMaterialsPayload = {
  warehouse?: string | null;
  user?: string | null;
  responsible?: string | null;
  notes?: string | null;
  rawMaterials: RawMaterialIssueItemPayload[];
};

export type CompleteProductionOrderPayload = {
  productCode?: string;
  quantity: string; // numeric string
  unitCost?: string; // numeric string
  warehouse: string; // numeric string
  lotNumber?: string;
  postedAt?: string;
  user?: string;
  responsible?: string;
  notes?: string;
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

const mapIssueRawMaterialsToApiPayload = (
  payload: IssueRawMaterialsPayload,
) => ({
  warehouse: payload.warehouse ?? undefined,
  user: payload.user ?? undefined,
  responsible: payload.responsible ?? undefined,
  notes: payload.notes ?? undefined,
  raw_materials: payload.rawMaterials.map((item) => ({
    component_code: item.componentCode,
    quantity_used: item.quantityUsed,
    unit: item.unit,
    unit_cost: item.unitCost,
    warehouse: item.warehouse ?? undefined,
    batch_number: item.batchNumber ?? undefined,
    consumed_at: item.consumedAt ?? undefined,
    description: item.description ?? undefined,
  })),
});

const mapCompleteProductionOrderToApiPayload = (
  payload: CompleteProductionOrderPayload,
) => ({
  product_code: payload.productCode,
  quantity: payload.quantity,
  unit_cost: payload.unitCost,
  warehouse: payload.warehouse,
  lot_number: payload.lotNumber,
  posted_at: payload.postedAt,
  user: payload.user,
  responsible: payload.responsible,
  notes: payload.notes,
});

type ProductionOrderApiRecord = {
  id: string;
  OP?: string;
  external_code?: string;
  product_code?: string;
  product_name?: string;
  productName?: string;
  product?: string;
  product_description?: string;
  productDescription?: string;
  description?: string;
  deitem?: string;
  nomeproduto?: string;
  nomeProduto?: string;
  author_user?: string;
  authoruser?: string;
  author?: string;
  quantity_planned?: number;
  unit?: string;
  start_date?: string;
  due_date?: string;
  notes?: string;
  status?: ProductionStatus;
  is_composed?: boolean;
  is_raw_material?: boolean;
  created_at?: string;
  updated_at?: string;
  finished_goods?: OrderFinishedGoodApi[];
  raw_materials?: OrderRawMaterialApi[];
  status_history?: ProductionStatusEventApi[];
  total_cost?: number;
  unit_cost?: number;
  ingredients?: number;
  labor?: number;
  packaging?: number;
  taxes?: number;
  totalCost?: number;
  unitCost?: number;
  cost_breakdown?: CostBreakdownApi;
  bom_id?: string; 
  reference_bom?: ReferenceBomApi;
  bom_totals?: BomTotalsApi;
  bom_items?: BomItemApi[];
  boxes_qty?: number;
  box_cost?: number;
  labor_per_unit?: number;
  sale_price?: number;
  markup?: number;
  post_sale_tax?: number;
  lote?: number | null;
  validate?: string | null;
  custom_validate_date?: string | null;
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
  quantity?: number;
  quantity_used?: number;
  planned_quantity?: number;
  planned_cost?: number;
  unit?: string;
  unit_cost?: number;
  warehouse?: string;
  batch_number?: string;
  consumed_at?: string;
};

type ProductionStatusEventApi = {
  id: string;
  name?: string;
  order_id?: string;
  status?: ProductionStatus;
  event_time?: string;
  responsible?: string;
  author_user?: string;
  authoruser?: string;
  notes?: string;
  OP?: string; // Added OP property
};

type CostBreakdownApi = {
  ingredients?: number;
  labor?: number;
  packaging?: number;
  taxes?: number;
  overhead?: number;
};

type ReferenceBomApi = {
    product_code?: string;
    version?: string;
    lot_size?: number;
    validity_days?: number;
    planned_cost?: number;
  };
  
  type BomTotalsApi = {
    total_quantity?: number;
    total_cost?: number;
    ingredients?: number;
    labor?: number;
    packaging?: number;
    taxes?: number;
    totalCost?: number;
    unitCost?: number;
  };
  
  type BomItemApi = {
    component_code?: string;
    description?: string;
    quantity?: number;
    planned_quantity?: number;
    unit_cost?: number;
    planned_cost?: number;
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
  quantity: Number(item.quantity ?? 0),
  plannedQuantity: Number(item.planned_quantity ?? 0),
  plannedcost: Number(item.planned_cost ?? 0),
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
  name: item.name ?? "",
  orderId: item.order_id ?? "",
  OP: item.OP ?? "", // Add the OP property mapping
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

const resolveProductNameFromApi = (record: ProductionOrderApiRecord) => {
  const candidates = [
    (record as Record<string, unknown>)?.product_name,
    (record as Record<string, unknown>)?.productName,
    (record as Record<string, unknown>)?.product,
    (record as Record<string, unknown>)?.product_description,
    (record as Record<string, unknown>)?.productDescription,
    (record as Record<string, unknown>)?.deitem,
    (record as Record<string, unknown>)?.description,
    (record as Record<string, unknown>)?.nomeproduto,
    (record as Record<string, unknown>)?.nomeProduto,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
};

const mapOrderFromApi = (record: ProductionOrderApiRecord): ProductionOrder => ({
  id: record.id,
  OP: record.OP ?? "",      
  productCode: record.product_code ?? "",
  productName: resolveProductNameFromApi(record),
  author_user:
    typeof record.author_user === "string" ? record.author_user :
    typeof record.authoruser === "string" ? record.authoruser :
    typeof (record as Record<string, unknown>)?.author === "string" ? String((record as Record<string, unknown>)?.author) :
    undefined,
  quantityPlanned: Number(record.quantity_planned ?? 0),
  unit: record.unit ?? "UN",
  startDate: record.start_date ?? "",
  dueDate: record.due_date ?? "",
  externalCode: record.external_code ?? "",
  notes: record.notes ?? "",
  status: record.status ?? "SEPARACAO",
  // statusRaw preserva o valor original do backend (pode não ser parte do tipo)
  // @ts-expect-error campo extra para diagnóstico
  statusRaw: record.status ?? undefined,

  createdAt: record.created_at,
  updatedAt: record.updated_at,

  finishedGoods: (record.finished_goods ?? []).map(mapFinishedGoodFromApi),
  rawMaterials: (record.raw_materials ?? []).map(mapRawMaterialFromApi),
  statusHistory: (record.status_history ?? []).map(mapStatusEventFromApi),

  // ----------------------------
  // 🔹 CUSTOS CALCULADOS PELO BACKEND
  // ----------------------------
  totalCost: record.totalCost != null ? Number(record.totalCost) : 0,
  unitCost: record.unitCost != null ? Number(record.unitCost) : 0,

  // 🔹 Mantido para compatibilidade com UI
  costBreakdown: mapCostBreakdownFromApi(record.cost_breakdown),

  // ----------------------------
  // 🔹 CAMPOS DO FORMULÁRIO
  // ----------------------------
  bomId: record.bom_id ?? "",
  boxesQty: Number(record.boxes_qty ?? 0),
  boxCost: Number(record.box_cost ?? 0),
  laborPerUnit: Number(record.labor_per_unit ?? 0),
  salePrice: Number(record.sale_price ?? 0),
  markup: Number(record.markup ?? 0),
  postSaleTax: Number(record.post_sale_tax ?? 0),

  lote: record.lote ?? null,
  validate: record.validate ?? null,
  customValidateDate: record.custom_validate_date ?? null,

  // ----------------------------
  // 🔹 Dados de referência da BOM (não mais enviados pelo front)
  // ----------------------------
  referenceBom: {
    productCode: record.reference_bom?.product_code ?? "",
    version: record.reference_bom?.version ?? "",
    lotSize: Number(record.reference_bom?.lot_size ?? 0),
    validityDays: Number(record.reference_bom?.validity_days ?? 0),
  },

  // ----------------------------
  // 🔹 Itens da BOM (calculados no backend)
  // ----------------------------
  bomItems: (record.bom_items ?? []).map((item) => ({
    componentCode: item.component_code ?? "",
    description: item.description ?? "",
    quantity: Number(item.quantity ?? 0),
    plannedQuantity: Number(item.planned_quantity ?? 0),
    unitCost: Number(item.unit_cost ?? 0),
    plannedCost: Number(item.planned_cost ?? 0),
  })),
});


const mapOrderToApiPayload = (payload: ProductionOrderPayload) => ({
  external_code: payload.externalCode,
  product_code: payload.productCode,
  quantity_planned: payload.quantityPlanned,
  unit: payload.unit,
  start_date: payload.startDate,
  due_date: payload.dueDate,
  notes: payload.notes ?? "",

  bom_id: payload.bomId,
  lote: payload.lote,
  validate: payload.validate,
  custom_validate_date: payload.customValidateDate,
  author_user: payload.authoruser,

  boxes_qty: payload.boxesQty,
  box_cost: payload.boxCost,
  labor_per_unit: payload.laborPerUnit,
  sale_price: payload.salePrice,
  markup: payload.markup,
  post_sale_tax: payload.postSaleTax,

  raw_materials: payload.rawMaterials.map((i) => ({
    component_code: i.componentCode,
    description: i.description,
    quantity_used: i.quantityUsed,
    unit: i.unit,
    unit_cost: i.unitCost,
    warehouse: i.warehouse,
    batch_number: i.batchNumber,
  })),
});

const mapOrderUpdateToApiPayload = (
  payload: ProductionOrderUpdatePayload,
) => {
  const body: Record<string, unknown> = {};

  // ------------------------------
  // 🔹 CAMPOS BÁSICOS DA ORDEM
  // ------------------------------
  if (payload.externalCode !== undefined)
    body.external_code = payload.externalCode;

  if (payload.productCode !== undefined)
    body.product_code = payload.productCode;

  if (payload.quantityPlanned !== undefined)
    body.quantity_planned = payload.quantityPlanned;

  if (payload.unit !== undefined)
    body.unit = payload.unit;

  if (payload.startDate !== undefined)
    body.start_date = payload.startDate;

  if (payload.dueDate !== undefined)
    body.due_date = payload.dueDate;

  if (payload.notes !== undefined)
    body.notes = sanitizeNotes(payload.notes);

  // ------------------------------
  // 🔹 DADOS DE BOM / COMPOSIÇÃO
  // ------------------------------
  if (payload.bomId !== undefined)
    body.bom_id = payload.bomId;

  // if (payload.isComposed !== undefined)
  //   body.is_composed = payload.isComposed;

  // if (payload.isRawMaterial !== undefined)
  //   body.is_raw_material = payload.isRawMaterial;

  // ------------------------------
  // 🔹 DADOS DE VALIDADE
  // ------------------------------
  if (payload.lote !== undefined)
    body.lote = payload.lote;

  if (payload.validate !== undefined)
    body.validate = payload.validate;

  if (payload.customValidateDate !== undefined)
    body.custom_validate_date = payload.customValidateDate;

  // ------------------------------
  // 🔹 CUSTOS E DADOS DA FICHA
  // ------------------------------
  if (payload.boxesQty !== undefined)
    body.boxes_qty = payload.boxesQty;

  if (payload.boxCost !== undefined)
    body.box_cost = payload.boxCost;

  if (payload.laborPerUnit !== undefined)
    body.labor_per_unit = payload.laborPerUnit;

  if (payload.salePrice !== undefined)
    body.sale_price = payload.salePrice;

  if (payload.markup !== undefined)
    body.markup = payload.markup;

  if (payload.postSaleTax !== undefined)
    body.post_sale_tax = payload.postSaleTax;

  // ------------------------------
  // 🔹 RAW MATERIALS (somente se houver)
  // ------------------------------
  if (payload.rawMaterials !== undefined) {
    body.raw_materials = payload.rawMaterials.map((item) => ({
      component_code: item.componentCode,
      description: item.description,
      quantity_used: item.quantityUsed,
      unit: item.unit,
      unit_cost: item.unitCost,
      warehouse: item.warehouse,
      batch_number: item.batchNumber,
    }));
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

const buildTenantHeaders = (session: SessionData) => {
  const headers: Record<string, string> = {};
  if (session.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  if (session.tenant?.slug) {
    headers["X-Tenant"] = session.tenant.slug;
  }
  return headers;
};


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

  console.log("createProductionOrder response:", response);
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
  if (filters?.status) {
    query.status = filters.status;
  }
  const path = buildQueryPath("/production/orders", query);
  const response = await sessionRequest<ProductionOrderApiRecord[]>(session, {
    path,
    method: "GET",
  });

  console.log("listProductionOrders response:", response);
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

export async function getProductionOrderByOp(
  session: SessionData,
  op: string,
) {
  const response = await sessionRequest<ProductionOrderApiRecord>(session, {
    path: `/production/orders/${op}`,
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

export async function issueRawMaterials(
  session: SessionData,
  orderId: string,
  payload: IssueRawMaterialsPayload,
) {
  const response = await sessionRequest<ProductionStatusEventApi>(session, {
    path: `/production/orders/${orderId}/issue-raw-materials`,
    method: "POST",
    data: mapIssueRawMaterialsToApiPayload(payload),
  });
  return mapStatusEventFromApi(response);
}

export async function completeProductionOrder(
  session: SessionData,
  orderId: string,
  payload: CompleteProductionOrderPayload,
) {
  const response = await sessionRequest<ProductionOrderApiRecord>(session, {
    path: `/production/orders/${orderId}/complete`,
    method: "POST",
    data: mapCompleteProductionOrderToApiPayload(payload),
  });
  return mapOrderFromApi(response);
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
  const response = await api.post<OrderFinishedGoodApi>(
    `/production/orders/${orderId}/finished-goods`,
    mapFinishedGoodToApiPayload(payload),
    { headers: buildTenantHeaders(session) },
  );
  return mapFinishedGoodFromApi(response.data);
}

export async function listFinishedGoods(
  session: SessionData,
  orderId: string,
) {
  const response = await api.get<OrderFinishedGoodApi[]>(
    `/production/orders/${orderId}/finished-goods`,
    { headers: buildTenantHeaders(session) },
  );
  const data = response.data;
  return Array.isArray(data)
    ? data.map(mapFinishedGoodFromApi)
    : [];
}

export async function recordRawMaterial(
  session: SessionData,
  orderId: string,
  payload: RecordRawMaterialPayload,
) {
  const response = await api.post<OrderRawMaterialApi>(
    `/production/orders/${orderId}/raw-materials`,
    mapRawMaterialToApiPayload(payload),
    {
      headers: buildTenantHeaders(session),
    },
  );
  return mapRawMaterialFromApi(response.data);
}

export async function listRawMaterials(
  session: SessionData,
  orderId: string,
) {
  const response = await api.get<OrderRawMaterialApi[]>(
    `/production/orders/${orderId}/raw-materials`,
    {
      headers: buildTenantHeaders(session),
    },
  );
  const data = response.data;
  return Array.isArray(data)
    ? data.map(mapRawMaterialFromApi)
    : [];
}
