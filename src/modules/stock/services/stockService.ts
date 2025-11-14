import {
  InventoryMovementPayload,
  InventoryMovementRecord,
  InventoryMovementSummary,
  InventoryMovementType,
  SessionData,
} from "@/modules/core/types";
import { USE_MOCK_API, sessionRequest } from "@/modules/core/services/apiClient";

type MovementFilters = {
  type: InventoryMovementType;
  from?: string;
  to?: string;
  itemId?: number;
};

type SummaryFilters = {
  from: string;
  to: string;
  itemId?: number;
};

type KardexFilters = {
  from?: string;
  to?: string;
};

type MovementApiRecord = Record<string, unknown>;

type MovementSummaryApiRecord = {
  itemId?: number;
  from: string;
  to: string;
  entries: { quantity: number; value: number };
  exits: { quantity: number; value: number };
  netQuantity: number;
  currentBalance: number;
};

const movementStore: Record<string, InventoryMovementRecord[]> = {};

const ensureStore = (tenant: string) => {
  if (!movementStore[tenant]) {
    movementStore[tenant] = [];
  }
  return movementStore[tenant];
};

let mockIdCounter = 1;

const normalizeNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const normalizeString = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  return String(value);
};

const getValue = (record: MovementApiRecord, keys: string[]) => {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key];
    }
  }
  return undefined;
};

const mapMovementFromApi = (
  record: MovementApiRecord,
): InventoryMovementRecord => {
  const id =
    normalizeNumber(getValue(record, ["id", "nrlan"])) ?? mockIdCounter++;
  const itemId =
    normalizeNumber(getValue(record, ["itemId", "cditem"])) ?? 0;
  const type =
    (getValue(record, ["type", "st"]) as InventoryMovementType) ?? "E";
  const quantity =
    normalizeNumber(getValue(record, ["quantity", "qtde"])) ?? 0;
  return {
    id,
    itemId,
    type,
    date: normalizeString(getValue(record, ["date", "data"])) ?? "",
    quantity,
    unitPrice: normalizeNumber(getValue(record, ["unitPrice", "preco"])),
    totalValue: normalizeNumber(getValue(record, ["totalValue", "valor"])),
    previousBalance: normalizeNumber(
      getValue(record, ["previousBalance", "saldoant"]),
    ),
    currentBalance: normalizeNumber(
      getValue(record, ["currentBalance", "sldatual"]),
    ),
    notes: normalizeString(getValue(record, ["notes", "obs"])),
    document: {
      number: normalizeNumber(getValue(record, ["documentNumber", "numdoc"])),
      date: normalizeString(getValue(record, ["documentDate", "datadoc"])),
      type: normalizeString(getValue(record, ["documentType", "tipdoc"])),
    },
    counterparty: {
      code: normalizeNumber(getValue(record, ["counterpartyCode", "clifor"])),
      type: normalizeString(
        getValue(record, ["counterpartyType", "clifortipo"]),
      ),
    },
  };
};

const mapMovementToApiPayload = (payload: InventoryMovementPayload) => ({
  itemId: payload.itemId,
  type: payload.type,
  quantity: payload.quantity,
  unitPrice: payload.unitPrice,
  document: payload.document,
  notes: payload.notes,
  warehouse: payload.warehouse,
  customerOrSupplier: payload.customerOrSupplier,
  date: payload.date,
});

const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

const mockCreateMovement = async (
  tenant: string,
  payload: InventoryMovementPayload,
) => {
  await delay();
  const entry: InventoryMovementRecord = {
    id: mockIdCounter++,
    itemId: payload.itemId,
    type: payload.type,
    date: payload.date ?? new Date().toISOString(),
    quantity: payload.quantity,
    unitPrice: payload.unitPrice,
    totalValue:
      payload.unitPrice !== undefined
        ? payload.unitPrice * payload.quantity
        : undefined,
    previousBalance: ensureStore(tenant)[0]?.currentBalance ?? 0,
    currentBalance:
      (ensureStore(tenant)[0]?.currentBalance ?? 0) +
      (payload.type === "E" ? payload.quantity : -payload.quantity),
    notes: payload.notes,
    document: payload.document,
    counterparty: payload.customerOrSupplier
      ? { code: payload.customerOrSupplier }
      : undefined,
  };
  ensureStore(tenant).unshift(entry);
  return entry;
};

const mockListMovements = async (
  tenant: string,
  filters?: MovementFilters,
) => {
  await delay();
  let data = ensureStore(tenant);
  if (filters?.type) {
    data = data.filter((entry) => entry.type === filters.type);
  }
  if (filters?.itemId) {
    data = data.filter((entry) => entry.itemId === filters.itemId);
  }
  return data;
};

const mockKardex = async (tenant: string, itemId: number) => {
  await delay();
  return ensureStore(tenant).filter((entry) => entry.itemId === itemId);
};

const mockSummary = async (
  tenant: string,
  filters: SummaryFilters,
): Promise<InventoryMovementSummary> => {
  await delay();
  const movements = ensureStore(tenant).filter((entry) => {
    const inItem =
      filters.itemId === undefined || entry.itemId === filters.itemId;
    return inItem;
  });
  const entries = movements.filter((m) => m.type === "E");
  const exits = movements.filter((m) => m.type === "S");
  const sumQuantity = (data: InventoryMovementRecord[]) =>
    data.reduce((sum, item) => sum + item.quantity, 0);
  const sumValue = (data: InventoryMovementRecord[]) =>
    data.reduce((sum, item) => sum + (item.totalValue ?? 0), 0);
  return {
    itemId: filters.itemId,
    from: filters.from,
    to: filters.to,
    entries: {
      quantity: sumQuantity(entries),
      value: sumValue(entries),
    },
    exits: {
      quantity: sumQuantity(exits),
      value: sumValue(exits),
    },
    netQuantity: sumQuantity(entries) - sumQuantity(exits),
    currentBalance: ensureStore(tenant)[0]?.currentBalance ?? 0,
  };
};

const buildQuery = (params?: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  if (!params) return "";
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
};

export async function createInventoryMovement(
  session: SessionData,
  payload: InventoryMovementPayload,
) {
  if (USE_MOCK_API) {
    return mockCreateMovement(session.tenant.slug, payload);
  }
  const response = await sessionRequest<MovementApiRecord>(session, {
    path: "/inventory/movements",
    method: "POST",
    data: mapMovementToApiPayload(payload),
  });
  return mapMovementFromApi(response);
}

export async function listInventoryMovements(
  session: SessionData,
  filters: MovementFilters,
) {
  if (USE_MOCK_API) {
    return mockListMovements(session.tenant.slug, filters);
  }
  const query = buildQuery({
    type: filters.type,
    from: filters.from,
    to: filters.to,
    itemId: filters.itemId,
  });
  const response = await sessionRequest<MovementApiRecord[]>(session, {
    path: `/inventory/movements${query}`,
    method: "GET",
  });
  return Array.isArray(response)
    ? response.map(mapMovementFromApi)
    : [];
}

export async function getItemKardex(
  session: SessionData,
  itemId: number,
  filters?: KardexFilters,
) {
  if (USE_MOCK_API) {
    return mockKardex(session.tenant.slug, itemId);
  }
  const query = buildQuery({
    from: filters?.from,
    to: filters?.to,
  });
  const response = await sessionRequest<MovementApiRecord[]>(session, {
    path: `/inventory/movements/${itemId}${query}`,
    method: "GET",
  });
  return Array.isArray(response)
    ? response.map(mapMovementFromApi)
    : [];
}

export async function getMovementSummary(
  session: SessionData,
  filters: SummaryFilters,
) {
  if (USE_MOCK_API) {
    return mockSummary(session.tenant.slug, filters);
  }
  const query = buildQuery({
    from: filters.from,
    to: filters.to,
    itemId: filters.itemId,
  });
  const response = await sessionRequest<MovementSummaryApiRecord>(session, {
    path: `/inventory/movements/summary${query}`,
    method: "GET",
  });
  return response as InventoryMovementSummary;
}
