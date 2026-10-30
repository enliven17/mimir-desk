export const CATEGORY_LABEL: Record<string, string> = {
  sports: "Sports",
  weather: "Weather",
  crypto: "Crypto",
  stocks: "Stocks",
  culture: "Culture",
  custom: "Custom",
};

export const CATEGORIES = ["sports", "weather", "crypto", "culture", "custom"] as const;

/** Board filters also cover series categories that the create form does not offer. */
export const BOARD_CATEGORIES = ["sports", "crypto", "stocks", "weather", "culture", "custom"] as const;

export function usd(value: number | string): string {
  const n = typeof value === "string" ? Number(value) || 0 : value;
  if (n === 0) return "$0";
  if (n < 1) return `$${n.toFixed(n < 0.1 ? 4 : 2).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

export function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

/** "3h 12m", "2d 4h", or "closed" for a unix-second deadline. */
export function timeLeft(deadline: number, now = Date.now()): string {
  const s = Math.floor(deadline - now / 1000);
  if (s <= 0) return "closed";
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

export function deadlineLabel(deadline: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(deadline * 1000));
}

export const PHASE_LABEL: Record<string, string> = {
  open: "Taking stakes",
  awaiting: "Awaiting oracle",
  proposed: "Verdict proposed",
  disputed: "Disputed",
  resolved: "Settled",
  cancelled: "Refunded",
};

export function winnerLabel(
  winner: number | null,
  a: string,
  b: string,
): string | null {
  if (winner === 1) return a;
  if (winner === 2) return b;
  if (winner === 3) return "Draw";
  if (winner === 4) return "Refunded";
  return null;
}

export function bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}
