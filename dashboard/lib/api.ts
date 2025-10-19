export interface ApiKey {
  id: string;
  user_id?: string | null;
  name: string | null;
  plan: string;
  rate_limit_override: number | null;
  block_range_override: number | null;
  created_at: string;
  revoked_at: string | null;
}

export async function apiFetch<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_AUTH_API ?? 'http://localhost:8080';
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error(`API error ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return await response.json();
}
