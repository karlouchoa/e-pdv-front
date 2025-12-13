// apiClient.ts

import type { SessionData } from "@/modules/core/types";
import { SESSION_STORAGE_KEY } from "@/modules/core/constants/storage";

// A URL base para requisições não-tenant-aware (ex: login)
const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3023";

// URL a ser usada em ambiente de desenvolvimento (npm run start:dev)
const DEV_API_URL =
  process.env.NEXT_PUBLIC_DEV_API_URL ?? "http://localhost:3023";

// Template para montar a URL com subdomínio de tenant (ex: https://{tenant}.goldpdv.com.br)
const TENANT_DOMAIN_TEMPLATE =
  process.env.NEXT_PUBLIC_TENANT_DOMAIN_TEMPLATE ??
  "https://{tenant}.goldpdv.com.br";
  
const DEFAULT_TIMEOUT = Number(process.env.NEXT_PUBLIC_API_TIMEOUT ?? 15000);

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestConfig {
  path: string;
  method?: HttpMethod;
  data?: unknown;
  tenant?: string;
  token?: string;
  warehouse?: string | null;
  headers?: Record<string, string>;
  tenantAware?: boolean;
  timeoutMs?: number;
}

/**
 * Faz uma requisição com as informações de tenant e token da sessão.
 */
export async function sessionRequest<T>(
  session: SessionData,
  config: Omit<ApiRequestConfig, "tenant" | "token">,
) {
  return apiRequest<T>({
    ...config,
    tenant: session.tenant.slug,
    token: session.token,
    warehouse: session.warehouse ?? null,
  });
}

const ensureLeadingSlash = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const isDevEnv = () => process.env.NODE_ENV !== "production";

const buildTenantUrl = (tenant: string, path: string) => {
  // Em desenvolvimento, sempre utiliza o backend local exposto na porta 3023
  if (isDevEnv()) {
    return `${DEV_API_URL}${path}`;
  }

  if (!tenant) {
    throw new Error("Tenant obrigatório para chamada tenant-aware.");
  }

  // Verifica se o template usa a sintaxe {tenant} e substitui
  if (TENANT_DOMAIN_TEMPLATE.includes("{tenant}")) {
    return `${TENANT_DOMAIN_TEMPLATE.replace("{tenant}", tenant)}${path}`;
  }

  // Caso contrário, assume que o template é apenas o domínio e monta o subdomínio
  return `https://${tenant}.${TENANT_DOMAIN_TEMPLATE}${path}`;
};

/**
 * Função principal para realizar requisições à API.
 */
export async function apiRequest<T>({
  path,
  method = "GET",
  data,
  tenant,
  token,
  warehouse,
  headers,
  tenantAware = true,
  timeoutMs = DEFAULT_TIMEOUT,
}: ApiRequestConfig): Promise<T> {
  const normalizedPath = ensureLeadingSlash(path);
  
  // Constrói a URL: subdomínio do tenant OU URL base padrão
  const url = tenantAware
    ? buildTenantUrl(tenant ?? "", normalizedPath)
    : `${DEFAULT_API_URL}${normalizedPath}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const handleUnauthorized = () => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (err) {
      console.error("Erro ao limpar sessao:", err);
    }
    window.alert("Sessão expirada. Faça login novamente.");
    window.location.href = "/";
  };

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { "X-Tenant": tenant } : {}),
        ...(warehouse ? { "X-Warehouse": warehouse } : {}),
        ...headers,
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    const clonedResponse = response.clone();
    const rawText = await clonedResponse.text().catch(() => "");
    let responseBody: unknown = null;
    if (rawText) {
      try {
        responseBody = JSON.parse(rawText);
      } catch {
        responseBody = rawText;
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
      }
      console.warn("[apiRequest][error]", {
        url,
        status: response.status,
        body: responseBody,
      });
      throw new Error(
        (responseBody as Record<string, unknown>)?.message
          ? String((responseBody as Record<string, unknown>)?.message)
          : `Erro ${response.status} na API`,
      );
    }

    return (responseBody as T) ?? ({} as T);
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error(
        `Tempo limite excedido ao contactar a API (${timeoutMs}ms).`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
