'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import {
  createProductionOrder,
  listBoms,
  listProductionOrders,
  getBom,
} from "@/modules/production/services/productionService";
import {
  ProductionOrder,
  ProductionOrderPayload,
  BomRecord,
  ProductPayload,
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
    // ---- CAMPOS DO FORM PRINCIPAL ----
    OP: "",
    productCode: "",
    quantityPlanned: 1000,
    unit: "UN",
    startDate: start,
    dueDate: due,
    externalCode: "",
    notes: "",

    bomId: "",
    lote: null,
    validate: null,

    rawMaterials: [],

    // ---- NOVOS CAMPOS DO FORMULÁRIO ----
    boxesQty: 0,
    boxCost: 0,
    laborPerUnit: 0,
    salePrice: 0,
    markup: 0,
    postSaleTax: 0,

    customValidateDate: null,

    // ---- CAMPOS DO BLOCO BOM (vêm depois da seleção) ----
    referenceBom: {
      productCode: "",
      version: "0",
      lotSize: 0,
      validityDays: 0,
    },

    bomTotals: {
      totalQuantity: 0,
      totalCost: 0,
    },

    bomItems: [],
  };
};



const calculateValidate = (startDate: string) => {
  return dayjs(startDate).add(30, "day").format("YYYY-MM-DD");
};

const buildProductionOrderPayload = (
  form: any,
  rawMaterials: ProductionOrderPayload["rawMaterials"],
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
  productCode: form.productCode,
  quantityPlanned: Number(form.quantityPlanned),
  unit: form.unit,
  startDate: form.startDate,
  dueDate: form.dueDate,
  externalCode: form.externalCode,

  notes: form.notes?.trim() ? form.notes : undefined,

  bomId: form.bomId || "",
  lote: form.lote ? Number(form.lote) : null,
  validate: customValidateDate || calculateValidate(form.startDate),

  rawMaterials,

  // ---- NOVOS BLOCOS ----

  referenceBom: {
    productCode: referenceBom?.productCode ?? "",
    version: referenceBom?.version ?? 0,
    lotSize: referenceBom.lotSize,
    validityDays: referenceBom.validityDays,
  },

  bomTotals: {
    totalQuantity: bomTotalsForPlan.totalQuantity,
    totalCost: bomTotalsForPlan.totalCost,
  },

  bomItems: bomTotalsForPlan.items.map((item: any) => ({
    componentCode: item.componentCode,
    description: item.description ?? "",
    quantity: item.quantity,
    plannedQuantity: item.plannedQuantity,
    unitCost: item.unitCost ?? 0,
    plannedCost: item.plannedCost,
  })),

  // ---- CAMPOS DO FORMULÁRIO ----

  boxesQty,
  boxCost,
  laborPerUnit,
  salePrice: salePriceValue,
  markup: markupValue,
  postSaleTax,

  customValidateDate,
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
  const [salePriceValue, setSalePriceValue] = useState(0);  // número real

  const [markupInput, setMarkupInput] = useState("0,00");   // exibição
  const [markupValue, setMarkupValue] = useState(0);    // numérico
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
   
   
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setMessage(null);
  
    try {
      const rawMaterials = buildRawMaterials();
  
      const validateForPayload = customValidateDate || validateDate;

      const payload: ProductionOrderPayload = {
        productCode: form.productCode,
        quantityPlanned: form.quantityPlanned,
        unit: form.unit,
        startDate: form.startDate,
        dueDate: form.dueDate,
        externalCode: form.externalCode,
        notes: form.notes && form.notes.trim() !== "" ? form.notes : undefined,
        bomId: form.bomId,
        lote: form.lote || null,
        validate: validateForPayload,
        rawMaterials,
      
        // ---- CAMPOS NOVOS DO FORMULÁRIO ----
        boxesQty,
        boxCost,
        laborPerUnit,
        salePrice: salePriceValue,
        markup: markupValue,
        postSaleTax,
        customValidateDate: customValidateDate || null,
      
        // ---- NOVOS CAMPOS DO BLOCO DE BOM ----
        referenceBom: {
          productCode: selectedBom?.productCode ?? "",
          version: selectedBom?.version ?? "",  
          lotSize: selectedBom?.lotSize ?? 0,
          validityDays: selectedBom?.validityDays ?? 0,
        },
      
        bomTotals: {
          totalQuantity: bomTotalsForPlan.totalQuantity,
          totalCost: bomTotalsForPlan.totalCost,
        },
      
        bomItems: bomTotalsForPlan.items.map((item) => ({
          componentCode: item.componentCode,
          description: item.description ?? "",
          quantity: item.quantity,
          plannedQuantity: item.plannedQuantity,
          unitCost: item.unitCost ?? 0,
          plannedCost: item.plannedCost,
        })),
      };
      
      console.log("Payload a ser enviado:", payload);
  
      const created = await createProductionOrder(session, payload);
  
      setOrders((prev) => [created, ...prev]);
      setSelectedOrderId(created.id);
      setForm(buildInitialOrder());
      setMessage(`OP ${created.externalCode} criada com sucesso.`);
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

  const handleMarkupChange = (text: string) => {
    // 1) Mantém string original digitada
    setMarkupInput(text);
  
    // 2) Normaliza
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
  
    // 3) Se válido, atualiza valor numérico
    if (!isNaN(value)) {
      setMarkupValue(value);
  
      if (unitCostWithExtras > 0) {
        const calculatedSalePrice = unitCostWithExtras * (1 + value / 100);
  
        // Atualiza o valor numérico real
        setSalePriceValue(calculatedSalePrice);
  
        // Atualiza o valor exibido com vírgula e 2 casas
        setSalePriceInput(
          calculatedSalePrice.toFixed(2).replace(".", ",")
        );
      }
    }
  };
  

  const handleSalePriceChange = (text: string) => {
    // 1) Mantém o texto digitado (preserva cursor)
    setSalePriceInput(text);
  
    // 2) Normaliza vírgula → ponto para converter
    const normalized = text.replace(",", ".");
    const value = Number(normalized);
    
    // 3) Se for número válido, calcula o markup
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
      ...prev,                          // mantém tudo que já existe
      productCode: item.cditem,        // codigo do produto
      notes: item.notes ?? "",         // notas pré-existentes
      isComposed: item.isComposed,
      isRawMaterial: item.isRawMaterial,
    }));
  
    setSearchTerm(item.name);
    setShowSearchResults(false);
  };
  

  const printOrder = () => {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const popup = window.open("", "print", "width=900,height=700");
    if (!popup) return;
    popup.document.write(`
      <html>
        <head>
          <title>OP ${selectedOrder?.externalCode ?? ""}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            td, th { border: 1px solid #ccc; padding: 8px; }
          </style>
        </head>
        <body>
          ${content}
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
    popup.close();
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

  useEffect(() => {
    loadData();
  }, [loadData]);

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
              placeholder="Digite parte do nome, código ou código de barras"
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
                          {item.barcode ? ` • Barras: ${item.barcode}` : ""}
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
                inputMode="decimal"   // mostra teclado numérico no mobile
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
                  <p className="text-xs uppercase text-slate-500">Ficha técnica selecionada</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedBom.productCode} • Versão {selectedBom.version}
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
          <SectionCard title="Ficha Técnica Selecionada" description="Base de custo e proporções">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-1">Item</th>
                  <th className="px-2 py-1">Qtd</th>
                  <th className="px-2 py-1">Unitário</th>
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
            <p className="text-xs text-slate-500">Custo unitário produção</p>
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
            <p className="text-xs text-slate-500">Mão de obra extra</p>
            <p className="text-xl font-semibold">{formatCurrency(extraLaborCost)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {formatCurrency(laborPerUnit)} / un x {form.quantityPlanned}
            </p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Custo total com extras</p>
            <p className="text-xl font-semibold">{formatCurrency(totalWithExtras)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Unitário: {formatCurrency(unitCostWithExtras)}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Preço unitário venda</p>
            <p className="text-xl font-semibold">{formatCurrency(salePricePerUnit)}</p>
            <p className="text-xs text-slate-500 mt-1">Markup aplicado: {saleMarkupApplied.toFixed(2)}%</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50">
            <p className="text-xs text-slate-500">Impostos pós-venda</p>
            <p className="text-xl font-semibold">{formatCurrency(postSaleTaxValue)}</p>
            <p className="text-xs text-slate-500 mt-1">{postSaleTax}% sobre preço</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Receita total</p>
            <p className="text-xl font-semibold">{formatCurrency(revenueTotal)}</p>
            <p className="text-xs text-slate-500 mt-1">Líquida: {formatCurrency(netRevenueTotal)}</p>
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
                  {selectedOrder.productCode}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Quantidade planejada: {selectedOrder.quantityPlanned}{" "}
                  {selectedOrder.unit}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-xs text-slate-500">Período</p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatDateOrPlaceholder(selectedOrder.startDate)} →{" "}
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
              {selectedOrder.rawMaterials.length === 0 ? (
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
                      {selectedOrder.rawMaterials.map((item) => (
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
