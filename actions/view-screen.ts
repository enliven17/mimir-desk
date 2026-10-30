import { defineAction } from "@agent-native/core/action";
import {
  readAppState,
  readAppStateForCurrentTab,
} from "@agent-native/core/application-state";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { toDraftDto } from "../server/lib/drafts.js";
import { fetchMarket, type MarketKind } from "../server/lib/mimir.js";

type Nav = {
  view?: string;
  marketKind?: MarketKind;
  marketId?: string;
  draftId?: string;
};

export default defineAction({
  description:
    "Fresh snapshot of what the user sees: the view (board, market, studio, chat), the open market with the user's saved council takes and the personas they picked, or the open claim draft with its issues and last preflight. Basic navigation is already in <current-screen>.",
  schema: z.object({}),
  outputSchema: z.record(z.string(), z.unknown()),
  http: false,
  readOnly: true,
  run: async (_args, ctx) => {
    const navigation = (await readAppState("navigation")) as Nav | null;
    const screen: Record<string, unknown> = {};
    if (!navigation) return { note: "No application state found. Is the app open?" };
    screen.navigation = navigation;

    if (navigation.view === "market" && navigation.marketKind && navigation.marketId) {
      const ref = `${navigation.marketKind}-${navigation.marketId}`;
      try {
        const m = await fetchMarket(navigation.marketKind, Number(navigation.marketId));
        screen.market = {
          ref,
          question: m.question,
          category: m.category,
          sideA: m.sideA,
          sideB: m.sideB,
          phase: m.phase,
          deadline: new Date(m.deadline * 1000).toISOString(),
          participants: m.participants,
          winner: m.winner,
          verdict: m.verdict,
          url: m.url,
        };
      } catch {
        screen.market = { ref, note: "Mimir did not return this market just now." };
      }
      if (ctx?.userEmail) {
        const t = schema.councilTakes;
        screen.savedTakes = await getDb()
          .select({ persona: t.personaSlug, lean: t.lean, confidence: t.confidence })
          .from(t)
          .where(and(eq(t.ownerEmail, ctx.userEmail), eq(t.marketRef, ref)))
          .limit(40);
      }
      const picked = await readAppStateForCurrentTab("selection");
      if (picked) screen.pickedPersonas = picked;
    }

    if (navigation.view === "studio" && navigation.draftId && ctx?.userEmail) {
      const t = schema.claimDrafts;
      const [d] = await getDb()
        .select()
        .from(t)
        .where(and(eq(t.id, navigation.draftId), eq(t.ownerEmail, ctx.userEmail)))
        .limit(1);
      if (d) {
        const { mimirSummary: _s, createUrl: _c, ...draft } = toDraftDto(d);
        screen.draft = draft;
      }
    }
    return screen;
  },
});
