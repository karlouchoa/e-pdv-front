'use client';

import { useState } from "react";
import { SectionCard } from "@/modules/core/components/SectionCard";
import { SeparationOrderDetails } from "./components/SeparationOrderDetails";
import { SeparationOrdersList } from "./components/SeparationOrdersList";

export default function SeparationIssuePage() {
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

  const handleOrderSeparated = () => {
    setReloadKey((prev) => prev + 1);
    setSelectedOp(null);
  };

  return (
    <div className="space-y-6">
      <SeparationOrdersList onSelectOrder={handleSelectOp} reloadKey={reloadKey} />

      <SectionCard
        title="Baixa da separacao"
        description="Informe o numero ou clique em uma OP para carregar os itens."
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

      <SeparationOrderDetails
        opNumber={selectedOp}
        reloadKey={reloadKey}
        onOrderSeparated={handleOrderSeparated}
      />
    </div>
  );
}
