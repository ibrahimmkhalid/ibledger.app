export type ApiError = { error: string };

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  // Error responses from proxies or crashes may be empty or HTML; a parse
  // failure must not preempt the friendly error below with a SyntaxError.
  const data = (await res.json().catch(() => null)) as T | ApiError | null;
  if (!res.ok) {
    // Only surface the server's message when it is an actual non-empty string;
    // error bodies from proxies can carry "" or non-string shapes here.
    const message = (data as ApiError | null)?.error;
    throw new Error(
      typeof message === "string" && message !== ""
        ? message
        : "Something went wrong. Please try again.",
    );
  }

  if (data === null) {
    throw new Error("Something went wrong. Please try again.");
  }

  return data as T;
}
