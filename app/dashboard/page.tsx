import DashboardView from "@/components/dashboard/DashboardView";
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { prefetchQueries, HydrateClient } from "@/lib/query/hydrate";
import { queryKeys } from "@/lib/query/keys";
import { getTickets } from "@/lib/data/ticket";
import { getTicketScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Same scope + key the TicketList reads, so the dashboard paints from
  // hydrated data and derives every metric client-side from the one list.
  const scope = await getTicketScope();
  const client = await prefetchQueries([
    { queryKey: queryKeys.tickets(), queryFn: () => getTickets(scope, {}) },
  ]);

  return (
    <HydrateClient client={client}>
      <PageContainer>
        <PageHeader
          eyebrow="Overview"
          title={
            <>
              Your workspace, <span className="italic text-brand">at a glance.</span>
            </>
          }
          description="Live counts, throughput and pipeline health across every ticket your team has touched. Numbers update as tickets are uploaded, confirmed and dispatched."
        />
        <div className="mt-8">
          <DashboardView />
        </div>
      </PageContainer>
    </HydrateClient>
  );
}
