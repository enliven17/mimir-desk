import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import { IconArrowRight, IconCircleCheck, IconPencil, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { CATEGORY_LABEL } from "@/components/mimir/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export function meta() {
  return [{ title: "Claim studio · Mimir Desk" }];
}

const URL_RE = /https?:\/\/[^\s]+/i;

export default function StudioIndexRoute() {
  useSetPageTitle("Claim studio");
  const navigate = useNavigate();
  const [idea, setIdea] = useState("");
  const drafts = useActionQuery("list-claim-drafts", {});
  const create = useActionMutation("create-claim-draft", {
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not start a draft."),
  });

  function start(withAgent: boolean) {
    const text = idea.trim();
    const sourceUrl = text.match(URL_RE)?.[0];
    create.mutate(
      { idea: text, ...(sourceUrl ? { sourceUrl } : {}) },
      {
        onSuccess: (draft) => {
          setIdea("");
          navigate(`/studio/${encodeURIComponent(draft.id)}`);
          if (withAgent && text) {
            sendToAgentChat({
              message: sourceUrl
                ? `Draft claim ${draft.id} from this source: ${sourceUrl}. Read it, fill every field, then run the council preflight.`
                : `Draft claim ${draft.id} from my idea: "${text}". Fill every field, then run the council preflight.`,
              context: `Draft id: ${draft.id}`,
              submit: true,
              openSidebar: true,
            });
          }
        },
      },
    );
  }

  return (
    <div className="mimir-paper min-h-full">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-6 sm:px-8 sm:py-10">
        <section className="flex flex-col gap-4">
          <h1 className="font-display text-[44px] leading-[0.95] tracking-[-0.015em] sm:text-[64px]">
            Turn a hunch into a <span className="text-coral">claim</span>.
          </h1>
          <div className="rounded-2xl border border-border bg-card p-3 focus-within:border-foreground/40">
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && idea.trim()) start(true);
              }}
              placeholder="Write an idea (“Arsenal win the derby on Sunday”) or paste a source URL"
              aria-label="Claim idea or source URL"
              rows={3}
              maxLength={2000}
              className="min-h-24 resize-none border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            />
            <div className="flex flex-wrap items-center justify-end gap-2 px-1 pt-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={create.isPending}
                onClick={() => start(false)}
              >
                <IconPencil className="size-4" />
                Start by hand
              </Button>
              <Button
                size="sm"
                className="rounded-full"
                disabled={!idea.trim() || create.isPending}
                onClick={() => start(true)}
              >
                <IconSparkles className="size-4" />
                {create.isPending ? "Starting…" : "Draft with the agent"}
              </Button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="mimir-eyebrow">Drafts</h2>
          {drafts.isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : drafts.isError ? (
            <p className="text-sm text-muted-foreground">
              {actionErrorMessage(drafts.error) ?? "Drafts did not load."}
            </p>
          ) : drafts.data.drafts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              No drafts yet. Nothing here is published until you open it on Mimir yourself.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {drafts.data.drafts.map((d) => (
                <li key={d.id}>
                  <Link
                    to={`/studio/${encodeURIComponent(d.id)}`}
                    className="group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {d.question || d.idea || "Untitled draft"}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {CATEGORY_LABEL[d.category] ?? d.category} · {d.kind === "vs" ? "VS" : "Pool"} ·{" "}
                        {new Date(d.updatedAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    {d.preflightScore !== null ? (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        council {d.preflightScore}
                      </span>
                    ) : null}
                    {d.ready ? (
                      <IconCircleCheck className="size-4 shrink-0 text-coral" aria-label="Ready" />
                    ) : null}
                    <IconArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
