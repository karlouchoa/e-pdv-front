'use client';

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/modules/core/hooks/useSession";
import { redirectToTenantDomain } from "@/modules/core/utils/tenant";
import { fetchUserCompanies } from "@/modules/auth/services/authService";
import { SessionData, UserCompany } from "@/modules/core/types";

export default function LoginPage() {
  const router = useRouter();
  const {
    login,
    session,
    isLoading: isSessionLoading,
    updateWarehouse,
    logout,
  } = useSession();
  const [loginField, setLoginField] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<UserCompany[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState("");
  const [isCompaniesLoading, setIsCompaniesLoading] = useState(false);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [awaitingCompanySelection, setAwaitingCompanySelection] =
    useState(false);
  const [companiesRequested, setCompaniesRequested] = useState(false);

  const loadCompanies = useCallback(
    async (activeSession: SessionData) => {
      setCompaniesError(null);
      setIsCompaniesLoading(true);
      try {
        const list = await fetchUserCompanies();
        setCompanies(list);
        setSelectedWarehouse((prev) => prev || activeSession.warehouse || "");
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Falha ao carregar empresas autorizadas.";
        setCompaniesError(message);
      } finally {
        setIsCompaniesLoading(false);
        setCompaniesRequested(true);
      }
    },
    [],
  );

  useEffect(() => {
    if (isSessionLoading) return;

    if (session?.warehouse) {
      router.replace("/dashboard");
      return;
    }

    if (session) {
      setAwaitingCompanySelection(true);
      if (!companiesRequested && !isCompaniesLoading) {
        loadCompanies(session);
      }
    }
  }, [
    isSessionLoading,
    session,
    router,
    loadCompanies,
    companiesRequested,
    isCompaniesLoading,
  ]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setCompaniesError(null);
    setIsLoading(true);
    setCompanies([]);
    setCompaniesRequested(false);

    try {
      const sessionData = await login({ login: loginField, senha });
      const redirected = redirectToTenantDomain(sessionData.tenant);
      setAwaitingCompanySelection(true);
      setSelectedWarehouse(sessionData.warehouse ?? "");
      await loadCompanies(sessionData);
      if (redirected) {
        return;
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao autenticar";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompanySubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!session) {
      setError("Sessao invalida. Faca login novamente.");
      return;
    }
    const normalizedWarehouse = selectedWarehouse.trim();
    if (!normalizedWarehouse) {
      setCompaniesError("Selecione uma empresa para continuar.");
      return;
    }

    const chosenCompany =
      companies.find(
        (company) =>
          company.code === normalizedWarehouse ||
          company.id === normalizedWarehouse ||
          company.label === normalizedWarehouse,
      ) ?? null;

    updateWarehouse(
      normalizedWarehouse,
      chosenCompany?.label ?? normalizedWarehouse,
    );
    router.push("/dashboard");
  };

  const handleReset = () => {
    updateWarehouse(null, null);
    logout();
    setAwaitingCompanySelection(false);
    setCompanies([]);
    setSelectedWarehouse("");
    setCompaniesError(null);
    setCompaniesRequested(false);
    setLoginField("");
    setSenha("");
    setError(null);
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-slate-100 via-white to-slate-200">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-100">
        <div className="flex flex-col items-center gap-2 mb-8">
          <div className="flex justify-center mb-8">
            <Image
              src="https://www.nortesoft.com.br/img/logo.png"
              alt="goldPDV - Gestao Empresarial"
              width={180}
              height={48}
              priority
              className="h-16 w-auto object-contain"
            />
          </div>
          <p className="text-sm text-slate-500 tracking-wide uppercase">
            goldPDV - Gestao Empresarial
          </p>
        </div>

        <h2 className="text-2xl font-bold text-center mb-6 text-slate-900">
          Acesse sua conta
        </h2>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              E-mail corporativo
            </label>
            <input
              type="email"
              id="email"
              className="mt-1 block w-full px-4 py-2 border border-slate-200 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="joao@adua.com.br"
              value={loginField}
              onChange={(event) => setLoginField(event.target.value)}
              disabled={awaitingCompanySelection}
              required
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Senha
            </label>
            <input
              type="password"
              id="password"
              className="mt-1 block w-full px-4 py-2 border border-slate-200 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="********"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              disabled={awaitingCompanySelection}
              required
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isLoading || awaitingCompanySelection}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Entrando..." : "Login"}
          </button>
        </form>
        {awaitingCompanySelection ? (
          <div className="mt-6 pt-6 border-t border-slate-100">
            <form className="space-y-3" onSubmit={handleCompanySubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Empresa
                </label>
                <select
                  className="mt-1 block w-full px-4 py-2 border border-slate-200 rounded-xl shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  value={selectedWarehouse}
                  onChange={(event) => setSelectedWarehouse(event.target.value)}
                  disabled={isCompaniesLoading}
                  required
                >
                  <option value="">
                    {isCompaniesLoading
                      ? "Carregando empresas..."
                      : "Selecione a empresa"}
                  </option>
                  {companies.map((company) => {
                    const optionValue = (company.code || company.id).trim();
                    return (
                      <option key={optionValue} value={optionValue}>
                        {company.label}
                      </option>
                    );
                  })}
                </select>
              </div>
              {companiesError ? (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {companiesError}
                </p>
              ) : null}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-1/3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl py-3 transition"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isCompaniesLoading || !selectedWarehouse}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isCompaniesLoading ? "Carregando..." : "Acessar"}
                </button>
              </div>
            </form>
          </div>
        ) : null}
        <p className="text-xs text-slate-400 text-center mt-4">
          Use um e-mail corporativo. O tenant e detectado automaticamente.
        </p>
      </div>
    </div>
  );
}
