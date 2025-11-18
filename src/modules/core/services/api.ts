import axios from "axios";
import { SESSION_STORAGE_KEY } from "@/modules/core/constants/storage";

// ======================================================
// 🔹 1️⃣ Detectar tenant atual baseado no domínio
// ======================================================
function detectTenantBaseUrl(): string {
  if (typeof window === "undefined") {
    // SSR fallback
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3023";
  }

  const host = window.location.host; // ex: amazonat.goldpdv.com.br
  const isLocal = host.includes("localhost");

  // Ambiente local → backend local
  if (isLocal) {
    return "http://localhost:3023";
  }

  // Produção → montar dinamicamente
  // EX: amazonat.goldpdv.com.br → https://amazonat.goldpdv.com.br/api
  return `https://${host}`;
}

// ======================================================
// 🔹 2️⃣ BASE_URL dinâmico
// ======================================================
const BASE_URL = detectTenantBaseUrl();

// ======================================================
// 🔹 3️⃣ Instância Axios
// ======================================================
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: Number(process.env.NEXT_PUBLIC_API_TIMEOUT ?? 15000),
});

// ======================================================
// 🔹 4️⃣ Interceptor para token + tenant header
// ======================================================
api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);

    if (raw) {
      const session = JSON.parse(raw);

      const token = session?.token;
      const tenant = session?.tenant?.slug;

      if (token) config.headers.Authorization = `Bearer ${token}`;
      if (tenant) config.headers["X-Tenant"] = tenant;
    }
  } catch (err) {
    console.error("Erro ao ler session:", err);
  }

  return config;
});

// ======================================================
// 🔹 5️⃣ Interceptor para expiração de sessão
// ======================================================
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      try {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } catch {}

      alert("Sessão expirada. Faça login novamente.");
      window.location.href = "/";
    }
    return Promise.reject(error);
  },
);

