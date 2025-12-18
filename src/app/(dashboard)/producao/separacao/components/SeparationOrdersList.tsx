'use client';

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { useSession } from "@/modules/core/hooks/useSession";
import { ProductionOrder } from "@/modules/core/types";
import { formatDate } from "@/modules/core/utils/formatters";
import { listSeparationProductionOrders } from "@/modules/production/services/productionService";

type SeparationOrdersListProps = {
  onSelectOrder: (op: string, order?: ProductionOrder) => void;
  reloadKey?: number;
};

const formatDateOrDash = (value?: string | null) =>
  value ? formatDate(value) : "--";

export function SeparationOrdersList({
  onSelectOrder,
  reloadKey = 0,
}: SeparationOrdersListProps) {
  const { session } = useSession();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await listSeparationProductionOrders(session);
        if (cancelled) return;
        setOrders(result);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Falha ao carregar OPs em separacao.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [session, reloadKey]);

  const info = useMemo(() => {
    const total = orders.length;
    const totalLabel = total === 1 ? "1 OP" : `${total} OPs`;
    return {
      totalLabel,
    };
  }, [orders]);

  return (
    <SectionCard
      title="OPs em separacao"
      description="Selecione uma OP em separacao para carregar os detalhes."
      action={
        <span className="text-xs font-semibold text-slate-500">
          {info.totalLabel}
        </span>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Carregando OPs...</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhuma OP em separacao encontrada.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const op = order.OP || order.externalCode || order.id;
            const productLabel = order.productName
              ? `${order.productCode} - ${order.productName}`
              : order.productCode;
            return (
              <button
                type="button"
                key={order.id}
                onClick={() => onSelectOrder(op, order)}
                className="flex h-full flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold text-blue-700">
                    OP {op}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formatDateOrDash(order.createdAt ?? order.startDate)}
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {productLabel || "--"}
                </div>
                <div className="text-xs text-slate-500">
                  Usuario: {order.author_user || "--"}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
