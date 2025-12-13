'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "@/modules/core/services/api";

type AnyRecord = Record<string, unknown>;

export type SearchOption = {
  id: string;
  label: string;
  code?: string;
  barcode?: string;
  raw?: AnyRecord;
};

const candidateKeys = [
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

const findArrayDeep = (value: unknown, depth = 0): AnyRecord[] | null => {
  if (depth > 5) return null;
  if (Array.isArray(value)) {
    return value as AnyRecord[];
  }
  if (value && typeof value === "object") {
    const record = value as AnyRecord;
    for (const key of candidateKeys) {
      if (record[key] !== undefined) {
        const candidate = findArrayDeep(record[key], depth + 1);
        if (candidate) return candidate;
      }
    }
    for (const nested of Object.values(record)) {
      const candidate = findArrayDeep(nested, depth + 1);
      if (candidate) return candidate;
    }
  }
  return null;
};

const extractArray = <T,>(value: unknown): T[] => {
  const result = findArrayDeep(value);
  return Array.isArray(result) ? (result as T[]) : [];
};

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

export interface SearchLookupProps {
  table: string;
  descriptionField: string;
  codeField: string;
  barcodeField?: string;
  placeholder?: string;
  label?: string;
  inputClassName?: string;
  onSelect: (option: SearchOption) => void;
  renderOption?: (option: SearchOption, isHighlighted: boolean) => ReactNode;
  defaultValue?: string;
}

export function SearchLookup({
  table,
  descriptionField,
  codeField,
  barcodeField = "barcode",
  placeholder = "Buscar...",
  label,
  inputClassName,
  onSelect,
  renderOption,
  defaultValue,
}: SearchLookupProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [results, setResults] = useState<SearchOption[]>([]);
  const lastRemoteSearch = useRef("");

  const defaultRender = useMemo(
    () =>
      renderOption ??
      ((option: SearchOption, isHighlighted: boolean) => (
        <div
          className={`w-full px-4 py-3 text-left ${
            isHighlighted ? "bg-blue-100" : "bg-white"
          } hover:bg-blue-50 focus:bg-blue-50`}
        >
          <p className="text-sm font-semibold text-slate-900">{option.label}</p>
          <p className="text-xs text-slate-500">
            {option.code ? `SKU: ${option.code}` : ""}
            {option.barcode ? ` • Barras: ${option.barcode}` : ""}
          </p>
        </div>
      )),
    [renderOption],
  );

  useEffect(() => {
    if (defaultValue !== undefined) {
      setSearchTerm(defaultValue);
    }
  }, [defaultValue]);

  useEffect(() => {
    const term = searchTerm.trim();
    const normalizedTerm = term.toLowerCase();
    if (!term) {
      setResults([]);
      setHighlightIndex(-1);
      lastRemoteSearch.current = "";
      return;
    }
    if (lastRemoteSearch.current === normalizedTerm) return;

    const fetchResults = async () => {
      lastRemoteSearch.current = normalizedTerm;
      try {
        const url = `/${table}/search`;
        const fullUrl = `${url}?descricao=${encodeURIComponent(term)}`;
        console.log("[SearchLookup] GET", fullUrl);
        const response = await api.get(url, {
          params: {
            descricao: term,
          },
        });

        const rawItems = extractArray<AnyRecord>(response.data);
        const mapped = rawItems.map((raw, index) => {
          const id =
            getStringValue(
              raw,
              [
                "id",
                codeField,
                codeField.toLowerCase(),
                codeField.toUpperCase(),
                "code",
              ],
              `item-${index}`,
            ) || `item-${index}`;

          const label =
            getStringValue(raw, [
              descriptionField,
              descriptionField.toLowerCase(),
              descriptionField.toUpperCase(),
              "descricao",
              "deitem",
              "defat",
              "name",
              "description",
            ]) || id;

          const code = getStringValue(raw, [
            codeField,
            codeField.toLowerCase(),
            codeField.toUpperCase(),
            "code",
            "sku",
            "cditem",
          ]);

          const barcode = getStringValue(raw, [
            barcodeField,
            barcodeField.toLowerCase(),
            barcodeField.toUpperCase(),
            "barcodeit",
            "barcode",
            "codbarra",
          ]);

          return { id, label, code, barcode, raw };
        });
        setResults(mapped);
        setShowResults(true);
        setHighlightIndex(mapped.length > 0 ? 0 : -1);
      } catch (error) {
        console.error("Falha ao buscar registros", error);
      }
    };

    fetchResults();
  }, [barcodeField, codeField, descriptionField, searchTerm, table]);

  const handleSelect = (option: SearchOption) => {
    // Evita refazer a busca imediatamente após a seleção
    lastRemoteSearch.current = option.label?.trim().toLowerCase() ?? "";
    setResults([]);
    setSearchTerm(option.label);
    setShowResults(false);
    setHighlightIndex(-1);
    onSelect(option);
  };

  return (
    <div>
      {label ? (
        <label className="text-xs font-semibold text-slate-500">{label}</label>
      ) : null}
      <input
        value={searchTerm}
        onFocus={() => searchTerm.trim() && setShowResults(true)}
        onChange={(event) => {
          setSearchTerm(event.target.value);
          setShowResults(true);
          setHighlightIndex(-1);
        }}
        onKeyDown={(event) => {
          if (!showResults || results.length === 0) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setHighlightIndex((prev) =>
              prev < results.length - 1 ? prev + 1 : prev,
            );
          }

          if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlightIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }

          if (event.key === "Enter") {
            event.preventDefault();
            if (highlightIndex >= 0) {
              handleSelect(results[highlightIndex]);
            }
          }
        }}
        placeholder={placeholder}
        className={
          inputClassName ??
          "mt-1 w-full rounded-xl border border-slate-200 px-4 py-2"
        }
      />
      {searchTerm.trim() && showResults ? (
        <div className="relative mt-2">
          {results.length > 0 ? (
            <div className="absolute z-10 max-h-64 w-full divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
              {results.map((option, index) => (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => handleSelect(option)}
                  className="w-full text-left"
                >
                  {defaultRender(option, index === highlightIndex)}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Nenhum item encontrado com os filtros informados.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
