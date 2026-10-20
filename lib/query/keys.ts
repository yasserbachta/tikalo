// Central query-key registry. Every useQuery and every server-side
// prefetchQuery must reference a key from here so the hydrated cache and the
// client query line up exactly (matching keys, differing queryFns — server
// calls lib/data directly, client fetches the route handler).
//
// Filters are normalized so an "empty" filter produces the same key whether
// you pass {} or { search: "", status: "" }. This keeps the server prefetch
// (which knows no client filter state) aligned with the hook's initial render.
function normalizeTicketFilters(filters: {
  search?: string;
  status?: string;
  agencyId?: string;
}) {
  const norm: { search?: string; status?: string; agencyId?: string } = {};
  if (filters.search) norm.search = filters.search;
  if (filters.status) norm.status = filters.status;
  if (filters.agencyId) norm.agencyId = filters.agencyId;
  return norm;
}

export const queryKeys = {
  tickets: (
    filters: { search?: string; status?: string; agencyId?: string } = {},
  ) => ["tickets", normalizeTicketFilters(filters)] as const,
  ticket: (id: string) => ["ticket", id] as const,
  // Own root (not under ["ticket", id]) so invalidating the ticket after a
  // save/export never re-runs the span read (OCR on scanned PDFs).
  ticketTextSpans: (id: string, versionId: string) =>
    ["ticket-text-spans", id, versionId] as const,
  agencies: () => ["admin-agencies"] as const,
  agency: (id: string) => ["admin-agency", id] as const,
} as const;
