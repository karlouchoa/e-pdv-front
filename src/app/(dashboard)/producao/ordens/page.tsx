'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { SearchLookup } from "@/modules/core/components/SearchLookup"; // Update with the correct path
import { useSession } from "@/modules/core/hooks/useSession";
import {
  createProductionOrder,
  listBoms,
  listProductionOrders,
  getBom,
  listRawMaterials as fetchOrderRawMaterials,
  getProductionOrder,
} from "@/modules/production/services/productionService";
import {
  ProductionOrder,
  ProductionOrderPayload,
  BomRecord,
  ProductPayload,
  OrderRawMaterial,
  BomItemPayload,
  CostBreakdown,
} from "@/modules/core/types";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { StatusBadge } from "@/modules/core/components/StatusBadge";
import { formatCurrency, formatCurrency_2, formatDate } from "@/modules/core/utils/formatters";
import { calculateBomTotals } from "@/modules/production/utils/calc";
import dayjs from "dayjs";
import { api } from "@/modules/core/services/api";

type ItemRecord = ProductPayload & {
  cditem : string;
  id: string;
  createdAt?: string;
  updatedAt?: string;
  isComposed: boolean;
  isRawMaterial: boolean;
  notes?: string;
  imagePath?: string;
  packagingQty?: number;
  markup?: number;
};

type ExtraMaterial = BomItemPayload & { id: string; plannedQuantity?: number };

type AnyRecord = Record<string, unknown>;

const buildInitialOrder = (): ProductionOrderPayload => {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);

  const due = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    // -----------------------------
    // ƒ╣ CAMPOS PRINCIPAIS
    // -----------------------------
    productCode: "",
    quantityPlanned: 1,
    unit: "UN",
    startDate: start,
    dueDate: due,
    externalCode: "",
    notes: undefined,

    bomId: "",
    lote: null,
    validate: null,

    // -----------------------------
    // ƒ╣ CUSTOS E AJUSTES
    // -----------------------------
    boxesQty: 0,
    boxCost: 0,
    laborPerUnit: 0,
    salePrice: 0,
    markup: 0,
    postSaleTax: 0,

    customValidateDate: null,

    // -----------------------------
    // ƒ╣ RAW MATERIALS VAZIO (preenchido ap├│s selecionar BOM)
    // -----------------------------
    rawMaterials: [],
  };
};



const calculateValidate = (startDate: string) => {
  return dayjs(startDate).add(30, "day").format("YYYY-MM-DD");
};

const buildProductionOrderPayload = (
  form: any,
  referenceBom: any,
  bomTotalsForPlan: any,
  {
    boxesQty,
    boxCost,
    laborPerUnit,
    salePriceValue,
    markupValue,
    postSaleTax,
    customValidateDate,
  }: {
    boxesQty: number;
    boxCost: number;
    laborPerUnit: number;
    salePriceValue: number;
    markupValue: number;
    postSaleTax: number;
    customValidateDate: string | null;
  }
): ProductionOrderPayload => ({
  // -----------------------------
  // ƒ╣ CAMPOS OBRIGAT├RIOS
  // -----------------------------
  productCode: form.productCode,
  quantityPlanned: Number(form.quantityPlanned),
  unit: form.unit,
  startDate: form.startDate,
  dueDate: form.dueDate,
  externalCode: form.externalCode?.trim() || "",

  notes: form.notes?.trim() || undefined,

  bomId: form.bomId || "",
  lote: form.lote ? Number(form.lote) : null,
  validate: customValidateDate || calculateValidate(form.startDate),

  // -----------------------------
  // ƒ╣ CUSTOS DO ENVIO
  // -----------------------------
  boxesQty,
  boxCost,
  laborPerUnit,
  salePrice: salePriceValue,
  markup: markupValue,
  postSaleTax,
  customValidateDate,

  // =====================================================
  // ƒ ENVIO REDUZIDO  SOMENTE rawMaterials EM VEZ DA BOM
  // =====================================================
  rawMaterials: bomTotalsForPlan.items.map((item: any) => ({
    componentCode: item.componentCode,
    description: item.description ?? "",
    quantityUsed: item.plannedQuantity, // quantidade j├ escalada
    plannedQuantity: form.quantityPlanned,
    unit: "UN",
    unitCost: item.unitCost ?? 0,
    plannedCost: item.plannedCost,
  })),


});



const formatDateOrPlaceholder = (value?: string) =>
  value ? formatDate(value) : "--";

const findArrayDeep = (value: unknown, depth = 0): AnyRecord[] | null => {
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    return value as AnyRecord[];
  }
  if (value && typeof value === "object") {
    const record = value as AnyRecord;
    for (const key of candidateKeys) {
      if (record[key] !== undefined) {
        const candidate = findArrayDeep(record[key], depth + 1);
        if (candidate) return candidate;
      }
    }
    for (const nested of Object.values(record)) {
      const candidate = findArrayDeep(nested, depth + 1);
      if (candidate) return candidate;
    }
  }
  return null;
};

const candidateKeys = [
  "data",
  "items",
  "result",
  "rows",
  "lista",
  "records",
  "content",
  "values",
  "itens",
  "produtos",
];

const extractArray = <T,>(value: unknown): T[] => {
  const result = findArrayDeep(value);
  return Array.isArray(result) ? (result as T[]) : [];
};

const toRecord = (value: unknown): AnyRecord => (value ?? {}) as AnyRecord;

const resolveKeyVariants = (key: string) => {
  const base = key.trim();
  const variants = new Set<string>([
    base,
    base.toLowerCase(),
    base.toUpperCase(),
    base.replace(/_/g, ""),
    base.toLowerCase().replace(/_/g, ""),
  ]);
  return Array.from(variants);
};

const getNumberValue = (
  record: AnyRecord,
  keys: string[],
  fallback = 0,
) => {
  for (const key of keys) {
    const value = getValue(record, key);
    if (value !== undefined && value !== null && value !== "") {
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return fallback;
};


const getValue = (record: AnyRecord, key: string) => {
  const variants = resolveKeyVariants(key);
  for (const variant of variants) {
    if (Object.prototype.hasOwnProperty.call(record, variant)) {
      return record[variant];
    }
  }
  return undefined;
};

const getStringValue = (
  record: AnyRecord,
  keys: string[],
  fallback = "",
) => {
  for (const key of keys) {
    const value = getValue(record, key);
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      return String(value);
    }
  }
  return fallback;
};

const normalizeItemFromApi = (
  raw: AnyRecord,
  fallbackId: string,
): ItemRecord => {
  const record = toRecord(raw);
  
  // const id =
  //   getStringValue(record, ["id", "ID", "cditem", "CDITEM"], "") || fallbackId;

  const id =
    getStringValue(record, ["id", "ID"], "") ||
    getStringValue(record, ["guid", "Guid", "uuid"], "") ||
    fallbackId;


  const categoryValue = getStringValue(
    record,
    ["category", "cdgru", "cdgruit", "cdgritem"],
    "",
  );

  const rawItProdsn = getStringValue(record, ["itprodsn", "ITPRODSN"], "")
  .replace(/\s+/g, "")
  .toUpperCase();

  const rawMatprima = getStringValue(record, ["matprima", "MATPRIMA"], "")
    .replace(/\s+/g, "")
    .toUpperCase();

  const isComposed =
    rawItProdsn === "S" ? true : rawItProdsn === "N" ? false : false;
  const isRawMaterial =
    rawMatprima === "S" ? true : rawMatprima === "N" ? false : false;  
    
  return {
    id,
    cditem: getStringValue(record, ["cditem", "CDITEM"], ""),
    sku: getStringValue(record, ["sku", "code", "cditem", "CDITEM"], ""),
    name: getStringValue(record, ["name", "deitem", "defat"], ""),
    unit: getStringValue(record, ["unit", "unid", "undven"], "UN"),
    packagingQty: getNumberValue(record, ["qtembitem", "qtemb", "embalagem"], 0),
    salePrice: getNumberValue(record, ["salePrice", "preco", "preco"], 0),
    costPrice: getNumberValue(record, ["costPrice", "custo", "custlq"], 0),
    markup: getNumberValue(record, ["markup", "margem"], 0),
    leadTimeDays: getNumberValue(record, ["leadTimeDays", "leadtime"], 0),
    type: "acabado",
    description: getStringValue(record, ["description", "obsitem"], ""),
    notes: getStringValue(record, ["obsitem", "notes"], ""),
    imagePath: getStringValue(record, ["locfotitem", "imagePath"], ""),
    ncm: getStringValue(record, ["ncm", "clasfis", "codncm"], ""),
    cest: getStringValue(record, ["cest"], ""),
    cst: getStringValue(record, ["cst", "codcst"], ""),
    barcode: getStringValue(record, ["barcode", "barcodeit"], ""),
    createdAt: getStringValue(record, ["createdAt", "createdat", "datacadit"]),
    isComposed,
    isRawMaterial,
    category: categoryValue, // Add the missing category property
    qtembitem: getNumberValue(record, ["qtembitem"], 0), // Ensure qtembitem is included
  };
};


export default function ProductionOrdersPage() {
  const { session } = useSession();
  const [form, setForm] = useState<ProductionOrderPayload>(() => buildInitialOrder());
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [packagingQty, setPackagingQty] = useState(0);

  const [bomSearch, setBomSearch] = useState("");
  const [showBomResults, setShowBomResults] = useState(false);
  const [loading, setLoading] = useState(true);

  const [bomDetails, setBomDetails] = useState<BomRecord | null>(null);
  const [bomItems, setBomItems] = useState<BomRecord["items"]>([]);
  const [extraMaterials, setExtraMaterials] = useState<ExtraMaterial[]>([]);

  const [boxesQty, setBoxesQty] = useState(0);
  
  const [boxCostInput, setBoxCostInput] = useState("0,00");
  const [boxCost, setBoxCost] = useState(0);

  const [laborPerUnitInput, setLaborPerUnitInput] = useState("0,00");
  const [laborPerUnit, setLaborPerUnit] = useState(0);
  //const [salePriceInput, setSalePriceInput] = useState(0);

  const [salePriceInput, setSalePriceInput] = useState("0,00"); // string para exibir
  const [salePriceValue, setSalePriceValue] = useState(0);  // n├║mero real

  const [markupInput, setMarkupInput] = useState("0,00");   // exibi├├o
  const [markupValue, setMarkupValue] = useState(0);    // num├rico
  const [postSaleTax, setPostSaleTax] = useState(0);
  const [customValidateDate, setCustomValidateDate] = useState<string>("");

  const [highlightIndex, setHighlightIndex] = useState(-1);
  const lastFetchedOrderId = useRef<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const stripDiacritics = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
  const normalizeQuery = (value: string) =>
        stripDiacritics(value).toLowerCase();
      
  const matchItemQuery = (item: ItemRecord, query: string) => {
        const normalizedQuery = normalizeQuery(query.trim());
        if (!normalizedQuery) return false;
        const name = normalizeQuery(item.name);
        const sku = normalizeQuery(item.sku);
        const barcode = normalizeQuery(item.barcode ?? "");
        return (
          name.includes(normalizedQuery) ||
          sku.startsWith(normalizedQuery) ||
          barcode.startsWith(normalizedQuery)
        );
  };    

  const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        return items
          .filter((item) => matchItemQuery(item, searchTerm))
          .slice(0, 10);
      }, [items, searchTerm]);

   /* ---------------------------------------------------
     CARREGAR ORDENS E BOMs
  --------------------------------------------------- */
  useEffect(() => {
    if (!session) return;

    Promise.all([listProductionOrders(session), listBoms(session)]).then(
      ([orderResponse, bomResponse]) => {
        setOrders(orderResponse);
        setBoms(bomResponse);

        if (orderResponse[0]) {
          setSelectedOrderId(orderResponse[0].id || orderResponse[0].OP);
        }

      }
    );
  }, [session]);

  const selectedOrder =
    orders.find(
      (order) =>
        order.id === selectedOrderId || order.OP === selectedOrderId,
    ) ?? null;

  const resolvedOrderFetchId = useMemo(() => {
    const candidates = [
      selectedOrder?.id,
      selectedOrderId,
      selectedOrder?.OP,
    ].filter(Boolean) as string[];

    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      );
    const isNumeric = (value: string) => /^\d+$/.test(value);

    const uuidCandidate = candidates.find(isUuid);
    if (uuidCandidate) return uuidCandidate;

    const numericCandidate = candidates.find(isNumeric);
    if (numericCandidate) return numericCandidate;

    return candidates[0] ?? null;
  }, [selectedOrder, selectedOrderId]);

  const availableBoms = useMemo(() => {
    if (!form.productCode.trim()) return [];
    const normalized = form.productCode.trim().toLowerCase();
    return boms.filter(
      (bom) => bom.productCode.toLowerCase() === normalized,
    );
  }, [boms, form.productCode]);

  const selectedBom = useMemo<BomRecord | null>(() => {
    if (bomDetails && form.bomId && bomDetails.id === form.bomId) return bomDetails;
  
    if (form.bomId) {
      const byId = boms.find(b => b.id === form.bomId);
      if (byId) return byId;
    }
  
    if (availableBoms[0]) return availableBoms[0];
  
    return null;
  }, [availableBoms, bomDetails, boms, form.bomId]);
  

  useEffect(() => {
    setBomItems(selectedBom?.items ?? []);
  }, [selectedBom]);

  useEffect(() => {
    if (packagingQty > 0) {
      const nextBoxes =
        packagingQty <= 1
          ? packagingQty
          : Number(form.quantityPlanned || 0) / packagingQty;
      setBoxesQty(nextBoxes);
    }
  }, [form.quantityPlanned, packagingQty]);

  useEffect(() => {
    if (!selectedBom || form.bomId) return;
    setForm((prev) => ({
      ...prev,
      bomId: selectedBom.id,
      productCode: prev.productCode || selectedBom.productCode,
    }));
  }, [form.bomId, selectedBom]);

  const previewTotals = useMemo(() => {
    const sourceItems =
      (bomItems?.length ?? 0) > 0
        ? bomItems
        : selectedBom?.items?.length
          ? selectedBom.items
          : [];

    if (!selectedBom && sourceItems.length === 0) {
      return {
        ingredients: 0,
        labor: 0,
        packaging: 0,
        taxes: 0,
        overhead: 0,
        total: 0,
        unit: 0,
        marginAchieved: 0,
      };
    }

    if (!selectedBom) {
      return calculateBomTotals({
        productCode: form.productCode || "PROD",
        version: "1.0",
        lotSize: form.quantityPlanned || 1,
        validityDays: 30,
        marginTarget: 10,
        marginAchieved: 0,
        items: sourceItems,
      });
    }

    return calculateBomTotals({
      productCode: form.productCode || selectedBom.productCode || "PROD",
      version: selectedBom.version || "1.0",
      lotSize: form.quantityPlanned || selectedBom.lotSize,
      validityDays: selectedBom.validityDays || 30,
      marginTarget: selectedBom.marginTarget || 10,
      marginAchieved: selectedBom.marginAchieved || 0,
      items: selectedBom.items || [],
    });
  }, [form, selectedBom]);

  const formatCurrencyOrDash = (value?: number) =>
    typeof value === "number" ? formatCurrency(value) : "--";

  const validateDate = selectedBom
    ? dayjs(form.startDate)
        .add(selectedBom.validityDays || 0, "day")
        .format("YYYY-MM-DD")
    : null;
  
  const buildRawMaterials = () => {
    const baseItems =
      (bomItems?.length ?? 0) > 0
        ? bomItems
        : selectedBom?.items?.length
          ? selectedBom.items
          : [];
    const combined = [
      ...baseItems.map((item) => ({ ...item, isExtra: false })),
      ...extraMaterials.map((item) => ({ ...item, isExtra: true })),
    ];
    if (!combined.length) return [];
    const multiplier = form.quantityPlanned || 0;

    return combined
      .filter((item) => item.componentCode)
      .map((item) => {
        const isExtra = Boolean((item as any).isExtra);
        const baseQuantity = isExtra ? 1 : Number(item.quantity || 0);
        const plannedQuantity = isExtra
          ? Number(
              ('id' in item ? (item as ExtraMaterial).plannedQuantity : undefined) ??
              baseQuantity * multiplier,
            )
          : baseQuantity * multiplier;
        return {
          componentCode: item.componentCode,
          description: item.description,
          quantityUsed: plannedQuantity,
          quantity: baseQuantity,
          plannedQuantity,
          unit: "UN",
          unitCost: item.unitCost,
        };
      })
      .filter((item) => item.quantityUsed > 0);
  };

  const fetchBomDetails = useCallback(
    async (bomId: string) => {
      if (!session || !bomId) return;
      try {
        const details = await getBom(session, bomId);
        setBomDetails(details);
        setBomItems(details.items ?? []);
        setBoms((prev) => {
          const index = prev.findIndex((bom) => bom.id === details.id);
          if (index === -1) {
            return [...prev, details];
          }
          const copy = [...prev];
          copy[index] = details;
          return copy;
        });
      } catch (error) {
        console.error("Erro ao carregar BOM selecionada:", error);
      }
    },
    [session],
  );

  const handleBomChange = (bomId: string) => {
    const selectedBom = boms.find((bom) => bom.id === bomId);
    setBomDetails(null);
    setBomItems([]);
    setForm((prev) => ({
      ...prev,
      bomId,
      productCode: selectedBom?.productCode ?? prev.productCode,
    }));
    fetchBomDetails(bomId);
  };
  
  useEffect(() => {
    if (form.bomId) {
      fetchBomDetails(form.bomId);
    }
  }, [fetchBomDetails, form.bomId]);

  const resetFormState = () => {
    setForm(buildInitialOrder());
    setBomDetails(null);
    setBomItems([]);
    setExtraMaterials([]);
    setPackagingQty(0);
    setSearchTerm("");
    setShowSearchResults(false);
    setBomSearch("");
    setShowBomResults(false);
    setBoxesQty(0);
    setBoxCostInput("0,00");
    setBoxCost(0);
    setLaborPerUnitInput("0,00");
    setLaborPerUnit(0);
    setSalePriceInput("0,00");
    setSalePriceValue(0);
    setMarkupInput("0,00");
    setMarkupValue(0);
    setPostSaleTax(0);
    setCustomValidateDate("");
    setHighlightIndex(-1);
    setRawMaterials([]);
  };
   
   
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setMessage(null);

    const warehouseCode = (session.warehouse ?? "").toString().trim();
    if (!warehouseCode) {
      setMessage("Empresa nao encontrada na sessao. Refaca o login.");
      return;
    }
  
    try {
      const rawMaterials = buildRawMaterials().map((item) => ({
        ...item,
        warehouse: warehouseCode,
      }));
      const validateForPayload = customValidateDate || validateDate;
  
      const payload: ProductionOrderPayload = {
        productCode: form.productCode,
        quantityPlanned: form.quantityPlanned,
        unit: form.unit,
        startDate: form.startDate,
        dueDate: form.dueDate,
        externalCode: form.externalCode,
        notes: form.notes?.trim() || undefined,
        bomId: form.bomId,
        lote: form.lote || null,
        validate: validateForPayload,
  
        // --------------------------
        // ƒ╣ RAW MATERIALS
        // --------------------------
        rawMaterials,
  
        // --------------------------
        // ƒ╣ CAMPOS DE CUSTO
        // --------------------------
        boxesQty,
        boxCost,
        laborPerUnit,
        salePrice: salePriceValue,
        markup: markupValue,
        postSaleTax,
        customValidateDate: customValidateDate || null,
  
        // --------------------------
        // ƒ╣ AUTOR DA OP
        // --------------------------
        authoruser: session.user.name || "Desconhecido",
      };
  
      console.log("Payload a ser enviado:", payload);
  
      const created = await createProductionOrder(session, payload);
  
      setOrders((prev) => [created, ...prev]);
      setSelectedOrderId(created.id || created.OP);
      resetFormState();
      setMessage(`OP ${created.OP} criada com sucesso.`);
  
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar OP");
    }
  };
  
  
  const bomTotalsForPlan = useMemo(() => {
    const baseItems =
      (bomItems?.length ?? 0) > 0
        ? bomItems
        : selectedBom?.items?.length
          ? selectedBom.items
          : [];
    const combinedItems = [
      ...baseItems.map((item) => ({ ...item, isExtra: false })),
      ...extraMaterials.map((item) => ({ ...item, isExtra: true, quantity: 1 })),
    ].filter((item) => item.componentCode);

    if (!combinedItems.length) {
      return {
        items: [],
        totalQuantity: 0,
        totalCost: 0,
      };
    }
    const multiplier = form.quantityPlanned || 0;
    const itemsWithTotals = combinedItems.map((item) => {
      const isExtra = Boolean((item as any).isExtra);
      const baseQuantity = isExtra ? 1 : Number(item.quantity || 0);
      const plannedQuantity = isExtra
        ? Number(
            ('id' in item ? (item as ExtraMaterial).plannedQuantity : undefined) ??
            baseQuantity * multiplier,
          )
        : baseQuantity * multiplier;
      const unitCost = Number(item.unitCost ?? 0);
      const plannedCost = plannedQuantity * unitCost;
      return {
        ...item,
        quantity: baseQuantity,
        plannedQuantity,
        plannedCost,
      };
    });

    const totalQuantity = itemsWithTotals.reduce(
      (acc, item) => acc + item.plannedQuantity,
      0,
    );
    const totalCost = itemsWithTotals.reduce(
      (acc, item) => acc + item.plannedCost,
      0,
    );

    return {
      items: itemsWithTotals,
      totalQuantity,
      totalCost,
    };
  }, [bomItems, extraMaterials, form.quantityPlanned, selectedBom]);

  const plannedQty = form.quantityPlanned || 0;
  const packagingCost = boxesQty * boxCost;
  const extraLaborCost = laborPerUnit * plannedQty;
  const baseProductionCost = bomTotalsForPlan?.totalCost ?? 0;
  const baseUnitMpCost = plannedQty > 0 ? bomTotalsForPlan.totalCost / plannedQty : 0;
  const packagingUnitCost = plannedQty > 0 ? packagingCost / plannedQty : 0;
  const productionUnitCost = baseProductionCost / plannedQty ; // + packagingUnitCost + laborPerUnit;
  const totalWithExtras = (productionUnitCost * plannedQty) + packagingCost + extraLaborCost;
  const unitCostWithExtras = totalWithExtras / plannedQty;

  const derivedSalePrice =
    salePriceValue > 0
      ? salePriceValue
      : markupValue > 0
        ? unitCostWithExtras * (1 + markupValue / 100)
        : 0;

  const salePricePerUnit = Number.isFinite(derivedSalePrice)
    ? derivedSalePrice
    : 0;

  const saleMarkupApplied =
    unitCostWithExtras > 0
      ? ((salePricePerUnit - unitCostWithExtras) / unitCostWithExtras) * 100
      : 0;

  const revenueTotal = salePricePerUnit * plannedQty;
  const postSaleTaxValue = revenueTotal * ((postSaleTax || 0) / 100);
  const netRevenueTotal = revenueTotal - postSaleTaxValue;
  const profitTotal = revenueTotal - (totalWithExtras + postSaleTaxValue);
  const [rawMaterials, setRawMaterials] = useState<OrderRawMaterial[]>([]);
  const selectedOrderRawMaterials =
    rawMaterials.length > 0
      ? rawMaterials
      : selectedOrder?.rawMaterials ?? [];

  const selectedOrderBreakdown = useMemo<CostBreakdown | null>(() => {
    const salePrice = Number(selectedOrder?.salePrice ?? 0);
    const plannedQuantity = Number(selectedOrder?.quantityPlanned ?? 0);
    const taxesPercent = Number(
      selectedOrder?.postSaleTax ?? 0,
    );

    const computeTaxes = (fallback: number) => {
      if (salePrice > 0 && plannedQuantity > 0) {
        return salePrice * plannedQuantity * (taxesPercent / 100);
      }
      return fallback;
    };

    if (selectedOrder?.costBreakdown) {
      return {
        ...selectedOrder.costBreakdown,
        taxes: computeTaxes(selectedOrder.costBreakdown.taxes ?? 0),
      };
    }

    const bomTotals = selectedOrder?.bomTotals;
    if (bomTotals) {
      const ingredients = bomTotals.ingredients ?? bomTotals.totalCost ?? 0;
      return {
        ingredients,
        labor: bomTotals.labor ?? ingredients * 0.12,
        packaging: bomTotals.packaging ?? ingredients * 0.08,
        taxes: computeTaxes(bomTotals.taxes ?? ingredients * 0.1),
        //overhead: bomTotals.overhead ?? ingredients * 0.05,
      } as CostBreakdown;
    }

    const sourceItems =
      selectedOrder?.bomItems && selectedOrder.bomItems.length > 0
        ? selectedOrder.bomItems
        : selectedOrderRawMaterials;

    if (!sourceItems || sourceItems.length === 0) {
      return null;
    }

    let ingredients = 0;
    for (const item of sourceItems) {
      const plannedCost =
        (item as any).plannedCost ??
        (item as any).plannedcost ??
        (item.unitCost ?? 0) *
          ((item as any).plannedQuantity ??
            (item as any).quantityUsed ??
            (item as any).quantity ??
            0);
      if (Number.isFinite(plannedCost)) {
        ingredients += Number(plannedCost);
      }
    }

    const labor = ingredients * 0.12;
    const packaging = ingredients * 0.08;
    const taxes = computeTaxes(ingredients * 0.1);
    const overhead = ingredients * 0.05;

    return {
      ingredients,
      labor,
      packaging,
      taxes,
      overhead,
    };
  }, [selectedOrder, selectedOrderRawMaterials]);

  const handleMarkupChange = (text: string) => {
    // 1) Mant├m string original digitada
    setMarkupInput(text);
  
    // 2) Normaliza
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
  
    // 3) Se v├lido, atualiza valor num├rico
    if (!isNaN(value)) {
      setMarkupValue(value);
  
      if (unitCostWithExtras > 0) {
        const calculatedSalePrice = unitCostWithExtras * (1 + value / 100);
  
        // Atualiza o valor num├rico real
        setSalePriceValue(calculatedSalePrice);
  
        // Atualiza o valor exibido com v├rgula e 2 casas
        setSalePriceInput(
          calculatedSalePrice.toFixed(2).replace(".", ",")
        );
      }
    }
  };
  

  const handleSalePriceChange = (text: string) => {
    // 1) Mant├m o texto digitado (preserva cursor)
    setSalePriceInput(text);
  
    // 2) Normaliza v├rgula  ponto para converter
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
    
    // 3) Se for n├║mero v├lido, calcula o markup
    if (!isNaN(value)) {
      
      setSalePriceValue(value);
      
      if (unitCostWithExtras > 0) {
        const calculatedMarkup = ((value - unitCostWithExtras) / unitCostWithExtras) * 100;
        setMarkupValue(calculatedMarkup);
         
        setMarkupInput(calculatedMarkup.toFixed(2).replace(".", ","));
      } else {
        setMarkupValue(0);
        setMarkupInput("0,00");
      }
    }
  };

  const handlesetBoxCostChange = (text: string) => {
    setBoxCostInput(text);
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
    if (!isNaN(value)) {
      setBoxCost(value);
    }
  }

  const handleLaborPerUnitChange = (text: string) => {
    setLaborPerUnitInput(text);
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
    if (!isNaN(value)) {
      setLaborPerUnit(value);
    }
  }
  
  const addExtraMaterialFromItem = (item: ItemRecord) => {
    const newMaterial: ExtraMaterial = {
      id: item.id || item.cditem || item.sku || `extra-${Date.now()}`,
      componentCode: item.cditem || item.sku || item.id,
      description: item.name || item.description || "",
      quantity: 1,
      unitCost: item.costPrice ?? 0,
      plannedQuantity: form.quantityPlanned || 1,
      quantity_base: 1, // Added the required property
    };

    setExtraMaterials((prev) => {
      const existingIndex = prev.findIndex(
        (entry) => entry.componentCode === newMaterial.componentCode,
      );
      if (existingIndex !== -1) {
        const copy = [...prev];
        copy[existingIndex] = {
          ...copy[existingIndex],
          description: newMaterial.description || copy[existingIndex].description,
          unitCost: newMaterial.unitCost ?? copy[existingIndex].unitCost,
          plannedQuantity:
            copy[existingIndex].plannedQuantity ?? newMaterial.plannedQuantity,
          quantity: 1,
        };
        return copy;
      }
      return [newMaterial, ...prev];
    });
  };

  type SearchOption = {
    id: string;
    label: string;
    code?: string;
    barcode?: string;
    raw?: unknown;
  };

  const handleSelectExtraMaterial = (option: SearchOption) => {
    const normalized = normalizeItemFromApi(
      (option.raw ?? {}) as AnyRecord,
      `item-${option.id}`,
    );
    addExtraMaterialFromItem(normalized);
  };

  const updateExtraMaterial = (
    index: number,
    field: keyof Pick<ExtraMaterial, "quantity" | "unitCost" | "plannedQuantity">,
    value: string,
  ) => {
    setExtraMaterials((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (!current) return prev;
      const parsed = Number(value);
      copy[index] = {
        ...current,
        [field]:
          field === "quantity"
            ? 1
            : Number.isFinite(parsed)
              ? parsed
              : (current as any)[field],
      };
      return copy;
    });
  };

  const removeExtraMaterial = (index: number) => {
    setExtraMaterials((prev) => prev.filter((_, position) => position !== index));
  };

  const removeBaseMaterial = (index: number) => {
    setBomItems((prev) => prev.filter((_, position) => position !== index));
  };

  const handleSelectItem = (item: ItemRecord) => {
    const selectedSalePrice = Number(item.salePrice ?? 0);
    setSalePriceValue(selectedSalePrice);
    setSalePriceInput(selectedSalePrice.toFixed(2).replace('.', ','));

    const selectedMarkup = Number(item.markup ?? 0);
    setMarkupValue(selectedMarkup);
    setMarkupInput(selectedMarkup.toFixed(2).replace('.', ','));

    const selectedPackaging = Number(item.packagingQty ?? 0);
    setPackagingQty(selectedPackaging);
    if (selectedPackaging > 0) {
      const nextBoxes =
        selectedPackaging <= 1
          ? selectedPackaging
          : Number(form.quantityPlanned || 0) / selectedPackaging;
      setBoxesQty(nextBoxes);
    }

    setForm((prev) => ({
      ...prev,                          // mant?m tudo que j? existe
      productCode: item.cditem,        // codigo do produto
      notes: item.notes ?? "",         // notas pr?-existentes
      isComposed: item.isComposed,
      isRawMaterial: item.isRawMaterial,
    }));
  
    setSearchTerm(item.name);
    setShowSearchResults(false);
  };
  

  const printOrder = () => {
    if (!selectedOrder) return;

    const formatDatePrint = (value?: string) =>
      value ? formatDate(value) : "--";

    const formatNumber = (value: number | undefined | null, digits = 2) => {
      if (value === undefined || value === null || Number.isNaN(value)) return "--";
      return Number(value).toLocaleString("pt-BR", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    };

    const productName =
      items.find(
        (item) =>
          item.cditem === selectedOrder.productCode ||
          item.sku === selectedOrder.productCode ||
          item.id === selectedOrder.productCode,
      )?.name ?? "";
    const productDisplay = selectedOrder.productCode
      ? `${selectedOrder.productCode}${productName ? ` - ${productName}` : ""}`
      : "--";

    const materialsForPrint = (() => {
      if (selectedOrder.bomItems && selectedOrder.bomItems.length > 0) {
        return selectedOrder.bomItems.map((item) => {
          const fallbackRaw = selectedOrderRawMaterials.find(
            (raw) => raw.componentCode === item.componentCode,
          );
          const plannedQty =
            fallbackRaw?.quantityUsed ??
            item.plannedQuantity ??
            item.quantity ??
            fallbackRaw?.plannedQuantity ??
            0;

          const unitCost = item.unitCost ?? fallbackRaw?.unitCost ?? 0;

          return {
            code: item.componentCode,
            description: item.description ?? "",
            unit: fallbackRaw?.unit ?? "UN",
            plannedQty,
            unitCost,
            totalCost: item.plannedCost ?? unitCost * plannedQty,
          };
        });
      }

      return selectedOrderRawMaterials.map((item) => {
        const plannedQty =
          item.quantityUsed ?? item.plannedQuantity ?? item.quantity ?? 0;

        return {
          code: item.componentCode,
          description: item.description ?? "",
          unit: item.unit ?? "UN",
          plannedQty,
          unitCost: item.unitCost ?? 0,
          totalCost: (item.unitCost ?? 0) * plannedQty,
        };
      });
    })();

    const totalMaterialsCost = materialsForPrint.reduce(
      (acc, item) => acc + (item.totalCost ?? 0),
      0,
    );

    const materialsRows =
      materialsForPrint.length > 0
        ? materialsForPrint
            .map(
              (item, index) => `
            <tr>
              <td class="cell center">${index + 1}</td>
              <td class="cell code">${item.code}</td>
              <td class="cell">${item.description}</td>
              <td class="cell center">${item.unit}</td>
              <td class="cell right">${formatNumber(item.plannedQty)}</td>
              <td class="cell right">${formatCurrency(item.unitCost ?? 0)}</td>
              <td class="cell right">${formatCurrency_2(item.totalCost ?? 0)}</td>
            </tr>
          `,
            )
            .join("")
        : `<tr><td class="cell empty" colspan="7">Nenhum componente listado para esta OP.</td></tr>`;

    const finishedGoodsRows =
      selectedOrder.finishedGoods && selectedOrder.finishedGoods.length > 0
        ? selectedOrder.finishedGoods
            .map(
              (item, index) => `
          <tr>
            <td class="cell center">${index + 1}</td>
            <td class="cell">${item.productCode}</td>
            <td class="cell">${item.lotNumber ?? "--"}</td>
            <td class="cell right">${formatNumber(item.quantityGood)}</td>
            <td class="cell right">${formatNumber(item.quantityScrap)}</td>
          </tr>
        `,
            )
            .join("")
        : `<tr><td class="cell empty" colspan="5">Nenhum apontamento de produção registrado.</td></tr>`;

    const requisitionRows =
      materialsForPrint.length > 0
        ? materialsForPrint
            .map(
              (item, index) => `
            <tr>
              <td class="cell center">${index + 1}</td>
              <td class="cell code">${item.code}</td>
              <td class="cell">${item.description}</td>
              <td class="cell center">${item.unit}</td>
              <td class="cell right">${formatNumber(item.plannedQty)}</td>
              <td class="cell right">__________</td>
              <td class="cell"> </td>
            </tr>
          `,
            )
            .join("")
        : `<tr><td class="cell empty" colspan="7">Nenhum componente listado para esta OP.</td></tr>`;

    const companyName =
      session?.tenant?.enterprise || session?.tenant?.name || "Empresa";
    const logoUrl = session?.tenant?.logoUrl;

    const printHtml = `
      <html>
        <head>
          <title>OP ${selectedOrder.OP}</title>
          <style>
            @page { size: A4; margin: 10mm; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; padding: 0; color: #0f172a; }
            .page { width: 100%; max-width: 210mm; margin: 0 auto 12mm; padding: 12mm 10mm; border: 2px solid #b8860b; background: #fff; }
            .title { text-align: center; font-size: 16px; font-weight: 700; letter-spacing: 0.5px; margin-bottom: 6px; }
            .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .brand { display: flex; align-items: center; gap: 8px; }
            .logo { width: 64px; height: 64px; object-fit: contain; border: 1px solid #d9d9d9; padding: 4px; }
            .logo.placeholder { display: flex; align-items: center; justify-content: center; background: #f8fafc; color: #94a3b8; font-size: 12px; }
            .brand-text { font-size: 12px; line-height: 1.3; }
            .brand-name { font-weight: 700; }
            .ref-box { text-align: right; font-size: 12px; line-height: 1.4; }
            .ref-label { font-weight: 600; }
            .info-grid { border: 1px solid #000; font-size: 11px; margin-bottom: 10px; }
            .info-row { display: grid; grid-template-columns: 90px 1fr 80px 120px 70px 120px; border-bottom: 1px solid #000; }
            .info-row:last-child { border-bottom: none; }
            .info-label { background: #f1f5f9; padding: 6px; border-right: 1px solid #000; font-weight: 600; }
            .info-value { padding: 6px; border-right: 1px solid #000; }
            .info-row .info-value:last-child { border-right: none; }
            .section { margin-top: 10px; }
            .section-title { background: #f1f5f9; border: 1px solid #000; padding: 6px 8px; font-size: 12px; font-weight: 700; }
            .table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
            .table th { background: #f8fafc; border: 1px solid #000; padding: 6px; text-align: left; }
            .table th.center { text-align: center; }
            .table th.right { text-align: right; }
            .cell { border: 1px solid #000; padding: 5px 6px; }
            .cell.center { text-align: center; }
            .cell.right { text-align: right; }
            .cell.code { font-family: monospace; }
            .cell.empty { text-align: center; color: #6b7280; padding: 12px 6px; }
            .note-box { border: 1px solid #000; min-height: 60px; padding: 8px; font-size: 11px; white-space: pre-wrap; }
            .signature-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 14px; }
            .sig-block { text-align: center; font-size: 11px; }
            .sig-line { border-bottom: 1px solid #000; height: 32px; margin-bottom: 6px; }
            .footer { font-size: 10px; text-align: right; margin-top: 6px; color: #64748b; }
            .break-after { page-break-after: always; }
            .totals { font-size: 11px; margin-top: 8px; display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .totals-item { border: 1px solid #000; padding: 6px; background: #f8fafc; }
            .totals-label { font-size: 10px; color: #475569; }
            .totals-value { font-weight: 700; }
            .req-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .req-title { font-size: 15px; font-weight: 700; }
          </style>
        </head>
        <body>
          <div class="page break-after">
            <div class="top">
              <div class="brand">
                ${
                  logoUrl
                    ? `<img src="${logoUrl}" alt="Logo" class="logo" />`
                    : `<div class="logo placeholder">LOGO</div>`
                }
                <div class="brand-text">
                  <div class="brand-name">${companyName}</div>
                  <div>ORDEM DE PRODUÇÃO</div>
                  </div>
                </form>
              </div>
              <div class="ref-box">
                <div><span class="ref-label">OP:</span> ${selectedOrder.OP ?? "--"}</div>
                <div><span class="ref-label">Emitida:</span> ${formatDatePrint(selectedOrder.createdAt)}</div>
              </div>
            </div>

            <div class="title">ORDEM DE PRODUÇÃO</div>

            <div class="info-grid">
              <div class="info-row">
                <div class="info-label">Nº A/C</div>
                <div class="info-value">${selectedOrder.OP || "--"}</div>
                <div class="info-label">Prazo</div>
                <div class="info-value">${formatDatePrint(selectedOrder.dueDate)}</div>
                <div class="info-label">Lote</div>
                <div class="info-value">${selectedOrder.lote ?? "--"}</div>
              </div>
              <div class="info-row">
                <div class="info-label">Produto</div>
                <div class="info-value" style="border-right: 1px solid #000;">${productDisplay}</div>
                <div class="info-label">Qtd total</div>
                <div class="info-value">${formatNumber(selectedOrder.quantityPlanned)} ${selectedOrder.unit}</div>
                <div class="info-label">Validade</div>
                <div class="info-value">${formatDatePrint(selectedOrder.dueDate)}</div>
              </div>
              <div class="info-row">
                <div class="info-label">Início</div>
                <div class="info-value">${formatDatePrint(selectedOrder.startDate)}</div>
                <div class="info-label">Responsável</div>
                <div class="info-value">${selectedOrder.author_user ?? session?.user.name ?? "--"}</div>
                <div class="info-label">Status</div>
                <div class="info-value">${selectedOrder.status ?? "--"}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Lista de materiais-prima e componentes</div>
              <table class="table">
                <thead>
                  <tr>
                    <th class="center">#</th>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th class="center">Un</th>
                    <th class="right">QTD</th>
                    <th class="right">Custo unit.</th>
                    <th class="right">Custo total</th>
                  </tr>
                </thead>
                <tbody>
                  ${materialsRows}
                </tbody>
                <tfoot>
                  <tr>
                    <td class="cell right" colspan="6"><strong>Total materiais</strong></td>
                    <td class="cell right"><strong>${formatCurrency_2(totalMaterialsCost)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Produção / apontamentos</div>
              <table class="table">
                <thead>
                  <tr>
                    <th class="center">#</th>
                    <th>Produto</th>
                    <th>Lote</th>
                    <th class="right">Qtd boa</th>
                    <th class="right">Sucata</th>
                  </tr>
                </thead>
                <tbody>
                  ${finishedGoodsRows}
                </tbody>
              </table>
            </div>

            <div class="totals">
              <div class="totals-item">
                <div class="totals-label">Custo total previsto</div>
                <div class="totals-value">${formatCurrency_2(selectedOrder.totalCost ?? totalMaterialsCost)}</div>
              </div>
              <div class="totals-item">
                <div class="totals-label">Custo unitário</div>
                <div class="totals-value">${formatCurrency_2(selectedOrder.unitCost ?? (selectedOrder.quantityPlanned ? totalMaterialsCost / selectedOrder.quantityPlanned : 0))}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Observações</div>
              <div class="note-box">${selectedOrder.notes ?? ""}</div>
            </div>

            <div class="signature-row">
              <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Autorizado por</div>
              </div>
              <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Conferido</div>
              </div>
            </div>

            <div class="footer">OP ${selectedOrder.OP ?? "--"}  Documento gerado em ${formatDatePrint(new Date().toISOString())}</div>
          </div>

          <div class="page">
            <div class="req-header">
              <div>
                <div class="req-title">REQUISIÇÃO DE MATERIAIS-PRIMA</div>
                <div style="font-size: 11px;">Ordem de produção: <strong>${selectedOrder.OP ?? "--"}</strong></div>
              </div>
              <div class="ref-box">
                <div><span class="ref-label">Produto:</span> ${productDisplay}</div>
                <div><span class="ref-label">Qtd:</span> ${formatNumber(selectedOrder.quantityPlanned)} ${selectedOrder.unit}</div>
              </div>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th class="center">#</th>
                  <th>Código</th>
                  <th>Descrição</th>
                  <th class="center">Un</th>
                  <th class="right">Qtd solicitada</th>
                  <th class="right">Qtd entregue</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                ${requisitionRows}
              </tbody>
            </table>

            <div class="signature-row">
              <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Autorizado por</div>
              </div>
              <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-label">Recebido / Almoxarifado</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const popup = window.open("", "print", "width=900,height=700");
    if (!popup) return;
    popup.document.write(printHtml);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const loadData = useCallback(async () => {
      if (!session) return;
      setLoading(true);
      try {
        const [itemsResponse] = await Promise.all([
          api.get("/T_ITENS", { params: { tabela: "T_ITENS" } }),
        ]);
        
        console.log("Resposta itens:", itemsResponse.data);

  
        const rawItems = extractArray<AnyRecord>(itemsResponse.data);
        const normalizedItems = rawItems.map((item, index) =>
          normalizeItemFromApi(item, `item-${index}`),
        );

        setItems(normalizedItems);
      } catch (error) {
        console.error("Falha ao carregar cadastros", error);
        setFeedback(
          error instanceof Error
            ? error.message
            : "Falha ao carregar cadastros.",
        );
      } finally {
        setLoading(false);
      }
    }, [session]);

  const fetchRawMaterials = useCallback(
    async (orderKey: string) => {
      if (!session || !orderKey) return;
      try {
        const response = await fetchOrderRawMaterials(session, orderKey);
        setRawMaterials(response);
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderKey || order.OP === orderKey
              ? { ...order, rawMaterials: response }
              : order,
          ),
        );
      } catch (error) {
        console.error("Falha ao carregar mat?rias-primas da OP:", error);
      }
    },
    [session],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fetchOrderDetails = useCallback(
    async (orderKey: string) => {
      if (!session || !orderKey) return;
      try {
        const detail = await getProductionOrder(session, orderKey);
        setOrders((prev) => {
          const index = prev.findIndex(
            (order) => order.id === orderKey || order.OP === orderKey,
          );
          if (index === -1) return [detail, ...prev];
          const copy = [...prev];
          copy[index] = detail;
          return copy;
        });
      } catch (error) {
        console.error("Falha ao carregar detalhes da OP:", error);
      }
    },
    [session],
  );

  useEffect(() => {
    if (!selectedOrderId && !resolvedOrderFetchId) {
      setRawMaterials([]);
      lastFetchedOrderId.current = null;
      return;
    }

    if (!resolvedOrderFetchId) {
      setRawMaterials(selectedOrder?.rawMaterials ?? []);
      return;
    }

    if (lastFetchedOrderId.current === resolvedOrderFetchId) {
      return;
    }

    lastFetchedOrderId.current = resolvedOrderFetchId;
    setRawMaterials([]);
    fetchOrderDetails(resolvedOrderFetchId);
    fetchRawMaterials(resolvedOrderFetchId);
  }, [fetchOrderDetails, fetchRawMaterials, resolvedOrderFetchId, selectedOrderId, selectedOrder]);


  return (
    <div className="space-y-6">
      {message ? (
        <div className="bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-2xl">
          {message}
        </div>
      ) : null}
      <SectionCard
        title="Nova Ordem de Produção"
        description="Dispara cálculo de custo, baixa estoque e libera requisições"
        action={
          <button
            type="button"
            onClick={printOrder}
            disabled={!selectedOrder}
            className="text-sm font-semibold text-slate-600"
          >
            Imprimir requisição
          </button>
        }
      >
        <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={handleSubmit}>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500">
              Produto
            </label>
              <SearchLookup
              table="t_itens"
              descriptionField="descricao"
              codeField="cditem"
              barcodeField="barcodeit"
              placeholder="Digite parte do nome, codigo ou codigo de barras"
              onSelect={(option: SearchOption) => {
                const normalized = normalizeItemFromApi(
                  (option.raw ?? {}) as AnyRecord,
                  `item-${option.id}`,
                );
                handleSelectItem(normalized);
                setItems((prev) => {
                  const exists = prev.find((entry) => entry.id === normalized.id);
                  return exists ? prev : [normalized, ...prev];
                });
              }}
              renderOption={(option, isHighlighted) => (
                <div
                  className={`w-full px-4 py-3 text-left ${
                    isHighlighted ? "bg-blue-100" : "bg-white"
                  } hover:bg-blue-50 focus:bg-blue-50`}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    {option.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {option.code ? `SKU: ${option.code}` : ""}
                    {option.barcode ? ` | Barras: ${option.barcode}` : ""}
                  </p>
                </div>
              )}
            />

          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Versão da Ficha Técnica
            </label>
            <select
              value={form.bomId}
              onChange={(e) => handleBomChange(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            >
              <option value="">Selecione</option>
              {availableBoms.map((bom) => (
                <option key={bom.id} value={bom.id}>
                  Versão {bom.version} 
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Quantidade planejada
            </label>
            <input
              type="number"
              value={form.quantityPlanned}
              onChange={(event) =>
                setForm({
                  ...form,
                  quantityPlanned: Number(event.target.value),
                })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Unidade
            </label>
            <input
              value={form.unit}
              onChange={(event) =>
                setForm({
                  ...form,
                  unit: event.target.value.toUpperCase(),
                })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Inicio
            </label>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm({ ...form, startDate: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Entrega
            </label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(event) =>
                setForm({ ...form, dueDate: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Validade do lote
            </label>
            <input
              type="date"
              value={customValidateDate || validateDate || ""}
              onChange={(event) => setCustomValidateDate(event.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
         
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Lote
            </label>
            <input
              value={form.lote ?? ""}
              onChange={(event) =>
                setForm({ ...form, lote: Number(event.target.value) })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Quantidade de caixas
              </label>
              <input
                type="number"
                value={boxesQty}
                onChange={(e) => setBoxesQty(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Custo por caixa
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={boxCostInput}
                onChange={(e) => handlesetBoxCostChange(e.target.value)}
                onBlur={() => {
                  setBoxCostInput(boxCost.toFixed(2).replace(".", ","));
                }}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Mão de obra por unidade
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={laborPerUnitInput}
                onChange={(e) => handleLaborPerUnitChange(e.target.value)}
                onBlur={() => {
                  setLaborPerUnitInput(laborPerUnit.toFixed(2).replace(".", ","));
                }}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Preço unitário de venda
              </label>
              <input
                type="text"
                inputMode="decimal"   
                value={salePriceInput}
                onChange={(e) => handleSalePriceChange(e.target.value)}
                onBlur={() => {
                  setSalePriceInput(salePriceValue.toFixed(2).replace(".", ","));
                }}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Markup (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={markupInput}
                onChange={(e) => handleMarkupChange(e.target.value)}
                onBlur={() => {
                  setMarkupInput(markupValue.toFixed(2).replace(".", ","));
                }}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Impostos pós-venda (%)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={postSaleTax}
                onChange={(e) => setPostSaleTax(Number(e.target.value))}
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-500">
              Observações
            </label>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-2"
            />
          </div>

          {selectedBom || extraMaterials.length > 0 ? (
            <div className="md:col-span-3 space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase text-slate-500">Adicionar matéria-prima</p>
                  <p className="text-xs text-slate-500">
                    Itens extras entram direto na ficha técnica e nos c?lculos da OP.
                  </p>
                </div>
                {extraMaterials.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setExtraMaterials([])}
                    className="text-xs font-semibold text-red-600"
                  >
                    Limpar extras
                  </button>
                ) : null}
              </div>

              <SearchLookup
                table="t_itens"
                descriptionField="descricao"
                codeField="cditem"
                barcodeField="barcodeit"
                placeholder="Buscar e incluir MP adicional"
                onSelect={handleSelectExtraMaterial}
                renderOption={(option: SearchOption, isHighlighted: boolean) => (
                  <div
                    className={`w-full px-4 py-3 text-left ${
                      isHighlighted ? "bg-blue-100" : "bg-white"
                    } hover:bg-blue-50 focus:bg-blue-50`}
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {option.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {option.code ? `Codigo: ${option.code}` : ""}
                      {option.barcode ? ` | Barras: ${option.barcode}` : ""}
                    </p>
                  </div>
                )}
              />

              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase text-slate-500">Ficha técnica selecionada</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {(selectedBom?.productCode ?? form.productCode) || "--"} - Versão {selectedBom?.version ?? "1.0"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Lote base {selectedBom?.lotSize ?? form.quantityPlanned} | Validade {selectedBom?.validityDays ?? 0} dias
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 px-3 py-2 bg-slate-50">
                    <p className="text-[11px] uppercase text-slate-500">Qtd total MP</p>
                    <p className="text-base font-semibold text-slate-900">
                      {bomTotalsForPlan.totalQuantity.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 px-3 py-2 bg-slate-50">
                    <p className="text-[11px] uppercase text-slate-500">Custo total MP</p>
                    <p className="text-base font-semibold text-slate-900">
                      {formatCurrency_2(bomTotalsForPlan.totalCost)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="hidden bg-slate-50 text-left text-xs uppercase text-slate-500 md:grid md:grid-cols-12 md:gap-3 md:px-4 md:py-2">
                  <span className="md:col-span-4">Matéria-prima</span>
                  <span className="md:col-span-2">Qtd base</span>
                  <span className="md:col-span-2">Qtd (plan.)</span>
                  <span className="md:col-span-2">Custo unit.</span>
                  <span className="md:col-span-2">Custo total</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {bomTotalsForPlan.items.map((item, index) => {
                    const isExtra = Boolean((item as any).isExtra);
                    const extraIndex = isExtra
                      ? extraMaterials.findIndex(
                          (extra) =>
                            extra.id === (item as any).id ||
                            extra.componentCode === item.componentCode,
                        )
                      : -1;
                    const plannedCost =
                      item.plannedCost ??
                      (item.unitCost ?? 0) * (item.plannedQuantity ?? 0);

                    return (
                      <div
                        key={`${item.componentCode}-${item.description}-${index}`}
                        className="grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-12 md:items-center md:gap-3"
                      >
                        <div className="md:col-span-4">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-slate-900">{item.description || "--"}</p>
                            {isExtra ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                Extra
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">{item.componentCode}</p>
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                          <span className="md:hidden text-xs text-slate-500">Qtd base</span>
                          {isExtra ? (
                            <span>1</span>
                          ) : (
                            <span>{item.quantity}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                          <span className="md:hidden text-xs text-slate-500">Qtd (plan.)</span>
                          {isExtra ? (
                            <input
                              type="number"
                              min={0}
                              step="0.00001"
                              value={Number(item.plannedQuantity ?? 0)}
                              onChange={(e) => {
                                if (extraIndex !== -1) {
                                  updateExtraMaterial(extraIndex, "plannedQuantity", e.target.value);
                                }
                              }}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2"
                            />
                          ) : (
                            <span>{item.plannedQuantity.toFixed(2)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                          <span className="md:hidden text-xs text-slate-500">Custo unit.</span>
                          {isExtra ? (
                            <input
                              type="number"
                              min={0}
                              step="0.00001"
                              value={item.unitCost}
                              onChange={(e) => {
                                if (extraIndex !== -1) {
                                  updateExtraMaterial(extraIndex, "unitCost", e.target.value);
                                }
                              }}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2"
                            />
                          ) : (
                            <span>{formatCurrency(item.unitCost ?? 0)}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block gap-2">
                          <div>
                            <span className="md:hidden text-xs text-slate-500">Custo total</span>
                            <p>{formatCurrency_2(plannedCost)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (isExtra) {
                                if (extraIndex !== -1) removeExtraMaterial(extraIndex);
                              } else {
                                removeBaseMaterial(index);
                              }
                            }}
                            className="text-xs font-semibold text-red-600"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="md:col-span-3">
            <button>
              Gerar OP e calcular custos
            </button>
          </div>
            <div className="md:col-span-3">
            <button
              type="submit"
              
              className="w-full bg-blue-600 text-white py-3 rounded-2xl font-semibold
              hover:bg-blue-700
                cursor-pointer
                transition
              "
            >
              Gerar OP e calcular custos
            </button>
          </div>
        </form>
        {/* {bomItems.length > 0 && (
          <SectionCard title="Ficha T├cnica Selecionada" description="Base de custo e propor├├es">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-1">Item</th>
                  <th className="px-2 py-1">Qtd</th>
                  <th className="px-2 py-1">Unit├rio</th>
                  <th className="px-2 py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {bomItems.map((item, index) => (
                  <tr
                    key={`${item.componentCode}-${index}`}
                    className="border-t border-slate-100"
                  >
                    <td className="px-2 py-1">{item.description || "--"}</td>
                    <td className="px-2 py-1">{item.quantity}</td>
                    <td className="px-2 py-1">{formatCurrency(item.unitCost ?? 0)}</td>
                    <td className="px-2 py-1">
                      {formatCurrency((item.unitCost ?? 0) * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )} */}

      </SectionCard>

      <SectionCard
        title="Custos previstos"
        description="Baseado na ficha técnica vigente"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Custo unitário produção</p>
            <p className="text-xl font-semibold">{formatCurrency_2(productionUnitCost)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Embalagens (caixas)</p>
            <p className="text-xl font-semibold">{formatCurrency_2(packagingCost)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {boxesQty} caixas x {formatCurrency_2(boxCost)}
            </p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Mão de obra extra</p>
            <p className="text-xl font-semibold">{formatCurrency_2(extraLaborCost)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {formatCurrency_2(laborPerUnit)} / un x {form.quantityPlanned}
            </p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Custo total com extras</p>
            <p className="text-xl font-semibold">{formatCurrency_2(totalWithExtras)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Unitário: {formatCurrency_2(unitCostWithExtras)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Preço unitário venda</p>
            <p className="text-xl font-semibold">{formatCurrency_2(salePricePerUnit)}</p>
            <p className="text-xs text-slate-500 mt-1">Markup aplicado: {saleMarkupApplied.toFixed(2)}%</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Impostos pós-venda</p>
            <p className="text-xl font-semibold">{formatCurrency_2(postSaleTaxValue)}</p>
            <p className="text-xs text-slate-500 mt-1">{postSaleTax}% sobre preço</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Receita total</p>
            <p className="text-xl font-semibold">{formatCurrency_2(revenueTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">Líquida: {formatCurrency(netRevenueTotal)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Lucro estimado</p>
            <p className="text-xl font-semibold">{formatCurrency_2(profitTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">vs custo: {saleMarkupApplied.toFixed(2)}%</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Ordens registradas"
        description="Painel de custos e status por OP"
      >
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma OP registrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">OP</th>
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2">Qtd</th>
                  <th className="px-4 py-2">Unidade</th>
                  <th className="px-4 py-2">Entrega</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                  onClick={() => setSelectedOrderId(order.id || order.OP)}
                    className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${
                      (order.id === selectedOrderId || order.OP === selectedOrderId) ? "bg-blue-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-semibold text-slate-900">
                      {order.OP}
                    </td>
                    <td className="px-4 py-2">{order.productCode}</td>
                    <td className="px-4 py-2">{order.quantityPlanned}</td>
                    <td className="px-4 py-2">
                      {order.unit}
                    </td>
                    <td className="px-4 py-2">
                      {formatDateOrPlaceholder(order.dueDate)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={order.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {selectedOrder ? (
        <SectionCard
          title={`Resumo da OP ${selectedOrder.OP}`}
          description="Detalhes registrados no backend"
        >
          <div ref={printRef} className="space-y-6">
            {selectedOrderBreakdown ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Ingredientes</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrderBreakdown.ingredients)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Mão de obra</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrderBreakdown.labor)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Embalagem</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrderBreakdown.packaging)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Tributos</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrderBreakdown.taxes)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Custo unitário</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrder.unitCost)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Total lote</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrder.totalCost)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Unitário: {formatCurrencyOrDash(selectedOrder.unitCost)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Custos ainda não computados para esta ordem.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Produto</p>
                <p className="text-base font-semibold text-slate-900">
                  {selectedOrder.productCode} -{selectedOrder.productName}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Quantidade planejada: {selectedOrder.quantityPlanned}{" "}
                  {selectedOrder.unit}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Período</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatDateOrPlaceholder(selectedOrder.startDate)} {" "}
                  {formatDateOrPlaceholder(selectedOrder.dueDate)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Criada em {formatDateOrPlaceholder(selectedOrder.createdAt)}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Status atual</p>
                <div className="mt-1">
                  <StatusBadge status={selectedOrder.status} />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Última atualização{" "}
                  {formatDateOrPlaceholder(selectedOrder.updatedAt)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Matérias-primas registradas
              </h4>
              {selectedOrderRawMaterials.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Nenhum consumo apontado para esta OP.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="text-left text-slate-500 uppercase">
                      <tr>
                        <th className="px-2 py-1">Código</th>
                        <th className="px-2 py-1">Descrição</th>
                        <th className="px-2 py-1 text-right">Qtd</th>
                        <th className="px-2 py-1">Un</th>
                        <th className="px-2 py-1 text-right">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrderRawMaterials.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-2 py-1 font-mono text-xs">
                            {item.componentCode}
                          </td>
                          <td className="px-2 py-1">{item.description ?? "--"}</td>
                          <td className="px-2 py-1 text-right">
                            {item.quantityUsed.toFixed(2)}
                          </td>
                          <td className="px-2 py-1">{item.unit}</td>
                          <td className="px-2 py-1 text-right">
                            {item.unitCost !== undefined
                              ? formatCurrency(item.unitCost)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Produtos fabricados
              </h4>
              {selectedOrder.finishedGoods.length === 0 ? (
                        <p className="text-xs text-slate-500">
                  Nenhum apontamento de produção finalizado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="text-left text-slate-500 uppercase">
                      <tr>
                        <th className="px-2 py-1">Produto</th>
                        <th className="px-2 py-1">Lote</th>
                        <th className="px-2 py-1 text-right">Qtd boa</th>
                        <th className="px-2 py-1 text-right">Sucata</th>
                        <th className="px-2 py-1 text-right">Custo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.finishedGoods.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100">
                          <td className="px-2 py-1">{item.productCode}</td>
                          <td className="px-2 py-1">{item.lotNumber ?? "--"}</td>
                          <td className="px-2 py-1 text-right">
                            {item.quantityGood.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {item.quantityScrap.toFixed(2)}
                          </td>
                          <td className="px-2 py-1 text-right">
                            {item.unitCost !== undefined
                              ? formatCurrency(item.unitCost)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Histórico de status
              </h4>
              {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 ? (
                <ul className="space-y-2 text-xs md:text-sm">
                  {selectedOrder.statusHistory
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.timestamp).valueOf() -
                        new Date(b.timestamp).valueOf(),
                    )
                    .map((event) => (
                      <li
                        key={event.id}
                        className="flex items-center justify-between border border-slate-200 rounded-2xl px-3 py-2"
                      >
                        <div>
                          <StatusBadge status={event.status} />
                          <p className="text-slate-600">{event.notes ?? "--"}</p>
                        </div>
                        <div className="text-right text-slate-500">
                          <p>{event.responsible}</p>
                          <p>{formatDate(event.timestamp)}</p>
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">
                  Sem histórico sincronizado para esta ordem.
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={printOrder}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold"
            >
              Imprimir OP
            </button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
