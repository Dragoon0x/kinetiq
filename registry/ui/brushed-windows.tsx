"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { RotateCcw, TriangleAlert, X } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type GaugeLevel = "info" | "warn" | "alert";

export type GaugeEvent = {
  id: string;
  /** When it happened, ms. */
  at: number;
  title: string;
  /** Which gauge, line or station raised it. */
  source: string;
  level: GaugeLevel;
};

/** A cut window, ms. `id` is assigned when missing and reported back. */
export type BrushWindow = { id?: string; start: number; end: number };

export type BrushStatus = "ready" | "loading" | "error";

export type BrushedWindowsProps = {
  /** The events the ribbon counts and the list shows. @default defaultGaugeEvents (30 days) */
  events?: GaugeEvent[];
  /** Controlled windows. */
  windows?: BrushWindow[];
  /** Initial windows when uncontrolled. @default defaultGaugeWindows */
  defaultWindows?: BrushWindow[];
  /** Fires with every window, in time order, after a cut, move, resize, merge or removal. */
  onWindowsChange?: (windows: Required<BrushWindow>[]) => void;
  /** The end of the period, ms; the ribbon shows the `days` before it. @default defaultGaugeNow */
  now?: number;
  /** How many days the ribbon spans. @default 30 */
  days?: number;
  /** Hours per bin: the ribbon's grain and the step windows snap to. @default 6 */
  binSize?: number;
  /** How frosted a window's glass is, 0 (clear) to 1 (deep frost). @default 0.5 */
  frostLevel?: number;
  /** Windows, their density and the chips, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Most windows at once; a cut past it replaces the oldest. @default 6 */
  maxWindows?: number;
  /** Rows shown per window before "Show all". @default 5 */
  rowsPerWindow?: number;
  /** How long a touch must hold before it starts a window, ms. @default 380 */
  longPressMs?: number;
  /** Whether the events have arrived. @default "ready" */
  status?: BrushStatus;
  /** "Try again" was pressed after the events failed to load. */
  onRetry?: () => void;
  /** The heading over the ribbon. @default "Gaugeworks events" */
  title?: string;
  /** Height of the surface, px; the list scrolls inside it. @default 520 */
  height?: number;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The end of the seeded period: midnight starting 12 October 2026. */
export const defaultGaugeNow = Date.UTC(2026, 9, 12);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: Record<GaugeLevel, string[]> = {
  alert: ["Pressure high", "Flow drop", "Sensor offline", "Valve stuck"],
  warn: ["Drift above 2%", "Battery low", "Late reading", "Temperature rising"],
  info: [
    "Calibration done",
    "Reading resumed",
    "Firmware updated",
    "Shift handover",
  ],
};
const SOURCES = [
  "Gauge 7",
  "Gauge 14",
  "Line 3",
  "Line 5",
  "North station",
  "Weir pump",
  "Basin inlet",
];

function makeEvents(): GaugeEvent[] {
  const rand = mulberry32(1637);
  const start = defaultGaugeNow - 30 * DAY;
  const out: GaugeEvent[] = [];
  for (let h = 0; h < 30 * 24; h += 1) {
    const at = start + h * HOUR;
    const day = h / 24;
    const hod = h % 24;
    const dow = new Date(at).getUTCDay();
    const weekend = dow === 0 || dow === 6;
    let rate = 0.12;
    if (!weekend && hod >= 7 && hod < 19) rate = 0.42;
    else if (weekend) rate = 0.06;
    // Two storms and one quiet stretch (the line was drained for a refit).
    if (day >= 6.5 && day < 7.4) rate = 2.4;
    if (day >= 21.1 && day < 21.6) rate = 2.8;
    if (day >= 15.4 && day < 18.6) rate = 0;
    let n = Math.floor(rate + rand());
    while (n > 0) {
      n -= 1;
      const r = rand();
      const level: GaugeLevel =
        rate > 2
          ? r < 0.55
            ? "alert"
            : "warn"
          : r < 0.12
            ? "alert"
            : r < 0.4
              ? "warn"
              : "info";
      const kinds = KINDS[level];
      out.push({
        id: `e${out.length}`,
        at: at + Math.floor(rand() * 60) * 60_000,
        title: kinds[Math.floor(rand() * kinds.length)] ?? "",
        source: SOURCES[Math.floor(rand() * SOURCES.length)] ?? "",
        level,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Thirty days of Gaugeworks events with two storms and a quiet refit. */
export const defaultGaugeEvents: GaugeEvent[] = makeEvents();

/** Two windows over the storms. */
export const defaultGaugeWindows: Required<BrushWindow>[] = [
  {
    id: "w-a",
    start: defaultGaugeNow - 30 * DAY + 6 * DAY + 12 * HOUR,
    end: defaultGaugeNow - 30 * DAY + 7 * DAY + 12 * HOUR,
  },
  {
    id: "w-b",
    start: defaultGaugeNow - 30 * DAY + 21 * DAY,
    end: defaultGaugeNow - 30 * DAY + 21 * DAY + 18 * HOUR,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const exitTransition = { duration: durations.fast, ease: easings.exit };

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const pad = (n: number) => String(n).padStart(2, "0");
/** Fixed UTC formatting: the same string on the server and in the browser. */
const dayText = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const timeText = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const rangeText = (a: number, b: number) =>
  `${dayText(a)} ${timeText(a)} – ${dayText(b)} ${timeText(b)}`;

const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const PLOT_H = 80;
const VIEW_W = 1000;

const LEVEL_DOT: Record<GaugeLevel, string> = {
  alert: "bg-danger",
  warn: "bg-warn",
  info: "bg-ink-3",
};

type Win = Required<BrushWindow>;

/** Joins windows that touch or overlap, keeping the earliest one's id. */
function merge(list: Win[]): Win[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Win[] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end) {
      last.end = Math.max(last.end, w.end);
    } else out.push({ ...w });
  }
  return out;
}

/** A smooth path through the bin counts (a Catmull-Rom spline as Béziers). */
function areaPath(counts: number[], max: number, closed: boolean): string {
  const n = counts.length;
  if (n === 0) return "";
  const pts = counts.map((c, i) => [
    ((i + 0.5) / n) * VIEW_W,
    PLOT_H - (c / Math.max(1, max)) * (PLOT_H - 6),
  ]);
  const first = pts[0] ?? [0, PLOT_H];
  const last = pts[n - 1] ?? [VIEW_W, PLOT_H];
  const p = (pt: number[]) => `${r2(pt[0] ?? 0)} ${r2(pt[1] ?? 0)}`;
  let d = closed
    ? `M 0 ${PLOT_H} L 0 ${r2(first[1] ?? PLOT_H)} L ${p(first)}`
    : `M 0 ${r2(first[1] ?? PLOT_H)} L ${p(first)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)] ?? first;
    const p1 = pts[i] ?? first;
    const p2 = pts[i + 1] ?? last;
    const p3 = pts[Math.min(n - 1, i + 2)] ?? last;
    // A flat run stays flat: the spline would otherwise dip below zero.
    const k = 1 / 6;
    const c1 = [
      (p1[0] ?? 0) + ((p2[0] ?? 0) - (p0[0] ?? 0)) * k,
      Math.min(PLOT_H, (p1[1] ?? 0) + ((p2[1] ?? 0) - (p0[1] ?? 0)) * k),
    ];
    const c2 = [
      (p2[0] ?? 0) - ((p3[0] ?? 0) - (p1[0] ?? 0)) * k,
      Math.min(PLOT_H, (p2[1] ?? 0) - ((p3[1] ?? 0) - (p1[1] ?? 0)) * k),
    ];
    d += ` C ${p(c1)} ${p(c2)} ${p(p2)}`;
  }
  d += ` L ${VIEW_W} ${r2(last[1] ?? PLOT_H)}`;
  if (closed) d += ` L ${VIEW_W} ${PLOT_H} Z`;
  return d;
}

/* ----------------------------------------------------------------------- */
/*                                  Ribbon art                             */
/* ----------------------------------------------------------------------- */

function RibbonArt({
  area,
  line,
  tone,
}: {
  area: string;
  line: string;
  tone: "muted" | "accent";
}) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VIEW_W} ${PLOT_H}`}
      preserveAspectRatio="none"
      className="absolute inset-0 block size-full overflow-visible"
    >
      <path
        d={area}
        className={
          tone === "muted"
            ? "fill-[color-mix(in_oklab,var(--ink-3)_20%,transparent)]"
            : "fill-[color-mix(in_oklab,var(--bw-accent)_42%,transparent)]"
        }
      />
      <path
        d={line}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeWidth={tone === "muted" ? 1 : 1.5}
        className={
          tone === "muted"
            ? "stroke-[color-mix(in_oklab,var(--ink-3)_65%,transparent)]"
            : "stroke-(--bw-accent)"
        }
      />
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Pane                                  */
/* ----------------------------------------------------------------------- */

type PaneProps = {
  win: Win;
  /** Where a fresh cut was let go, unsnapped: the pane settles from here. */
  born?: { a: number; b: number };
  /** Too narrow for its count label. */
  narrow: boolean;
  index: number;
  count: number;
  from: number;
  span: number;
  bin: number;
  frost: number;
  area: string;
  line: string;
  motionSafe: boolean;
  disabled: boolean;
  ribbonRef: React.RefObject<HTMLDivElement | null>;
  bindNode: (id: string, node: HTMLDivElement | null) => void;
  onCommit: (id: string, start: number, end: number) => void;
  onRemove: (id: string) => void;
  onEscape: () => void;
  onLive: (text: string | null) => void;
};

/**
 * One frosted window. Its edges are motion values in shares of the period:
 * a drag writes them 1:1, a release hands them to `snap` (with the drag's
 * velocity, which the motion values have been tracking) onto bin boundaries.
 */
function Pane({
  win,
  born,
  narrow,
  index,
  count,
  from,
  span,
  bin,
  frost,
  area,
  line,
  motionSafe,
  disabled,
  ribbonRef,
  bindNode,
  onCommit,
  onRemove,
  onEscape,
  onLive,
}: PaneProps) {
  const fa = (win.start - from) / span;
  const fb = (win.end - from) / span;
  const a = useMotionValue(born?.a ?? fa);
  const b = useMotionValue(born?.b ?? fb);
  const dragging = React.useRef(false);
  const grab = React.useRef({ a: fa, b: fb, w: 1 });
  const [settled, setSettled] = React.useState(true);

  // A committed change (a release, a key, the host) lands on snap.
  React.useEffect(() => {
    if (dragging.current) return;
    if (!motionSafe) {
      a.jump(fa);
      b.jump(fb);
      return;
    }
    const runs: AnimationPlaybackControls[] = [
      animate(a, fa, springs.snap),
      animate(b, fb, springs.snap),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
  }, [a, b, fa, fb, motionSafe]);

  const left = useTransform(a, (v) => `${r2(clamp01(v) * 100)}%`);
  const width = useTransform(
    [a, b] as MotionValue<number>[],
    ([x, y]) =>
      `${r2(Math.max(0, clamp01(y as number) - clamp01(x as number)) * 100)}%`,
  );
  // The accent art inside spans the whole ribbon, shifted so it lines up.
  const artLeft = useTransform([a, b] as MotionValue<number>[], ([x, y]) => {
    const w = Math.max(0.0001, (y as number) - (x as number));
    return `${r2((-(x as number) / w) * 100)}%`;
  });
  const artWidth = useTransform([a, b] as MotionValue<number>[], ([x, y]) => {
    const w = Math.max(0.0001, (y as number) - (x as number));
    return `${r2((1 / w) * 100)}%`;
  });

  const snapTo = (v: number) => clamp01(Math.round(v / bin) * bin);

  const begin = () => {
    dragging.current = true;
    setSettled(false);
    grab.current = {
      a: a.get(),
      b: b.get(),
      w: ribbonRef.current?.getBoundingClientRect().width ?? 1,
    };
  };
  const finish = () => {
    dragging.current = false;
    setSettled(true);
    onLive(null);
    let na = snapTo(Math.min(a.get(), b.get()));
    let nb = snapTo(Math.max(a.get(), b.get()));
    if (nb - na < bin) {
      if (na + bin <= 1) nb = na + bin;
      else na = nb - bin;
    }
    const start = Math.round(from + na * span);
    const end = Math.round(from + nb * span);
    if (start === win.start && end === win.end) {
      // Nothing changed: settle back by hand, the effect will not re-run.
      if (motionSafe) {
        animate(a, fa, springs.snap);
        animate(b, fb, springs.snap);
      } else {
        a.jump(fa);
        b.jump(fb);
      }
      return;
    }
    onCommit(win.id, start, end);
  };
  const live = () =>
    onLive(
      rangeText(
        from + clamp01(Math.min(a.get(), b.get())) * span,
        from + clamp01(Math.max(a.get(), b.get())) * span,
      ),
    );

  const body = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: begin,
    onMove: ({ offset }) => {
      const g = grab.current;
      const d = offset.x / g.w;
      const w = g.b - g.a;
      const na = rubberClamp(g.a + d, 0, 1 - w, 0.2);
      a.set(r4(na));
      b.set(r4(na + w));
      live();
    },
    onEnd: finish,
    onCancel: finish,
  });
  const edgeA = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: begin,
    onMove: ({ offset }) => {
      const g = grab.current;
      a.set(r4(rubberClamp(g.a + offset.x / g.w, 0, g.b - bin, 0.2)));
      live();
    },
    onEnd: finish,
    onCancel: finish,
  });
  const edgeB = useDrag({
    axis: "x",
    threshold: 2,
    disabled,
    onStart: begin,
    onMove: ({ offset }) => {
      const g = grab.current;
      b.set(r4(rubberClamp(g.b + offset.x / g.w, g.a + bin, 1, 0.2)));
      live();
    },
    onEnd: finish,
    onCancel: finish,
  });

  const step = (da: number, db: number) => {
    let na = fa + da;
    let nb = fb + db;
    if (da === db) {
      const w = fb - fa;
      na = Math.max(0, Math.min(1 - w, na));
      nb = na + w;
    } else {
      na = Math.max(0, Math.min(nb - bin, na));
      nb = Math.min(1, Math.max(na + bin, nb));
    }
    onCommit(
      win.id,
      Math.round(from + snapTo(na) * span),
      Math.round(from + snapTo(nb) * span),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const dir =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (dir !== 0) {
      event.preventDefault();
      if (event.shiftKey && event.altKey) step(dir * bin, 0);
      else if (event.shiftKey) step(0, dir * bin);
      else step(dir * bin, dir * bin);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onRemove(win.id);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
    }
  };

  const handle = (side: "a" | "b") => (
    <span
      {...(side === "a" ? edgeA : edgeB)}
      onPointerDown={(event) => {
        // The edge, not the body, takes this press.
        event.stopPropagation();
        (side === "a" ? edgeA : edgeB).onPointerDown(event);
      }}
      aria-hidden
      className={cn(
        "absolute inset-y-0 z-[2] flex w-4 cursor-ew-resize touch-pan-y items-center justify-center",
        side === "a" ? "-left-2" : "-right-2",
      )}
    >
      <motion.span
        className="h-7 w-1.5 rounded-full border border-(--bw-accent) bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_18%,transparent)]"
        initial={born && motionSafe ? { scale: 0, opacity: 0 } : false}
        animate={{ scale: settled ? 1 : 0.6, opacity: settled ? 1 : 0.7 }}
        transition={
          motionSafe
            ? {
                scale: { ...springs.snap, delay: born ? 0.08 : 0 },
                opacity: { duration: durations.fast, delay: born ? 0.08 : 0 },
              }
            : { duration: 0 }
        }
      />
    </span>
  );

  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => bindNode(win.id, node)}
      role="group"
      tabIndex={0}
      aria-roledescription="time window"
      aria-label={`Window ${index + 1}, ${rangeText(win.start, win.end)}, ${count} ${count === 1 ? "event" : "events"}`}
      aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight Delete"
      onKeyDown={onKeyDown}
      {...body}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitTransition }}
      transition={{ duration: durations.fast }}
      style={{ left, width }}
      className={cn(
        "absolute inset-y-0 z-[1] cursor-grab touch-pan-y rounded-2 border-x border-(--bw-accent) active:cursor-grabbing",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-0 overflow-hidden rounded-2"
        style={{
          backdropFilter: `blur(${r2(frost * 5)}px) saturate(${r2(1 + frost * 0.4)})`,
          WebkitBackdropFilter: `blur(${r2(frost * 5)}px) saturate(${r2(1 + frost * 0.4)})`,
          backgroundColor: `color-mix(in oklab, var(--bw-accent) ${Math.round(6 + frost * 12)}%, color-mix(in oklab, var(--card) ${Math.round(frost * 40)}%, transparent))`,
        }}
      >
        <motion.span
          className="absolute inset-y-0 block"
          style={{ left: artLeft, width: artWidth }}
        >
          <RibbonArt area={area} line={line} tone="accent" />
        </motion.span>
      </span>
      {narrow ? null : (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 left-1.5 z-[1] font-mono text-[10px] leading-none text-(--bw-accent) tabular-nums"
        >
          {count}
        </span>
      )}
      {handle("a")}
      {handle("b")}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A density ribbon of a month of events above an event list. Dragging across
 * the ribbon cuts a frosted window that follows the pointer 1:1, and you may
 * cut as many as you need (a cut that overlaps another joins it). On release
 * the window's edges settle onto the nearest bin boundaries on `snap` with
 * the drag's velocity, its soft handles swell in on `snap`, a chip for it
 * pops into the row below, and the list regroups on `glide`: one heading per
 * window, rows outside every window folding away.
 *
 * Inside a window the density is redrawn in the accent over frosted glass. A
 * stretch with no events is drawn as a flat calm line with a quiet label.
 * Touch starts a window with a long press so a swipe still scrolls; the
 * ribbon is a slider cursor for the keyboard (Enter cuts a day), and each
 * window moves with the arrows, resizes with Shift, and goes with Delete.
 */
export function BrushedWindows({
  events = defaultGaugeEvents,
  windows: windowsProp,
  defaultWindows = defaultGaugeWindows,
  onWindowsChange,
  now = defaultGaugeNow,
  days = 30,
  binSize = 6,
  frostLevel = 0.5,
  accent = "var(--accent-bright)",
  maxWindows = 6,
  rowsPerWindow = 5,
  longPressMs = 380,
  status = "ready",
  onRetry,
  title = "Gaugeworks events",
  height = 520,
  disabled = false,
  className,
}: BrushedWindowsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const span = Math.max(1, days) * DAY;
  const from = now - span;
  const hours = Math.min(24, Math.max(1, binSize));
  const bins = Math.max(1, Math.ceil((days * 24) / hours));
  const bin = 1 / bins;

  const withIds = (list: BrushWindow[]): Win[] =>
    list.map((w, i) => ({ id: w.id ?? `w${i}`, start: w.start, end: w.end }));
  const [own, setOwn] = React.useState<Win[]>(() => withIds(defaultWindows));
  const wins = windowsProp ? withIds(windowsProp) : own;

  const [cursor, setCursor] = React.useState(() => Math.floor(bins * 0.5));
  const [cutting, setCutting] = React.useState(false);
  const [liveRange, setLiveRange] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = React.useState("");
  const [births, setBirths] = React.useState<
    Record<string, { a: number; b: number }>
  >({});
  const [ribbonWidth, setRibbonWidth] = React.useState(0);

  const ribbonRef = React.useRef<HTMLDivElement | null>(null);
  const sliderRef = React.useRef<HTMLDivElement | null>(null);
  const paneNodes = React.useRef(new Map<string, HTMLDivElement>());
  const serial = React.useRef(0);
  const focusReq = React.useRef<string | null>(null);
  const draftA = useMotionValue(0);
  const draftB = useMotionValue(0);
  const armed = React.useRef(false);
  const pressTimer = React.useRef<number | null>(null);
  const touchPress = React.useRef(false);
  const seeded = React.useRef(false);
  const startFrac = React.useRef(0);

  const ready = status === "ready";

  /* ------------------------------ ribbon -------------------------------- */

  const ribbon = React.useMemo(() => {
    const counts = new Array<number>(bins).fill(0);
    for (const e of events) {
      if (e.at < from || e.at >= now) continue;
      const i = Math.min(bins - 1, Math.floor(((e.at - from) / span) * bins));
      counts[i] = (counts[i] ?? 0) + 1;
    }
    const max = Math.max(1, ...counts);
    // Quiet: at least a day and a half without a single event.
    const quiet: { a: number; b: number }[] = [];
    const need = Math.max(1, Math.ceil(36 / hours));
    let run = -1;
    counts.forEach((c, i) => {
      if (c === 0 && run < 0) run = i;
      if ((c !== 0 || i === bins - 1) && run >= 0) {
        const end = c === 0 ? i + 1 : i;
        if (end - run >= need) quiet.push({ a: run, b: end });
        run = -1;
      }
    });
    return {
      counts,
      area: areaPath(counts, max, true),
      line: areaPath(counts, max, false),
      quiet,
    };
  }, [bins, events, from, hours, now, span]);

  const countIn = React.useCallback(
    (start: number, end: number) =>
      events.filter((e) => e.at >= start && e.at < end).length,
    [events],
  );

  const draftLeft = useTransform(
    [draftA, draftB] as MotionValue<number>[],
    ([x, y]) => `${r2(clamp01(Math.min(x as number, y as number)) * 100)}%`,
  );
  const draftWidth = useTransform(
    [draftA, draftB] as MotionValue<number>[],
    ([x, y]) =>
      `${r2(Math.abs(clamp01(y as number) - clamp01(x as number)) * 100)}%`,
  );

  /* ------------------------------ changes ------------------------------- */

  const commit = (next: Win[], said: string) => {
    const merged = merge(next);
    if (!windowsProp) setOwn(merged);
    onWindowsChange?.(merged);
    const total = merged.reduce((n, w) => n + countIn(w.start, w.end), 0);
    setAnnouncement(
      `${said} ${merged.length} ${merged.length === 1 ? "window" : "windows"}, ${total} ${total === 1 ? "event" : "events"}.`,
    );
    return merged;
  };

  const cut = (fa: number, fb: number) => {
    let na = Math.round(Math.min(fa, fb) / bin) * bin;
    let nb = Math.round(Math.max(fa, fb) / bin) * bin;
    if (nb - na < bin) {
      nb = Math.min(1, na + bin);
      na = nb - bin;
    }
    serial.current += 1;
    const id = `cut-${serial.current}`;
    setBirths((x) => ({
      ...x,
      [id]: { a: clamp01(Math.min(fa, fb)), b: clamp01(Math.max(fa, fb)) },
    }));
    const fresh: Win = {
      id,
      start: Math.round(from + clamp01(na) * span),
      end: Math.round(from + clamp01(nb) * span),
    };
    // Past the limit the oldest window gives way.
    const kept = wins.length >= maxWindows ? wins.slice(1) : wins;
    const merged = commit([...kept, fresh], "Window cut.");
    const landed = merged.find(
      (w) => w.start <= fresh.start && w.end >= fresh.end,
    );
    return landed?.id ?? id;
  };

  const onPaneCommit = (id: string, start: number, end: number) => {
    commit(
      wins.map((w) => (w.id === id ? { ...w, start, end } : w)),
      "Window moved.",
    );
  };

  const removeWindow = (id: string) => {
    if (disabled) return;
    commit(
      wins.filter((w) => w.id !== id),
      "Window removed.",
    );
    sliderRef.current?.focus();
  };

  // Focus that must land on a window is bound to the node when it arrives:
  // checked after every commit until that pane is in the document.
  React.useEffect(() => {
    const id = focusReq.current;
    if (!id) return;
    const node = paneNodes.current.get(id);
    if (node?.isConnected) {
      focusReq.current = null;
      node.focus();
    }
  });

  const bindNode = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) paneNodes.current.set(id, node);
      else paneNodes.current.delete(id);
    },
    [],
  );

  /* ------------------------------ cutting ------------------------------- */

  // The ribbon's width only decides which windows have room for a label.
  React.useEffect(() => {
    const node = ribbonRef.current;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setRibbonWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const fracAt = (clientX: number) => {
    const r = ribbonRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    return clamp01((clientX - r.left) / r.width);
  };

  const clearPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  React.useEffect(() => clearPress, []);

  const cutDrag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: disabled || !ready,
    onStart: ({ point }) => {
      clearPress();
      // A touch that moves before its long press is a scroll, not a cut.
      if (touchPress.current && !armed.current) return;
      armed.current = true;
      draftA.jump(startFrac.current);
      draftB.jump(fracAt(point.x));
      setCutting(true);
    },
    onMove: ({ point }) => {
      if (!armed.current) return;
      draftB.set(r4(fracAt(point.x)));
      const x = draftA.get();
      const y = draftB.get();
      setLiveRange(
        rangeText(from + Math.min(x, y) * span, from + Math.max(x, y) * span),
      );
    },
    onEnd: () => {
      seeded.current = false;
      if (!armed.current) return;
      armed.current = false;
      setCutting(false);
      setLiveRange(null);
      cut(draftA.get(), draftB.get());
    },
    onCancel: () => {
      armed.current = false;
      clearPress();
      setCutting(false);
      setLiveRange(null);
    },
    onTap: (event) => {
      clearPress();
      armed.current = false;
      if (seeded.current) {
        // A long press let go without moving cuts its seed.
        seeded.current = false;
        setCutting(false);
        cut(draftA.get(), draftB.get());
        return;
      }
      setCursor(Math.min(bins - 1, Math.floor(fracAt(event.clientX) * bins)));
    },
  });

  const onRibbonPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    startFrac.current = fracAt(event.clientX);
    touchPress.current = event.pointerType === "touch";
    armed.current = event.pointerType !== "touch";
    seeded.current = false;
    clearPress();
    if (touchPress.current && !disabled && ready) {
      const at = startFrac.current;
      pressTimer.current = window.setTimeout(
        () => {
          // The hold is the intent: the seed of a window appears under the
          // finger and the next movement draws it out.
          armed.current = true;
          seeded.current = true;
          draftA.jump(at);
          draftB.jump(Math.min(1, at + bin));
          setCutting(true);
        },
        Math.max(150, longPressMs),
      );
    }
    cutDrag.onPointerDown(event);
  };

  const onRibbonPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    cutDrag.onPointerUp(event);
    seeded.current = false;
    clearPress();
  };

  const onRibbonKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || !ready) return;
    const perDay = Math.max(1, Math.round(24 / hours));
    let to = cursor;
    if (event.key === "ArrowRight") to = cursor + 1;
    else if (event.key === "ArrowLeft") to = cursor - 1;
    else if (event.key === "PageUp") to = cursor + perDay;
    else if (event.key === "PageDown") to = cursor - perDay;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = bins - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const a = cursor * bin;
      const id = cut(a, Math.min(1, a + perDay * bin));
      focusReq.current = id;
      return;
    } else return;
    event.preventDefault();
    setCursor(Math.max(0, Math.min(bins - 1, to)));
  };

  /* ------------------------------ list ---------------------------------- */

  const sorted = [...wins].sort((x, y) => x.start - y.start);
  const groups = sorted.length
    ? sorted.map((w) => ({
        id: w.id,
        heading: rangeText(w.start, w.end),
        rows: events.filter((e) => e.at >= w.start && e.at < w.end),
      }))
    : [
        {
          id: "all",
          heading: `All ${days} days`,
          rows: events.filter((e) => e.at >= from && e.at < now).reverse(),
        },
      ];
  const inWindows = sorted.reduce((n, w) => n + countIn(w.start, w.end), 0);
  const total = events.filter((e) => e.at >= from && e.at < now).length;

  const cursorAt = from + cursor * bin * span;
  const cursorCount = ribbon.counts[cursor] ?? 0;

  const labelEvery = days > 20 ? 7 : days > 10 ? 3 : 1;
  const dayMarks = Array.from({ length: Math.floor(days) + 1 }, (_, i) => i);

  const frost = clamp01(frostLevel);
  const listStep = cascade(8);

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--bw-accent" as string]: accent }}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-3 pb-2">
        <p
          id={titleId}
          className="min-w-0 flex-1 truncate text-sm font-semibold"
        >
          {title}
        </p>
        <p className="shrink-0 text-[11px] text-ink-3">
          {ready ? (
            sorted.length ? (
              <>
                <span className="font-mono text-[13px] text-(--bw-accent) tabular-nums">
                  {inWindows}
                </span>{" "}
                of {total} events
              </>
            ) : (
              <>
                {dayText(from)} – {dayText(now - 1)} ·{" "}
                <span className="font-mono tabular-nums">{total}</span> events
              </>
            )
          ) : status === "loading" ? (
            "Loading events"
          ) : (
            "Events unavailable"
          )}
        </p>
      </header>

      <div className="px-4">
        <div ref={ribbonRef} className="relative" style={{ height: PLOT_H }}>
          <div
            ref={sliderRef}
            role="slider"
            tabIndex={disabled ? -1 : 0}
            aria-label={`Event density, last ${days} days`}
            aria-describedby={hintId}
            aria-valuemin={0}
            aria-valuemax={bins - 1}
            aria-valuenow={cursor}
            aria-valuetext={`${dayText(cursorAt)}, ${timeText(cursorAt)}, ${cursorCount} ${cursorCount === 1 ? "event" : "events"}`}
            aria-disabled={disabled || !ready || undefined}
            onKeyDown={onRibbonKeyDown}
            onPointerDown={onRibbonPointerDown}
            onPointerMove={cutDrag.onPointerMove}
            onPointerUp={onRibbonPointerUp}
            onPointerCancel={(event) => {
              clearPress();
              cutDrag.onPointerCancel(event);
            }}
            onLostPointerCapture={cutDrag.onLostPointerCapture}
            className={cn(
              "group/brushed-windows absolute inset-0 touch-pan-y rounded-2 select-none",
              ready && !disabled ? "cursor-crosshair" : "cursor-default",
              FOCUS_RING,
            )}
          >
            <div
              aria-hidden
              className="absolute inset-0 overflow-hidden rounded-2 bg-surface-1"
            >
              {/* Weekends, faintly, so the week's rhythm reads. */}
              {dayMarks.slice(0, -1).map((d) => {
                const dow = new Date(from + d * DAY).getUTCDay();
                if (dow !== 0 && dow !== 6) return null;
                return (
                  <span
                    key={d}
                    className="absolute inset-y-0 bg-[color-mix(in_oklab,var(--ink-3)_4%,transparent)]"
                    style={{
                      left: `${r2((d / days) * 100)}%`,
                      width: `${r2((1 / days) * 100)}%`,
                    }}
                  />
                );
              })}
              {ready ? (
                <RibbonArt area={ribbon.area} line={ribbon.line} tone="muted" />
              ) : (
                <div className="absolute inset-x-0 bottom-0 flex h-full items-end gap-[3px] px-1">
                  {Array.from({ length: 30 }, (_, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-t-[2px] bg-surface-2 motion-safe:animate-pulse"
                      style={{ height: `${18 + ((i * 37) % 60)}%` }}
                    />
                  ))}
                </div>
              )}
              {ready
                ? ribbon.quiet.map((q) => (
                    <span
                      key={q.a}
                      className="absolute bottom-0 flex flex-col items-center"
                      style={{
                        left: `${r2(q.a * bin * 100)}%`,
                        width: `${r2((q.b - q.a) * bin * 100)}%`,
                      }}
                    >
                      <span className="mb-1.5 font-mono text-[9.5px] tracking-[0.08em] whitespace-nowrap text-ink-3 uppercase">
                        quiet
                      </span>
                      <span className="h-px w-full border-t border-dashed border-ink-3/70" />
                    </span>
                  ))
                : null}
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[4] w-px bg-ink-2 opacity-0 transition-opacity group-focus-visible/brushed-windows:opacity-100"
              style={{ left: `${r2((cursor + 0.5) * bin * 100)}%` }}
            />
          </div>

          <AnimatePresence initial={false}>
            {ready
              ? sorted.map((w, i) => (
                  <Pane
                    key={w.id}
                    win={w}
                    born={births[w.id]}
                    narrow={((w.end - w.start) / span) * ribbonWidth < 30}
                    index={i}
                    count={countIn(w.start, w.end)}
                    from={from}
                    span={span}
                    bin={bin}
                    frost={frost}
                    area={ribbon.area}
                    line={ribbon.line}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    ribbonRef={ribbonRef}
                    bindNode={bindNode}
                    onCommit={onPaneCommit}
                    onRemove={removeWindow}
                    onEscape={() => sliderRef.current?.focus()}
                    onLive={setLiveRange}
                  />
                ))
              : null}
          </AnimatePresence>

          {cutting ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[3] overflow-hidden rounded-2 border-x border-(--bw-accent)"
              style={{
                left: draftLeft,
                width: draftWidth,
                backgroundColor: `color-mix(in oklab, var(--bw-accent) ${Math.round(10 + frost * 12)}%, transparent)`,
                backdropFilter: `blur(${r2(frost * 5)}px)`,
                WebkitBackdropFilter: `blur(${r2(frost * 5)}px)`,
              }}
            />
          ) : null}
        </div>

        <div
          aria-hidden
          className="relative mt-1 h-4 font-mono text-[10px] text-ink-3 tabular-nums"
        >
          {dayMarks.map((d) =>
            d % labelEvery === 0 && d < days ? (
              <span
                key={d}
                // Labels near the right end hang left of their tick, so the
                // last one never runs past the ribbon.
                className={cn(
                  "absolute top-0 whitespace-nowrap",
                  d / days > 0.85 && "-translate-x-full",
                )}
                style={{ left: `${r2((d / days) * 100)}%` }}
              >
                {dayText(from + d * DAY)}
              </span>
            ) : null,
          )}
        </div>
        <p
          className="h-4 truncate font-mono text-[10px] text-ink-3"
          aria-hidden
        >
          {liveRange ? (
            <span className="text-(--bw-accent)">{liveRange}</span>
          ) : (
            "Drag across the ribbon to cut a window"
          )}
        </p>
      </div>

      <p id={hintId} className="sr-only">
        Left and Right move the cursor a bin, Page Up and Page Down a day. Enter
        cuts a one-day window at the cursor. On a window, the arrows move it,
        Shift with an arrow resizes its end, Alt and Shift its start, and Delete
        removes it.
      </p>

      <ul
        role="list"
        aria-label="Windows"
        className="relative flex flex-wrap items-center gap-1.5 border-b border-hairline px-4 pt-1 pb-2.5"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {sorted.map((w) => (
            <motion.li
              key={w.id}
              layout={motionSafe ? "position" : false}
              initial={{ opacity: 0, scale: motionSafe ? 0.9 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitTransition }}
              transition={{
                layout: motionSafe ? springs.glide : { duration: 0 },
                scale: motionSafe ? springs.snap : { duration: 0 },
                opacity: { duration: durations.fast },
              }}
              className="flex"
            >
              <span className="inline-flex h-7 items-center overflow-hidden rounded-full border border-[color-mix(in_oklab,var(--bw-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--bw-accent)_10%,transparent)] text-[11.5px]">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => paneNodes.current.get(w.id)?.focus()}
                  className={cn(
                    "h-full pr-1.5 pl-2.5 text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <span className="font-mono tabular-nums">
                    {dayText(w.start)} {timeText(w.start)}–
                    {dayText(w.end) === dayText(w.start)
                      ? ""
                      : `${dayText(w.end)} `}
                    {timeText(w.end)}
                  </span>
                  <span className="ml-1.5 text-ink-3">
                    {countIn(w.start, w.end)}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove window ${rangeText(w.start, w.end)}`}
                  onClick={() => removeWindow(w.id)}
                  className={cn(
                    "flex h-full items-center pr-2 pl-1 text-ink-3 transition-colors hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {sorted.length === 0 ? (
          <li className="py-1 text-[11.5px] text-ink-3">
            No windows: the list shows the whole month.
          </li>
        ) : null}
      </ul>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {status === "loading" ? (
          <ul
            aria-busy="true"
            aria-label="Loading events"
            className="px-4 py-2"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} aria-hidden className="flex items-center gap-3 py-2">
                <span className="h-2 w-10 rounded-full bg-surface-2" />
                <span
                  className="h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ width: `${30 + ((i * 23) % 40)}%` }}
                />
              </li>
            ))}
          </ul>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">The events did not load.</p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <div className="relative">
            <AnimatePresence initial={false} mode="popLayout">
              {groups.map((g) => {
                const open = expanded[g.id] ?? false;
                const rows = open ? g.rows : g.rows.slice(0, rowsPerWindow);
                const headingId = `${uid}-h-${g.id}`;
                return (
                  <motion.section
                    key={g.id}
                    aria-labelledby={headingId}
                    layout={motionSafe ? "position" : false}
                    initial={{
                      opacity: 0,
                      y: motionSafe ? distances.nudge : 0,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitTransition }}
                    transition={{
                      layout: motionSafe ? springs.glide : { duration: 0 },
                      y: motionSafe ? springs.glide : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                    className="border-b border-hairline bg-card"
                  >
                    <h3
                      id={headingId}
                      className="sticky top-0 z-[1] flex items-baseline gap-2 bg-card px-4 pt-2.5 pb-1.5"
                    >
                      <span className="truncate font-mono text-[11px] text-foreground tabular-nums">
                        {g.heading}
                      </span>
                      <span className="shrink-0 text-[11px] text-ink-3">
                        {g.rows.length}{" "}
                        {g.rows.length === 1 ? "event" : "events"}
                      </span>
                    </h3>
                    <ul role="list" className="px-4 pb-2">
                      <AnimatePresence initial={false}>
                        {rows.map((e, i) => (
                          <motion.li
                            key={e.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{
                              opacity: 0,
                              height: 0,
                              transition: exitTransition,
                            }}
                            transition={{
                              height: motionSafe
                                ? springs.glide
                                : { duration: 0 },
                              opacity: {
                                duration: durations.base,
                                delay: motionSafe
                                  ? Math.min(i, 8) * listStep
                                  : 0,
                              },
                            }}
                            className="overflow-hidden"
                          >
                            <span className="flex items-center gap-3 py-1.5 text-[12.5px]">
                              <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                                {g.id === "all"
                                  ? dayText(e.at)
                                  : timeText(e.at)}
                              </span>
                              <span
                                aria-hidden
                                className={cn(
                                  "size-1.5 shrink-0 rounded-full",
                                  LEVEL_DOT[e.level],
                                )}
                              />
                              <span className="flex min-w-0 flex-1 flex-col @min-[30rem]:flex-row @min-[30rem]:items-baseline @min-[30rem]:gap-2">
                                <span className="truncate text-foreground">
                                  {e.title}
                                  <span className="sr-only">, {e.level}</span>
                                </span>
                                <span className="truncate text-[11px] text-ink-3">
                                  {e.source}
                                </span>
                              </span>
                              {g.id !== "all" ? (
                                <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 @min-[30rem]:inline">
                                  {dayText(e.at)}
                                </span>
                              ) : null}
                            </span>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                      {g.rows.length > rowsPerWindow ? (
                        <li>
                          <button
                            type="button"
                            onClick={() =>
                              setExpanded((x) => ({ ...x, [g.id]: !open }))
                            }
                            aria-expanded={open}
                            className={cn(
                              "mt-0.5 inline-flex h-7 items-center rounded-2 px-1.5 text-[11.5px] text-(--bw-accent) transition-colors hover:bg-surface-2",
                              FOCUS_RING,
                            )}
                          >
                            {open ? "Show fewer" : `Show all ${g.rows.length}`}
                          </button>
                        </li>
                      ) : null}
                    </ul>
                  </motion.section>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
