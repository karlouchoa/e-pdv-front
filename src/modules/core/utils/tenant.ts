import type { TenantInfo } from "@/modules/core/types";

const TENANT_REDIRECT_ENABLED =
  (process.env.NEXT_PUBLIC_ENABLE_TENANT_REDIRECT ?? "")
    .toLowerCase()
    .trim() === "true";

const sanitizeHost = (value?: string | null) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
};

const isLocalHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    normalized.includes("localhost") ||
    normalized.startsWith("127.") ||
    normalized.startsWith("0.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("10.") ||
    /^[0-9.]+$/.test(normalized)
  );
};

export const resolveTenantHost = (tenant?: TenantInfo | null) => {
  if (!tenant) {
    return null;
  }
  const domainHost = sanitizeHost(tenant.domain);
  if (domainHost) {
    return domainHost;
  }
  const slug = tenant.slug?.trim();
  if (!slug) {
    return null;
  }
  return `${slug.toLowerCase()}.goldpdv.com.br`;
};

export const redirectToTenantDomain = (
  tenant: TenantInfo,
  options: { path?: string } = {},
) => {
  if (!TENANT_REDIRECT_ENABLED) {
    return false;
  }
  if (typeof window === "undefined") {
    return false;
  }

  const currentHost = window.location.hostname;
  if (!currentHost || isLocalHostname(currentHost)) {
    return false;
  }

  const targetHost = resolveTenantHost(tenant);
  if (!targetHost) {
    return false;
  }

  if (currentHost.toLowerCase() === targetHost.toLowerCase()) {
    return false;
  }

  const protocol = window.location.protocol || "https:";
  const destinationPath =
    options.path ??
    `${window.location.pathname}${window.location.search}${window.location.hash}`;

  window.location.href = `${protocol}//${targetHost}${destinationPath}`;
  return true;
};
