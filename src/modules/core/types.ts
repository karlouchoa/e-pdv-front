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

export interface UserCompany {
  id: string;
  code: string;
  name: string;
  label: string;
}

export interface SessionData {
  token: string;
  refreshToken?: string;
  tenant: TenantInfo;
  user: SessionUser;
  warehouse?: string | null;
  warehouseLabel?: string | null;
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
  qtembitem: number;
  salePrice: number;
  costPrice: number;
  leadTimeDays: number;
  type: "acabado" | "materia-prima";
  description?: string;
  ncm?: string;
  cest?: string;
  cst?: string;
  barcode?: string;
  authoruser?: string;
  
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
  quantity_base: number,
  fator?: number;
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
  percentage?: number;
}

export interface ProductionOrderPayload {
  productCode: string;
  productName?: string;
  quantityPlanned: number;
  unit: string;
  startDate: string;
  dueDate: string;
  externalCode: string;
  notes?: string;
  OP?: string;

  bomId: string;                 
  lote?: number | null;
  validate?: string | null;
  customValidateDate?: string | null;

  boxesQty: number;
  boxCost: number;
  laborPerUnit: number;
  salePrice: number;
  markup: number;
  postSaleTax: number;

  authoruser?: string;

  rawMaterials: {
    componentCode: string;
    description?: string;
    quantityUsed: number;
    unit: string;
    unitCost: number;
    warehouse?: string | null;
    batchNumber?: string | null;
  }[];
   
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
  quantity: number;
  quantityUsed: number;
  plannedQuantity: number;
  unit: string;
  unitCost?: number;
  plannedcost?: number;
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

export interface ProductionOrder {
  id: string;
  OP: string;
  bomId: string;
  productCode: string;
  productName?: string;
  quantityPlanned: number;
  unit: string;
  startDate: string;
  dueDate: string;
  externalCode: string;
  notes?: string;

  status: ProductionStatus;
  author_user?: string;

  lote?: number | null;
  validate?: string | null;
  customValidateDate?: string | null;

  rawMaterials: OrderRawMaterial[];
  finishedGoods: OrderFinishedGood[];
  statusHistory?: ProductionStatusEvent[];

  boxesQty: number;
  boxCost: number;
  qtembitem: number;
  laborPerUnit: number;
  salePrice: number;
  markup: number;
  postSaleTax: number;

  totalCost?: number;
  unitCost?: number;
  costBreakdown?: CostBreakdown;

  createdAt?: string;
  updatedAt?: string;

  // ------------------------------------
  // 🔹 CAMPOS EXCLUSIVOS DO BACKEND
  // ------------------------------------
  referenceBom?: {
    productCode: string;
    version: string;
    lotSize: number;
    validityDays: number;
  };

  bomTotals?: {
    totalQuantity: number;
    totalCost: number;
    ingredients: number;
    labor: number;
    packaging: number;
    taxes: number;
    unitCost: number;
    sale_price: number;
    quantity_planned: number;
  };

  bomItems?: {
    componentCode: string;
    description: string;
    quantity: number;
    plannedQuantity: number;
    unitCost: number;
    plannedCost: number;
  }[];
}



export interface ProductionStatusEvent {
  id: string;
  name: string;
  orderId: string;
  OP: string;
  status: ProductionStatus;
  timestamp: string;
  responsible: string;
  authoruser?: string;
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
  itemCode?: string;
  itemLabel?: string;
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
  itemId: string;
  type: InventoryMovementType;
  quantity: number;
  unitPrice?: number;
  document?: InventoryDocumentInfo;
  notes?: string;
  warehouse?: string;
  customerOrSupplier?: number | null;
  date?: string;
  user?: string;
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
