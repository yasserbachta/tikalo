"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query/client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // getQueryClient() returns the browser singleton on the client, so we don't
  // need useState — the same cache is reused across renders, and it matches the
  // client used by server-side prefetch/hydration.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
