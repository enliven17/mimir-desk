import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { takeSchema } from "../server/lib/market-schemas.js";

export default defineAction({
  description:
    "List the council takes the user has gathered, newest first, plus a per-market split (how many personas lean A, B or pass, and their average confidence). Filter by one market or by category to answer questions like 'where is the council split on sports?'.",
  schema: z.object({
    marketRef: z
      .string()
      .optional()
      .describe('Only this market, e.g. "pool-39"; omit for all'),
    category: z
      .string()
      .optional()
      .describe("Only markets in this category (sports, weather, crypto, culture, custom)"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(500)
      .default(200)
      .describe("Max takes to return, 1-500; defaults to 200"),
  }),
  outputSchema: z.object({
    takes: z.array(takeSchema),
    splits: z.array(
      z.object({
        marketRef: z.string(),
        question: z.string(),
        category: z.string(),
        leanA: z.number(),
        leanB: z.number(),
        pass: z.number(),
        avgConfidence: z.number().nullable(),
        split: z.enum(["agree", "split", "none"]),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args, ctx) => {
    if (!ctx?.userEmail) return { takes: [], splits: [] };
    const t = schema.councilTakes;
    const where: SQL[] = [eq(t.ownerEmail, ctx.userEmail)];
    if (args.marketRef) where.push(eq(t.marketRef, args.marketRef.trim().toLowerCase()));
    if (args.category) where.push(eq(t.marketCategory, args.category.trim().toLowerCase()));
    const rows = await getDb()
      .select({
        id: t.id,
        marketRef: t.marketRef,
        marketQuestion: t.marketQuestion,
        marketCategory: t.marketCategory,
        personaSlug: t.personaSlug,
        personaName: t.personaName,
        personaEmoji: t.personaEmoji,
        lean: t.lean,
        confidence: t.confidence,
        reasoning: t.reasoning,
        createdAt: t.createdAt,
      })
      .from(t)
      .where(and(...where))
      .orderBy(desc(t.createdAt))
      .limit(args.limit);

    const byMarket = new Map<string, typeof rows>();
    for (const r of rows) {
      byMarket.set(r.marketRef, [...(byMarket.get(r.marketRef) ?? []), r]);
    }
    const splits = [...byMarket.entries()].map(([marketRef, list]) => {
      const first = list[0];
      const leanA = list.filter((r) => r.lean === "A").length;
      const leanB = list.filter((r) => r.lean === "B").length;
      const voting = list.filter((r) => r.lean !== "pass");
      return {
        marketRef,
        question: first?.marketQuestion ?? "",
        category: first?.marketCategory ?? "",
        leanA,
        leanB,
        pass: list.length - leanA - leanB,
        avgConfidence: voting.length
          ? Math.round(voting.reduce((s, r) => s + r.confidence, 0) / voting.length)
          : null,
        split:
          leanA && leanB
            ? ("split" as const)
            : leanA || leanB
              ? ("agree" as const)
              : ("none" as const),
      };
    });
    return { takes: rows, splits };
  },
});
