import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { fetchRoster } from "../server/lib/mimir.js";

export default defineAction({
  description:
    "List Mimir's 20-persona AI council (classic and philosopher tracks). With includePrompt=true each persona carries its full character prompt, so you can voice that persona exactly as the council plays it. Rule-based personas (usesLlm=false) decide by a fixed rule described in their bio.",
  schema: z.object({
    includePrompt: z
      .enum(["true", "false"])
      .default("false")
      .describe('"true" to include each persona\'s character prompt; defaults to "false"'),
    slugs: z
      .string()
      .optional()
      .describe("Comma-separated persona slugs to return, e.g. \"socrates,taleb\"; omit for all"),
  }),
  outputSchema: z.object({
    personas: z.array(
      z.object({
        slug: z.string(),
        displayName: z.string(),
        emoji: z.string(),
        bio: z.string(),
        archetype: z.string(),
        track: z.string(),
        usesLlm: z.boolean(),
        prompt: z.string().nullable(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ includePrompt, slugs }) => {
    const want = slugs
      ?.split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const roster = await fetchRoster();
    return {
      personas: roster
        .filter((p) => !want?.length || want.includes(p.slug))
        .map((p) => ({
          slug: p.slug,
          displayName: p.displayName,
          emoji: p.emoji,
          bio: p.bio,
          archetype: p.archetype,
          track: p.track,
          usesLlm: p.usesLlm,
          prompt: includePrompt === "true" ? p.prompt : null,
        })),
    };
  },
});
