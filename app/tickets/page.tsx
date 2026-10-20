import TicketList from "@/components/tickets/TicketList";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { prefetchQueries, HydrateClient } from "@/lib/query/hydrate";
import { queryKeys } from "@/lib/query/keys";
import { getTickets } from "@/lib/data/ticket";
import { getAgencies } from "@/lib/data/agency";
import { getTicketScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function TicketsPage() {
  // Resolve the tenancy scope from the session and prefetch the (unfiltered)
  // list directly via lib/data — the same key TicketList's useQuery reads, so it
  // paints from hydrated data instead of a skeleton.
  const scope = await getTicketScope();
  const client = await prefetchQueries([
    { queryKey: queryKeys.tickets(), queryFn: () => getTickets(scope, {}) },
  ]);

  // Super-admin sees tickets across every tenant — give them the agency list so
  // they can add an Agency column + filter. Agency users never see this.
  const agencies = scope.isSuperAdmin
    ? (await getAgencies()).map((a) => ({ id: a.id, name: a.name }))
    : [];

  return (
    <HydrateClient client={client}>
      <PageContainer>
        <PageHeader
          eyebrow="Workspace"
          title={
            <>
              Tickets, <span className="italic text-brand">all in one place.</span>
            </>
          }
          description="Every ticket your team has touched — drafted, confirmed, or dispatched. Open one to refine, or upload a fresh PDF to get started."
        />
        <div className="mt-8">
          <TicketList isSuperAdmin={scope.isSuperAdmin} agencies={agencies} />
        </div>
      </PageContainer>
    </HydrateClient>
  );
}
