'use client';

import { useEffect, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { StatusBadge } from "@/modules/core/components/StatusBadge";
import { formatCurrency, formatDate } from "@/modules/core/utils/formatters";
import {
  listProductionOrders,
  listBoms,
} from "@/modules/production/services/productionService";
import { listInventoryMovements } from "@/modules/stock/services/stockService";
import {
  BomRecord,
  InventoryMovementRecord,
  ProductionOrder,
} from "@/modules/core/types";

export default function DashboardPage() {
  const { session } = useSession();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [movements, setMovements] = useState<InventoryMovementRecord[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError(null);
    const today = new Date();
    const to = today.toISOString().slice(0, 10);
    const from = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 30,
    )
      .toISOString()
      .slice(0, 10);

    Promise.all([
      listProductionOrders(session),
      listInventoryMovements(session, { type: "E", from, to }),
      listBoms(session),
    ])
      .then(([ordersResponse, entriesResponse, bomResponse]) => {
        setOrders(ordersResponse);
        setMovements(entriesResponse);
        setBoms(bomResponse);
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Falha ao carregar painel",
        );
      })
      .finally(() => setLoading(false));
  }, [session]);

  const openOrders = orders.filter((order) => order.status !== "CONCLUIDA");
  const averageUnitCost =
    openOrders.reduce((sum, order) => sum + (order.unitCost ?? 0), 0) /
    (openOrders.length || 1);
  const lastEntries = movements.slice(0, 4);
  const lastOrders = orders.slice(0, 5);
  const avgMargin =
    boms.reduce((sum, bom) => sum + bom.marginAchieved, 0) /
    (boms.length || 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-3xl p-5">
          <p className="text-sm text-slate-500">Ordens em aberto</p>
          <p className="text-3xl font-semibold mt-2 text-slate-900">
            {openOrders.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {orders.length} OPs registradas
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5">
          <p className="text-sm text-slate-500">Custo medio OP</p>
          <p className="text-3xl font-semibold mt-2 text-slate-900">
            {formatCurrency(averageUnitCost || 0)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Baseado nas OPs abertas</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5">
          <p className="text-sm text-slate-500">Entradas recentes</p>
          <p className="text-3xl font-semibold mt-2 text-slate-900">
            {movements.length}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Ultimos {lastEntries.length} documentos listados
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-3xl p-5">
          <p className="text-sm text-slate-500">Margem BOM media</p>
          <p className="text-3xl font-semibold mt-2 text-emerald-600">
            {avgMargin.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {boms.length} receitas analisadas
          </p>
        </div>
      </div>

      {error ? (
        <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-3 rounded-2xl">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 text-sm text-slate-500">
          Atualizando dados...
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Ordens em andamento"
          description="Acompanhamento rapido das ultimas OPs registradas"
        >
          <div className="space-y-3">
            {lastOrders.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma OP registrada</p>
            ) : (
              lastOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between border border-slate-100 rounded-2xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      OP {order.OP} • {order.productCode}
                    </p>
                    <p className="text-xs text-slate-500">
                      {order.quantityPlanned} {order.unit} • entrega{" "}
                      {formatDate(order.dueDate)}
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard
          title="Entradas recentes"
          description="Documentos de entrada de estoque e materias-primas"
        >
          <div className="space-y-3">
            {lastEntries.length === 0 ? (
              <p className="text-sm text-slate-500">Sem entradas registradas</p>
            ) : (
              lastEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border border-slate-100 rounded-2xl px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.document?.number ?? "-"} • {entry.itemId}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.date ? formatDate(entry.date) : "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">
                      {entry.quantity.toFixed(2)} un
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.unitPrice !== undefined
                        ? formatCurrency(entry.unitPrice)
                        : "-"}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
