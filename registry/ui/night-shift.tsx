"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  CircleCheck,
  Moon,
  OctagonX,
  RotateCcw,
  Sunrise,
  Sunset,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import {
  project,
  rubberClamp,
  useDrag,
  type Point,
} from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type NightShiftOutcome = "done" | "flagged" | "failed";

export type NightShiftAgent = {
  id: string;
  /** Short name, shown on cards and in the header. */
  name: string;
  /** What the agent does, in two or three words. */
  role: string;
};

export type NightShiftEvent = {
  id: string;
  /** The agent's id. */
  agent: string;
  /** When it happened, in ms since the epoch. */
  at: number;
  /** One line: what happened. */
  title: string;
  /** A sentence or two of detail; clamped to two lines on the card. */
  detail?: string;
  outcome: NightShiftOutcome;
  /** A short figure for the card's footer: "1,284 SKUs". */
  metric?: string;
};

export type NightShiftWindow = { start: number; end: number };
export type NightShiftCardStyle = "raised" | "outline" | "tinted";
export type NightShiftStatus = "ready" | "loading" | "error";

export type NightShiftProps = {
  /** The night's events, in any order. @default defaultNightShiftEvents (17) */
  events?: NightShiftEvent[];
  /** The agents the events name. @default defaultNightShiftAgents (3) */
  agents?: NightShiftAgent[];
  /** Dusk and dawn, in ms. Events outside it are left off the arc. @default defaultNightShiftWindow (19:00 to 07:00) */
  night?: NightShiftWindow;
  /** Minutes added to UTC before a time is printed, so the clock reads in the team's zone. @default 0 */
  utcOffset?: number;
  /** Controlled scrub time in ms; the moon glides to it when it changes. */
  value?: number;
  /** Where the moon starts when uncontrolled. @default the first failed event, else the first event */
  defaultValue?: number;
  /** Fires every time the moon lands — a release, a key, a tap — with the time and the event there (null at dusk or dawn). */
  onScrub?: (at: number, event: NightShiftEvent | null) => void;
  /** Open was pressed on an event's card, or Enter on the moon. */
  onOpenEvent?: (event: NightShiftEvent) => void;
  /** Controlled acknowledgement of the digest. */
  acknowledged?: boolean;
  /** Initial acknowledgement when uncontrolled. @default false */
  defaultAcknowledged?: boolean;
  /** Acknowledge was pressed. */
  onAcknowledge?: () => void;
  /** The moment the digest is read, stamped on the acknowledgement. @default 42 minutes after dawn */
  now?: number;
  /** The digest's name. @default "Overnight run" */
  title?: string;
  /** What the agents worked on, under the title. @default "Basinworks inventory" */
  source?: string;
  /** Pin failed runs above the sky, each a button that scrubs to it. @default true */
  pinFailures?: boolean;
  /** How tall the night's arc is drawn, px; the narrow rail grows with it. @default 140 */
  arcHeight?: number;
  /** The event cards: filled and raised, outlined, or washed in their outcome colour. @default "raised" */
  cardStyle?: NightShiftCardStyle;
  /** The moon's halo, the travelled arc, done events and the current card's ring — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Whether the night's data has arrived. @default "ready" */
  status?: NightShiftStatus;
  /** Try again was pressed after the night failed to load. */
  onReload?: () => void;
  /** Read only: the moon cannot be moved and nothing can be acknowledged. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const DUSK = Date.UTC(2026, 9, 16, 19, 0);

/** 19:00 on 16 Oct to 07:00 on 17 Oct, UTC. */
export const defaultNightShiftWindow: NightShiftWindow = {
  start: DUSK,
  end: DUSK + 12 * 60 * MIN,
};

const clockAt = (h: number, m: number) =>
  DUSK + ((h < 19 ? h + 24 : h) - 19) * 60 * MIN + m * MIN;

export const defaultNightShiftAgents: NightShiftAgent[] = [
  { id: "tally", name: "Tally", role: "Cycle counts" },
  { id: "restock", name: "Restock", role: "Purchase orders" },
  { id: "ledger", name: "Ledger", role: "Valuation" },
];

/** Basinworks' inventory agents through one night at the Harbor DC. */
export const defaultNightShiftEvents: NightShiftEvent[] = [
  {
    id: "ns-01",
    agent: "tally",
    at: clockAt(19, 12),
    title: "Started the Harbor DC count",
    detail: "Four zones queued; zone A first while the dock is quiet.",
    outcome: "done",
    metric: "4 zones",
  },
  {
    id: "ns-02",
    agent: "restock",
    at: clockAt(19, 48),
    title: "Checked reorder points",
    detail:
      "2,310 SKUs against this week’s sell-through; 38 sit below their point.",
    outcome: "done",
    metric: "2,310 SKUs",
  },
  {
    id: "ns-03",
    agent: "tally",
    at: clockAt(20, 35),
    title: "Counted zone A",
    detail: "1,284 SKUs scanned and every bin within tolerance.",
    outcome: "done",
    metric: "1,284 SKUs",
  },
  {
    id: "ns-04",
    agent: "ledger",
    at: clockAt(21, 20),
    title: "Posted October receipts",
    detail: "312 receiving lines matched to their purchase orders and posted.",
    outcome: "done",
    metric: "312 lines",
  },
  {
    id: "ns-05",
    agent: "tally",
    at: clockAt(22, 5),
    title: "Bin H-14 is off by 7%",
    detail:
      "Counted 186 against 200 on hand. A recount is queued for the morning crew.",
    outcome: "flagged",
    metric: "−14 units",
  },
  {
    id: "ns-06",
    agent: "restock",
    at: clockAt(22, 40),
    title: "Drafted 4 purchase orders",
    detail: "For the 38 SKUs below their point, grouped by supplier.",
    outcome: "done",
    metric: "4 orders",
  },
  {
    id: "ns-07",
    agent: "tally",
    at: clockAt(23, 30),
    title: "Counted zone B",
    detail: "1,402 SKUs scanned; two bins re-scanned after a misread label.",
    outcome: "done",
    metric: "1,402 SKUs",
  },
  {
    id: "ns-08",
    agent: "ledger",
    at: clockAt(0, 15),
    title: "Revalued slow movers",
    detail: "88 SKUs with no sale in 120 days written down to resale value.",
    outcome: "done",
    metric: "88 SKUs",
  },
  {
    id: "ns-09",
    agent: "restock",
    at: clockAt(1, 5),
    title: "Fieldline price feed timed out",
    detail:
      "The supplier feed did not answer within 30 seconds, three times. Prices were left as they were.",
    outcome: "failed",
    metric: "3 retries",
  },
  {
    id: "ns-10",
    agent: "tally",
    at: clockAt(1, 50),
    title: "Counted zone C",
    detail: "The cold store, counted against the door log; nothing missing.",
    outcome: "done",
    metric: "1,190 SKUs",
  },
  {
    id: "ns-11",
    agent: "restock",
    at: clockAt(2, 14),
    title: "Reorder sync failed",
    detail:
      "Two orders could not reach Coldbrook Supply: the order endpoint answered 503.",
    outcome: "failed",
    metric: "2 orders held",
  },
  {
    id: "ns-12",
    agent: "ledger",
    at: clockAt(2, 58),
    title: "Matched 41 invoices",
    detail:
      "41 supplier invoices matched to receipts; 3 wait on a credit note.",
    outcome: "done",
    metric: "41 invoices",
  },
  {
    id: "ns-13",
    agent: "tally",
    at: clockAt(3, 40),
    title: "Zone D count paused",
    detail:
      "The charging bay blocked aisle 6 for 40 minutes; counting resumed at 04:20.",
    outcome: "flagged",
    metric: "40 min",
  },
  {
    id: "ns-14",
    agent: "restock",
    at: clockAt(4, 25),
    title: "Re-drafted 2 orders",
    detail: "Prices moved overnight on two lines; drafts updated, not sent.",
    outcome: "done",
    metric: "2 orders",
  },
  {
    id: "ns-15",
    agent: "ledger",
    at: clockAt(5, 10),
    title: "Closed the night’s valuation",
    detail:
      "Inventory value posted at the close; variance under the 0.5% line.",
    outcome: "done",
    metric: "0.31% var.",
  },
  {
    id: "ns-16",
    agent: "tally",
    at: clockAt(5, 55),
    title: "Finished Harbor DC",
    detail: "All four zones counted, one bin flagged for a recount.",
    outcome: "done",
    metric: "5,120 SKUs",
  },
  {
    id: "ns-17",
    agent: "restock",
    at: clockAt(6, 30),
    title: "Queued 6 orders for approval",
    detail: "Six purchase orders wait for a buyer’s sign-off this morning.",
    outcome: "done",
    metric: "6 orders",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));
const r6 = (v: number) => Number(v.toFixed(6));

/** A fixed 24-hour clock from UTC plus an offset: the same on the server and in the browser. */
const clock = (ms: number, offset: number) => {
  const d = new Date(ms + offset * MIN);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Piecewise-linear lookup through strictly increasing knots. */
function interp(xs: number[], ys: number[], x: number) {
  const last = xs.length - 1;
  if (last < 0) return 0;
  if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
  if (x >= (xs[last] ?? 0)) return ys[last] ?? 0;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((xs[mid] ?? 0) <= x) lo = mid;
    else hi = mid;
  }
  const x0 = xs[lo] ?? 0;
  const x1 = xs[hi] ?? 1;
  const y0 = ys[lo] ?? 0;
  const y1 = ys[hi] ?? 0;
  return y0 + ((x - x0) / Math.max(1e-9, x1 - x0)) * (y1 - y0);
}

/**
 * A motion value computed from another, kept in step by a subscription made
 * in an effect. Unlike a derived transform it re-reads its source whenever its
 * inputs change, so a StrictMode rehearsal or a new prop never leaves it stale.
 */
function useDerived<T>(
  source: MotionValue<number>,
  fn: (v: number) => T,
  key: string,
): MotionValue<T> {
  const out = useMotionValue<T>(fn(source.get()));
  React.useEffect(() => {
    out.set(fn(source.get()));
    return source.on("change", (v) => out.set(fn(v)));
    // `key` names everything `fn` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, out, key]);
  return out;
}

const OUTCOME_LABEL: Record<NightShiftOutcome, string> = {
  done: "Done",
  flagged: "Flagged",
  failed: "Failed",
};

const toneOf = (outcome: NightShiftOutcome) =>
  outcome === "failed"
    ? "var(--danger)"
    : outcome === "flagged"
      ? "var(--warn)"
      : "var(--ns-accent)";

const listOf = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

/* Geometry, px. */
const INSET = 22;
const SKY_TOP = 32;
const LABELS = 30;
const CARD_W = 226;
const SPACING_X = 240;
const STRIP_H = 156;
const CARD_H = 144;
const NARROW_CARD_H = 128;
const SPACING_Y = 138;
const RAIL_PAD = 14;

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

function Monogram({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-2 text-[10px] font-semibold text-ink-2"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function OutcomeBadge({ outcome }: { outcome: NightShiftOutcome }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium",
        outcome === "failed"
          ? "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger"
          : outcome === "flagged"
            ? "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn"
            : "bg-(--ns-wash) text-(--ns-accent)",
      )}
    >
      {outcome === "failed" ? (
        <OctagonX aria-hidden className="size-3" />
      ) : outcome === "flagged" ? (
        <TriangleAlert aria-hidden className="size-3" />
      ) : (
        <CircleCheck aria-hidden className="size-3" />
      )}
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

/** A check drawn on flick, for the acknowledgement. */
function DrawnCheck({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0">
      <motion.path
        d="M3.5 8.5 6.6 11.4 12.5 4.8"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: motionSafe ? 0 : 1 }}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

type SlotProps = {
  k: number;
  f: MotionValue<number>;
  axis: "x" | "y";
  current: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * One place on the replay strip. Its offset is its distance from the strip's
 * fractional index, so it slides in and out exactly as the moon crosses its
 * hour; neighbours shrink a little and fade toward the masked edges.
 */
function StripSlot({
  k,
  f,
  axis,
  current,
  children,
  className,
  style,
}: SlotProps) {
  const spacing = axis === "x" ? SPACING_X : SPACING_Y;
  const key = `${k}:${axis}`;
  const offset = useDerived(f, (v) => r2((k - v) * spacing), key);
  const scale = useDerived(
    f,
    (v) => r3(1 - Math.min(2, Math.abs(k - v)) * 0.045),
    key,
  );
  const opacity = useDerived(
    f,
    (v) => {
      const d = Math.abs(k - v);
      return d > 2.6 ? 0 : r3(1 - Math.min(d, 2.4) * 0.34);
    },
    key,
  );
  const ring = useDerived(
    f,
    (v) => r3(Math.max(0, 1 - Math.abs(k - v) * 2.5)),
    key,
  );
  const events = useDerived(
    f,
    (v) => (Math.abs(k - v) > 2.4 ? "none" : "auto"),
    key,
  );
  return (
    <motion.div
      data-ns-slot={k}
      aria-hidden={current ? undefined : true}
      className={cn("absolute", className)}
      style={{
        ...style,
        ...(axis === "x" ? { x: offset } : { y: offset }),
        scale,
        opacity,
        pointerEvents: events,
        zIndex: current ? 2 : 1,
      }}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-3 border-2 border-(--ns-accent)"
        style={{ opacity: ring }}
      />
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A morning digest of an overnight agent run, read by replaying the night.
 * The night is an arc from dusk to dawn with every event a dot at its hour; a
 * moon rides it. Drag the moon and it follows the pointer 1:1 along the arc,
 * rubber-banding past dusk and dawn; the event cards on the strip below slide
 * with it in lockstep, because the strip's offset is the moon's position
 * expressed as a fractional event index. Let go and the throw is projected:
 * the moon glides on `springs.glide`, carrying the release velocity, onto the
 * event nearest where it would have come to rest, and that event's dot lights
 * with a ring that opens on snap. The strip can be dragged too: then the cards
 * are the thing under the finger and the moon races or crawls along the arc to
 * keep up, showing at a glance where the night was busy.
 *
 * The moon is a real slider: Left and Right step event by event, Home and End
 * jump to dusk and dawn, Page Up and Page Down move about an hour, Enter opens
 * the event. Failed runs are pinned above the sky. Under 30rem of container
 * the arc straightens into a vertical rail with the cards sliding beside it.
 * Under reduced motion the moon jumps to its landing and the strip swaps;
 * every time, count and colour still changes.
 */
export function NightShift({
  events = defaultNightShiftEvents,
  agents = defaultNightShiftAgents,
  night = defaultNightShiftWindow,
  utcOffset = 0,
  value,
  defaultValue,
  onScrub,
  onOpenEvent,
  acknowledged,
  defaultAcknowledged = false,
  onAcknowledge,
  now,
  title = "Overnight run",
  source = "Basinworks inventory",
  pinFailures = true,
  arcHeight = 140,
  cardStyle = "raised",
  accent = "var(--accent-bright)",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: NightShiftProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const svgId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";

  const start = night.start;
  const end = Math.max(night.end, night.start + MIN);
  const span = end - start;
  const h = clamp(Math.round(arcHeight), 60, 240);
  const horizon = SKY_TOP + h;
  const railH = Math.round(clamp(160 + h * 0.6, 220, 280));

  /* ------------------------------ the night ------------------------------ */

  const list = React.useMemo(
    () =>
      events
        .filter((e) => e.at >= start && e.at <= end)
        .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)),
    [events, start, end],
  );
  const n = list.length;
  const agentById = React.useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents],
  );
  const nameOf = (id: string) => agentById.get(id)?.name ?? id;

  /**
   * Knots for the strip's fractional index: dusk is slot -1, each event its
   * own index, dawn slot n. Times between are interpolated, so the strip
   * moves evenly from card to card however far apart the events are.
   */
  const knots = React.useMemo(() => {
    const ps: number[] = [0];
    const fs: number[] = [-1];
    let last = 0;
    list.forEach((e, i) => {
      const p = Math.max(last + 1e-6, (e.at - start) / span);
      ps.push(p);
      fs.push(i);
      last = p;
    });
    ps.push(Math.max(1, last + 1e-6));
    fs.push(n);
    return { ps, fs };
  }, [list, n, span, start]);
  const knotKey = knots.ps.map((p) => p.toFixed(6)).join(",");
  const fOf = React.useCallback(
    (p: number) => interp(knots.ps, knots.fs, clamp01(p)),
    [knots],
  );
  const pOf = React.useCallback(
    (f: number) => clamp01(interp(knots.fs, knots.ps, clamp(f, -1, n))),
    [knots, n],
  );
  const slotIndex = (f: number) => clamp(Math.round(f), -1, n);

  const failed = list.filter((e) => e.outcome === "failed");
  const counts = {
    done: list.filter((e) => e.outcome === "done").length,
    flagged: list.filter((e) => e.outcome === "flagged").length,
    failed: failed.length,
  };
  const workers = agents.filter((a) => list.some((e) => e.agent === a.id));

  const initialAt =
    value ??
    defaultValue ??
    failed[0]?.at ??
    list[0]?.at ??
    (n === 0 ? end : start);

  /* -------------------------------- state -------------------------------- */

  const [landed, setLanded] = React.useState(initialAt);
  const [ownAck, setOwnAck] = React.useState(defaultAcknowledged);
  const isAck = acknowledged ?? ownAck;
  const [said, setSaid] = React.useState("");
  const [dragging, setDragging] = React.useState(false);

  const p = useMotionValue(clamp01((initialAt - start) / span));
  const f = useMotionValue(fOf(p.get()));
  const [current, setCurrent] = React.useState(() => slotIndex(f.get()));

  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const stripDriving = React.useRef(false);
  const lastDragEnd = React.useRef(0);
  const skyRef = React.useRef<HTMLDivElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const grip = React.useRef({ from: 0, size: 1 });

  // The strip follows the moon, except while the strip itself is the thing
  // being driven: then the moon follows the strip.
  React.useEffect(() => {
    if (!stripDriving.current) f.set(r6(fOf(p.get())));
    return p.on("change", (v) => {
      if (!stripDriving.current) f.set(r6(fOf(v)));
    });
  }, [p, f, fOf, knotKey]);

  // The lit slot changes on a crossing, not every frame.
  React.useEffect(() => {
    const sync = (v: number) => {
      const k = clamp(Math.round(v), -1, n);
      setCurrent((c) => (c === k ? c : k));
    };
    sync(f.get());
    return f.on("change", sync);
  }, [f, n]);

  const stop = React.useCallback(() => {
    anim.current?.stop();
    anim.current = null;
    stripDriving.current = false;
  }, []);
  React.useEffect(() => stop, [stop]);

  /* ------------------------------- landing ------------------------------- */

  const eventAt = (k: number) => (k >= 0 && k < n ? (list[k] ?? null) : null);
  const timeOf = (k: number) => start + Math.round(pOf(k) * span);

  const describe = (k: number) => {
    const ev = eventAt(k);
    if (!ev) {
      return k < 0
        ? `Dusk, ${clock(start, utcOffset)}`
        : `Dawn, ${clock(end, utcOffset)}`;
    }
    return `${clock(ev.at, utcOffset)}, ${nameOf(ev.agent)}: ${ev.title}, ${OUTCOME_LABEL[ev.outcome].toLowerCase()}`;
  };

  /** Reported from the gesture or key that chose it, with the new time. */
  const land = (k: number) => {
    const at = eventAt(k)?.at ?? timeOf(k);
    setLanded(at);
    setSaid(`${describe(k)}.`);
    onScrub?.(at, eventAt(k));
  };

  /** The moon travels in time: an even glide along the arc. */
  const glideToSlot = (k: number, velocity = 0) => {
    stop();
    const target = r6(pOf(k));
    if (!motionSafe) {
      p.jump(target);
      return;
    }
    anim.current = animate(p, target, {
      ...springs.glide,
      velocity,
      onComplete: () => {
        anim.current = null;
      },
    });
  };

  /** The strip travels in cards: an even glide from card to card. */
  const glideStripTo = (k: number, velocity = 0) => {
    stop();
    if (!motionSafe) {
      p.jump(r6(pOf(k)));
      return;
    }
    stripDriving.current = true;
    anim.current = animate(f.get(), k, {
      ...springs.glide,
      velocity,
      onUpdate: (v) => {
        f.set(r6(v));
        p.set(r6(pOf(v)));
      },
      onComplete: () => {
        anim.current = null;
        stripDriving.current = false;
      },
    });
  };

  const nearestSlot = (pv: number) => slotIndex(fOf(clamp01(pv)));

  // A host that moves `value` gets the same glide a key would give.
  const [seenValue, setSeenValue] = React.useState(value);
  if (value !== seenValue) {
    setSeenValue(value);
    if (value !== undefined) setLanded(value);
  }
  React.useEffect(() => {
    if (value === undefined) return;
    const target = clamp01((value - start) / span);
    if (Math.abs(target - p.get()) < 1e-5) return;
    stop();
    if (!motionSafe) p.jump(r6(target));
    else
      anim.current = animate(p, r6(target), {
        ...springs.glide,
        onComplete: () => {
          anim.current = null;
        },
      });
    // Only a new value from the host moves the moon.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  /* ------------------------------- gestures ------------------------------ */

  type Axis = "x" | "y";
  type Info = { offset: Point; velocity: Point; event: { timeStamp: number } };

  const moonStart = (axis: Axis) => {
    stop();
    const box = (axis === "x" ? skyRef : railRef).current;
    const rect = box?.getBoundingClientRect();
    const size =
      axis === "x"
        ? (rect?.width ?? 600) - 2 * INSET
        : (rect?.height ?? railH) - 2 * RAIL_PAD;
    grip.current = { from: p.get(), size: Math.max(40, size) };
    setDragging(true);
  };
  const moonMove = (axis: Axis, { offset }: Info) => {
    const { from, size } = grip.current;
    const raw = from + (axis === "x" ? offset.x : offset.y) / size;
    p.set(r6(rubberClamp(raw, 0, 1, 0.05)));
  };
  const moonEnd = (axis: Axis, { velocity, event }: Info) => {
    setDragging(false);
    lastDragEnd.current = event.timeStamp;
    const { size } = grip.current;
    const vPx = axis === "x" ? velocity.x : velocity.y;
    // Where the throw would come to rest, then the event nearest that.
    const rest = project(p.get() * size, vPx, 0.99) / size;
    const k = nearestSlot(rest);
    glideToSlot(k, vPx / size);
    land(k);
  };
  const moonCancel = () => {
    setDragging(false);
    const k = nearestSlot(p.get());
    glideToSlot(k);
    land(k);
  };

  const stripGrip = React.useRef(0);
  const stripStart = () => {
    stop();
    stripDriving.current = true;
    stripGrip.current = f.get();
  };
  const stripMove = (axis: Axis, { offset }: Info) => {
    const spacing = axis === "x" ? SPACING_X : SPACING_Y;
    const raw =
      stripGrip.current - (axis === "x" ? offset.x : offset.y) / spacing;
    const fv = rubberClamp(raw, -1, n, 0.45);
    f.set(r6(fv));
    p.set(r6(pOf(fv)));
  };
  const stripEnd = (axis: Axis, { velocity, event }: Info) => {
    lastDragEnd.current = event.timeStamp;
    const spacing = axis === "x" ? SPACING_X : SPACING_Y;
    const vPx = axis === "x" ? velocity.x : velocity.y;
    const rest = f.get() + project(0, -vPx, 0.99) / spacing;
    const k = slotIndex(rest);
    glideStripTo(k, -vPx / spacing);
    land(k);
  };
  const stripCancel = () => {
    const k = slotIndex(f.get());
    glideStripTo(k);
    land(k);
  };
  const stripTap = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const slot = target.closest<HTMLElement>("[data-ns-slot]");
    if (!slot) return;
    const k = Number(slot.dataset.nsSlot);
    if (!Number.isFinite(k) || k === current) return;
    glideToSlot(k);
    land(k);
  };

  const still = disabled || !ready;
  const moonX = useDrag({
    axis: "x",
    threshold: 3,
    disabled: still,
    onStart: () => moonStart("x"),
    onMove: (info) => moonMove("x", info),
    onEnd: (info) => moonEnd("x", info),
    onCancel: () => moonCancel(),
  });
  const moonY = useDrag({
    axis: "y",
    threshold: 3,
    disabled: still,
    onStart: () => moonStart("y"),
    onMove: (info) => moonMove("y", info),
    onEnd: (info) => moonEnd("y", info),
    onCancel: () => moonCancel(),
  });
  const stripX = useDrag({
    axis: "x",
    threshold: 4,
    disabled: still || n === 0,
    onStart: () => stripStart(),
    onMove: (info) => stripMove("x", info),
    onEnd: (info) => stripEnd("x", info),
    onCancel: () => stripCancel(),
    onTap: (event) => stripTap(event),
  });
  const stripY = useDrag({
    axis: "y",
    threshold: 4,
    disabled: still || n === 0,
    onStart: () => stripStart(),
    onMove: (info) => stripMove("y", info),
    onEnd: (info) => stripEnd("y", info),
    onCancel: () => stripCancel(),
    onTap: (event) => stripTap(event),
  });

  /** A press on the open sky (or rail) glides to the event nearest it. */
  const tapTrack = (
    event: React.MouseEvent<HTMLDivElement>,
    axis: "x" | "y",
  ) => {
    if (disabled || !ready) return;
    if ((event.target as HTMLElement).closest("[data-ns-moon]")) return;
    if (event.timeStamp - lastDragEnd.current < 250) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pv =
      axis === "x"
        ? (event.clientX - rect.left - INSET) /
          Math.max(1, rect.width - 2 * INSET)
        : (event.clientY - rect.top - RAIL_PAD) /
          Math.max(1, rect.height - 2 * RAIL_PAD);
    const k = nearestSlot(pv);
    glideToSlot(k);
    land(k);
  };

  const onMoonKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || !ready) return;
    const fv = f.get();
    let k: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        k = Math.min(n, Math.floor(fv + 1e-4) + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        k = Math.max(-1, Math.ceil(fv - 1e-4) - 1);
        break;
      case "Home":
        k = -1;
        break;
      case "End":
        k = n;
        break;
      case "PageUp":
      case "PageDown": {
        const dir = event.key === "PageUp" ? 1 : -1;
        const here = slotIndex(fv);
        let next = nearestSlot(p.get() + (dir * 60 * MIN) / span);
        if (next === here) next = clamp(here + dir, -1, n);
        k = next;
        break;
      }
      case "Enter": {
        const ev = eventAt(slotIndex(fv));
        if (ev) {
          event.preventDefault();
          onOpenEvent?.(ev);
        }
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    if (k === null) return;
    glideToSlot(k);
    land(k);
  };

  /* ---------------------------- derived styles --------------------------- */

  const moonLeft = useDerived(
    p,
    (v) => `calc(${r3(v * 100)}% + ${r3(INSET * (1 - 2 * v))}px)`,
    "",
  );
  const moonTop = useDerived(
    p,
    (v) => r2(horizon - h * Math.sin(Math.PI * clamp01(v))),
    `${h}`,
  );
  const railY = useDerived(
    p,
    (v) => r2(RAIL_PAD + v * (railH - 2 * RAIL_PAD)),
    `${railH}`,
  );
  const clipW = useDerived(p, (v) => r2(clamp01(v) * 1000), "");
  const clipH = useDerived(p, (v) => r2(clamp01(v) * railH), `${railH}`);
  const moonClock = useDerived(
    p,
    (v) => clock(start + Math.round(clamp01(v) * span), utcOffset),
    `${start}:${span}:${utcOffset}`,
  );

  /* ------------------------------ sky drawing ---------------------------- */

  const arcPath = React.useMemo(() => {
    const steps = 48;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push(`${r2(t * 1000)} ${r2(horizon - h * Math.sin(Math.PI * t))}`);
    }
    return `M ${pts.join(" L ")}`;
  }, [h, horizon]);

  const stars = React.useMemo(() => {
    const rand = mulberry32(2066);
    const out: { x: number; y: number; s: number; o: number }[] = [];
    for (let i = 0; i < 60 && out.length < 22; i++) {
      const x = 0.04 + rand() * 0.92;
      const y = SKY_TOP + 6 + rand() * (h - 12);
      const ceiling = horizon - h * Math.sin(Math.PI * x);
      if (y < ceiling + 8 || y > horizon - 8) continue;
      out.push({
        x: r3(x),
        y: r2(y),
        s: rand() > 0.75 ? 2 : 1.5,
        o: r2(0.25 + rand() * 0.45),
      });
    }
    return out;
  }, [h, horizon]);

  const hours = React.useMemo(() => {
    const out: { p: number; label: string }[] = [];
    const first = Math.ceil(start / (60 * MIN)) * 60 * MIN;
    for (let t = first; t <= end; t += 60 * MIN) {
      out.push({
        p: r6((t - start) / span),
        label: clock(t, utcOffset).slice(0, 2),
      });
    }
    return out;
  }, [end, span, start, utcOffset]);
  const railHourStep = railH / Math.max(1, hours.length) < 20 ? 2 : 1;

  const leftAt = (pv: number) =>
    `calc(${r3(pv * 100)}% + ${r3(INSET * (1 - 2 * pv))}px)`;

  const landedEvent =
    list.find((e) => e.at === landed) ??
    eventAt(slotIndex(fOf((landed - start) / span)));
  const valueNow = Math.round(clamp(landed - start, 0, span) / MIN);

  /* -------------------------------- parts -------------------------------- */

  const cardSurface = (outcome: NightShiftOutcome) =>
    cn(
      "relative flex h-full flex-col rounded-3 p-3 text-left",
      cardStyle === "raised" &&
        "border border-hairline bg-popover shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent),0_10px_24px_-8px_color-mix(in_oklab,black_22%,transparent)]",
      cardStyle === "outline" && "border border-hairline-strong bg-card",
      cardStyle === "tinted" && "border border-l-[3px] border-hairline",
      outcome === "failed" &&
        cardStyle !== "tinted" &&
        "border-[color-mix(in_oklab,var(--danger)_40%,var(--hairline))]",
    );
  const cardTint = (outcome: NightShiftOutcome): React.CSSProperties =>
    cardStyle === "tinted"
      ? {
          backgroundColor: `color-mix(in oklab, ${toneOf(outcome)} 9%, var(--card))`,
          borderLeftColor: toneOf(outcome),
        }
      : {};

  const eventCard = (ev: NightShiftEvent, k: number, compact: boolean) => (
    <div className={cardSurface(ev.outcome)} style={cardTint(ev.outcome)}>
      <div className="flex shrink-0 items-center gap-2">
        <Monogram name={nameOf(ev.agent)} />
        <span className="truncate text-[12px] font-medium text-foreground">
          {nameOf(ev.agent)}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {clock(ev.at, utcOffset)}
        </span>
      </div>
      <p
        title={ev.title}
        className={cn(
          "shrink-0 truncate font-medium text-foreground",
          compact
            ? "mt-1.5 text-[13px] leading-5"
            : "mt-2 text-[13px] leading-5",
        )}
      >
        {ev.title}
      </p>
      {ev.detail ? (
        <p
          className={cn(
            "mt-0.5 shrink-0 text-[12px] leading-4 text-ink-2",
            compact ? "line-clamp-1" : "line-clamp-2",
          )}
        >
          {ev.detail}
        </p>
      ) : null}
      <div className="mt-auto flex shrink-0 items-center gap-2 pt-2">
        <OutcomeBadge outcome={ev.outcome} />
        {ev.metric ? (
          <span className="min-w-0 truncate font-mono text-[11px] text-ink-3 tabular-nums">
            {ev.metric}
          </span>
        ) : null}
        <button
          type="button"
          tabIndex={k === current ? 0 : -1}
          disabled={disabled}
          onClick={() => onOpenEvent?.(ev)}
          aria-label={`Open ${ev.title}`}
          className={cn(
            "ml-auto inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-[12px] font-medium text-ink-2 transition-colors",
            "hover:bg-surface-2 hover:text-foreground disabled:opacity-50",
            FOCUS,
          )}
        >
          Open
        </button>
      </div>
    </div>
  );

  const bookend = (k: number) => {
    const dusk = k < 0;
    const firstAt = list[0]?.at;
    const lastAt = list[n - 1]?.at;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-3 border border-dashed border-hairline-strong px-3 text-center">
        {dusk ? (
          <Sunset aria-hidden className="size-4 text-warn" />
        ) : (
          <Sunrise aria-hidden className="size-4 text-warn" />
        )}
        <p className="text-[13px] font-medium text-foreground">
          {dusk ? "Dusk" : "Dawn"} ·{" "}
          <span className="font-mono tabular-nums">
            {clock(dusk ? start : end, utcOffset)}
          </span>
        </p>
        <p className="text-[12px] leading-4 text-ink-3">
          {n === 0
            ? "Nothing ran tonight."
            : dusk
              ? `The first agent starts at ${clock(firstAt ?? start, utcOffset)}.`
              : `The run ended at ${clock(lastAt ?? end, utcOffset)}.`}
        </p>
      </div>
    );
  };

  const slots = (axis: "x" | "y") =>
    Array.from({ length: n + 2 }, (_, i) => i - 1).map((k) => {
      const ev = eventAt(k);
      const compact = axis === "y";
      return (
        <StripSlot
          key={ev?.id ?? (k < 0 ? "dusk" : "dawn")}
          k={k}
          f={f}
          axis={axis}
          current={k === current}
          className={axis === "x" ? "top-1.5 left-1/2" : "inset-x-0 top-1/2"}
          style={
            axis === "x"
              ? { width: CARD_W, height: CARD_H, marginLeft: -CARD_W / 2 }
              : { height: NARROW_CARD_H, marginTop: -NARROW_CARD_H / 2 }
          }
        >
          {ev ? eventCard(ev, k, compact) : bookend(k)}
        </StripSlot>
      );
    });

  const moonBody = (
    <span className="relative flex size-[22px] items-center justify-center">
      <motion.span
        aria-hidden
        className="absolute size-14 rounded-full"
        style={{
          backgroundImage:
            "radial-gradient(closest-side, color-mix(in oklab, var(--ns-accent) 34%, transparent), transparent)",
        }}
        animate={{
          scale: dragging && motionSafe ? 1.25 : 1,
          opacity: dragging ? 1 : 0.8,
        }}
        transition={
          motionSafe
            ? { scale: springs.flick, opacity: { duration: durations.fast } }
            : { duration: 0 }
        }
      />
      <span
        aria-hidden
        className="relative size-[22px] rounded-full border border-hairline-strong shadow-[0_0_0_3px_color-mix(in_oklab,var(--ns-accent)_18%,transparent)]"
        style={{ backgroundColor: "var(--ns-moon)" }}
      >
        <span className="absolute top-[5px] left-[6px] size-[5px] rounded-full bg-[color-mix(in_oklab,var(--ns-moon)_80%,black)]" />
        <span className="absolute top-[11px] left-[12px] size-[3.5px] rounded-full bg-[color-mix(in_oklab,var(--ns-moon)_84%,black)]" />
      </span>
    </span>
  );

  const sliderProps = (orientation: "horizontal" | "vertical") => ({
    role: "slider" as const,
    tabIndex: ready ? 0 : -1,
    "aria-label": "Time in the night",
    "aria-describedby": hintId,
    "aria-orientation": orientation,
    "aria-valuemin": 0,
    "aria-valuemax": Math.round(span / MIN),
    "aria-valuenow": valueNow,
    "aria-valuetext": landedEvent
      ? describe(list.indexOf(landedEvent))
      : describe(landed <= start ? -1 : n),
    "aria-disabled": disabled || undefined,
    "data-ns-moon": "",
  });

  /* -------------------------------- header ------------------------------- */

  const ackLabel = isAck
    ? `Acknowledged ${clock(now ?? end + 42 * MIN, utcOffset)}`
    : "Acknowledge";

  const header = (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          <Moon aria-hidden className="size-4 shrink-0 text-(--ns-accent)" />
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
        </div>
        <p className="mt-0.5 text-[12px] leading-4 text-ink-3">
          {source} ·{" "}
          <span className="font-mono tabular-nums">
            {clock(start, utcOffset)}–{clock(end, utcOffset)}
          </span>
          {workers.length > 0 ? ` · ${listOf(workers.map((a) => a.name))}` : ""}
        </p>
      </div>
      <button
        type="button"
        aria-disabled={disabled || isAck || !ready || undefined}
        onClick={() => {
          if (disabled || isAck || !ready) return;
          if (acknowledged === undefined) setOwnAck(true);
          setSaid(
            `Digest acknowledged at ${clock(now ?? end + 42 * MIN, utcOffset)}.`,
          );
          onAcknowledge?.();
        }}
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors",
          isAck
            ? "bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success"
            : "border border-hairline-strong text-foreground hover:bg-surface-2",
          (disabled || !ready) && !isAck && "opacity-50",
          FOCUS,
        )}
      >
        {isAck ? <DrawnCheck motionSafe={motionSafe} /> : null}
        <span className="tabular-nums">{ackLabel}</span>
      </button>
    </div>
  );

  const countChip = (dot: string, text: string) => (
    <span className="inline-flex h-7 items-center gap-1.5 font-mono text-[11px] text-ink-2 tabular-nums">
      <span aria-hidden className={cn("size-1.5 rounded-full", dot)} />
      {text}
    </span>
  );

  /** Counts, then the failed runs pinned as buttons that scrub to them. */
  const summary =
    ready && n > 0 ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {countChip("bg-(--ns-accent)", `${counts.done} done`)}
        {counts.flagged > 0
          ? countChip("bg-warn", `${counts.flagged} flagged`)
          : null}
        {failed.length > 0 ? (
          countChip("bg-danger", `${counts.failed} failed`)
        ) : pinFailures ? (
          <span className="inline-flex h-7 items-center gap-1.5 text-[12px] text-ink-2">
            <CircleCheck
              aria-hidden
              className="size-3.5 shrink-0 text-success"
            />
            No failed runs overnight.
          </span>
        ) : null}
        {pinFailures && failed.length > 0 ? (
          <ul
            aria-label="Failed runs"
            className="flex max-w-full min-w-0 flex-wrap items-center gap-1.5"
          >
            {failed.map((ev) => {
              const k = list.indexOf(ev);
              const on = k === current;
              return (
                <li key={ev.id} className="max-w-full min-w-0">
                  <button
                    type="button"
                    disabled={disabled}
                    aria-current={on || undefined}
                    onClick={() => {
                      glideToSlot(k);
                      land(k);
                    }}
                    className={cn(
                      "inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors",
                      on
                        ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-foreground"
                        : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    <OctagonX
                      aria-hidden
                      className="size-3.5 shrink-0 text-danger"
                    />
                    <span className="shrink-0 font-mono text-[11px] text-danger tabular-nums">
                      {clock(ev.at, utcOffset)}
                    </span>
                    <span className="truncate" title={ev.title}>
                      {nameOf(ev.agent)} · {ev.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    ) : null;

  const quietNight = (
    <div className="flex items-center gap-3 rounded-3 border border-dashed border-hairline-strong px-4 py-4">
      <Moon aria-hidden className="size-5 shrink-0 text-ink-3" />
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">A quiet night</p>
        <p className="text-[12px] leading-4 text-ink-3">
          {`No agent ran between ${clock(start, utcOffset)} and ${clock(end, utcOffset)}.`}
        </p>
      </div>
    </div>
  );

  /* ------------------------------ wide layout ---------------------------- */

  const wide = (
    <div className="hidden flex-col gap-2 @min-[30rem]/night-shift:flex">
      <div
        ref={skyRef}
        onClick={(event) => tapTrack(event, "x")}
        className={cn(
          "relative w-full select-none",
          ready && !disabled && "cursor-pointer",
        )}
        style={{ height: horizon + LABELS }}
      >
        <svg
          aria-hidden
          className="absolute top-0"
          style={{
            left: INSET,
            right: INSET,
            width: `calc(100% - ${2 * INSET}px)`,
          }}
          height={horizon + 1}
          viewBox={`0 0 1000 ${horizon + 1}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`${svgId}-sky`} x1="0" x2="1" y1="0" y2="0">
              <stop
                offset="0"
                style={{
                  stopColor:
                    "color-mix(in oklab, var(--warn) 16%, transparent)",
                }}
              />
              <stop
                offset="0.2"
                style={{
                  stopColor:
                    "color-mix(in oklab, var(--ns-accent) 8%, transparent)",
                }}
              />
              <stop
                offset="0.5"
                style={{
                  stopColor:
                    "color-mix(in oklab, var(--ns-accent) 17%, transparent)",
                }}
              />
              <stop
                offset="0.8"
                style={{
                  stopColor:
                    "color-mix(in oklab, var(--ns-accent) 8%, transparent)",
                }}
              />
              <stop
                offset="1"
                style={{
                  stopColor:
                    "color-mix(in oklab, var(--warn) 13%, transparent)",
                }}
              />
            </linearGradient>
            <clipPath id={`${svgId}-gone`}>
              <motion.rect x={0} y={0} height={horizon + 1} width={clipW} />
            </clipPath>
          </defs>
          <path d={`${arcPath} Z`} fill={`url(#${svgId}-sky)`} />
          <path
            d={arcPath}
            fill="none"
            className="stroke-hairline-strong"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={arcPath}
            fill="none"
            stroke="var(--ns-accent)"
            strokeWidth={2}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            clipPath={`url(#${svgId}-gone)`}
          />
          <line
            x1={0}
            x2={1000}
            y1={horizon}
            y2={horizon}
            className="stroke-hairline-strong"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {stars.map((s, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute rounded-full bg-ink-3"
            style={{
              left: leftAt(s.x),
              top: s.y,
              width: s.s,
              height: s.s,
              opacity: s.o,
            }}
          />
        ))}

        {hours.map((hr, i) => (
          <span
            key={`${hr.p}`}
            aria-hidden
            className="absolute flex -translate-x-1/2 flex-col items-center"
            style={{ left: leftAt(hr.p), top: horizon }}
          >
            <span className="h-1 w-px bg-hairline-strong" />
            <span
              className={cn(
                "mt-2.5 font-mono text-[10px] leading-none text-ink-3 tabular-nums",
                hours.length > 9 &&
                  i % 2 === 1 &&
                  "hidden @min-[40rem]/night-shift:block",
              )}
            >
              {hr.label}
            </span>
          </span>
        ))}

        {list.map((ev, k) => {
          const pv = (ev.at - start) / span;
          const on = k === current;
          return (
            <span
              key={ev.id}
              aria-hidden
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: leftAt(pv),
                top: r2(horizon - h * Math.sin(Math.PI * pv)),
                zIndex: on ? 2 : 1,
              }}
            >
              <span
                className={cn(
                  "relative block rounded-full border-2 border-card",
                  ev.outcome === "done" ? "size-2.5" : "size-3",
                )}
                style={{ backgroundColor: toneOf(ev.outcome) }}
              >
                {on ? (
                  <motion.span
                    key={ev.id}
                    className="absolute -inset-[5px] rounded-full border-2"
                    style={{ borderColor: toneOf(ev.outcome) }}
                    initial={{ scale: motionSafe ? 0.3 : 1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={
                      motionSafe
                        ? {
                            scale: springs.snap,
                            opacity: { duration: durations.fast },
                          }
                        : { duration: durations.fast }
                    }
                  />
                ) : null}
              </span>
            </span>
          );
        })}

        <motion.div
          className="absolute z-10"
          style={{ left: moonLeft, top: moonTop }}
        >
          <div className="absolute bottom-[15px] left-1/2 -translate-x-1/2">
            <motion.span
              aria-hidden
              className="block rounded-1 bg-card/80 px-1 font-mono text-[10px] leading-4 font-medium text-ink-2 tabular-nums"
            >
              {moonClock}
            </motion.span>
          </div>
          <div
            {...sliderProps("horizontal")}
            {...moonX}
            onKeyDown={onMoonKey}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 touch-pan-y rounded-full",
              ready && !disabled
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-default",
              FOCUS,
            )}
          >
            {moonBody}
          </div>
        </motion.div>
      </div>

      {n > 0 ? (
        <div
          role="group"
          aria-label="Event under the moon"
          {...stripX}
          className={cn(
            "relative w-full touch-pan-y overflow-hidden select-none",
            ready && !disabled && "cursor-grab active:cursor-grabbing",
          )}
          style={{
            height: STRIP_H,
            maskImage:
              "linear-gradient(to right, transparent, black 14%, black 86%, transparent)",
          }}
        >
          {slots("x")}
        </div>
      ) : (
        quietNight
      )}
    </div>
  );

  /* ----------------------------- narrow layout --------------------------- */

  const narrow = (
    <div className="flex gap-3 @min-[30rem]/night-shift:hidden">
      <div
        ref={railRef}
        onClick={(event) => tapTrack(event, "y")}
        className={cn(
          "relative w-12 shrink-0 select-none",
          ready && !disabled && "cursor-pointer",
        )}
        style={{ height: railH }}
      >
        <span
          aria-hidden
          className="absolute w-px bg-hairline-strong"
          style={{ left: 33, top: RAIL_PAD, bottom: RAIL_PAD }}
        />
        <span
          aria-hidden
          className="absolute overflow-hidden"
          style={{ left: 32, top: 0, width: 3, height: railH }}
        >
          <motion.span
            className="absolute top-0 left-0 block w-[3px] rounded-full bg-(--ns-accent)"
            style={{ height: clipH }}
          />
        </span>
        {hours.map((hr, i) =>
          i % railHourStep === 0 ? (
            <span
              key={`${hr.p}`}
              aria-hidden
              className="absolute left-0 flex -translate-y-1/2 items-center gap-1"
              style={{ top: r2(RAIL_PAD + hr.p * (railH - 2 * RAIL_PAD)) }}
            >
              <span className="w-4 text-right font-mono text-[10px] leading-none text-ink-3 tabular-nums">
                {hr.label}
              </span>
            </span>
          ) : null,
        )}
        {list.map((ev, k) => {
          const pv = (ev.at - start) / span;
          return (
            <span
              key={ev.id}
              aria-hidden
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card",
                ev.outcome === "done" ? "size-2.5" : "size-3",
              )}
              style={{
                left: 33.5,
                top: r2(RAIL_PAD + pv * (railH - 2 * RAIL_PAD)),
                backgroundColor: toneOf(ev.outcome),
                boxShadow:
                  k === current
                    ? `0 0 0 3px color-mix(in oklab, ${toneOf(ev.outcome)} 35%, transparent)`
                    : undefined,
              }}
            />
          );
        })}
        <motion.div
          className="absolute top-0 z-10"
          style={{ left: 33.5, y: railY }}
        >
          <div
            {...sliderProps("vertical")}
            {...moonY}
            onKeyDown={onMoonKey}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 touch-pan-x rounded-full",
              ready && !disabled
                ? "cursor-grab active:cursor-grabbing"
                : "cursor-default",
              FOCUS,
            )}
          >
            {moonBody}
          </div>
        </motion.div>
      </div>
      {n > 0 ? (
        <div
          role="group"
          aria-label="Event under the moon"
          {...stripY}
          className={cn(
            "relative min-w-0 flex-1 touch-pan-x overflow-hidden select-none",
            ready && !disabled && "cursor-grab active:cursor-grabbing",
          )}
          style={{
            height: railH,
            maskImage:
              "linear-gradient(to bottom, transparent, black 16%, black 84%, transparent)",
          }}
        >
          {slots("y")}
        </div>
      ) : (
        <div className="min-w-0 flex-1 self-center">{quietNight}</div>
      )}
    </div>
  );

  /* -------------------------------- states ------------------------------- */

  const loading = (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="relative h-36 overflow-hidden rounded-3 border border-dashed border-hairline-strong">
        <span className="absolute inset-x-6 bottom-6 h-px bg-hairline-strong" />
        <span className="absolute bottom-6 left-1/2 size-[22px] -translate-x-1/2 rounded-full bg-surface-2" />
      </div>
      <div className="flex gap-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn(
              "h-24 flex-1 rounded-3 bg-surface-2",
              i === 2 && "hidden @min-[30rem]/night-shift:block",
            )}
            style={{ opacity: 1 - i * 0.25 }}
          />
        ))}
      </div>
      <p className="text-[12px] text-ink-3">Loading the night’s run…</p>
    </div>
  );

  const failedLoad = (
    <div className="flex flex-col items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-4">
      <p className="inline-flex items-center gap-2 text-[13px] text-foreground">
        <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
        The overnight run could not be loaded.
      </p>
      <button
        type="button"
        onClick={onReload}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline-strong px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
          FOCUS,
        )}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Try again
      </button>
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container/night-shift relative flex w-full flex-col gap-3 overflow-hidden rounded-4 border border-hairline bg-card p-4 text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={
        {
          "--ns-accent": accent,
          "--ns-wash": `color-mix(in oklab, ${accent} 13%, transparent)`,
          "--ns-moon": "oklch(from var(--warn) 0.93 0.045 h)",
        } as React.CSSProperties
      }
    >
      {header}
      {status === "loading" ? (
        loading
      ) : status === "error" ? (
        failedLoad
      ) : (
        <>
          {summary}
          {wide}
          {narrow}
        </>
      )}
      <p id={hintId} className="sr-only">
        Left and Right step through the night event by event, Home and End jump
        to dusk and dawn, Page Up and Page Down move about an hour, Enter opens
        the event.
      </p>
      <p role="status" className="sr-only">
        {said}
      </p>
    </div>
  );
}
