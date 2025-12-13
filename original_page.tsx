'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import {
  createProductionOrder,
  listBoms,
  listProductionOrders,
  getBom,
  listRawMaterials as fetchOrderRawMaterials,
} from "@/modules/production/services/productionService";
import {
  ProductionOrder,
  ProductionOrderPayload,
  BomRecord,
  ProductPayload,
  OrderRawMaterial,
} from "@/modules/core/types";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { StatusBadge } from "@/modules/core/components/StatusBadge";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";
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
};

type AnyRecord = Record<string, unknown>;

const buildInitialOrder = (): ProductionOrderPayload => {
  const today = new Date();
  const start = today.toISOString().slice(0, 10);

  const due = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  return {
    // -----------------------------
    // ­ƒö╣ CAMPOS PRINCIPAIS
    // -----------------------------
    productCode: "",
    quantityPlanned: 1000,
    unit: "UN",
    startDate: start,
    dueDate: due,
    externalCode: "",
    notes: undefined,

    bomId: "",
    lote: null,
    validate: null,

    // -----------------------------
    // ­ƒö╣ CUSTOS E AJUSTES
    // -----------------------------
    boxesQty: 0,
    boxCost: 0,
    laborPerUnit: 0,
    salePrice: 0,
    markup: 0,
    postSaleTax: 0,

    customValidateDate: null,

    // -----------------------------
    // ­ƒö╣ RAW MATERIALS VAZIO (preenchido ap├│s selecionar BOM)
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
  // ­ƒö╣ CAMPOS OBRIGAT├ôRIOS
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
  // ­ƒö╣ CUSTOS DO ENVIO
  // -----------------------------
  boxesQty,
  boxCost,
  laborPerUnit,
  salePrice: salePriceValue,
  markup: markupValue,
  postSaleTax,
  customValidateDate,

  // =====================================================
  // ­ƒöÑ ENVIO REDUZIDO ÔÇö SOMENTE rawMaterials EM VEZ DA BOM
  // =====================================================
  rawMaterials: bomTotalsForPlan.items.map((item: any) => ({
    componentCode: item.componentCode,
    description: item.description ?? "",
    quantityUsed: item.plannedQuantity, // quantidade j├í escalada
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
    salePrice: getNumberValue(record, ["salePrice", "preco", "preco"], 0),
    costPrice: getNumberValue(record, ["costPrice", "custo", "custlq"], 0),
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

  const [bomSearch, setBomSearch] = useState("");
  const [showBomResults, setShowBomResults] = useState(false);
  const [loading, setLoading] = useState(true);

  const [bomDetails, setBomDetails] = useState<BomRecord | null>(null);
  const [bomItems, setBomItems] = useState<BomRecord["items"]>([]);

  const [boxesQty, setBoxesQty] = useState(0);
  
  const [boxCostInput, setBoxCostInput] = useState("0,00");
  const [boxCost, setBoxCost] = useState(0);

  const [laborPerUnitInput, setLaborPerUnitInput] = useState("0,00");
  const [laborPerUnit, setLaborPerUnit] = useState(0);
  //const [salePriceInput, setSalePriceInput] = useState(0);

  const [salePriceInput, setSalePriceInput] = useState("0,00"); // string para exibir
  const [salePriceValue, setSalePriceValue] = useState(0);  // n├║mero real

  const [markupInput, setMarkupInput] = useState("0,00");   // exibi├º├úo
  const [markupValue, setMarkupValue] = useState(0);    // num├®rico
  const [postSaleTax, setPostSaleTax] = useState(0);
  const [customValidateDate, setCustomValidateDate] = useState<string>("");

  const [highlightIndex, setHighlightIndex] = useState(-1);
  

  const printRef = useRef<HTMLDivElement>(null);

  const stripDiacritics = (value: string) =>
        value
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
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
          setSelectedOrderId(orderResponse[0].id);
        }

      }
    );
  }, [session]);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;

  const selectedOrderBreakdown = selectedOrder?.costBreakdown ?? null;

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
    if (!selectedBom || form.bomId) return;
    setForm((prev) => ({
      ...prev,
      bomId: selectedBom.id,
      productCode: prev.productCode || selectedBom.productCode,
    }));
  }, [form.bomId, selectedBom]);

  const previewTotals = useMemo(() => {
    const sourceItems =
    selectedBom?.items?.length ? selectedBom.items : bomItems ?? [];

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
    if (!selectedBom && (!bomItems || bomItems.length === 0)) return [];
    const items = selectedBom?.items?.length ? selectedBom.items : bomItems;
    return (items ?? []).map((item) => ({
      componentCode: item.componentCode,
      description: item.description,
      quantityUsed: item.quantity * form.quantityPlanned,
      quantity: item.quantity,
      plannedQuantity: form.quantityPlanned,
      unit: "UN",
      unitCost: item.unitCost,
    }));
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
        // ­ƒö╣ RAW MATERIALS
        // --------------------------
        rawMaterials,
  
        // --------------------------
        // ­ƒö╣ CAMPOS DE CUSTO
        // --------------------------
        boxesQty,
        boxCost,
        laborPerUnit,
        salePrice: salePriceValue,
        markup: markupValue,
        postSaleTax,
        customValidateDate: customValidateDate || null,
  
        // --------------------------
        // ­ƒö╣ AUTOR DA OP
        // --------------------------
        authoruser: session.user.name || "Desconhecido",
      };
  
      console.log("Payload a ser enviado:", payload);
  
      const created = await createProductionOrder(session, payload);
  
      setOrders((prev) => [created, ...prev]);
      setSelectedOrderId(created.id);
      resetFormState();
      setMessage(`OP ${created.OP} criada com sucesso.`);
  
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar OP");
    }
  };
  
  
  const bomTotalsForPlan = useMemo(() => {
    const sourceItems = selectedBom?.items?.length
      ? selectedBom.items
      : (bomItems ?? []);
    if (!sourceItems.length) {
      return {
        items: [],
        totalQuantity: 0,
        totalCost: 0,
      };
    }
    const multiplier = form.quantityPlanned;
    const itemsWithTotals = sourceItems.map((item) => {
      const plannedQuantity = item.quantity * multiplier;
      const plannedCost = plannedQuantity * (item.unitCost ?? 0);
      return {
        ...item,
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
  }, [bomItems, form.quantityPlanned, selectedBom]);

  const plannedQty = form.quantityPlanned || 0;
  const packagingCost = boxesQty * boxCost;
  const extraLaborCost = laborPerUnit * plannedQty;
  const baseProductionCost = bomTotalsForPlan?.totalCost ?? 0;
  const baseUnitMpCost = plannedQty > 0 ? bomTotalsForPlan.totalCost / plannedQty : 0;
  const packagingUnitCost = plannedQty > 0 ? packagingCost / plannedQty : 0;
  const productionUnitCost = baseUnitMpCost + packagingUnitCost + laborPerUnit;
  const totalWithExtras = productionUnitCost * plannedQty;
  const unitCostWithExtras = productionUnitCost;

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

  const handleMarkupChange = (text: string) => {
    // 1) Mant├®m string original digitada
    setMarkupInput(text);
  
    // 2) Normaliza
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
  
    // 3) Se v├ílido, atualiza valor num├®rico
    if (!isNaN(value)) {
      setMarkupValue(value);
  
      if (unitCostWithExtras > 0) {
        const calculatedSalePrice = unitCostWithExtras * (1 + value / 100);
  
        // Atualiza o valor num├®rico real
        setSalePriceValue(calculatedSalePrice);
  
        // Atualiza o valor exibido com v├¡rgula e 2 casas
        setSalePriceInput(
          calculatedSalePrice.toFixed(2).replace(".", ",")
        );
      }
    }
  };
  

  const handleSalePriceChange = (text: string) => {
    // 1) Mant├®m o texto digitado (preserva cursor)
    setSalePriceInput(text);
  
    // 2) Normaliza v├¡rgula ÔåÆ ponto para converter
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
    
    // 3) Se for n├║mero v├ílido, calcula o markup
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
  
  const handleSelectItem = (item: ItemRecord) => {
    setForm((prev) => ({
      ...prev,                          // mant├®m tudo que j├í existe
      productCode: item.cditem,        // codigo do produto
      notes: item.notes ?? "",         // notas pr├®-existentes
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
              <td class="cell right">${formatCurrency(item.totalCost ?? 0)}</td>
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
        : `<tr><td class="cell empty" colspan="5">Nenhum apontamento de produ├º├úo registrado.</td></tr>`;

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
                  <div>ORDEM DE PRODU├ç├âO</div>
                </div>
              </div>
              <div class="ref-box">
                <div><span class="ref-label">OP:</span> ${selectedOrder.OP ?? "--"}</div>
                <div><span class="ref-label">Emitida:</span> ${formatDatePrint(selectedOrder.createdAt)}</div>
              </div>
            </div>

            <div class="title">ORDEM DE PRODU├ç├âO</div>

            <div class="info-grid">
              <div class="info-row">
                <div class="info-label">N┬║ A/C</div>
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
                <div class="info-label">In├¡cio</div>
                <div class="info-value">${formatDatePrint(selectedOrder.startDate)}</div>
                <div class="info-label">Respons├ível</div>
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
                    <th>C├│digo</th>
                    <th>Descri├º├úo</th>
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
                    <td class="cell right"><strong>${formatCurrency(totalMaterialsCost)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Produ├º├úo / apontamentos</div>
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
                <div class="totals-value">${formatCurrency(selectedOrder.totalCost ?? totalMaterialsCost)}</div>
              </div>
              <div class="totals-item">
                <div class="totals-label">Custo unit├írio</div>
                <div class="totals-value">${formatCurrency(selectedOrder.unitCost ?? (selectedOrder.quantityPlanned ? totalMaterialsCost / selectedOrder.quantityPlanned : 0))}</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">Observa├º├Áes</div>
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

            <div class="footer">OP ${selectedOrder.OP ?? "--"} ÔÇó Documento gerado em ${formatDatePrint(new Date().toISOString())}</div>
          </div>

          <div class="page">
            <div class="req-header">
              <div>
                <div class="req-title">REQUISI├ç├âO DE MATERIAIS-PRIMA</div>
                <div style="font-size: 11px;">Ordem de produ├º├úo: <strong>${selectedOrder.OP ?? "--"}</strong></div>
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
                  <th>C├│digo</th>
                  <th>Descri├º├úo</th>
                  <th class="center">Un</th>
                  <th class="right">Qtd solicitada</th>
                  <th class="right">Qtd entregue</th>
                  <th>Observa├º├úo</th>
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
    async (orderId: string) => {
      if (!session || !orderId) return;
      try {
        const response = await fetchOrderRawMaterials(session, orderId);
        setRawMaterials(response);
        setOrders((prev) =>
          prev.map((order) =>
            order.id === orderId ? { ...order, rawMaterials: response } : order,
          ),
        );
      } catch (error) {
        console.error("Falha ao carregar mat├®rias-primas da OP:", error);
      }
    },
    [session],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedOrderId) {
      setRawMaterials([]);
      return;
    }
    setRawMaterials([]);
    fetchRawMaterials(selectedOrderId);
  }, [fetchRawMaterials, selectedOrderId]);

  return (
    <div className="space-y-6">
      {message ? (
        <div className="bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-2xl">
          {message}
        </div>
      ) : null}
      <SectionCard
        title="Nova Ordem de Producao"
        description="Dispara calculo de custo, baixa estoque e libera requisicoes"
        action={
          <button
            type="button"
            onClick={printOrder}
            disabled={!selectedOrder}
            className="text-sm font-semibold text-slate-600"
          >
            Imprimir requisicao
          </button>
        }
      >
        <form className="grid grid-cols-1 md:grid-cols-3 gap-4" onSubmit={handleSubmit}>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500">
              Produto
            </label>
            <input
              value={searchTerm}
              onFocus={() => searchTerm.trim() && setShowSearchResults(true)}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setShowSearchResults(true);
                setHighlightIndex(-1); // reset
              }}
              onKeyDown={(event) => {
                if (!showSearchResults || searchResults.length === 0) return;

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlightIndex((prev) =>
                    prev < searchResults.length - 1 ? prev + 1 : prev
                  );
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlightIndex((prev) => (prev > 0 ? prev - 1 : prev));
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  if (highlightIndex >= 0) {
                    handleSelectItem(searchResults[highlightIndex]);
                  }
                }

                if (event.key === "Escape") {
                  setShowSearchResults(false);
                }
              }}
              placeholder="Digite parte do nome, c├│digo ou c├│digo de barras"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2"
            />

            {searchTerm.trim() && showSearchResults ? (
              <div className="relative mt-2">
                {searchResults.length > 0 ? (
                  <div className="absolute z-10 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {searchResults.map((item, index) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className={`w-full px-4 py-3 text-left 
                          ${index === highlightIndex ? "bg-blue-50" : "hover:bg-blue-50"}`} 
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          SKU: {item.sku}
                          {item.barcode ? ` ÔÇó Barras: ${item.barcode}` : ""}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nenhum item encontrado com os filtros informados.
                  </p>
                )}
              </div>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Vers├úo da Ficha T├®cnica
            </label>
            <select
              value={form.bomId}
              onChange={(e) => handleBomChange(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            >
              <option value="">Selecione</option>
              {availableBoms.map((bom) => (
                <option key={bom.id} value={bom.id}>
                  Versao {bom.version} 
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
                M├úo de obra por unidade
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
                Pre├ºo unit├írio de venda
              </label>
              <input
                type="text"
                inputMode="decimal"   // mostra teclado num├®rico no mobile
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
                Impostos p├│s-venda (%)
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
              Observacoes
            </label>
            <textarea
              value={form.notes}
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-2"
            />
          </div>

          {selectedBom ? (
            <div className="md:col-span-3 space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase text-slate-500">Ficha t├®cnica selecionada</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedBom.productCode} ÔÇó Vers├úo {selectedBom.version}
                  </p>
                  <p className="text-xs text-slate-500">
                    Lote base {selectedBom.lotSize} | Validade {selectedBom.validityDays} dias
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
                      {formatCurrency(bomTotalsForPlan.totalCost)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="hidden bg-slate-50 text-left text-xs uppercase text-slate-500 md:grid md:grid-cols-12 md:gap-3 md:px-4 md:py-2">
                  <span className="md:col-span-4">Mat?ria-prima</span>
                  <span className="md:col-span-2">Qtd base</span>
                  <span className="md:col-span-2">Qtd (plan.)</span>
                  <span className="md:col-span-2">Custo unit.</span>
                  <span className="md:col-span-2">Custo total</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {bomTotalsForPlan.items.map((item) => (
                    <div
                      key={`${item.componentCode}-${item.description}`}
                      className="grid grid-cols-1 gap-2 px-4 py-3 text-sm md:grid-cols-12 md:items-center md:gap-3"
                    >
                      <div className="md:col-span-4">
                        <p className="font-semibold text-slate-900">{item.description || "--"}</p>
                        <p className="text-xs text-slate-500">{item.componentCode}</p>
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                        <span className="md:hidden text-xs text-slate-500">Qtd base</span>
                        <span>{item.quantity}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                        <span className="md:hidden text-xs text-slate-500">Qtd (plan.)</span>
                        <span>{item.plannedQuantity.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                        <span className="md:hidden text-xs text-slate-500">Custo unit.</span>
                        <span>{formatCurrency(item.unitCost ?? 0)}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-900 md:col-span-2 md:block">
                        <span className="md:hidden text-xs text-slate-500">Custo total</span>
                        <span>{formatCurrency(item.plannedCost)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
          
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
          <SectionCard title="Ficha T├®cnica Selecionada" description="Base de custo e propor├º├Áes">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-1">Item</th>
                  <th className="px-2 py-1">Qtd</th>
                  <th className="px-2 py-1">Unit├írio</th>
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
        description="Baseado na ficha tecnica vigente"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Custo unit├írio produ├º├úo</p>
            <p className="text-xl font-semibold">{formatCurrency(productionUnitCost)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Embalagens (caixas)</p>
            <p className="text-xl font-semibold">{formatCurrency(packagingCost)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {boxesQty} caixas x {formatCurrency(boxCost)}
            </p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">M├úo de obra extra</p>
            <p className="text-xl font-semibold">{formatCurrency(extraLaborCost)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {formatCurrency(laborPerUnit)} / un x {form.quantityPlanned}
            </p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Custo total com extras</p>
            <p className="text-xl font-semibold">{formatCurrency(totalWithExtras)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Unit├írio: {formatCurrency(unitCostWithExtras)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Pre├ºo unit├írio venda</p>
            <p className="text-xl font-semibold">{formatCurrency(salePricePerUnit)}</p>
            <p className="text-xs text-slate-500 mt-1">Markup aplicado: {saleMarkupApplied.toFixed(2)}%</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Impostos p├│s-venda</p>
            <p className="text-xl font-semibold">{formatCurrency(postSaleTaxValue)}</p>
            <p className="text-xs text-slate-500 mt-1">{postSaleTax}% sobre pre├ºo</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Receita total</p>
            <p className="text-xl font-semibold">{formatCurrency(revenueTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">L├¡quida: {formatCurrency(netRevenueTotal)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Lucro estimado</p>
            <p className="text-xl font-semibold">{formatCurrency(profitTotal)}</p>
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
                    onClick={() => setSelectedOrderId(order.id)}
                    className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${
                      order.id === selectedOrderId ? "bg-blue-50/50" : ""
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
                  <p className="text-xs text-slate-500">M├úo de obra</p>
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
                  <p className="text-xs text-slate-500">Overhead</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrderBreakdown.overhead)}
                  </p>
                </div>
                <div className="border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs text-slate-500">Total lote</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {formatCurrencyOrDash(selectedOrder.totalCost)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Unit├írio: {formatCurrencyOrDash(selectedOrder.unitCost)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Custos ainda n├úo computados para esta ordem.
              </p>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Produto</p>
                <p className="text-base font-semibold text-slate-900">
                  {selectedOrder.productCode}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Quantidade planejada: {selectedOrder.quantityPlanned}{" "}
                  {selectedOrder.unit}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Per├¡odo</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatDateOrPlaceholder(selectedOrder.startDate)} ÔåÆ{" "}
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
                  ├Ültima atualiza├º├úo{" "}
                  {formatDateOrPlaceholder(selectedOrder.updatedAt)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Mat├®rias-primas registradas
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
                        <th className="px-2 py-1">C├│digo</th>
                        <th className="px-2 py-1">Descri├º├úo</th>
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
                  Nenhum apontamento de produ├º├úo finalizado.
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
                Hist├│rico de status
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
                  Sem hist├│rico sincronizado para esta ordem.
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
