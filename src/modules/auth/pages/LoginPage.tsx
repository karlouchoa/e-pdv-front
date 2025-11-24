'use client';

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/modules/core/hooks/useSession";
import { redirectToTenantDomain } from "@/modules/core/utils/tenant";

export default function LoginPage() {
  const router = useRouter();
  const { login, session, isLoading: isSessionLoading } = useSession();
  const [loginField, setLoginField] = useState("");
  const [senha, setSenha] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSessionLoading && session) {
      router.replace("/dashboard");
    }
  }, [isSessionLoading, session, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const sessionData = await login({ login: loginField, senha });
      const redirected = redirectToTenantDomain(sessionData.tenant, {
        path: "/dashboard",
      });
      if (!redirected) {
        router.push("/dashboard");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao autenticar";
      setError(message);
    } finally {
      setIsLoading(false);
    }
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
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p className="text-xs text-slate-400 text-center mt-4">
          Use um e-mail corporativo. O tenant e detectado automaticamente.
        </p>
      </div>
    </div>
  );
}
