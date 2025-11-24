import { api } from "@/modules/core/services/api";
import { LoginPayload, SessionData, TenantInfo } from "@/modules/core/types";

const AUTH_PATH = process.env.NEXT_PUBLIC_AUTH_PATH?.trim() || "/auth/login";

type AuthApiResponse = {
  token: string;
  expiresIn?: string;
  usuario?: string;
  nome?: string;
  deusu?: string;
  admin?: boolean;
  email: string;
  empresa?: string;
  logoUrl?: string;
  tenant?: string;
  mensagem?: string;
};

const normalizeSlug = (value?: string) => {
  if (!value) return "";

  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

const buildTenantInfo = (response: AuthApiResponse): TenantInfo => {
  const slugFromResponse = normalizeSlug(response.tenant);
  const slugFromCompany = normalizeSlug(response.empresa);
  const slugFromEmail = normalizeSlug(
    response.email?.split("@")?.[1]?.split(".")?.[0],
  );
  const slugLabel =
    slugFromResponse || slugFromCompany || slugFromEmail || "tenant";
  const domainSlug = slugLabel.toLowerCase();

  return {
    id: domainSlug,
    slug: domainSlug,
    name: response.empresa ?? response.tenant ?? slugLabel.toUpperCase(),
    logoUrl:
      response.logoUrl ??
      `https://placehold.co/160x50?text=${encodeURIComponent(
        response.empresa ?? slugLabel,
      )}`,
    // domain: `${domainSlug}.goldpdv.com.br`,
    domain: `${domainSlug}`,
    enterprise: response.empresa ?? slugLabel.toUpperCase(),
  };
};

const mapApiToSession = (response: AuthApiResponse): SessionData => {
  const tenant = buildTenantInfo(response);

  return {
    token: response.token,
    expiresIn: response.expiresIn,
    loginMessage: response.mensagem,
    authPayload: response,
    tenant,
    tenantCode: response.tenant,
    mensagem: response.mensagem,
    usuario: response.usuario,
    nome: response.nome,
    deusu: response.deusu,
    admin: response.admin,
    email: response.email,
    empresa: response.empresa,
    logoUrl: response.logoUrl,
    user: {
      id: response.usuario ?? response.email,
      name: response.nome ?? response.deusu ?? response.email,
      email: response.email,
      role: response.admin ? "ADMIN" : "USER",
    },
  };
};

export async function authenticate(payload: LoginPayload): Promise<SessionData> {
  try {
    const { data, status } = await api.post<AuthApiResponse>(AUTH_PATH, payload, {
      // Evita que 4xx (ex: 401 de credenciais invalidas) acionem o interceptor global
      validateStatus: (code) => code < 500,
    });

    if (status >= 400) {
      const message =
        (typeof data?.mensagem === "string" && data.mensagem.trim()) ||
        "Falha ao autenticar";
      throw new Error(message);
    }

    return mapApiToSession(data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Falha ao autenticar");
  }
}
