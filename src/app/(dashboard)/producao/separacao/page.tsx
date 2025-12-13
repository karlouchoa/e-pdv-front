'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import {
  IssueRawMaterialsPayload,
  issueRawMaterials,
  getProductionOrder,
  getProductionOrderByOp,
} from "@/modules/production/services/productionService";
import { listProducts } from "@/modules/catalog/services/catalogService";
import { ProductionOrder } from "@/modules/core/types";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";

type RawMaterialLine = {
  key: string;
  componentCode: string;
  description: string;
  unit: string;
  warehouse?: string | null;
  quantityPlanned: number;
  quantityUsed: string;
  unitCost?: number;
};

const toNumber = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateOrDash = (value?: string) =>
  value ? formatDate(value) : "--";

type AnyRecord = Record<string, unknown>;

type CatalogItem = {
  id: string;
  code: string;
  name: string;
  unit: string;
  barcode?: string;
  cost?: number;
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
  if (depth > 6) return null;
  if (Array.isArray(value)) return value as AnyRecord[];
  if (value && typeof value === "object") {
    const record = value as AnyRecord;
    for (const key of candidateKeys) {
      if (record[key] !== undefined) {
        const nested = findArrayDeep(record[key], depth + 1);
        if (nested) return nested;
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

const normalizeCatalogItem = (raw: AnyRecord, fallbackId: string): CatalogItem => {
  const record = toRecord(raw);
  const code = getStringValue(record, ["cditem", "sku", "code", "productCode", "externalCode"], fallbackId);
  const name = getStringValue(record, ["deitem", "name", "description"], "");
  const unit = getStringValue(record, ["unid", "unit"], "UN");
  const barcode = getStringValue(record, ["barcode", "barcodeit"], "");
  const cost = getNumberValue(record, ["custo", "costPrice", "custlq"], 0);
  return {
    id: getStringValue(record, ["id", "guid", "uuid"], fallbackId),
    code,
    name,
    unit,
    barcode: barcode || undefined,
    cost,
  };
};

export default function SeparationIssuePage() {
  const { session } = useSession();
  const [opInput, setOpInput] = useState("");
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [rawLines, setRawLines] = useState<RawMaterialLine[]>([]);
  const initialNewItem = {
    componentCode: "",
    description: "",
    unit: "UN",
    warehouse: "",
    quantityPlanned: "",
  };
  const [newItem, setNewItem] = useState(initialNewItem);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [productNamesByCode, setProductNamesByCode] = useState<Record<string, string>>({});
  const [products, setProducts] = useState<CatalogItem[]>([]);
  const [materialSearch, setMaterialSearch] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [materialHighlightIndex, setMaterialHighlightIndex] = useState(0);
  const materialSearchInputRef = useRef<HTMLInputElement | null>(null);

  const stripDiacritics = (value: string) =>
    value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const normalizeValue = (value: string) =>
    stripDiacritics(value).toLowerCase().trim();

  const headerInfo = useMemo(() => {
    if (!order) return null;
    const productName =
      order.productName || productNamesByCode[order.productCode] || "";
    const productLabel = productName
      ? `${order.productCode} - ${productName}`
      : order.productCode;
    return {
      op: order.OP || order.externalCode || order.id,
      createdAt: order.createdAt,
      author: order.author_user,
      productLabel,
      quantity: `${order.quantityPlanned} ${order.unit}`,
      dueDate: order.dueDate,
    };
  }, [order, productNamesByCode]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const loadCatalogItems = async () => {
      setCatalogLoading(true);
      setCatalogError(null);
      try {
        const response = await listProducts(session);
        if (cancelled) return;

        const rawItems: AnyRecord[] = Array.isArray(response)
          ? (response as unknown as AnyRecord[])
          : extractArray<AnyRecord>(response);
        const normalized = rawItems
          .map((item, index) => normalizeCatalogItem(item, `item-${index}`))
          .filter((entry) => entry.code);

        setProducts(normalized);
        const mapped = normalized.reduce<Record<string, string>>((acc, item) => {
          if (item.code && item.name) acc[item.code] = item.name;
          return acc;
        }, {});
        setProductNamesByCode(mapped);
        if (!normalized || normalized.length === 0) {
          setMessage("Nenhuma matéria-prima encontrada para pesquisa.");
        }
      } catch (error) {
        if (cancelled) return;
        setCatalogError(
          error instanceof Error ? error.message : "Falha ao carregar itens.",
        );
      } finally {
        if (cancelled) return;
        setCatalogLoading(false);
      }
    };

    loadCatalogItems();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const searchResults = useMemo(() => {
    const query = normalizeValue(materialSearch);
    if (!query) return [];
    return (products ?? []).filter((p) => {
      const code = normalizeValue(p.code || "");
      const name = normalizeValue(p.name || "");
      const barcode = normalizeValue(p.barcode || "");
      return (
        code.includes(query) ||
        name.includes(query) ||
        barcode.includes(query)
      );
    }).slice(0, 10);
  }, [products, materialSearch]);

  const handleSelectProduct = (item: CatalogItem) => {
    const code = item.code || "";
    const unit = item.unit || "UN";
    setNewItem((prev) => ({
      ...prev,
      componentCode: code,
      description: item.name || "",
      unit,
      warehouse: prev.warehouse,
    }));
    setMaterialSearch(item.name || code);
    setShowSearchResults(false);
    setMaterialHighlightIndex(0);
  };

  const handleMaterialInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchResults || searchResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMaterialHighlightIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMaterialHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = searchResults[materialHighlightIndex];
      if (item) handleSelectProduct(item);
    } else if (event.key === "Escape") {
      setShowSearchResults(false);
    }
  };

  const loadOrder = useCallback(async () => {
    if (!session) return;
    const needle = opInput.trim();
    if (!needle) {
      setMessage("Informe o número da OP.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      if (!/^\d+$/.test(needle)) {
        setMessage("OP inválida, informe apenas números.");
        return;
      }
      // Busca direta pelo endpoint de OP numérica
      const detailed = await getProductionOrderByOp(session, needle);
      
      // console.log("📦 OP retornada do backend:", detailed);

      // console.log("🔎 Status fields:", {
      //   status: (detailed as any).status,
      //   statusRaw: (detailed as any).statusRaw,
      //   status_event: (detailed as any).status_event,
      //   lastStatus: (detailed as any).lastStatus,
      // });

      const displayStatus =
        ((detailed as unknown) as Record<string, unknown>)?.statusRaw ??
        detailed.status ??
        "N/D";

      // Exibe sempre o status atual ao usuário
      setMessage(
        `OP ${detailed.OP || detailed.externalCode || needle} está em status ${displayStatus}.`,
      );

      if (displayStatus !== "SEPARACAO" && displayStatus !== "PENDENTE") {
        const msg = `OP ${detailed.OP || detailed.externalCode || needle} está em status ${displayStatus}. Somente OPs em SEPARAÇÃO ou PENDENTE podem ser baixadas.`;
        alert(msg);
        setMessage(msg);
        setOrder(null);
        setRawLines([]);
        return;
      }

      setOrder(detailed);
      const mapped = (detailed.rawMaterials ?? []).map((item, index) => ({
        key: item.id ?? `raw-${index}`,
        componentCode: item.componentCode,
        description: item.description ?? "",
        unit: item.unit ?? "UN",
        warehouse: item.warehouse ?? null,
        quantityPlanned: item.quantityUsed ?? item.quantity ?? 0,
        quantityUsed:
          item.quantityUsed !== undefined && item.quantityUsed !== null
            ? String(item.quantityUsed)
            : "",
        unitCost: item.unitCost,
      }));
      setRawLines(mapped);
    } catch (error) {
      console.error("Falha ao buscar OP:", error);
      setMessage(
        error instanceof Error ? error.message : "Falha ao buscar OP.",
      );
    } finally {
      setLoading(false);
    }
  }, [opInput, session]);

  const addNewLine = () => {
    if (!newItem.componentCode.trim()) return;
    const planned = toNumber(newItem.quantityPlanned);
    setRawLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        componentCode: newItem.componentCode.trim(),
        description: newItem.description.trim(),
        unit: newItem.unit.trim() || "UN",
        warehouse: newItem.warehouse.trim() || null,
        quantityPlanned: planned,
        quantityUsed: "",
      },
    ]);
    setNewItem({
      componentCode: "",
      description: "",
      unit: "UN",
      warehouse: "",
      quantityPlanned: "",
    });
  };

  const removeLine = (key: string) => {
    setRawLines((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !order) return;

    const prepared = rawLines
      .map((item) => ({
        componentCode: item.componentCode.trim(),
        quantityUsed: Math.max(0, toNumber(item.quantityUsed)),
        unit: item.unit.trim() || "UN",
        unitCost: item.unitCost ?? undefined,
        warehouse: item.warehouse || session.warehouse || null,
        batchNumber: undefined,
        consumedAt: null,
        description: item.description || null,
      }))
      .filter((item) => item.componentCode);

    const hasQuantity = prepared.some((item) => item.quantityUsed > 0);
    if (!prepared.length || !hasQuantity) {
      setMessage("Informe ao menos uma matéria-prima com quantidade separada.");
      return;
    }

    const payload: IssueRawMaterialsPayload = {
      warehouse: session.warehouse || null,
      user: session.user.id || session.user.email || session.user.name || null,
      responsible: session.user.name || null,
      notes: "Baixa da separação",
      rawMaterials: prepared,
    };

    const confirmed = window.confirm(
      `Confirmar baixa da separação da OP ${headerInfo?.op}?`,
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      setMessage(null);
      await issueRawMaterials(session, order.id, payload);
      setMessage("Baixa registrada com sucesso.");
      setOrder(null);
      setRawLines([]);
      setOpInput("");
      setNewItem(initialNewItem);
      setMaterialSearch("");
      setShowSearchResults(false);
      setMaterialHighlightIndex(0);
    } catch (error) {
      console.error("Falha ao registrar baixa:", error);
      setMessage(
        error instanceof Error ? error.message : "Falha ao registrar baixa.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {message ? (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800">
          {message}
        </div>
      ) : null}

      <SectionCard
        title="Baixa da separação"
        description="Informar quantidades separadas de matéria-prima para a OP."
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600">
              Número da OP
            </label>
            <input
              value={opInput}
              onChange={(e) => setOpInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Informe o número da OP"
            />
          </div>
          <button
            type="button"
            onClick={loadOrder}
            disabled={loading || !opInput.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Carregando..." : "Buscar OP"}
          </button>
        </div>
      </SectionCard>

      {order ? (
        <SectionCard
          title="Dados da OP"
          description="Cabeçalho e itens de matéria-prima"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">OP</p>
              <p className="text-sm font-semibold text-slate-900">
                {headerInfo?.op}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Abertura: {formatDateOrDash(headerInfo?.createdAt)}
              </p>
              <p className="text-xs text-slate-500">
                Usuário: {headerInfo?.author || "--"}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Produto</p>
              <p className="text-sm font-semibold text-slate-900">
                {headerInfo?.productLabel}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Quantidade planejada</p>
              <p className="text-sm font-semibold text-slate-900">
                {headerInfo?.quantity}
              </p>
              <p className="text-xs text-slate-500">
                Entrega: {formatDateOrDash(headerInfo?.dueDate)}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        {/* Desktop layout */}
                        <div className="hidden md:block relative overflow-visible border border-dashed border-slate-200 rounded-2xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <th className="px-4 py-2 w-[360px]">Produto</th>
                    <th className="px-4 py-2 w-28">UN</th>
                    <th className="px-4 py-2 w-32">EMP</th>
                    <th className="px-4 py-2 w-40">QTDE Sol.</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <div>
                        <input
                          ref={materialSearchInputRef}
                          value={materialSearch}
                          onKeyDown={handleMaterialInputKeyDown}
                          onFocus={() => materialSearch.trim() && setShowSearchResults(true)}
                          onChange={(event) => {
                            setMaterialSearch(event.target.value);
                            setShowSearchResults(true);
                          }}
                          placeholder="Digite parte do código ou descrição da MP"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2"
                        />
                        {materialSearch.trim() && showSearchResults ? (
                          <div className="relative mt-2">
                            {searchResults.length > 0 ? (
                              <div className="absolute z-50 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                                {searchResults.map((item) => (
                                  <button
                                    type="button"
                                    key={item.id}
                                    onClick={() => handleSelectProduct(item)}
                                    className={`w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 ${
                                      searchResults[materialHighlightIndex]?.id === item.id
                                        ? "bg-blue-50"
                                        : ""
                                    }`}
                                  >
                                    <p className="text-sm font-semibold text-slate-900">
                                      {item.name}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                      Código: {item.code}
                                      {item.barcode ? ` • Barras: ${item.barcode}` : ""} • Custo:{" "}
                                      {formatCurrency(item.cost ?? 0)}
                                    </p>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">
                                Nenhuma matéria-prima encontrada.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={newItem.unit}
                        onChange={(e) =>
                          setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                        }
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                        placeholder="UN"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={newItem.warehouse}
                        onChange={(e) =>
                          setNewItem((prev) => ({
                            ...prev,
                            warehouse: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-200 rounded-xl px-3 py-2"
                        placeholder="Depósito"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={newItem.quantityPlanned}
                        onChange={(e) =>
                          setNewItem((prev) => ({
                            ...prev,
                            quantityPlanned: e.target.value,
                          }))
                        }
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-right"
                        placeholder="0,00"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={addNewLine}
                        className="text-sm font-semibold text-blue-600"
                      >
                        Adicionar item
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2">UN</th>
                    <th className="px-3 py-2">EMP</th>
                    <th className="px-3 py-2 text-right">QTDE Sol.</th>
                    <th className="px-3 py-2 text-right">QTDE Sep.</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rawLines.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-4 text-center text-xs text-slate-500"
                      >
                        Nenhuma matéria-prima carregada para esta OP.
                      </td>
                    </tr>
                  ) : (
                    rawLines.map((item) => (
                      <tr key={item.key} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-900">
                          {item.componentCode}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {item.description || "--"}
                        </td>
                        <td className="px-3 py-2">{item.unit}</td>
                        <td className="px-3 py-2">
                          {item.warehouse || session?.warehouse || "--"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {item.quantityPlanned?.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={item.quantityUsed}
                            onChange={(e) => {
                              const value = e.target.value;
                              setRawLines((prev) =>
                                prev.map((line) =>
                                  line.key === item.key
                                    ? { ...line, quantityUsed: value }
                                    : line,
                                ),
                              );
                            }}
                            className="w-28 rounded-xl border border-slate-200 px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeLine(item.key)}
                            className="text-xs font-semibold text-red-600"
                          >
                            Remover
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>



            {/* Mobile layout */}
            <div className="md:hidden space-y-4 rounded-2xl border border-dashed border-slate-200 p-4">
              <div>
                <label className="text-xs font-semibold text-slate-500">
                  Buscar matéria-prima
                </label>
                <input
                  ref={materialSearchInputRef}
                  value={materialSearch}
                  onKeyDown={handleMaterialInputKeyDown}
                  onFocus={() => materialSearch.trim() && setShowSearchResults(true)}
                  onChange={(event) => {
                    setMaterialSearch(event.target.value);
                    setShowSearchResults(true);
                  }}
                  placeholder="Digite parte do código ou descrição da MP"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
                {materialSearch.trim() && showSearchResults ? (
                  <div className="relative mt-2">
                    {searchResults.length > 0 ? (
                      <div className="absolute z-20 max-h-60 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                        {searchResults.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => handleSelectProduct(item)}
                            className={`w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50 ${
                              searchResults[materialHighlightIndex]?.id === item.id
                                ? "bg-blue-50"
                                : ""
                            }`}
                          >
                            <p className="text-sm font-semibold text-slate-900">
                              {item.name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Código: {item.code} • Custo: {formatCurrency(item.cost ?? 0)}
                              {item.barcode ? ` • Barras: ${item.barcode}` : ""}
                            </p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="absolute z-10 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
                        Nenhuma matéria-prima encontrada.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500">UN</label>
                  <input
                    value={newItem.unit}
                    onChange={(e) =>
                      setNewItem((prev) => ({ ...prev, unit: e.target.value }))
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                    placeholder="UN"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">EMP</label>
                  <input
                    value={newItem.warehouse}
                    onChange={(e) =>
                      setNewItem((prev) => ({
                        ...prev,
                        warehouse: e.target.value,
                      }))
                    }
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                    placeholder="Depósito"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">QTDE Sol.</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={newItem.quantityPlanned}
                  onChange={(e) =>
                    setNewItem((prev) => ({
                      ...prev,
                      quantityPlanned: e.target.value,
                    }))
                  }
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 mt-1"
                  placeholder="0,00"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addNewLine}
                  className="text-sm font-semibold text-blue-600"
                >
                  Adicionar item
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || loading}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Processando..." : "Baixar separação"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  );
}
