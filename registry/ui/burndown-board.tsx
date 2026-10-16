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
import {
  Check,
  GripVertical,
  Plus,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type BurndownSprint = {
  name: string;
  /** One line about what the sprint is for. */
  goal?: string;
  /** The first working day, as an ISO date ("2026-10-12"). */
  start: string;
  /** Working days in the sprint; weekends are skipped. */
  days: number;
};

export type BurndownColumn = {
  id: string;
  title: string;
  /** Cards that reach this column are finished: their points come off the line. */
  done?: boolean;
};

export type BurndownCard = {
  /** Also the key printed on the card, e.g. "BSN-305". */
  id: string;
  title: string;
  /** The id of the column it sits in. Array order is column order. */
  column: string;
  points: number;
  /** Initials of whoever has it. */
  assignee?: string;
  /** The working day (0-based) it joined mid-sprint; planned cards leave it out. */
  addedOn?: number;
  /** The working day (0-based) it was finished; set by the board when it reaches Done. */
  doneOn?: number;
};

export type BurndownMove = {
  cardId: string;
  from: string;
  to: string;
  /** Position in the target column, counted without the moved card. */
  index: number;
};

export type BurndownStats = {
  /** Planned plus added points. */
  scope: number;
  planned: number;
  added: number;
  remaining: number;
  done: number;
  /** Where the ideal line says the sprint should be at the end of today. */
  ideal: number;
  /** Today, as a 0-based working day. */
  day: number;
  days: number;
  /** Points left at the end of each day so far. */
  history: number[];
};

export type BurndownCardStyle = "raised" | "flat" | "outline";
export type BurndownPalette = "cobalt" | "moss" | "ember" | "mono";
export type BurndownBoardStatus = "ready" | "loading" | "error";

export type BurndownBoardProps = {
  /** The sprint the chart spans. @default defaultBurndownSprint (Basinworks Sprint 14) */
  sprint?: BurndownSprint;
  /** The board's columns, left to right; a `done` column finishes work. @default defaultBurndownColumns */
  columns?: BurndownColumn[];
  /** Controlled cards, in column order. */
  cards?: BurndownCard[];
  /** Initial cards when uncontrolled. @default defaultBurndownCards */
  defaultCards?: BurndownCard[];
  /** Fires with the whole board after a move. */
  onCardsChange?: (cards: BurndownCard[]) => void;
  /** Fires from the drop, pointer or keyboard, that moved a card. */
  onMove?: (move: BurndownMove) => void;
  /** Fires from a move that changed the burndown, with the sprint's new figures. */
  onSprintChange?: (stats: BurndownStats) => void;
  /** Shows an Add button on the first column; the host appends the card (with `addedOn` = today to mark it as added scope). */
  onAddCard?: (columnId: string) => void;
  /** Today, as an ISO date. Never the wall clock. @default "2026-10-16" */
  now?: string;
  /** The chart's height at tablet width and up, in px. Under 40rem it becomes a header strip. @default 136 */
  chartHeight?: number;
  /** Card surface: raised with a shadow, a flat tint, or an outline on the board colour. @default "raised" */
  cardStyle?: BurndownCardStyle;
  /** The burndown line, its wash, the dot and the points tokens. @default "cobalt" */
  palette?: BurndownPalette;
  /** The unit after the figures. @default "pts" */
  unit?: string;
  /** Whether the board has loaded. @default "ready" */
  status?: BurndownBoardStatus;
  /** Try again was pressed after the board failed to load. */
  onReload?: () => void;
  /** Read-only: nothing moves. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultBurndownSprint: BurndownSprint = {
  name: "Sprint 14",
  goal: "Tide tables",
  start: "2026-10-12",
  days: 10,
};

export const defaultBurndownColumns: BurndownColumn[] = [
  { id: "todo", title: "To do" },
  { id: "doing", title: "In progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done", done: true },
];

export const defaultBurndownCards: BurndownCard[] = [
  {
    id: "BSN-307",
    title: "Units preference",
    column: "todo",
    points: 2,
    assignee: "MO",
  },
  {
    id: "BSN-308",
    title: "Crew notes search",
    column: "todo",
    points: 5,
    assignee: "TE",
  },
  {
    id: "BSN-309",
    title: "Fix midnight rollover",
    column: "todo",
    points: 3,
    assignee: "IV",
    addedOn: 2,
  },
  {
    id: "BSN-304",
    title: "Station map clustering",
    column: "doing",
    points: 8,
    assignee: "KA",
  },
  {
    id: "BSN-306",
    title: "Storm surge overlay",
    column: "doing",
    points: 5,
    assignee: "MO",
  },
  {
    id: "BSN-305",
    title: "Export tide CSV",
    column: "review",
    points: 3,
    assignee: "TE",
  },
  {
    id: "BSN-310",
    title: "Accessibility pass",
    column: "review",
    points: 3,
    assignee: "RA",
  },
  {
    id: "BSN-301",
    title: "Tide table API",
    column: "done",
    points: 5,
    assignee: "KA",
    doneOn: 1,
  },
  {
    id: "BSN-302",
    title: "Harbour alerts copy",
    column: "done",
    points: 2,
    assignee: "RA",
    doneOn: 2,
  },
  {
    id: "BSN-303",
    title: "Gauge offline banner",
    column: "done",
    points: 3,
    assignee: "IV",
    doneOn: 3,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CARD_STYLE: Record<BurndownCardStyle, string> = {
  raised:
    "border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_7%,transparent)] hover:shadow-[0_4px_14px_color-mix(in_oklab,black_10%,transparent)]",
  flat: "border border-transparent bg-surface-2 hover:border-hairline",
  outline:
    "border border-hairline-strong bg-surface-0 hover:border-[color-mix(in_oklab,var(--bd-line)_45%,var(--hairline-strong))]",
};

const PALETTES: Record<BurndownPalette, { line: string; scope: string }> = {
  cobalt: { line: "var(--accent-bright)", scope: "var(--warn)" },
  moss: { line: "var(--success)", scope: "var(--warn)" },
  ember: {
    line: "oklch(from var(--danger) l c 45)",
    scope: "var(--accent-bright)",
  },
  mono: { line: "var(--ink)", scope: "var(--warn)" },
};

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
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

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map((v) => Number(v));
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

/** The sprint's working days, by hand in UTC, so server and browser agree. */
function workingDays(start: string, count: number) {
  const out: { t: number; day: number; weekday: string; month: string }[] = [];
  let t = parseDay(start);
  while (out.length < Math.max(1, count)) {
    const date = new Date(t);
    const wd = date.getUTCDay();
    if (wd !== 0 && wd !== 6) {
      out.push({
        t,
        day: date.getUTCDate(),
        weekday: WEEKDAY[wd] ?? "",
        month: MONTH[date.getUTCMonth()] ?? "",
      });
    }
    t += 86_400_000;
  }
  return out;
}

/** Today as a 0-based working day: a weekend counts as the Friday before it. */
function dayIndex(days: { t: number }[], now: string) {
  const n = parseDay(now);
  let at = 0;
  days.forEach((d, i) => {
    if (d.t <= n) at = i;
  });
  return at;
}

type Series = {
  planned: number;
  /** Scope added at the start of each day. */
  adds: number[];
  /** Points left at the end of each day, through today. */
  ends: number[];
};

function seriesOf(
  list: BurndownCard[],
  done: Set<string>,
  days: number,
  today: number,
): Series {
  const adds = Array.from({ length: days }, () => 0);
  const doneBy = Array.from({ length: days }, () => 0);
  let planned = 0;
  for (const c of list) {
    const pts = Math.max(0, c.points);
    if (c.addedOn === undefined || c.addedOn <= 0)
      planned += c.addedOn === 0 ? 0 : pts;
    if (c.addedOn !== undefined && c.addedOn >= 0 && c.addedOn < days)
      adds[c.addedOn] = (adds[c.addedOn] ?? 0) + pts;
    if (done.has(c.column)) {
      const d = Math.min(days - 1, Math.max(0, c.doneOn ?? today));
      doneBy[d] = (doneBy[d] ?? 0) + pts;
    }
  }
  const ends: number[] = [];
  let left = planned;
  for (let d = 0; d <= today; d += 1) {
    left += (adds[d] ?? 0) - (doneBy[d] ?? 0);
    ends.push(Math.max(0, left));
  }
  return { planned, adds, ends };
}

function statsOf(s: Series, days: number, today: number): BurndownStats {
  const added = s.adds.slice(0, today + 1).reduce((a, b) => a + b, 0);
  const remaining = s.ends[s.ends.length - 1] ?? s.planned;
  return {
    scope: s.planned + added,
    planned: s.planned,
    added,
    remaining,
    done: s.planned + added - remaining,
    ideal:
      Math.round(s.planned * Math.max(0, 1 - (today + 1) / days) * 10) / 10,
    day: today,
    days,
    history: s.ends.slice(),
  };
}

/** A round top for the y axis: the scope, lifted to the next 5 or 10. */
const niceMax = (v: number) => {
  const step = v > 40 ? 10 : 5;
  return Math.max(step, Math.ceil(v / step) * step);
};

/* ----------------------------------------------------------------------- */
/*                                 The chart                                */
/* ----------------------------------------------------------------------- */

type Geometry = {
  w: number;
  h: number;
  padL: number;
  padR: number;
  padT: number;
  padB: number;
  days: number;
  yMax: number;
};

const xAt = (g: Geometry, tick: number) =>
  g.padL + (tick * (g.w - g.padL - g.padR)) / Math.max(1, g.days);
const yAt = (g: Geometry, v: number) =>
  g.padT + (1 - v / g.yMax) * (g.h - g.padT - g.padB);

/** The actual line's corners: a rise at each day's added scope, then the day's close. */
function corners(g: Geometry, planned: number, adds: number[], ends: number[]) {
  const pts: [number, number][] = [[xAt(g, 0), yAt(g, planned)]];
  let prev = planned;
  ends.forEach((end, d) => {
    pts.push([xAt(g, d), yAt(g, prev + (adds[d] ?? 0))]);
    pts.push([xAt(g, d + 1), yAt(g, end)]);
    prev = end;
  });
  return pts;
}

const lineOf = (pts: [number, number][]) =>
  pts.map(([x, y], i) => `${i ? "L" : "M"} ${r2(x)} ${r2(y)}`).join(" ");

function BurnChart({
  series,
  days,
  today,
  labels,
  height,
  strip,
  unit,
  pulse,
  motionSafe,
  dotRef,
}: {
  series: Series;
  days: number;
  today: number;
  labels: { day: number; weekday: string }[];
  height: number;
  strip: boolean;
  unit: string;
  pulse: number;
  motionSafe: boolean;
  dotRef: (node: SVGCircleElement | null) => void;
}) {
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState(strip ? 220 : 640);
  React.useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(box.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const scopeTop = series.planned + series.adds.reduce((a, b) => a + b, 0);
  const g: Geometry = {
    w: width,
    h: height,
    padL: strip ? 2 : 28,
    padR: strip ? 6 : 12,
    padT: strip ? 5 : 12,
    padB: strip ? 5 : 22,
    days,
    yMax: niceMax(scopeTop),
  };
  const pts = corners(g, series.planned, series.adds, series.ends);
  const last = pts[pts.length - 1] ?? [xAt(g, 0), yAt(g, series.planned)];
  const base = yAt(g, 0);
  const line = lineOf(pts);
  const area = `${line} L ${r2(last[0])} ${r2(base)} L ${r2(xAt(g, 0))} ${r2(base)} Z`;

  const lineEl = React.useRef<SVGPathElement | null>(null);
  const areaEl = React.useRef<SVGPathElement | null>(null);
  const dotEl = React.useRef<SVGCircleElement | null>(null);
  const flagEls = React.useRef(new Map<number, SVGGElement>());
  const shown = React.useRef<{
    ends: number[];
    adds: number[];
    planned: number;
    w: number;
  } | null>(null);
  const setDot = React.useCallback(
    (node: SVGCircleElement | null) => {
      dotEl.current = node;
      dotRef(node);
    },
    [dotRef],
  );

  // The line steps between its old and new shape on glide. React writes the
  // target; this effect rewinds to the old shape before the first paint and
  // walks it across, one progress value driving every corner.
  const key = `${series.planned}|${series.adds.join(",")}|${series.ends.join(",")}|${width}|${height}`;
  React.useLayoutEffect(() => {
    const prev = shown.current;
    const next = {
      ends: series.ends,
      adds: series.adds,
      planned: series.planned,
      w: width,
    };
    shown.current = next;
    const sameShape =
      prev &&
      prev.w === width &&
      prev.ends.length === next.ends.length &&
      prev.adds.length === next.adds.length;
    if (!prev || !sameShape) return;
    const write = (p: number) => {
      const ends = next.ends.map((v, i) => lerp(prev.ends[i] ?? v, v, p));
      const adds = next.adds.map((v, i) => lerp(prev.adds[i] ?? v, v, p));
      const planned = lerp(prev.planned, next.planned, p);
      const c = corners(g, planned, adds, ends);
      const l = lineOf(c);
      const end = c[c.length - 1] ?? [0, 0];
      lineEl.current?.setAttribute("d", l);
      areaEl.current?.setAttribute(
        "d",
        `${l} L ${r2(end[0])} ${r2(base)} L ${r2(xAt(g, 0))} ${r2(base)} Z`,
      );
      dotEl.current?.setAttribute("cx", String(r2(end[0])));
      dotEl.current?.setAttribute("cy", String(r2(end[1])));
      let carried = planned;
      ends.forEach((v, d) => {
        const add = adds[d] ?? 0;
        const flag = flagEls.current.get(d);
        if (flag && add > 0) {
          flag.setAttribute(
            "transform",
            `translate(${r2(xAt(g, d))} ${r2(yAt(g, carried + add))})`,
          );
        }
        carried = v;
      });
    };
    write(0);
    const run = animate(0, 1, {
      ...(motionSafe
        ? springs.glide
        : { duration: durations.fast, ease: easings.enter }),
      onUpdate: write,
    });
    return () => {
      run.stop();
      write(1);
    };
    // Keyed by the shape itself; `g` and `base` are rebuilt from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, motionSafe]);

  // The dot takes the token's hit: it lands big and settles in two bounces.
  // Under reduced motion the line's own short tween is the whole answer.
  React.useEffect(() => {
    const el = dotEl.current;
    if (!pulse || !el || !motionSafe) return;
    const run = animate(el, { scale: [1.9, 1] }, springs.recoil);
    return () => run.stop();
  }, [pulse, motionSafe]);

  const ticks = strip ? [] : [0, g.yMax / 2, g.yMax];
  const idealEnd: [number, number] = [xAt(g, days), yAt(g, 0)];

  let carriedScope = series.planned;
  const flags: { d: number; add: number; x: number; y: number }[] = [];
  series.ends.forEach((v, d) => {
    const add = series.adds[d] ?? 0;
    if (add > 0)
      flags.push({ d, add, x: xAt(g, d), y: yAt(g, carriedScope + add) });
    carriedScope = v;
  });

  return (
    <div ref={setBox} className="relative w-full" style={{ height }}>
      <svg
        aria-hidden
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="absolute inset-0 block size-full overflow-visible"
      >
        {!strip ? (
          <rect
            x={r2(xAt(g, today))}
            y={g.padT - 4}
            width={r2(xAt(g, today + 1) - xAt(g, today))}
            height={r2(g.h - g.padT - g.padB + 4)}
            rx={4}
            className="fill-[color-mix(in_oklab,var(--bd-line)_7%,transparent)]"
          />
        ) : null}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={g.padL}
              x2={r2(g.w - g.padR)}
              y1={r2(yAt(g, v))}
              y2={r2(yAt(g, v))}
              className="stroke-hairline"
              strokeWidth={1}
            />
            <text
              x={g.padL - 6}
              y={r2(yAt(g, v) + 3)}
              textAnchor="end"
              className="fill-ink-3 font-mono text-[9px] tabular-nums"
            >
              {Math.round(v)}
            </text>
          </g>
        ))}
        <line
          x1={r2(xAt(g, 0))}
          y1={r2(yAt(g, series.planned))}
          x2={r2(idealEnd[0])}
          y2={r2(idealEnd[1])}
          className="stroke-ink-3"
          strokeOpacity={0.55}
          strokeWidth={1.25}
          strokeDasharray="3 4"
          strokeLinecap="round"
        />
        <path
          ref={areaEl}
          d={area}
          className="fill-[color-mix(in_oklab,var(--bd-line)_12%,transparent)]"
        />
        <path
          ref={lineEl}
          d={line}
          fill="none"
          className="stroke-(--bd-line)"
          strokeWidth={strip ? 1.75 : 2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {flags.map((f) => (
          <g
            key={f.d}
            ref={(node) => {
              if (node) flagEls.current.set(f.d, node);
              else flagEls.current.delete(f.d);
            }}
            transform={`translate(${r2(f.x)} ${r2(f.y)})`}
            className="text-(--bd-scope)"
          >
            <path
              d="M 0 0 V -11 L 7 -8 L 0 -5"
              className="fill-current"
              strokeWidth={0}
            />
            <path d="M 0 0 V -11" stroke="currentColor" strokeWidth={1.25} />
            {!strip ? (
              <text
                x={9}
                y={-4}
                className="fill-current font-mono text-[9px] font-semibold"
              >
                +{f.add}
              </text>
            ) : null}
          </g>
        ))}
        <circle
          ref={setDot}
          cx={r2(last[0])}
          cy={r2(last[1])}
          r={strip ? 3.25 : 4.5}
          className="[transform-origin:center] fill-(--bd-line) stroke-card [transform-box:fill-box]"
          strokeWidth={2}
        />
        {!strip
          ? labels.map((l, i) => (
              <text
                key={i}
                x={r2(xAt(g, i + 0.5))}
                y={r2(g.h - 6)}
                textAnchor="middle"
                className={cn(
                  "font-mono text-[9px] tabular-nums",
                  i === today ? "fill-(--bd-line) font-semibold" : "fill-ink-3",
                )}
              >
                {width > 520 ? `${l.weekday.slice(0, 1)} ${l.day}` : l.day}
              </text>
            ))
          : null}
      </svg>
      <span className="sr-only">{unit}</span>
    </div>
  );
}

/** Digits that roll in their own slots toward the way the number moved. */
function RollingNumber({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  const chars = String(value).split("");
  return (
    <span aria-hidden className="inline-flex tabular-nums">
      {chars.map((ch, i) => {
        const slot = chars.length - i;
        return (
          <span
            key={`s${slot}`}
            className="relative inline-flex justify-center overflow-clip"
            style={{ width: "1ch", height: "1.15em", lineHeight: "1.15em" }}
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.span
                key={ch}
                custom={dir}
                className="inline-block"
                variants={{
                  enter: (d: number) => ({
                    opacity: 0,
                    y: motionSafe ? `${d * 80}%` : 0,
                  }),
                  shown: { opacity: 1, y: "0%" },
                  leave: (d: number) => ({
                    opacity: 0,
                    y: motionSafe ? `${-d * 80}%` : 0,
                    transition: exitFor(durations.fast),
                  }),
                }}
                initial="enter"
                animate="shown"
                exit="leave"
                transition={
                  motionSafe
                    ? {
                        y: { ...springs.snap, delay: i * 0.03 },
                        opacity: { duration: durations.fast, delay: i * 0.03 },
                      }
                    : { duration: durations.fast }
                }
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                              The points token                            */
/* ----------------------------------------------------------------------- */

type Token = {
  n: number;
  label: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
};

/**
 * A card's points, lifted off it and dropped into the chart: one spring
 * drives the flight along a bowed path, so the token rises, arcs over and
 * falls onto today's point. It lets the line step as it lands.
 */
function PointsToken({
  token,
  motionSafe,
  onLand,
}: {
  token: Token;
  motionSafe: boolean;
  onLand: (n: number) => void;
}) {
  const p = useMotionValue(0);
  const { from, to } = token;
  const lift = Math.max(36, Math.abs(to.x - from.x) * 0.18 + 28);
  const cx = (from.x + to.x) / 2;
  const cy = Math.min(from.y, to.y) - lift;
  const at = (t: number, a: number, c: number, b: number) =>
    (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
  const x = useTransform(p, (t) => r2(at(t, from.x, cx, to.x)));
  const y = useTransform(p, (t) => r2(at(t, from.y, cy, to.y)));
  const scale = useTransform(p, (t) => r2(1 - 0.35 * clamp01((t - 0.6) / 0.4)));
  const opacity = useTransform(p, (t) => r2(t > 0.9 ? (1 - t) / 0.1 : 1));

  React.useEffect(() => {
    if (!motionSafe) {
      onLand(token.n);
      return;
    }
    let landed = false;
    const run = animate(p, 1, {
      ...springs.drift,
      // The long tail of a critically damped spring is invisible: the line
      // steps the moment the token is all but there.
      onUpdate: (v) => {
        if (!landed && v > 0.93) {
          landed = true;
          onLand(token.n);
        }
      },
      onComplete: () => {
        if (!landed) onLand(token.n);
      },
    });
    return () => run.stop();
  }, [p, token.n, motionSafe, onLand]);

  return (
    <motion.span
      className="absolute top-0 left-0 inline-flex h-6 -translate-x-1/2 -translate-y-1/2 items-center rounded-full bg-(--bd-fill) px-2 font-mono text-[11px] font-semibold text-white tabular-nums shadow-[0_6px_14px_color-mix(in_oklab,black_22%,transparent)]"
      style={{ x, y, scale, opacity }}
    >
      {token.label}
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The card                                */
/* ----------------------------------------------------------------------- */

type CardMotion = { x: MotionValue<number>; y: MotionValue<number> };

type SprintCardProps = {
  card: BurndownCard;
  columnTitle: string;
  done: boolean;
  unit: string;
  active: boolean;
  lifted: boolean;
  raised: boolean;
  pillHidden: boolean;
  cardStyle: BurndownCardStyle;
  motionSafe: boolean;
  hintId: string;
  locked: boolean;
  onNode: (id: string, node: HTMLDivElement | null, mv: CardMotion) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocusCard: (id: string) => void;
};

function SprintCard({
  card,
  columnTitle,
  done,
  unit,
  active,
  lifted,
  raised,
  pillHidden,
  cardStyle,
  motionSafe,
  hintId,
  locked,
  onNode,
  onKeyDown,
  onFocusCard,
}: SprintCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const setNode = React.useCallback(
    (node: HTMLDivElement | null) => onNode(card.id, node, { x, y }),
    [card.id, onNode, x, y],
  );
  const label = `${card.id}, ${card.title}, ${card.points} ${unit}. ${columnTitle}${
    done ? ", done" : ""
  }.${card.addedOn !== undefined && card.addedOn > 0 ? ` Added on day ${card.addedOn + 1}.` : ""}${
    lifted ? " Lifted." : ""
  }`;

  return (
    <motion.div
      ref={setNode}
      data-bd-card={card.id}
      role="group"
      aria-roledescription="card"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={active ? 0 : -1}
      onKeyDown={(event) => onKeyDown(event, card.id)}
      onFocus={() => onFocusCard(card.id)}
      style={{ x, y, zIndex: raised ? 30 : lifted ? 20 : undefined }}
      initial={false}
      animate={{ scale: raised && motionSafe ? 1.025 : 1 }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
      className={cn(
        "group/bd-card relative rounded-3 px-2.5 pt-2 pb-2.5 text-left transition-[box-shadow,border-color,background-color] duration-200 select-none",
        "touch-pan-x touch-pan-y",
        locked ? "cursor-default" : raised ? "cursor-grabbing" : "cursor-grab",
        CARD_STYLE[cardStyle] ?? CARD_STYLE.raised,
        (raised || lifted) &&
          "shadow-[0_14px_32px_color-mix(in_oklab,black_22%,transparent)] hover:shadow-[0_14px_32px_color-mix(in_oklab,black_22%,transparent)]",
        lifted && "ring-2 ring-(--bd-line)",
        FOCUS_RING,
      )}
    >
      <div className="flex h-5 items-center gap-1">
        <span
          aria-hidden
          data-bd-grip=""
          className={cn(
            "-ml-1 flex h-5 w-4 shrink-0 touch-none items-center justify-center text-ink-3 opacity-60 transition-opacity group-hover/bd-card:opacity-100",
            locked && "hidden",
          )}
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="shrink-0 font-mono text-[11px] leading-none whitespace-nowrap text-ink-3 tabular-nums">
          {card.id}
        </span>
        {card.addedOn !== undefined && card.addedOn > 0 ? (
          <span className="shrink-0 rounded-1 bg-[color-mix(in_oklab,var(--bd-scope)_14%,transparent)] px-1 font-mono text-[10px] leading-4 whitespace-nowrap text-(--bd-scope-ink)">
            +day {card.addedOn + 1}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {card.assignee ? (
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold tracking-[0.02em] text-ink-2 ring-1 ring-hairline"
            >
              {card.assignee}
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 flex items-end gap-2">
        <p
          className={cn(
            "min-w-0 flex-1 text-[13px] leading-[1.35] font-medium",
            done ? "text-ink-2" : "text-foreground",
          )}
        >
          {card.title}
        </p>
        <span
          aria-hidden
          data-bd-points=""
          className={cn(
            "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 font-mono text-[11px] font-semibold tabular-nums transition-opacity duration-150",
            done
              ? "bg-[color-mix(in_oklab,var(--bd-line)_14%,transparent)] text-(--bd-ink)"
              : "bg-surface-2 text-ink-2 ring-1 ring-hairline",
            pillHidden && "opacity-0",
          )}
        >
          {done ? <Check className="size-3" strokeWidth={2.75} /> : null}
          {card.points}
        </span>
      </div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The board                                */
/* ----------------------------------------------------------------------- */

type Place = { column: string; index: number };
type Over = Place & { y: number };

function moveCard(
  list: BurndownCard[],
  id: string,
  column: string,
  index: number,
  patch: Partial<BurndownCard> | null,
): BurndownCard[] {
  const card = list.find((c) => c.id === id);
  if (!card) return list;
  const rest = list.filter((c) => c.id !== id);
  let seen = 0;
  let at = -1;
  let last = -1;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i]?.column !== column) continue;
    if (seen === index && at === -1) at = i;
    seen += 1;
    last = i;
  }
  if (at === -1) at = last === -1 ? rest.length : last + 1;
  const moved: BurndownCard = { ...card, ...patch, column };
  if (patch && "doneOn" in patch && patch.doneOn === undefined)
    delete moved.doneOn;
  return [...rest.slice(0, at), moved, ...rest.slice(at)];
}

function placeOf(list: BurndownCard[], id: string): Place | null {
  const card = list.find((c) => c.id === id);
  if (!card) return null;
  const index = list
    .filter((c) => c.column === card.column)
    .findIndex((c) => c.id === id);
  return { column: card.column, index };
}

function layoutPos(node: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = node;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

const stampNow = () => performance.now();
const placeNode = (node: HTMLElement, transform: string) => {
  node.style.transform = transform;
};

/**
 * A sprint board under its own burndown. The chart draws the planned scope's
 * ideal line as a faint dashed guide and the actual line through the end of
 * each day, with a marked step wherever scope was added mid-sprint. Moving a
 * card into Done lifts its points off the card as a token that arcs up into
 * today's point; as it lands the line steps down on `springs.glide`, the dot
 * takes the hit on `springs.recoil` and the points-left figure rolls on
 * `springs.snap`. Every card that moves FLIPs to its place on glide.
 *
 * Cards move by drag (1:1, capture after 4px, an insertion bar and a column
 * wash) or by keys: one roving tab stop, arrows to move, Space to lift,
 * arrows to carry, Space to drop and Escape to put back. Under 40rem the
 * chart shrinks into a header strip and the columns stack.
 */
export function BurndownBoard({
  sprint = defaultBurndownSprint,
  columns = defaultBurndownColumns,
  cards: cardsProp,
  defaultCards = defaultBurndownCards,
  onCardsChange,
  onMove,
  onSprintChange,
  onAddCard,
  now = "2026-10-16",
  chartHeight = 136,
  cardStyle = "raised",
  palette = "cobalt",
  unit = "pts",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: BurndownBoardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const locked = disabled || !ready;
  const pal = PALETTES[palette] ?? PALETTES.cobalt;

  const [own, setOwn] = React.useState<BurndownCard[]>(defaultCards);
  const cards = cardsProp ?? own;
  const doneCols = new Set(columns.filter((c) => c.done).map((c) => c.id));
  const colIds = new Set(columns.map((c) => c.id));
  const colTitle = (id: string) =>
    columns.find((c) => c.id === id)?.title ?? id;
  const days = Math.max(1, Math.round(sprint.days));
  const calendar = workingDays(sprint.start, days);
  const today = dayIndex(calendar, now);

  const [lift, setLift] = React.useState<{
    id: string;
    from: Place;
    cards: BurndownCard[];
  } | null>(null);
  const shown = lift ? lift.cards : cards;
  const visible = shown.filter((c) => colIds.has(c.column));
  const byId = new Map(visible.map((c) => [c.id, c]));
  const lanes = columns.map((col) =>
    visible.filter((c) => c.column === col.id),
  );

  // The chart follows the committed board, except while a token is flying:
  // then it holds the line where it was until the points land.
  const series = seriesOf(
    cards.filter((c) => colIds.has(c.column)),
    doneCols,
    days,
    today,
  );
  const [hold, setHold] = React.useState<{ n: number; series: Series } | null>(
    null,
  );
  const shownSeries = hold?.series ?? series;
  const stats = statsOf(series, days, today);
  const shownStats = statsOf(shownSeries, days, today);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const tabStop =
    activeId && byId.has(activeId) ? activeId : (visible[0]?.id ?? null);
  const [drag, setDrag] = React.useState<{
    id: string;
    over: Over | null;
  } | null>(null);
  const [raisedId, setRaisedId] = React.useState<string | null>(null);
  const [tokens, setTokens] = React.useState<(Token & { card: string })[]>([]);
  const [pulse, setPulse] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const cardMv = React.useRef(new Map<string, CardMotion>());
  const colNodes = React.useRef(new Map<string, HTMLElement>());
  const dots = React.useRef(new Map<string, SVGCircleElement>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls[]>());
  const timers = React.useRef(new Set<number>());
  const tokenSeq = React.useRef(0);

  const onNode = React.useCallback(
    (id: string, node: HTMLDivElement | null, mv: CardMotion) => {
      if (node) {
        cardNodes.current.set(id, node);
        cardMv.current.set(id, mv);
      } else if (cardMv.current.get(id) === mv) {
        cardNodes.current.delete(id);
        cardMv.current.delete(id);
      }
    },
    [],
  );
  const fullDot = React.useCallback((node: SVGCircleElement | null) => {
    if (node) dots.current.set("full", node);
    else dots.current.delete("full");
  }, []);
  const stripDot = React.useCallback((node: SVGCircleElement | null) => {
    if (node) dots.current.set("strip", node);
    else dots.current.delete("strip");
  }, []);

  React.useEffect(() => {
    const t = timers.current;
    const r = runs.current;
    return () => {
      for (const id of t) window.clearTimeout(id);
      t.clear();
      for (const list of r.values()) for (const c of list) c.stop();
      r.clear();
    };
  }, []);

  /** The token landed: the line may step now, and the dot takes the hit. */
  const landed = React.useCallback((n: number) => {
    setHold((h) => (h && h.n <= n ? null : h));
    setPulse((p) => p + 1);
    setTokens((list) => list.filter((t) => t.n !== n));
  }, []);

  /* ------------------------------ FLIP moves ------------------------------ */

  const flipFrom = React.useRef<{
    at: number;
    pos: Map<string, { x: number; y: number }>;
    velocity: { id: string; vx: number; vy: number } | null;
  } | null>(null);
  const pendingFocus = React.useRef<string | null>(null);

  const capture = (velocity: { id: string; vx: number; vy: number } | null) => {
    const content = contentRef.current;
    if (!content) return;
    const cb = content.getBoundingClientRect();
    const pos = new Map<string, { x: number; y: number }>();
    for (const [id, node] of cardNodes.current) {
      const r = node.getBoundingClientRect();
      pos.set(id, {
        x: r.left - cb.left + (r.width - node.offsetWidth) / 2,
        y: r.top - cb.top + (r.height - node.offsetHeight) / 2,
      });
    }
    flipFrom.current = { at: stampNow(), pos, velocity };
  };

  const stopRuns = (id: string) => {
    for (const c of runs.current.get(id) ?? []) c.stop();
    runs.current.delete(id);
  };

  React.useLayoutEffect(() => {
    const snap = flipFrom.current;
    const content = contentRef.current;
    flipFrom.current = null;
    const settled: string[] = [];
    if (snap && content && stampNow() - snap.at < 1500) {
      for (const [id, node] of cardNodes.current) {
        const old = snap.pos.get(id);
        const mv = cardMv.current.get(id);
        if (!old || !mv) continue;
        const at = layoutPos(node, content);
        const dx = r2(old.x - at.x);
        const dy = r2(old.y - at.y);
        stopRuns(id);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !motionSafe) {
          mv.x.jump(0);
          mv.y.jump(0);
          placeNode(node, "");
          if (snap.velocity?.id === id) settled.push(id);
          continue;
        }
        mv.x.jump(dx);
        mv.y.jump(dy);
        placeNode(node, `translateX(${dx}px) translateY(${dy}px)`);
        const v = snap.velocity?.id === id ? snap.velocity : null;
        runs.current.set(id, [
          animate(dx, 0, {
            ...springs.glide,
            velocity: v?.vx ?? 0,
            onUpdate: (val) => mv.x.set(r2(val)),
          }),
          animate(dy, 0, {
            ...springs.glide,
            velocity: v?.vy ?? 0,
            onUpdate: (val) => mv.y.set(r2(val)),
            onComplete: () => {
              runs.current.delete(id);
              setRaisedId((r) => (r === id ? null : r));
            },
          }),
        ]);
      }
    }
    if (settled.length) {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setRaisedId((r) => (r && settled.includes(r) ? null : r));
      }, 0);
      timers.current.add(t);
    }
    const focus = pendingFocus.current;
    if (focus) {
      pendingFocus.current = null;
      cardNodes.current.get(focus)?.focus({ preventScroll: true });
    }
  }, [shown, motionSafe]);

  /* ------------------------------ committing ------------------------------ */

  const commitMove = (
    id: string,
    column: string,
    index: number,
    velocity: { vx: number; vy: number } | null,
  ) => {
    const from = placeOf(cards, id);
    const card = cards.find((c) => c.id === id);
    if (!from || !card) return false;
    if (from.column === column && from.index === index) return false;
    const finishing = doneCols.has(column) && !doneCols.has(from.column);
    const reopening = !doneCols.has(column) && doneCols.has(from.column);
    const patch: Partial<BurndownCard> | null = finishing
      ? { doneOn: today }
      : reopening
        ? { doneOn: undefined }
        : null;
    const next = moveCard(cards, id, column, index, patch);

    // The points leave the card for the chart: measured before the commit,
    // from the pill in hand to today's point as the line now stands.
    const surface = surfaceRef.current;
    const pill = cardNodes.current.get(id)?.querySelector("[data-bd-points]");
    const dot = Array.from(dots.current.values()).find(
      (d) => d.getBoundingClientRect().width > 0,
    );
    if (finishing && motionSafe && surface && pill && dot) {
      const s = surface.getBoundingClientRect();
      const a = pill.getBoundingClientRect();
      const b = dot.getBoundingClientRect();
      tokenSeq.current += 1;
      const n = tokenSeq.current;
      setTokens((list) => [
        ...list,
        {
          n,
          card: id,
          label: `−${card.points}`,
          from: {
            x: r2(a.left + a.width / 2 - s.left - surface.clientLeft),
            y: r2(a.top + a.height / 2 - s.top - surface.clientTop),
          },
          to: {
            x: r2(b.left + b.width / 2 - s.left - surface.clientLeft),
            y: r2(b.top + b.height / 2 - s.top - surface.clientTop),
          },
        },
      ]);
      setHold((h) => ({ n, series: h?.series ?? series }));
    } else if (finishing) {
      setPulse((p) => p + 1);
    }

    capture(velocity ? { id, ...velocity } : null);
    pendingFocus.current = id;
    if (cardsProp === undefined) setOwn(next);
    onCardsChange?.(next);
    const move: BurndownMove = {
      cardId: id,
      from: from.column,
      to: column,
      index,
    };
    onMove?.(move);
    const nextStats = statsOf(
      seriesOf(
        next.filter((c) => colIds.has(c.column)),
        doneCols,
        days,
        today,
      ),
      days,
      today,
    );
    if (
      nextStats.remaining !== stats.remaining ||
      nextStats.done !== stats.done
    ) {
      onSprintChange?.(nextStats);
    }
    const pos = placeOf(next, id);
    const count = next.filter((c) => c.column === column).length;
    say(
      `${id} moved to ${colTitle(column)}, ${(pos?.index ?? 0) + 1} of ${count}.${
        finishing || reopening
          ? ` ${nextStats.remaining} ${unit} left, ideal ${nextStats.ideal}.`
          : ""
      }`,
    );
    return true;
  };

  /* ------------------------------ navigation ------------------------------ */

  const focusCard = (id: string) => {
    setActiveId(id);
    const node = cardNodes.current.get(id);
    if (!node) return;
    node.focus({ preventScroll: true });
    const sc = scrollRef.current;
    if (!sc) return;
    const s = sc.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    if (r.top < s.top + 8) sc.scrollBy({ top: r.top - s.top - 8 });
    else if (r.bottom > s.bottom - 8)
      sc.scrollBy({ top: r.bottom - s.bottom + 8 });
  };

  const neighbour = (id: string, key: string): string | null => {
    const col = lanes.findIndex((lane) => lane.some((c) => c.id === id));
    if (col < 0) return null;
    const lane = lanes[col] ?? [];
    const at = lane.findIndex((c) => c.id === id);
    if (key === "ArrowUp") return lane[at - 1]?.id ?? null;
    if (key === "ArrowDown") return lane[at + 1]?.id ?? null;
    if (key === "Home") return lane[0]?.id ?? null;
    if (key === "End") return lane[lane.length - 1]?.id ?? null;
    const step = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    if (!step) return null;
    for (let c = col + step; c >= 0 && c < lanes.length; c += step) {
      const other = lanes[c] ?? [];
      if (other.length)
        return other[Math.min(at, other.length - 1)]?.id ?? null;
    }
    return null;
  };

  const onCardKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key;
    const arrows = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ];
    if (lift && lift.id === id) {
      if (arrows.includes(key)) {
        event.preventDefault();
        const place = placeOf(lift.cards, id);
        if (!place) return;
        const colIndex = columns.findIndex((c) => c.id === place.column);
        const inCol = lift.cards.filter(
          (c) => c.column === place.column,
        ).length;
        let target: Place | null = null;
        if (key === "ArrowUp" && place.index > 0)
          target = { column: place.column, index: place.index - 1 };
        else if (key === "ArrowDown" && place.index < inCol - 1)
          target = { column: place.column, index: place.index + 1 };
        else if (key === "Home") target = { column: place.column, index: 0 };
        else if (key === "End")
          target = { column: place.column, index: inCol - 1 };
        else if (key === "ArrowLeft" || key === "ArrowRight") {
          const to = columns[colIndex + (key === "ArrowLeft" ? -1 : 1)];
          if (to) {
            const count = lift.cards.filter(
              (c) => c.column === to.id && c.id !== id,
            ).length;
            target = { column: to.id, index: Math.min(place.index, count) };
          }
        }
        if (
          target &&
          (target.column !== place.column || target.index !== place.index)
        ) {
          capture(null);
          pendingFocus.current = id;
          const moved = moveCard(
            lift.cards,
            id,
            target.column,
            target.index,
            null,
          );
          setLift({ ...lift, cards: moved });
          const total = moved.filter((c) => c.column === target.column).length;
          say(`${colTitle(target.column)}, ${target.index + 1} of ${total}.`);
        }
      } else if (key === " " || key === "Enter") {
        event.preventDefault();
        const place = placeOf(lift.cards, id);
        capture(null);
        setLift(null);
        if (!place || !commitMove(id, place.column, place.index, null)) {
          pendingFocus.current = id;
          say(`${id} dropped where it was.`);
        }
      } else if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        capture(null);
        pendingFocus.current = id;
        setLift(null);
        say(`${id} put back in ${colTitle(lift.from.column)}.`);
      }
      return;
    }
    if (arrows.includes(key)) {
      event.preventDefault();
      const next = neighbour(id, key);
      if (next) focusCard(next);
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (locked) return;
      const from = placeOf(cards, id);
      if (!from) return;
      setLift({ id, from, cards });
      say(`Lifted ${id}. Arrows move it, Space drops, Escape puts it back.`);
      return;
    }
    if (key === "Escape" && dragRef.current?.id === id) {
      event.preventDefault();
      event.stopPropagation();
      cancelDrag();
    }
  };

  /* -------------------------------- pointer ------------------------------- */

  const press = React.useRef<{
    id: string;
    x: number;
    y: number;
    face: boolean;
  } | null>(null);
  const dragRef = React.useRef<{
    id: string;
    sx: number;
    sy: number;
    st: number;
    px: number;
    py: number;
    over: Over | null;
  } | null>(null);
  const edgeLoop = React.useRef(0);

  const placeDragged = () => {
    const d = dragRef.current;
    const sc = scrollRef.current;
    if (!d || !sc) return;
    const mv = cardMv.current.get(d.id);
    if (!mv) return;
    mv.x.set(r2(d.px - d.sx));
    mv.y.set(r2(d.py - d.sy + (sc.scrollTop - d.st)));
  };

  const hitTest = (px: number, py: number): Over | null => {
    const d = dragRef.current;
    if (!d) return null;
    let column: string | null = null;
    let best = Infinity;
    for (const col of columns) {
      const node = colNodes.current.get(col.id);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      const dx = px < r.left ? r.left - px : px > r.right ? px - r.right : 0;
      const dy = py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0;
      const dist = Math.hypot(dx, dy);
      if (dist < best) {
        best = dist;
        column = col.id;
      }
    }
    const colNode = column ? colNodes.current.get(column) : null;
    if (!column || !colNode) return null;
    const cr = colNode.getBoundingClientRect();
    const rects = visible
      .filter((c) => c.column === column && c.id !== d.id)
      .map((c) => cardNodes.current.get(c.id)?.getBoundingClientRect())
      .filter((r): r is DOMRect => r !== undefined);
    let index = 0;
    for (const r of rects) if (r.top + r.height / 2 < py) index += 1;
    const prev = rects[index - 1];
    const next = rects[index];
    const list = colNode.querySelector("ul")?.getBoundingClientRect();
    const y =
      prev && next
        ? (prev.bottom + next.top) / 2
        : prev
          ? prev.bottom + 4
          : next
            ? next.top - 4
            : (list?.top ?? cr.top) + 4;
    return { column, index, y: r2(y - cr.top) };
  };

  const hover = () => {
    const d = dragRef.current;
    if (!d) return;
    const over = hitTest(d.px, d.py);
    if (
      over?.column !== d.over?.column ||
      over?.index !== d.over?.index ||
      over?.y !== d.over?.y
    ) {
      d.over = over;
      setDrag((s) => (s ? { ...s, over } : s));
    }
  };

  const edgeTick = () => {
    edgeLoop.current = 0;
    const d = dragRef.current;
    const sc = scrollRef.current;
    if (!d || !sc) return;
    const r = sc.getBoundingClientRect();
    const E = 36;
    const dy =
      d.py < r.top + E
        ? -Math.ceil((r.top + E - d.py) / 4)
        : d.py > r.bottom - E
          ? Math.ceil((d.py - (r.bottom - E)) / 4)
          : 0;
    if (!dy) return;
    const before = sc.scrollTop;
    sc.scrollBy(0, dy);
    if (sc.scrollTop === before) return;
    placeDragged();
    hover();
    edgeLoop.current = requestAnimationFrame(edgeTick);
  };

  const stopEdge = () => {
    if (edgeLoop.current) cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = 0;
  };

  const goHome = (id: string, vx: number, vy: number) => {
    const mv = cardMv.current.get(id);
    if (!mv) return;
    stopRuns(id);
    if (!motionSafe) {
      mv.x.jump(0);
      mv.y.jump(0);
      setRaisedId(null);
      return;
    }
    runs.current.set(id, [
      animate(mv.x, 0, { ...springs.glide, velocity: vx }),
      animate(mv.y, 0, {
        ...springs.glide,
        velocity: vy,
        onComplete: () => {
          runs.current.delete(id);
          setRaisedId((r) => (r === id ? null : r));
        },
      }),
    ]);
  };

  const cancelDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    stopEdge();
    setDrag(null);
    if (d) goHome(d.id, 0, 0);
  };

  const gesture = useDrag({
    threshold: 4,
    disabled: locked,
    onStart: ({ point }) => {
      const p = press.current;
      const sc = scrollRef.current;
      if (!p || !sc || p.face || lift) return;
      stopRuns(p.id);
      const mv = cardMv.current.get(p.id);
      dragRef.current = {
        id: p.id,
        sx: p.x - (mv?.x.get() ?? 0),
        sy: p.y - (mv?.y.get() ?? 0),
        st: sc.scrollTop,
        px: point.x,
        py: point.y,
        over: null,
      };
      setRaisedId(p.id);
      setActiveId(p.id);
      setDrag({ id: p.id, over: null });
      placeDragged();
      hover();
    },
    onMove: ({ point }) => {
      const d = dragRef.current;
      if (!d) return;
      d.px = point.x;
      d.py = point.y;
      placeDragged();
      hover();
      if (!edgeLoop.current) edgeLoop.current = requestAnimationFrame(edgeTick);
    },
    onEnd: ({ velocity }) => {
      const d = dragRef.current;
      dragRef.current = null;
      stopEdge();
      setDrag(null);
      if (!d) return;
      const over = d.over;
      const moved =
        over !== null &&
        commitMove(d.id, over.column, over.index, {
          vx: velocity.x,
          vy: velocity.y,
        });
      if (!moved) goHome(d.id, velocity.x, velocity.y);
    },
    onCancel: () => cancelDrag(),
    onTap: () => {
      const p = press.current;
      if (p) setActiveId(p.id);
    },
  });

  const onBoardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const id = target
      .closest<HTMLElement>("[data-bd-card]")
      ?.getAttribute("data-bd-card");
    if (!id || locked || target.closest("button")) {
      press.current = null;
      return;
    }
    press.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      // Touch scrolls the board from a card's face; the grip carries it.
      face:
        event.pointerType === "touch" &&
        target.closest("[data-bd-grip]") === null,
    };
    gesture.onPointerDown(event);
  };

  /* -------------------------------- render -------------------------------- */

  const behind =
    Math.round((shownStats.remaining - shownStats.ideal) * 10) / 10;
  const pace =
    Math.abs(behind) < 0.5
      ? { text: "On track", tone: "ok" as const }
      : behind > 0
        ? { text: `Behind by ${behind}`, tone: "warn" as const }
        : { text: `Ahead by ${-behind}`, tone: "ok" as const };
  const first = calendar[0];
  const lastDay = calendar[calendar.length - 1];
  const range =
    first && lastDay
      ? `${first.month} ${first.day} – ${first.month === lastDay.month ? "" : `${lastDay.month} `}${lastDay.day}`
      : "";
  const chartLabel = `Burndown: ${shownStats.remaining} ${unit} left on day ${today + 1} of ${days}; the ideal line is at ${shownStats.ideal}.${
    stats.added > 0 ? ` ${stats.added} ${unit} were added mid-sprint.` : ""
  }`;

  const figures = (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-foreground">
        <RollingNumber value={shownStats.remaining} motionSafe={motionSafe} />
      </span>
      <span className="text-[12px] text-ink-2">{unit} left</span>
      <span className="sr-only">{`${shownStats.remaining} ${unit} left`}</span>
    </div>
  );

  const header = (
    <header className="flex flex-col gap-3 border-b border-hairline px-4 pt-3 pb-3">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
            {sprint.name}
            {sprint.goal ? (
              <span className="font-normal text-ink-3"> · {sprint.goal}</span>
            ) : null}
          </h2>
          <p className="text-[12px] leading-4 text-ink-3 tabular-nums">
            {range} · day {today + 1} of {days}
          </p>
        </div>
        {ready ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {figures}
            <span
              className={cn(
                "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium tabular-nums",
                pace.tone === "warn"
                  ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-warn"
                  : "border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] text-success",
              )}
            >
              {pace.text}
            </span>
          </div>
        ) : null}
      </div>
      {ready ? (
        <div role="img" aria-label={chartLabel}>
          <div className="hidden @min-[40rem]/burndown-board:block">
            <BurnChart
              series={shownSeries}
              days={days}
              today={today}
              labels={calendar}
              height={Math.max(72, Math.min(260, chartHeight))}
              strip={false}
              unit={unit}
              pulse={pulse}
              motionSafe={motionSafe}
              dotRef={fullDot}
            />
          </div>
          <div className="@min-[40rem]/burndown-board:hidden">
            <BurnChart
              series={shownSeries}
              days={days}
              today={today}
              labels={calendar}
              height={40}
              strip
              unit={unit}
              pulse={pulse}
              motionSafe={motionSafe}
              dotRef={stripDot}
            />
          </div>
          <div className="sr-only">
            <table>
              <caption>Points left at the end of each day</caption>
              <tbody>
                {stats.history.map((v, d) => (
                  <tr key={d}>
                    <th scope="row">
                      {calendar[d]?.weekday} {calendar[d]?.day}
                    </th>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </header>
  );

  const body =
    status === "loading" ? (
      <div
        aria-busy="true"
        className="grid grid-cols-1 gap-4 p-4 @min-[40rem]/burndown-board:grid-cols-4 @min-[40rem]/burndown-board:gap-3"
      >
        <span className="sr-only">Loading the sprint.</span>
        {[3, 2, 2, 3].map((n, i) => (
          <div key={i} aria-hidden className="flex flex-col gap-2">
            <span className="h-4 w-20 rounded-2 bg-surface-2" />
            {Array.from({ length: n }, (_, j) => (
              <span
                key={j}
                className="h-16 rounded-3 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">The sprint did not load.</p>
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div
        ref={contentRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={gesture.onPointerMove}
        onPointerUp={gesture.onPointerUp}
        onPointerCancel={gesture.onPointerCancel}
        onLostPointerCapture={gesture.onLostPointerCapture}
        className="relative grid grid-cols-1 gap-4 p-3 @min-[40rem]/burndown-board:grid-cols-[repeat(var(--bd-cols),minmax(0,1fr))] @min-[40rem]/burndown-board:gap-3 @min-[40rem]/burndown-board:p-4"
        style={
          { "--bd-cols": Math.max(1, columns.length) } as React.CSSProperties
        }
      >
        {columns.map((col, ci) => {
          const lane = lanes[ci] ?? [];
          const isOver = drag?.over?.column === col.id;
          const headId = `${uid}-col-${ci}`;
          const pts = lane.reduce((a, c) => a + Math.max(0, c.points), 0);
          return (
            <section
              key={col.id}
              ref={(node) => {
                if (node) colNodes.current.set(col.id, node);
                else colNodes.current.delete(col.id);
              }}
              aria-labelledby={headId}
              className={cn(
                "relative flex flex-col gap-2 rounded-3 p-1 transition-[background-color,box-shadow] duration-200",
                isOver &&
                  "bg-[color-mix(in_oklab,var(--bd-line)_7%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--bd-line)_30%,transparent)]",
              )}
            >
              <div className="flex h-7 items-center gap-2 px-1">
                <h3
                  id={headId}
                  className="truncate text-[12px] font-semibold tracking-[0.02em] text-ink-2"
                >
                  {col.title}
                </h3>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {lane.length} · {pts}
                  <span className="sr-only"> {unit}</span>
                </span>
                {ci === 0 && onAddCard && !locked ? (
                  <button
                    type="button"
                    onClick={() => onAddCard(col.id)}
                    aria-label={`Add a card to ${col.title}`}
                    className={cn(
                      "ml-auto inline-flex size-6 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <Plus aria-hidden className="size-3.5" />
                  </button>
                ) : col.done ? (
                  <Check
                    aria-hidden
                    className="ml-auto size-3.5 text-(--bd-ink)"
                  />
                ) : null}
              </div>
              <ul
                role="list"
                aria-labelledby={headId}
                className="flex flex-col gap-2"
              >
                {lane.map((card) => (
                  <li key={card.id}>
                    <SprintCard
                      card={card}
                      columnTitle={col.title}
                      done={Boolean(col.done)}
                      unit={unit}
                      active={tabStop === card.id}
                      lifted={lift?.id === card.id}
                      raised={raisedId === card.id}
                      pillHidden={tokens.some((t) => t.card === card.id)}
                      cardStyle={cardStyle}
                      motionSafe={motionSafe}
                      hintId={hintId}
                      locked={locked}
                      onNode={onNode}
                      onKeyDown={onCardKey}
                      onFocusCard={(id) => {
                        setActiveId(id);
                        if (
                          lift &&
                          lift.id !== id &&
                          pendingFocus.current !== lift.id
                        ) {
                          capture(null);
                          setLift(null);
                        }
                      }}
                    />
                  </li>
                ))}
                {lane.length === 0 ? (
                  <li
                    aria-hidden
                    className="flex h-14 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-[12px] text-ink-3"
                  >
                    {col.done ? "Nothing finished yet" : "No cards"}
                  </li>
                ) : null}
              </ul>
              {isOver && drag?.over ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-(--bd-line)"
                  style={{ top: drag.over.y - 1 }}
                />
              ) : null}
            </section>
          );
        })}
      </div>
    );

  return (
    <div
      className={cn("@container/burndown-board w-full", className)}
      onBlur={(event) => {
        const to = event.relatedTarget as Node | null;
        if (to && event.currentTarget.contains(to)) return;
        if (lift && pendingFocus.current !== lift.id) {
          capture(null);
          setLift(null);
        }
      }}
      style={
        {
          "--bd-line": pal.line,
          "--bd-scope": pal.scope,
          "--bd-fill": `oklch(from ${pal.line} 0.58 0.14 h)`,
          "--bd-ink": `color-mix(in oklab, ${pal.line} 80%, var(--ink))`,
          "--bd-scope-ink": `color-mix(in oklab, ${pal.scope} 75%, var(--ink))`,
        } as React.CSSProperties
      }
    >
      <div
        ref={surfaceRef}
        role="region"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className={cn(
          "relative mx-auto flex max-h-[35rem] w-full max-w-[64rem] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-card text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_12%,transparent)]",
          disabled && "opacity-70",
        )}
      >
        {header}
        <div
          ref={scrollRef}
          className="relative flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain bg-surface-0"
        >
          {body}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-40">
          {tokens.map((t) => (
            <PointsToken
              key={t.n}
              token={t}
              motionSafe={motionSafe}
              onLand={landed}
            />
          ))}
        </div>
        <p id={hintId} className="sr-only">
          Arrows move between cards. Space lifts a card, arrows carry it, Space
          drops it and Escape puts it back. Moving a card to Done takes its
          points off the burndown.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </div>
  );
}
