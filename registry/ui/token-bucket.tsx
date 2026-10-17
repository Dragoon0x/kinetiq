"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUpToLine,
  Check,
  Droplets,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type TokenBucketLiquid = "water" | "flat" | "cells";
export type TokenBucketAccentName = "cobalt" | "plum" | "mint" | "ink";
export type TokenBucketStatus = "live" | "paused" | "loading" | "error";
export type TokenBucketOutcome = "served" | "queued" | "refused";

/** A request as it left the client: when, how big, and where to. */
export type TokenBucketArrival = {
  id: string;
  /** When the request was made, ms since the epoch. */
  at: number;
  /** What it costs against the limit. */
  tokens: number;
  /** The endpoint, e.g. "/v1/answer". */
  route: string;
  /** The API key that sent it. */
  key?: string;
};

/** A request and what the limit did with it. */
export type TokenBucketRequest = TokenBucketArrival & {
  status: TokenBucketOutcome;
  /** When it was let through, ms. Later than `at` when it had to wait. */
  servedAt?: number;
};

export type TokenBucketSimulation = {
  /** Tokens available at `now`. */
  level: number;
  /** Every arrival up to `now`, oldest first, with its outcome. */
  requests: TokenBucketRequest[];
  /** When the current throttle lifts, or null. */
  throttledUntil: number | null;
};

export type TokenBucketSimulationOptions = {
  capacity: number;
  /** Tokens per second. */
  refillSpeed: number;
  /** Requests that may wait for tokens before more are refused. @default 3 */
  maxQueue?: number;
  /** How long a refusal throttles every new request, ms. @default 8000 */
  throttleMs?: number;
  /** When the bucket's history begins, ms. @default the first arrival */
  start?: number;
  /** Tokens in the bucket at `start`. @default capacity */
  startLevel?: number;
};

export type TokenBucketProps = {
  /** The size of the bucket: the most tokens you can spend at once. @default 30000 */
  capacity?: number;
  /** Tokens available at `now`, as the limit reports them. @default defaultTokenBucketState.level */
  level?: number;
  /** How fast the plan refills the bucket, tokens per second. @default 500 */
  refillSpeed?: number;
  /** Recent requests, any order; the newest `historySize` are listed and the queued ones hang above the tank. @default defaultTokenBucketState.requests */
  requests?: TokenBucketRequest[];
  /** When the current throttle lifts, ms, or null when nothing is throttled. @default null */
  throttledUntil?: number | null;
  /** The moment the reading was taken, ms. Times and clocks count from it. @default defaultTokenBucketNow */
  now?: number;
  /** Live or paused traffic, or no reading yet. @default "live" */
  status?: TokenBucketStatus;
  /** How many requests the list keeps. @default 10 */
  historySize?: number;
  /** Droplets drawn above the tank before the rest are counted as "+n". @default 6 */
  maxDroplets?: number;
  /** The panel's heading. @default "Waylight API" */
  title?: string;
  /** Under the heading. @default "Team plan · 30k tokens a minute" (from the refill speed) */
  subtitle?: string;
  /** What the bucket holds, in words. @default "tokens" */
  unit?: string;
  /** How a request time is printed. @default UTC hh:mm:ss */
  formatTime?: (ms: number) => string;
  /** How the water is drawn: a rippling translucent fill, a flat solid one, or measured cells. @default "water" */
  liquid?: TokenBucketLiquid;
  /** How much the surface sloshes when a scoop leaves, 0 to 1. @default 0.6 */
  slosh?: number;
  /** The water, the list's highlights and the actions: a named pigment or any CSS colour. @default "cobalt" */
  accent?: TokenBucketAccentName | (string & {});
  /** Controlled: the request list is open in a narrow panel. */
  listOpen?: boolean;
  /** Initial state of the narrow request list when uncontrolled. @default false */
  defaultListOpen?: boolean;
  /** Fires from the Requests toggle with the state it asks for. */
  onListOpenChange?: (open: boolean) => void;
  /** Raise limit was pressed. Omit it and the button is not drawn. */
  onRaiseLimit?: () => void;
  /** Pause or Resume was pressed, with the state it asks for. Omit it and the button is not drawn. */
  onPause?: (paused: boolean) => void;
  /** A request in the list was opened. */
  onInspectRequest?: (request: TokenBucketRequest) => void;
  /** Try again was pressed after the limit could not be read. */
  onRetry?: () => void;
  /** Read only: actions and the list do nothing. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                               Simulation                                 */
/* ----------------------------------------------------------------------- */

/**
 * A token bucket, exactly: the level refills linearly up to capacity, a
 * request takes its tokens if nothing is waiting and they are there, waits in
 * a first-in-first-out queue if not, and is refused once `maxQueue` are
 * waiting — which throttles every request for `throttleMs`. Queued requests
 * are served the instant the level reaches what the head of the queue needs.
 * Pure and deterministic, so the same log renders the same on the server.
 */
export function simulateTokenBucket(
  arrivals: readonly TokenBucketArrival[],
  options: TokenBucketSimulationOptions,
  now: number,
): TokenBucketSimulation {
  const {
    capacity,
    refillSpeed,
    maxQueue = 3,
    throttleMs = 8000,
    start,
    startLevel,
  } = options;
  const sorted = arrivals
    .filter((a) => a.at <= now)
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.at - y.a.at || x.i - y.i)
    .map(({ a }) => a);
  const rate = Math.max(0, refillSpeed) / 1000;
  let level = Math.min(capacity, Math.max(0, startLevel ?? capacity));
  let t = Math.min(start ?? sorted[0]?.at ?? now, now);
  const out: TokenBucketRequest[] = [];
  const queue: TokenBucketRequest[] = [];
  let throttledUntil: number | null = null;

  const advance = (to: number) => {
    while (queue.length > 0) {
      const head = queue[0];
      if (!head) break;
      const need = head.tokens - level;
      const ready = need <= 0 ? t : rate > 0 ? t + need / rate : Infinity;
      if (ready > to) break;
      level = level + (ready - t) * rate - head.tokens;
      t = ready;
      head.status = "served";
      head.servedAt = Math.round(ready);
      queue.shift();
    }
    if (to > t) {
      level = Math.min(capacity, level + (to - t) * rate);
      t = to;
    }
  };

  for (const arrival of sorted) {
    advance(arrival.at);
    const request: TokenBucketRequest = { ...arrival, status: "queued" };
    out.push(request);
    if (
      (throttledUntil !== null && arrival.at < throttledUntil) ||
      arrival.tokens > capacity
    ) {
      request.status = "refused";
    } else if (queue.length === 0 && level >= arrival.tokens) {
      level -= arrival.tokens;
      request.status = "served";
      request.servedAt = arrival.at;
    } else if (queue.length < maxQueue) {
      queue.push(request);
    } else {
      request.status = "refused";
      throttledUntil = arrival.at + throttleMs;
    }
  }
  advance(now);

  return {
    level: Math.max(0, Math.round(level)),
    requests: out,
    throttledUntil:
      throttledUntil !== null && throttledUntil > now ? throttledUntil : null,
  };
}

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** 14:02 UTC on 17 October 2026, when the Waylight log below begins. */
export const defaultTokenBucketStart = Date.UTC(2026, 9, 17, 14, 2, 0);

const arrival = (
  id: string,
  ms: number,
  tokens: number,
  route: string,
  key: string,
): TokenBucketArrival => ({
  id,
  at: defaultTokenBucketStart + ms,
  tokens,
  route,
  key,
});

/**
 * A minute of Waylight traffic on a team plan: a steady trickle from the web
 * app and the support bot, then the nightly eval job bursts nine requests in
 * under a second — the tank empties, three wait, the fourth is refused and
 * the key is throttled — and the traffic calms while the queue drains.
 */
export const defaultTokenBucketArrivals: TokenBucketArrival[] = [
  arrival("rq-01", 400, 2400, "/v1/answer", "web-app"),
  arrival("rq-02", 1500, 1800, "/v1/summarise", "support-bot"),
  arrival("rq-03", 2900, 3200, "/v1/answer", "web-app"),
  arrival("rq-04", 3700, 1400, "/v1/classify", "support-bot"),
  arrival("rq-05", 4500, 2600, "/v1/answer", "web-app"),
  arrival("rq-06", 5200, 4200, "/v1/batch", "nightly-evals"),
  arrival("rq-07", 5320, 3800, "/v1/batch", "nightly-evals"),
  arrival("rq-08", 5440, 4000, "/v1/batch", "nightly-evals"),
  arrival("rq-09", 5560, 3600, "/v1/batch", "nightly-evals"),
  arrival("rq-10", 5680, 4200, "/v1/batch", "nightly-evals"),
  arrival("rq-11", 5800, 3800, "/v1/batch", "nightly-evals"),
  arrival("rq-12", 5920, 4000, "/v1/batch", "nightly-evals"),
  arrival("rq-13", 6040, 3400, "/v1/batch", "nightly-evals"),
  arrival("rq-14", 6300, 3600, "/v1/batch", "nightly-evals"),
  arrival("rq-15", 7400, 1600, "/v1/answer", "web-app"),
  arrival("rq-16", 10200, 2000, "/v1/summarise", "support-bot"),
  arrival("rq-17", 21000, 1200, "/v1/classify", "support-bot"),
  arrival("rq-18", 30000, 1600, "/v1/answer", "web-app"),
  arrival("rq-19", 38000, 1400, "/v1/summarise", "support-bot"),
];

/** The default reading: 2.6 s into the log, the tank about nine-tenths full. */
export const defaultTokenBucketNow = defaultTokenBucketStart + 2600;

export const defaultTokenBucketState: TokenBucketSimulation =
  simulateTokenBucket(
    defaultTokenBucketArrivals,
    {
      capacity: 30000,
      refillSpeed: 500,
      start: defaultTokenBucketStart,
    },
    defaultTokenBucketNow,
  );

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

/** Compact by hand: Intl's compact notation prints differently in Node. */
const compact = (n: number): string => {
  const v = Math.max(0, n);
  const trim = (s: string) => s.replace(/\.0$/, "");
  if (v >= 1e6) return `${trim((v / 1e6).toFixed(1))}M`;
  if (v >= 1e5) return `${Math.round(v / 1e3)}k`;
  if (v >= 1e3) return `${trim((v / 1e3).toFixed(1))}k`;
  return String(Math.round(v));
};

/** 30000 → "30,000", by hand for the same reason. */
const grouped = (n: number): string =>
  String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const pad2 = (n: number) => String(n).padStart(2, "0");

const utcClock = (ms: number): string => {
  const d = new Date(ms);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
};

/** Seconds as m:ss, rounded up so a wait never reads as over early. */
const countdown = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${pad2(s % 60)}`;
};

const plural = (n: number, one: string, other = `${one}s`) =>
  `${n} ${n === 1 ? one : other}`;

const waitedMs = (r: TokenBucketRequest) =>
  r.status === "served" && r.servedAt !== undefined ? r.servedAt - r.at : 0;

const ACCENTS: Record<TokenBucketAccentName, { ink: string; liquid: string }> =
  {
    cobalt: {
      ink: "var(--accent-bright)",
      liquid: "oklch(from var(--accent-bright) 0.7 0.12 h)",
    },
    plum: {
      ink: "oklch(from var(--accent-bright) l c 320)",
      liquid: "oklch(from var(--accent-bright) 0.7 0.12 320)",
    },
    mint: {
      ink: "var(--success)",
      liquid: "oklch(from var(--success) 0.76 0.11 h)",
    },
    ink: {
      ink: "var(--ink-2)",
      liquid: "oklch(from var(--ink-2) 0.66 0.015 h)",
    },
  };

/**
 * The water is pigment, not text: a fixed lightness in both themes so a full
 * tank never reads as mud on the light page.
 */
const accentVars = (accent: string): React.CSSProperties => {
  const named = Object.hasOwn(ACCENTS, accent)
    ? ACCENTS[accent as TokenBucketAccentName]
    : null;
  return {
    "--tb-ink": named?.ink ?? accent,
    "--tb-liquid": named?.liquid ?? `oklch(from ${accent} 0.72 0.12 h)`,
    "--tb-wash": "color-mix(in oklab, var(--tb-ink) 12%, transparent)",
    "--tb-soft": "color-mix(in oklab, var(--tb-ink) 32%, transparent)",
    "--tb-water": "color-mix(in oklab, var(--tb-liquid) 62%, transparent)",
    "--tb-solid": "color-mix(in oklab, var(--tb-liquid) 90%, transparent)",
    "--tb-foam": "color-mix(in oklab, var(--tb-liquid) 55%, white)",
  } as React.CSSProperties;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/* ----------------------------------------------------------------------- */
/*                               Tank geometry                              */
/* ----------------------------------------------------------------------- */

/** The tank is drawn in a 120 × 150 box; the water runs from FLOOR to BRIM. */
const VB_W = 120;
const VB_H = 150;
const WALL_L = 13;
const WALL_R = 107;
const FLOOR = 145;
const BRIM = 40;
const SPAN = FLOOR - BRIM;
const RAIL_Y = 5;
const CELLS = 12;
const CELL_X0 = 17;
const CELL_X1 = 103;
const SEGMENTS = 16;
/** A slab stays drawn this long after its request was served, ms. */
const SLAB_MS = 900;
/** A queued droplet's fall into the water, s. */
const FALL_S = 0.32;

const GLASS =
  "M 6 34 H 12 V 131 Q 12 146 27 146 H 93 Q 108 146 108 131 V 34 H 114";
const INTERIOR = "M 13 28 V 131 Q 13 145 27 145 H 93 Q 107 145 107 131 V 28 Z";

const levelY = (tokens: number, capacity: number) =>
  FLOOR - clamp(capacity > 0 ? tokens / capacity : 0, 0, 1) * SPAN;

/** The surface as points, with a two-sine ripple whose height is `amp` units. */
const surfacePoints = (y: number, amp: number, phase: number): string[] => {
  const out: string[] = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const x = WALL_L + ((WALL_R - WALL_L) * i) / SEGMENTS;
    const wave =
      amp === 0
        ? 0
        : amp *
          (0.68 * Math.sin(x * 0.105 + phase) +
            0.32 * Math.sin(x * 0.23 - phase * 1.6));
    out.push(`${r2(x)} ${r2(y + wave)}`);
  }
  return out;
};

const fillPath = (pts: string[]) =>
  `M ${pts.join(" L ")} L ${WALL_R} ${VB_H} L ${WALL_L} ${VB_H} Z`;
const linePath = (pts: string[]) => `M ${pts.join(" L ")}`;

/** Measured cells, bottom up; the top one part-filled. One path, crisp. */
const cellsPath = (fraction: number, all = false): string => {
  const cellH = SPAN / CELLS;
  const gap = 1.4;
  const filled = clamp(fraction, 0, 1) * CELLS;
  let d = "";
  for (let i = 0; i < CELLS; i += 1) {
    const part = all ? 1 : clamp(filled - i, 0, 1);
    if (part <= 0) break;
    const bottom = FLOOR - i * cellH - gap / 2;
    const top = bottom - (cellH - gap) * part;
    d += `M${CELL_X0} ${r2(bottom)}H${CELL_X1}V${r2(top)}H${CELL_X0}Z`;
  }
  return d;
};

/** A hanging drop: round below, drawn to a point at its top (the rail). */
const tearPath = (r: number): string => {
  const t = r2(-1.6 * r);
  return `M 0 ${t} C ${r2(0.55 * r)} ${r2(-0.95 * r)} ${r2(r)} ${r2(-0.55 * r)} ${r2(r)} 0 A ${r2(r)} ${r2(r)} 0 0 1 ${r2(-r)} 0 C ${r2(-r)} ${r2(-0.55 * r)} ${r2(-0.55 * r)} ${r2(-0.95 * r)} 0 ${t} Z`;
};

const dropRadius = (tokens: number, capacity: number) =>
  r2(clamp(2.6 + 7 * Math.sqrt(Math.max(0, tokens) / capacity), 3, 6.5));

type EngineCfg = {
  capacity: number;
  /** Tokens per ms. */
  rate: number;
  /** The water rises no higher than this until the next reading. */
  ceiling: number;
  /** The eta counts to this level, or null when nothing is pending. */
  etaTarget: number | null;
  liquid: TokenBucketLiquid;
  slosh: number;
  refilling: boolean;
  motionSafe: boolean;
};

type EngineState = {
  anchorLevel: number;
  anchorAt: number;
  lastNow: number | null;
  visual: number;
  dip: number;
  dipping: boolean;
  amp: number;
  pendingKick: number;
  kickAt: number;
  phase: number;
  reanchor:
    | ((level: number, now: number, requests: TokenBucketRequest[]) => void)
    | null;
  wake: (() => void) | null;
};

/* ----------------------------------------------------------------------- */
/*                                  Slabs                                   */
/* ----------------------------------------------------------------------- */

/**
 * The scoop a request took: drawn where it sat on top of the water, then
 * lifted out and evaporated. Its place is fixed when it arrives — the water
 * keeps moving under it, the slab does not.
 */
function Slab({
  top,
  height,
  label,
  delay,
  motionSafe,
}: {
  top: number;
  height: number;
  label: string;
  delay: number;
  motionSafe: boolean;
}) {
  const [frozen] = React.useState(() => ({ top, height }));
  return (
    <motion.g
      aria-hidden
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: [0, 0.9, 0.9, 0], y: motionSafe ? -16 : 0 }}
      transition={{
        opacity: {
          duration: motionSafe ? 0.95 : 0.6,
          times: [0, 0.06, 0.42, 1],
          ease: "easeOut",
          delay,
        },
        y: motionSafe
          ? { ...springs.glide, delay: delay + 0.12 }
          : { duration: 0 },
      }}
    >
      <rect
        x={WALL_L + 0.5}
        y={r2(frozen.top)}
        width={WALL_R - WALL_L - 1}
        height={r2(Math.max(0.8, frozen.height))}
        rx={1.5}
        style={{ fill: "var(--tb-solid)", stroke: "var(--tb-foam)" }}
        strokeWidth={0.75}
      />
      {frozen.height >= 9 ? (
        <text
          x={VB_W / 2}
          y={r2(frozen.top + frozen.height / 2 + 3)}
          textAnchor="middle"
          className="hidden fill-foreground font-mono @[34rem]:inline"
          style={{ fontSize: 8.5 }}
        >
          {label}
        </text>
      ) : null}
    </motion.g>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * An API rate limit as a glass tank of water. The water is what you may
 * spend right now; it rises at the plan's refill speed — linearly, because a
 * steady rate should look steady — and every request lifts out a slab of
 * exactly its size, which floats up out of the tank and evaporates while the
 * surface falls to the new level on `snap` and sloshes. When the water is too
 * low for the next request, requests hang above the tank as droplets sized
 * by their cost, and a dashed line marks the level the first one needs; when
 * the water reaches it, the droplet falls in on the exit ease and its scoop
 * leaves as it lands. A refusal throttles the key and a ring clock counts
 * the retry down.
 *
 * The host owns the truth — `level`, `requests`, `throttledUntil` at `now` —
 * and the tank animates between readings, extrapolating the refill in one
 * animation-frame loop that runs only while something is moving, the tank is
 * on screen and the page is visible. `simulateTokenBucket` turns an arrival
 * log into those props. The last requests sit in a real list beside the
 * tank (behind a toggle in a narrow container) with a roving tabindex; a
 * polite status speaks only changes of state. Under reduced motion the
 * surface steps and nothing sloshes or travels, but the refill still rises.
 */
export function TokenBucket({
  capacity = 30000,
  level = defaultTokenBucketState.level,
  refillSpeed = 500,
  requests = defaultTokenBucketState.requests,
  throttledUntil = null,
  now = defaultTokenBucketNow,
  status = "live",
  historySize = 10,
  maxDroplets = 6,
  title = "Waylight API",
  subtitle,
  unit = "tokens",
  formatTime = utcClock,
  liquid = "water",
  slosh = 0.6,
  accent = "cobalt",
  listOpen,
  defaultListOpen = false,
  onListOpenChange,
  onRaiseLimit,
  onPause,
  onInspectRequest,
  onRetry,
  disabled = false,
  className,
}: TokenBucketProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-list`;
  const clipId = `${uid}-clip`;

  const cap = Math.max(1, capacity);
  const rate = Math.max(0, refillSpeed);
  const ready = status === "live" || status === "paused";
  const paused = status === "paused";
  const throttled = ready && throttledUntil !== null && throttledUntil > now;
  const lvl = clamp(level, 0, cap);

  const [ownOpen, setOwnOpen] = React.useState(defaultListOpen);
  const open = listOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (listOpen === undefined) setOwnOpen(next);
    onListOpenChange?.(next);
  };

  /* ------------------------------ derived ------------------------------- */

  const ordered = React.useMemo(
    () =>
      requests
        .map((r, i) => ({ r, i }))
        .sort((a, b) => a.r.at - b.r.at || a.i - b.i)
        .map(({ r }) => r),
    [requests],
  );
  const queued = React.useMemo(
    () => (ready ? ordered.filter((r) => r.status === "queued") : []),
    [ordered, ready],
  );
  const head = queued[0] ?? null;
  const recent = React.useMemo(
    () => ordered.slice(-Math.max(1, historySize)).reverse(),
    [ordered, historySize],
  );
  const lastMinute = React.useMemo(() => {
    let count = 0;
    let tokens = 0;
    for (const r of ordered) {
      if (
        r.status === "served" &&
        r.servedAt !== undefined &&
        r.servedAt > now - 60000 &&
        r.servedAt <= now
      ) {
        count += 1;
        tokens += r.tokens;
      }
    }
    return { count, tokens };
  }, [ordered, now]);

  /** Requests served in the last moment, newest first: their slabs are in the air. */
  const slabs = React.useMemo(() => {
    if (!ready) return [];
    const fresh = ordered
      .filter(
        (r) =>
          r.status === "served" &&
          r.servedAt !== undefined &&
          r.servedAt <= now &&
          r.servedAt > now - SLAB_MS,
      )
      .sort((a, b) => (b.servedAt ?? 0) - (a.servedAt ?? 0));
    let base = lvl;
    const step = cascade(fresh.length);
    return fresh.map((r, i) => {
      const bottom = levelY(base, cap);
      base += r.tokens;
      const top = levelY(base, cap);
      return {
        id: r.id,
        top,
        height: bottom - top,
        label: `−${compact(r.tokens)}`,
        delay: (waitedMs(r) > 50 ? FALL_S : 0) + (fresh.length - 1 - i) * step,
      };
    });
  }, [ordered, now, lvl, cap, ready]);

  const shownDrops = queued.slice(0, Math.max(0, maxDroplets));
  const overflow = queued.length - shownDrops.length;

  /** Where a droplet lands if it is let through now: the surface its scoop starts from. */
  const exitCtx = React.useMemo(() => {
    const land: Record<string, number> = {};
    for (const r of ordered) {
      if (r.status === "served") {
        land[r.id] = levelY(Math.min(cap, lvl + r.tokens), cap);
      }
    }
    return { land, motionSafe };
  }, [ordered, lvl, cap, motionSafe]);

  const [firstIds] = React.useState(() => new Set(requests.map((r) => r.id)));

  /* ----------------------------- throttle ------------------------------- */

  // The ring clock needs the length of the throttle, which the host never
  // states: it is fixed in the render that first sees this `throttledUntil`.
  const [span, setSpan] = React.useState<{
    until: number;
    from: number;
  } | null>(() =>
    throttled && throttledUntil !== null
      ? { until: throttledUntil, from: now }
      : null,
  );
  if (throttled && throttledUntil !== null && span?.until !== throttledUntil) {
    setSpan({ until: throttledUntil, from: now });
  }
  const retryIn =
    throttled && throttledUntil !== null ? throttledUntil - now : 0;
  const ringFrac =
    throttled && span && span.until > span.from
      ? r3(clamp(retryIn / (span.until - span.from), 0, 1))
      : 0;

  /* --------------------------- announcements ---------------------------- */

  const situation = !ready
    ? status
    : throttled
      ? "throttled"
      : queued.length > 0
        ? "queued"
        : lvl >= cap
          ? "full"
          : "flowing";
  const sentence = (): string => {
    switch (situation) {
      case "throttled":
        return `Throttled. New requests are refused for ${Math.ceil(retryIn / 1000)} seconds.`;
      case "queued":
        return `${plural(queued.length, "request")} waiting. The next needs ${grouped(head?.tokens ?? 0)} ${unit}.`;
      case "full":
        return `Full. ${grouped(cap)} ${unit} available.`;
      case "flowing":
        return `Requests flowing. ${grouped(lvl)} of ${grouped(cap)} ${unit} available.`;
      case "error":
        return "The limit could not be read.";
      default:
        return "";
    }
  };
  // Frozen at the change, from the new reading: a refill tick never speaks.
  const [spoken, setSpoken] = React.useState({ situation, text: "" });
  if (spoken.situation !== situation) {
    setSpoken({ situation, text: sentence() });
  }

  /* ------------------------------ engine -------------------------------- */

  const tankRef = React.useRef<HTMLDivElement | null>(null);
  const waterRef = React.useRef<SVGPathElement | null>(null);
  const surfaceRef = React.useRef<SVGPathElement | null>(null);
  const cellsRef = React.useRef<SVGPathElement | null>(null);
  const levelTextRef = React.useRef<HTMLSpanElement | null>(null);
  const etaRef = React.useRef<HTMLSpanElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);

  // The drawn water belongs to the loop after the first paint: React renders
  // only the first reading, so a new reading never flashes the flat final
  // level for a frame before the loop takes it down on a spring.
  const [first] = React.useState(() => {
    const pts = surfacePoints(levelY(lvl, cap), 0, 0);
    return {
      water: fillPath(pts),
      surface: linePath(pts),
      cells: cellsPath(lvl / cap),
      level: compact(lvl),
    };
  });

  const etaTarget = !ready
    ? null
    : head
      ? Math.min(cap, head.tokens)
      : lvl < cap
        ? cap
        : null;
  const cfg: EngineCfg = {
    capacity: cap,
    rate: rate / 1000,
    ceiling: head ? Math.min(cap, head.tokens) : cap,
    etaTarget,
    liquid,
    slosh: clamp(slosh, 0, 1),
    refilling: ready,
    motionSafe,
  };
  const cfgRef = React.useRef<EngineCfg>(cfg);
  React.useEffect(() => {
    cfgRef.current = cfg;
  });

  const engine = React.useRef<EngineState>({
    anchorLevel: lvl,
    anchorAt: 0,
    lastNow: null,
    visual: lvl,
    dip: 0,
    dipping: false,
    amp: 0,
    pendingKick: 0,
    kickAt: 0,
    phase: 0,
    reanchor: null,
    wake: null,
  });

  React.useEffect(() => {
    const st = engine.current;
    let raf = 0;
    let last = 0;
    let visible = true;
    let dipCtrl: AnimationPlaybackControls | null = null;

    const draw = (water: number, c: EngineCfg) => {
      const y = levelY(water, c.capacity);
      if (c.liquid === "cells") {
        cellsRef.current?.setAttribute("d", cellsPath(water / c.capacity));
      } else {
        const a =
          c.liquid === "water" && c.motionSafe ? st.amp * c.slosh * 5 : 0;
        const pts = surfacePoints(y, a, st.phase);
        waterRef.current?.setAttribute("d", fillPath(pts));
        surfaceRef.current?.setAttribute("d", linePath(pts));
      }
      const text = compact(water);
      const levelNode = levelTextRef.current;
      if (levelNode && levelNode.textContent !== text) {
        levelNode.textContent = text;
      }
      const etaNode = etaRef.current;
      if (etaNode && c.etaTarget !== null) {
        const eta = countdown(
          c.rate > 0 ? (c.etaTarget - water) / (c.rate * 1000) : Infinity,
        );
        if (etaNode.textContent !== eta) etaNode.textContent = eta;
      }
    };

    const frame = (ts: number) => {
      raf = 0;
      const c = cfgRef.current;
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 1 / 60;
      last = ts;
      if (st.pendingKick > 0 && ts >= st.kickAt) {
        st.amp = Math.min(1.2, st.amp + st.pendingKick);
        st.pendingKick = 0;
      }
      const ceiling = Math.max(st.anchorLevel, c.ceiling);
      const rise = c.refilling ? c.rate * Math.max(0, ts - st.anchorAt) : 0;
      const base = Math.min(ceiling, st.anchorLevel + rise);
      const water = clamp(base + st.dip, 0, c.capacity);
      st.phase += dt * 5.2;
      st.amp = st.amp < 0.004 ? 0 : st.amp * Math.exp(-dt / 0.55);
      draw(water, c);
      st.visual = water;
      const moving =
        (c.refilling && c.rate > 0 && base < ceiling - 0.5) ||
        st.dipping ||
        st.amp > 0 ||
        st.pendingKick > 0;
      if (moving && visible && !document.hidden) {
        raf = requestAnimationFrame(frame);
      } else {
        last = 0;
      }
    };

    const wake = () => {
      if (raf || !visible || document.hidden) return;
      raf = requestAnimationFrame(frame);
    };

    st.reanchor = (lvlNow, nowMs, reqs) => {
      const c = cfgRef.current;
      const prevNow = st.lastNow ?? nowMs;
      st.lastNow = nowMs;
      const gap = st.visual - lvlNow;
      st.anchorLevel = lvlNow;
      st.anchorAt = performance.now();
      dipCtrl?.stop();
      st.dipping = false;
      // A droplet that waited falls first; the surface drops when it lands.
      const fell = reqs.some(
        (r) =>
          r.status === "served" &&
          r.servedAt !== undefined &&
          r.servedAt > prevNow &&
          r.servedAt <= nowMs &&
          waitedMs(r) > 50,
      );
      const delay = fell ? FALL_S : 0;
      if (!c.motionSafe || !visible || Math.abs(gap) < c.capacity * 0.001) {
        st.dip = 0;
      } else {
        st.dip = gap;
        st.dipping = true;
        // Falling water overshoots once (the slosh); a correction upward
        // only settles.
        dipCtrl = animate(gap, 0, {
          ...(gap > 0 ? springs.snap : springs.glide),
          delay,
          onUpdate: (v) => {
            st.dip = v;
          },
          onComplete: () => {
            st.dip = 0;
            st.dipping = false;
          },
        });
        if (gap > c.capacity * 0.015) {
          st.pendingKick += Math.min(1, (gap / c.capacity) * 3.2);
          st.kickAt = performance.now() + delay * 1000;
        }
      }
      wake();
    };
    st.wake = wake;

    const node = tankRef.current;
    const io =
      node && typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => {
            visible = !!entry?.isIntersecting;
            if (visible) wake();
          })
        : null;
    if (node) io?.observe(node);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    st.anchorAt = performance.now();
    wake();

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      dipCtrl?.stop();
      st.dip = 0;
      st.dipping = false;
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      st.reanchor = null;
      st.wake = null;
    };
  }, []);

  React.useEffect(() => {
    engine.current.reanchor?.(lvl, now, requests);
  }, [lvl, now, requests]);

  // A new look, a new speed or a new limit redraws from where the water is.
  React.useEffect(() => {
    engine.current.wake?.();
  }, [liquid, rate, cap, motionSafe, slosh, status, head?.id]);

  /* ---------------------------- list focus ------------------------------ */

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const roving =
    activeId && recent.some((r) => r.id === activeId)
      ? activeId
      : (recent[0]?.id ?? null);

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-tb-row="${CSS.escape(id)}"]`)
      ?.focus();
  };

  const onListKey = (event: React.KeyboardEvent<HTMLOListElement>) => {
    const index = recent.findIndex((r) => r.id === roving);
    let next = -1;
    if (event.key === "ArrowDown")
      next = Math.min(recent.length - 1, index + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = recent.length - 1;
    else return;
    event.preventDefault();
    focusRow(recent[next]?.id);
  };

  /* ------------------------------ pieces -------------------------------- */

  const outcome = (r: TokenBucketRequest) => {
    if (r.status === "refused") {
      return {
        chip: "429",
        tone: "text-danger",
        words: "refused, rate limited",
      };
    }
    if (r.status === "queued") {
      return { chip: "queued", tone: "text-[var(--tb-ink)]", words: "waiting" };
    }
    const w = waitedMs(r);
    if (w > 250) {
      const s = (w / 1000).toFixed(1);
      return {
        chip: `waited ${s}s`,
        tone: "text-ink-2",
        words: `served after ${s} seconds`,
      };
    }
    return { chip: "ok", tone: "text-success", words: "served" };
  };

  const headerButton =
    "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-2 border border-hairline px-2 text-[12px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50";

  const pill = !ready ? null : (
    <span
      className={cn(
        "hidden h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10.5px] tracking-[0.06em] uppercase @[30rem]:inline-flex",
        throttled
          ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] text-warn"
          : "border-hairline text-ink-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          throttled ? "bg-warn" : paused ? "bg-ink-3" : "bg-signal",
        )}
      />
      {throttled ? "Throttled" : paused ? "Paused" : "Live"}
    </span>
  );

  const header = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
      <span
        aria-hidden
        className="hidden size-7 shrink-0 items-center justify-center rounded-2 bg-[var(--tb-wash)] text-[var(--tb-ink)] @[30rem]:inline-flex"
      >
        <Droplets className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          title={title}
          className="truncate text-[13px] leading-5 font-semibold"
        >
          {title}
        </p>
        <p className="truncate text-[11px] leading-4 text-ink-3">
          {subtitle ?? `Team plan · ${compact(rate * 60)} ${unit} a minute`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {pill}
        {ready ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label="Requests"
            onClick={() => setOpen(!open)}
            className={cn(
              headerButton,
              "@[34rem]:hidden",
              open &&
                "border-[var(--tb-soft)] bg-[var(--tb-wash)] text-[var(--tb-ink)]",
              FOCUS,
            )}
          >
            <ListOrdered aria-hidden className="size-3.5" />
          </button>
        ) : null}
        {onPause && ready ? (
          <button
            type="button"
            aria-pressed={paused}
            aria-label={paused ? "Resume traffic" : "Pause traffic"}
            disabled={disabled}
            onClick={() => onPause(!paused)}
            className={cn(headerButton, FOCUS)}
          >
            {paused ? (
              <Play aria-hidden className="size-3.5" />
            ) : (
              <Pause aria-hidden className="size-3.5" />
            )}
            <span className="hidden @[30rem]:inline">
              {paused ? "Resume" : "Pause"}
            </span>
          </button>
        ) : null}
        {onRaiseLimit ? (
          <button
            type="button"
            aria-label="Raise limit"
            disabled={disabled}
            onClick={() => onRaiseLimit()}
            className={cn(
              headerButton,
              throttled &&
                "border-[var(--tb-soft)] bg-[var(--tb-wash)] text-[var(--tb-ink)] hover:bg-[var(--tb-wash)] hover:text-[var(--tb-ink)]",
              FOCUS,
            )}
          >
            <ArrowUpToLine aria-hidden className="size-3.5" />
            <span className="hidden @[30rem]:inline">Raise limit</span>
          </button>
        ) : null}
      </div>
    </div>
  );

  /* -------------------------------- tank -------------------------------- */

  const thresholdY = head ? levelY(Math.min(cap, head.tokens), cap) : BRIM;
  const tankLabel = !ready
    ? status === "loading"
      ? "Reading the limit"
      : "The limit could not be read"
    : `${grouped(lvl)} of ${grouped(cap)} ${unit} available${
        queued.length ? `, ${plural(queued.length, "request")} waiting` : ""
      }${throttled ? ", throttled" : ""}`;

  const tank = (
    <div
      ref={tankRef}
      className="relative w-[88px] shrink-0 self-start @[34rem]:w-[112px]"
    >
      <svg
        role="img"
        aria-label={tankLabel}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="block h-auto w-full overflow-hidden"
      >
        <defs>
          <clipPath id={clipId}>
            <path d={INTERIOR} />
          </clipPath>
        </defs>
        <path d={INTERIOR} className="fill-surface-2" />
        {liquid === "cells" ? (
          <path
            d={cellsPath(1, true)}
            fill="none"
            className="stroke-hairline"
            strokeWidth={0.75}
          />
        ) : null}
        {ready ? (
          <g clipPath={`url(#${clipId})`}>
            {liquid === "cells" ? (
              <path
                ref={cellsRef}
                d={first.cells}
                style={{ fill: "var(--tb-liquid)" }}
              />
            ) : (
              <>
                <path
                  ref={waterRef}
                  d={first.water}
                  style={{
                    fill:
                      liquid === "water"
                        ? "var(--tb-water)"
                        : "var(--tb-solid)",
                  }}
                />
                {liquid === "water" ? (
                  <path
                    ref={surfaceRef}
                    d={first.surface}
                    fill="none"
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    style={{ stroke: "var(--tb-foam)" }}
                  />
                ) : null}
              </>
            )}
          </g>
        ) : null}
        {[0.25, 0.5, 0.75].map((q) => (
          <line
            key={q}
            x1={99}
            x2={105}
            y1={r2(levelY(q * cap, cap))}
            y2={r2(levelY(q * cap, cap))}
            className="stroke-hairline-strong"
            strokeWidth={0.9}
          />
        ))}
        <rect
          x={17}
          y={48}
          width={2.4}
          height={74}
          rx={1.2}
          fill="white"
          opacity={0.14}
        />
        <AnimatePresence initial={false}>
          {head ? (
            <motion.g
              key="threshold"
              initial={{ opacity: 0, y: thresholdY }}
              animate={{ opacity: 1, y: thresholdY }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                y: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
            >
              <line
                x1={WALL_L + 1}
                x2={WALL_R - 1}
                y1={0}
                y2={0}
                strokeWidth={1}
                strokeDasharray="3 2.5"
                style={{ stroke: "var(--tb-ink)" }}
              />
            </motion.g>
          ) : null}
        </AnimatePresence>
        {slabs.map((s) => (
          <Slab
            key={s.id}
            top={s.top}
            height={s.height}
            label={s.label}
            delay={s.delay}
            motionSafe={motionSafe}
          />
        ))}
        <path
          d={GLASS}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "transition-[stroke] duration-200",
            throttled ? "stroke-warn" : "stroke-hairline-strong",
          )}
        />
        <line
          x1={34}
          x2={86}
          y1={RAIL_Y}
          y2={RAIL_Y}
          strokeWidth={1.2}
          strokeLinecap="round"
          className="stroke-hairline-strong"
        />
        <AnimatePresence initial={false} custom={exitCtx}>
          {shownDrops.map((r, i) => {
            const radius = dropRadius(r.tokens, cap);
            const cx = r2(VB_W / 2 + (i - (shownDrops.length - 1) / 2) * 15);
            const cy = r2(RAIL_Y + 1.6 * radius + 0.6);
            const isNew = !firstIds.has(r.id);
            return (
              <motion.g
                key={r.id}
                custom={exitCtx}
                initial={isNew ? { x: cx, y: 0, opacity: 0 } : false}
                animate={{ x: cx, y: 0, opacity: 1 }}
                variants={{
                  leave: (ctx: typeof exitCtx) => {
                    const land = ctx.land[r.id];
                    if (land === undefined || !ctx.motionSafe) {
                      return {
                        opacity: 0,
                        scale: ctx.motionSafe ? 0.4 : 1,
                        transition: exitFor(durations.fast),
                      };
                    }
                    return {
                      y: r2(land - cy),
                      opacity: [1, 1, 0],
                      transition: {
                        y: { duration: FALL_S, ease: easings.exit },
                        opacity: {
                          duration: FALL_S + 0.06,
                          times: [0, 0.82, 1],
                        },
                      },
                    };
                  },
                }}
                exit="leave"
                transition={{
                  x: motionSafe ? springs.glide : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
                style={{ originX: 0.5, originY: 0 }}
              >
                <g transform={`translate(0 ${cy})`}>
                  <motion.path
                    d={tearPath(radius)}
                    initial={isNew && motionSafe ? { scale: 0 } : false}
                    animate={{ scale: 1 }}
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                    strokeWidth={0.8}
                    style={{
                      originX: 0.5,
                      originY: 0,
                      fill: "var(--tb-solid)",
                      stroke: "var(--tb-foam)",
                    }}
                  />
                </g>
              </motion.g>
            );
          })}
        </AnimatePresence>
        {overflow > 0 ? (
          <text
            x={112}
            y={15}
            textAnchor="end"
            className="fill-ink-3 font-mono"
            style={{ fontSize: 9 }}
          >
            {`+${overflow}`}
          </text>
        ) : null}
      </svg>
    </div>
  );

  /* ------------------------------ readout ------------------------------- */

  let stateLine: React.ReactNode;
  if (throttled) {
    stateLine = (
      <span className="inline-flex items-center gap-1.5 text-warn">
        <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0">
          <circle
            cx={7}
            cy={7}
            r={5.5}
            fill="none"
            strokeWidth={1.6}
            className="stroke-hairline-strong"
          />
          <circle
            cx={7}
            cy={7}
            r={5.5}
            fill="none"
            strokeWidth={1.6}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={`${ringFrac} 1`}
            transform="rotate(-90 7 7)"
            className="stroke-warn"
          />
        </svg>
        <span>
          {"Throttled · "}
          <span className="sr-only">retry in </span>
          <span className="font-mono tabular-nums">
            {countdown(retryIn / 1000)}
          </span>
        </span>
      </span>
    );
  } else if (queued.length > 0) {
    stateLine = (
      <span className="text-[var(--tb-ink)]">
        {`${queued.length} queued · next in `}
        <span ref={etaRef} className="font-mono tabular-nums">
          {countdown(rate > 0 ? ((head?.tokens ?? 0) - lvl) / rate : Infinity)}
        </span>
      </span>
    );
  } else if (lvl >= cap) {
    stateLine = (
      <span className="inline-flex items-center gap-1 text-success">
        <Check aria-hidden className="size-3.5 shrink-0" />
        Full
      </span>
    );
  } else {
    stateLine = (
      <span>
        {"Full in "}
        <span ref={etaRef} className="font-mono tabular-nums">
          {countdown(rate > 0 ? (cap - lvl) / rate : Infinity)}
        </span>
      </span>
    );
  }

  let readout: React.ReactNode;
  if (status === "loading") {
    readout = (
      <div aria-hidden className="flex flex-col gap-2 pt-1">
        <span className="h-6 w-20 rounded-2 bg-surface-2" />
        <span className="h-3 w-28 rounded-1 bg-surface-2" />
        <span className="h-3 w-24 rounded-1 bg-surface-2" />
      </div>
    );
  } else if (status === "error") {
    readout = (
      <div className="flex flex-col items-start gap-2 pt-1">
        <p className="inline-flex items-center gap-1.5 text-[12px] text-danger">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          Couldn’t read the limit.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            disabled={disabled}
            className={cn(headerButton, FOCUS)}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else {
    readout = (
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-baseline gap-1.5">
          <span
            ref={levelTextRef}
            className="font-mono text-[24px] font-medium tracking-tight tabular-nums @[34rem]:text-[28px]"
            style={{ lineHeight: 1.05 }}
          >
            {first.level}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {`/ ${compact(cap)}`}
          </span>
        </p>
        <p className="truncate text-[11px] text-ink-3">
          {`${unit} · refills ${compact(rate * 60)} a minute`}
        </p>
        <p className="text-[12px] leading-5 text-ink-2">{stateLine}</p>
        <p className="truncate font-mono text-[10.5px] text-ink-3 tabular-nums">
          {`Last min · ${plural(lastMinute.count, "req")} · ${compact(lastMinute.tokens)}`}
        </p>
      </div>
    );
  }

  /* -------------------------------- list -------------------------------- */

  const list = (
    <div
      className={cn(
        "relative min-w-0 flex-1 self-stretch",
        open ? "flex" : "hidden @[34rem]:flex",
      )}
    >
      <motion.ol
        id={listId}
        ref={listRef}
        layoutScroll
        aria-label={`Last ${plural(recent.length, "request")}`}
        onKeyDown={onListKey}
        className="absolute inset-0 flex [scrollbar-width:thin] flex-col gap-px overflow-y-auto overscroll-contain rounded-3 border border-hairline bg-background [mask-image:linear-gradient(to_bottom,black_82%,transparent)] px-1 pt-1 pb-6"
      >
        {recent.length === 0 ? (
          <li className="px-2 py-1.5 text-[12px] text-ink-3">
            {status === "loading"
              ? "Waiting for the first reading"
              : "No requests yet"}
          </li>
        ) : null}
        {recent.map((r) => {
          const o = outcome(r);
          const time = formatTime(r.at);
          return (
            <motion.li
              key={r.id}
              layout={motionSafe ? "position" : false}
              initial={
                firstIds.has(r.id)
                  ? false
                  : { opacity: 0, y: motionSafe ? -distances.nudge : 0 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                layout: springs.glide,
                y: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
            >
              <button
                type="button"
                data-tb-row={r.id}
                tabIndex={r.id === roving ? 0 : -1}
                aria-disabled={disabled || undefined}
                aria-label={`${time}, ${r.route}, ${grouped(r.tokens)} ${unit}, ${o.words}`}
                onFocus={() => setActiveId(r.id)}
                onClick={() => {
                  setActiveId(r.id);
                  if (!disabled) onInspectRequest?.(r);
                }}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2 py-1 text-left transition-colors hover:bg-surface-2",
                  "@[34rem]:grid-cols-[auto_minmax(0,1fr)_auto_auto] @[34rem]:py-0.5",
                  FOCUS_IN,
                )}
              >
                <span className="order-3 font-mono text-[10.5px] leading-4 text-ink-3 tabular-nums @[34rem]:order-none">
                  {time}
                </span>
                <span
                  title={r.route}
                  className="order-1 truncate text-[12px] leading-5 text-foreground @[34rem]:order-none"
                >
                  {r.route}
                </span>
                <span className="order-2 text-right font-mono text-[11px] leading-5 tabular-nums @[34rem]:order-none">
                  {compact(r.tokens)}
                </span>
                <span
                  className={cn(
                    "order-4 text-right font-mono text-[10px] leading-4 whitespace-nowrap @[34rem]:order-none @[34rem]:w-[4.75rem]",
                    o.tone,
                  )}
                >
                  {o.chip}
                </span>
              </button>
            </motion.li>
          );
        })}
      </motion.ol>
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container w-full rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <div className="flex flex-col gap-2.5 p-3">
        {header}
        <div className="flex items-start gap-3">
          {tank}
          <div
            className={cn(
              "min-w-0 flex-1 @[34rem]:w-44 @[34rem]:flex-none",
              open && ready ? "hidden @[34rem]:block" : "block",
            )}
          >
            {readout}
          </div>
          {ready ? list : null}
        </div>
      </div>
      <p role="status" className="sr-only">
        {spoken.text}
      </p>
    </section>
  );
}
