import { cn } from "@/lib/utils";

import { usd } from "./format";

/** Two-sided pool bar: coral for side A, ink for side B. */
export function SplitBar({
  a,
  b,
  labelA,
  labelB,
  winner,
  size = "md",
}: {
  a: number;
  b: number;
  labelA: string;
  labelB: string;
  winner?: number | null;
  size?: "md" | "lg";
}) {
  const total = a + b;
  const pa = total > 0 ? Math.round((a / total) * 100) : 50;
  const lg = size === "lg";
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "flex w-full overflow-hidden rounded-full bg-muted",
          lg ? "h-3" : "h-1.5",
        )}
        role="img"
        aria-label={
          total > 0
            ? `${labelA} ${pa}%, ${labelB} ${100 - pa}%`
            : "No stakes yet"
        }
      >
        {total > 0 ? (
          <>
            <div
              className="h-full bg-coral transition-[width] duration-300"
              style={{ width: `${pa}%` }}
            />
            <div
              className="h-full bg-foreground/80 transition-[width] duration-300"
              style={{ width: `${100 - pa}%` }}
            />
          </>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-2 grid grid-cols-2 gap-3 font-mono text-muted-foreground",
          lg ? "text-sm" : "text-[11px]",
        )}
      >
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-coral" />
          <span
            className={cn(
              "truncate",
              winner === 1 && "font-semibold text-foreground",
            )}
          >
            {labelA}
          </span>
          <span className="shrink-0 text-foreground">{usd(a)}</span>
        </span>
        <span className="flex min-w-0 items-baseline justify-end gap-1.5 text-right">
          <span className="shrink-0 text-foreground">{usd(b)}</span>
          <span
            className={cn(
              "truncate",
              winner === 2 && "font-semibold text-foreground",
            )}
          >
            {labelB}
          </span>
          <span className="size-2 shrink-0 translate-y-[-1px] rounded-full bg-foreground/80" />
        </span>
      </div>
    </div>
  );
}
