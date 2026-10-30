import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
  writeClientAppState,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconExternalLink,
  IconGavel,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";

import {
  CATEGORY_LABEL,
  deadlineLabel,
  PHASE_LABEL,
  shortAddr,
  timeLeft,
  usd,
  winnerLabel,
} from "@/components/mimir/format";
import { SplitBar } from "@/components/mimir/SplitBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TAB_ID } from "@/lib/tab-id";
import { cn } from "@/lib/utils";

const MAX_PICK = 6;
const DEFAULT_PICK = ["socrates", "taleb", "statistician"];

export function meta() {
  return [{ title: "Market · Mimir Desk" }];
}

type Take = {
  id: string;
  personaSlug: string;
  personaName: string;
  personaEmoji: string;
  lean: "A" | "B" | "pass";
  confidence: number;
  reasoning: string;
  createdAt: string;
};

export default function MarketRoute() {
  const params = useParams();
  const kind = params.kind === "vs" ? "vs" : "pool";
  const id = Number(params.id);
  const ref = `${kind}-${id}`;
  useSetPageTitle(ref);

  const marketQ = useActionQuery("get-market", { kind, id });
  const takesQ = useActionQuery("list-council-takes", { marketRef: ref });

  if (marketQ.isPending) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-8">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-80 rounded-2xl" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    );
  }
  if (marketQ.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <BackLink />
        <p className="mt-6 font-display text-3xl">
          {actionErrorMessage(marketQ.error) ?? "This market did not load."}
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void marketQ.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const m = marketQ.data.market;
  const a = Number(m.sideA.usdc) || 0;
  const b = Number(m.sideB.usdc) || 0;
  const settled = m.phase === "resolved" || m.phase === "cancelled";
  const won = winnerLabel(m.winner, m.sideA.label, m.sideB.label);

  return (
    <div className="mimir-paper @container min-h-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-8 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <BackLink />
          <Button asChild size="sm" className="rounded-full">
            <a href={m.url} target="_blank" rel="noreferrer">
              Open on Mimir
              <IconArrowUpRight className="size-4" />
            </a>
          </Button>
        </div>

        <section className="flex flex-col gap-4">
          <span className="mimir-eyebrow">
            {CATEGORY_LABEL[m.category] ?? m.category} · {m.kind === "vs" ? "VS" : "Pool"} {m.marketId} ·{" "}
            {PHASE_LABEL[m.phase] ?? m.phase}
          </span>
          <h1 className="max-w-4xl font-display text-[38px] leading-[0.98] tracking-[-0.015em] @3xl:text-[56px]">
            {m.question}
          </h1>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-muted-foreground">
            <div className="flex gap-1.5">
              <dt>Deadline</dt>
              <dd className="text-foreground">{deadlineLabel(m.deadline)}</dd>
            </div>
            {m.phase === "open" ? (
              <div className="flex gap-1.5">
                <dt>Closes in</dt>
                <dd className="text-foreground">{timeLeft(m.deadline)}</dd>
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <dt>Staked</dt>
              <dd className="text-foreground">{usd(m.poolUsdc)} USDC</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>Stakers</dt>
              <dd className="text-foreground">{m.participants}</dd>
            </div>
          </dl>
          <div className="max-w-4xl pt-1">
            <SplitBar
              size="lg"
              a={a}
              b={b}
              labelA={m.sideA.label}
              labelB={m.sideB.label}
              winner={settled ? m.winner : null}
            />
          </div>
        </section>

        {m.verdict || (settled && won) ? (
          <section className="rounded-2xl border border-coral/40 bg-coral/[0.06] p-5">
            <div className="flex flex-wrap items-center gap-2">
              <IconGavel className="size-4 text-coral" />
              <span className="mimir-eyebrow">Oracle verdict</span>
              {m.verdict ? (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {m.verdict.confidence}% confident
                </span>
              ) : null}
            </div>
            <p className="mt-2 font-display text-3xl leading-none">
              {won ??
                (m.verdict
                  ? winnerLabel(m.verdict.side, m.sideA.label, m.sideB.label)
                  : "")}
            </p>
            {m.verdict?.summary || m.summary ? (
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/85">
                {m.verdict?.summary ?? m.summary}
              </p>
            ) : null}
            {m.verdict?.txHash ? (
              <a
                href={`https://explorer.arc.io/tx/${m.verdict.txHash}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
              >
                tx {shortAddr(m.verdict.txHash)}
                <IconExternalLink className="size-3" />
              </a>
            ) : null}
          </section>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @4xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          <CouncilPanel
            marketRef={ref}
            question={m.question}
            sideA={m.sideA.label}
            sideB={m.sideB.label}
            takes={takesQ.data?.takes ?? []}
            takesLoading={takesQ.isPending}
          />
          <aside className="flex flex-col gap-4">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mimir-eyebrow">Positions</h2>
              {m.positions.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No stakes yet.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {m.positions.slice(0, 30).map((p, i) => (
                    <li key={`${p.user}-${p.side}-${i}`} className="flex items-center gap-3 py-2 font-mono text-xs">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          p.side === 1 ? "bg-coral" : "bg-foreground/80",
                        )}
                      />
                      <span className="truncate text-muted-foreground">{shortAddr(p.user)}</span>
                      <span className="ml-auto truncate">
                        {p.side === 1 ? m.sideA.label : m.sideB.label}
                      </span>
                      <span className="shrink-0 text-foreground">{usd(p.usdc)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mimir-eyebrow">Resolution source</h2>
              <a
                href={m.resolutionUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block break-all font-mono text-xs text-foreground/80 underline-offset-4 hover:underline"
              >
                {m.resolutionUrl}
              </a>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                The AI oracle reads this source after the deadline and posts its reasoning on chain. Anyone can
                dispute within 24 hours.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/board"
      className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
    >
      <IconArrowLeft className="size-3.5" />
      Board
    </Link>
  );
}

function CouncilPanel({
  marketRef,
  question,
  sideA,
  sideB,
  takes,
  takesLoading,
}: {
  marketRef: string;
  question: string;
  sideA: string;
  sideB: string;
  takes: Take[];
  takesLoading: boolean;
}) {
  const rosterQ = useActionQuery("list-personas", {});
  const [picked, setPicked] = useState<string[]>(DEFAULT_PICK);
  const [asked, setAsked] = useState<{ slugs: string[]; at: number } | null>(null);
  const [removing, setRemoving] = useState<Take | null>(null);
  const qc = useQueryClient();
  const takesKey = ["action", "list-council-takes", { marketRef }];

  // Tell the agent which personas the user has picked on this screen.
  useEffect(() => {
    void writeClientAppState(
      `selection:${TAB_ID}`,
      { kind: "personas", marketRef, slugs: picked },
      { requestSource: TAB_ID },
    ).catch(() => undefined);
  }, [picked, marketRef]);

  const takenSlugs = useMemo(() => new Set(takes.map((t) => t.personaSlug)), [takes]);
  const askedAtIso = asked ? new Date(asked.at).toISOString() : "";
  const waitingFor =
    asked && Date.now() - asked.at < 180_000
      ? asked.slugs.filter(
          (s) => !takes.some((t) => t.personaSlug === s && t.createdAt >= askedAtIso),
        )
      : [];

  const remove = useActionMutation("delete-council-take", {
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: takesKey });
      const previous = qc.getQueryData(takesKey);
      qc.setQueryData(takesKey, (old: { takes: Take[]; splits: unknown[] } | undefined) =>
        old ? { ...old, takes: old.takes.filter((t) => t.id !== id) } : old,
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      qc.setQueryData(takesKey, (context as { previous?: unknown } | undefined)?.previous);
      toast.error(actionErrorMessage(error) ?? "Could not remove that take.");
    },
    onSettled: () => setRemoving(null),
  });

  function toggle(slug: string) {
    setPicked((cur) =>
      cur.includes(slug)
        ? cur.filter((s) => s !== slug)
        : cur.length >= MAX_PICK
          ? (toast.message(`Pick up to ${MAX_PICK} personas at a time.`), cur)
          : [...cur, slug],
    );
  }

  function consult() {
    const roster = rosterQ.data?.personas ?? [];
    const names = picked
      .map((s) => roster.find((p) => p.slug === s)?.displayName ?? s)
      .join(", ");
    sendToAgentChat({
      message: `Consult ${names} on market ${marketRef}: "${question}". Save each persona's take with save-council-take, then sum up where they split.`,
      context: `Market ${marketRef}. Side A: ${sideA}. Side B: ${sideB}. Persona slugs: ${picked.join(", ")}.`,
      submit: true,
      openSidebar: true,
    });
    setAsked({ slugs: picked, at: Date.now() });
    toast.success("Asked the agent to consult the council.");
  }

  const leanA = takes.filter((t) => t.lean === "A").length;
  const leanB = takes.filter((t) => t.lean === "B").length;
  const voting = takes.filter((t) => t.lean !== "pass");
  const avg = voting.length
    ? Math.round(voting.reduce((s, t) => s + t.confidence, 0) / voting.length)
    : null;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="mimir-eyebrow">The council</h2>
        {takes.length ? (
          <span className="font-mono text-xs text-muted-foreground">
            <span className="text-coral">{leanA} lean A</span> · <span className="text-foreground">{leanB} lean B</span>
            {avg !== null ? ` · avg ${avg}%` : ""}
          </span>
        ) : null}
      </div>

      {rosterQ.isPending ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
        </div>
      ) : rosterQ.isError ? (
        <p className="text-sm text-muted-foreground">
          {actionErrorMessage(rosterQ.error) ?? "The council roster did not load."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick personas to consult">
          {rosterQ.data.personas.map((p) => {
            const on = picked.includes(p.slug);
            return (
              <button
                key={p.slug}
                type="button"
                aria-pressed={on}
                title={p.bio}
                onClick={() => toggle(p.slug)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <span aria-hidden="true">{p.emoji}</span>
                {p.displayName}
                {takenSlugs.has(p.slug) ? (
                  <span className={cn("size-1.5 rounded-full", on ? "bg-coral" : "bg-coral/70")} aria-label="has a take" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={consult} disabled={!picked.length || rosterQ.isPending} className="rounded-full">
          <IconSparkles className="size-4" />
          Consult {picked.length || ""} {picked.length === 1 ? "persona" : "personas"}
        </Button>
        <span className="text-xs text-muted-foreground">
          The agent voices each persona from its council prompt and saves the take here.
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {takesLoading ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : null}
        {waitingFor.map((slug) => {
          const p = rosterQ.data?.personas.find((x) => x.slug === slug);
          return (
            <div key={`wait-${slug}`} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <span aria-hidden="true">{p?.emoji}</span>
              <span className="text-sm text-muted-foreground">{p?.displayName ?? slug} is thinking…</span>
              <Skeleton className="ml-auto h-2 w-24" />
            </div>
          );
        })}
        {takes.map((t) => (
          <article key={t.id} className="mimir-rise rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-lg leading-none">
                {t.personaEmoji}
              </span>
              <span className="text-sm font-medium">{t.personaName}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
                  t.lean === "A"
                    ? "bg-coral text-white"
                    : t.lean === "B"
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {t.lean === "pass" ? "Pass" : `${t.lean}: ${t.lean === "A" ? sideA : sideB}`.slice(0, 40)}
              </span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{t.confidence}%</span>
              <button
                type="button"
                onClick={() => setRemoving(t)}
                aria-label={`Remove ${t.personaName}'s take`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <IconX className="size-3.5" />
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground/85">{t.reasoning}</p>
          </article>
        ))}
        {!takesLoading && takes.length === 0 && waitingFor.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No takes yet. Pick personas above and consult them.
          </p>
        ) : null}
      </div>

      <AlertDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.personaName}&apos;s take?</AlertDialogTitle>
            <AlertDialogDescription>You can consult them again any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => removing && remove.mutate({ id: removing.id })}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
