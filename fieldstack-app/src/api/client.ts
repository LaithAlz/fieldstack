/**
 * Typed fetch wrapper for the FieldStack API.
 *
 * `get<T>` is the standard call — it expects the backend's `{ data, error }`
 * envelope, unwraps `data` on success, and converts any backend error / network
 * failure / non-2xx / parse error into a single `Error` instance.
 *
 * `request<T>` is the lower-level escape hatch for routes that return more
 * than `{ data, error }` (e.g. /search/fields adds `total`). It returns the
 * parsed body untouched so the caller can pull whatever extra fields it needs.
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  // Fail loud at import time — a missing API URL is a config error, not a
  // runtime condition we should defer.
  throw new Error("EXPO_PUBLIC_API_URL is not set in .env");
}

const TIMEOUT_MS = 10_000;

export type ApiResult<T> = {
  data: T | null;
  error: Error | null;
};

type QueryParams = Record<string, string | number | string[]>;

type BackendEnvelope<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(path, BASE_URL);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      // Arrays sent comma-joined ("?surface=turf,grass") — matches the
      // backend's surfaceList/sizeList Zod transforms in src/routes/search.ts.
      url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
  }
  return url.toString();
}

function extractErrorMessage(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error: unknown }).error;
    if (
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
    ) {
      return (err as { message: string }).message;
    }
  }
  return null;
}

/**
 * Fetch + parse JSON with a 10s timeout. Returns the raw parsed body, or an
 * Error explaining what went wrong (network / timeout / non-2xx / bad JSON).
 */
export async function request<TBody>(
  path: string,
  params?: QueryParams
): Promise<{ body: TBody | null; error: Error | null }> {
  const url = buildUrl(path, params);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    let body: unknown = null;
    try {
      // Empty/204 bodies will throw — that's fine, body stays null.
      body = await response.json();
    } catch {
      if (response.ok) {
        return { body: null, error: new Error("Invalid JSON in response") };
      }
      // For non-OK responses, fall through with no body so we report the status.
    }

    if (!response.ok) {
      const message = extractErrorMessage(body) ?? `HTTP ${response.status}`;
      return { body: null, error: new Error(message) };
    }

    return { body: body as TBody, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return { body: null, error: new Error("Request timed out") };
      }
      return { body: null, error: err };
    }
    return { body: null, error: new Error("Network error") };
  }
}

export async function get<T>(
  path: string,
  params?: QueryParams
): Promise<ApiResult<T>> {
  const { body, error } = await request<BackendEnvelope<T>>(path, params);
  if (error) return { data: null, error };
  if (!body) return { data: null, error: new Error("Empty response body") };
  if (body.error) return { data: null, error: new Error(body.error.message) };
  return { data: body.data, error: null };
}
