import { defineAction, NoWriteError } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  draftSchema,
  fingerprint,
  loadOwnDraft,
  requireUser,
  toDraftDto,
  written,
} from "../server/lib/drafts.js";
import { postPreflight } from "../server/lib/mimir.js";

export default defineAction({
  description:
    "Ask Mimir's council to vet a draft before it opens: up to 5 personas each say open / revise / skip with a 0-100 score and one-line reason. Saves the result on the draft. Needs question, both sides and a resolution URL. Takes 10-30 s.",
  schema: z.object({
    id: z.string().describe("Draft id"),
    personas: z
      .string()
      .optional()
      .describe('Comma-separated persona slugs, max 5, e.g. "socrates,statistician,taleb"; omit for Mimir\'s default panel (socrates, aurelius, statistician)'),
  }),
  outputSchema: draftSchema,
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  },
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "studio",
      to: `/studio/${encodeURIComponent(args.id)}`,
      params: { draftId: args.id },
    }),
    label: "Open draft",
  }),
  run: async ({ id, personas }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const d = await loadOwnDraft(id, ownerEmail);
    const missing = [
      !d.question.trim() && "question",
      !d.sideA.trim() && "side A",
      !d.sideB.trim() && "side B",
      !d.resolutionUrl.trim() && "resolution URL",
    ].filter(Boolean);
    if (missing.length) {
      throw new NoWriteError(`Fill in ${missing.join(", ")} before asking the council.`, {
        errorCode: "draft_incomplete",
        statusCode: 400,
      });
    }
    const slugs = personas
      ?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 5);
    const hours = d.deadline
      ? Math.max(0, Math.round((Date.parse(d.deadline) - Date.now()) / 3_600_000))
      : 0;
    const result = await postPreflight({
      question: d.question,
      creatorPosition: d.sideA,
      counterPosition: d.sideB,
      resolutionUrl: d.resolutionUrl,
      category: d.category,
      settlementRule: d.settlementRule,
      deadlineHours: hours,
      ...(slugs?.length ? { personas: slugs } : {}),
    });
    const now = new Date().toISOString();
    const t = schema.claimDrafts;
    const [saved] = await getDb()
      .update(t)
      .set({
        preflight: JSON.stringify(result),
        preflightAt: now,
        preflightFingerprint: fingerprint(d),
        updatedAt: now,
      })
      .where(and(eq(t.id, id), eq(t.ownerEmail, ownerEmail)))
      .returning();
    return toDraftDto(written(saved));
  },
});
