'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import {
  completeProductionOrder,
  getProductionOrderByOp,
} from "@/modules/production/services/productionService";
import { ProductionOrder } from "@/modules/core/types";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";

const formatDateOrPlaceholder = (value?: string) =>
  value ? formatDate(value) : "--";

const toNumber = (value: string) => {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function ProductionClosePage() {
  const { session } = useSession();
  const [opInput, setOpInput] = useState("");
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [quantityInput, setQuantityInput] = useState("");
  const [unitCostInput, setUnitCostInput] = useState("");
  const [warehouseInput, setWarehouseInput] = useState("");
  const [lotNumberInput, setLotNumberInput] = useState("");
  const [postedAtInput, setPostedAtInput] = useState(
    new Date().toISOString().slice(0, 16),
  );
  const [notesInput, setNotesInput] = useState("");

  const resetForm = useCallback(() => {
    setOrder(null);
    setMessage(null);
    setQuantityInput("");
    setUnitCostInput("");
    setWarehouseInput(session?.warehouse || "");
    setLotNumberInput("");
    setPostedAtInput(new Date().toISOString().slice(0, 16));
    setNotesInput("");
    setOpInput("");
  }, [session]);

  const headerInfo = useMemo(() => {
    if (!order) return null;
    return {
      op: order.OP || order.externalCode || order.id,
      createdAt: order.createdAt,
      author: order.author_user,
      productLabel: order.productName
        ? `${order.productCode} - ${order.productName}`
        : order.productCode,
      quantity: `${order.quantityPlanned} ${order.unit}`,
      dueDate: order.dueDate,
      status: order.status,
      unitCost: order.unitCost,
      totalCost: order.totalCost,
      lote: order.lote,
    };
  }, [order]);

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
      const detailed = await getProductionOrderByOp(session, needle);
      setMessage(
        `OP ${detailed.OP || detailed.externalCode || needle} está em status ${detailed.status}.`,
      );
      if (detailed.status !== "PRODUCAO") {
        const msg = `OP ${detailed.OP || detailed.externalCode || needle} está em status ${detailed.status}. Apenas OPs em PRODUÇÃO podem ser baixadas.`;
        alert(msg);
        setOrder(null);
        return;
      }
      // Usa o detalhe retornado na busca por OP (evita chamada por UUID)
      setOrder(detailed);
      setQuantityInput(
        detailed.quantityPlanned !== undefined && detailed.quantityPlanned !== null
          ? String(detailed.quantityPlanned)
          : "",
      );
      setUnitCostInput(
        detailed.unitCost !== undefined && detailed.unitCost !== null
          ? String(detailed.unitCost)
          : "",
      );
      setWarehouseInput(session.warehouse || "");
      setLotNumberInput(
        detailed.lote !== undefined && detailed.lote !== null
          ? String(detailed.lote)
          : "",
      );
    } catch (error) {
      console.error("Falha ao buscar OP:", error);
      setMessage(
        error instanceof Error ? error.message : "Falha ao buscar OP.",
      );
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [opInput, session]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || !order) return;
    const quantityNum = toNumber(quantityInput);
    if (quantityNum <= 0) {
      setMessage("Informe uma quantidade maior que zero.");
      return;
    }
    const warehouseRaw = warehouseInput.trim() || session.warehouse || "";
    if (!warehouseRaw) {
      setMessage("Informe o depósito (EMP).");
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(quantityNum.toString())) {
      setMessage("Quantidade deve ser numérica.");
      return;
    }
    if (!/^\d+$/.test(warehouseRaw)) {
      setMessage("Depósito deve ser numérico.");
      return;
    }
    const unitCostNum =
      unitCostInput.trim() !== "" ? toNumber(unitCostInput) : undefined;
    if (unitCostInput && !Number.isFinite(unitCostNum)) {
      setMessage("Custo unitário inválido.");
      return;
    }
    const quantityStr = quantityNum.toString();
    const unitCostStr =
      unitCostNum !== undefined && Number.isFinite(unitCostNum)
        ? unitCostNum.toString()
        : undefined;
    const warehouseStr = warehouseRaw;
    const payload = {
      productCode: order.productCode || undefined,
      quantity: quantityStr,
      unitCost: unitCostStr,
      warehouse: warehouseStr,
      lotNumber: lotNumberInput.trim() || undefined,
      postedAt: postedAtInput
        ? new Date(postedAtInput).toISOString()
        : undefined,
      user: session.user.id || session.user.email || session.user.name || undefined,
      responsible: session.user.name || undefined,
      notes: notesInput.trim() || undefined,
    };

    setSaving(true);
    setMessage(null);
    try {
      await completeProductionOrder(session, order.id, payload);
      setMessage("Baixa de produção registrada com sucesso.");
      resetForm();
    } catch (error) {
      console.error("Falha ao baixar produção:", error);
      setMessage(
        error instanceof Error ? error.message : "Falha ao baixar produção.",
      );
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    setWarehouseInput(session?.warehouse || "");
  }, [session]);

  return (
    <div className="space-y-6">
      {message ? (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-2xl">
          {message}
        </div>
      ) : null}

      <SectionCard
        title="Baixa de produção"
        description="Registrar conclusão de uma ordem de produção em status PRODUÇÃO"
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
          description="Informações da ordem em produção"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs text-slate-500">OP</p>
              <p className="text-sm font-semibold text-slate-900">
                {headerInfo?.op}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Abertura: {formatDateOrPlaceholder(headerInfo?.createdAt)}
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
              <p className="text-xs text-slate-500 mt-1">
                Status: {headerInfo?.status}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500">Quantidade planejada</p>
              <p className="text-sm font-semibold text-slate-900">
                {headerInfo?.quantity}
              </p>
              <p className="text-xs text-slate-500">
                Entrega: {formatDateOrPlaceholder(headerInfo?.dueDate)}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Quantidade
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={quantityInput}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="Qtd produzida"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Custo unitário (opcional)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={unitCostInput}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="R$"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Depósito (EMP)
                </label>
                <input
                  value={warehouseInput}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="Depósito"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Custo total (somente leitura)
                </label>
                <input
                  value={
                    headerInfo?.totalCost !== undefined && headerInfo?.totalCost !== null
                      ? formatCurrency(headerInfo.totalCost)
                      : ""
                  }
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="--"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Lote (opcional)
                </label>
                <input
                  value={lotNumberInput}
                  onChange={(e) => setLotNumberInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="Lote"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Data/hora lançamento
                </label>
                <input
                  type="datetime-local"
                  value={postedAtInput}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">
                  Observações (opcional)
                </label>
                <input
                  value={notesInput}
                  readOnly
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                  placeholder="Notas"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Processando..." : "Baixar Ordem de Produção"}
              </button>
            </div>
          </form>
        </SectionCard>
      ) : null}
    </div>
  );
}
