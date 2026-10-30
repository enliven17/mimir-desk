import { sql } from "drizzle-orm";
import { integer, pgTable, text } from "drizzle-orm/pg-core";

/**
 * A claim the user is shaping in the studio before opening it on Mimir.
 * Private to its author. Times are UTC ISO text so string order equals time order.
 */
export const claimDrafts = pgTable("claim_drafts", {
  id: text("id").primaryKey(),
  idea: text("idea").notNull().default(""),
  sourceUrl: text("source_url"),
  kind: text("kind", { enum: ["vs", "pool"] })
    .notNull()
    .default("vs"),
  question: text("question").notNull().default(""),
  sideA: text("side_a").notNull().default("Yes"),
  sideB: text("side_b").notNull().default("No"),
  category: text("category").notNull().default("custom"),
  deadline: text("deadline"),
  resolutionUrl: text("resolution_url").notNull().default(""),
  settlementRule: text("settlement_rule").notNull().default(""),
  /** JSON of the last council preflight result, null until one ran. */
  preflight: text("preflight"),
  preflightAt: text("preflight_at"),
  /** Hash of the fields the last preflight saw, to flag a stale read. */
  preflightFingerprint: text("preflight_fingerprint"),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/**
 * One council persona's take on one Mimir market, written by the agent when
 * the user consults the council. One row per (owner, market, persona).
 */
export const councilTakes = pgTable("council_takes", {
  id: text("id").primaryKey(),
  marketRef: text("market_ref").notNull(),
  marketQuestion: text("market_question").notNull().default(""),
  marketCategory: text("market_category").notNull().default(""),
  personaSlug: text("persona_slug").notNull(),
  personaName: text("persona_name").notNull(),
  personaEmoji: text("persona_emoji").notNull().default(""),
  lean: text("lean", { enum: ["A", "B", "pass"] }).notNull(),
  confidence: integer("confidence").notNull().default(50),
  reasoning: text("reasoning").notNull(),
  ownerEmail: text("owner_email").notNull(),
  orgId: text("org_id"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`now()`),
});
