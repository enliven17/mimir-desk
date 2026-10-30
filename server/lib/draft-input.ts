import { z } from "zod";

import { CATEGORIES } from "./mimir.js";

/** Editable draft fields; every one optional so create and update share it. */
export const draftFields = {
  idea: z
    .string()
    .max(2000)
    .optional()
    .describe("The user's raw idea in their words"),
  sourceUrl: z
    .string()
    .max(500)
    .optional()
    .describe("A source page the idea came from (http/https URL)"),
  kind: z
    .enum(["vs", "pool"])
    .optional()
    .describe('"vs": creator backs side A, challengers take B. "pool": two open sides'),
  question: z
    .string()
    .max(400)
    .optional()
    .describe("Yes/no style question, specific and time-bound; Mimir allows 200 bytes"),
  sideA: z
    .string()
    .max(200)
    .optional()
    .describe('Side A label, e.g. "Yes: BTC closes above $150k"; max 100 bytes'),
  sideB: z
    .string()
    .max(200)
    .optional()
    .describe('Side B label, e.g. "No: BTC closes at or below $150k"; max 100 bytes'),
  category: z
    .enum(CATEGORIES)
    .optional()
    .describe("One of sports, weather, crypto, culture, custom"),
  deadline: z
    .string()
    .datetime({ offset: true })
    .optional()
    .describe("When staking closes and the outcome is read: ISO 8601 with offset, e.g. 2026-11-08T20:00:00Z. Must be before the answer can be known"),
  resolutionUrl: z
    .string()
    .max(400)
    .optional()
    .describe("Public http(s) URL the oracle reads to settle; max 200 bytes"),
  settlementRule: z
    .string()
    .max(600)
    .optional()
    .describe("One or two sentences: exactly how the source decides A vs B, and edge cases (draws, delays)"),
};

export type DraftPatch = {
  [K in keyof typeof draftFields]?: z.infer<(typeof draftFields)[K]>;
};
