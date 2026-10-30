import { defineAction, NoWriteError } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    'Move the user\'s screen. Views: "board" (markets; optional state/category filters), "market" (needs marketRef like "pool-39"), "studio" (optional draftId), "chat" (optional threadId). Or pass a path such as "/market/pool/39".',
  schema: z.object({
    view: z
      .string()
      .optional()
      .describe('"board", "market", "studio", "chat", "home" or "settings"'),
    path: z.string().optional().describe('App path, e.g. "/studio/<id>" or "/board?state=closing"'),
    marketRef: z.string().optional().describe('For view "market": "pool-39" or "vs-12"'),
    draftId: z.string().optional().describe('For view "studio": a draft id to open'),
    state: z
      .enum(["live", "closing", "settled", "all"])
      .optional()
      .describe('For view "board": market state filter'),
    category: z.string().optional().describe('For view "board": category filter'),
    threadId: z.string().optional().describe("Chat thread ID to open"),
  }),
  outputSchema: z.object({ navigating: z.string() }),
  http: false,
  run: async (args) => {
    let path = args.path;
    if (!path && args.view === "market") {
      const m = /^(vs|pool)-(\d+)$/i.exec(args.marketRef?.trim() ?? "");
      if (!m) {
        throw new NoWriteError('view "market" needs marketRef like "pool-39".', {
          errorCode: "invalid_market_ref",
        });
      }
      path = `/market/${(m[1] ?? "").toLowerCase()}/${m[2] ?? ""}`;
    }
    if (!path && args.view === "studio") {
      path = args.draftId ? `/studio/${encodeURIComponent(args.draftId)}` : "/studio";
    }
    if (!path && args.view === "board") {
      const q = new URLSearchParams();
      if (args.state) q.set("state", args.state);
      if (args.category) q.set("category", args.category);
      path = `/board${q.size ? `?${q}` : ""}`;
    }
    if (!args.view && !path) {
      throw new NoWriteError("Pass a view or a path.", { errorCode: "invalid_target" });
    }
    const nav: Record<string, string> = {};
    if (args.view) nav.view = args.view;
    if (path) nav.path = path;
    if (args.threadId) nav.threadId = args.threadId;
    nav._writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeAppStateForCurrentTab("navigate", nav);
    return { navigating: path ?? args.view ?? "" };
  },
});
