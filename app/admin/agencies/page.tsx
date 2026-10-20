import { AgenciesView } from "@/components/admin/AgenciesView";
import { prefetchQueries, HydrateClient } from "@/lib/query/hydrate";
import { queryKeys } from "@/lib/query/keys";
import { getAgencies } from "@/lib/data/agency";

export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  // Server-side prefetch: calls lib/data directly (no HTTP), warming the cache
  // under the same key the client useQuery reads — first paint has data.
  const client = await prefetchQueries([
    { queryKey: queryKeys.agencies(), queryFn: getAgencies },
  ]);

  return (
    <HydrateClient client={client}>
      <AgenciesView />
    </HydrateClient>
  );
}
