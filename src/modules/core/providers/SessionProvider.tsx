'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  LoginPayload,
  SessionData,
  TenantInfo,
} from "@/modules/core/types";
import { authenticate } from "@/modules/auth/services/authService";
import { SESSION_STORAGE_KEY } from "@/modules/core/constants/storage";
import { redirectToTenantDomain } from "@/modules/core/utils/tenant";

interface SessionContextValue {
  session: SessionData | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<SessionData>;
  logout: () => void;
  updateTenant: (data: Partial<TenantInfo>) => void;
  updateWarehouse: (warehouse: string | null, label?: string | null) => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

const isSessionValid = (value: SessionData | null) =>
  Boolean(
    value?.token &&
      value?.tenant?.slug &&
      value?.tenant?.name &&
      value?.user?.email,
  );

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const saved = globalThis?.localStorage?.getItem(SESSION_STORAGE_KEY);
    if (saved && mounted) {
      try {
        const parsed = JSON.parse(saved) as SessionData;
        if (isSessionValid(parsed)) {
          setSession(parsed);
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
    setIsLoading(false);
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!session?.tenant) {
      return;
    }
    redirectToTenantDomain(session.tenant);
  }, [session]);

  const persistSession = useCallback((value: SessionData | null) => {
    setSession(value);
    if (!value) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  }, []);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const response = await authenticate(payload);
      persistSession(response);
      return response;
    },
    [persistSession],
  );

  const logout = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  const updateTenant = useCallback(
    (data: Partial<TenantInfo>) => {
      if (!session) return;
      const updated = {
        ...session,
        tenant: { ...session.tenant, ...data },
      };
      persistSession(updated);
    },
    [persistSession, session],
  );

  const updateWarehouse = useCallback(
    (warehouse: string | null, label?: string | null) => {
      if (!session) return;

      const normalizedWarehouseValue =
        warehouse === null || warehouse === undefined
          ? ""
          : String(warehouse).trim();
      const normalizedLabelValue =
        label === undefined
          ? String(session.warehouseLabel ?? "").trim()
          : String(label ?? "").trim();

      const updated: SessionData = {
        ...session,
        warehouse: normalizedWarehouseValue || null,
        warehouseLabel: normalizedLabelValue || null,
      };
      persistSession(updated);
    },
    [persistSession, session],
  );

  const value = useMemo(
    () => ({
      session,
      isLoading,
      login,
      logout,
      updateTenant,
      updateWarehouse,
    }),
    [session, isLoading, login, logout, updateTenant, updateWarehouse],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSessionContext deve ser usado dentro do SessionProvider");
  }
  return context;
}
