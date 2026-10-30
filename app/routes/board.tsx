import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import {
  actionErrorMessage,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconClock,
  IconMessageCircle,
  IconRefresh,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import {
  BOARD_CATEGORIES,
  CATEGORY_LABEL,
  PHASE_LABEL,
  timeLeft,
  usd,
  winnerLabel,
} from "@/components/mimir/format";
import { SplitBar } from "@/components/mimir/SplitBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATES = [
  { id: "live", label: "Live" },
  { id: "closing", label: "Closing <24h" },
  { id: "settled", label: "Settled" },
  { id: "all", label: "All" },
] as const;

type StateId = (typeof STATES)[number]["id"];

export function meta() {
  return [{ title: "Board · Mimir Desk" }];
}

export default function BoardRoute() {
  useSetPageTitle("Board");
  const [params, setParams] = useSearchParams();
  const state = (STATES.find((s) => s.id === params.get("state"))?.id ??
    "live") as StateId;
  const category = params.get("category") ?? "";
  const kind = params.get("kind") === "vs" || params.get("kind") === "pool"
    ? (params.get("kind") as "vs" | "pool")
    : undefined;
  const [query, setQuery] = useState(params.get("q") ?? "");

  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
      if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, 250);
    return () => clearTimeout(id);
  }, [query, params, setParams]);

  function setParam(key: string, value: string | undefined) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const { data, isPending, isError, error, refetch, isFetching } =
    useActionQuery("list-markets", {
      state,
      ...(kind ? { kind } : {}),
      ...(category ? { category } : {}),
      ...(params.get("q") ? { query: params.get("q") ?? "" } : {}),
      limit: 120,
    });

  return (
    <div className="mimir-paper @container min-h-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-3 @4xl:flex-row @4xl:items-center @4xl:justify-between">
          <div
            role="tablist"
            aria-label="Market state"
            className="flex w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 @4xl:w-auto"
          >
            {STATES.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={state === s.id}
                onClick={() => setParam("state", s.id === "live" ? undefined : s.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  state === s.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="relative w-full @4xl:w-72">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions"
              aria-label="Search markets"
              className="h-9 rounded-full bg-card pl-9"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={!category} onClick={() => setParam("category", undefined)}>
            Every category
          </Chip>
          {BOARD_CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={category === c}
              onClick={() => setParam("category", category === c ? undefined : c)}
            >
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <Chip active={!kind} onClick={() => setParam("kind", undefined)}>
            VS + Pool
          </Chip>
          <Chip active={kind === "vs"} onClick={() => setParam("kind", kind === "vs" ? undefined : "vs")}>
            VS
          </Chip>
          <Chip active={kind === "pool"} onClick={() => setParam("kind", kind === "pool" ? undefined : "pool")}>
            Pool
          </Chip>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-8"
            aria-label="Refresh markets"
            onClick={() => void refetch()}
          >
            <IconRefresh className={cn("size-4", isFetching && "motion-safe:animate-spin")} />
          </Button>
        </div>

        {isPending ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 @2xl:grid-cols-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm">
              {actionErrorMessage(error) ?? "Mimir did not answer. Try again."}
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : data.markets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="font-display text-3xl">Nothing here right now.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try another state or category, or shape a new claim in the{" "}
              <Link to="/studio" className="text-coral underline-offset-4 hover:underline">
                studio
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 @2xl:grid-cols-2">
            {data.markets.map((m) => (
              <li key={m.id} className="mimir-rise">
                <MarketCard market={m} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-coral bg-coral/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type BoardMarket = {
  id: string;
  kind: "vs" | "pool";
  marketId: number;
  question: string;
  category: string;
  sideA: { label: string; usdc: string };
  sideB: { label: string; usdc: string };
  participants: number;
  deadline: number;
  phase: string;
  winner: number | null;
  poolUsdc: number;
  takes: number;
};

function MarketCard({ market: m }: { market: BoardMarket }) {
  const settled = m.phase === "resolved" || m.phase === "cancelled";
  const won = winnerLabel(m.winner, m.sideA.label, m.sideB.label);
  return (
    <Link
      to={`/market/${m.kind}/${m.marketId}`}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="mimir-eyebrow truncate">
          {CATEGORY_LABEL[m.category] ?? m.category} · {m.kind === "vs" ? "VS" : "Pool"} {m.marketId}
        </span>
        <span className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
          <IconClock className="size-3.5" />
          {m.phase === "open" ? timeLeft(m.deadline) : PHASE_LABEL[m.phase] ?? m.phase}
        </span>
      </div>
      <h2 className="font-display text-[26px] leading-[1.02] tracking-[-0.01em] text-foreground group-hover:text-foreground sm:text-[28px]">
        {m.question}
      </h2>
      <div className="mt-auto">
        <SplitBar
          a={Number(m.sideA.usdc) || 0}
          b={Number(m.sideB.usdc) || 0}
          labelA={m.sideA.label}
          labelB={m.sideB.label}
          winner={settled ? m.winner : null}
        />
      </div>
      <div className="flex items-center gap-4 border-t border-border pt-3 font-mono text-[11px] text-muted-foreground">
        <span className="text-foreground">{usd(m.poolUsdc)} staked</span>
        <span className="flex items-center gap-1">
          <IconUsers className="size-3.5" />
          {m.participants}
        </span>
        {m.takes > 0 ? (
          <span className="flex items-center gap-1 text-coral">
            <IconMessageCircle className="size-3.5" />
            {m.takes} council {m.takes === 1 ? "take" : "takes"}
          </span>
        ) : null}
        {settled && won ? (
          <span className="ml-auto truncate text-foreground">Settled: {won}</span>
        ) : null}
      </div>
    </Link>
  );
}
