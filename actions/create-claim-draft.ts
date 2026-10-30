import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { draftFields } from "../server/lib/draft-input.js";
import {
  draftSchema,
  normalizeDeadline,
  requireUser,
  toDraftDto,
  written,
} from "../server/lib/drafts.js";

export default defineAction({
  description:
    "Start a new claim draft in the studio from an idea and/or source URL, optionally with any fields already filled. Then fill the rest with update-claim-draft and check it with run-preflight.",
  schema: z.object(draftFields),
  outputSchema: draftSchema,
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  link: ({ result }) => ({
    url: buildDeepLink({
      view: "studio",
      to: `/studio/${encodeURIComponent(result.id)}`,
      params: { draftId: result.id },
    }),
    label: "Open draft",
  }),
  run: async (args, ctx) => {
    const ownerEmail = requireUser(ctx);
    const now = new Date().toISOString();
    const row = {
      id: crypto.randomUUID(),
      idea: args.idea?.trim() ?? "",
      sourceUrl: args.sourceUrl?.trim() || null,
      kind: args.kind ?? ("vs" as const),
      question: args.question?.trim() ?? "",
      sideA: args.sideA?.trim() || "Yes",
      sideB: args.sideB?.trim() || "No",
      category: args.category ?? "custom",
      deadline: args.deadline ? normalizeDeadline(args.deadline) : null,
      resolutionUrl: args.resolutionUrl?.trim() ?? "",
      settlementRule: args.settlementRule?.trim() ?? "",
      preflight: null,
      preflightAt: null,
      preflightFingerprint: null,
      ownerEmail,
      orgId: ctx?.orgId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const [saved] = await getDb().insert(schema.claimDrafts).values(row).returning();
    return toDraftDto(written(saved));
  },
});
