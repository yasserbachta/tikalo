import {
  dehydrate,
  HydrationBoundary,
  type FetchQueryOptions,
} from "@tanstack/react-query";

import { getQueryClient } from "@/lib/query/client";

// Server-side prefetch + hydration for initial-paint-critical pages. Use it in a
// Server Component to warm the cache so the matching client `useQuery` paints
// from hydrated data instead of a skeleton on first load.
//
// IMPORTANT: the server prefetch queryFn calls the lib/data/* function DIRECTLY
// (no HTTP round-trip to our own route handler). The client useQuery for the
// SAME key fetches the route handler. Keys match, queryFns differ — that is the
// intended pattern.
//
//   const client = await prefetchQueries([
//     { queryKey: queryKeys.tickets(), queryFn: () => getTickets(scope, {}) },
//   ]);
//   return <HydrateClient client={client}><TicketList /></HydrateClient>;

export async function prefetchQueries(
  queries: FetchQueryOptions[],
) {
  const queryClient = getQueryClient();
  await Promise.all(queries.map((q) => queryClient.prefetchQuery(q)));
  return queryClient;
}

export function HydrateClient({
  client,
  children,
}: {
  client: ReturnType<typeof getQueryClient>;
  children: React.ReactNode;
}) {
  return (
    <HydrationBoundary state={dehydrate(client)}>{children}</HydrationBoundary>
  );
}
