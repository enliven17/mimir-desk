import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { draftIssues } from "../server/lib/drafts.js";

export default defineAction({
  description:
    "List the user's claim drafts in the studio, most recently edited first, with whether each is ready to open on Mimir.",
  schema: z.object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe("Max drafts, 1-100; defaults to 50"),
  }),
  outputSchema: z.object({
    drafts: z.array(
      z.object({
        id: z.string(),
        question: z.string(),
        idea: z.string(),
        category: z.string(),
        kind: z.enum(["vs", "pool"]),
        ready: z.boolean(),
        preflightScore: z.number().nullable(),
        updatedAt: z.string(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  link: () => ({
    url: buildDeepLink({ view: "studio", to: "/studio" }),
    label: "Open the studio",
  }),
  run: async ({ limit }, ctx) => {
    if (!ctx?.userEmail) return { drafts: [] };
    const t = schema.claimDrafts;
    const rows = await getDb()
      .select()
      .from(t)
      .where(eq(t.ownerEmail, ctx.userEmail))
      .orderBy(desc(t.updatedAt))
      .limit(limit);
    return {
      drafts: rows.map((d) => {
        let score: number | null = null;
        try {
          score = d.preflight ? (JSON.parse(d.preflight).averageScore ?? null) : null;
        } catch {
          score = null;
        }
        return {
          id: d.id,
          question: d.question,
          idea: d.idea,
          category: d.category,
          kind: d.kind,
          ready: draftIssues(d).length === 0,
          preflightScore: typeof score === "number" ? score : null,
          updatedAt: d.updatedAt,
        };
      }),
    };
  },
});
