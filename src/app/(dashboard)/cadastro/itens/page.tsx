'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { useSession } from "@/modules/core/hooks/useSession";
import { api } from "@/modules/core/services/api";
import { formatCurrency } from "@/modules/core/utils/formatters";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { SearchLookup, SearchOption } from "@/modules/core/components/SearchLookup";

type AnyRecord = Record<string, unknown>;

type ItemRow = {
  id: string;
  code: string;
  description: string;
  unit: string;
  brand: string;
  group: string;
  isRawMaterial: boolean;
  purchase: number;
  cost: number;
  price: number;
  balance: number;
};

type GroupOption = { code: string; description: string };

const toRecord = (value: unknown): AnyRecord => (value ?? {}) as AnyRecord;

const getStringValue = (
  record: AnyRecord,
  keys: string[],
  fallback = "",
) => {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return fallback;
};

const getNumberValue = (
  record: AnyRecord,
  keys: string[],
  fallback = 0,
) => {
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
};

const extractArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const record = value as AnyRecord;
    const candidates = [
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
    for (const key of candidates) {
      const arr = record[key];
      if (Array.isArray(arr)) return arr as T[];
    }
  }
  return [];
};

const normalizeItemRow = (raw: AnyRecord, fallbackId: string): ItemRow => {
  const record = toRecord(raw);
  const code = getStringValue(record, ["cditem", "CDITEM", "code", "sku"], "");
  return {
    id:
      getStringValue(record, ["id", "ID", "guid", "uuid"]) ||
      code ||
      fallbackId,
    code,
    description: getStringValue(record, ["deitem", "descricao", "description"]),
    unit: getStringValue(record, ["undven", "unid", "unit"], ""),
    brand: getStringValue(record, ["mrcitem", "marca"], ""),
    group: getStringValue(record, ["cdgruit", "cdgru", "grupo"], ""),
    isRawMaterial:
      getStringValue(record, ["matprima", "MATPRIMA"], "")
        .replace(/\s+/g, "")
        .toUpperCase() === "S",
    purchase: getNumberValue(record, ["valcmp", "compra", "vlcompra"], 0),
    cost: getNumberValue(record, ["custo", "custlq", "vlcusto"], 0),
    price: getNumberValue(record, ["preco", "vlpreco"], 0),
    balance: getNumberValue(
      record,
      [
        "saldo",
        "SALDO",
        "sldatual",
        "SldAtual",
        "saldoatual",
        "sld",
        "saldo_total",
        "saldototal",
      ],
      0,
    ),
  };
};

const normalizeGroup = (raw: AnyRecord, fallback: string): GroupOption => {
  const record = toRecord(raw);
  const code = getStringValue(record, ["cdgru", "cdgruit", "code"], fallback);
  return {
    code,
    description: getStringValue(record, ["degru", "descricao", "name"], code),
  };
};

type Filters = {
  description: string;
  group: string;
  isRaw: string; // "S" | "N" | ""
  saldo: "COM" | "SEM" | "AMBOS";
  itemId: string;
};

export default function ItemListPage() {
  const { session } = useSession();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    description: "",
    group: "",
    isRaw: "",
    saldo: "AMBOS",
    itemId: "",
  });
  const [descriptionCandidate, setDescriptionCandidate] = useState("");
  const [descriptionItemIdCandidate, setDescriptionItemIdCandidate] =
    useState("");
  const [appliedFilters, setAppliedFilters] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / pageSize)),
    [total, pageSize],
  );

  const loadGroups = useCallback(async () => {
    if (groupsLoaded) return;
    try {
      const response = await api.get("/T_GRITENS");
      const raw = extractArray<AnyRecord>(response.data);
      setGroups(
        raw.map((item, index) => normalizeGroup(item, `group-${index}`)),
      );
      setGroupsLoaded(true);
    } catch (err) {
      console.error("Falha ao carregar grupos", err);
    }
  }, [groupsLoaded]);

  const loadItems = useCallback(async () => {
    if (!session || !appliedFilters) return;
    setLoading(true);
    setError(null);
    try {
      const params = {
        page,
        pageSize,
        descricaoPrefix: appliedFilters.description || undefined,
        cdgruit: appliedFilters.group || undefined,
        matprima: appliedFilters.isRaw || undefined,
        cditem: appliedFilters.itemId || undefined,
        includeSaldo: true,
        cdemp: session?.warehouse || undefined,
        ativosn: "S",
        saldo: appliedFilters.saldo || "AMBOS",
      };
      console.log("[Itens] GET /t_itens params:", params);
      const response = await api.get("/t_itens", {
        params,
      });

      const payload = response.data;
      const rawItems = extractArray<AnyRecord>(
        (payload as AnyRecord)?.data ?? payload,
      );
      const normalized = rawItems.map((item, index) =>
        normalizeItemRow(item, `item-${index}`),
      );

      setItems(normalized);
      const totalCount =
        getNumberValue(toRecord(payload), ["total", "count", "records"], 0) ||
        normalized.length;
      setTotal(totalCount);
    } catch (err) {
      console.error("Falha ao carregar itens", err);
      setError(
        err instanceof Error ? err.message : "Falha ao carregar itens.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    appliedFilters,
    page,
    pageSize,
    session,
  ]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const applyFilters = () => {
    const normalizedDescription = (descriptionCandidate || "").trim();
    const normalizedItemId = (descriptionItemIdCandidate || "").trim();
    const composedFilters = {
      ...filters,
      description: normalizedDescription,
      itemId: normalizedItemId,
    };
    setFilters(composedFilters);
    setPage(1);
    setAppliedFilters(composedFilters);
    loadGroups();
  };

  const handlePrint = () => {
    const tenantName = session?.tenant?.name ?? "Empresa";
    const tenantLogo = session?.tenant?.logoUrl ?? "";

    const printable = `
      <html>
        <head>
          <title>Relatorio de Cadastro de Produtos</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            @media print {
              body { margin: 0; }
            }
            body { font-family: Arial, sans-serif; padding: 16px; counter-reset: page; }
            .header { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
            .header img { height: 40px; object-fit: contain; }
            table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
            thead { display: table-header-group; }
            tbody { display: table-row-group; }
            tr, td, th { page-break-inside: avoid; page-break-after: auto; }
            th, td { border: 1px solid #e2e8f0; padding: 8px; font-size: 12px; }
            th { background: #f8fafc; text-align: left; }
            .title-cell { text-align: left; padding: 12px; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>
                <th colspan="10" class="title-cell">
                  <div class="header">
                    ${tenantLogo ? `<img src="${tenantLogo}" alt="Logo" />` : ""}
                    <div>
                      <h2 style="margin:0;">Relatório de Cadastro de Produtos</h2>
                      <div style="font-size:12px; color:#475569;">${tenantName}</div>
                    </div>
                  </div>
                </th>
              </tr>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>UN</th>
                <th>Marca</th>
                <th>Grupo</th>
                <th>MP</th>
                <th>Compra</th>
                <th>Custo</th>
                <th>Preço</th>
                <th>Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${items
                .map(
                  (item) => `
                    <tr>
                      <td>${item.code}</td>
                      <td>${item.description}</td>
                      <td>${item.unit}</td>
                      <td>${item.brand}</td>
                      <td>${item.group}</td>
                      <td>${item.isRawMaterial ? "S" : "N"}</td>
                      <td>${item.purchase.toFixed(2)}</td>
                      <td>${item.cost.toFixed(2)}</td>
                      <td>${item.price.toFixed(2)}</td>
                      <td>${item.balance.toFixed(2)}</td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
          <div class="footer"></div>
        </body>
      </html>
    `;
    const popup = window.open("", "print", "width=900,height=700");
    if (!popup) return;
    popup.document.write(printable);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Itens"
        description="Consulta de itens com filtros e paginação"
        action={
          <button
            type="button"
            onClick={handlePrint}
            className="text-sm font-semibold text-slate-600"
          >
            Imprimir PDF
          </button>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="md:col-span-2">
            <SearchLookup
              label="Descrição"
              table="t_itens"
              descriptionField="descricao"
              codeField="cditem"
              barcodeField="barcodeit"
              placeholder="Parte da descrição"
              defaultValue={descriptionCandidate}
              onClear={() => {
                setDescriptionCandidate("");
                setDescriptionItemIdCandidate("");
              }}
              onSelect={(option: SearchOption) => {
                setDescriptionCandidate(option.label || option.code || "");
                setDescriptionItemIdCandidate(option.code || option.id || "");
              }}
              onChange={(value) => {
                setDescriptionCandidate(value);
                setDescriptionItemIdCandidate("");
              }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Grupo
            </label>
            <select
              value={filters.group}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, group: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
            >
              <option value="">Todos</option>
              {groups.map((group) => (
                <option key={group.code} value={group.code}>
                  {group.code} - {group.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Matéria-prima
            </label>
            <select
              value={filters.isRaw}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, isRaw: event.target.value }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
            >
              <option value="">Todas</option>
              <option value="S">Sim</option>
              <option value="N">Não</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Saldo
            </label>
            <select
              value={filters.saldo}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  saldo: event.target.value as Filters["saldo"],
                }))
              }
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
            >
              <option value="AMBOS">Ambos</option>
              <option value="COM">Com saldo</option>
              <option value="SEM">Sem saldo</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button
            type="button"
            onClick={applyFilters}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Aplicando..." : "Aplicar filtros"}
          </button>
          <div className="text-xs text-slate-500 self-center">
            Página {page} de {totalPages} • {total} registros
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto border border-slate-100 rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Descrição</th>
                <th className="px-4 py-2">UN</th>
                <th className="px-4 py-2">Marca</th>
                <th className="px-4 py-2">Grupo</th>
                <th className="px-4 py-2">MP</th>
                <th className="px-4 py-2">Compra</th>
                <th className="px-4 py-2">Custo</th>
                <th className="px-4 py-2">Preço</th>
                <th className="px-4 py-2">Saldo</th>
                <th className="px-4 py-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-slate-500" colSpan={10}>
                    Carregando itens...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-slate-500" colSpan={10}>
                    Nenhum item encontrado.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 whitespace-nowrap">{item.code}</td>
                    <td className="px-4 py-2">{item.description}</td>
                    <td className="px-4 py-2">{item.unit}</td>
                    <td className="px-4 py-2">{item.brand}</td>
                    <td className="px-4 py-2">{item.group}</td>
                    <td className="px-4 py-2">{item.isRawMaterial ? "S" : "N"}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatCurrency(item.purchase)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatCurrency(item.cost)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {formatCurrency(item.price)}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      {item.balance.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/cadastro/produtos?descricao=${encodeURIComponent(item.description)}`}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm"
                        title="Editar item"
                      >
                        <Pencil size={16} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3 mt-4">
          <div className="text-xs text-slate-500">
            Exibindo página {page} de {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-50"
              disabled={page === 1 || loading}
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm disabled:opacity-50"
              disabled={page >= totalPages || loading}
            >
              Próxima
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
