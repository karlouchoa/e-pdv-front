'use client';

import { SessionProvider } from "@/modules/core/providers/SessionProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
