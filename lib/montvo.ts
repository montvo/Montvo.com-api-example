import "server-only";

/*
 * The Montvo API, from your server.
 *
 * "server-only" makes the build fail if a Client Component ever imports this
 * file. That is the point: this file reads your secret key, and a secret key
 * that reaches a browser is a key anybody can read.
 */

const API_BASE = process.env.MONTVO_API_BASE ?? "https://montvo.com/api/v1";

/** What GET /unlocks/:token and POST /unlocks/:token/claim answer with. */
export type Unlock = {
  token: string;
  /** Always true: a token only exists for a visit that reached your destination. */
  completed: true;
  /** Whether an advertiser paid for the visit. A reward should depend on this. */
  billable: boolean;
  claimed: boolean;
  claimed_at: string | null;
  /** Your own reference, exactly as it was on the link (?sub=…). */
  sub: string;
  slug: string;
  short_url: string;
  url: string;
  country: string;
  device: string;
  completed_at: string;
};

/** What GET /unlocks?sub=… answers with: every completion under that reference, newest first. */
export type UnlockList = {
  sub: string;
  /** Somebody finished under this reference. */
  completed: boolean;
  /** At least one of those completions was paid for. */
  billable: boolean;
  data: Unlock[];
};

export type Me = {
  id: string;
  username: string | null;
  key: { kind: "secret" | "site"; rate_limit_per_minute: number };
};

export type MontvoResult<T> =
  | { ok: true; data: T }
  /** The API answered with its JSON error shape: { error: { code, message } }. */
  | { ok: false; kind: "api"; status: number; code: string; message: string }
  /**
   * Something in front of the API answered instead of the API, e.g. CDN
   * bot protection returning an HTML challenge page. The API itself always
   * answers JSON, so a non-JSON answer never came from it. Keep the cf-ray:
   * it is how Montvo support finds the request.
   */
  | { ok: false; kind: "blocked"; status: number; ray: string | null }
  /** The request never got an answer: DNS, TLS, or a timeout. */
  | { ok: false; kind: "network"; message: string };

async function call<T>(path: string, init: RequestInit = {}): Promise<MontvoResult<T>> {
  const key = process.env.MONTVO_SECRET_KEY;
  if (!key) throw new Error("MONTVO_SECRET_KEY is not set. Copy .env.example to .env.local and fill it in.");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, ...init.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { ok: false, kind: "network", message: error instanceof Error ? error.message : String(error) };
  }

  if (!res.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, kind: "blocked", status: res.status, ray: res.headers.get("cf-ray") };
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return {
      ok: false,
      kind: "api",
      status: res.status,
      code: body?.error?.code ?? "unknown",
      message: body?.error?.message ?? res.statusText,
    };
  }
  return { ok: true, data: body as T };
}

/** Completions under one reference (your ticket). Idempotent: call it as often as you like. */
export const listUnlocks = (sub: string) => call<UnlockList>(`/unlocks?sub=${encodeURIComponent(sub)}&limit=10`);

/** Read one completion by the montvo_token it was delivered with. Idempotent. */
export const getUnlock = (token: string) => call<Unlock>(`/unlocks/${encodeURIComponent(token)}`);

/** Mark a completion claimed. Succeeds exactly once per token; every later call answers 409. */
export const claimUnlock = (token: string) => call<Unlock>(`/unlocks/${encodeURIComponent(token)}/claim`, { method: "POST" });

/** Who the key belongs to. The quickest check that your server can reach the API at all. */
export const whoAmI = () => call<Me>("/me");

/** One line for your logs, whatever went wrong. */
export function describeFailure(result: Exclude<MontvoResult<unknown>, { ok: true }>): string {
  switch (result.kind) {
    case "blocked":
      return `Blocked before reaching the Montvo API (HTTP ${result.status}, non-JSON answer${result.ray ? `, cf-ray ${result.ray}` : ""}). Send the cf-ray to Montvo support.`;
    case "network":
      return `Could not reach the Montvo API: ${result.message}`;
    case "api":
      if (result.status === 401) return "The API refused the key. Check MONTVO_SECRET_KEY: it must be the secret key (sk_live_…), not the site key.";
      if (result.status === 429) return "Rate limited (600 calls a minute per secret key). Wait a moment and try again.";
      return `Montvo API ${result.status} ${result.code}: ${result.message}`;
  }
}
