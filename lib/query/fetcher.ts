// Typed JSON fetcher for client-side useQuery queryFns. Throws on a non-2xx
// response so TanStack flips to `isError` (route handlers answer 401/403 for the
// tenancy guard, which must surface as an error — not silently empty data).
export class FetchError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "FetchError";
  }
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    // Try to read a { error } body; fall back to the status text.
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // non-JSON body — keep statusText
    }
    throw new FetchError(res.status, message);
  }
  return (await res.json()) as T;
}
