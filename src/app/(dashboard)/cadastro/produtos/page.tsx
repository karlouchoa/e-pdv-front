'use client';

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import type { ItemSavePayload } from "@/modules/catalog/services/catalogService";
import { Category, ProductPayload } from "@/modules/core/types";
import { formatDate } from "@/modules/core/utils/formatters";
import { api } from "@/modules/core/services/api";

type AnyRecord = Record<string, unknown>;

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


function mapFormToPayload(form: any) {
  return {
    id: form.id ?? null,
    name: form.name,
    description: form.description,
    unit: form.unit,
    category: form.category,
    salePrice: Number(form.salePrice ?? 0),
    costPrice: Number(form.costPrice ?? 0),
    leadTimeDays: Number(form.leadTimeDays ?? 0),
    ncm: form.ncm,
    cest: form.cest,
    cst: form.cst,
    barcode: form.barcode,
    isComposed: Boolean(form.isComposed),
    isRawMaterial: Boolean(form.isRawMaterial),
    notes: form.notes,
    imagePath: form.imagePath,
    itprodsn: form.itprodsn ? "S" : "N",
    matprima: form.isRawMaterial ? "S" : "N",
  };
}


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

const stripDiacritics = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeQuery = (value: string) =>
  stripDiacritics(value).toLowerCase();


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

const mapCategoryMetadata = (category: Category, fallbackCode: string) => {
  const record = toRecord(category);
  const code = getStringValue(
    record,
    ["code", "cdgru", "id", "ID"],
    fallbackCode,
  );
  const description = getStringValue(
    record,
    ["description", "degru", "nome", "label"],
    code,
  );
  return {
    ...record,
    code,
    description,
  };
};

const normalizeItemFromApi = (
  raw: AnyRecord,
  categories: Category[],
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

  const categoryMatch = categories.find(
    (cat) => getStringValue(toRecord(cat), ["code"], "") === categoryValue,
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
    sku: getStringValue(record, ["sku", "code", "cditem", "CDITEM"], ""),
    name: getStringValue(record, ["name", "deitem", "defat"], ""),
    unit: getStringValue(record, ["unit", "unid", "undven"], "UN"),
    category: categoryMatch?.code ?? categoryValue ?? "",
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
  };
};

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

const buildSavePayload = (form: ItemFormState): ItemSavePayload => ({
  ...form,
  id: form.id,
  notes: form.notes,
  imagePath: form.imagePath,
  itprodsn: form.isComposed ? "S" : "N",
  matprima: form.isRawMaterial ? "S" : "N",
});

export default function ProductsPage() {
  const { session } = useSession();
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<ItemFormState>(emptyForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState("");

  const loadData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [itemsResponse, categoriesResponse] = await Promise.all([
        api.get("/T_ITENS", { params: { tabela: "T_ITENS" } }),
        api.get("/T_GRITENS"),
      ]);
      
      console.log("Resposta itens:", itemsResponse.data);

      const rawCategories = extractArray<Category>(categoriesResponse.data);
      const normalizedCategories = rawCategories.map((category, index) =>
        mapCategoryMetadata(category, `cat-${index}`),
      );

      const rawItems = extractArray<AnyRecord>(itemsResponse.data);
      const normalizedItems = rawItems.map((item, index) =>
        normalizeItemFromApi(item, normalizedCategories, `item-${index}`),
      );

      setCategories(normalizedCategories);
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

  useEffect(() => {
    setImageError(false);
  }, [imagePreviewUrl]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    return items
      .filter((item) => matchItemQuery(item, searchTerm))
      .slice(0, 10);
  }, [items, searchTerm]);

  const lastItems = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const dateA = new Date(a.createdAt ?? "").valueOf();
        const dateB = new Date(b.createdAt ?? "").valueOf();
        return dateB - dateA;
      })
      .slice(0, 6);
  }, [items]);

  const handleSelectItem = (item: ItemRecord) => {
    // setForm({
    //   ...item,
    //   id: item.id,
    //   isComposed: item.isComposed,
    //   isRawMaterial: item.isRawMaterial,
    // });
    setForm({
      ...item,
      notes: item.notes ?? "",
      imagePath: item.imagePath ?? "",
      id: item.id,
      isComposed: item.isComposed,
      isRawMaterial: item.isRawMaterial,
    });
    setSearchTerm(item.name);
    setShowSearchResults(false);
    setImagePreviewUrl(item.imagePath?.trim() ?? "");
    setImageError(false);
  };

  const handleInputChange = (
    field: keyof ItemFormState,
    value: string | number,
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCheckboxChange = (field: keyof ItemFormState) => {
    setForm((prev) => ({
      ...prev,
      [field]: !(prev[field] as boolean),
    }));
  };

  const handleImageBlur = () => {
    const trimmed = form.imagePath.trim();
    if (!trimmed) {
      setImagePreviewUrl("");
      setImageError(false);
      return;
    }
    const isValidUrl = /^https?:\/\//i.test(trimmed);
    if (!isValidUrl) {
      setImagePreviewUrl("");
      setImageError(true);
      return;
    }
    setImageError(false);
    setImagePreviewUrl(trimmed);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setSaving(true);
    setFeedback(null);
    try {

      
      const payload = buildSavePayload(form);
      if (form.id) {
        console.log("Atualizando item ID", form.id, "com payload:", payload);
        await api.patch(`/T_ITENS/${form.id}`, payload);
      } else {
        
        const payload = mapFormToPayload(form);
        console.log("Criando novo item com payload:", payload);
        await api.post("/T_ITENS", payload);
      }
      await loadData();
      setFeedback(
        form.id ? "Item atualizado com sucesso." : "Item cadastrado com sucesso.",
      );
      if (!form.id) {
        setForm(emptyForm);
        setSearchTerm("");
        setShowSearchResults(false);
        setImagePreviewUrl("");
        setImageError(false);
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Falha ao salvar o item.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleNew = () => {
    setForm(emptyForm);
    setSearchTerm("");
    setShowSearchResults(false);
    setFeedback(null);
    setImagePreviewUrl("");
    setImageError(false);
  };

  return (
    <div className="space-y-6">
      {feedback ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {feedback}
        </div>
      ) : null}

      <SectionCard
        title="Cadastro de produtos e matérias-primas"
        description="Utilize os filtros abaixo para localizar um item existente ou crie um novo cadastro rapidamente."
      >
        <div className="space-y-4">
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
              }}
              placeholder="Digite parte do nome, código ou código de barras"
              className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2"
            />
            {searchTerm.trim() && showSearchResults ? (
              <div className="relative mt-2">
                {searchResults.length > 0 ? (
                  <div className="absolute z-10 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                    {searchResults.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => handleSelectItem(item)}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50 focus:bg-blue-50"
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
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            <div>
              <label className="text-xs font-semibold text-slate-500">SKU</label>
              <input
                value={form.sku}
                onChange={(event) => handleInputChange("sku", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                readOnly
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Categoria
              </label>
              <select
                value={form.category}
                onChange={(event) =>
                  handleInputChange("category", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <option value="">Selecione uma categoria</option>
                {categories.map((category) => (
                  <option key={category.id ?? category.code} value={category.code}>
                    {category.description ?? category.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-500">
                Descrição
              </label>
              <input
                value={form.name}
                onChange={(event) => handleInputChange("name", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Unidade
              </label>
              <input
                value={form.unit}
                onChange={(event) => handleInputChange("unit", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Lead time (dias)
              </label>
              <input
                type="number"
                value={form.leadTimeDays}
                onChange={(event) =>
                  handleInputChange("leadTimeDays", Number(event.target.value))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Preço de venda
              </label>
              <input
                type="number"
                step="0.01"
                value={form.salePrice}
                onChange={(event) =>
                  handleInputChange("salePrice", Number(event.target.value))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Custo
              </label>
              <input
                type="number"
                step="0.01"
                value={form.costPrice}
                onChange={(event) =>
                  handleInputChange("costPrice", Number(event.target.value))
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">NCM</label>
              <input
                value={form.ncm}
                onChange={(event) => handleInputChange("ncm", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">CEST</label>
              <input
                value={form.cest}
                onChange={(event) => handleInputChange("cest", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">CST</label>
              <input
                value={form.cst}
                onChange={(event) => handleInputChange("cst", event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500">
                Código de barras
              </label>
              <input
                value={form.barcode}
                onChange={(event) =>
                  handleInputChange("barcode", event.target.value)
                }
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </div>
            <div className="md:col-span-2 grid gap-4 lg:grid-cols-[2fr_1fr]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500">
                    Caminho da imagem (locfotitem)
                  </label>
                  <input
                    value={form.imagePath}
                    onChange={(event) =>
                      handleInputChange("imagePath", event.target.value)
                    }
                    onBlur={handleImageBlur}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="Ex.: https://cdn.seuservidor.com/imagens/produto.jpg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-500">
                    Observações (obsitem)
                  </label>
                  <textarea
                    value={form.notes}
                    onChange={(event) =>
                      handleInputChange("notes", event.target.value)
                    }
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2"
                    rows={4}
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold text-slate-500">
                  Pré-visualização
                </p>
                {imagePreviewUrl && !imageError ? (
                  <div className="mt-2 h-40 w-full overflow-hidden rounded-xl border border-slate-100 bg-white">
                    <Image
                      src={imagePreviewUrl}
                      alt={`Imagem do item ${form.name || form.sku}`}
                      width={320}
                      height={160}
                      className="h-full w-full object-contain"
                      unoptimized
                      onError={() => setImageError(true)}
                    />
                  </div>
                ) : form.imagePath.trim() && imageError ? (
                  <p className="mt-2 text-xs text-red-500">
                    Não foi possível carregar a imagem.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Informe um endereço de imagem válido para visualizar aqui.
                  </p>
                )}
              </div>
            </div>
            <div className="md:col-span-2 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isComposed}
                  onChange={() => handleCheckboxChange("isComposed")}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Item possui composição (ITProdSN)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isRawMaterial}
                  onChange={() => handleCheckboxChange("isRawMaterial")}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Item é matéria-prima (MATPRIMA)
              </label>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleNew}
                className="rounded-2xl border border-slate-300 px-6 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Novo
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      </SectionCard>

      <SectionCard
        title="Últimos cadastros"
        description="Itens recentemente sincronizados com o backend"
      >
        {loading ? (
          <p className="text-sm text-slate-500">Carregando...</p>
        ) : lastItems.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum item cadastrado até o momento.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {lastItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-slate-200 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      SKU: {item.sku} •{" "}
                      {item.createdAt
                        ? formatDate(item.createdAt)
                        : "sem data"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    className="text-xs font-semibold text-blue-600 hover:underline"
                  >
                    Editar
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                    Categoria: {item.category || "N/D"}
                  </span>
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                    {item.isComposed ? "Composição" : "Sem composição"}
                  </span>
                  <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                    {item.isRawMaterial ? "Matéria-prima" : "Produto acabado"}
                  </span>
                  {item.imagePath ? (
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">
                      Imagem: {item.imagePath}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
