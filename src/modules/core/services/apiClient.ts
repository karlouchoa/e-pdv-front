import type { SessionData } from "@/modules/core/types";
import { SESSION_STORAGE_KEY } from "@/modules/core/constants/storage";

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3023";

const TENANT_DOMAIN_TEMPLATE =
  process.env.NEXT_PUBLIC_TENANT_DOMAIN_TEMPLATE ??
  "https://{tenant}.goldpdv.com.br";
const DEFAULT_TIMEOUT = Number(process.env.NEXT_PUBLIC_API_TIMEOUT ?? 15000);

export const USE_MOCK_API =
  process.env.NEXT_PUBLIC_USE_MOCK_API !== "false";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequestConfig {
  path: string;
  method?: HttpMethod;
  data?: unknown;
  tenant?: string;
  token?: string;
  headers?: Record<string, string>;
  tenantAware?: boolean;
  timeoutMs?: number;
}

export async function sessionRequest<T>(
  session: SessionData,
  config: Omit<ApiRequestConfig, "tenant" | "token">,
) {
  return apiRequest<T>({
    ...config,
    tenant: session.tenant.slug,
    token: session.token,
  });
}

const ensureLeadingSlash = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const buildTenantUrl = (tenant: string, path: string) => {
  if (!tenant) {
    throw new Error("Tenant obrigatorio para chamada tenant-aware.");
  }

  if (TENANT_DOMAIN_TEMPLATE.includes("{tenant}")) {
    return `${TENANT_DOMAIN_TEMPLATE.replace("{tenant}", tenant)}${path}`;
  }

  return `https://${tenant}.${TENANT_DOMAIN_TEMPLATE}${path}`;
};

export async function apiRequest<T>({
  path,
  method = "GET",
  data,
  tenant,
  token,
  headers,
  tenantAware = true,
  timeoutMs = DEFAULT_TIMEOUT,
}: ApiRequestConfig): Promise<T> {
  const normalizedPath = ensureLeadingSlash(path);
  const url = tenantAware
    ? buildTenantUrl(tenant ?? "", normalizedPath)
    : `${DEFAULT_API_URL}${normalizedPath}`;

    // console.log("[apiRequest]", {
    //   url,
    //   method,
    //   tenantAware,
    //   tenant,
    //   data,
    // });
    

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
    window.alert("Sessao expirada. Faça login novamente.");
    window.location.href = "/";
  };

  try {
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { "X-Tenant": tenant } : {}),
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

    console.info("[apiRequest][success]", {
      url,
      status: response.status,
      body: responseBody,
    });

    return (responseBody as T) ?? ({} as T);
  } finally {
    clearTimeout(timeout);
  }
}
