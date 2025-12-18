'use client';

import { useState } from "react";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { ProductionOrderDetails } from "./components/ProductionOrderDetails";
import { ProductionOrdersList } from "./components/ProductionOrdersList";

export default function ProductionClosePage() {
  const [opInput, setOpInput] = useState("");
  const [selectedOp, setSelectedOp] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleSelectOp = (op: string) => {
    const normalized = `${op ?? ""}`.trim();
    if (!normalized) return;
    setOpInput(normalized);
    setSelectedOp(normalized);
    setReloadKey((prev) => prev + 1);
  };

  const handleSearchClick = () => {
    handleSelectOp(opInput);
  };

  const handleOrderClosed = () => {
    setReloadKey((prev) => prev + 1);
    setSelectedOp(null);
    setOpInput("");
  };

  return (
    <div className="space-y-6">
      <ProductionOrdersList
        onSelectOrder={handleSelectOp}
        reloadKey={reloadKey}
      />

      <SectionCard
        title="Baixa de producao"
        description="Registrar conclusao de uma ordem de producao em status PRODUCAO"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="text-xs font-semibold text-slate-600">
              Numero da OP
            </label>
            <input
              value={opInput}
              onChange={(e) => setOpInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Informe o numero da OP"
            />
          </div>
          <button
            type="button"
            onClick={handleSearchClick}
            disabled={!opInput.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Buscar OP
          </button>
        </div>
      </SectionCard>

      <ProductionOrderDetails
        opNumber={selectedOp}
        reloadKey={reloadKey}
        onOrderClosed={handleOrderClosed}
      />
    </div>
  );
}

