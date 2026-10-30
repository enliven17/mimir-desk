import { defineAction, NoWriteError } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser, written } from "../server/lib/drafts.js";
import { takeSchema } from "../server/lib/market-schemas.js";
import {
  fetchMarket,
  fetchRoster,
  parseMarketRef,
} from "../server/lib/mimir.js";

export default defineAction({
  description:
    "Save one council persona's take on a Mimir market (replaces that persona's earlier take on it). Write the take in the persona's voice from its prompt (list-personas includePrompt=true) and the market from get-market; never invent facts. lean: A, B or pass.",
  schema: z.object({
    marketRef: z
      .string()
      .describe('Market reference "<kind>-<id>", e.g. "pool-39" or "vs-12"'),
    personaSlug: z.string().describe('Persona slug from list-personas, e.g. "socrates"'),
    lean: z
      .enum(["A", "B", "pass"])
      .describe('"A" leans side A, "B" leans side B, "pass" abstains (rare: only when the persona would refuse to forecast)'),
    confidence: z.coerce
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Confidence in the lean, 0-100"),
    reasoning: z
      .string()
      .min(10)
      .max(900)
      .describe("The persona's take in character, at most ~90 words"),
  }),
  outputSchema: takeSchema,
  link: ({ args }) => {
    const ref = parseMarketRef(args.marketRef);
    return {
      url: buildDeepLink({
        view: "market",
        to: ref ? `/market/${ref.kind}/${ref.marketId}` : "/board",
      }),
      label: "Open market",
    };
  },
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const ref = parseMarketRef(args.marketRef);
    if (!ref) {
      throw new NoWriteError('marketRef must look like "pool-39" or "vs-12".', {
        errorCode: "invalid_market_ref",
      });
    }
    const [market, roster] = await Promise.all([
      fetchMarket(ref.kind, ref.marketId),
      fetchRoster(),
    ]);
    const persona = roster.find((p) => p.slug === args.personaSlug.trim().toLowerCase());
    if (!persona) {
      throw new NoWriteError(`Unknown persona "${args.personaSlug}".`, {
        errorCode: "unknown_persona",
      });
    }
    const t = schema.councilTakes;
    const row = {
      id: crypto.randomUUID(),
      marketRef: market.id,
      marketQuestion: market.question,
      marketCategory: market.category,
      personaSlug: persona.slug,
      personaName: persona.displayName,
      personaEmoji: persona.emoji,
      lean: args.lean,
      confidence: args.confidence,
      reasoning: args.reasoning.trim(),
      ownerEmail,
      orgId: ctx?.orgId ?? null,
      createdAt: new Date().toISOString(),
    };
    const [row0] = await getDb()
      .insert(t)
      .values(row)
      .onConflictDoUpdate({
        target: [t.ownerEmail, t.marketRef, t.personaSlug],
        set: {
          lean: row.lean,
          confidence: row.confidence,
          reasoning: row.reasoning,
          marketQuestion: row.marketQuestion,
          marketCategory: row.marketCategory,
          createdAt: row.createdAt,
        },
      })
      .returning();
    const saved = written(row0);
    return {
      id: saved.id,
      marketRef: saved.marketRef,
      marketQuestion: saved.marketQuestion,
      marketCategory: saved.marketCategory,
      personaSlug: saved.personaSlug,
      personaName: saved.personaName,
      personaEmoji: saved.personaEmoji,
      lean: saved.lean,
      confidence: saved.confidence,
      reasoning: saved.reasoning,
      createdAt: saved.createdAt,
    };
  },
});
