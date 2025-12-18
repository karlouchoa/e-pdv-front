'use client';

import { api } from "@/modules/core/services/api";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { formatCurrency } from "@/modules/core/utils/formatters";
import {
  BomItemPayload,
  BomPayload,
  BomRecord,
} from "@/modules/core/types";
import { calculateBomTotals } from "@/modules/production/utils/calc";
import { SearchLookup, SearchOption } from "@/modules/core/components/SearchLookup";

import {
  // createBom,
  // listBoms,
  listProductFormulas,
} from "@/modules/production/services/productionService";

import {
  createBomAxios,
  updateBomAxios,
  getBomAxios,
  listBomsAxios,
} from "@/modules/production/services/bomService";

const baseBom: Omit<BomPayload, "items"> = {
  productCode: "",
  version: "1.0",
  lotSize: 100,
  validityDays: 30,
  marginTarget: 15,
  marginAchieved: 0, // Default value for marginAchieved
};

const defaultItem: BomItemPayload = {
  componentCode: "",
  description: "",
  quantity: 1,
  unitCost: 0,
  quantity_base: 1,
  fator: 1,
};

const MAX_CODE_LENGTH = 80;
const MIN_LOT_SIZE = 1;

const isValidBomItem = (item: BomItemPayload) =>
  Boolean(item.componentCode) &&
  item.componentCode.length <= MAX_CODE_LENGTH &&
  Number.isFinite(item.quantity) &&
  item.quantity > 0 &&
  Number.isFinite(item.unitCost) &&
  item.unitCost >= 0;

type AnyRecord = Record<string, unknown>;

type CatalogItem = {
  id: string;
  code: string;
  name: string;
  description: string;
  unit: string;
  cost: number;
  isComposed: boolean;
  isRawMaterial: boolean;
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

const extractArray = <T,>(value: unknown): T[] => {
  const result = findArrayDeep(value);
  return Array.isArray(result) ? (result as T[]) : [];
};

const isRawMaterialFlag = (record: AnyRecord) => {
  const flag = getStringValue(record, ["matprima", "mp"], "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return flag === "S";
};

const isComposedFlag = (record: AnyRecord) => {
  const flag = getStringValue(record, ["itprodsn"], "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return flag === "S";
};

const normalizeCatalogItem = (
  raw: AnyRecord,
  fallbackId: string,
): CatalogItem => {
  const record = toRecord(raw);
  const code = getStringValue(record, ["cditem", "sku", "code"], fallbackId);
  const name = getStringValue(record, ["deitem", "name", "defat"], "");
  return {
    id: getStringValue(record, ["id", "ID"], fallbackId),
    code,
    name,
    description: name,
    unit: getStringValue(record, ["unid", "unit"], "UN"),
    cost: getNumberValue(record, ["custo", "costPrice", "custlq"], 0),
    isComposed: isComposedFlag(record),
    isRawMaterial: isRawMaterialFlag(record),
  };
};

const normalizeFormulaComponent = (raw: AnyRecord): BomItemPayload => {
  const record = toRecord(raw);

  // Garantir que materiaPrima exista como objeto
  const joined = (record.materiaPrima ?? record.materiaprima ?? {}) as AnyRecord;
  const baseQty = getNumberValue(
    record,
    ["quantity_base", "qtBase", "qt_base"],
    Number.NaN,
  );
  const rawQty = getNumberValue(
    record,
    [
      "qtdemp",
      "quantity",
      "qtde",
      "quantidade",
      "qtitem",
      "qtcomponent",
      "qtinsumo",
    ],
    Number.NaN,
  );
  const resolvedQty = Number.isFinite(baseQty) ? baseQty : rawQty;
  const resolvedBase =
    Number.isFinite(baseQty) && baseQty !== null
      ? baseQty
      : Number.isFinite(rawQty)
        ? rawQty
        : 0;
  const resolvedFator = getNumberValue(record, ["fator"], Number.NaN);

  return {
    componentCode: getStringValue(
      record,
      [
        "matprima",
        "componentCode",
        "component_code",
        "cdcomponente",
        "cdmatprima",
        "cdmp",
        "cditemmp",
        "cdinsumo",
      ],
      "",
    ),

    description: getStringValue(
      record,
      [
        "deitem_iv",
        "description",
        "desccomponente",
        "dematprima",
        "deitemmp",
        "deitem",
      ],
      "",
    ),

    // Exibe a quantidade base enviada pelo backend (quantity_base) ou, se ausente, a quantity
    quantity: Number.isFinite(resolvedQty) ? resolvedQty : 0,

    unitCost:
      // 1) primeiro tenta pegar do JOIN
      getNumberValue(
        joined,
        ["custo", "unitCost", "vlrcusto", "vlr_custo"],
        0,
      ) ||

      // 2) se não vier do JOIN, pega do próprio registro
      getNumberValue(
        record,
        [
          "custocomponente",
          "custo",
          "vlrcusto",
          "vlr_custo",
          "unitCost",
          "unit_cost",
          "custounit",
        ],
        0,
      ),
    quantity_base: Number.isFinite(resolvedBase) ? resolvedBase : 0,
    // Fator enviado pelo backend (fator)
    fator: Number.isFinite(resolvedFator) ? resolvedFator : undefined,
  };
};


const buildDisplayLabel = (item: CatalogItem) =>
  `${item.code} - ${item.name}`;

export default function BomPage() {
  const { session } = useSession();
  const [bomData, setBomData] = useState(baseBom);
  const [items, setItems] = useState<BomItemPayload[]>([
    { ...defaultItem },
  ]);
  const [saving, setSaving] = useState(false);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<CatalogItem | null>(
    null,
  );
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [formulaHasData, setFormulaHasData] = useState(false);
  const quantityInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const unitCostInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const [pendingQuantityFocusIndex, setPendingQuantityFocusIndex] = useState<
    number | null
  >(null);
  const [perctDrafts, setperctDrafts] = useState<string[]>([]);

  useEffect(() => {
    setperctDrafts((prev) => {
      if (prev.length === items.length) return prev;
      return items.map((item, index) => {
        const fallbackFator = Number.isFinite((item as any).percentage)
          ? Number((item as any).percentage) / 100
          : 1;
        return prev[index] ?? formatPct(item.fator ?? fallbackFator);
      });
    });
  }, [items]);

  const [version, setVersion] = useState("1.0");

  useEffect(() => {
    quantityInputsRef.current = quantityInputsRef.current.slice(0, items.length);
    unitCostInputsRef.current = unitCostInputsRef.current.slice(0, items.length);
  }, [items.length]);

  useEffect(() => {
    if (pendingQuantityFocusIndex === null) return;
    const index = pendingQuantityFocusIndex;
    requestAnimationFrame(() => {
      quantityInputsRef.current[index]?.focus();
      quantityInputsRef.current[index]?.select();
      setPendingQuantityFocusIndex(null);
    });
  }, [items, pendingQuantityFocusIndex]);
  
  useEffect(() => {
    if (!session) return;
  
    listBomsAxios()
      .then((data) => setBoms(data))
      .catch((err) => {
        console.error("Erro ao carregar BOMs:", err);
      });
  }, [session]);

  useEffect(() => {
    if (!session || !selectedProduct) {
      setFormulaError(null);
      setFormulaHasData(false);
      return;
    }
    let cancelled = false;
    const loadFormula = async () => {
      setFormulaLoading(true);
      setFormulaError(null);
      setFormulaHasData(false);
      try {

        // console.log("🔎 Requisição listProductFormulas → payload enviado:", {
        //   tenant: session?.tenant,
        //   productCode: selectedProduct.code,
        // });
        
        const response = await listProductFormulas(
          session,
          selectedProduct.code,
        );

        // console.log("🔎 Resposta do backend (BOM):", response);

        // 1️⃣ Preencher versão no formulário
        if (response && response.version) {
          setBomData((prev) => ({
            ...prev,
            version: response.version,
            lotSize: Number(response.lot_size ?? prev.lotSize),
            validityDays: Number(response.validity_days ?? prev.validityDays),
            marginTarget: Number(response.margin_target ?? prev.marginTarget),
            marginAchieved: Number(response.margin_achieved ?? prev.marginAchieved),
          }));
        }

        if (cancelled) return;
        const rawItems = extractArray<AnyRecord>(response);
        const normalized = rawItems
          .map((record) => normalizeFormulaComponent(record))
          .filter((entry) => entry.componentCode || entry.description)
          .map(withperct);
       
        // console.log("🔧 ITENS NORMALIZADOS QUE IRÃO PARA A TABELA:", normalized); // ⬅ AQUI

        if (normalized.length > 0) {
          setItems(normalized);
          setFormulaHasData(true);
        } else {
          setItems([{ ...defaultItem }]);
          setFormulaHasData(false);
        }

      } catch (error) {
        if (cancelled) return;
        setFormulaError(
          error instanceof Error
            ? error.message
            : "Falha ao carregar formula do produto.",
        );
        setItems([{ ...defaultItem }]);
      } finally {
        if (cancelled) return;
        setFormulaLoading(false);
      }
    };
    loadFormula();
    return () => {
      cancelled = true;
    };
  }, [session, selectedProduct]);

  const normalizeDecimal = (v: any) => {
    if (typeof v === "string") return v.replace(",", ".");
    return v;
  };

  const toSeven = (value: number) => Number(value.toFixed(7));

const formatPct = (value: number) => {
  if (!Number.isFinite(value)) return "";
  const trimmed = value.toFixed(4).replace(/\.?0+$/, "");
  return trimmed.replace(".", ",");
};

const withperct = (item: BomItemPayload): BomItemPayload => ({
  ...item,
  fator: (() => {
    if (Number.isFinite(item.fator)) return Number(item.fator);
    if (Number.isFinite((item as any).percentage))
      return Number((item as any).percentage) / 100;
    return 1;
  })(),
});

  const getItemTotal = (item: BomItemPayload) => {
    const fator = (() => {
      if (Number.isFinite(item.fator)) return Number(item.fator);
      if (Number.isFinite((item as any).percentage)) {
        return Number((item as any).percentage) / 100;
      }
      return 1;
    })();
    const normalizedPct = toSeven(fator);
    const baseQty = Number.isFinite((item as any).quantity_base)
      ? Number((item as any).quantity_base)
      : item.quantity;
    const effectiveQty = toSeven(baseQty * normalizedPct);
    return toSeven(effectiveQty * item.unitCost);
  };

  const totals = useMemo(() => {
    return calculateBomTotals({
      ...bomData,
      items: items.map(withperct),
    });
  }, [bomData, items]);

  const updateItem = (
    index: number,
    field: keyof BomItemPayload,
    value: string,
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      const current = copy[index];
      const numericFields: Array<keyof BomItemPayload> = [
        "quantity",
        "unitCost",
        "fator",
        "quantity_base",
      ];
      const numericValue = Number(value);
      const parsed =
        numericFields.includes(field) && Number.isFinite(numericValue)
          ? numericValue
          : value;

      copy[index] = {
        ...current,
        [field]: parsed as any,
        ...(field === "quantity"
          ? { quantity_base: Number.isFinite(numericValue) ? numericValue : current.quantity_base }
          : {}),
      };
      return copy;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { ...defaultItem }]);
    quantityInputsRef.current.push(null);
    unitCostInputsRef.current.push(null);
  };

  const removeItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, position) => position !== index);
      return next.length > 0 ? next : [{ ...defaultItem }];
    });
    quantityInputsRef.current.splice(index, 1);
    unitCostInputsRef.current.splice(index, 1);
    setperctDrafts((prev) => {
      const next = prev.filter((_, position) => position !== index);
      return next.length > 0
        ? next
        : [formatPct(defaultItem.fator  ?? 1)];
    });
  };

  const handleSelectProduct = (item: CatalogItem) => {
    setSelectedProduct(item);

    setBomData((prev) => ({
      ...prev,
      productCode: item.code,
    }));
  };

  const populateItemFromMaterial = (material: CatalogItem) => {

    // console.log("📌 populateItemFromMaterial(): RECEBEU:", {
    //   code: material.code,
    //   description: material.description,
    //   cost: material.cost,
    // });
  
    setItems((prev) => {
      // console.log("📌 Antes do update, prev items:", prev);
  
      const next = [...prev];
      let targetIndex = next.findIndex(
        (entry) =>
          !(entry.componentCode ?? "").trim() &&
          !(entry.description ?? "").trim(),
      );
  
      if (targetIndex === -1) {
        next.push({ ...defaultItem });
        targetIndex = next.length - 1;
      }
  
      const currentQuantity = next[targetIndex].quantity || 1;
  
      next[targetIndex] = {
        ...next[targetIndex],
        componentCode: material.code,
        description: material.description,
        quantity: currentQuantity,
        quantity_base: currentQuantity,
        unitCost: material.cost,
      };
  
      // console.log("📌 Depois do update, next items:", next);
  
      setPendingQuantityFocusIndex(targetIndex);
  
      return next;
    });
  };
  

  const handleSelectMaterial = (item: CatalogItem) => {
    populateItemFromMaterial(item);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
  
    setFeedback(null);
  
    // -------------------------------
    // VALIDAÇÃO SIMPLES E DIRETA
    // -------------------------------
    const productCode = String(bomData.productCode ?? "").trim();
    const lotSize = Number(bomData.lotSize);
    const validityDays = Number(bomData.validityDays);
    const marginTarget = Number(bomData.marginTarget);
    const marginAchievedValue =
      Number.isFinite(totals.marginAchieved)
        ? totals.marginAchieved
        : Number(bomData.marginAchieved);
  
    // Sanitizar itens
    const sanitizedItems: BomItemPayload[] = items.map((item) => ({
      componentCode: String(item.componentCode ?? "").trim(),
      description: String(item.description ?? "").trim(),
      quantity: Number(item.quantity),
      quantity_base: Number(item.quantity_base ?? item.quantity),
      unitCost: Number(item.unitCost),
      fator: (() => {
        if (Number.isFinite(item.fator)) return Number(item.fator);
        if (Number.isFinite((item as any).percentage))
          return Number((item as any).percentage) / 100;
        return 1;
      })(),
    }));
  
    const hasInvalidItem = sanitizedItems.some((item) => {
      if (!item.componentCode) return false; // permitido campo vazio na linha
      return !(
        item.componentCode &&
        item.componentCode.length <= 80 &&
        item.quantity > 0 &&
        item.unitCost >= 0
      );
    });
  
    const validItems = sanitizedItems.filter(
      (item) =>
        item.componentCode &&
        item.componentCode.length <= 80 &&
        item.quantity > 0 &&
        item.unitCost >= 0,
    );
  
    if (!productCode) {
      return setFeedback("Informe um produto válido antes de salvar.");
    }
    if (productCode.length > 80) {
      return setFeedback("O código do produto deve ter no máximo 80 caracteres.");
    }
    if (!Number.isFinite(lotSize) || lotSize < 0) {
      return setFeedback("O lote padrão precisa ser maior ou igual a 0.0001.");
    }
    if (!Number.isInteger(validityDays) || validityDays < 0) {
      return setFeedback("A validade deve ser um número inteiro >= 0.");
    }
    if (!Number.isFinite(marginTarget) || marginTarget < 0) {
      return setFeedback("A margem alvo deve ser um número válido e não negativo.");
    }
    if (!Number.isFinite(marginAchievedValue)) {
      return setFeedback("A margem calculada é inválida.");
    }
    if (hasInvalidItem) {
      return setFeedback(
        "Revise as matérias-primas: código válido, quantidade > 0, custo >= 0."
      );
    }
    if (validItems.length === 0) {
      return setFeedback("Adicione pelo menos uma matéria-prima válida.");
    }
  
    // -------------------------------
    // MONTAR PAYLOAD DIRETO
    // -------------------------------
    const payload = {
      productCode,
      version: bomData.version,
      lotSize,
      validityDays,
      marginTarget,
      marginAchieved: marginAchievedValue,
      notes: bomData.notes ?? null,
      items: validItems.map((item) => ({
        componentCode: item.componentCode,
        description: item.description,
        quantity: item.quantity,
        quantity_base: item.quantity_base ?? item.quantity,
        unitCost: item.unitCost,
        fator: Number.isFinite(item.fator)
          ? Number(item.fator)
          : 1,
      })),
    };
  
    // -------------------------------
    // CHAMADA AXIOS DIRETA — SIMPLES
    // -------------------------------
    setSaving(true);
    try {
    
      console.log("📦 PAYLOAD FINAL PARA O BACKEND:", payload);
      const response = await api.post("/production/bom", payload);
  
      const savedBom = response.data;
      // console.log("📌 BOM salva com sucesso:", savedBom);
      const savedId = savedBom.id;
      const fullBom = await api.get(`/production/bom/${savedId}`);
      setBoms(prev => {
        const filtered = prev.filter(b => b.id !== savedId);
        return [fullBom.data, ...filtered];
      });

      setFeedback("BOM salva com sucesso!");

      // ----------------------------
      //  🔥 IMPRIMIR (baixar o PDF)
      // ----------------------------
      try {
        const pdfResponse = await api.get(
          `/production/bom/${savedBom.id}/pdf`,
          { responseType: "blob" }
        );

        const blob = new Blob([pdfResponse.data], {
          type: "application/pdf",
        });

        const url = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = `BOM_${savedBom.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();

        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Erro ao gerar PDF do BOM:", err);
      }

    } catch (error: any) {
      console.error("Erro ao salvar BOM:", error);
  
      const msg =
        error?.response?.data?.message ??
        error?.message ??
        "Falha ao salvar BOM.";
  
      setFeedback(String(msg));
    } finally {
      setSaving(false);
    }
  };

  const handlePrintBom = async (id: string) => {
    try {
      const response = await api.get(`/production/bom/${id}/pdf`, {
        responseType: "blob",
      });
  
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
  
      const link = document.createElement("a");
      link.href = url;
      link.download = `BOM_${id}.pdf`;
      link.click();
  
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Falha ao gerar o PDF.");
    }
  };
  
  
  return (
    <form className="space-y-6" 
          onSubmit={handleSave}
          
          >
      {feedback ? (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-2xl">
          {feedback}
        </div>
      ) : null}
      <SectionCard
        title="Ficha técnica"
        description="Estrutura do produto acabado e custos diretos"
        action={
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 text-white px-6 py-2 rounded-2xl text-sm font-semibold disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar BOM"}
          </button>
        }
      >
        <div className="space-y-4 mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
            <SearchLookup
              label="Buscar produto com composição"
              table="t_itens"
              descriptionField="descricao"
              codeField="cditem"
              barcodeField="barcodeit"
              placeholder="Digite parte do código ou nome do produto"
              onSelect={(option: SearchOption) => {
                const normalized = normalizeCatalogItem(
                  (option.raw ?? {}) as AnyRecord,
                  option.id,
                );
                handleSelectProduct(normalized);
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
                    {option.code ? `Código: ${option.code}` : ""}
                    {option.barcode ? ` • Barras: ${option.barcode}` : ""}
                  </p>
                </div>
              )}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500">
              Buscar matéria-prima
            </label>
            <SearchLookup
              table="t_itens"
              descriptionField="descricao"
              codeField="cditem"
              barcodeField="barcodeit"
              placeholder="Digite parte do código ou descrição da MP"
              onSelect={(option: SearchOption) => {
                const normalized = normalizeCatalogItem(
                  (option.raw ?? {}) as AnyRecord,
                  option.id,
                );
                handleSelectMaterial(normalized);
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
                    {option.code ? `Código: ${option.code}` : ""}
                    {option.barcode ? ` • Barras: ${option.barcode}` : ""}
                  </p>
                </div>
              )}
            />
          </div>
        </div>

          {selectedProduct ? (
            <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Fórmula selecionada:{" "}
              <span className="font-semibold">
                {buildDisplayLabel(selectedProduct)}
              </span>
              {formulaLoading ? (
                <span className="ml-2 text-xs font-normal text-blue-500">
                  carregando composição...
                </span>
              ) : formulaError ? (
                <span className="ml-2 text-xs font-normal text-red-600">
                  {formulaError}
                </span>
              ) : formulaHasData ? (
                <span className="ml-2 text-xs font-normal text-blue-600">
                  composição carregada automaticamente.
                </span>
              ) : (
                <span className="ml-2 text-xs font-normal text-blue-600">
                  nenhuma composição encontrada ainda.
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Utilize as pesquisas acima para selecionar o produto que será
              formulado e, em seguida, incluir matérias-primas na tabela.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="md:col-span-1">
            <label className="text-xs font-semibold text-slate-500">
              Produto
            </label>
            <input
              value={bomData.productCode}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
              }}
              onChange={(event) =>
                setBomData({ ...bomData, productCode: event.target.value })
              }
              readOnly
              className="mt-1 w-full 
                         border 
                         border-slate-200 
                         rounded-xl 
                         px-3 py-2
                         bg-slate-50"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500">
              Descrição
            </label>
            <input
              value={selectedProduct ? selectedProduct.name : ""}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.preventDefault();
              }}
              readOnly
              className="mt-1 w-full 
                         border border-slate-200 
                         rounded-xl 
                         px-3 
                         py-2
                         bg-slate-50"
            />
          </div>
          <div className="col-span-full md:col-span-1">
            <label className="text-xs font-semibold text-slate-500">
              Versao
            </label>
            <input
              type="number"
              step="0.10"
              min={0}            
              value={bomData.version}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              onChange={(event) =>
                setBomData({ ...bomData, version: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
        </div>

        {/* TABELA (Tablet e Desktop) */}
        <div className="hidden md:block overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">MP</th>
                <th className="px-4 py-2">Descricao</th>
                <th className="px-4 py-2">Qtd</th>
                <th className="px-4 py-2">Fator</th>
                <th className="px-4 py-2 text-right">Remover</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr key={index} className="border-t border-slate-100">
                  <td className="px-2 py-2 w-48">
                    <input
                      value={item.componentCode}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      onChange={(e) => updateItem(index, "componentCode", e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </td>
                  <td className="px-4 py-2 w-172">
                    <input
                      value={item.description}
                      onChange={(e) => updateItem(index, "description", e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2"
                    />
                  </td>
                  <td className="px-2 py-2 w-48">
                    <input
                      type="number"
                      min={0}
                      step="0.0001"
                      value={normalizeDecimal(item.quantity)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      onBlur={(event) => {
                        if (event.currentTarget.value === "") {
                          updateItem(
                            index,
                            "quantity",
                            String(defaultItem.quantity),
                          );
                        }
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 align-right"
                    />
                  </td>
                  <td className="px-2 py-2 w-64">
                    <input
                      type="text"
                      inputMode="decimal"
                      pattern="[0-9.,]*"
                      value={
                        perctDrafts[index] ??
                        formatPct(
                          Number.isFinite(item.fator)
                            ? Number(item.fator)
                            : Number.isFinite((item as any).percentage)
                              ? Number((item as any).percentage) / 100
                              : 1,
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.preventDefault();
                      }}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9.,]/g, "");
                        const normalized = raw.replace(",", ".");
                        updateItem(index, "fator", normalized);
                        setperctDrafts((prev) => {
                          const next = [...prev];
                          next[index] = raw;
                          return next;
                        });
                      }}
                      onBlur={(event) => {
                        const rawValue = event.currentTarget?.value ?? "";
                          if (rawValue === "") {
                            updateItem(
                              index,
                              "fator",
                              String(defaultItem.fator  ?? 1),
                            );
                            setperctDrafts((prev) => {
                              const next = [...prev];
                              next[index] = formatPct(defaultItem.fator  ?? 1);
                              return next;
                            });
                            return;
                          }
                        const parsed = Number(rawValue.replace(",", "."));
                        setperctDrafts((prev) => {
                          const next = [...prev];
                          next[index] = formatPct(Number.isFinite(parsed) ? parsed : 0);
                          return next;
                        });
                      }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 align-right"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-xs text-red-600"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LAYOUT MOBILE */}
        <div className="md:hidden space-y-4">
          {items.map((item, index) => (
            <div
              key={index}
              className="border border-slate-200 rounded-2xl p-4 space-y-3"
            >
              <div>
                <label className="text-xs text-slate-500">Código</label>
                <input
                  value={item.componentCode}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) => updateItem(index, "componentCode", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Descrição</label>
                <input
                  value={item.description}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.preventDefault();
                  }}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">Qtd</label>
                  <input
                    ref={(el) => {
                      quantityInputsRef.current[index] = el;
                    }}
                    type="number"
                    min={0.0}
                    step="0.0001"
                    value={normalizeDecimal(item.quantity)}
                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        unitCostInputsRef.current[index]?.focus();
                        unitCostInputsRef.current[index]?.select();
                      }
                    }}
                    onBlur={(event) => {
                      if (event.target.value === "") {
                        updateItem(
                          index,
                          "quantity",
                          String(defaultItem.quantity),
                        );
                      }
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Fator</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9.,]*"
                    value={
                      perctDrafts[index] ??
                      formatPct(
                        Number.isFinite(item.fator)
                          ? Number(item.fator)
                          : Number.isFinite((item as any).percentage)
                            ? Number((item as any).percentage) / 100
                            : 1,
                      )
                    }
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.,]/g, "");
                      const normalized = raw.replace(",", ".");
                      updateItem(index, "fator", normalized);
                      setperctDrafts((prev) => {
                        const next = [...prev];
                        next[index] = raw;
                        return next;
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.preventDefault();
                    }}
                    onBlur={(event) => {
                      const rawValue = event.currentTarget?.value ?? "";
                      if (rawValue === "") {
                        updateItem(
                          index,
                          "fator",
                          String(defaultItem.fator  ?? 1),
                        );
                        setperctDrafts((prev) => {
                          const next = [...prev];
                          next[index] = formatPct(defaultItem.fator  ?? 1);
                          return next;
                        });
                        return;
                      }
                      const parsed = Number(rawValue.replace(",", "."));
                      setperctDrafts((prev) => {
                        const next = [...prev];
                        next[index] = formatPct(Number.isFinite(parsed) ? parsed : 0);
                        return next;
                      });
                    }}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                  />
                </div>
              </div>
              <div className="flex justify-end items-center mt-2">
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-xs text-red-600"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
        <div>
          <button
            type="button"
            onClick={addItem}
            className="mt-3 text-sm font-semibold text-blue-600"
          >
            + adicionar ingrediente
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Custo de Produção"
        description=""
      >
        <div className="grid grid-cols-3 md:grid-cols-3 gap-4 mb-6">
         <div className="border border-slate-200 rounded-2xl p-4
                         md:col-start-3
                         col-span-3 
                         md:col-span-1">

            <p className="text-xs text-slate-500">Custo total unitário</p>
            <p className="text-2xl font-semibold text-emerald-600 text-right">
              {formatCurrency(totals.unit)}
            </p>
          </div>
        </div>
          
          
      </SectionCard>

      <SectionCard
        title="BOM recentes"
        description="Historico de fichas tecnicas salvas"
      >
        {boms.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum registro ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2">Versao</th>
                  <th className="px-4 py-2">Lote</th>
                  <th className="px-4 py-2">Custo</th>
                  <th className="px-4 py-2">Unit</th>
                  <th className="px-4 py-2">Margem</th>
                </tr>
              </thead>
              <tbody>
                
                {boms.slice(0, 6).map((bom) => (
                <tr key={bom.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-900">
                    {bom.productCode}
                  </td>
                  <td className="px-4 py-2">{bom.version}</td>
                  <td className="px-4 py-2">{bom.lotSize}</td>
                  <td className="px-4 py-2">{formatCurrency(bom.totalCost)}</td>
                  <td className="px-4 py-2">{formatCurrency(bom.unitCost)}</td>
                  <td className="px-4 py-2">{bom.marginAchieved}%</td>

                  {/* Coluna AÇÕES */}
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handlePrintBom(bom.id)}
                      className="text-blue-600 hover:text-blue-800"
                      title="Imprimir PDF"
                    >
                      📄
                    </button>
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </form>
  );
}
