import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";

// Single QueryClient factory shared by the client provider
// (providers/query-provider.tsx) and the server-side prefetch helper
// (lib/query/hydrate.tsx). Defaults:
// - staleTime 60s so a freshly-navigated page doesn't immediately refetch;
// - retry once (a flaky read gets one more shot, a real 401/403/500 fails fast);
// - no refetch-on-focus (back-office; manual invalidation drives freshness).
// Pending queries are also dehydrated so streamed/prefetched-but-unresolved
// queries hydrate on the client.
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

// On the server, always a fresh client (never share across requests). In the
// browser, a singleton so React Suspense / re-renders reuse the same cache.
export function getQueryClient() {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
