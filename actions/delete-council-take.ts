import { defineAction, NoWriteError } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { requireUser } from "../server/lib/drafts.js";

export default defineAction({
  description: "Remove one saved council take by id.",
  schema: z.object({ id: z.string().describe("Take id from list-council-takes") }),
  outputSchema: z.object({ id: z.string(), deleted: z.literal(true) }),
  mcpAnnotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  run: async ({ id }, ctx) => {
    const ownerEmail = requireUser(ctx);
    const t = schema.councilTakes;
    const [gone] = await getDb()
      .delete(t)
      .where(and(eq(t.id, id), eq(t.ownerEmail, ownerEmail)))
      .returning({ id: t.id });
    if (!gone) {
      throw new NoWriteError("Take not found.", {
        errorCode: "not_found",
        statusCode: 404,
      });
    }
    return { id, deleted: true as const };
  },
});
