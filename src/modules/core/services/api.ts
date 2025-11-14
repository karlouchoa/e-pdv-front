import axios from "axios";
import { SESSION_STORAGE_KEY } from "@/modules/core/constants/storage";

// Monta URL base simples (sem tenant ainda)
const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// Axios instance global
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: Number(process.env.NEXT_PUBLIC_API_TIMEOUT ?? 15000),
});

api.interceptors.request.use((config) => {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);

    if (raw) {
      const session = JSON.parse(raw);

      const token = session?.token;               // 🔥 JWT real
      const tenant = session?.tenant?.slug;       // 🔥 tenant real

      if (token) config.headers.Authorization = `Bearer ${token}`;
      if (tenant) config.headers["X-Tenant"] = tenant;
    }
  } catch (err) {
    console.error("Erro ao ler session do localStorage:", err);
  }

  return config;
});

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


