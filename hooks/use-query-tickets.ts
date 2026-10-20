import { useQuery, keepPreviousData } from "@tanstack/react-query";

import { TicketListItem, TicketDetail } from "@/types/tickets";
import { queryKeys } from "@/lib/query/keys";
import { fetchJson } from "@/lib/query/fetcher";

interface TicketFilters {
  search: string;
  status: string;
  agencyId?: string;
}

export const useTicketsQuery = (filters: TicketFilters) => {
  return useQuery({
    queryKey: queryKeys.tickets(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.agencyId) params.set("agencyId", filters.agencyId);
      const url = `/api/tickets${params.toString() ? `?${params}` : ""}`;
      return fetchJson<TicketListItem[]>(url);
    },
    // Smooth search/status switches — keep showing the previous list until the
    // next one resolves instead of flashing the skeleton.
    placeholderData: keepPreviousData,
  });
};

export const useTicketDetailQuery = (ticketId: string) => {
  return useQuery({
    queryKey: queryKeys.ticket(ticketId),
    queryFn: () => fetchJson<TicketDetail>(`/api/tickets/${ticketId}`),
    enabled: !!ticketId,
  });
};
