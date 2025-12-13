'use client';

import { FormEvent, useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";
import {
  InventoryMovementPayload,
  InventoryMovementRecord,
  InventoryMovementSummary,
  InventoryMovementType,
  ProductPayload,
  Category
} from "@/modules/core/types";

import {
  createInventoryMovement,
  getItemKardex,
  getMovementSummary,
  listInventoryMovements,
} from "@/modules/stock/services/stockService";
import { api } from "@/modules/core/services/api";

type ItemRecord = ProductPayload & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  isComposed: boolean;
  isRawMaterial: boolean;
  notes?: string;
  imagePath?: string;
};

type ItemFormState = ProductPayload & {
  id: string | null;
  isComposed: boolean;
  isRawMaterial: boolean;
  notes: string;
  imagePath: string;
};

type AnyRecord = Record<string, unknown>;

const toRecord = (value: unknown): AnyRecord => (value ?? {}) as AnyRecord;

const emptyForm: ItemFormState = {
  id: null,
  sku: "",
  name: "",
  unit: "UN",
  category: "",
  salePrice: 0,
  costPrice: 0,
  leadTimeDays: 7,
  type: "acabado",
  description: "",
  ncm: "",
  cest: "",
  cst: "",
  barcode: "",
  isComposed: false,
  isRawMaterial: false,
  notes: "",
  imagePath: "",
  qtembitem: 0, // Added qtembitem with a default value
};

const documentTypesEntrada = [
  { label: "Compra", value: "C" },
  { label: "Cancelamento de venda", value: "D" },
  { label: "Ajuste de Inventário", value: "I" },
  { label: "Troca", value: "T" },
  { label: "Fabricação", value: "F" },
];

const documentTypesSaida = [
  { label: "Venda", value: "V" },
  { label: "Troca", value: "T" },
  { label: "Consumo", value: "C" },
  { label: "Devolução de Compra", value: "D" },
  { label: "Produção", value: "P" },
  { label: "Ajuste de Inventário", value: "I" },
];

type ClienteRecord = {
  id: string;
  code: string;   // CDCLI
  name: string;   // DECLI
};

type FornecedorRecord = {
  id: string;
  code: string;   // CDFOR
  name: string;   // DEFOR
};

type EmpresaRecord = {
  id: string;
  code: string;   // CDEMP
  name: string;   // APELIDO
};



const today = new Date().toISOString().slice(0, 10);
const startOfMonth = new Date(
  new Date().getFullYear(),
  new Date().getMonth(),
  1,
)
  .toISOString()
  .slice(0, 10);

const movementFormDefaults = {
  itemId: "",
  itemSku:"",
  type: "E" as InventoryMovementType,
  quantity: "1",
  unitPrice: "",
  documentNumber: "",
  documentDate: today,
  documentType: "NF",
  notes: "",
  warehouse: "",
  counterparty: "",
  date: today,
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

const movementFilterDefaults = {
  type: "E" as InventoryMovementType,
  from: startOfMonth,
  to: today,
  itemId: "",
};

const summaryFilterDefaults = {
  from: startOfMonth,
  to: today,
  itemId: "",
};

const kardexFilterDefaults = {
  itemId: "",
  from: startOfMonth,
  to: today,
};

const parseNumber = (value: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

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

const parsePositiveNumber = (value: string) => {
  const parsed = parseNumber(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return parsed;
};

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


const normalizeCliente = (raw: AnyRecord): ClienteRecord => {
  const record = toRecord(raw);
  return {
    id: getStringValue(record, ["id", "ID"], ""),
    code: getStringValue(record, ["cdcli", "CDCLI"], ""),
    name: getStringValue(record, ["decli", "DECLI"], ""),
  };
};

const normalizeFornecedor = (raw: AnyRecord): FornecedorRecord => {
  const record = toRecord(raw);
  return {
    id: getStringValue(record, ["id", "ID"], ""),
    code: getStringValue(record, ["cdfor", "CDFOR"], ""),
    name: getStringValue(record, ["defor", "DEFOR"], ""),
  };
};

const normalizeEmpresa = (raw: AnyRecord): EmpresaRecord => {
  const record = toRecord(raw);
  return {
    id: getStringValue(record, ["id", "ID"], ""),
    code: getStringValue(record, ["cdemp", "CDEMP"], ""),
    name: getStringValue(record, ["apelido", "APELIDO"], ""),
  };
};


export default function StockMovementsPage() {
  const { session } = useSession();
  const [movementForm, setMovementForm] = useState(movementFormDefaults);
  const [movementMessage, setMovementMessage] = useState<string | null>(null);


  const [movements, setMovements] = useState<InventoryMovementRecord[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);
  const [movementFilters, setMovementFilters] = useState(
    movementFilterDefaults,
  );
  const [appliedMovementFilters, setAppliedMovementFilters] = useState(
    movementFilterDefaults,
  );

  const [summaryFilters, setSummaryFilters] = useState(summaryFilterDefaults);
  const [appliedSummaryFilters, setAppliedSummaryFilters] = useState(
    summaryFilterDefaults,
  );
  const [summary, setSummary] = useState<InventoryMovementSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [kardexFilters, setKardexFilters] = useState(kardexFilterDefaults);
  const [appliedKardexFilters, setAppliedKardexFilters] =
    useState(kardexFilterDefaults);
  const [kardex, setKardex] = useState<InventoryMovementRecord[]>([]);
  const [kardexLoading, setKardexLoading] = useState(false);
  const [kardexError, setKardexError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const lastRemoteSearch = useRef("");
  const [clientes, setClientes] = useState<ClienteRecord[]>([]);
  const [fornecedores, setFornecedores] = useState<FornecedorRecord[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaRecord[]>([]);

  const [counterpartySearch, setCounterpartySearch] = useState("");
  const [counterpartyResults, setCounterpartyResults] = useState<any[]>([]);
  const [showCounterpartyResults, setShowCounterpartyResults] = useState(false);
  const [counterpartyHighlightIndex, setCounterpartyHighlightIndex] = useState(-1);

  const [warehouseSearch, setWarehouseSearch] = useState("");
  const [warehouseResults, setWarehouseResults] = useState<EmpresaRecord[]>([]);
  const [showWarehouseResults, setShowWarehouseResults] = useState(false);
  const [warehouseHighlightIndex, setWarehouseHighlightIndex] = useState(-1);

  const documentTypeOptions =
  movementForm.type === "E"
    ? documentTypesEntrada
    : documentTypesSaida;

  const normalizeItemFromApi = (
    raw: AnyRecord,
    fallbackId: string
  ): ItemRecord => {
    const record = toRecord(raw);
  
    const id =
      getStringValue(record, ["id", "ID"], "") ||
      getStringValue(record, ["guid", "Guid", "uuid"], "") ||
      fallbackId;
  
    const rawItProdsn = getStringValue(record, ["itprodsn", "ITPRODSN"], "")
      .replace(/\s+/g, "")
      .toUpperCase();
  
    const rawMatprima = getStringValue(record, ["matprima", "MATPRIMA"], "")
      .replace(/\s+/g, "")
      .toUpperCase();
  
    const isComposed = rawItProdsn === "S";
    const isRawMaterial = rawMatprima === "S";
  
    return {
      id,
      sku: getStringValue(record, ["sku", "code", "cditem", "CDITEM"], ""),
      name: getStringValue(record, ["name", "deitem", "defat"], ""),
      unit: getStringValue(record, ["unit", "unid", "undven"], "UN"),

      // removido: category
      category: "",

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
      qtembitem: getNumberValue(record, ["qtembitem", "QTEMBITEM"], 0), // Added qtembitem
    };
  };
  

  const loadData = useCallback(async () => {
      if (!session) return;
      setLoading(true);
      try {
        const [itemsResponse,fornecedoresResponse,
               clientesResponse,  empresasResponse,
              ] = await Promise.all([
          api.get("/T_ITENS", { params: { tabela: "T_ITENS" } }),
          api.get("/T_FOR"),
          api.get("/T_CLI"),
          api.get("/T_EMP"),
        ]);
        
        // console.log("Resposta itens:", itemsResponse.data);
  
        // ITENS
        const rawItems = extractArray<AnyRecord>(itemsResponse.data);
        const normalizedItems = rawItems.map((item, index) =>
          normalizeItemFromApi(item, `item-${index}`),
        );

        setItems(normalizedItems);

        // CLIENTES
        const rawClientes = extractArray<AnyRecord>(clientesResponse.data);
        setClientes(rawClientes.map(normalizeCliente));

        // FORNECEDORES
        const rawFornecedores = extractArray<AnyRecord>(fornecedoresResponse.data);
        setFornecedores(rawFornecedores.map(normalizeFornecedor));

        // EMPRESAS
        const rawEmpresas = extractArray<EmpresaRecord>(empresasResponse.data);
        const normalizedEmpresas = rawEmpresas.map((item, index) =>
          normalizeEmpresa(item),
        );
        //setEmpresas(rawEmpresas.map(normalizeEmpresa));
        setEmpresas(normalizedEmpresas);
        
        // console.log("Empresas carregadas:", empresasResponse.data);
        // console.log("Empresas carregadas:", rawEmpresas);

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

       

    const searchResults = useMemo(() => {
      if (!searchTerm.trim()) return [];
      return items
        .filter((item) => matchItemQuery(item, searchTerm))
        .slice(0, 10);
    }, [items, searchTerm]);

    useEffect(() => {
      const term = searchTerm.trim();
      if (!session) return;
      if (!term) {
        lastRemoteSearch.current = "";
        return;
      }
      if (searchResults.length > 0) return;
      if (lastRemoteSearch.current === term) return;

      const fetchByDescription = async () => {
        lastRemoteSearch.current = term;
        try {
          const response = await api.get("/T_ITENS", {
            params: { tabela: "T_ITENS", descricao: term },
          });
          const rawItems = extractArray<AnyRecord>(response.data);
          const normalizedItems = rawItems.map((item, index) =>
            normalizeItemFromApi(item, `item-search-${index}`),
          );
          setItems((prev) => {
            const merged = new Map(prev.map((item) => [item.id, item]));
            normalizedItems.forEach((item) => {
              merged.set(item.id, item);
            });
            return Array.from(merged.values());
          });
        } catch (error) {
          console.error("Falha ao buscar itens por descricao", error);
        }
      };

      fetchByDescription();
    }, [searchResults, searchTerm, session]);

    const handleSelectItem = (item: ItemRecord) => {
      setMovementForm((prev) => ({
        ...prev,
        itemId: item.id,
        itemSku: item.sku,                        // Preenche CDITEM
        unitPrice: item.costPrice.toString(),     // Preenche preço unitário
      }));
    
      setSearchTerm(item.name);
      setShowSearchResults(false);
    };
    
  
    const handleSelectCounterparty = (item: any) => {
      setMovementForm((prev) => ({
        ...prev,
        counterparty: item.code, // grava CDCLI ou CDFOR
      }));
    
      setCounterpartySearch(`${item.code} - ${item.name}`);
      setShowCounterpartyResults(false);
      setCounterpartyHighlightIndex(-1);
    };

    const handleSelectWarehouse = (item: EmpresaRecord) => {~
      // console.log("WAREHOUSE SELECIONADO:", item);
      setMovementForm((prev) => ({
        ...prev,
        warehouse: item.id, 
      }));
      // console.log("Empresa do Payload:", movementForm.warehouse);  
      setWarehouseSearch(`${item.code} - ${item.name}`);
      setShowWarehouseResults(false);
      setWarehouseHighlightIndex(-1);
    };
    
      
    
    const handleMovementSubmit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!session) return;

      const fieldLabels: Record<string, string> = {
        itemId: "Item",
        itemSku: "SKU do item",
        type: "Tipo",
        quantity: "Quantidade",
        unitPrice: "Preço unitário",
        documentNumber: "Número do documento",
        documentDate: "Data do documento",
        documentType: "Tipo do documento",
        warehouse: "Almoxarifado/Empresa",
        counterparty: "Cliente/Fornecedor",
        date: "Data da movimentação",
      };

      const undefinedField = Object.entries(movementForm).find(
        ([key, value]) => key !== "notes" && value === undefined,
      );

      if (undefinedField) {
        const [key] = undefinedField;
        const label = fieldLabels[key] ?? key;
        const message = `Preencha o campo: ${label}.`;
        setMovementMessage(message);
        if (typeof window !== "undefined") {
          window.alert(message);
        }
        return;
      }

      const itemId = movementForm.itemId?.trim();
      const quantity = parsePositiveNumber(movementForm.quantity);
      if (!itemId || !quantity || quantity <= 0) {
        setMovementMessage("Informe item e quantidade válidos.");
        return;
      }
      const customerOrSupplier = parseNumber(movementForm.counterparty) ?? null;
      const loggedUser = session.user?.name || "usuario";
      const payload: InventoryMovementPayload = {
        itemId,
        type: movementForm.type,
        quantity,
        unitPrice: parsePositiveNumber(movementForm.unitPrice ?? ""),
        document:
          movementForm.documentNumber ||
          movementForm.documentDate ||
          movementForm.documentType
            ? {
                number: parseNumber(movementForm.documentNumber),
                date: movementForm.documentDate || undefined,
                type: movementForm.documentType || undefined,
              }
            : undefined,
        notes: movementForm.notes || undefined,
        warehouse: movementForm.warehouse,
        customerOrSupplier,
        date: movementForm.date || undefined,
        user: loggedUser,
      };

      // --- LOGS ADICIONADOS AQUI ---
      // console.log("ID da Empresa/Cliente/Fornecedor (customerOrSupplier):", payload.customerOrSupplier);
      // console.log("Payload COMPLETO antes de enviar:", payload);
      // -----------------------------
      
      setMovementMessage(null);
      try {
        const created = await createInventoryMovement(session, payload);
        setMovementMessage("Movimento registrado com sucesso.");
        setMovementForm(movementFormDefaults);
        setSearchTerm("");
        setShowSearchResults(false);
        setCounterpartySearch("");
        setCounterpartyResults([]);
        setShowCounterpartyResults(false);
        setCounterpartyHighlightIndex(-1);
        setWarehouseSearch("");
        setWarehouseResults([]);
        setShowWarehouseResults(false);
        setWarehouseHighlightIndex(-1);
        setMovements((prev) => [created, ...prev]);
      } catch (error) {
        setMovementMessage(
          error instanceof Error ? error.message : "Falha ao registrar movimento.",
        );
      }
    };

    useEffect(() => {
      if (!warehouseSearch.trim()) {
        setWarehouseResults([]);
        return;
      }
    
      const term = warehouseSearch.toLowerCase();
    
      const filtered = empresas.filter((emp) =>
        emp.name.toLowerCase().includes(term) ||
        emp.code.toLowerCase().includes(term)
      );
    
      setWarehouseResults(filtered);
    }, [warehouseSearch, empresas]);
    

    useEffect(() => {
      if (!session) return;
      const fetchMovements = async () => {
        setMovementsLoading(true);
        setMovementsError(null);
        try {
          const parsedFilters = {
            type: appliedMovementFilters.type,
            from: appliedMovementFilters.from || undefined,
            to: appliedMovementFilters.to || undefined,
            itemId: parseNumber(appliedMovementFilters.itemId),
          };
          const response = await listInventoryMovements(session, parsedFilters);
          setMovements(response);
        } catch (error) {
          setMovementsError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar movimentos.",
          );
        } finally {
          setMovementsLoading(false);
        }
      };
      fetchMovements();
    }, [session, appliedMovementFilters]);

    useEffect(() => {
      if (!session) return;
      const fetchSummary = async () => {
        setSummaryLoading(true);
        setSummaryError(null);
        try {
          const response = await getMovementSummary(session, {
            from: appliedSummaryFilters.from,
            to: appliedSummaryFilters.to,
            itemId: parseNumber(appliedSummaryFilters.itemId),
          });
          setSummary(response);
        } catch (error) {
          setSummary(null);
          setSummaryError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar resumo.",
          );
        } finally {
          setSummaryLoading(false);
        }
      };
      fetchSummary();
    }, [session, appliedSummaryFilters]);

    useEffect(() => {
      if (!session) return;
      const itemId = parseNumber(appliedKardexFilters.itemId);
      if (!itemId) {
        setKardex([]);
        return;
      }
      const fetchKardex = async () => {
        setKardexLoading(true);
        setKardexError(null);
        try {
          const response = await getItemKardex(session, itemId, {
            from: appliedKardexFilters.from || undefined,
            to: appliedKardexFilters.to || undefined,
          });
          setKardex(response);
        } catch (error) {
          setKardex([]);
          setKardexError(
            error instanceof Error
              ? error.message
              : "Falha ao carregar kardex.",
          );
        } finally {
          setKardexLoading(false);
        }
      };
      fetchKardex();
    }, [session, appliedKardexFilters]);

    useEffect(() => {
      if (!counterpartySearch.trim()) {
        setCounterpartyResults([]);
        return;
      }
  
    const source =
      movementForm.type === "E" ? fornecedores : clientes;
  
    const term = counterpartySearch.toLowerCase();
  
    const filtered = source.filter((x) =>
      x.name.toLowerCase().includes(term) ||
      x.code.toLowerCase().includes(term)
    );
  
    setCounterpartyResults(filtered);
  }, [counterpartySearch, movementForm.type, clientes, fornecedores]);

  const totalEntries = useMemo(() => {
    const entries = movements.filter((movement) => movement.type === "E");
    const exits = movements.filter((movement) => movement.type === "S");
    const sum = (values: InventoryMovementRecord[]) =>
      values.reduce((acc, movement) => acc + movement.quantity, 0);
    return {
      entries: sum(entries),
      exits: sum(exits),
    };
  }, [movements]);

  return (
    <div className="space-y-6">
      {movementMessage ? (
        <div className="bg-blue-50 border border-blue-100 text-blue-700 px-4 py-3 rounded-2xl">
          {movementMessage}
        </div>
      ) : null}

      <SectionCard
        title="Registrar movimento"
        description="Lançamento direto na tabela de movimentações de estoque"
      >
        <div>
            <label className="text-xs font-semibold text-slate-500">
              Localizar item existente
            </label>

            <input
              value={searchTerm}
              onFocus={() => searchTerm.trim() && setShowSearchResults(true)}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setShowSearchResults(true);
                setHighlightIndex(-1);
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
                    setHighlightIndex(-1);
                  }
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
                        onClick={() => {
                          handleSelectItem(item);
                          setHighlightIndex(-1);
                        }}
                        className={`w-full px-4 py-3 text-left 
                          ${index === highlightIndex ? "bg-blue-100" : "bg-white"}
                          hover:bg-blue-50 focus:bg-blue-50`}
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
  

        <form
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          onSubmit={handleMovementSubmit}
        >
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Item
            </label>
            <input
              value={movementForm.itemSku}
              onChange={(event) =>
                setMovementForm({ ...movementForm, itemSku: event.target.value })
              }
              required
              readOnly
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Tipo
            </label>
            <select
              value={movementForm.type}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  type: event.target.value as InventoryMovementType,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            >
              <option value="E">Entrada</option>
              <option value="S">Saída</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Quantidade
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={movementForm.quantity}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  quantity: event.target.value,
                })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Preço unitário
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={movementForm.unitPrice}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  unitPrice: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Data do movimento
            </label>
            <input
              type="date"
              value={movementForm.date}
              onChange={(event) =>
                setMovementForm({ ...movementForm, date: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Número documento
            </label>
            <input
              value={movementForm.documentNumber}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  documentNumber: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Data documento
            </label>
            <input
              type="date"
              value={movementForm.documentDate}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  documentDate: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Tipo documento
            </label>
            <select
              value={movementForm.documentType}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  documentType: event.target.value, // salva o código C/D/I/T/F/P/V
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            >
              <option value="">Selecione...</option>

              {documentTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Empresa / Almoxarifado
            </label>

            <input
              value={warehouseSearch}
              onFocus={() =>
                warehouseSearch.trim() && setShowWarehouseResults(true)
              }
              onChange={(event) => {
                setWarehouseSearch(event.target.value);
                setShowWarehouseResults(true);
                setWarehouseHighlightIndex(-1);
              }}
              onKeyDown={(event) => {
                if (!showWarehouseResults || warehouseResults.length === 0) return;

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setWarehouseHighlightIndex((prev) =>
                    prev < warehouseResults.length - 1 ? prev + 1 : prev
                  );
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setWarehouseHighlightIndex((prev) =>
                    prev > 0 ? prev - 1 : prev
                  );
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  if (warehouseHighlightIndex >= 0) {
                    handleSelectWarehouse(
                      warehouseResults[warehouseHighlightIndex]
                    );
                  }
                }
              }}
              placeholder="Localizar empresa..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2"
            />


            {warehouseSearch.trim() && showWarehouseResults ? (
              <div className="relative mt-2">
                {warehouseResults.length > 0 ? (
                  <div className="absolute z-10 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {warehouseResults.map((item, index) => (
                      <button
                        type="button"
                        key={`emp-${item.id}-${index}`}
                        onClick={() => handleSelectWarehouse(item)}
                        className={`w-full px-4 py-3 text-left 
                          ${
                            index === warehouseHighlightIndex
                              ? "bg-blue-100"
                              : "bg-white"
                          }
                          hover:bg-blue-50 focus:bg-blue-50`}
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {item.code} — {item.name}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Nenhuma empresa encontrada.</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="col-span-1 md:col-span-3 relative">
            <label className="text-xs font-semibold text-slate-500">
              {movementForm.type === "E" ? "Fornecedor" : "Cliente"}
            </label>

            <input
              value={counterpartySearch}
              onFocus={() =>
                counterpartySearch.trim() && setShowCounterpartyResults(true)
              }
              onChange={(event) => {
                setCounterpartySearch(event.target.value);
                setShowCounterpartyResults(true);
                setCounterpartyHighlightIndex(-1);
              }}
              onKeyDown={(event) => {
                if (!showCounterpartyResults || counterpartyResults.length === 0)
                  return;

                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setCounterpartyHighlightIndex((prev) =>
                    prev < counterpartyResults.length - 1 ? prev + 1 : prev
                  );
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setCounterpartyHighlightIndex((prev) =>
                    prev > 0 ? prev - 1 : prev
                  );
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  if (counterpartyHighlightIndex >= 0) {
                    handleSelectCounterparty(
                      counterpartyResults[counterpartyHighlightIndex]
                    );
                  }
                }
              }}
              placeholder={
                movementForm.type === "E"
                  ? "Localizar fornecedor..."
                  : "Localizar cliente..."
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2"
            />

            {counterpartySearch.trim() && showCounterpartyResults ? (
              <div className="relative mt-2">
                {counterpartyResults.length > 0 ? (
                  <div className="absolute z-10 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {counterpartyResults.map((item, index) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => handleSelectCounterparty(item)}
                        className={`w-full px-4 py-3 text-left
                          ${
                            index === counterpartyHighlightIndex
                              ? "bg-blue-100"
                              : "bg-white"
                          }
                          hover:bg-blue-50 focus:bg-blue-50`}
                      >
                        <p className="text-sm font-semibold text-slate-900">
                          {item.code} — {item.name}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Nenhum registro encontrado.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-500">
              Observações
            </label>
            <textarea
              value={movementForm.notes}
              onChange={(event) =>
                setMovementForm({ ...movementForm, notes: event.target.value })
              }
              className="mt-1 w-full border border-slate-200 rounded-2xl px-3 py-2"
            />
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-2xl font-semibold"
            >
              Registrar movimento
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Movimentações recentes"
        description="Filtre entradas ou saídas em um período"
      >
        <div className="space-y-4">
          <form
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedMovementFilters(movementFilters);
            }}
          >
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Tipo
              </label>
              <select
                value={movementFilters.type}
                onChange={(event) =>
                  setMovementFilters({
                    ...movementFilters,
                    type: event.target.value as InventoryMovementType,
                  })
                }
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              >
                <option value="E">Entradas</option>
                <option value="S">Saídas</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                De
              </label>
              <input
                type="date"
                value={movementFilters.from}
                onChange={(event) =>
                  setMovementFilters({
                    ...movementFilters,
                    from: event.target.value,
                  })
                }
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Até
              </label>
              <input
                type="date"
                value={movementFilters.to}
                onChange={(event) =>
                  setMovementFilters({
                    ...movementFilters,
                    to: event.target.value,
                  })
                }
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Item (opcional)
              </label>
              <input
                value={movementFilters.itemId}
                onChange={(event) =>
                  setMovementFilters({
                    ...movementFilters,
                    itemId: event.target.value,
                  })
                }
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <button
                type="submit"
                className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold"
              >
                Aplicar filtros
              </button>
            </div>
          </form>

          {movementsError ? (
            <p className="text-sm text-red-600">{movementsError}</p>
          ) : null}

          <div className="flex flex-wrap gap-4 text-sm">
            <span className="rounded-2xl border border-slate-200 px-3 py-1 text-slate-600">
              Entradas: {totalEntries.entries.toFixed(2)}
            </span>
            <span className="rounded-2xl border border-slate-200 px-3 py-1 text-slate-600">
              Saídas: {totalEntries.exits.toFixed(2)}
            </span>
          </div>

          {movementsLoading ? (
            <p className="text-sm text-slate-500">Carregando...</p>
          ) : movements.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nenhum movimento encontrado para o filtro.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Lançamento</th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Quantidade</th>
                    <th className="px-4 py-2">Valor</th>
                    <th className="px-4 py-2">Documento</th>
                    <th className="px-4 py-2">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr
                      key={movement.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-4 py-2 font-semibold text-slate-900">
                        #{movement.id}
                      </td>
                      <td className="px-4 py-2">{movement.itemId}</td>
                      <td className="px-4 py-2">
                        {movement.type === "E" ? "Entrada" : "Saída"}
                      </td>
                      <td className="px-4 py-2">
                        {movement.quantity.toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        {movement.totalValue
                          ? formatCurrency(movement.totalValue)
                          : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {movement.document?.number
                          ? `#${movement.document.number}`
                          : "-"}
                      </td>
                      <td className="px-4 py-2">
                        {movement.date ? formatDate(movement.date) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Resumo por período"
        description="Entradas, saídas e saldo consolidado"
      >
        <form
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSummaryFilters(summaryFilters);
          }}
        >
          <div>
            <label className="text-xs font-semibold text-slate-500">De</label>
            <input
              type="date"
              value={summaryFilters.from}
              onChange={(event) =>
                setSummaryFilters({
                  ...summaryFilters,
                  from: event.target.value,
                })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Até</label>
            <input
              type="date"
              value={summaryFilters.to}
              onChange={(event) =>
                setSummaryFilters({
                  ...summaryFilters,
                  to: event.target.value,
                })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Item (opcional)
            </label>
            <input
              value={summaryFilters.itemId}
              onChange={(event) =>
                setSummaryFilters({
                  ...summaryFilters,
                  itemId: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-2 rounded-xl text-sm font-semibold"
            >
              Atualizar
            </button>
          </div>
        </form>

        {summaryLoading ? (
          <p className="text-sm text-slate-500 mt-4">Calculando resumo...</p>
        ) : summaryError ? (
          <p className="text-sm text-red-600 mt-4">{summaryError}</p>
        ) : summary ? (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Entradas (Qtd)</p>
              <p className="text-xl font-semibold text-slate-900">
                {summary.entries.quantity.toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Entradas (R$)</p>
              <p className="text-xl font-semibold text-slate-900">
                {formatCurrency(summary.entries.value)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Saídas (Qtd)</p>
              <p className="text-xl font-semibold text-slate-900">
                {summary.exits.quantity.toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Saídas (R$)</p>
              <p className="text-xl font-semibold text-slate-900">
                {formatCurrency(summary.exits.value)}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Saldo atual</p>
              <p className="text-xl font-semibold text-slate-900">
                {summary.currentBalance.toFixed(2)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Líquido: {summary.netQuantity.toFixed(2)}
              </p>
            </div>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Kardex do item"
        description="Linha do tempo completa de movimentação"
      >
        <form
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedKardexFilters(kardexFilters);
          }}
        >
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Item (ID)
            </label>
            <input
              value={kardexFilters.itemId}
              onChange={(event) =>
                setKardexFilters({
                  ...kardexFilters,
                  itemId: event.target.value,
                })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">De</label>
            <input
              type="date"
              value={kardexFilters.from}
              onChange={(event) =>
                setKardexFilters({
                  ...kardexFilters,
                  from: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Até</label>
            <input
              type="date"
              value={kardexFilters.to}
              onChange={(event) =>
                setKardexFilters({
                  ...kardexFilters,
                  to: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-2 rounded-xl text-sm font-semibold"
            >
              Carregar kardex
            </button>
          </div>
        </form>

        {kardexError ? (
          <p className="text-sm text-red-600 mt-4">{kardexError}</p>
        ) : null}

        {kardexLoading ? (
          <p className="text-sm text-slate-500 mt-4">Carregando kardex...</p>
        ) : kardex.length === 0 ? (
          <p className="text-sm text-slate-500 mt-4">
            Nenhuma movimentação para o item selecionado.
          </p>
        ) : (
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Tipo</th>
                  <th className="px-4 py-2">Documento</th>
                  <th className="px-4 py-2">Quantidade</th>
                  <th className="px-4 py-2">Saldo anterior</th>
                  <th className="px-4 py-2">Saldo atual</th>
                  <th className="px-4 py-2">Observações</th>
                </tr>
              </thead>
              <tbody>
                {kardex.map((entry) => (
                  <tr
                    key={`${entry.id}-${entry.date}`}
                    className="border-t border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-4 py-2">
                      {entry.date ? formatDate(entry.date) : "-"}
                    </td>
                    <td className="px-4 py-2">
                      {entry.type === "E" ? "Entrada" : "Saída"}
                    </td>
                    <td className="px-4 py-2">
                      {entry.document?.number
                        ? `#${entry.document.number}`
                        : "-"}
                    </td>
                    <td className="px-4 py-2">
                      {entry.quantity.toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      {entry.previousBalance !== undefined
                        ? entry.previousBalance.toFixed(2)
                        : "-"}
                    </td>
                    <td className="px-4 py-2">
                      {entry.currentBalance !== undefined
                        ? entry.currentBalance.toFixed(2)
                        : "-"}
                    </td>
                    <td className="px-4 py-2">{entry.notes ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
