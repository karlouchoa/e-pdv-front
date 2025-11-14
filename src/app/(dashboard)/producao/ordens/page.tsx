'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import {
  createProductionOrder,
  listBoms,
  listProductionOrders,
} from "@/modules/production/services/productionService";
import {
  ProductionOrder,
  ProductionOrderPayload,
  BomRecord,
} from "@/modules/core/types";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { StatusBadge } from "@/modules/core/components/StatusBadge";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";
import { calculateBomTotals } from "@/modules/production/utils/calc";

const buildInitialOrder = (): ProductionOrderPayload => ({
  productCode: "",
  quantityPlanned: 1000,
  unit: "UN",
  startDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10),
  externalCode: "",
  notes: "",
});

const formatDateOrPlaceholder = (value?: string) =>
  value ? formatDate(value) : "--";

export default function ProductionOrdersPage() {
  const { session } = useSession();
  const [form, setForm] = useState<ProductionOrderPayload>(() => buildInitialOrder());
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    Promise.all([listProductionOrders(session), listBoms(session)]).then(
      ([orderResponse, bomResponse]) => {
        setOrders(orderResponse);
        setBoms(bomResponse);
        if (orderResponse[0]) {
          setSelectedOrderId(orderResponse[0].id);
        }
      },
    );
  }, [session]);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedOrderBreakdown = selectedOrder?.costBreakdown ?? null;

  const referenceBom =
    boms.find((bom) => bom.productCode === form.productCode) ?? boms[0];

  const previewTotals = useMemo(() => {
    if (!referenceBom) {
      return calculateBomTotals({
        productCode: form.productCode || "PROD",
        version: "1.0",
        lotSize: form.quantityPlanned || 1,
        validityDays: 30,
        marginTarget: 10,
        items: [
          {
            componentCode: "ING-001",
            description: "Materia base",
            quantity: form.quantityPlanned || 1,
            unitCost: 2,
          },
        ],
      });
    }
    return calculateBomTotals({
      ...referenceBom,
      lotSize: form.quantityPlanned || referenceBom.lotSize,
    });
  }, [form, referenceBom]);

  const formatCurrencyOrDash = (value?: number) =>
    typeof value === "number" ? formatCurrency(value) : "--";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    setMessage(null);
    try {
      const created = await createProductionOrder(session, form);
      setOrders((prev) => [created, ...prev]);
      setSelectedOrderId(created.id);
      setForm(buildInitialOrder());
      setMessage(`OP ${created.externalCode} criada com sucesso.`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao criar OP",
      );
    }
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
              value={form.productCode}
              onChange={(event) =>
                setForm({ ...form, productCode: event.target.value })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">
              Código / OP
            </label>
            <input
              value={form.externalCode}
              onChange={(event) =>
                setForm({ ...form, externalCode: event.target.value })
              }
              required
              className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2"
            />
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
          <div className="md:col-span-3">
            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-2xl font-semibold"
            >
              Gerar OP e calcular custos
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Custos previstos"
        description="Baseado na ficha tecnica vigente"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Ingredientes</p>
            <p className="text-xl font-semibold">{formatCurrency(previewTotals.ingredients)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Mao de obra</p>
            <p className="text-xl font-semibold">{formatCurrency(previewTotals.labor)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Impostos</p>
            <p className="text-xl font-semibold">{formatCurrency(previewTotals.taxes)}</p>
          </div>
          <div className="border border-slate-200 rounded-2xl p-4">
            <p className="text-xs text-slate-500">Custo total lote</p>
            <p className="text-xl font-semibold">{formatCurrency(previewTotals.total)}</p>
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
                      {order.externalCode}
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
          title={`Resumo da OP ${selectedOrder.externalCode}`}
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
