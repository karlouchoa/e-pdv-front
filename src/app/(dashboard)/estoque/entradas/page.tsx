'use client';

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";
import {
  InventoryMovementPayload,
  InventoryMovementRecord,
  InventoryMovementSummary,
  InventoryMovementType,
} from "@/modules/core/types";
import {
  createInventoryMovement,
  getItemKardex,
  getMovementSummary,
  listInventoryMovements,
} from "@/modules/stock/services/stockService";

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
  type: "E" as InventoryMovementType,
  quantity: "",
  unitPrice: "",
  documentNumber: "",
  documentDate: today,
  documentType: "NF",
  notes: "",
  warehouse: "",
  counterparty: "",
  date: today,
};

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

const parsePositiveNumber = (value: string) => {
  const parsed = parseNumber(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return parsed;
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

  const handleMovementSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    const itemId = parsePositiveNumber(movementForm.itemId);
    const quantity = parsePositiveNumber(movementForm.quantity);
    if (!itemId || !quantity) {
      setMovementMessage("Informe item e quantidade válidos.");
      return;
    }
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
      warehouse: parseNumber(movementForm.warehouse),
      customerOrSupplier: parseNumber(movementForm.counterparty),
      date: movementForm.date || undefined,
    };
    setMovementMessage(null);
    try {
      const created = await createInventoryMovement(session, payload);
      setMovementMessage("Movimento registrado com sucesso.");
      setMovementForm(movementFormDefaults);
      setMovements((prev) => [created, ...prev]);
    } catch (error) {
      setMovementMessage(
        error instanceof Error ? error.message : "Falha ao registrar movimento.",
      );
    }
  };

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
        description="Lançamento direto na tabela t_movest"
      >
        <form
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
          onSubmit={handleMovementSubmit}
        >
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Item (ID)
            </label>
            <input
              value={movementForm.itemId}
              onChange={(event) =>
                setMovementForm({ ...movementForm, itemId: event.target.value })
              }
              required
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
            <input
              value={movementForm.documentType}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  documentType: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Almoxarifado (empitem)
            </label>
            <input
              value={movementForm.warehouse}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  warehouse: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Cliente/Fornecedor (clifor)
            </label>
            <input
              value={movementForm.counterparty}
              onChange={(event) =>
                setMovementForm({
                  ...movementForm,
                  counterparty: event.target.value,
                })
              }
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div className="md:col-span-2">
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
