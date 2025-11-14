import { ProductionStatus } from "@/modules/core/types";

const statusStyles: Record<
  ProductionStatus,
  { label: string; classes: string }
> = {
  SEPARACAO: {
    label: "Separacao",
    classes: "bg-amber-100 text-amber-800 border-amber-200",
  },
  PRODUCAO: {
    label: "Producao",
    classes: "bg-blue-100 text-blue-800 border-blue-200",
  },
  CONCLUIDA: {
    label: "Concluida",
    classes: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  CANCELADA: {
    label: "Cancelada",
    classes: "bg-red-100 text-red-700 border-red-200",
  },
};

export function StatusBadge({ status }: { status: ProductionStatus }) {
  const style =
    statusStyles[status] ??
    statusStyles.SEPARACAO;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${style.classes}`}
    >
      {style.label}
    </span>
  );
}
