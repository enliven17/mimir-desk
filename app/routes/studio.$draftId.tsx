import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useSetPageTitle } from "@agent-native/toolkit/app-shell/header-actions";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconSparkles,
  IconTrash,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import { bytes, CATEGORIES, CATEGORY_LABEL } from "@/components/mimir/format";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Draft · Mimir Desk" }];
}

type Form = {
  kind: "vs" | "pool";
  question: string;
  sideA: string;
  sideB: string;
  category: (typeof CATEGORIES)[number];
  deadline: string; // datetime-local, user's timezone
  resolutionUrl: string;
  settlementRule: string;
};

type Draft = {
  id: string;
  idea: string;
  sourceUrl: string | null;
  kind: "vs" | "pool";
  question: string;
  sideA: string;
  sideB: string;
  category: string;
  deadline: string | null;
  resolutionUrl: string;
  settlementRule: string;
  preflight: {
    opinions: {
      slug: string;
      displayName: string;
      emoji: string;
      decision: "open" | "revise" | "skip";
      score: number;
      confidence: number;
      reasoning: string;
    }[];
    averageScore: number | null;
    openVotes: number;
    reviseVotes: number;
    skipVotes: number;
  } | null;
  preflightAt: string | null;
  preflightStale: boolean;
  issues: string[];
  ready: boolean;
  mimirSummary: string;
  createUrl: string;
  updatedAt: string;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function formFrom(d: Draft): Form {
  return {
    kind: d.kind,
    question: d.question,
    sideA: d.sideA,
    sideB: d.sideB,
    category: (CATEGORIES as readonly string[]).includes(d.category)
      ? (d.category as Form["category"])
      : "custom",
    deadline: toLocalInput(d.deadline),
    resolutionUrl: d.resolutionUrl,
    settlementRule: d.settlementRule,
  };
}

const PANEL_SIZE = 5;

export default function DraftRoute() {
  const { draftId = "" } = useParams();
  useSetPageTitle("Claim studio");
  const q = useActionQuery("get-claim-draft", { id: draftId });

  if (q.isPending) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-8 lg:grid-cols-[1.3fr_1fr]">
        <Skeleton className="h-[560px] rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <Link to="/studio" className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground">
          Studio
        </Link>
        <p className="mt-6 font-display text-3xl">
          {actionErrorMessage(q.error) ?? "This draft did not load."}
        </p>
      </div>
    );
  }
  return <DraftEditor key={q.data.id} draft={q.data as Draft} />;
}

function DraftEditor({ draft }: { draft: Draft }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const queryKey = ["action", "get-claim-draft", { id: draft.id }];
  const [form, setForm] = useState<Form>(() => formFrom(draft));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const pending = useRef<Partial<Form>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeen = useRef(draft.updatedAt);
  const [panel, setPanel] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  // The agent (or another tab) changed the draft: take its values unless the user has unsaved edits.
  useEffect(() => {
    if (draft.updatedAt === lastSeen.current) return;
    lastSeen.current = draft.updatedAt;
    if (Object.keys(pending.current).length === 0 && saveState !== "saving") {
      setForm(formFrom(draft));
    }
  }, [draft, saveState]);

  const save = useActionMutation("update-claim-draft", {
    onSuccess: (saved) => {
      lastSeen.current = saved.updatedAt;
      qc.setQueryData(queryKey, saved);
      setSaveState(Object.keys(pending.current).length ? "saving" : "saved");
    },
    onError: (error) => {
      setSaveState("error");
      toast.error(actionErrorMessage(error) ?? "Could not save the draft.");
    },
  });

  function flush() {
    const patch = pending.current;
    pending.current = {};
    if (!Object.keys(patch).length) return;
    const { deadline, ...rest } = patch;
    let iso: string | undefined;
    if (deadline !== undefined) {
      const d = new Date(deadline);
      if (Number.isNaN(d.getTime())) {
        setSaveState("saved");
        return;
      }
      iso = d.toISOString();
    }
    save.mutate({ id: draft.id, ...rest, ...(iso ? { deadline: iso } : {}) });
  }

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    pending.current = { ...pending.current, [key]: value };
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const roster = useActionQuery("list-personas", {});
  const preflight = useActionMutation("run-preflight", {
    onSuccess: (saved) => {
      lastSeen.current = saved.updatedAt;
      qc.setQueryData(queryKey, saved);
      toast.success(
        saved.preflight?.averageScore != null
          ? `The council scored it ${saved.preflight.averageScore}/100.`
          : "The council answered.",
      );
    },
    onError: (error) => toast.error(actionErrorMessage(error) ?? "The council did not answer. Try again."),
  });

  const remove = useActionMutation("delete-claim-draft", {
    onSuccess: () => {
      toast.success("Draft deleted.");
      navigate("/studio");
    },
    onError: (error) => toast.error(actionErrorMessage(error) ?? "Could not delete the draft."),
  });

  function askCouncil() {
    if (timer.current) clearTimeout(timer.current);
    flush();
    preflight.mutate({ id: draft.id, ...(panel.length ? { personas: panel.join(",") } : {}) });
  }

  function askAgent() {
    sendToAgentChat({
      message: `Improve draft ${draft.id}${draft.preflight ? " using the council's notes" : ""}: tighten anything vague, fix the issues listed, keep my intent, then re-run the preflight.`,
      context: `Draft id: ${draft.id}. Open issues: ${draft.issues.join(" ") || "none"}`,
      submit: true,
      openSidebar: true,
    });
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(draft.mimirSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy failed. Select the summary and copy it by hand.");
    }
  }

  const pf = draft.preflight;

  return (
    <div className="mimir-paper @container min-h-full">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-8 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/studio"
            className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
          >
            <IconArrowLeft className="size-3.5" />
            Studio
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
              {saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved" : "Saved"}
            </span>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Delete draft" onClick={() => setConfirmDelete(true)}>
              <IconTrash className="size-4" />
            </Button>
          </div>
        </div>

        {draft.idea ? (
          <p className="max-w-3xl text-sm text-muted-foreground">
            <span className="mimir-eyebrow mr-2">Idea</span>
            {draft.idea}
          </p>
        ) : null}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div role="radiogroup" aria-label="Market type" className="grid grid-cols-2 gap-2">
              {(["vs", "pool"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={form.kind === k}
                  onClick={() => set("kind", k)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    form.kind === k ? "border-coral bg-coral/[0.07]" : "border-border hover:border-foreground/30",
                  )}
                >
                  <span className="block text-sm font-medium">{k === "vs" ? "VS" : "Pool"}</span>
                  <span className="block text-xs text-muted-foreground">
                    {k === "vs" ? "You back side A; challengers take B." : "Two open sides; anyone stakes either."}
                  </span>
                </button>
              ))}
            </div>

            <Field label="Question" htmlFor="q" used={bytes(form.question)} max={200}>
              <Textarea
                id="q"
                value={form.question}
                onChange={(e) => set("question", e.target.value)}
                rows={3}
                placeholder="Will … by …?"
                className="resize-none bg-background/60 font-display text-2xl leading-tight"
              />
            </Field>

            <div className="grid gap-4 @xl:grid-cols-2">
              <Field label={form.kind === "vs" ? "Side A (yours)" : "Side A"} htmlFor="a" used={bytes(form.sideA)} max={100} dot="bg-coral">
                <Input id="a" value={form.sideA} onChange={(e) => set("sideA", e.target.value)} className="bg-background/60" />
              </Field>
              <Field label={form.kind === "vs" ? "Side B (challengers)" : "Side B"} htmlFor="b" used={bytes(form.sideB)} max={100} dot="bg-foreground/80">
                <Input id="b" value={form.sideB} onChange={(e) => set("sideB", e.target.value)} className="bg-background/60" />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={form.category === c}
                    onClick={() => set("category", c)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      form.category === c
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {CATEGORY_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 @xl:grid-cols-[1fr_1.4fr]">
              <Field label="Deadline (your time)" htmlFor="dl">
                <Input
                  id="dl"
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(e) => set("deadline", e.target.value)}
                  className="bg-background/60 font-mono text-sm"
                />
              </Field>
              <Field label="Resolution source" htmlFor="src" used={bytes(form.resolutionUrl)} max={200}>
                <Input
                  id="src"
                  type="url"
                  value={form.resolutionUrl}
                  onChange={(e) => set("resolutionUrl", e.target.value)}
                  placeholder="https://…"
                  className="bg-background/60 font-mono text-sm"
                />
              </Field>
            </div>

            <Field label="Settlement rule" htmlFor="rule">
              <Textarea
                id="rule"
                value={form.settlementRule}
                onChange={(e) => set("settlementRule", e.target.value)}
                rows={2}
                placeholder="How the source decides A vs B, and what happens on a draw or delay."
                className="resize-none bg-background/60 text-sm"
              />
            </Field>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button variant="outline" className="rounded-full" onClick={askAgent}>
                <IconSparkles className="size-4" />
                Ask the agent to improve it
              </Button>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="mimir-eyebrow">Council preflight</h2>
                {pf?.averageScore != null ? (
                  <span className="font-display text-3xl leading-none">
                    {pf.averageScore}
                    <span className="font-mono text-xs text-muted-foreground">/100</span>
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Personas for the preflight">
                {(roster.data?.personas ?? []).filter((p) => p.usesLlm).map((p) => {
                  const on = panel.includes(p.slug);
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      aria-pressed={on}
                      title={p.displayName}
                      onClick={() =>
                        setPanel((cur) =>
                          on ? cur.filter((s) => s !== p.slug) : cur.length >= PANEL_SIZE ? cur : [...cur, p.slug],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {p.emoji} {p.displayName}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {panel.length ? `${panel.length} of ${PANEL_SIZE} picked.` : "Default panel: Socrates, Aurelius, Statistician."}
              </p>
              <Button onClick={askCouncil} disabled={preflight.isPending} className="rounded-full">
                <IconUsersGroup className="size-4" />
                {preflight.isPending ? "The council is reading…" : pf ? "Ask the council again" : "Ask the council"}
              </Button>
              {preflight.isPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                </div>
              ) : null}
              {pf && !preflight.isPending ? (
                <div className="flex flex-col gap-2">
                  {draft.preflightStale ? (
                    <p className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      <IconAlertTriangle className="size-3.5" />
                      The draft changed since this read.
                    </p>
                  ) : null}
                  {pf.opinions.map((o) => (
                    <article key={o.slug} className="rounded-lg border border-border bg-background/60 p-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span aria-hidden="true">{o.emoji}</span>
                        <span className="font-medium">{o.displayName}</span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
                            o.decision === "open"
                              ? "bg-coral text-white"
                              : o.decision === "revise"
                                ? "bg-foreground text-background"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {o.decision}
                        </span>
                        <span className="ml-auto font-mono text-xs text-muted-foreground">{o.score}</span>
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{o.reasoning}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <h2 className="mimir-eyebrow">Open on Mimir</h2>
              {draft.issues.length ? (
                <ul className="space-y-1">
                  {draft.issues.map((i) => (
                    <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-coral" />
                      {i}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-foreground">
                  <IconCheck className="size-3.5 text-coral" />
                  Ready. Copy the summary, then fill Mimir&apos;s form and sign there.
                </p>
              )}
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-3 font-mono text-[11px] leading-relaxed text-foreground/80">
                {draft.mimirSummary}
              </pre>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => void copySummary()}>
                  {copied ? <IconCheck className="size-4" /> : <IconCopy className="size-4" />}
                  {copied ? "Copied" : "Copy summary"}
                </Button>
                <Button asChild size="sm" className="rounded-full">
                  <a href={draft.createUrl} target="_blank" rel="noreferrer">
                    Open on Mimir
                    <IconArrowUpRight className="size-4" />
                  </a>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Mimir Desk never moves money. You stake and sign on mimirmarkets.xyz.
              </p>
            </section>
          </aside>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>It is removed from your studio. Nothing on Mimir changes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction disabled={remove.isPending} onClick={() => remove.mutate({ id: draft.id })}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  used,
  max,
  dot,
  children,
}: {
  label: string;
  htmlFor: string;
  used?: number;
  max?: number;
  dot?: string;
  children: React.ReactNode;
}) {
  const over = used !== undefined && max !== undefined && used > max;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {dot ? <span className={cn("size-2 rounded-full", dot)} /> : null}
          {label}
        </Label>
        {max !== undefined && used !== undefined ? (
          <span className={cn("font-mono text-[10px]", over ? "text-coral" : "text-muted-foreground")}>
            {used}/{max} bytes
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
