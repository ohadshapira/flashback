export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

/** fetch wrapper: same-origin cookies, JSON in/out, errors normalized to {status, code}. */
export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET'),
      headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      credentials: 'same-origin',
      cache: 'no-store',
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiClientError(0, 'network');
  }
  if (!res.ok) {
    let code = 'generic';
    try {
      const j = (await res.json()) as { error?: { code?: string }; errors?: { code?: string }[] };
      code = j.error?.code ?? j.errors?.[0]?.code ?? 'generic'; // upload route reports per-file codes in `errors`
    } catch {
      /* not JSON */
    }
    throw new ApiClientError(res.status, code);
  }
  return (await res.json()) as T;
}

/** sessionStorage helpers that never throw (private mode, quota, SSR). */
export const safeStore = {
  get<T>(key: string): T | null {
    try {
      const raw = window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
  del(key: string) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
