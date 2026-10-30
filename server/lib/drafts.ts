import { fail, NoWriteError } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../db/index.js";
import {
  byteLength,
  CATEGORIES,
  CREATE_URL,
  LIMITS,
  type PreflightResult,
} from "./mimir.js";

type DraftRow = typeof schema.claimDrafts.$inferSelect;

export const preflightSchema = z.object({
  opinions: z.array(
    z.object({
      slug: z.string(),
      displayName: z.string(),
      emoji: z.string(),
      decision: z.enum(["open", "revise", "skip"]),
      score: z.number(),
      confidence: z.number(),
      reasoning: z.string(),
    }),
  ),
  averageScore: z.number().nullable(),
  openVotes: z.number(),
  reviseVotes: z.number(),
  skipVotes: z.number(),
});

export const draftSchema = z.object({
  id: z.string(),
  idea: z.string(),
  sourceUrl: z.string().nullable(),
  kind: z.enum(["vs", "pool"]),
  question: z.string(),
  sideA: z.string(),
  sideB: z.string(),
  category: z.string(),
  deadline: z.string().nullable(),
  resolutionUrl: z.string(),
  settlementRule: z.string(),
  preflight: preflightSchema.nullable(),
  preflightAt: z.string().nullable(),
  preflightStale: z.boolean(),
  issues: z.array(z.string()),
  ready: z.boolean(),
  mimirSummary: z.string(),
  createUrl: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DraftDto = z.infer<typeof draftSchema>;

/** The fields the council reads, so a preflight can be flagged stale after an edit. */
export function fingerprint(d: Pick<
  DraftRow,
  | "question"
  | "sideA"
  | "sideB"
  | "category"
  | "deadline"
  | "resolutionUrl"
  | "settlementRule"
>): string {
  return JSON.stringify([
    d.question,
    d.sideA,
    d.sideB,
    d.category,
    d.deadline,
    d.resolutionUrl,
    d.settlementRule,
  ]);
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** What still stops this draft from opening on Mimir, in plain words. */
export function draftIssues(d: DraftRow, now = Date.now()): string[] {
  const out: string[] = [];
  if (!d.question.trim()) out.push("Add a question.");
  else if (byteLength(d.question) > LIMITS.question)
    out.push(`Question is over ${LIMITS.question} bytes.`);
  if (!d.sideA.trim() || !d.sideB.trim()) out.push("Name both sides.");
  if (byteLength(d.sideA) > LIMITS.side || byteLength(d.sideB) > LIMITS.side)
    out.push(`Each side must fit ${LIMITS.side} bytes.`);
  if (!d.resolutionUrl.trim()) out.push("Add a resolution source URL.");
  else if (!isHttpUrl(d.resolutionUrl))
    out.push("Resolution source must be an http(s) URL.");
  else if (byteLength(d.resolutionUrl) > LIMITS.url)
    out.push(`Resolution URL is over ${LIMITS.url} bytes.`);
  if (!(CATEGORIES as readonly string[]).includes(d.category))
    out.push(`Category must be one of ${CATEGORIES.join(", ")}.`);
  if (!d.deadline) out.push("Set a deadline.");
  else if (Date.parse(d.deadline) < now + 10 * 60_000)
    out.push("Deadline must be at least 10 minutes from now.");
  return out;
}

export function mimirSummary(d: DraftRow): string {
  const when = d.deadline
    ? new Date(d.deadline).toUTCString().replace("GMT", "UTC")
    : "(not set)";
  return [
    `Market type: ${d.kind === "vs" ? "VS (you back side A, challengers take side B)" : "Pool (two open sides)"}`,
    `Question: ${d.question}`,
    `Side A: ${d.sideA}`,
    `Side B: ${d.sideB}`,
    `Category: ${d.category}`,
    `Deadline: ${when}`,
    `Resolution source: ${d.resolutionUrl}`,
    d.settlementRule ? `Settlement rule: ${d.settlementRule}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function toDraftDto(d: DraftRow): DraftDto {
  let preflight: PreflightResult | null = null;
  if (d.preflight) {
    const parsed = preflightSchema.safeParse(JSON.parse(d.preflight));
    preflight = parsed.success ? parsed.data : null;
  }
  const issues = draftIssues(d);
  return {
    id: d.id,
    idea: d.idea,
    sourceUrl: d.sourceUrl,
    kind: d.kind,
    question: d.question,
    sideA: d.sideA,
    sideB: d.sideB,
    category: d.category,
    deadline: d.deadline,
    resolutionUrl: d.resolutionUrl,
    settlementRule: d.settlementRule,
    preflight,
    preflightAt: d.preflightAt,
    preflightStale: Boolean(
      preflight && d.preflightFingerprint !== fingerprint(d),
    ),
    issues,
    ready: issues.length === 0,
    mimirSummary: mimirSummary(d),
    createUrl: CREATE_URL,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function requireUser(ctx: { userEmail?: string | null } | undefined) {
  const email = ctx?.userEmail;
  if (!email) {
    throw new NoWriteError("Sign in to use drafts.", {
      errorCode: "unauthenticated",
      statusCode: 401,
    });
  }
  return email;
}

export async function loadOwnDraft(id: string, ownerEmail: string) {
  const t = schema.claimDrafts;
  const [row] = await getDb()
    .select()
    .from(t)
    .where(and(eq(t.id, id), eq(t.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) {
    throw new NoWriteError("Draft not found.", {
      errorCode: "not_found",
      statusCode: 404,
    });
  }
  return row;
}

/** The row a write returned; a missing one is an internal fault. */
export function written<T>(row: T | undefined): T {
  if (!row) return fail("The write returned no row.", { statusCode: 500 });
  return row;
}

/** Accepts ISO with offset, returns normalized UTC ISO. */
export function normalizeDeadline(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new NoWriteError("deadline must be an ISO 8601 date-time.", {
      errorCode: "invalid_deadline",
      statusCode: 400,
    });
  }
  return new Date(ms).toISOString();
}
