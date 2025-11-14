'use client';

import { useSessionContext } from "@/modules/core/providers/SessionProvider";

export function useSession() {
  return useSessionContext();
}
