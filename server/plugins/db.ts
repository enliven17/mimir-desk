import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "drafts-and-council-takes",
      sql: `CREATE TABLE IF NOT EXISTS claim_drafts (
  id TEXT PRIMARY KEY,
  idea TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  kind TEXT NOT NULL DEFAULT 'vs' CHECK (kind IN ('vs', 'pool')),
  question TEXT NOT NULL DEFAULT '',
  side_a TEXT NOT NULL DEFAULT 'Yes',
  side_b TEXT NOT NULL DEFAULT 'No',
  category TEXT NOT NULL DEFAULT 'custom',
  deadline TEXT,
  resolution_url TEXT NOT NULL DEFAULT '',
  settlement_rule TEXT NOT NULL DEFAULT '',
  preflight TEXT,
  preflight_at TEXT,
  preflight_fingerprint TEXT,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS council_takes (
  id TEXT PRIMARY KEY,
  market_ref TEXT NOT NULL,
  market_question TEXT NOT NULL DEFAULT '',
  market_category TEXT NOT NULL DEFAULT '',
  persona_slug TEXT NOT NULL,
  persona_name TEXT NOT NULL,
  persona_emoji TEXT NOT NULL DEFAULT '',
  lean TEXT NOT NULL CHECK (lean IN ('A', 'B', 'pass')),
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  reasoning TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  org_id TEXT,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS claim_drafts_owner_updated_idx ON claim_drafts (owner_email, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS council_takes_owner_market_persona_idx ON council_takes (owner_email, market_ref, persona_slug);
CREATE INDEX IF NOT EXISTS council_takes_owner_category_idx ON council_takes (owner_email, market_category)`,
    },
  ],
  { table: "mimir_desk_migrations" },
);
