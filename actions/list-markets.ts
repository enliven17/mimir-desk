import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { marketSchema } from "../server/lib/market-schemas.js";
import { fetchMarkets, shareA } from "../server/lib/mimir.js";

export default defineAction({
  description:
    "List Mimir prediction markets (Arc mainnet, USDC) with pool sizes, deadlines, phase and how many council takes the user has saved for each. Filter by state, kind, category or a text query.",
  schema: z.object({
    state: z
      .enum(["live", "closing", "settled", "all"])
      .default("live")
      .describe(
        'Market state: "live" (taking stakes), "closing" (live, under 24h left, soonest first), "settled" (resolved or refunded) or "all". Defaults to "live".',
      ),
    kind: z
      .enum(["vs", "pool"])
      .optional()
      .describe('"vs" (creator vs challengers) or "pool" (two open sides); omit for both'),
    category: z
      .string()
      .optional()
      .describe("Category filter, e.g. sports, crypto, stocks, weather, culture, custom; omit for all"),
    query: z
      .string()
      .optional()
      .describe("Case-insensitive text match on the question and side labels"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(200)
      .default(60)
      .describe("Max markets to return, 1-200; defaults to 60"),
  }),
  outputSchema: z.object({
    markets: z.array(marketSchema),
    total: z.number(),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "board", to: "/board" }),
    label: "Open the board",
  }),
  run: async (args, ctx) => {
    const raw = await fetchMarkets({
      state: args.state,
      ...(args.kind ? { kind: args.kind } : {}),
      limit: 200,
    });
    const q = args.query?.trim().toLowerCase();
    const cat = args.category?.trim().toLowerCase();
    const filtered = raw.filter(
      (m) =>
        (!cat || m.category.toLowerCase() === cat) &&
        (!q ||
          `${m.question} ${m.sideA.label} ${m.sideB.label}`
            .toLowerCase()
            .includes(q)),
    );

    const takeCounts = new Map<string, number>();
    if (ctx?.userEmail) {
      const t = schema.councilTakes;
      const rows = await getDb()
        .select({ marketRef: t.marketRef, n: count() })
        .from(t)
        .where(and(eq(t.ownerEmail, ctx.userEmail)))
        .groupBy(t.marketRef)
        .limit(1000);
      for (const r of rows) takeCounts.set(r.marketRef, Number(r.n));
    }

    const markets = filtered.slice(0, args.limit).map((m) => ({
      ...m,
      poolUsdc:
        Math.round(
          ((Number(m.sideA.usdc) || 0) + (Number(m.sideB.usdc) || 0)) * 1e6,
        ) / 1e6,
      shareA: shareA(m),
      takes: takeCounts.get(m.id) ?? 0,
    }));
    return { markets, total: filtered.length };
  },
});
