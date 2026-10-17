"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  BookmarkCheck,
  CircleSlash,
  Hourglass,
  RotateCcw,
  Search,
  Square,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type SearchFanAccentName = "cobalt" | "plum" | "mint" | "ink";
export type SearchFanStatus = "auto" | "loading" | "error";
export type SearchDecision = "keep" | "drop";
export type SearchQueryState = "ok" | "no-results" | "rate-limited";

/** One query the agent sent. */
export type SearchQuery = {
  id: string;
  text: string;
  /** When it was sent, ms after the call started. */
  at: number;
  /** How the search engine answered. @default "ok" */
  state?: SearchQueryState;
};

/** One result, and what the agent decided about it. */
export type SearchResult = {
  id: string;
  queryId: string;
  /** When it arrived, ms after the call started. */
  at: number;
  domain: string;
  title: string;
  snippet: string;
  url: string;
  /** The agent's call once it has skimmed the result. */
  decision: SearchDecision;
  /** Why, in a sentence. Shown on hover and focus. */
  reason: string;
};

export type SearchFanProps = {
  /** The tool's name, in mono. @default "web_search" */
  call?: string;
  /** What the agent is researching. @default "Basinworks water pricing" */
  topic?: string;
  /** The queries, fanned out from the call. @default defaultSearchQueries */
  queries?: SearchQuery[];
  /** The results with their arrival times and the agent's decisions. @default defaultSearchResults */
  results?: SearchResult[];
  /** Run the call's clock. Pause it and everything holds where it is. @default true */
  playing?: boolean;
  /** When the clock starts: on first sight, or as soon as it mounts. @default "inView" */
  trigger?: "inView" | "mount";
  /** Enter or a click on a result, to open its page. */
  onOpenResult?: (result: SearchResult) => void;
  /** K, or Keep, overrode the agent and kept a result. */
  onKeep?: (result: SearchResult) => void;
  /** D, or Drop, overrode the agent and dropped a result. */
  onDiscard?: (result: SearchResult) => void;
  /** Stop was pressed: nothing more arrives and unread results stay unread. */
  onStop?: () => void;
  /** The last result has been skimmed. */
  onComplete?: () => void;
  /** "auto" plays the call; "loading" and "error" stand in before it starts. @default "auto" */
  status?: SearchFanStatus;
  /** "Try again" was pressed after the call failed. */
  onRetry?: () => void;
  /** When a rate-limited query will try again, as shown. @default "14:05" */
  retryAt?: string;
  /** Tilt of the outermost query tabs, in degrees (0–16). @default 8 */
  fanAngle?: number;
  /** How long the agent skims one result, ms. @default 700 */
  scanSpeed?: number;
  /** The scan line, kept results and focus: a named pigment or any CSS colour. @default "cobalt" */
  accent?: SearchFanAccentName | (string & {});
  /** Read only: results open but cannot be kept or dropped, and Stop is off. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultSearchQueries: SearchQuery[] = [
  { id: "q1", text: "Basinworks residential water tariff 2026", at: 0 },
  { id: "q2", text: "Basinworks tiered pricing drought surcharge", at: 260 },
  {
    id: "q3",
    text: "Basin district water rates comparison",
    at: 520,
    state: "rate-limited",
  },
];

/** What came back, from invented sites, and what the agent made of it. */
export const defaultSearchResults: SearchResult[] = [
  {
    id: "r1",
    queryId: "q1",
    at: 700,
    domain: "basinworks-utility.example",
    title: "Residential tariff schedule, 2026",
    snippet:
      "Volumetric rates per 1,000 gallons across four tiers, effective 1 January 2026.",
    url: "https://basinworks-utility.example/tariffs/2026",
    decision: "keep",
    reason: "The utility’s own 2026 schedule: the primary source.",
  },
  {
    id: "r2",
    queryId: "q1",
    at: 1350,
    domain: "ratewatch.example",
    title: "Basinworks raises its base charge 6%",
    snippet: "The monthly service charge moves from $18.40 to $19.50 in March.",
    url: "https://ratewatch.example/basinworks-base-charge",
    decision: "keep",
    reason: "Dates the base-charge change and gives both figures.",
  },
  {
    id: "r3",
    queryId: "q1",
    at: 2000,
    domain: "forum.tapwater.example",
    title: "Anyone else’s bill jump this month?",
    snippet: "Mine went up almost forty dollars and nobody can tell me why…",
    url: "https://forum.tapwater.example/t/8841",
    decision: "drop",
    reason: "A forum thread: anecdotes, no figures.",
  },
  {
    id: "r9",
    queryId: "q1",
    at: 2650,
    domain: "basinherald.example",
    title: "Council approves the 2026 water budget",
    snippet: "The budget funds two new reservoirs and a meter upgrade…",
    url: "https://basinherald.example/council-water-budget",
    decision: "drop",
    reason: "About the city’s budget, not the rates people pay.",
  },
  {
    id: "r4",
    queryId: "q2",
    at: 1000,
    domain: "basinworks-utility.example",
    title: "Drought surcharge, stage 2 notice",
    snippet: "A surcharge per tier applies while the basin is in stage 2.",
    url: "https://basinworks-utility.example/notices/stage-2",
    decision: "keep",
    reason: "Sets the surcharge for each tier during stage 2.",
  },
  {
    id: "r5",
    queryId: "q2",
    at: 1650,
    domain: "civicledger.example",
    title: "How tiered water pricing works",
    snippet: "Tiered rates charge more per gallon as use goes up. Here’s why…",
    url: "https://civicledger.example/explainers/tiers",
    decision: "drop",
    reason: "A general explainer, nothing specific to Basinworks.",
  },
  {
    id: "r6",
    queryId: "q2",
    at: 2300,
    domain: "openrates.example",
    title: "Basinworks tier thresholds, 2019",
    snippet: "Tier 1 ends at 4,000 gallons, tier 2 at 9,000…",
    url: "https://openrates.example/basinworks/2019",
    decision: "drop",
    reason: "The thresholds changed in 2023; this is out of date.",
  },
  {
    id: "r10",
    queryId: "q2",
    at: 2950,
    domain: "basinworks-utility.example",
    title: "Stage 2 surcharge calculator",
    snippet: "Enter last month’s use to see what the surcharge adds.",
    url: "https://basinworks-utility.example/tools/surcharge",
    decision: "keep",
    reason: "Shows the surcharge applied to real use, from the utility.",
  },
  {
    id: "r7",
    queryId: "q3",
    at: 1300,
    domain: "openrates.example",
    title: "Basin district water rates, compared",
    snippet: "Side-by-side residential rates for five districts, 2026.",
    url: "https://openrates.example/compare/basin-2026",
    decision: "keep",
    reason: "Current rates for five districts in one table.",
  },
  {
    id: "r8",
    queryId: "q3",
    at: 1900,
    domain: "basinherald.example",
    title: "The cheapest water districts in the region",
    snippet: "We ranked the districts by what a family of four pays…",
    url: "https://basinherald.example/cheapest-water",
    decision: "drop",
    reason: "A ranking with no sources given.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

const ACCENTS: Record<SearchFanAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--sf-ink": ACCENTS[accent as SearchFanAccentName] ?? accent,
    "--sf-wash": "color-mix(in oklab, var(--sf-ink) 12%, transparent)",
    "--sf-soft": "color-mix(in oklab, var(--sf-ink) 32%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

type Phase = "scanning" | "keep" | "drop" | "unread";

type Flight = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tx: number;
  ty: number;
  tw: number;
};

/** A row of the kept stack, and the height a flyer lands at. */
const KEPT_ROW = 58;

/** Rect of `el` in the coordinates of `root`. */
const rectIn = (root: HTMLElement, el: Element) => {
  const a = root.getBoundingClientRect();
  const b = el.getBoundingClientRect();
  return {
    x: Math.round(b.left - a.left),
    y: Math.round(b.top - a.top),
    w: Math.round(b.width),
    h: Math.round(b.height),
  };
};

/** A site's mark: its initial on a tile, procedural, never a fetched icon. */
function Glyph({ domain }: { domain: string }) {
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded-1 bg-surface-2 font-mono text-[9px] leading-none text-ink-2 uppercase"
    >
      {domain.charAt(0)}
    </span>
  );
}

/**
 * Where the k-th newly kept row will sit: the stack is a column from 40rem
 * and a sideways strip below it, so the slot is read from the stack itself.
 */
function keptSlot(root: HTMLElement, stack: HTMLElement, k: number) {
  stack.scrollTop = 0;
  stack.scrollLeft = 0;
  const box = rectIn(root, stack);
  const row = stack.querySelector('[data-sf-item^="kept:"]');
  const across = getComputedStyle(stack).flexDirection === "row";
  const w = row ? Math.round(row.getBoundingClientRect().width) : box.w;
  return across
    ? { tx: box.x + k * (w + 6), ty: box.y, tw: w }
    : { tx: box.x, ty: box.y + k * (KEPT_ROW + 6), tw: box.w };
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A web search tool call, shown while it works. The agent's queries fan out
 * from the call as tabs — tilted like a hand of cards by `fanAngle`, landing
 * from the call on `snap` a `cascade()` apart — and result cards stream in
 * under each on `glide`. A scan line skims every card in `scanSpeed` ms;
 * when it reaches the bottom the agent's decision lands: a kept card lifts
 * and flies into the Kept stack on `glide` (a measured flyer, so it travels
 * between scrolling columns), a dropped card falls away on the exit ease and
 * leaves a slim stub. The reason for either shows on hover and focus.
 *
 * The call runs on its own clock, from `at` times in the data, as one chain
 * of timers that stops when the call is off screen, the page is hidden, or
 * everything has landed. Cards are one roving group: arrows move by where
 * the cards actually are, Enter opens, K keeps and D drops to override the
 * agent. Below a 40rem container the fan shows one query at a time. Under
 * reduced motion cards appear without travel, the scan is a brief tint, and
 * kept cards appear in the stack with a fade.
 */
export function SearchFan({
  call = "web_search",
  topic = "Basinworks water pricing",
  queries = defaultSearchQueries,
  results = defaultSearchResults,
  playing = true,
  trigger = "inView",
  onOpenResult,
  onKeep,
  onDiscard,
  onStop,
  onComplete,
  status = "auto",
  onRetry,
  retryAt = "14:05",
  fanAngle = 8,
  scanSpeed = 700,
  accent = "cobalt",
  disabled = false,
  className,
}: SearchFanProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  const stackRef = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);
  const [pageHidden, setPageHidden] = React.useState(false);
  const [started, setStarted] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [stoppedAt, setStoppedAt] = React.useState<number | null>(null);
  const [overrides, setOverrides] = React.useState<
    Record<string, SearchDecision>
  >({});
  const [flights, setFlights] = React.useState<Flight[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const scan = Math.round(clamp(scanSpeed, 200, 3000));
  const angle = clamp(fanAngle, 0, 16);
  const n = queries.length;

  /* ------------------------------- clock -------------------------------- */

  React.useEffect(() => {
    if (!root || typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(() => {
        setVisible(true);
        setStarted(true);
      }, 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        const on = !!entry?.isIntersecting;
        setVisible(on);
        if (on) setStarted(true);
      },
      { threshold: 0.15 },
    );
    io.observe(root);
    const onVis = () => setPageHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [root]);

  React.useEffect(() => {
    if (trigger !== "mount") return;
    const t = window.setTimeout(() => setStarted(true), 0);
    return () => window.clearTimeout(t);
  }, [trigger]);

  const limitAt = (q: SearchQuery) => {
    const mine = results.filter((r) => r.queryId === q.id);
    return Math.max(q.at, ...mine.map((r) => r.at)) + 420;
  };

  const times = React.useMemo(() => {
    const set = new Set<number>();
    for (const q of queries) {
      set.add(q.at);
      if (q.state && q.state !== "ok") set.add(limitAt(q));
    }
    for (const r of results) {
      set.add(r.at);
      set.add(r.at + scan);
    }
    return [...set].sort((a, b) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- limitAt reads only queries and results.
  }, [queries, results, scan]);
  const end = times[times.length - 1] ?? 0;
  const clockNow = stoppedAt ?? elapsed;
  const done = stoppedAt === null && elapsed >= end;
  const running =
    status === "auto" && started && playing && stoppedAt === null && !done;

  const phaseOf = (r: SearchResult): Phase | null => {
    if (clockNow < r.at) return null;
    const own = overrides[r.id];
    if (own) return own;
    if (clockNow >= r.at + scan) return r.decision;
    return stoppedAt !== null ? "unread" : "scanning";
  };

  // The timer reads the latest props through a ref, so a host re-render
  // never restarts the wait for the next event.
  const latest = React.useRef({
    results,
    overrides,
    root,
    motionSafe,
    onComplete,
    end,
    scan,
  });
  React.useEffect(() => {
    latest.current = {
      results,
      overrides,
      root,
      motionSafe,
      onComplete,
      end,
      scan,
    };
  });

  React.useEffect(() => {
    if (!running || !visible || pageHidden) return;
    const next = times.find((t) => t > elapsed);
    if (next === undefined) return;
    const timer = window.setTimeout(
      () => {
        const { results, overrides, root, motionSafe, onComplete, end, scan } =
          latest.current;
        // Kept cards about to land are measured now, while they are still
        // full cards in their columns, so each can fly to the stack.
        const landing = results.filter(
          (r) =>
            r.at + scan === next && r.decision === "keep" && !overrides[r.id],
        );
        if (landing.length && root && motionSafe) {
          const stack = stackRef.current;
          const out: Flight[] = [];
          landing.forEach((r, k) => {
            const card = root.querySelector(
              `[data-sf-card="${CSS.escape(r.id)}"]`,
            );
            if (!card || !stack || card.getClientRects().length === 0) return;
            out.push({
              id: r.id,
              ...rectIn(root, card),
              ...keptSlot(root, stack, k),
            });
          });
          if (out.length) setFlights((f) => [...f, ...out]);
        }
        setElapsed(next);
        const decided = results.filter((r) => r.at + scan === next);
        if (decided.length) {
          const kept = results.filter(
            (r) =>
              next >= r.at + scan && (overrides[r.id] ?? r.decision) === "keep",
          ).length;
          const read = results.filter((r) => next >= r.at + scan).length;
          setAnnouncement(
            `${plural(read, "result")} read, ${kept} kept.${next === end ? " Search done." : ""}`,
          );
        }
        if (next === end) onComplete?.();
      },
      Math.max(0, next - elapsed),
    );
    return () => window.clearTimeout(timer);
  }, [running, visible, pageHidden, times, elapsed]);

  // A flight that is cut short still lands: the stack row shows regardless.
  React.useEffect(() => {
    if (flights.length === 0) return;
    const t = window.setTimeout(() => setFlights([]), 900);
    return () => window.clearTimeout(t);
  }, [flights]);

  /* ---------------------------- interactions ---------------------------- */

  const arrived = results.filter((r) => clockNow >= r.at);
  const keptList = arrived
    .filter((r) => phaseOf(r) === "keep")
    .sort(
      (a, b) =>
        (overrides[b.id] ? 1e9 : b.at + scan) -
        (overrides[a.id] ? 1e9 : a.at + scan),
    );
  const readCount = arrived.filter((r) => {
    const p = phaseOf(r);
    return p === "keep" || p === "drop";
  }).length;

  const decide = (r: SearchResult, d: SearchDecision) => {
    if (disabled || phaseOf(r) === d) return;
    if (d === "keep" && root && motionSafe) {
      const stack = stackRef.current;
      const from = root.querySelector(`[data-sf-item="${CSS.escape(r.id)}"]`);
      if (stack && from && from.getClientRects().length > 0) {
        const flight = {
          id: r.id,
          ...rectIn(root, from),
          ...keptSlot(root, stack, 0),
        };
        setFlights((f) => [...f, flight]);
      }
    }
    setOverrides((o) => ({ ...o, [r.id]: d }));
    if (d === "keep") onKeep?.(r);
    else onDiscard?.(r);
    setAnnouncement(`${d === "keep" ? "Kept" : "Dropped"}: ${r.title}.`);
  };

  const stop = () => {
    if (disabled || stoppedAt !== null || done) return;
    setStoppedAt(elapsed);
    onStop?.();
    setAnnouncement("Search stopped.");
  };

  const queryOrder = queries.map((q) => q.id);
  // One query at a time follows the work without flicking between columns:
  // the first query still being read, then the one that finished last.
  const pendingQuery = queries.find(
    (q) =>
      clockNow >= q.at &&
      results.some(
        (r) => r.queryId === q.id && clockNow < r.at + scan && !overrides[r.id],
      ),
  );
  const lastQuery = results
    .filter((r) => clockNow >= r.at + scan)
    .sort((a, b) => b.at - a.at)[0]?.queryId;
  const shownTab =
    tab && queryOrder.includes(tab)
      ? tab
      : (pendingQuery?.id ?? lastQuery ?? queryOrder[0] ?? null);

  const focusItem = (id: string) => {
    setActiveId(id);
    root
      ?.querySelector<HTMLElement>(`[data-sf-item="${CSS.escape(id)}"]`)
      ?.focus();
  };

  /** Arrow keys move by where the items really are, in either layout. */
  const onItemKey = (e: React.KeyboardEvent<HTMLElement>, r: SearchResult) => {
    const k = e.key;
    if (k === "Enter") {
      e.preventDefault();
      onOpenResult?.(r);
      return;
    }
    if ((k === "k" || k === "K") && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      decide(r, "keep");
      return;
    }
    if ((k === "d" || k === "D") && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      decide(r, "drop");
      return;
    }
    if (!root) return;
    const items = [
      ...root.querySelectorAll<HTMLElement>("[data-sf-item]"),
    ].filter((el) => el.getClientRects().length > 0);
    if (k === "Home" || k === "End") {
      e.preventDefault();
      const target = k === "Home" ? items[0] : items[items.length - 1];
      const id = target?.getAttribute("data-sf-item");
      if (id) focusItem(id);
      return;
    }
    const dir =
      k === "ArrowUp"
        ? [0, -1]
        : k === "ArrowDown"
          ? [0, 1]
          : k === "ArrowLeft"
            ? [-1, 0]
            : k === "ArrowRight"
              ? [1, 0]
              : null;
    if (!dir) return;
    e.preventDefault();
    const me = e.currentTarget.getBoundingClientRect();
    const cx = me.left + me.width / 2;
    const cy = me.top + me.height / 2;
    let best: HTMLElement | null = null;
    let score = Infinity;
    for (const el of items) {
      if (el === e.currentTarget) continue;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - cx;
      const dy = b.top + b.height / 2 - cy;
      const along = dx * (dir[0] ?? 0) + dy * (dir[1] ?? 0);
      if (along <= 4) continue;
      const across = Math.abs(dir[0] ? dy : dx);
      const s = along + across * 3;
      if (s < score) {
        score = s;
        best = el;
      }
    }
    const id = best?.getAttribute("data-sf-item");
    if (id) {
      focusItem(id);
      return;
    }
    // One query at a time: off the edge, sideways moves to the next query.
    if (dir[0] !== 0) {
      const at = queryOrder.indexOf(shownTab ?? "");
      const nextQ = queryOrder[at + (dir[0] ?? 0)];
      if (nextQ) {
        setTab(nextQ);
        const first = arrived.find((x) => x.queryId === nextQ);
        if (first) window.setTimeout(() => focusItem(first.id), 0);
      }
    }
  };

  /* -------------------------------- parts ------------------------------- */

  const itemIds = [
    ...arrived.map((r) => r.id),
    ...keptList.map((r) => `kept:${r.id}`),
  ];
  const tabbable =
    activeId && itemIds.includes(activeId) ? activeId : (itemIds[0] ?? null);

  const itemProps = (
    r: SearchResult,
    describedBy: string,
    itemId: string = r.id,
  ) => ({
    "data-sf-item": itemId,
    tabIndex: tabbable === itemId ? 0 : -1,
    onFocus: () => {
      setActiveId(itemId);
      setHoverId(r.id);
    },
    onBlur: () => setHoverId((h) => (h === r.id ? null : h)),
    onPointerEnter: () => setHoverId(r.id),
    onPointerLeave: () => setHoverId((h) => (h === r.id ? null : h)),
    onClick: () => onOpenResult?.(r),
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => onItemKey(e, r),
    "aria-describedby": describedBy,
  });

  const columnFor = (q: SearchQuery) => {
    const mine = arrived
      .filter((r) => r.queryId === q.id)
      .sort((a, b) => a.at - b.at);
    const limited =
      q.state && q.state !== "ok" && clockNow >= limitAt(q) ? q.state : null;
    return (
      <motion.div
        key={q.id}
        role="group"
        aria-label={`Results for ${q.text}`}
        layoutScroll
        className={cn(
          "flex min-w-0 [scrollbar-width:thin] flex-col gap-2 overflow-y-auto overscroll-contain p-1",
          shownTab === q.id ? "flex" : "hidden @min-[40rem]:flex",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {mine.map((r) => {
            const phase = phaseOf(r);
            const why = `${uid}-why-${r.id}`;
            if (phase === "keep" || phase === "drop") {
              const kept = phase === "keep";
              return (
                <motion.button
                  key={`${r.id}-stub`}
                  type="button"
                  {...itemProps(r, why)}
                  aria-label={`${kept ? "Kept" : "Dropped"}: ${r.title}, ${r.domain}`}
                  title={r.reason}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.blink },
                  }}
                  transition={{
                    opacity: {
                      duration: durations.base,
                      delay: kept ? 0.1 : 0.16,
                    },
                    layout: springs.glide,
                  }}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1.5 rounded-2 border px-2 text-left text-[11px] transition-colors",
                    kept
                      ? "border-[var(--sf-soft)] bg-[var(--sf-wash)] text-[var(--sf-ink)]"
                      : "border-dashed border-hairline-strong text-ink-3 hover:text-ink-2",
                    FOCUS,
                  )}
                >
                  {kept ? (
                    <ArrowUpRight aria-hidden className="size-3 shrink-0" />
                  ) : (
                    <CircleSlash aria-hidden className="size-3 shrink-0" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      !kept && "line-through decoration-ink-3/60",
                    )}
                  >
                    {r.title}
                  </span>
                  <span id={why} className="sr-only">
                    {`${kept ? "Kept" : "Dropped"} because: ${r.reason} K keeps, D drops.`}
                  </span>
                </motion.button>
              );
            }
            const scanning = phase === "scanning";
            return (
              <motion.button
                key={`${r.id}-card`}
                type="button"
                data-sf-card={r.id}
                {...itemProps(r, why)}
                aria-label={`${scanning ? "Skimming" : "Not read"}: ${r.title}, ${r.domain}`}
                layout={motionSafe ? "position" : false}
                initial={
                  motionSafe
                    ? { opacity: 0, y: distances.step }
                    : { opacity: 0 }
                }
                animate={{ opacity: 1, y: 0 }}
                exit={
                  // A kept card hands over to its flyer at once; a dropped
                  // one falls away.
                  r.decision === "keep" && motionSafe
                    ? { opacity: 0, transition: { duration: durations.blink } }
                    : {
                        opacity: 0,
                        y: motionSafe ? distances.step : 0,
                        transition: {
                          duration: durations.base * 0.8,
                          ease: easings.exit,
                        },
                      }
                }
                transition={{
                  y: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.base, ease: easings.enter },
                  layout: springs.glide,
                }}
                className={cn(
                  "relative flex shrink-0 flex-col gap-1 overflow-hidden rounded-3 border border-hairline bg-card p-2.5 text-left shadow-[var(--shadow-raised)] transition-colors hover:border-hairline-strong",
                  FOCUS,
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Glyph domain={r.domain} />
                  <span className="truncate font-mono text-[10px] text-ink-3">
                    {r.domain}
                  </span>
                </span>
                <span className="line-clamp-2 text-[12px] leading-4 font-medium text-foreground">
                  {r.title}
                </span>
                <span className="line-clamp-2 text-[11px] leading-[15px] text-ink-2">
                  {r.snippet}
                </span>
                {scanning ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                  >
                    {motionSafe ? (
                      <motion.span
                        className="absolute inset-x-0 top-0 h-full border-b-2 border-[var(--sf-ink)] bg-[linear-gradient(to_bottom,transparent,var(--sf-wash))]"
                        initial={{ y: "-100%" }}
                        animate={{ y: "0%" }}
                        transition={{
                          duration: scan / 1000,
                          ease: easings.linear,
                        }}
                      />
                    ) : (
                      // Reduced motion: the skim is a tint, not a sweep.
                      <motion.span
                        className="absolute inset-0 bg-[var(--sf-wash)]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: durations.base }}
                      />
                    )}
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-ink-3">
                    not read
                  </span>
                )}
                <span id={why} className="sr-only">
                  {scanning
                    ? "The agent is reading this result."
                    : "Stopped before it was read."}
                  {" K keeps, D drops."}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
        {limited ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base }}
            className={cn(
              "flex shrink-0 flex-col gap-1 rounded-3 border p-2.5 text-[11px] leading-4",
              limited === "rate-limited"
                ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[repeating-linear-gradient(135deg,color-mix(in_oklab,var(--warn)_8%,transparent)_0_6px,transparent_6px_12px)] text-ink-2"
                : "border-dashed border-hairline-strong text-ink-3",
            )}
          >
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {limited === "rate-limited" ? (
                <Hourglass aria-hidden className="size-3 shrink-0 text-warn" />
              ) : (
                <CircleSlash aria-hidden className="size-3 shrink-0" />
              )}
              {limited === "rate-limited" ? "Rate limited" : "No results"}
            </span>
            {limited === "rate-limited"
              ? `The search engine asked us to slow down. Retrying at ${retryAt}.`
              : "Nothing came back for this query."}
          </motion.div>
        ) : null}
        {mine.length === 0 && !limited ? (
          <div aria-hidden className="flex flex-col gap-2">
            {[0, 1].map((k) => (
              <span
                key={k}
                className="h-16 rounded-3 border border-dashed border-hairline"
              />
            ))}
          </div>
        ) : null}
      </motion.div>
    );
  };

  const tabState = (q: SearchQuery) => {
    const count = arrived.filter((r) => r.queryId === q.id).length;
    const limited = q.state && q.state !== "ok" && clockNow >= limitAt(q);
    if (limited)
      return {
        word: q.state === "rate-limited" ? "rate limited" : "no results",
        tone: q.state === "rate-limited" ? "text-warn" : "text-ink-3",
        count,
      };
    if (clockNow < q.at) return { word: "queued", tone: "text-ink-3", count };
    const pending = results.some(
      (r) => r.queryId === q.id && clockNow < r.at + scan,
    );
    return pending && stoppedAt === null
      ? { word: "searching", tone: "text-[var(--sf-ink)]", count }
      : { word: plural(count, "result"), tone: "text-ink-3", count };
  };

  const step = cascade(n);
  // The fan: each tab tilted by its distance from the middle.
  const tiltOf = (i: number) =>
    n > 1 ? r3((angle * (i - (n - 1) / 2)) / ((n - 1) / 2)) : 0;

  const fanWide = (
    <div className="relative hidden @min-[40rem]:block">
      <div className="flex [width:calc((100%-0.75rem*var(--sf-n))*var(--sf-n)/(var(--sf-n)+1)+0.75rem*(var(--sf-n)-1))] justify-center">
        <span className="relative z-[1] inline-flex h-7 items-center gap-1.5 rounded-full border border-[var(--sf-soft)] bg-background px-3 font-mono text-[11px] text-[var(--sf-ink)]">
          <Search aria-hidden className="size-3" />
          {call}
        </span>
      </div>
      <div className="relative mt-3 grid grid-cols-[repeat(var(--sf-n),minmax(0,1fr))_minmax(0,1fr)] gap-3">
        <svg
          aria-hidden
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
          className="pointer-events-none absolute -top-3 left-0 h-5 [width:calc((100%-0.75rem*var(--sf-n))*var(--sf-n)/(var(--sf-n)+1)+0.75rem*(var(--sf-n)-1))] overflow-visible"
        >
          {queries.map((q, i) => {
            const x = r3(((i + 0.5) / n) * 100);
            return (
              <motion.path
                key={q.id}
                d={`M 50 0 C 50 10 ${x} 8 ${x} 20`}
                fill="none"
                vectorEffect="non-scaling-stroke"
                className="stroke-[var(--sf-soft)]"
                strokeWidth={1.25}
                initial={false}
                animate={{ opacity: started || !motionSafe ? 1 : 0 }}
                transition={{
                  duration: durations.base,
                  delay: started ? i * step + 0.15 : 0,
                }}
              />
            );
          })}
        </svg>
        {queries.map((q, i) => {
          const st = tabState(q);
          const tilt = tiltOf(i);
          return (
            <motion.div
              key={q.id}
              className="relative z-[1] flex min-w-0 flex-col gap-0.5 rounded-3 border border-hairline-strong bg-surface-1 px-2.5 py-2"
              initial={false}
              animate={
                started || !motionSafe
                  ? {
                      x: "0%",
                      rotate: tilt,
                      y: r3(Math.abs(tilt) * 0.45),
                    }
                  : // Before the call: the hand is closed under the call,
                    // the tabs stacked like cards, the last on top.
                    {
                      x: `${r3((n / 2 - i - 0.5) * 100)}%`,
                      rotate: r3((i - (n - 1) / 2) * 2.5),
                      y: i * 3,
                    }
              }
              transition={
                motionSafe
                  ? { ...springs.snap, delay: started ? i * step : 0 }
                  : { duration: 0 }
              }
              style={{ originX: 0.5, originY: 0 }}
            >
              <span
                className="line-clamp-2 text-[12px] leading-4 font-medium text-foreground"
                title={q.text}
              >
                {q.text}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] tracking-[0.04em] uppercase",
                  st.tone,
                )}
              >
                {st.word}
              </span>
            </motion.div>
          );
        })}
        <div className="flex min-w-0 flex-col justify-end gap-0.5 px-1 pb-1">
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
            <BookmarkCheck
              aria-hidden
              className="size-3.5 text-[var(--sf-ink)]"
            />
            {`Kept · ${keptList.length}`}
          </span>
        </div>
      </div>
    </div>
  );

  const shownIndex = Math.max(0, queryOrder.indexOf(shownTab ?? ""));
  const fanNarrow = (
    <div
      role="tablist"
      aria-label="Queries"
      className="relative h-[4.5rem] overflow-hidden @min-[40rem]:hidden"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const next =
          queryOrder[
            clamp(shownIndex + (e.key === "ArrowLeft" ? -1 : 1), 0, n - 1)
          ];
        if (next) {
          setTab(next);
          root
            ?.querySelector<HTMLElement>(`[data-sf-tab="${CSS.escape(next)}"]`)
            ?.focus();
        }
      }}
    >
      {queries.map((q, i) => {
        const k = i - shownIndex;
        const st = tabState(q);
        const selected = k === 0;
        return (
          <motion.button
            key={q.id}
            type="button"
            role="tab"
            data-sf-tab={q.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setTab(q.id)}
            initial={false}
            animate={{
              x: `${r3(k * 16)}%`,
              rotate: r3(k * angle * 0.7),
              y: Math.abs(k) * 5,
              scale: r3(1 - Math.abs(k) * 0.05),
              opacity: Math.abs(k) > 1 ? 0 : selected ? 1 : 0.7,
            }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
            className={cn(
              "absolute top-1 left-[12%] flex w-[76%] flex-col gap-0.5 rounded-3 border bg-surface-1 px-3 py-2 text-left",
              selected ? "border-[var(--sf-soft)]" : "border-hairline-strong",
              FOCUS,
            )}
            style={{ zIndex: n - Math.abs(k), originX: 0.5, originY: 1 }}
          >
            {/* Tabs behind the front one are blank card edges: one query at a time. */}
            <motion.span
              className="flex min-w-0 flex-col gap-0.5"
              initial={false}
              animate={{ opacity: selected ? 1 : 0 }}
              transition={{ duration: durations.fast }}
            >
              <span className="truncate text-[12px] leading-4 font-medium text-foreground">
                {q.text}
              </span>
              <span
                className={cn(
                  "font-mono text-[10px] tracking-[0.04em] uppercase",
                  st.tone,
                )}
              >
                {`${i + 1} of ${n} · ${st.word}`}
              </span>
            </motion.span>
          </motion.button>
        );
      })}
    </div>
  );

  const kept = (
    <div
      role="group"
      aria-label={`Kept, ${keptList.length}`}
      className="order-last flex min-w-0 flex-col gap-1.5 rounded-3 border border-hairline bg-surface-1 p-1.5 @min-[40rem]:border-0 @min-[40rem]:bg-transparent @min-[40rem]:p-1"
    >
      <span className="flex items-center gap-1.5 px-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase @min-[40rem]:hidden">
        <BookmarkCheck aria-hidden className="size-3.5 text-[var(--sf-ink)]" />
        {`Kept · ${keptList.length}`}
      </span>
      <motion.div
        ref={stackRef}
        layoutScroll
        className="flex min-w-0 [scrollbar-width:thin] flex-row gap-1.5 overflow-x-auto overscroll-contain @min-[40rem]:flex-col @min-[40rem]:overflow-x-visible @min-[40rem]:overflow-y-auto"
      >
        {keptList.length === 0 ? (
          <span className="flex h-12 w-full shrink-0 items-center justify-center rounded-3 border border-dashed border-hairline px-2 text-center text-[11px] text-ink-3">
            Nothing kept yet
          </span>
        ) : null}
        <AnimatePresence initial={false}>
          {keptList.map((r) => {
            const flying = flights.some((f) => f.id === r.id);
            const why = `${uid}-kept-${r.id}`;
            return (
              <motion.button
                key={r.id}
                type="button"
                {...itemProps(r, why, `kept:${r.id}`)}
                aria-label={`Kept: ${r.title}, ${r.domain}`}
                layout={motionSafe ? "position" : false}
                initial={{
                  opacity: 0,
                  y: motionSafe && !flying ? -distances.step : 0,
                }}
                animate={{ opacity: flying ? 0 : 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? distances.step : 0,
                  transition: {
                    duration: durations.base * 0.8,
                    ease: easings.exit,
                  },
                }}
                transition={{
                  opacity: { duration: flying ? 0 : durations.fast },
                  y: motionSafe ? springs.glide : { duration: 0 },
                  layout: springs.glide,
                }}
                className={cn(
                  "flex w-44 shrink-0 flex-col gap-0.5 rounded-2 border border-[var(--sf-soft)] bg-card px-2 py-1.5 text-left @min-[40rem]:w-auto",
                  FOCUS,
                )}
                style={{ height: KEPT_ROW }}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <Glyph domain={r.domain} />
                  <span className="truncate font-mono text-[10px] text-ink-3">
                    {r.domain}
                  </span>
                </span>
                <span className="line-clamp-2 text-[11px] leading-[14px] font-medium text-foreground">
                  {r.title}
                </span>
                <span id={why} className="sr-only">
                  {`Kept because: ${r.reason} D drops it.`}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );

  const hovered = hoverId ? results.find((r) => r.id === hoverId) : undefined;
  const hoveredPhase = hovered ? phaseOf(hovered) : null;

  const statusLine =
    status === "loading"
      ? "Starting the search"
      : status === "error"
        ? "The search failed"
        : !started
          ? `Ready · ${plural(n, "query", "queries")}`
          : stoppedAt !== null
            ? `Stopped · ${keptList.length} kept of ${plural(readCount, "result")} read`
            : done
              ? `Done · ${keptList.length} kept of ${plural(results.length, "result")}`
              : `Searching · ${plural(n, "query", "queries")} · ${readCount} of ${arrived.length} read · ${keptList.length} kept`;

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-busy
        className="grid grid-cols-1 gap-3 p-4 @min-[40rem]:grid-cols-4"
      >
        <span className="sr-only">Starting the search</span>
        {[0, 1, 2, 3].map((k) => (
          <span key={k} aria-hidden className="h-24 rounded-3 bg-surface-2" />
        ))}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-ink-2">The search call failed.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    body = (
      <>
        <div className="shrink-0 px-4 pt-1 pb-3">
          {fanWide}
          {fanNarrow}
        </div>
        <div className="grid flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_auto] gap-3 overflow-hidden px-3 pb-2 @min-[40rem]:grid-cols-[repeat(var(--sf-n),minmax(0,1fr))_minmax(0,1fr)] @min-[40rem]:grid-rows-[minmax(0,1fr)] @min-[40rem]:px-4">
          {queries.map((q) => columnFor(q))}
          {kept}
        </div>
      </>
    );
  }

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex h-[34rem] max-h-full w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={{ ...accentVars(accent), "--sf-n": n } as React.CSSProperties}
    >
      <header className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span
          aria-hidden
          className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--sf-wash)] text-[var(--sf-ink)] @min-[20rem]:flex"
        >
          <Search className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <h2
            id={titleId}
            className="truncate text-[15px] leading-5 font-semibold"
          >
            {topic}
          </h2>
          <p
            className="truncate font-mono text-[11px] leading-4 text-ink-3"
            title={statusLine}
          >
            {`${call} · ${statusLine}`}
          </p>
        </div>
        {running ? (
          <button
            type="button"
            onClick={stop}
            aria-disabled={disabled || undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <Square aria-hidden className="size-3 fill-current" />
            Stop
          </button>
        ) : null}
      </header>
      {body}
      <div className="shrink-0 border-t border-hairline px-4 py-2">
        <p className="truncate text-[11px] leading-4 text-ink-3" aria-hidden>
          {hovered && (hoveredPhase === "keep" || hoveredPhase === "drop") ? (
            <>
              <span
                className={cn(
                  "font-mono uppercase",
                  hoveredPhase === "keep"
                    ? "text-[var(--sf-ink)]"
                    : "text-ink-2",
                )}
              >
                {hoveredPhase === "keep" ? "kept" : "dropped"}
              </span>
              {` · ${hovered.reason}`}
            </>
          ) : hovered ? (
            `${hovered.domain} · ${hoveredPhase === "scanning" ? "being read" : "not read"}`
          ) : (
            "Hover or focus a result for the agent’s reason. K keeps, D drops."
          )}
        </p>
      </div>
      {/* Flyers: kept cards on their way to the stack, drawn over everything. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        {flights.map((f) => {
          const r = results.find((x) => x.id === f.id);
          if (!r) return null;
          return (
            <motion.div
              key={`${f.id}-${f.x}-${f.y}`}
              className="absolute top-0 left-0 flex flex-col gap-0.5 overflow-hidden rounded-2 border border-[var(--sf-soft)] bg-card px-2 py-1.5 shadow-lg"
              initial={{ x: f.x, y: f.y, width: f.w, height: f.h, scale: 1.03 }}
              animate={{
                x: f.tx,
                y: f.ty,
                width: f.tw,
                height: KEPT_ROW,
                scale: 1,
              }}
              transition={springs.glide}
              onAnimationComplete={() =>
                setFlights((all) => all.filter((x) => x !== f))
              }
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <Glyph domain={r.domain} />
                <span className="truncate font-mono text-[10px] text-ink-3">
                  {r.domain}
                </span>
              </span>
              <span className="line-clamp-2 text-[11px] leading-[14px] font-medium text-foreground">
                {r.title}
              </span>
            </motion.div>
          );
        })}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
