import { z } from "zod";

export const marketSchema = z.object({
  id: z.string(),
  kind: z.enum(["vs", "pool"]),
  marketId: z.number(),
  question: z.string(),
  category: z.string(),
  sideA: z.object({ label: z.string(), usdc: z.string() }),
  sideB: z.object({ label: z.string(), usdc: z.string() }),
  participants: z.number(),
  creator: z.string(),
  deadline: z.number(),
  phase: z.string(),
  winner: z.number().nullable(),
  summary: z.string().nullable(),
  resolutionUrl: z.string(),
  url: z.string(),
  poolUsdc: z.number(),
  shareA: z.number().nullable(),
  takes: z.number(),
});

export const takeSchema = z.object({
  id: z.string(),
  marketRef: z.string(),
  marketQuestion: z.string(),
  marketCategory: z.string(),
  personaSlug: z.string(),
  personaName: z.string(),
  personaEmoji: z.string(),
  lean: z.enum(["A", "B", "pass"]),
  confidence: z.number(),
  reasoning: z.string(),
  createdAt: z.string(),
});
