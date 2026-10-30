/**
 * Server-side client for the public Mimir API (https://mimirmarkets.xyz by
 * default, MIMIR_API_BASE to override). Read-only except the council
 * preflight, which only scores a draft. Nothing here moves money.
 */
import { fail } from "@agent-native/core/action";

export type MarketKind = "vs" | "pool";
export type MarketState = "live" | "closing" | "settled" | "all";
export type MarketPhase =
  | "open"
  | "awaiting"
  | "proposed"
  | "disputed"
  | "resolved"
  | "cancelled";

export interface PublicMarket {
  id: string;
  kind: MarketKind;
  marketId: number;
  question: string;
  category: string;
  sideA: { label: string; usdc: string };
  sideB: { label: string; usdc: string };
  participants: number;
  creator: string;
  deadline: number;
  phase: MarketPhase;
  winner: number | null;
  summary: string | null;
  resolutionUrl: string;
  url: string;
}

export interface MarketDetail extends PublicMarket {
  positions: { user: string; side: number; usdc: string }[];
  verdict: {
    side: number;
    confidence: number;
    summary: string;
    txHash: string;
  } | null;
}

export interface Persona {
  slug: string;
  displayName: string;
  emoji: string;
  bio: string;
  archetype: string;
  track: string;
  minConfidence: number | null;
  stakeUsdc: number | null;
  usesLlm: boolean;
  prompt: string | null;
}

export interface PreflightOpinion {
  slug: string;
  displayName: string;
  emoji: string;
  decision: "open" | "revise" | "skip";
  score: number;
  confidence: number;
  reasoning: string;
}

export interface PreflightResult {
  opinions: PreflightOpinion[];
  averageScore: number | null;
  openVotes: number;
  reviseVotes: number;
  skipVotes: number;
}

export const MIMIR_SITE = "https://mimirmarkets.xyz";
export const CREATE_URL = `${MIMIR_SITE}/en/arena/create`;

export function apiBase(): string {
  const raw = process.env.MIMIR_API_BASE?.trim() || MIMIR_SITE; // guard:allow-env-credential — public API base URL, not a secret
  return raw.replace(/\/+$/, "");
}

const cache = new Map<string, { at: number; value: unknown }>();
const TTL_MS = 15_000;

async function request<T>(
  path: string,
  init: RequestInit & { cacheable?: boolean } = {},
): Promise<{ status: number; body: T | null }> {
  const url = `${apiBase()}${path}`;
  const key = init.cacheable ? url : "";
  if (key) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      return { status: 200, body: hit.value as T };
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        accept: "application/json",
        "user-agent": "mimir-desk/0.1",
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(init.method === "POST" ? 60_000 : 12_000),
    });
  } catch {
    return fail("Mimir is unreachable right now. Try again in a moment.", {
      errorCode: "mimir_unreachable",
      statusCode: 503,
    });
  }
  if (res.status === 429) {
    return fail("Mimir rate limit reached. Wait a minute and try again.", {
      errorCode: "mimir_rate_limited",
      statusCode: 429,
    });
  }
  const body = (await res.json().catch(() => null)) as T | null;
  if (key && res.ok && body) {
    if (cache.size > 200) cache.clear();
    cache.set(key, { at: Date.now(), value: body });
  }
  return { status: res.status, body };
}

type Envelope<T> = { success?: boolean; data?: T; error?: string };

function unwrap<T>(
  status: number,
  body: Envelope<T> | null,
  what: string,
): T {
  if (status === 404) {
    return fail(`${what} not found on Mimir.`, {
      errorCode: "not_found",
      statusCode: 404,
    });
  }
  if (status >= 400 || !body?.success || !body.data) {
    const reason = body?.error ? `: ${body.error}` : "";
    return fail(`Mimir could not return ${what.toLowerCase()}${reason}.`, {
      errorCode: "mimir_error",
      statusCode: status >= 500 ? 502 : 400,
    });
  }
  return body.data;
}

export async function fetchMarkets(opts: {
  state: MarketState;
  kind?: MarketKind;
  limit: number;
}): Promise<PublicMarket[]> {
  const q = new URLSearchParams({ state: opts.state, limit: String(opts.limit) });
  if (opts.kind) q.set("kind", opts.kind);
  const { status, body } = await request<Envelope<{ markets: PublicMarket[] }>>(
    `/api/markets?${q}`,
    { cacheable: true },
  );
  return unwrap(status, body, "Markets").markets;
}

export async function fetchMarket(
  kind: MarketKind,
  id: number,
): Promise<MarketDetail> {
  const { status, body } = await request<Envelope<{ market: MarketDetail }>>(
    `/api/markets/${kind}/${id}`,
    { cacheable: true },
  );
  return unwrap(status, body, "Market").market;
}

export async function fetchRoster(): Promise<Persona[]> {
  const { status, body } = await request<Envelope<{ personas: Persona[] }>>(
    "/api/council/roster",
    { cacheable: true },
  );
  return unwrap(status, body, "Council roster").personas;
}

export async function postPreflight(input: {
  question: string;
  creatorPosition: string;
  counterPosition: string;
  resolutionUrl: string;
  category: string;
  settlementRule: string;
  deadlineHours: number;
  personas?: string[];
}): Promise<PreflightResult> {
  const { status, body } = await request<Envelope<PreflightResult>>(
    "/api/council/preflight",
    { method: "POST", body: JSON.stringify(input) },
  );
  if (status === 400) {
    return fail(
      body?.error ??
        "Mimir rejected the draft: question, both sides and a resolution URL are required.",
      { errorCode: "invalid_draft", statusCode: 400 },
    );
  }
  return unwrap(status, body, "Council preflight");
}

/**
 * Mimir's own source-to-claim drafter. Off in some deploys (404); returns
 * null then so the agent drafts from the page text instead.
 */
export async function postClaimDraft(url: string): Promise<unknown | null> {
  try {
    const { status, body } = await request<unknown>("/api/claim-draft", {
      method: "POST",
      body: JSON.stringify({ url, locale: "en" }),
    });
    return status === 200 ? body : null;
  } catch {
    return null;
  }
}

/** "pool-39" / "vs-12" → kind and id. */
export function parseMarketRef(
  ref: string,
): { kind: MarketKind; marketId: number } | null {
  const m = /^(vs|pool)-(\d{1,9})$/i.exec(ref.trim());
  if (!m) return null;
  return { kind: (m[1] ?? "").toLowerCase() as MarketKind, marketId: Number(m[2]) };
}

/** Pool share of side A in percent, null when nothing is staked. */
export function shareA(m: Pick<PublicMarket, "sideA" | "sideB">): number | null {
  const a = Number(m.sideA.usdc) || 0;
  const b = Number(m.sideB.usdc) || 0;
  return a + b > 0 ? Math.round((a / (a + b)) * 100) : null;
}

/** Byte limits Mimir enforces on chain. */
export const LIMITS = {
  question: 200,
  side: 100,
  url: 200,
  category: 32,
} as const;

export const CATEGORIES = [
  "sports",
  "weather",
  "crypto",
  "culture",
  "custom",
] as const;

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
