export type ProductionStatus =
  | "SEPARACAO"
  | "PRODUCAO"
  | "CONCLUIDA"
  | "CANCELADA";

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  enterprise : string;
  logoUrl: string;
  domain?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

export interface SessionData {
  token: string;
  refreshToken?: string;
  tenant: TenantInfo;
  user: SessionUser;
  expiresIn?: string;
  loginMessage?: string;
  authPayload?: Record<string, unknown>;
  usuario?: string;
  nome?: string;
  deusu?: string;
  admin?: boolean;
  email?: string;
  empresa?: string;
  tenantCode?: string;
  logoUrl?: string;
  mensagem?: string;
}

export interface LoginPayload {
  login: string;
  senha: string;
}

export interface ApiErrorPayload {
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

export interface ProductPayload {
  sku: string;
  name: string;
  unit: string;
  category: string;
  salePrice: number;
  costPrice: number;
  leadTimeDays: number;
  type: "acabado" | "materia-prima";
  description?: string;
  ncm?: string;
  cest?: string;
  cst?: string;
  barcode?: string;
}

export interface Product extends ProductPayload {
  id: string;
  createdAt: string;
}

export interface RawMaterialPayload {
  code: string;
  name: string;
  supplier: string;
  unit: string;
  minimumStock: number;
  cost: number;
  description?: string;
  category?: string;
  ncm?: string;
  cest?: string;
  cst?: string;
  barcode?: string;
}

export interface RawMaterial extends RawMaterialPayload {
  id: string;
  createdAt: string;
}

export interface Category {
  id?: string;
  code?: string;
  description?: string;
  [key: string]: unknown;
}

export interface BomItemPayload {
  componentCode: string;
  description?: string;
  quantity: number;
  unitCost: number;
}

export interface BomPayload {
  productCode: string;
  version: string;
  lotSize: number;
  validityDays: number;
  marginTarget: number;
  marginAchieved: number;
  items: BomItemPayload[];
  notes?: string;
}

export interface BomRecord extends BomPayload {
  id: string;
  totalCost: number;
  unitCost: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductionOrderPayload {
  productCode: string;
  quantityPlanned: number;
  unit: string;
  startDate: string;
  dueDate: string;
  externalCode: string;
  notes?: string;
}

export interface CostBreakdown {
  ingredients: number;
  labor: number;
  packaging: number;
  taxes: number;
  overhead: number;
}

export interface OrderFinishedGood {
  id: string;
  productCode: string;
  lotNumber?: string;
  quantityGood: number;
  quantityScrap: number;
  unitCost?: number;
  postedAt?: string;
}

export interface RecordFinishedGoodPayload {
  productCode: string;
  lotNumber?: string;
  quantityGood: number;
  quantityScrap?: number;
  unitCost?: number;
  postedAt?: string;
}

export interface OrderRawMaterial {
  id: string;
  componentCode: string;
  description?: string;
  quantityUsed: number;
  unit: string;
  unitCost?: number;
  warehouse?: string;
  batchNumber?: string;
  consumedAt?: string;
}

export interface RecordRawMaterialPayload {
  componentCode: string;
  description?: string;
  quantityUsed: number;
  unit: string;
  unitCost?: number;
  warehouse?: string;
  batchNumber?: string;
  consumedAt?: string;
}

export interface ProductionOrder extends ProductionOrderPayload {
  id: string;
  status: ProductionStatus;
  createdAt?: string;
  updatedAt?: string;
  finishedGoods: OrderFinishedGood[];
  rawMaterials: OrderRawMaterial[];
  statusHistory?: ProductionStatusEvent[];
  costBreakdown?: CostBreakdown;
  totalCost?: number;
  unitCost?: number;
}

export interface ProductionStatusEvent {
  id: string;
  orderId: string;
  status: ProductionStatus;
  timestamp: string;
  responsible: string;
  notes?: string;
}

export type InventoryMovementType = "E" | "S";

export interface InventoryDocumentInfo {
  number?: number;
  date?: string;
  type?: string;
}

export interface InventoryCounterpartyInfo {
  code?: number;
  type?: string;
}

export interface InventoryMovementRecord {
  id: number;
  itemId: number;
  date: string;
  type: InventoryMovementType;
  quantity: number;
  unitPrice?: number;
  totalValue?: number;
  previousBalance?: number;
  currentBalance?: number;
  notes?: string;
  document?: InventoryDocumentInfo;
  counterparty?: InventoryCounterpartyInfo;
}

export interface InventoryMovementPayload {
  itemId: number;
  type: InventoryMovementType;
  quantity: number;
  unitPrice?: number;
  document?: InventoryDocumentInfo;
  notes?: string;
  warehouse?: number;
  customerOrSupplier?: number;
  date?: string;
}

export interface InventoryMovementSummary {
  itemId?: number;
  from: string;
  to: string;
  entries: {
    quantity: number;
    value: number;
  };
  exits: {
    quantity: number;
    value: number;
  };
  netQuantity: number;
  currentBalance: number;
}
