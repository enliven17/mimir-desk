import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { draftFields } from "../server/lib/draft-input.js";
import {
  draftSchema,
  loadOwnDraft,
  normalizeDeadline,
  requireUser,
  toDraftDto,
  written,
} from "../server/lib/drafts.js";

export default defineAction({
  description:
    "Patch a claim draft: pass only the fields to change. The studio form shows the change at once. Returns the draft with its remaining issues; the last preflight is flagged stale when council-read fields change.",
  schema: z.object({
    id: z.string().describe("Draft id"),
    ...draftFields,
  }),
  outputSchema: draftSchema,
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
    idempotentHint: true,
  },
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "studio",
      to: `/studio/${encodeURIComponent(args.id)}`,
      params: { draftId: args.id },
    }),
    label: "Open draft",
  }),
  run: async ({ id, ...patch }, ctx) => {
    const ownerEmail = requireUser(ctx);
    await loadOwnDraft(id, ownerEmail);
    const set: Partial<typeof schema.claimDrafts.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (patch.idea !== undefined) set.idea = patch.idea.trim();
    if (patch.sourceUrl !== undefined) set.sourceUrl = patch.sourceUrl.trim() || null;
    if (patch.kind !== undefined) set.kind = patch.kind;
    if (patch.question !== undefined) set.question = patch.question.trim();
    if (patch.sideA !== undefined) set.sideA = patch.sideA.trim();
    if (patch.sideB !== undefined) set.sideB = patch.sideB.trim();
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.deadline !== undefined) set.deadline = normalizeDeadline(patch.deadline);
    if (patch.resolutionUrl !== undefined) set.resolutionUrl = patch.resolutionUrl.trim();
    if (patch.settlementRule !== undefined) set.settlementRule = patch.settlementRule.trim();
    const t = schema.claimDrafts;
    const [saved] = await getDb()
      .update(t)
      .set(set)
      .where(and(eq(t.id, id), eq(t.ownerEmail, ownerEmail)))
      .returning();
    return toDraftDto(written(saved));
  },
});
