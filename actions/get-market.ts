import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { marketSchema } from "../server/lib/market-schemas.js";
import { fetchMarket, shareA } from "../server/lib/mimir.js";

export default defineAction({
  description:
    "Get one Mimir market with every position (wallet, side 1=A/2=B, USDC) and the AI oracle verdict once settled (side, confidence, summary, tx hash). winner: 1 side A, 2 side B, 3 draw, 4 refund.",
  schema: z.object({
    kind: z.enum(["vs", "pool"]).describe('Market kind: "vs" or "pool"'),
    id: z.coerce
      .number()
      .int()
      .min(0)
      .describe('Numeric market id, e.g. 39 for "pool-39"'),
  }),
  outputSchema: z.object({
    market: marketSchema.omit({ takes: true }).extend({
      positions: z.array(
        z.object({ user: z.string(), side: z.number(), usdc: z.string() }),
      ),
      verdict: z
        .object({
          side: z.number(),
          confidence: z.number(),
          summary: z.string(),
          txHash: z.string(),
        })
        .nullable(),
    }),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "market",
      to: `/market/${args.kind}/${args.id}`,
      params: { kind: args.kind, marketId: String(args.id) },
    }),
    label: `Open ${args.kind}-${args.id}`,
  }),
  run: async ({ kind, id }) => {
    const m = await fetchMarket(kind, id);
    return {
      market: {
        ...m,
        positions: m.positions ?? [],
        verdict: m.verdict ?? null,
        poolUsdc:
          Math.round(
            ((Number(m.sideA.usdc) || 0) + (Number(m.sideB.usdc) || 0)) * 1e6,
          ) / 1e6,
        shareA: shareA(m),
      },
    };
  },
});
