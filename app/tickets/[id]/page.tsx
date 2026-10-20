import { TicketDetailView } from "@/components/tickets/TicketDetailView";
import { prefetchQueries, HydrateClient } from "@/lib/query/hydrate";
import { queryKeys } from "@/lib/query/keys";
import { getTicketById } from "@/lib/data/ticket";
import { getTicketScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scope = await getTicketScope();
  const client = await prefetchQueries([
    { queryKey: queryKeys.ticket(id), queryFn: () => getTicketById(id, scope) },
  ]);

  return (
    <HydrateClient client={client}>
      <TicketDetailView ticketId={id} />
    </HydrateClient>
  );
}
