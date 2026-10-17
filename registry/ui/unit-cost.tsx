"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ChartLine,
  ChevronsUpDown,
  Divide,
  Link2,
  RotateCcw,
  Table2,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type UnitCostAccentName = "cobalt" | "plum" | "mint" | "ink";
export type UnitCostFractionStyle = "stacked" | "slashed" | "ratio";
export type UnitCostBandStyle = "shade" | "hatch" | "rules";
export type UnitCostView = "chart" | "table";
export type UnitCostStatus = "ready" | "loading" | "error";

/** Something finished that AI spend can be divided by. */
export type UnitCostOutcome = {
  id: string;
  /** Plural and lower case, as it reads under the count: "tickets resolved". */
  label: string;
  /** Short name for the picker: "Tickets". @default the label */
  short?: string;
  /** What one of them is called: "ticket" (reads "$0.37 a ticket"). */
  unit: string;
  /** The cost per outcome the team is aiming for, in dollars. */
  target: number;
  /** Half the target band's width, as a share of the target. @default 0.15 */
  tolerance?: number;
};

/** A line of AI usage on the bill, which the mapping ties to an outcome. */
export type UnitCostUsage = { id: string; name: string };

export type UnitCostPeriod = {
  /** "2026-10-12". */
  id: string;
  /** Short label: "Oct 12" (the week's Monday). */
  label: string;
  /** Spend per usage line, in dollars. */
  spend: Record<string, number>;
  /** Finished outcomes per outcome id. */
  outcomes: Record<string, number>;
  /** The period is still running (drawn dashed). */
  partial?: boolean;
};

export type UnitCostProps = {
  /** What spend is divided by. @default defaultUnitCostOutcomes */
  outcomes?: UnitCostOutcome[];
  /** The usage lines spend is reported under. @default defaultUnitCostUsages */
  usages?: UnitCostUsage[];
  /** The periods, oldest first. @default defaultUnitCostPeriods (twelve weeks) */
  periods?: UnitCostPeriod[];
  /** Which outcome each usage line produces; null or missing is unmapped spend. @default defaultUnitCostMapping */
  mapping?: Record<string, string | null>;
  /** Controlled outcome id. */
  outcome?: string;
  /** Initial outcome when uncontrolled. @default the first outcome */
  defaultOutcome?: string;
  /** Fires from the radio or arrow key that changed the outcome. */
  onOutcomeChange?: (id: string, outcome: UnitCostOutcome) => void;
  /** Controlled period id. */
  period?: string;
  /** Initial period when uncontrolled. @default the last period */
  defaultPeriod?: string;
  /** Fires as the trend's cursor, a table row or an arrow key picks a period. */
  onPeriodChange?: (id: string, period: UnitCostPeriod) => void;
  /** Controlled targets per outcome id, overriding each outcome's own. */
  targets?: Record<string, number>;
  /** Fires when the target line is dragged or stepped to a new value. */
  onSetTarget?: (outcomeId: string, value: number) => void;
  /** "Map usage" was pressed, with the usage ids that feed no outcome. Omit it and the note is plain text. */
  onMapUsage?: (usageIds: string[]) => void;
  /** Below this many outcomes a period's cost is called noisy and drawn hollow. @default 40 */
  minOutcomes?: number;
  /** The trend as a chart or a table at first; the Chart and Table buttons switch it. @default "chart" */
  defaultView?: UnitCostView;
  /** Usage arrived, is on its way, or failed. @default "ready" */
  status?: UnitCostStatus;
  /** "Try again" was pressed after usage failed to load. */
  onRetry?: () => void;
  /** The panel's heading. @default "Gaugeworks · support assistant" */
  title?: string;
  /** Under the heading. @default "AI spend per finished outcome" */
  subtitle?: string;
  /** How money prints: whole totals ("$1,284") and per-outcome costs ("$0.37"). */
  formatMoney?: (amount: number, kind: "total" | "each") => string;
  /** The fraction's form: one figure over another, a slashed nut fraction, or one line. @default "stacked" */
  fractionStyle?: UnitCostFractionStyle;
  /** How the target band is drawn: a soft wash, hatching, or only its two edges. @default "shade" */
  bandStyle?: UnitCostBandStyle;
  /** The line, band and selection colour. @default "cobalt" */
  accent?: UnitCostAccentName | (string & {});
  /** Read only: nothing can be picked, dragged or set. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

export const defaultUnitCostOutcomes: UnitCostOutcome[] = [
  {
    id: "tickets",
    label: "tickets resolved",
    short: "Tickets",
    unit: "ticket",
    target: 0.4,
  },
  {
    id: "drafts",
    label: "drafts sent",
    short: "Drafts",
    unit: "draft",
    target: 0.12,
  },
  {
    id: "reports",
    label: "reports built",
    short: "Reports",
    unit: "report",
    target: 3.5,
    tolerance: 0.12,
  },
];

export const defaultUnitCostUsages: UnitCostUsage[] = [
  { id: "triage", name: "Ticket triage" },
  { id: "lookup", name: "Answer lookup" },
  { id: "drafting", name: "Reply drafting" },
  { id: "reporting", name: "Report writing" },
  { id: "sandbox", name: "Prompt sandbox" },
];

/** The sandbox feeds nothing a customer sees: that is the unmapped spend. */
export const defaultUnitCostMapping: Record<string, string | null> = {
  triage: "tickets",
  lookup: "tickets",
  drafting: "drafts",
  reporting: "reports",
  sandbox: null,
};

const WEEKS = [
  ["2026-07-27", "Jul 27"],
  ["2026-08-03", "Aug 3"],
  ["2026-08-10", "Aug 10"],
  ["2026-08-17", "Aug 17"],
  ["2026-08-24", "Aug 24"],
  ["2026-08-31", "Aug 31"],
  ["2026-09-07", "Sep 7"],
  ["2026-09-14", "Sep 14"],
  ["2026-09-21", "Sep 21"],
  ["2026-09-28", "Sep 28"],
  ["2026-10-05", "Oct 5"],
  ["2026-10-12", "Oct 12"],
] as const;

const SERIES = {
  triage: [980, 1004, 1032, 1010, 1046, 1020, 702, 640, 628, 646, 640, 470],
  lookup: [512, 520, 548, 540, 560, 552, 566, 574, 560, 584, 590, 432],
  drafting: [520, 548, 530, 572, 540, 610, 566, 548, 640, 590, 582, 430],
  reporting: [148, 160, 152, 176, 168, 162, 190, 196, 172, 204, 210, 98],
  sandbox: [64, 40, 92, 120, 88, 140, 76, 212, 98, 130, 186, 212],
  tickets: [
    2840, 2910, 3020, 2980, 3105, 3060, 3190, 3240, 3215, 3302, 3288, 2416,
  ],
  drafts: [
    4210, 4380, 4460, 4390, 4620, 4710, 4580, 4820, 4950, 4880, 5040, 3610,
  ],
  reports: [34, 41, 38, 52, 47, 44, 58, 61, 49, 63, 66, 29],
} as const;

const at = (row: readonly number[], i: number) => row[i] ?? 0;

/**
 * Gaugeworks' support assistant over twelve weeks: triage moved to a
 * lighter model in September, so a resolved ticket got cheaper; drafts hover
 * round their target; reports are few enough that some weeks are noisy. The
 * last week is still running.
 */
export const defaultUnitCostPeriods: UnitCostPeriod[] = WEEKS.map(
  ([id, label], i) => ({
    id,
    label,
    partial: i === WEEKS.length - 1,
    spend: {
      triage: at(SERIES.triage, i),
      lookup: at(SERIES.lookup, i),
      drafting: at(SERIES.drafting, i),
      reporting: at(SERIES.reporting, i),
      sandbox: at(SERIES.sandbox, i),
    },
    outcomes: {
      tickets: at(SERIES.tickets, i),
      drafts: at(SERIES.drafts, i),
      reports: at(SERIES.reports, i),
    },
  }),
);

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const commas = (n: number) =>
  String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Money by hand: the same string in Node and every browser. */
const dollars = (amount: number, kind: "total" | "each"): string => {
  const sign = amount < 0 ? "−" : "";
  if (kind === "total") return `${sign}$${commas(amount)}`;
  const v = Math.abs(amount);
  return `${sign}$${v.toFixed(v < 0.2 ? 3 : 2)}`;
};

const plural = (n: number, one: string, many: string) =>
  `${commas(n)} ${n === 1 ? one : many}`;

const ACCENTS: Record<UnitCostAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--uc-ink": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as UnitCostAccentName]
      : accent,
    "--uc-wash": "color-mix(in oklab, var(--uc-ink) 12%, transparent)",
    "--uc-soft": "color-mix(in oklab, var(--uc-ink) 34%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Keyboard step for a target: a half cent on pennies, a cent on dimes, five on dollars. */
const stepFor = (target: number) =>
  target < 0.2 ? 0.005 : target < 2 ? 0.01 : 0.05;

const roundTo = (v: number, step: number) =>
  Number((Math.round(v / step) * step).toFixed(3));

type Reading = {
  spend: number;
  count: number;
  each: number | null;
  mapped: boolean;
};

type Verdict = { tone: "good" | "over" | "under" | "far"; text: string };

const verdictOf = (
  each: number,
  target: number,
  tolerance: number,
): Verdict => {
  const lo = target * (1 - tolerance);
  const hi = target * (1 + tolerance);
  const off = Math.round((Math.abs(each - target) / target) * 100);
  if (each >= lo && each <= hi) return { tone: "good", text: "In band" };
  if (each > hi)
    return { tone: off >= 50 ? "far" : "over", text: `${off}% over target` };
  return { tone: "under", text: `${off}% under target` };
};

const VERDICT_CLASS: Record<Verdict["tone"], string> = {
  good: "border-[color-mix(in_oklab,var(--success)_40%,transparent)] text-success",
  over: "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] text-warn",
  far: "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] text-danger",
  under: "border-[var(--uc-soft)] text-[var(--uc-ink)]",
};

/* ----------------------------------------------------------------------- */
/*                                 Odometer                                 */
/* ----------------------------------------------------------------------- */

type Cell = { key: string; digit?: number; ch?: string };

/**
 * Keys every character by its place from the right, so the units column is
 * always the same column: a digit that did not change keeps its strip and
 * holds still, and a number that gains a place grows a new column at the
 * left instead of shifting every strip one over.
 */
const cellsOf = (text: string): Cell[] => {
  const chars = [...text];
  const firstDigit = chars.findIndex((c) => c >= "0" && c <= "9");
  const lastDigit =
    chars.length -
    1 -
    [...chars].reverse().findIndex((c) => c >= "0" && c <= "9");
  if (firstDigit < 0) return chars.map((ch, i) => ({ key: `p${i}`, ch }));
  const out: Cell[] = [];
  let place = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const ch = chars[i] ?? "";
    if (i > lastDigit) out.unshift({ key: `x${chars.length - 1 - i}`, ch });
    else if (i < firstDigit) out.unshift({ key: `p${i}`, ch });
    else if (ch >= "0" && ch <= "9") {
      out.unshift({ key: `d${place}`, digit: Number(ch) });
      place += 1;
    } else out.unshift({ key: `s${place}`, ch });
  }
  return out;
};

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function Odometer({
  text,
  delay,
  motionSafe,
  className,
}: {
  text: string;
  delay: number;
  motionSafe: boolean;
  className?: string;
}) {
  const cells = cellsOf(text);
  const roll = motionSafe ? { ...springs.snap, delay } : { duration: 0 };
  const grow = motionSafe ? springs.glide : { duration: 0 };
  return (
    <span
      aria-hidden
      className={cn("inline-flex items-start tabular-nums", className)}
      style={{ lineHeight: "1.15em", height: "1.15em" }}
    >
      <AnimatePresence initial={false}>
        {cells.map((cell) =>
          cell.digit === undefined ? (
            <motion.span
              key={cell.key}
              className="inline-block overflow-hidden whitespace-pre"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={grow}
            >
              {cell.ch}
            </motion.span>
          ) : (
            <motion.span
              key={cell.key}
              className="relative inline-block overflow-hidden"
              style={{ height: "1.15em" }}
              initial={{ opacity: 0, width: "0ch" }}
              animate={{ opacity: 1, width: "1ch" }}
              exit={{ opacity: 0, width: "0ch" }}
              transition={grow}
            >
              {/* The strip carries all ten faces; travelling it a tenth per
                  digit on snap is the roll, and an unchanged digit has
                  nowhere to go, so it holds still. */}
              <motion.span
                className="absolute inset-x-0 top-0 flex flex-col"
                initial={false}
                animate={{ y: `${-cell.digit * 10}%` }}
                transition={roll}
              >
                {DIGITS.map((d) => (
                  <span
                    key={d}
                    className="block text-center"
                    style={{ height: "1.15em", lineHeight: "1.15em" }}
                  >
                    {d}
                  </span>
                ))}
              </motion.span>
            </motion.span>
          ),
        )}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Trend                                   */
/* ----------------------------------------------------------------------- */

type Pt = { x: number; y: number; on: boolean };
type Geo = { pts: Pt[]; lo: number; hi: number; target: number };

const PAD_L = 42;
const PAD_R = 70;
const PAD_T = 10;
const PAD_B = 20;

type TrendProps = {
  values: (number | null)[];
  hollow: boolean[];
  labels: string[];
  partial: boolean;
  selected: number;
  onSelect: (index: number, settled: boolean) => void;
  target: number;
  tolerance: number;
  /** The outcome's own target: the scale is built round it, so dragging never rescales. */
  baseTarget: number;
  onTarget: (value: number) => void;
  morphKey: string;
  formatEach: (v: number) => string;
  valueText: string;
  unit: string;
  bandStyle: UnitCostBandStyle;
  motionSafe: boolean;
  disabled: boolean;
  uid: string;
};

function Trend({
  values,
  hollow,
  labels,
  partial,
  selected,
  onSelect,
  target,
  tolerance,
  baseTarget,
  onTarget,
  morphKey,
  formatEach,
  valueText,
  unit,
  bandStyle,
  motionSafe,
  disabled,
  uid,
}: TrendProps) {
  const [box, setBox] = React.useState({ w: 420, h: 138 });
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(node.clientWidth);
      const h = Math.round(node.clientHeight);
      if (w > 0 && h > 0)
        setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);

  const W = Math.max(160, box.w);
  const H = Math.max(80, box.h);
  const n = values.length;
  const x0 = PAD_L;
  const x1 = W - PAD_R;
  const xAt = React.useCallback(
    (i: number) => (n <= 1 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1)),
    [n, x0, x1],
  );

  // One scale per outcome from its data and its own band, padded, so the
  // band can be dragged anywhere on it without the axis moving underneath.
  const scale = React.useMemo(() => {
    const seen = values.filter((v): v is number => v !== null);
    const lo = Math.min(baseTarget * (1 - tolerance), ...seen);
    const hi = Math.max(baseTarget * (1 + tolerance), ...seen);
    const pad = (hi - lo) * 0.18 || baseTarget * 0.2 || 1;
    return { min: Math.max(0, lo - pad), max: hi + pad };
  }, [values, baseTarget, tolerance]);

  const yAt = React.useCallback(
    (v: number) =>
      PAD_T +
      (1 - (v - scale.min) / (scale.max - scale.min || 1)) *
        (H - PAD_T - PAD_B),
    [scale, H],
  );
  const valueAt = React.useCallback(
    (y: number) =>
      scale.min +
      (1 - (y - PAD_T) / (H - PAD_T - PAD_B || 1)) * (scale.max - scale.min),
    [scale, H],
  );

  const geo = React.useMemo<Geo>(() => {
    const mid = yAt(baseTarget);
    // A missing week sits where the line last was, so a morph never dives.
    const pts: Pt[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const prev = pts[i - 1]?.y ?? mid;
      pts.push(
        v === null || v === undefined
          ? { x: xAt(i), y: prev, on: false }
          : { x: xAt(i), y: yAt(v), on: true },
      );
    }
    return {
      pts,
      lo: yAt(target * (1 + tolerance)),
      hi: yAt(target * (1 - tolerance)),
      target: yAt(target),
    };
  }, [values, xAt, yAt, baseTarget, target, tolerance]);

  const ticks = React.useMemo(() => {
    const span = scale.max - scale.min;
    const raw = span / 3;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const step =
      [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
    const out: number[] = [];
    for (
      let v = Math.ceil(scale.min / step) * step;
      v <= scale.max && out.length < 4;
      v += step
    )
      out.push(Number(v.toFixed(4)));
    return out;
  }, [scale]);

  /* ----------------------------- drawing ------------------------------ */

  const areaEl = React.useRef<SVGPathElement | null>(null);
  const lineEl = React.useRef<SVGPathElement | null>(null);
  const tailEl = React.useRef<SVGPathElement | null>(null);
  const dotEls = React.useRef(new Map<number, SVGCircleElement>());
  const bandEl = React.useRef<SVGRectElement | null>(null);
  const edgeEls = React.useRef<(SVGLineElement | null)[]>([null, null]);
  const targetEl = React.useRef<SVGLineElement | null>(null);
  const handleEl = React.useRef<HTMLDivElement | null>(null);
  const handleText = React.useRef<HTMLSpanElement | null>(null);
  const ruleEl = React.useRef<SVGLineElement | null>(null);
  const cursorDot = React.useRef<SVGCircleElement | null>(null);
  const cursorLabel = React.useRef<HTMLSpanElement | null>(null);

  const shown = React.useRef<Geo | null>(null);
  const cursorX = React.useRef(xAt(selected));
  const morph = React.useRef<AnimationPlaybackControls | null>(null);
  const glide = React.useRef<AnimationPlaybackControls | null>(null);
  const nextMorph = React.useRef<{ spring: object; velocity: number } | null>(
    null,
  );

  const paths = (g: Geo) => {
    const solidEnd = partial ? g.pts.length - 2 : g.pts.length - 1;
    let line = "";
    let pen = false;
    g.pts.forEach((p, i) => {
      if (i > solidEnd || !p.on) {
        pen = false;
        return;
      }
      line += `${pen ? "L" : "M"}${r2(p.x)} ${r2(p.y)}`;
      pen = true;
    });
    const a = g.pts[g.pts.length - 2];
    const b = g.pts[g.pts.length - 1];
    const tail =
      partial && a?.on && b?.on
        ? `M${r2(a.x)} ${r2(a.y)}L${r2(b.x)} ${r2(b.y)}`
        : "";
    const on = g.pts.filter((p) => p.on);
    const first = on[0];
    const end = on[on.length - 1];
    const base = r2(H - PAD_B);
    const area =
      first && end
        ? `M${r2(first.x)} ${base}${on.map((p) => `L${r2(p.x)} ${r2(p.y)}`).join("")}L${r2(end.x)} ${base}Z`
        : "";
    return { line, tail, area };
  };

  const yOnLine = (g: Geo, x: number) => {
    const on = g.pts.filter((p) => p.on);
    if (on.length === 0) return g.target;
    const first = on[0];
    const last = on[on.length - 1];
    if (!first || !last) return g.target;
    if (x <= first.x) return first.y;
    if (x >= last.x) return last.y;
    for (let i = 0; i < on.length - 1; i++) {
      const a = on[i];
      const b = on[i + 1];
      if (a && b && x >= a.x && x <= b.x)
        return lerp(a.y, b.y, (x - a.x) / (b.x - a.x || 1));
    }
    return last.y;
  };

  const placeCursor = (x: number) => {
    cursorX.current = x;
    const g = shown.current ?? geo;
    const y = yOnLine(g, x);
    ruleEl.current?.setAttribute("x1", String(r2(x)));
    ruleEl.current?.setAttribute("x2", String(r2(x)));
    cursorDot.current?.setAttribute("cx", String(r2(x)));
    cursorDot.current?.setAttribute("cy", String(r2(y)));
    if (cursorLabel.current) {
      const lx = clamp(x, x0 + 18, x1 - 18);
      cursorLabel.current.style.transform = `translateX(${r2(lx)}px) translateX(-50%)`;
    }
  };

  const placeBand = (g: Geo) => {
    bandEl.current?.setAttribute("y", String(r2(g.lo)));
    bandEl.current?.setAttribute(
      "height",
      String(r2(Math.max(0, g.hi - g.lo))),
    );
    const [top, bottom] = edgeEls.current;
    for (const [el, y] of [
      [top, g.lo],
      [bottom, g.hi],
      [targetEl.current, g.target],
    ] as const) {
      el?.setAttribute("y1", String(r2(y)));
      el?.setAttribute("y2", String(r2(y)));
    }
    if (handleEl.current)
      handleEl.current.style.transform = `translateY(${r2(g.target - 11)}px)`;
  };

  const draw = (g: Geo) => {
    shown.current = g;
    const p = paths(g);
    areaEl.current?.setAttribute("d", p.area);
    lineEl.current?.setAttribute("d", p.line);
    tailEl.current?.setAttribute("d", p.tail);
    g.pts.forEach((pt, i) => {
      const el = dotEls.current.get(i);
      el?.setAttribute("cx", String(r2(pt.x)));
      el?.setAttribute("cy", String(r2(pt.y)));
    });
    placeBand(g);
    placeCursor(cursorX.current);
  };

  const lerpGeo = (a: Geo, b: Geo, t: number): Geo => ({
    pts: b.pts.map((p, i) => {
      const f = a.pts[i] ?? p;
      return { x: lerp(f.x, p.x, t), y: lerp(f.y, p.y, t), on: p.on };
    }),
    lo: lerp(a.lo, b.lo, t),
    hi: lerp(a.hi, b.hi, t),
    target: lerp(a.target, b.target, t),
  });

  const lastKey = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    const from = shown.current;
    const changed = lastKey.current !== null && lastKey.current !== morphKey;
    lastKey.current = morphKey;
    morph.current?.stop();
    const how = nextMorph.current;
    nextMorph.current = null;
    if (!from || !changed || !motionSafe) {
      draw(geo);
      return;
    }
    // React has just written the new shape; put the old one back before the
    // browser paints and carry it across on one spring, so a second change
    // mid-flight continues from the frame it interrupted.
    draw(from);
    morph.current = animate(0, 1, {
      ...(how?.spring ?? springs.glide),
      velocity: how?.velocity ?? 0,
      onUpdate: (t) => draw(lerpGeo(from, geo, clamp(t, -0.2, 1.2))),
      onComplete: () => draw(geo),
    });
    return () => morph.current?.stop();
    // draw/lerpGeo read refs and the latest geo; the morph is keyed on the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, morphKey, motionSafe]);

  /* ----------------------------- the cursor ---------------------------- */

  const dragging = React.useRef(false);
  const dragX = React.useRef(0);
  const releaseVelocity = React.useRef(0);
  const lastSelected = React.useRef(selected);
  const goal = xAt(selected);
  React.useLayoutEffect(() => {
    glide.current?.stop();
    const moved = lastSelected.current !== selected;
    lastSelected.current = selected;
    if (dragging.current) {
      placeCursor(dragX.current);
      return;
    }
    const from = cursorX.current;
    // A resize only moves the goal under the cursor: it jumps, it never travels.
    if (!moved || !motionSafe || Math.abs(from - goal) < 0.5) {
      placeCursor(goal);
      return;
    }
    placeCursor(from);
    const velocity = releaseVelocity.current;
    releaseVelocity.current = 0;
    glide.current = animate(from, goal, {
      ...springs.snap,
      velocity,
      onUpdate: placeCursor,
      onComplete: () => placeCursor(goal),
    });
    return () => glide.current?.stop();
    // placeCursor writes through refs; the cursor moves when its goal does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, selected, motionSafe]);

  const nearest = (x: number) =>
    n <= 1 ? 0 : clamp(Math.round(((x - x0) / (x1 - x0)) * (n - 1)), 0, n - 1);
  const localX = (clientX: number) =>
    clientX - (node?.getBoundingClientRect().left ?? 0);

  const scrub = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      dragging.current = true;
      glide.current?.stop();
    },
    onMove: ({ point }) => {
      // Measured against the plot on every move, not the page, so a panel
      // that scrolls under the finger cannot pull the cursor off it.
      const x = rubberClamp(localX(point.x), x0, x1, 40);
      dragX.current = x;
      placeCursor(x);
      const i = nearest(x);
      if (i !== selected) onSelect(i, false);
    },
    onEnd: ({ point, velocity }) => {
      dragging.current = false;
      const x = rubberClamp(localX(point.x), x0, x1, 40);
      // A flick commits to the week it was heading for, not the one under it.
      const landing = nearest(project(x, velocity.x, 0.99));
      cursorX.current = x;
      releaseVelocity.current = clamp(velocity.x, -4000, 4000);
      if (landing === selected) {
        // No re-render is coming: settle onto the week from here.
        const v = releaseVelocity.current;
        releaseVelocity.current = 0;
        glide.current = animate(x, xAt(landing), {
          ...(motionSafe ? springs.snap : { duration: 0 }),
          velocity: v,
          onUpdate: placeCursor,
        });
      }
      onSelect(landing, true);
    },
    onCancel: () => {
      dragging.current = false;
      placeCursor(xAt(selected));
    },
    onTap: (event) => onSelect(nearest(localX(event.clientX)), true),
  });

  /* ---------------------------- the target ----------------------------- */

  const handleStart = React.useRef(0);
  const refusal = React.useRef(0);
  React.useEffect(() => () => cancelAnimationFrame(refusal.current), []);
  const step = stepFor(baseTarget);
  const tMin = Math.max(step, roundTo(scale.min, step));
  const tMax = roundTo(scale.max, step);

  /** Carries the band from wherever it was left back onto the target it has. */
  const settleBand = () => {
    morph.current?.stop();
    const from = shown.current ?? geo;
    if (handleText.current) handleText.current.textContent = formatEach(target);
    morph.current = animate(0, 1, {
      ...(motionSafe ? springs.snap : { duration: 0 }),
      onUpdate: (t) => {
        const g = lerpGeo(from, geo, t);
        shown.current = g;
        placeBand(g);
      },
      onComplete: () => draw(geo),
    });
  };

  const setTarget = (value: number, velocity = 0) => {
    const v = clamp(roundTo(value, step), tMin, tMax);
    if (Math.abs(v - target) < step / 2) {
      settleBand();
      return;
    }
    nextMorph.current = { spring: springs.snap, velocity };
    const key = lastKey.current;
    onTarget(v);
    // A controlled host may refuse the value: if nothing re-rendered by the
    // next frame, the band goes home instead of staying where it was let go.
    cancelAnimationFrame(refusal.current);
    refusal.current = requestAnimationFrame(() => {
      if (lastKey.current === key) {
        nextMorph.current = null;
        settleBand();
      }
    });
  };

  const bandAt = (y: number): Geo => {
    const v = valueAt(clamp(y, PAD_T, H - PAD_B));
    const g = shown.current ?? geo;
    return {
      ...g,
      target: y,
      lo: y + yAt(v * (1 + tolerance)) - yAt(v),
      hi: y + yAt(v * (1 - tolerance)) - yAt(v),
    };
  };

  const bandDrag = useDrag({
    axis: "y",
    threshold: 3,
    disabled,
    onStart: () => {
      morph.current?.stop();
      handleStart.current = (shown.current ?? geo).target;
    },
    onMove: ({ offset }) => {
      // 1:1 under the finger, with give past the top and bottom of the plot.
      const y = rubberClamp(
        handleStart.current + offset.y,
        PAD_T,
        H - PAD_B,
        30,
      );
      const next = bandAt(y);
      shown.current = next;
      placeBand(next);
      if (handleText.current)
        handleText.current.textContent = formatEach(
          clamp(roundTo(valueAt(y), step), tMin, tMax),
        );
    },
    onEnd: ({ offset, velocity }) => {
      const y = rubberClamp(
        handleStart.current + offset.y,
        PAD_T,
        H - PAD_B,
        30,
      );
      const landing = clamp(project(y, velocity.y, 0.99), PAD_T, H - PAD_B);
      const v = clamp(roundTo(valueAt(landing), step), tMin, tMax);
      const travel = yAt(v) - y;
      // The spring runs on progress, so the throw is handed over in its units.
      const pv =
        Math.abs(travel) > 0.5 ? clamp(velocity.y / travel, -20, 20) : 0;
      setTarget(v, pv);
    },
    onCancel: () => settleBand(),
  });

  const dims = { w: W, h: H };
  const anyOn = values.some((v) => v !== null);
  const path = paths(geo);
  const patternId = `uc-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-hatch`;
  const lineStroke = "var(--uc-ink)";

  return (
    <div ref={setNode} className="relative h-full w-full" data-uc-plot="">
      <svg
        aria-hidden
        width={dims.w}
        height={dims.h}
        className="absolute inset-0 block"
      >
        <defs>
          <pattern
            id={patternId}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="var(--uc-soft)"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={x0}
              x2={x1}
              y1={r2(yAt(t))}
              y2={r2(yAt(t))}
              className="stroke-hairline"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <text
              x={0}
              y={r2(yAt(t) + 3)}
              className="fill-ink-3 font-mono text-[9.5px] tabular-nums"
            >
              {formatEach(t)}
            </text>
          </g>
        ))}
        <rect
          ref={bandEl}
          x={x0}
          width={Math.max(0, x1 - x0)}
          y={r2(geo.lo)}
          height={r2(Math.max(0, geo.hi - geo.lo))}
          fill={
            bandStyle === "shade"
              ? "var(--uc-wash)"
              : bandStyle === "hatch"
                ? `url(#${patternId})`
                : "transparent"
          }
          opacity={bandStyle === "hatch" ? 0.7 : 1}
        />
        {[geo.lo, geo.hi].map((y, i) => (
          <line
            key={i}
            ref={(el) => {
              edgeEls.current[i] = el;
            }}
            x1={x0}
            x2={x1}
            y1={r2(y)}
            y2={r2(y)}
            stroke="var(--uc-soft)"
            strokeWidth={1}
            strokeDasharray={bandStyle === "rules" ? "4 3" : undefined}
            opacity={bandStyle === "shade" ? 0 : 1}
          />
        ))}
        <line
          ref={targetEl}
          x1={x0}
          x2={x1}
          y1={r2(geo.target)}
          y2={r2(geo.target)}
          stroke="var(--uc-ink)"
          strokeWidth={1}
          strokeDasharray={bandStyle === "hatch" ? "2 3" : undefined}
          opacity={bandStyle === "rules" ? 0.9 : 0.55}
        />
        <path ref={areaEl} d={path.area} fill="var(--uc-wash)" opacity={0.7} />
        <path
          ref={lineEl}
          d={path.line}
          fill="none"
          stroke={lineStroke}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          ref={tailEl}
          d={path.tail}
          fill="none"
          stroke={lineStroke}
          strokeWidth={1.75}
          strokeDasharray="3 3"
          strokeLinecap="round"
        />
        <line
          ref={ruleEl}
          x1={r2(goal)}
          x2={r2(goal)}
          y1={PAD_T - 4}
          y2={H - PAD_B}
          className="stroke-hairline-strong"
          strokeWidth={1}
        />
        {geo.pts.map((p, i) => (
          <circle
            key={i}
            ref={(el) => {
              if (el) dotEls.current.set(i, el);
              else dotEls.current.delete(i);
            }}
            cx={r2(p.x)}
            cy={r2(p.y)}
            r={hollow[i] ? 2.75 : 2.25}
            className={cn(
              hollow[i] ? "fill-card" : "fill-[var(--uc-ink)]",
              !p.on && "opacity-0",
            )}
            stroke="var(--uc-ink)"
            strokeWidth={hollow[i] ? 1.25 : 0}
          />
        ))}
        <circle
          ref={cursorDot}
          cx={r2(goal)}
          cy={r2(yOnLine(geo, goal))}
          r={4.5}
          className={cn("fill-card", !anyOn && "opacity-0")}
          stroke="var(--uc-ink)"
          strokeWidth={2}
        />
      </svg>
      {!anyOn ? (
        <p
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-center text-[12px] text-ink-3"
          style={{ left: x0, width: Math.max(0, x1 - x0) }}
        >
          Nothing to divide yet
        </p>
      ) : null}

      {/* x labels: the ends, and the chosen week riding the cursor over them */}
      <span
        aria-hidden
        className="absolute bottom-0 font-mono text-[9.5px] leading-4 text-ink-3"
        style={{ left: x0 - 4 }}
      >
        {labels[0]}
      </span>
      <span
        aria-hidden
        className="absolute bottom-0 font-mono text-[9.5px] leading-4 text-ink-3"
        style={{ right: PAD_R - 4 }}
      >
        {labels[labels.length - 1]}
      </span>
      <span
        ref={cursorLabel}
        aria-hidden
        className="absolute bottom-0 left-0 rounded-1 bg-card px-1 font-mono text-[9.5px] leading-4 font-medium text-foreground"
        style={{
          transform: `translateX(${r2(clamp(goal, x0 + 18, x1 - 18))}px) translateX(-50%)`,
        }}
      >
        {labels[selected]}
      </span>

      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Week"
        aria-valuemin={1}
        aria-valuemax={Math.max(1, n)}
        aria-valuenow={selected + 1}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (disabled) return;
          let next = selected;
          if (event.key === "ArrowRight" || event.key === "ArrowUp")
            next = selected + 1;
          else if (event.key === "ArrowLeft" || event.key === "ArrowDown")
            next = selected - 1;
          else if (event.key === "PageUp") next = selected + 4;
          else if (event.key === "PageDown") next = selected - 4;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = n - 1;
          else return;
          event.preventDefault();
          onSelect(clamp(next, 0, n - 1), true);
        }}
        {...scrub}
        className={cn(
          "absolute top-0 bottom-0 left-0 cursor-col-resize touch-pan-y rounded-2 select-none",
          disabled && "cursor-default",
          FOCUS,
        )}
        style={{ right: PAD_R - 2 }}
      />

      <div
        ref={handleEl}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Target cost a ${unit}`}
        aria-orientation="vertical"
        aria-valuemin={tMin}
        aria-valuemax={tMax}
        aria-valuenow={target}
        aria-valuetext={`${formatEach(target)} a ${unit}`}
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          if (disabled) return;
          let next = target;
          if (event.key === "ArrowUp") next = target + step;
          else if (event.key === "ArrowDown") next = target - step;
          else if (event.key === "PageUp") next = target + step * 10;
          else if (event.key === "PageDown") next = target - step * 10;
          else if (event.key === "Home") next = tMin;
          else if (event.key === "End") next = tMax;
          else return;
          event.preventDefault();
          setTarget(next);
        }}
        {...bandDrag}
        className={cn(
          "absolute top-0 flex h-[22px] cursor-row-resize touch-pan-x items-center gap-1 rounded-full border border-[var(--uc-soft)] bg-card pr-2 pl-1.5 select-none",
          "shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_10%,transparent)]",
          disabled && "cursor-default",
          FOCUS,
        )}
        style={{
          left: x1 + 6,
          transform: `translateY(${r2(geo.target - 11)}px)`,
        }}
      >
        <ChevronsUpDown
          aria-hidden
          className="size-3 shrink-0 text-[var(--uc-ink)]"
        />
        <span
          ref={handleText}
          className="font-mono text-[10px] leading-none font-medium text-[var(--uc-ink)] tabular-nums"
        >
          {formatEach(target)}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * What a finished piece of work costs in AI: the period's spend over the
 * outcomes it produced, drawn as a real fraction with the quotient beside it
 * and read against a target, above (or beside) a trend of cost per outcome
 * with its target band shaded.
 *
 * The fraction is the moment it is built for. When the period or the outcome
 * changes, numerator and denominator roll independently — each changed
 * digit's strip travels to its new face on `snap`, the denominator a beat
 * after the numerator — while unchanged digits hold still and a number that
 * gains a place grows a column on `glide`. The quotient cross-fades in once
 * both have landed. The trend is the period picker: drag along it and the
 * cursor follows 1:1, picking the nearest week as it passes, then settles on
 * `snap` with the release velocity; a change of outcome morphs the whole
 * line on `glide`. The target line carries a handle: drag it to set a new
 * target, and it commits to the cent on `snap`.
 *
 * Outcomes are a radiogroup; the trend and the target are sliders with arrow
 * keys; the trend also reads as a table. Below a 40rem container the
 * fraction stacks over the chart. Under reduced motion digits swap, shapes
 * jump to their new place and nothing travels; the numbers still change.
 */
export function UnitCost({
  outcomes = defaultUnitCostOutcomes,
  usages = defaultUnitCostUsages,
  periods = defaultUnitCostPeriods,
  mapping = defaultUnitCostMapping,
  outcome: outcomeProp,
  defaultOutcome,
  onOutcomeChange,
  period: periodProp,
  defaultPeriod,
  onPeriodChange,
  targets: targetsProp,
  onSetTarget,
  onMapUsage,
  minOutcomes = 40,
  defaultView = "chart",
  status = "ready",
  onRetry,
  title = "Gaugeworks · support assistant",
  subtitle = "AI spend per finished outcome",
  formatMoney = dollars,
  fractionStyle = "stacked",
  bandStyle = "shade",
  accent = "cobalt",
  disabled = false,
  className,
}: UnitCostProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const panelId = `${uid}-panel`;

  /* ------------------------------- state ------------------------------- */

  const [ownOutcome, setOwnOutcome] = React.useState(
    defaultOutcome ?? outcomes[0]?.id ?? "",
  );
  const outcomeId = outcomeProp ?? ownOutcome;
  const outcome =
    outcomes.find((o) => o.id === outcomeId) ?? outcomes[0] ?? null;

  const [ownPeriod, setOwnPeriod] = React.useState(
    defaultPeriod ?? periods[periods.length - 1]?.id ?? "",
  );
  const periodId = periodProp ?? ownPeriod;
  const foundIndex = periods.findIndex((p) => p.id === periodId);
  const index = foundIndex >= 0 ? foundIndex : Math.max(0, periods.length - 1);
  const period = periods[index] ?? null;

  const [ownTargets, setOwnTargets] = React.useState<Record<string, number>>(
    {},
  );
  const targets = targetsProp ?? ownTargets;
  const target = outcome ? (targets[outcome.id] ?? outcome.target) : 0;
  const tolerance = outcome?.tolerance ?? 0.15;

  const [ownView, setOwnView] = React.useState<UnitCostView>(defaultView);
  const view = ownView;

  const [announcement, setAnnouncement] = React.useState("");

  /* ------------------------------ readings ----------------------------- */

  const known = React.useMemo(
    () => new Set(outcomes.map((o) => o.id)),
    [outcomes],
  );
  const mappedTo = React.useCallback(
    (id: string) => usages.filter((u) => mapping[u.id] === id).map((u) => u.id),
    [usages, mapping],
  );
  const unmappedIds = React.useMemo(
    () =>
      usages
        .filter((u) => {
          const to = mapping[u.id];
          return !to || !known.has(to);
        })
        .map((u) => u.id),
    [usages, mapping, known],
  );

  const readingOf = React.useCallback(
    (p: UnitCostPeriod, o: UnitCostOutcome): Reading => {
      const ids = mappedTo(o.id);
      const spend = ids.reduce((s, id) => s + Math.max(0, p.spend[id] ?? 0), 0);
      const count = Math.max(0, Math.round(p.outcomes[o.id] ?? 0));
      return {
        spend,
        count,
        mapped: ids.length > 0,
        each: ids.length > 0 && count > 0 ? spend / count : null,
      };
    },
    [mappedTo],
  );

  const series = React.useMemo(
    () => (outcome ? periods.map((p) => readingOf(p, outcome)) : []),
    [periods, outcome, readingOf],
  );
  const reading = series[index] ?? null;
  const unmappedNames = usages
    .filter((u) => unmappedIds.includes(u.id))
    .map((u) => u.name)
    .join(", ");
  const unmapped = period
    ? unmappedIds.reduce((s, id) => s + Math.max(0, period.spend[id] ?? 0), 0)
    : 0;
  const tooFew =
    !!reading &&
    reading.mapped &&
    reading.count > 0 &&
    reading.count < minOutcomes;
  const verdict =
    reading?.each != null && outcome
      ? verdictOf(reading.each, target, tolerance)
      : null;

  const each = (v: number) => formatMoney(v, "each");
  const total = (v: number) => formatMoney(v, "total");

  const sentence = (
    p: UnitCostPeriod | null,
    o: UnitCostOutcome | null,
    t: number,
  ) => {
    if (!p || !o) return "";
    const r = readingOf(p, o);
    if (!r.mapped)
      return `Week of ${p.label}: no usage is mapped to ${o.label}.`;
    if (r.count === 0 || r.each === null)
      return `Week of ${p.label}: ${total(r.spend)} and no ${o.label}.`;
    const v = verdictOf(r.each, t, o.tolerance ?? 0.15);
    return `Week of ${p.label}: ${total(r.spend)} over ${plural(r.count, o.unit, o.label)}, ${each(r.each)} a ${o.unit}, ${v.tone === "good" ? "in the target band" : v.text.toLowerCase()}${r.count < minOutcomes ? ", too few to trust" : ""}.`;
  };

  /* ---------------------------- interactions --------------------------- */

  const selectPeriod = (i: number, settled: boolean) => {
    const p = periods[i];
    if (disabled || !p) return;
    if (p.id !== period?.id) {
      if (periodProp === undefined) setOwnPeriod(p.id);
      onPeriodChange?.(p.id, p);
    }
    // A drag speaks once, where it lands, not for every week it passes.
    if (settled) setAnnouncement(sentence(p, outcome, target));
  };

  const selectOutcome = (o: UnitCostOutcome) => {
    if (disabled || o.id === outcome?.id) return;
    if (outcomeProp === undefined) setOwnOutcome(o.id);
    onOutcomeChange?.(o.id, o);
    setAnnouncement(sentence(period, o, targets[o.id] ?? o.target));
  };

  const commitTarget = (value: number) => {
    if (disabled || !outcome || value === target) return;
    if (targetsProp === undefined)
      setOwnTargets((t) => ({ ...t, [outcome.id]: value }));
    onSetTarget?.(outcome.id, value);
    setAnnouncement(`Target ${each(value)} a ${outcome.unit}.`);
  };

  const selectView = (v: UnitCostView) => {
    if (v === view) return;
    setOwnView(v);
    setAnnouncement(
      v === "table"
        ? "Showing the trend as a table."
        : "Showing the trend as a chart.",
    );
  };

  const radios = React.useRef(new Map<string, HTMLButtonElement>());

  /* ------------------------------- header ------------------------------ */

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        aria-hidden
        className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--uc-wash)] text-[var(--uc-ink)] @[30rem]:inline-flex"
      >
        <Divide className="size-4" />
      </span>
      <div className="order-1 min-w-0 flex-1">
        <p
          id={titleId}
          title={title}
          className="truncate text-[14px] leading-5 font-semibold"
        >
          {title}
        </p>
        <p className="truncate text-[11.5px] leading-4 text-ink-3">
          {subtitle}
        </p>
      </div>
      {outcomes.length > 0 ? (
        <div
          role="radiogroup"
          aria-label="Outcome"
          aria-disabled={disabled || undefined}
          className="order-3 flex h-8 basis-full gap-0.5 rounded-2 border border-hairline bg-surface-1 p-0.5 @[40rem]:order-2 @[40rem]:basis-auto"
          onKeyDown={(event) => {
            const at = outcomes.findIndex((o) => o.id === outcome?.id);
            let next = -1;
            if (event.key === "ArrowRight" || event.key === "ArrowDown")
              next = (at + 1) % outcomes.length;
            else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
              next = (at - 1 + outcomes.length) % outcomes.length;
            else if (event.key === "Home") next = 0;
            else if (event.key === "End") next = outcomes.length - 1;
            else return;
            event.preventDefault();
            const o = outcomes[next];
            if (!o) return;
            selectOutcome(o);
            radios.current.get(o.id)?.focus();
          }}
        >
          {outcomes.map((o) => {
            const on = o.id === outcome?.id;
            return (
              <button
                key={o.id}
                ref={(el) => {
                  if (el) radios.current.set(o.id, el);
                  else radios.current.delete(o.id);
                }}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={o.label}
                tabIndex={on ? 0 : -1}
                onClick={() => selectOutcome(o)}
                className={cn(
                  "relative inline-flex h-full flex-1 items-center justify-center rounded-[calc(var(--radius-2)-2px)] px-2.5 text-[12px] font-medium transition-colors @[40rem]:flex-none",
                  on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                  disabled && "cursor-not-allowed",
                  FOCUS,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-outcome`}
                    aria-hidden
                    className="absolute inset-0 rounded-[calc(var(--radius-2)-2px)] border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_8%,transparent)]"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative">{o.short ?? o.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="order-2 flex shrink-0 gap-0.5 @[40rem]:order-3">
        {(["chart", "table"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            aria-controls={panelId}
            aria-label={v === "chart" ? "Show as chart" : "Show as table"}
            title={v === "chart" ? "Chart" : "Table"}
            onClick={() => selectView(v)}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-2 border transition-colors",
              view === v
                ? "border-[var(--uc-soft)] bg-[var(--uc-wash)] text-[var(--uc-ink)]"
                : "border-transparent text-ink-3 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {v === "chart" ? (
              <ChartLine aria-hidden className="size-4" />
            ) : (
              <Table2 aria-hidden className="size-4" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  /* ------------------------------ fraction ----------------------------- */

  const numer = reading?.mapped ? total(reading.spend) : "—";
  const denom = reading ? commas(reading.count) : "0";
  const quotient =
    reading?.each != null && outcome ? `${each(reading.each)}` : null;
  const outLabel = outcome?.label ?? "";

  const bigType = {
    fontSize: fractionStyle === "ratio" ? 24 : 26,
    lineHeight: 1.15,
  };

  const fraction = (
    <div aria-hidden className="flex flex-col items-start gap-1">
      {fractionStyle === "stacked" ? (
        <div className="inline-grid justify-items-center font-mono font-medium tracking-tight">
          <Odometer
            text={numer}
            delay={0}
            motionSafe={motionSafe}
            className="text-foreground"
          />
          <span className="-mx-1.5 my-1 block h-[1.5px] justify-self-stretch rounded-full bg-foreground/70" />
          <Odometer
            text={denom}
            delay={0.07}
            motionSafe={motionSafe}
            className="text-ink-2"
          />
        </div>
      ) : fractionStyle === "slashed" ? (
        <div className="relative flex items-stretch font-mono font-medium tracking-tight">
          <span className="self-start pb-5">
            <Odometer
              text={numer}
              delay={0}
              motionSafe={motionSafe}
              className="text-foreground"
            />
          </span>
          <svg
            width="18"
            viewBox="0 0 18 60"
            preserveAspectRatio="none"
            className="mx-0.5 block shrink-0 self-stretch"
          >
            <line
              x1="15"
              y1="4"
              x2="3"
              y2="56"
              className="stroke-ink-3"
              strokeWidth="1.5"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <span className="self-end pt-5">
            <Odometer
              text={denom}
              delay={0.07}
              motionSafe={motionSafe}
              className="text-ink-2"
            />
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 font-mono font-medium tracking-tight">
          <Odometer
            text={numer}
            delay={0}
            motionSafe={motionSafe}
            className="text-foreground"
          />
          <span className="text-ink-3">÷</span>
          <Odometer
            text={denom}
            delay={0.07}
            motionSafe={motionSafe}
            className="text-ink-2"
          />
        </div>
      )}
      <span className="text-[11.5px] leading-4 text-ink-3">
        {`AI spend ÷ ${outLabel}`}
      </span>
    </div>
  );

  const quotientRow = (
    <div className="grid" aria-hidden>
      <AnimatePresence initial={false}>
        <motion.p
          key={`${quotient ?? "none"}|${outcome?.id ?? ""}|${verdict?.text ?? ""}`}
          className="col-start-1 row-start-1 flex flex-wrap items-center gap-x-2 gap-y-1"
          initial={{ opacity: 0, y: motionSafe ? 4 : 0 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              opacity: {
                duration: durations.base,
                ease: easings.enter,
                // Lands once both numbers have: the answer follows the sum.
                delay: motionSafe ? 0.22 : 0,
              },
              y: motionSafe
                ? { ...springs.snap, delay: 0.22 }
                : { duration: 0 },
            },
          }}
          exit={{
            opacity: 0,
            transition: { duration: durations.fast, ease: easings.exit },
          }}
        >
          {quotient ? (
            <>
              <span className="text-[15px] leading-6 text-foreground">
                <span className="text-ink-3">= </span>
                <span className="font-mono font-semibold tabular-nums">
                  {quotient}
                </span>
                <span className="text-ink-2">{` a ${outcome?.unit ?? ""}`}</span>
              </span>
              {verdict ? (
                <span
                  className={cn(
                    "inline-flex h-6 items-center rounded-full border px-2 text-[11px] font-medium",
                    VERDICT_CLASS[verdict.tone],
                  )}
                >
                  {verdict.text}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[12.5px] leading-6 text-ink-3">
              {reading && !reading.mapped
                ? `No usage is mapped to ${outLabel} yet.`
                : `No ${outLabel} this week.`}
            </span>
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );

  const notes = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {tooFew ? (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] leading-4 text-warn">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full border border-current"
          />
          {`Only ${commas(reading?.count ?? 0)} · too few to trust`}
        </span>
      ) : null}
      {unmapped > 0 ? (
        onMapUsage ? (
          <button
            type="button"
            onClick={() => onMapUsage(unmappedIds)}
            disabled={disabled}
            aria-label={`${total(unmapped)} unmapped: ${unmappedNames} this week isn’t tied to an outcome. Map usage.`}
            title={`Not tied to an outcome: ${unmappedNames}`}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-1 text-[11.5px] leading-4 text-ink-3 underline decoration-hairline-strong underline-offset-2 transition-colors hover:text-foreground disabled:cursor-not-allowed",
              FOCUS,
            )}
          >
            <Link2 aria-hidden className="size-3.5 shrink-0" />
            {`${total(unmapped)} unmapped`}
          </button>
        ) : (
          <span
            title={`Not tied to an outcome: ${unmappedNames}`}
            className="inline-flex h-6 items-center gap-1 text-[11.5px] leading-4 text-ink-3"
          >
            <Link2 aria-hidden className="size-3.5 shrink-0" />
            {`${total(unmapped)} unmapped`}
            <span className="sr-only">{`: ${unmappedNames}`}</span>
          </span>
        )
      ) : null}
    </div>
  );

  /* ------------------------------- trend ------------------------------- */

  const trend = outcome ? (
    <Trend
      values={series.map((r) => r.each)}
      hollow={series.map((r) => r.count > 0 && r.count < minOutcomes)}
      labels={periods.map((p) => p.label)}
      partial={!!periods[periods.length - 1]?.partial}
      selected={index}
      onSelect={selectPeriod}
      target={target}
      tolerance={tolerance}
      baseTarget={outcome.target}
      onTarget={commitTarget}
      morphKey={`${outcome.id}|${target}`}
      formatEach={each}
      valueText={sentence(period, outcome, target)}
      unit={outcome.unit}
      bandStyle={bandStyle}
      motionSafe={motionSafe}
      disabled={disabled}
      uid={uid}
    />
  ) : null;

  const table = outcome ? (
    <div className="h-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-2 border border-hairline">
      <table className="w-full border-collapse text-[11.5px]">
        <caption className="sr-only">
          {`Cost per ${outcome.unit}, week by week`}
        </caption>
        <thead className="sticky top-0 bg-surface-1 text-ink-3">
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium">
              Week
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Spend
            </th>
            <th
              scope="col"
              className="hidden px-2 py-1 text-right font-medium @[30rem]:table-cell"
            >
              {outcome.short ?? outcome.label}
            </th>
            <th scope="col" className="px-2 py-1 text-right font-medium">
              Each
            </th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums">
          {periods.map((p, i) => {
            const r = series[i];
            const on = i === index;
            return (
              <tr
                key={p.id}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "border-t border-hairline",
                  on && "bg-[var(--uc-wash)]",
                )}
              >
                <th scope="row" className="px-2 py-0 text-left font-normal">
                  <button
                    type="button"
                    onClick={() => selectPeriod(i, true)}
                    disabled={disabled}
                    className={cn(
                      "h-6 rounded-1 font-sans text-[11.5px] whitespace-nowrap",
                      on ? "font-medium text-foreground" : "text-ink-2",
                      FOCUS,
                    )}
                  >
                    {`${p.label}${p.partial ? " ·" : ""}`}
                    {p.partial ? (
                      <span className="sr-only"> (still running)</span>
                    ) : null}
                  </button>
                </th>
                <td className="px-2 text-right text-ink-2">
                  {r?.mapped ? total(r.spend) : "—"}
                </td>
                <td className="hidden px-2 text-right text-ink-2 @[30rem]:table-cell">
                  {commas(r?.count ?? 0)}
                </td>
                <td
                  className={cn(
                    "px-2 text-right",
                    r && r.count > 0 && r.count < minOutcomes
                      ? "text-warn"
                      : "text-foreground",
                  )}
                >
                  {r?.each != null ? each(r.each) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  ) : null;

  /* -------------------------------- body ------------------------------- */

  let body: React.ReactNode;
  if (status === "loading") {
    body = (
      <div
        aria-hidden
        className="flex flex-col gap-3 @[40rem]:h-[150px] @[40rem]:flex-row"
      >
        <div className="flex w-40 flex-col gap-2 pt-1">
          <span className="h-7 w-24 rounded-1 bg-surface-2" />
          <span className="h-px w-28 bg-hairline" />
          <span className="h-7 w-20 rounded-1 bg-surface-2" />
          <span className="h-3 w-32 rounded-1 bg-surface-2" />
        </div>
        <div className="h-[104px] flex-1 rounded-2 bg-surface-1 @[40rem]:h-auto" />
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="flex flex-col items-start gap-2 py-4">
        <p className="inline-flex items-center gap-1.5 text-[13px] text-danger">
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          Usage couldn’t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={() => onRetry()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    );
  } else if (!outcome || !period) {
    body = (
      <p className="py-4 text-[13px] text-ink-3">
        Nothing to divide yet: add an outcome and a period.
      </p>
    );
  } else {
    body = (
      <div
        id={panelId}
        className="flex flex-col gap-3 @[40rem]:flex-row @[40rem]:items-stretch"
      >
        <div className="flex shrink-0 flex-col gap-1.5 @[40rem]:w-[15.5rem]">
          <div style={bigType}>{fraction}</div>
          {quotientRow}
          {notes}
          <p className="sr-only">{sentence(period, outcome, target)}</p>
        </div>
        <div className="relative h-[112px] min-w-0 @[40rem]:h-[140px] @[40rem]:flex-1">
          <div className="absolute inset-0 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
            <AnimatePresence initial={false}>
              <motion.div
                key={view}
                className="col-start-1 row-start-1 min-w-0"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: durations.base, ease: easings.enter },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: durations.fast, ease: easings.exit },
                }}
              >
                {view === "chart" ? trend : table}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <div className="flex flex-col gap-2.5 p-3">
        {header}
        {body}
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
