// Plain JSON fetch helper for internal API routes.
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return (await res.json()) as T;
}
