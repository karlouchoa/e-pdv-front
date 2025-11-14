'use client';

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/modules/core/hooks/useSession";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { StatusBadge } from "@/modules/core/components/StatusBadge";
import {
  listProductionOrders,
  listOrderStatusEvents,
  registerOrderStatus,
} from "@/modules/production/services/productionService";
import {
  ProductionOrder,
  ProductionStatus,
  ProductionStatusEvent,
} from "@/modules/core/types";
import { formatDate } from "@/modules/core/utils/formatters";

const statusOrder: ProductionStatus[] = [
  "SEPARACAO",
  "PRODUCAO",
  "CONCLUIDA",
];

const formatDateOrPlaceholder = (value?: string) =>
  value ? formatDate(value) : "--";

export default function ProductionControlPage() {
  const { session } = useSession();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [events, setEvents] = useState<ProductionStatusEvent[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!session) return;
    setLoading(true);
    listProductionOrders(session)
      .then(async (ordersResponse) => {
        setOrders(ordersResponse);
        const statuses = await Promise.all(
          ordersResponse.map((order) =>
            listOrderStatusEvents(session, order.id).catch(() => []),
          ),
        );
        const flattened = statuses
          .flat()
          .sort(
            (a, b) =>
              new Date(b.timestamp).valueOf() - new Date(a.timestamp).valueOf(),
          );
        setEvents(flattened);
      })
      .finally(() => setLoading(false));
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const advanceOrder = async (order: ProductionOrder) => {
    if (!session) return;
    const currentIndex = statusOrder.indexOf(order.status);
    const nextStatus = statusOrder[currentIndex + 1];
    if (!nextStatus) return;
    setMessage(null);
    try {
      await registerOrderStatus(session, order.id, {
        status: nextStatus,
        responsible: session.user.name,
        remarks: "Atualizado via painel",
      });
      setMessage(`OP ${order.externalCode} movida para ${nextStatus}.`);
      refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao atualizar status");
    }
  };

  return (
    <div className="space-y-6">
      {message ? (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-4 py-3 rounded-2xl">
          {message}
        </div>
      ) : null}

      <SectionCard
        title="Controle de producao"
        description="Fluxo de separacao, producao e conclusao"
      >
        {loading ? (
          <p className="text-xs text-slate-500 mb-4">Atualizando dados...</p>
        ) : null}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statusOrder.map((status) => (
            <div key={status} className="bg-slate-50 rounded-2xl p-4 min-h-[320px] flex flex-col gap-3 border border-slate-100">
              <div className="flex items-center justify-between">
                <StatusBadge status={status} />
                <span className="text-xs text-slate-500">
                  {
                    orders.filter((order) => order.status === status).length
                  }{" "}
                  OPs
                </span>
              </div>
              <div className="space-y-3 flex-1">
                {orders
                  .filter((order) => order.status === status)
                  .map((order) => (
                    <div
                      key={order.id}
                      className="bg-white border border-slate-200 rounded-2xl px-4 py-3 space-y-1 shadow-sm"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        {order.externalCode} • {order.productCode}
                      </p>
                      <p className="text-xs text-slate-500">
                        {order.quantityPlanned} {order.unit} • entrega{" "}
                        {formatDateOrPlaceholder(order.dueDate)}
                      </p>
                      {status !== "CONCLUIDA" ? (
                        <button
                          type="button"
                          onClick={() => advanceOrder(order)}
                          className="text-xs font-semibold text-blue-600"
                        >
                          Avancar
                        </button>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Linha do tempo"
        description="Eventos recentes das ordens de producao"
      >
        {events.length === 0 ? (
          <p className="text-sm text-slate-500">Sem eventos registrados.</p>
        ) : (
          <ul className="space-y-3">
            {events
              .slice()
              .reverse()
              .slice(0, 12)
              .map((event) => (
                <li
                  key={event.id}
                  className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      OP {event.orderId.slice(0, 6)} • {event.responsible}
                    </p>
                    <p className="text-xs text-slate-500">{event.notes}</p>
                  </div>
                    <div className="text-right">
                      <StatusBadge status={event.status} />
                      <p className="text-xs text-slate-500 mt-1">
                        {formatDateOrPlaceholder(event.timestamp)}
                      </p>
                    </div>
                </li>
              ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
