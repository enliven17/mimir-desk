import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import {
  draftSchema,
  loadOwnDraft,
  requireUser,
  toDraftDto,
} from "../server/lib/drafts.js";

export default defineAction({
  description:
    "Get one claim draft with every field, the last council preflight (stale when fields changed since), the issues still blocking it, and a copy-ready summary for Mimir's create page.",
  schema: z.object({ id: z.string().describe("Draft id") }),
  outputSchema: draftSchema,
  http: { method: "GET" },
  readOnly: true,
  link: ({ args }) => ({
    url: buildDeepLink({
      view: "studio",
      to: `/studio/${encodeURIComponent(args.id)}`,
      params: { draftId: args.id },
    }),
    label: "Open draft",
  }),
  run: async ({ id }, ctx) => toDraftDto(await loadOwnDraft(id, requireUser(ctx))),
});
