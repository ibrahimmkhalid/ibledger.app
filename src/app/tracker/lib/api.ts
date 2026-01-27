export type ApiError = { error: string };

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await res.json()) as T | ApiError;
  if (!res.ok) {
    throw new Error((data as ApiError)?.error ?? `HTTP ${res.status}`);
  }

  return data as T;
}
