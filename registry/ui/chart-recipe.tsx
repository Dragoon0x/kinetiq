"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Check, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";

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
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type RecipeSeries = {
  /** Matches a filter's id, so a filter can thin it. */
  id: string;
  label: string;
  /** One value per point on the x axis. */
  values: number[];
};

export type RecipeSource = {
  id: string;
  label: string;
  /** Printed on the y axis: "kPa", "ML", "%". */
  unit: string;
  /** One short line under the label. */
  note: string;
  /** The x axis labels, oldest first. */
  x: string[];
  /** Inline data; leave it out and pass `loadSource` to fetch it. */
  series?: RecipeSeries[];
  /** A target value for the target band note. */
  target?: number;
};

export type RecipeChartKind = "line" | "area" | "bars" | "steps";
export type RecipeChartType = {
  id: RecipeChartKind;
  label: string;
  note: string;
};
export type RecipeFilter = { id: string; label: string };
export type RecipeWindow = { id: string; label: string; points: number };
export type RecipeAnnotationKind = "peak" | "average" | "target" | "last";
export type RecipeAnnotation = {
  id: RecipeAnnotationKind;
  label: string;
  note: string;
};

/** The recipe the wizard holds. */
export type ChartRecipeValue = {
  source: string | null;
  chartType: RecipeChartKind | null;
  /** Series that stay full; the rest are thinned. */
  series: string[];
  window: string;
  annotations: RecipeAnnotationKind[];
  name: string;
};

export type ChartRecipeResult = ChartRecipeValue & {
  source: string;
  chartType: RecipeChartKind;
};

export type ChartRecipePreviewStyle = "paper" | "grid" | "blueprint";
export type ChartRecipeDensity = "compact" | "cozy" | "roomy";
export type ChartRecipePalette = "cobalt" | "earth" | "mono" | "spectrum";
export type ChartRecipeStatus = "ready" | "loading" | "error";

export type ChartRecipeProps = {
  /** The data sources offered on the first step. @default defaultRecipeSources */
  sources?: RecipeSource[];
  /** The chart types offered on the second step. @default defaultRecipeChartTypes */
  chartTypes?: RecipeChartType[];
  /** Series toggles on the third step; ids match the sources' series. @default defaultRecipeFilters */
  filters?: RecipeFilter[];
  /** Time windows on the third step: the last N points. @default defaultRecipeWindows */
  windows?: RecipeWindow[];
  /** Notes offered on the last step. @default defaultRecipeAnnotations */
  annotations?: RecipeAnnotation[];
  /** Controlled recipe. */
  value?: ChartRecipeValue;
  /** Initial recipe when uncontrolled; missing fields take their defaults. */
  defaultValue?: Partial<ChartRecipeValue>;
  /** Fires from the choice that changed the recipe. */
  onValueChange?: (value: ChartRecipeValue) => void;
  /** Controlled step, 0 to 3. */
  step?: number;
  /** Initial step when uncontrolled. @default 0 */
  defaultStep?: number;
  /** Fires from the tab, arrow key, Next or Back that changed the step. */
  onStepChange?: (
    step: number,
    id: "source" | "chart" | "filters" | "notes",
  ) => void;
  /** Fetches a source's series; while it runs the preview shows a layer skeleton. Return the series or a promise of them. */
  loadSource?: (
    source: RecipeSource,
  ) => RecipeSeries[] | Promise<RecipeSeries[]>;
  /** Create was pressed on the last step. */
  onCreate?: (recipe: ChartRecipeResult) => void;
  /** Cancel was pressed on the first step. */
  onCancel?: () => void;
  /** The preview's paper: clean, dotted graph paper, or a tinted blueprint. @default "paper" */
  previewStyle?: ChartRecipePreviewStyle;
  /** Option heights and spacing. @default "cozy" */
  density?: ChartRecipeDensity;
  /** The series colours. @default "cobalt" */
  palette?: ChartRecipePalette;
  /** The wizard's heading. @default "New report" */
  title?: string;
  /** One line under the heading. @default "Gaugeworks · Harbour line" */
  subtitle?: string;
  /** Whether the sources have loaded. @default "ready" */
  status?: ChartRecipeStatus;
  /** Try again was pressed after the sources failed to load. */
  onReload?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MONTHS = [
  "Nov",
  "Dec",
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
];

/** A small seeded generator, so every server and browser draws the same data. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SITES: RecipeFilter[] = [
  { id: "north", label: "North basin" },
  { id: "quay", label: "Quay pumps" },
  { id: "weir", label: "Weir station" },
  { id: "lock", label: "Lock 3" },
];

function makeSeries(
  seed: number,
  base: number,
  swing: number,
  noise: number,
  digits: number,
) {
  return SITES.map((site, s) => {
    const rnd = seeded(seed + s * 97);
    const offset = (rnd() - 0.5) * swing * 0.8;
    const phase = rnd() * Math.PI * 2;
    const values = MONTHS.map((_, i) => {
      const season = Math.sin(i / 1.9 + phase) * swing * 0.5;
      const v = base + offset + season + (rnd() - 0.5) * noise;
      const k = 10 ** digits;
      return Math.round(v * k) / k;
    });
    return { id: site.id, label: site.label, values };
  });
}

export const defaultRecipeFilters: RecipeFilter[] = SITES;

export const defaultRecipeSources: RecipeSource[] = [
  {
    id: "pressure",
    label: "Pump pressure",
    unit: "kPa",
    note: "Monthly mean at each station",
    x: MONTHS,
    series: makeSeries(11, 418, 46, 14, 0),
    target: 420,
  },
  {
    id: "water",
    label: "Water drawn",
    unit: "ML",
    note: "Megalitres pumped per month",
    x: MONTHS,
    series: makeSeries(23, 38, 22, 6, 1),
    target: 45,
  },
  {
    id: "uptime",
    label: "Sensor uptime",
    unit: "%",
    note: "Share of minutes reporting",
    x: MONTHS,
    series: makeSeries(37, 98.4, 2.2, 0.9, 1).map((s) => ({
      ...s,
      values: s.values.map((v) => Math.min(100, v)),
    })),
    target: 99,
  },
];

export const defaultRecipeChartTypes: RecipeChartType[] = [
  { id: "line", label: "Line", note: "Trends over time" },
  { id: "area", label: "Area", note: "Volume under the curve" },
  { id: "bars", label: "Bars", note: "Compare month by month" },
  { id: "steps", label: "Steps", note: "Level changes" },
];

export const defaultRecipeWindows: RecipeWindow[] = [
  { id: "12", label: "12 mo", points: 12 },
  { id: "6", label: "6 mo", points: 6 },
  { id: "3", label: "3 mo", points: 3 },
];

export const defaultRecipeAnnotations: RecipeAnnotation[] = [
  { id: "peak", label: "Mark the peak", note: "A pin on the highest point" },
  { id: "average", label: "Average line", note: "Across the series shown" },
  { id: "target", label: "Target band", note: "The source's target" },
  { id: "last", label: "Label the last value", note: "Where things stand" },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const EMPTY_SERIES: RecipeSeries[] = [];

const STEPS = [
  { id: "source", label: "Source" },
  { id: "chart", label: "Chart" },
  { id: "filters", label: "Filters" },
  { id: "notes", label: "Notes" },
] as const;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const HAS_FOCUS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2";

const DENSITY: Record<
  ChartRecipeDensity,
  { card: string; gap: string; row: string; chip: string; section: string }
> = {
  compact: {
    card: "px-2.5 py-1.5",
    gap: "gap-1.5",
    row: "h-7",
    chip: "h-7",
    section: "gap-3",
  },
  cozy: {
    card: "px-3 py-2",
    gap: "gap-2",
    row: "h-8",
    chip: "h-8",
    section: "gap-4",
  },
  roomy: {
    card: "px-3.5 py-3",
    gap: "gap-2.5",
    row: "h-9",
    chip: "h-9",
    section: "gap-5",
  },
};

const PALETTES: Record<ChartRecipePalette, string[]> = {
  cobalt: [
    "var(--accent-bright)",
    "oklch(from var(--accent-bright) l c 200)",
    "oklch(from var(--accent-bright) l c 305)",
    "oklch(from var(--warn) l c h)",
  ],
  earth: [
    "oklch(from var(--warn) l 0.12 62)",
    "oklch(from var(--success) l 0.1 140)",
    "oklch(from var(--danger) l 0.14 35)",
    "oklch(from var(--accent-bright) l 0.08 235)",
  ],
  mono: [
    "var(--ink)",
    "var(--ink-2)",
    "var(--ink-3)",
    "color-mix(in oklab, var(--ink-3) 55%, transparent)",
  ],
  spectrum: [
    "oklch(from var(--accent-bright) l c 25)",
    "oklch(from var(--accent-bright) l c 95)",
    "oklch(from var(--accent-bright) l c 160)",
    "oklch(from var(--accent-bright) l c 265)",
  ],
};

/** Series classes, written out so the stylesheet sees every one. */
const S_FILL = [
  "fill-(--cr-s0)",
  "fill-(--cr-s1)",
  "fill-(--cr-s2)",
  "fill-(--cr-s3)",
];
const S_STROKE = [
  "stroke-(--cr-s0)",
  "stroke-(--cr-s1)",
  "stroke-(--cr-s2)",
  "stroke-(--cr-s3)",
];
const S_BG = ["bg-(--cr-s0)", "bg-(--cr-s1)", "bg-(--cr-s2)", "bg-(--cr-s3)"];
const sc = (list: string[], k: number) =>
  list[k % list.length] ?? list[0] ?? "";

/** Ticks a person would choose: steps of 1, 2, 2.5 or 5 times a power of ten. */
function niceScale(min: number, max: number, count = 4) {
  const span = Math.max(1e-6, max - min);
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step)
    ticks.push(Math.round(v * 1000) / 1000);
  return { lo, hi, ticks };
}

const fmt = (v: number) =>
  Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);

/* ----------------------------------------------------------------------- */
/*                                The preview                               */
/* ----------------------------------------------------------------------- */

type Layers = {
  axes: boolean;
  series: boolean;
  filters: boolean;
  notes: boolean;
};

/** Each layer's beat in the build (and, backwards, in the peel). */
const LAYER_ORDER: (keyof Layers)[] = ["axes", "series", "filters", "notes"];

function Preview({
  source,
  data,
  pending,
  failed,
  kind,
  include,
  windowPoints,
  notes,
  layers,
  delays,
  previewStyle,
  motionSafe,
  clipId,
}: {
  source: RecipeSource | null;
  data: RecipeSeries[];
  pending: boolean;
  failed: boolean;
  kind: RecipeChartKind | null;
  include: string[];
  windowPoints: number;
  notes: RecipeAnnotationKind[];
  layers: Layers;
  delays: Record<keyof Layers, number>;
  previewStyle: ChartRecipePreviewStyle;
  motionSafe: boolean;
  clipId: string;
}) {
  const [box, setBox] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState({ w: 420, h: 240 });
  React.useEffect(() => {
    if (!box) return;
    const ro = new ResizeObserver(() => {
      const r = box.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      if (w > 0 && h > 0)
        setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    });
    ro.observe(box);
    return () => ro.disconnect();
  }, [box]);

  const n = source?.x.length ?? 12;
  const W = size.w;
  const H = size.h;
  const padL = 38;
  const padR = 14;
  const padT = 22;
  const padB = 24;
  const plotW = Math.max(40, W - padL - padR);
  const plotH = Math.max(40, H - padT - padB);
  const all = data.flatMap((s) => s.values);
  const target = source?.target;
  const scale = niceScale(
    Math.min(...(all.length ? all : [0]), target ?? Infinity),
    Math.max(...(all.length ? all : [1]), target ?? -Infinity),
  );
  const yAt = (v: number) =>
    r2(padT + (1 - (v - scale.lo) / (scale.hi - scale.lo || 1)) * plotH);
  const N = Math.max(2, Math.min(n, windowPoints));
  const first = n - N;
  const bars = kind === "bars";
  // Points outside the window slide off to the left, behind the clip, so a
  // path keeps its shape and glides rather than snapping to a new count.
  const xAt = (i: number) =>
    bars
      ? r2(padL + ((i - first + 0.5) * plotW) / N)
      : r2(padL + ((i - first) * plotW) / (N - 1));
  const base = yAt(Math.max(scale.lo, Math.min(scale.hi, 0)));

  const glide = motionSafe ? springs.glide : { duration: durations.fast };
  const tween = (delay = 0) => ({
    duration: durations.base,
    ease: easings.enter,
    delay,
  });
  const filtering = layers.filters;
  const shown = (id: string) => !filtering || include.includes(id);

  const pathFor = (values: number[]) => {
    if (kind === "steps") {
      return values
        .map((v, i) => {
          const x = xAt(i);
          const y = yAt(v);
          if (i === 0) return `M ${x} ${y}`;
          const mid = r2((xAt(i - 1) + x) / 2);
          return `H ${mid} V ${y} H ${x}`;
        })
        .join(" ");
    }
    return values
      .map((v, i) => `${i ? "L" : "M"} ${xAt(i)} ${yAt(v)}`)
      .join(" ");
  };

  // Notes read the series as filtered and windowed.
  const visibleSeries = data.filter((s) => shown(s.id));
  const inWindow = visibleSeries.flatMap((s) =>
    s.values.slice(first).map((v, j) => ({ s, v, i: first + j })),
  );
  const peak = inWindow.reduce<(typeof inWindow)[number] | null>(
    (m, p) => (!m || p.v > m.v ? p : m),
    null,
  );
  const avg = inWindow.length
    ? inWindow.reduce((a, p) => a + p.v, 0) / inWindow.length
    : null;
  const lastSeries = visibleSeries[0];
  const lastValue = lastSeries?.values[n - 1];

  const paper =
    previewStyle === "grid"
      ? "bg-card bg-[radial-gradient(circle,var(--hairline-strong)_1px,transparent_1.2px)] bg-[length:14px_14px]"
      : previewStyle === "blueprint"
        ? "bg-[color-mix(in_oklab,var(--cr-accent)_7%,var(--card))] bg-[linear-gradient(color-mix(in_oklab,var(--cr-accent)_13%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--cr-accent)_13%,transparent)_1px,transparent_1px)] bg-[length:16px_16px]"
        : "bg-card";
  const axisInk =
    previewStyle === "blueprint" ? "stroke-(--cr-accent)" : "stroke-ink-3";
  const labelInk =
    previewStyle === "blueprint" ? "fill-(--cr-accent)" : "fill-ink-3";

  const seriesIndex = (id: string) =>
    Math.max(
      0,
      data.findIndex((s) => s.id === id),
    );

  return (
    <div
      ref={setBox}
      className={cn(
        "relative size-full overflow-hidden rounded-3 border border-hairline transition-colors",
        paper,
      )}
    >
      <svg
        aria-hidden
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 block size-full"
      >
        <defs>
          <clipPath id={`${clipId}-plot`}>
            <rect x={padL} y={0} width={plotW + 1} height={H} />
          </clipPath>
          {/* Month labels may overhang the plot by half a label; the ones
              outside the window fade before they reach the edge. */}
          <clipPath id={`${clipId}-labels`}>
            <rect x={padL - 18} y={0} width={plotW + 32} height={H} />
          </clipPath>
          <clipPath id={`${clipId}-draw`}>
            <motion.rect
              x={padL - 6}
              y={0}
              height={H}
              initial={false}
              animate={{ width: layers.series ? plotW + 12 : 0 }}
              transition={
                motionSafe
                  ? { duration: 0.55, ease: easings.move, delay: delays.series }
                  : { duration: 0 }
              }
            />
          </clipPath>
          <clipPath id={`${clipId}-x`}>
            <motion.rect
              x={padL - 18}
              y={0}
              height={H}
              initial={false}
              animate={{ width: layers.axes ? plotW + 32 : 0 }}
              transition={
                motionSafe
                  ? { duration: 0.45, ease: easings.move, delay: delays.axes }
                  : { duration: 0 }
              }
            />
          </clipPath>
          <clipPath id={`${clipId}-y`}>
            <motion.rect
              x={0}
              width={padL + 1}
              initial={false}
              animate={{
                attrY: layers.axes ? padT - 8 : H - padB,
                height: layers.axes ? plotH + 16 : 0,
              }}
              transition={
                motionSafe
                  ? { duration: 0.45, ease: easings.move, delay: delays.axes }
                  : { duration: 0 }
              }
            />
          </clipPath>
        </defs>

        {/* An empty preview is a quiet promise of a chart. */}
        <AnimatePresence initial={false}>
          {!layers.axes && !pending ? (
            <motion.g
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={tween(0.1)}
            >
              <text
                x={r2(W / 2)}
                y={r2(H / 2)}
                textAnchor="middle"
                className="fill-ink-3 text-[12px]"
              >
                {failed
                  ? "This source did not load"
                  : "Choose a source to draw the axes"}
              </text>
            </motion.g>
          ) : null}
        </AnimatePresence>

        {/* Layer skeleton while a slow source loads. */}
        {pending ? (
          <g className="motion-safe:animate-pulse">
            <rect
              x={padL}
              y={r2(H - padB)}
              width={plotW}
              height={2}
              rx={1}
              className="fill-surface-2"
            />
            <rect
              x={padL - 2}
              y={padT}
              width={2}
              height={plotH}
              rx={1}
              className="fill-surface-2"
            />
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={i}
                x={8}
                y={r2(padT + (i * plotH) / 3 - 3)}
                width={20}
                height={6}
                rx={3}
                className="fill-surface-2"
              />
            ))}
            <path
              d={`M ${padL} ${r2(padT + plotH * 0.62)} C ${r2(padL + plotW * 0.25)} ${r2(padT + plotH * 0.2)}, ${r2(padL + plotW * 0.55)} ${r2(padT + plotH * 0.95)}, ${r2(padL + plotW)} ${r2(padT + plotH * 0.4)}`}
              fill="none"
              className="stroke-surface-2"
              strokeWidth={8}
              strokeLinecap="round"
            />
          </g>
        ) : null}

        {/* Layer 1: axes. */}
        {source && !pending ? (
          <g>
            <g clipPath={`url(#${clipId}-y)`}>
              {scale.ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={padL}
                    x2={r2(padL + plotW)}
                    y1={yAt(t)}
                    y2={yAt(t)}
                    className={cn(axisInk, "transition-[stroke]")}
                    strokeOpacity={0.25}
                    strokeWidth={1}
                  />
                  <text
                    x={padL - 7}
                    y={r2(yAt(t) + 3)}
                    textAnchor="end"
                    className={cn(
                      labelInk,
                      "font-mono text-[9px] tabular-nums",
                    )}
                  >
                    {fmt(t)}
                  </text>
                </g>
              ))}
              <line
                x1={padL}
                x2={padL}
                y1={padT - 6}
                y2={r2(H - padB)}
                className={axisInk}
                strokeWidth={1}
              />
            </g>
            <g clipPath={`url(#${clipId}-x)`}>
              <line
                x1={padL}
                x2={r2(padL + plotW)}
                y1={r2(H - padB)}
                y2={r2(H - padB)}
                className={axisInk}
                strokeWidth={1}
              />
              <g clipPath={`url(#${clipId}-labels)`}>
                {source.x.map((label, i) => (
                  <motion.text
                    key={label + i}
                    initial={false}
                    animate={{ x: xAt(i), opacity: i >= first ? 1 : 0 }}
                    transition={{ x: glide, opacity: tween() }}
                    y={r2(H - 8)}
                    textAnchor="middle"
                    className={cn(labelInk, "font-mono text-[9px]")}
                  >
                    {N > 6 && W < 380 && i % 2 === 1 ? "" : label}
                  </motion.text>
                ))}
              </g>
            </g>
            <motion.text
              x={6}
              y={12}
              initial={false}
              animate={{ opacity: layers.axes ? 1 : 0 }}
              transition={tween(layers.axes ? delays.axes + 0.2 : 0)}
              className={cn(labelInk, "font-mono text-[10px] font-semibold")}
            >
              {source.unit}
            </motion.text>
          </g>
        ) : null}

        {/* Layer 2: the series, drawn on through a sweeping clip. Layer 3
            thins the ones filtered out and crops the window. */}
        {source && !pending && kind ? (
          <g clipPath={`url(#${clipId}-plot)`}>
            <g clipPath={`url(#${clipId}-draw)`}>
              <AnimatePresence initial={false}>
                <motion.g
                  key={kind}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={tween()}
                >
                  {bars
                    ? data.map((s) => {
                        const k = seriesIndex(s.id);
                        const groupW = plotW / N;
                        const bw = Math.max(
                          1.5,
                          (groupW * 0.72) / Math.max(1, data.length),
                        );
                        const on = shown(s.id);
                        // Bars grow a cascade apart across the window.
                        const step = cascade(N);
                        return s.values.map((v, i) => {
                          const x = r2(xAt(i) - (groupW * 0.72) / 2 + k * bw);
                          const y = yAt(Math.max(v, scale.lo));
                          return (
                            <motion.rect
                              key={`${s.id}-${i}`}
                              initial={false}
                              animate={{
                                x,
                                width: r2(Math.max(1, bw - 1)),
                                y: layers.series ? y : base,
                                height: layers.series
                                  ? r2(Math.max(0, base - y))
                                  : 0,
                                opacity: on ? 1 : 0.22,
                              }}
                              transition={{
                                x: glide,
                                width: glide,
                                y: motionSafe
                                  ? {
                                      ...springs.glide,
                                      delay:
                                        delays.series +
                                        Math.max(0, i - first) * step,
                                    }
                                  : { duration: 0 },
                                height: motionSafe
                                  ? {
                                      ...springs.glide,
                                      delay:
                                        delays.series +
                                        Math.max(0, i - first) * step,
                                    }
                                  : { duration: 0 },
                                opacity: tween(delays.filters),
                              }}
                              rx={1}
                              className={cn(
                                "transition-[fill] duration-300",
                                on ? sc(S_FILL, k) : "fill-ink-3",
                              )}
                            />
                          );
                        });
                      })
                    : data.map((s) => {
                        const k = seriesIndex(s.id);
                        const on = shown(s.id);
                        const d = pathFor(s.values);
                        const area =
                          kind === "area"
                            ? `${d} L ${xAt(s.values.length - 1)} ${base} L ${xAt(0)} ${base} Z`
                            : null;
                        return (
                          <g key={s.id}>
                            {area ? (
                              <motion.path
                                initial={false}
                                animate={{ d: area, opacity: on ? 0.13 : 0 }}
                                transition={{
                                  d: glide,
                                  opacity: tween(delays.filters),
                                }}
                                className={sc(S_FILL, k)}
                              />
                            ) : null}
                            <motion.path
                              initial={false}
                              animate={{
                                d,
                                strokeWidth: on ? 2 : 0.8,
                                opacity: on ? 1 : 0.4,
                              }}
                              transition={{
                                d: glide,
                                strokeWidth: tween(delays.filters),
                                opacity: tween(delays.filters),
                              }}
                              fill="none"
                              strokeLinejoin="round"
                              strokeLinecap="round"
                              className={cn(
                                "transition-[stroke] duration-300",
                                on ? sc(S_STROKE, k) : "stroke-ink-3",
                              )}
                            />
                          </g>
                        );
                      })}
                </motion.g>
              </AnimatePresence>
            </g>
          </g>
        ) : null}

        {/* Layer 4: notes land last. */}
        {source && !pending && kind ? (
          <g clipPath={`url(#${clipId}-plot)`}>
            <AnimatePresence initial={false}>
              {layers.notes &&
              notes.includes("target") &&
              target !== undefined ? (
                <motion.g
                  key="target"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={tween(delays.notes)}
                >
                  <rect
                    x={padL}
                    width={plotW}
                    y={r2(yAt(target) - 5)}
                    height={10}
                    className="fill-[color-mix(in_oklab,var(--success)_16%,transparent)]"
                  />
                  <line
                    x1={padL}
                    x2={r2(padL + plotW)}
                    y1={yAt(target)}
                    y2={yAt(target)}
                    className="stroke-success"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                  <text
                    x={r2(padL + plotW - 4)}
                    y={r2(yAt(target) - 8)}
                    textAnchor="end"
                    className="fill-success font-mono text-[9px] font-semibold"
                  >
                    target {fmt(target)}
                  </text>
                </motion.g>
              ) : null}
              {layers.notes && notes.includes("average") && avg !== null ? (
                <motion.g
                  key="average"
                  initial={{ opacity: 0, x: motionSafe ? -distances.step : 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={{
                    opacity: tween(delays.notes + 0.05),
                    x: motionSafe
                      ? { ...springs.glide, delay: delays.notes + 0.05 }
                      : { duration: 0 },
                  }}
                >
                  <motion.line
                    x1={padL}
                    x2={r2(padL + plotW)}
                    initial={false}
                    animate={{ y1: yAt(avg), y2: yAt(avg) }}
                    transition={glide}
                    className="stroke-foreground"
                    strokeOpacity={0.55}
                    strokeWidth={1.25}
                    strokeDasharray="5 4"
                  />
                  <motion.text
                    x={padL + 4}
                    initial={false}
                    animate={{ y: r2(yAt(avg) - 5) }}
                    transition={glide}
                    className="fill-foreground font-mono text-[9px] font-semibold"
                  >
                    avg {fmt(avg)}
                  </motion.text>
                </motion.g>
              ) : null}
              {layers.notes && notes.includes("peak") && peak ? (
                <motion.g
                  key="peak"
                  initial={{ opacity: 0, y: motionSafe ? -14 : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: motionSafe ? -distances.step : 0,
                    transition: exitFor(durations.base),
                  }}
                  transition={{
                    opacity: tween(delays.notes + 0.1),
                    y: motionSafe
                      ? { ...springs.recoil, delay: delays.notes + 0.1 }
                      : { duration: 0 },
                  }}
                >
                  <motion.g
                    initial={false}
                    animate={{ x: xAt(peak.i), y: yAt(peak.v) }}
                    transition={glide}
                  >
                    <line
                      x1={0}
                      x2={0}
                      y1={-16}
                      y2={-4}
                      className="stroke-foreground"
                      strokeWidth={1}
                    />
                    <circle
                      r={3.5}
                      className={cn(
                        sc(S_FILL, seriesIndex(peak.s.id)),
                        "stroke-card",
                      )}
                      strokeWidth={1.5}
                    />
                    <text
                      x={0}
                      y={-19}
                      textAnchor="middle"
                      className="fill-foreground font-mono text-[9px] font-semibold"
                    >
                      peak {fmt(peak.v)}
                    </text>
                  </motion.g>
                </motion.g>
              ) : null}
              {layers.notes &&
              notes.includes("last") &&
              lastSeries &&
              lastValue !== undefined ? (
                <motion.g
                  key="last"
                  initial={{ opacity: 0, x: motionSafe ? distances.step : 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.base) }}
                  transition={{
                    opacity: tween(delays.notes + 0.15),
                    x: motionSafe
                      ? { ...springs.recoil, delay: delays.notes + 0.15 }
                      : { duration: 0 },
                  }}
                >
                  <motion.g
                    initial={false}
                    animate={{ y: yAt(lastValue) }}
                    transition={glide}
                  >
                    <rect
                      x={r2(padL + plotW - 44)}
                      y={-9}
                      width={42}
                      height={16}
                      rx={4}
                      className={sc(S_FILL, seriesIndex(lastSeries.id))}
                    />
                    <text
                      x={r2(padL + plotW - 23)}
                      y={3}
                      textAnchor="middle"
                      className="fill-white font-mono text-[9px] font-semibold"
                    >
                      {fmt(lastValue)}
                    </text>
                  </motion.g>
                </motion.g>
              ) : null}
            </AnimatePresence>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The wizard                               */
/* ----------------------------------------------------------------------- */

/** A tiny glyph per chart type, drawn the way the preview draws it. */
function KindGlyph({ kind }: { kind: RecipeChartKind }) {
  return (
    <svg aria-hidden viewBox="0 0 28 18" className="h-[18px] w-7 shrink-0">
      <path d="M 1 17 H 27" className="stroke-ink-3" strokeWidth={1} />
      {kind === "bars" ? (
        [3, 9, 15, 21].map((x, i) => (
          <rect
            key={x}
            x={x}
            y={[9, 5, 11, 3][i]}
            width={4}
            height={17 - ([9, 5, 11, 3][i] ?? 0)}
            rx={0.75}
            className="fill-current"
          />
        ))
      ) : kind === "steps" ? (
        <path
          d="M 2 12 H 8 V 7 H 15 V 10 H 21 V 3 H 26"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
      ) : (
        <>
          {kind === "area" ? (
            <path
              d="M 2 13 L 8 8 L 14 10 L 20 4 L 26 6 V 17 H 2 Z"
              className="fill-current"
              opacity={0.25}
            />
          ) : null}
          <path
            d="M 2 13 L 8 8 L 14 10 L 20 4 L 26 6"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

const fillDefaults = (
  v: Partial<ChartRecipeValue> | undefined,
  filters: RecipeFilter[],
  windows: RecipeWindow[],
): ChartRecipeValue => ({
  source: v?.source ?? null,
  chartType: v?.chartType ?? null,
  series: v?.series ?? filters.map((f) => f.id),
  window: v?.window ?? windows[0]?.id ?? "12",
  annotations: v?.annotations ?? [],
  name: v?.name ?? "Harbour pumps, monthly",
});

/**
 * A report wizard whose preview is a record of the choices. Four steps —
 * Source, Chart, Filters, Notes — sit beside a chart that builds a layer per
 * step: choosing a source sweeps the axes in through a clip on a move tween,
 * the chart type draws its series on through a sweeping clip (bars grow on
 * `springs.glide` a cascade apart), filters thin the series they leave out
 * and crop the window while every point glides to the new scale, and notes
 * land last — the peak pin on `springs.recoil`. Back peels the layers off
 * in reverse, newest first, a beat apart; forward lays them down again.
 *
 * The rail is a tablist that follows the arrow keys; sources and chart types
 * are native radio groups, filters and notes native checkboxes. A slow
 * `loadSource` shows a layer skeleton. Under 40rem the preview sits above the
 * step. Under reduced motion layers cross-fade in and out, in the same order.
 */
export function ChartRecipe({
  sources = defaultRecipeSources,
  chartTypes = defaultRecipeChartTypes,
  filters = defaultRecipeFilters,
  windows = defaultRecipeWindows,
  annotations = defaultRecipeAnnotations,
  value,
  defaultValue,
  onValueChange,
  step: stepProp,
  defaultStep = 0,
  onStepChange,
  loadSource,
  onCreate,
  onCancel,
  previewStyle = "paper",
  density = "cozy",
  palette = "cobalt",
  title = "New report",
  subtitle = "Gaugeworks · Harbour line",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: ChartRecipeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const clipId = `cr${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const colors = PALETTES[palette] ?? PALETTES.cobalt;
  const ready = status === "ready";

  const [own, setOwn] = React.useState<ChartRecipeValue>(() =>
    fillDefaults(defaultValue, filters, windows),
  );
  const recipe = value ?? own;
  const [ownStep, setOwnStep] = React.useState(
    Math.max(0, Math.min(3, defaultStep)),
  );
  const step = Math.max(0, Math.min(3, stepProp ?? ownStep));
  const [created, setCreated] = React.useState<string | null>(null);

  const source = sources.find((s) => s.id === recipe.source) ?? null;
  const kind = chartTypes.find((c) => c.id === recipe.chartType)?.id ?? null;
  const win = windows.find((w) => w.id === recipe.window) ?? windows[0];

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------ source data ----------------------------- */

  // Inline series are used as they are; a source without them is fetched
  // through `loadSource` once it is chosen, and the preview shows a layer
  // skeleton until it answers.
  const [loaded, setLoaded] = React.useState<Record<string, RecipeSeries[]>>(
    {},
  );
  const [failedSource, setFailedSource] = React.useState<string | null>(null);
  const [retry, setRetry] = React.useState(0);
  const needsFetch =
    source !== null &&
    !source.series &&
    !loaded[source.id] &&
    Boolean(loadSource);
  React.useEffect(() => {
    if (!needsFetch || !source || !loadSource) return;
    let live = true;
    Promise.resolve()
      .then(() => loadSource(source))
      .then(
        (list) => {
          if (!live) return;
          setLoaded((m) => ({ ...m, [source.id]: list }));
          setFailedSource((f) => (f === source.id ? null : f));
          say(`${source.label} loaded. The axes are drawn.`);
        },
        () => {
          if (!live) return;
          setFailedSource(source.id);
          say(`${source.label} did not load.`);
        },
      );
    return () => {
      live = false;
    };
    // Fetched per chosen source (and per retry), not per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id, needsFetch, retry]);

  const data = source
    ? (loaded[source.id] ?? source.series ?? EMPTY_SERIES)
    : EMPTY_SERIES;
  const failed = source !== null && failedSource === source.id;
  const pending = needsFetch && !failed;
  const hasData = source !== null && !pending && !failed && data.length > 0;

  /* -------------------------------- layers -------------------------------- */

  const layers: Layers = {
    axes: hasData,
    series: hasData && kind !== null && step >= 1,
    filters: hasData && kind !== null && step >= 2,
    notes:
      hasData && kind !== null && step >= 3 && recipe.annotations.length > 0,
  };

  // Layers come and go a beat apart: forward in build order, backward newest
  // first, so a jump from Notes to Source peels notes, then the thinning,
  // then the series, then the axes.
  const [prevLayers, setPrevLayers] = React.useState(layers);
  const [delays, setDelays] = React.useState<Record<keyof Layers, number>>({
    axes: 0,
    series: 0,
    filters: 0,
    notes: 0,
  });
  const layerSig = LAYER_ORDER.map((k) => (layers[k] ? 1 : 0)).join("");
  const prevSig = LAYER_ORDER.map((k) => (prevLayers[k] ? 1 : 0)).join("");
  if (layerSig !== prevSig) {
    const beat = motionSafe ? 0.14 : 0;
    const adding = LAYER_ORDER.filter((k) => layers[k] && !prevLayers[k]);
    const removing = LAYER_ORDER.filter(
      (k) => !layers[k] && prevLayers[k],
    ).reverse();
    const next = { axes: 0, series: 0, filters: 0, notes: 0 };
    removing.forEach((k, i) => (next[k] = r2(i * beat)));
    const after = removing.length ? removing.length * beat : 0;
    adding.forEach((k, i) => (next[k] = r2(after + i * beat)));
    setDelays(next);
    setPrevLayers(layers);
  }

  /* ------------------------------ announcing ------------------------------ */

  const description = (() => {
    if (!source) return "Empty preview. Choose a source to draw the axes.";
    if (pending) return `Loading ${source.label}.`;
    const parts: string[] = [];
    const kindLabel = chartTypes
      .find((c) => c.id === kind)
      ?.label.toLowerCase();
    parts.push(
      layers.series && kindLabel
        ? `${kindLabel} chart of ${source.label.toLowerCase()} in ${source.unit}`
        : `Axes for ${source.label.toLowerCase()} in ${source.unit}`,
    );
    if (layers.series) {
      const kept = layers.filters
        ? data.filter((s) => recipe.series.includes(s.id)).length
        : data.length;
      parts.push(
        `${data.length} series${layers.filters ? `, ${kept} shown` : ""}`,
      );
    }
    if (layers.filters && win) parts.push(`last ${win.points} months`);
    if (layers.notes) {
      parts.push(
        recipe.annotations
          .map(
            (a) =>
              annotations.find((x) => x.id === a)?.label.toLowerCase() ?? a,
          )
          .join(" and "),
      );
    }
    return `${parts.join(", ")}.`;
  })();

  /* ------------------------------- changing ------------------------------- */

  const update = (patch: Partial<ChartRecipeValue>, spoken?: string) => {
    if (disabled) return;
    const next = { ...recipe, ...patch };
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    setCreated(null);
    if (spoken) say(spoken);
  };

  const unlocked = (i: number) =>
    i === 0 ? true : i === 1 ? hasData : kind !== null && hasData;

  const goTo = (i: number, focusTab = false) => {
    const to = Math.max(0, Math.min(3, i));
    if (to === step || !unlocked(to) || disabled) return;
    if (stepProp === undefined) setOwnStep(to);
    onStepChange?.(to, STEPS[to]?.id ?? "source");
    setCreated(null);
    if (focusTab) tabs.current[to]?.focus();
    say(
      `Step ${to + 1} of 4, ${STEPS[to]?.label}.${
        to < step ? " The layers after it come off." : ""
      }`,
    );
  };

  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    const dir =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (dir) {
      event.preventDefault();
      for (let j = i + dir; j >= 0 && j < 4; j += dir) {
        if (unlocked(j)) {
          goTo(j, true);
          return;
        }
      }
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      goTo(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      for (let j = 3; j >= 0; j -= 1) {
        if (unlocked(j)) {
          goTo(j, true);
          return;
        }
      }
    }
  };

  const canNext =
    step === 0
      ? hasData
      : step === 1
        ? kind !== null
        : step === 2
          ? true
          : recipe.name.trim().length > 0;

  const create = () => {
    if (!source || !kind || disabled) return;
    const result: ChartRecipeResult = {
      ...recipe,
      source: source.id,
      chartType: kind,
    };
    onCreate?.(result);
    const name = recipe.name.trim() || "Untitled report";
    setCreated(name);
    say(`Created ${name}.`);
  };

  const onPrimary = () => {
    if (!canNext) {
      say(
        step === 0
          ? "Choose a source first."
          : step === 1
            ? "Choose a chart type first."
            : "Give the report a name.",
      );
      return;
    }
    if (step === 3) create();
    else goTo(step + 1);
  };

  const onSecondary = () => {
    if (step === 0) onCancel?.();
    else goTo(step - 1);
  };

  const startOver = () => {
    update(fillDefaults({ name: recipe.name }, filters, windows));
    if (stepProp === undefined) setOwnStep(0);
    onStepChange?.(0, "source");
    say("Starting over. The layers come off.");
  };

  /* -------------------------------- panels -------------------------------- */

  const sectionLabel =
    "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";
  const radioCard = (on: boolean) =>
    cn(
      "relative flex cursor-pointer items-start gap-2.5 rounded-3 border transition-colors",
      d.card,
      on
        ? "border-(--cr-accent) bg-[color-mix(in_oklab,var(--cr-accent)_8%,transparent)]"
        : "border-hairline hover:bg-surface-2",
      HAS_FOCUS,
    );
  const dot = (on: boolean) => (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
        on ? "border-(--cr-accent)" : "border-hairline-strong",
      )}
    >
      <motion.span
        className="size-2 rounded-full bg-(--cr-accent)"
        initial={false}
        animate={{ scale: on ? 1 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
    </span>
  );
  const box = (on: boolean) => (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
        on
          ? "border-(--cr-fill) bg-(--cr-fill) text-white"
          : "border-hairline-strong bg-card text-transparent",
      )}
    >
      <svg viewBox="0 0 16 16" className="size-3">
        <motion.path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: on ? 1 : 0 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </svg>
    </span>
  );

  const sourcePanel = (
    <fieldset className="flex flex-col" disabled={disabled}>
      <legend className={cn(sectionLabel, "mb-2")}>Data source</legend>
      <div className={cn("grid grid-cols-1", d.gap)}>
        {sources.map((src) => {
          const on = src.id === recipe.source;
          return (
            <label key={src.id} className={radioCard(on)}>
              <input
                type="radio"
                name={`${uid}-source`}
                value={src.id}
                checked={on}
                onChange={() =>
                  update(
                    { source: src.id },
                    `${src.label}. Drawing the axes in ${src.unit}.`,
                  )
                }
                className="sr-only"
              />
              {dot(on)}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2 text-[13px] leading-5 font-medium text-foreground">
                  {src.label}
                  <span className="rounded-1 bg-surface-2 px-1 font-mono text-[10px] text-ink-2">
                    {src.unit}
                  </span>
                </span>
                <span className="text-[12px] leading-4 text-ink-3">
                  {src.note}
                </span>
              </span>
              {pending && source?.id === src.id ? (
                <LoaderCircle
                  aria-hidden
                  className="mt-0.5 size-3.5 shrink-0 text-ink-3 motion-safe:animate-spin"
                />
              ) : null}
            </label>
          );
        })}
      </div>
      {failed && source ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-danger">
          <TriangleAlert aria-hidden className="size-3.5" />
          {source.label} did not load.
          <button
            type="button"
            onClick={() => {
              setFailedSource(null);
              setRetry((n) => n + 1);
            }}
            className={cn(
              "rounded-1 text-foreground underline underline-offset-2",
              FOCUS_RING,
            )}
          >
            Retry
          </button>
        </p>
      ) : null}
    </fieldset>
  );

  const chartPanel = (
    <fieldset className="flex flex-col" disabled={disabled}>
      <legend className={cn(sectionLabel, "mb-2")}>Chart type</legend>
      <div
        className={cn(
          "grid grid-cols-1 @min-[22rem]/cr-panel:grid-cols-2",
          d.gap,
        )}
      >
        {chartTypes.map((c) => {
          const on = c.id === recipe.chartType;
          return (
            <label key={c.id} className={radioCard(on)}>
              <input
                type="radio"
                name={`${uid}-kind`}
                value={c.id}
                checked={on}
                onChange={() =>
                  update({ chartType: c.id }, `${c.label}. The series draw in.`)
                }
                className="sr-only"
              />
              <span
                className={cn(
                  "mt-0.5",
                  on ? "text-(--cr-accent)" : "text-ink-2",
                )}
              >
                <KindGlyph kind={c.id} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] leading-5 font-medium text-foreground">
                  {c.label}
                </span>
                <span className="text-[12px] leading-4 text-ink-3">
                  {c.note}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const filterPanel = (
    <div className={cn("flex flex-col", d.section)}>
      <fieldset className="flex flex-col" disabled={disabled}>
        <legend className={cn(sectionLabel, "mb-1.5")}>Sites</legend>
        <div className="grid grid-cols-1 gap-x-3 @min-[22rem]/cr-panel:grid-cols-2">
          {filters
            .filter((f) => data.length === 0 || data.some((s) => s.id === f.id))
            .map((f) => {
              const on = recipe.series.includes(f.id);
              const k = Math.max(
                0,
                data.findIndex((s) => s.id === f.id),
              );
              return (
                <label
                  key={f.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-2 px-1 text-[13px] text-foreground",
                    d.row,
                    HAS_FOCUS,
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      update(
                        {
                          series: on
                            ? recipe.series.filter((x) => x !== f.id)
                            : [...recipe.series, f.id],
                        },
                        `${f.label} ${on ? "thinned" : "shown"}.`,
                      )
                    }
                    className="sr-only"
                  />
                  {box(on)}
                  <span
                    aria-hidden
                    className={cn(
                      "h-0.5 w-3 shrink-0 rounded-full",
                      sc(S_BG, k),
                    )}
                  />
                  <span className="min-w-0 truncate">{f.label}</span>
                </label>
              );
            })}
        </div>
      </fieldset>
      <fieldset className="flex flex-col" disabled={disabled}>
        <legend className={cn(sectionLabel, "mb-2")}>Window</legend>
        <div className="flex flex-wrap gap-1.5">
          {windows.map((w) => {
            const on = w.id === recipe.window;
            return (
              <label
                key={w.id}
                className={cn(
                  "relative inline-flex cursor-pointer items-center rounded-full border px-3 text-[12px] transition-colors",
                  d.chip,
                  on
                    ? "border-(--cr-accent) bg-[color-mix(in_oklab,var(--cr-accent)_10%,transparent)] font-medium text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  HAS_FOCUS,
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-window`}
                  value={w.id}
                  checked={on}
                  onChange={() =>
                    update({ window: w.id }, `Last ${w.points} months.`)
                  }
                  className="sr-only"
                />
                {w.label}
              </label>
            );
          })}
        </div>
      </fieldset>
    </div>
  );

  const notesPanel = (
    <div className={cn("flex flex-col", d.section)}>
      <fieldset className="flex flex-col" disabled={disabled}>
        <legend className={cn(sectionLabel, "mb-1.5")}>Notes</legend>
        <div className="flex flex-col">
          {annotations.map((a) => {
            const on = recipe.annotations.includes(a.id);
            const missing = a.id === "target" && source?.target === undefined;
            return (
              <label
                key={a.id}
                className={cn(
                  "flex items-center gap-2 rounded-2 px-1 text-[13px]",
                  d.row,
                  missing
                    ? "cursor-default text-ink-3"
                    : "cursor-pointer text-foreground",
                  HAS_FOCUS,
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  aria-disabled={missing || undefined}
                  onChange={() => {
                    if (missing) return;
                    update(
                      {
                        annotations: on
                          ? recipe.annotations.filter((x) => x !== a.id)
                          : [...recipe.annotations, a.id],
                      },
                      `${a.label} ${on ? "removed" : "added"}.`,
                    );
                  }}
                  className="sr-only"
                />
                {box(on)}
                <span className="min-w-0 truncate">{a.label}</span>
                <span className="ml-auto hidden shrink-0 text-[11px] text-ink-3 @min-[26rem]/cr-panel:inline">
                  {missing ? "No target set" : a.note}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className={sectionLabel}>Report name</span>
        <input
          type="text"
          value={recipe.name}
          disabled={disabled}
          onChange={(event) => {
            const name = event.currentTarget.value;
            update({ name });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onPrimary();
            }
          }}
          className={cn(
            "h-9 w-full rounded-2 border border-input bg-card px-3 text-[13px] text-foreground placeholder:text-ink-3",
            "focus-visible:border-(--cr-accent)",
            FOCUS_RING,
          )}
          placeholder="Name this report"
        />
      </label>
    </div>
  );

  const panels = [sourcePanel, chartPanel, filterPanel, notesPanel];

  // Panels travel 16px in the direction of travel.
  const [shownStep, setShownStep] = React.useState(step);
  const [dir, setDir] = React.useState(1);
  if (shownStep !== step) {
    setDir(step > shownStep ? 1 : -1);
    setShownStep(step);
  }

  const preview = (
    <div role="img" aria-label={description} className="size-full">
      <Preview
        source={source}
        data={hasData ? data : EMPTY_SERIES}
        pending={pending}
        failed={failed}
        kind={kind}
        include={recipe.series}
        windowPoints={
          layers.filters ? (win?.points ?? 12) : (source?.x.length ?? 12)
        }
        notes={recipe.annotations}
        layers={layers}
        delays={delays}
        previewStyle={previewStyle}
        motionSafe={motionSafe}
        clipId={clipId}
      />
    </div>
  );

  const legend =
    hasData && layers.series ? (
      <ul aria-hidden className="flex flex-wrap gap-x-3 gap-y-1">
        {data.map((s, k) => {
          const on = !layers.filters || recipe.series.includes(s.id);
          return (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-1.5 text-[11px] transition-colors",
                on ? "text-ink-2" : "text-ink-3 line-through",
              )}
            >
              <span
                className={cn(
                  "h-0.5 w-3 rounded-full",
                  on ? sc(S_BG, k) : "bg-ink-3",
                )}
              />
              {s.label}
            </li>
          );
        })}
      </ul>
    ) : null;

  const body =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-3 p-4">
        <span className="sr-only">Loading sources.</span>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-12 rounded-3 bg-surface-2 motion-safe:animate-pulse"
          />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">The sources did not load.</p>
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
      <div className="grid grid-cols-1 gap-4 p-4 @min-[40rem]/chart-recipe:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] @min-[40rem]/chart-recipe:gap-5 @min-[40rem]/chart-recipe:p-5">
        <div className="@container/cr-panel order-2 min-w-0 @min-[40rem]/chart-recipe:order-1">
          <div
            role="tabpanel"
            id={`${uid}-panel`}
            aria-labelledby={`${uid}-tab-${step}`}
            className="grid [grid-template-areas:'panel']"
          >
            <AnimatePresence initial={false} custom={dir}>
              <motion.div
                key={step}
                custom={dir}
                className="min-w-0 [grid-area:panel]"
                variants={{
                  enter: (k: number) => ({
                    opacity: 0,
                    x: motionSafe ? k * distances.shift : 0,
                  }),
                  shown: { opacity: 1, x: 0 },
                  leave: (k: number) => ({
                    opacity: 0,
                    x: motionSafe ? -k * distances.shift : 0,
                    transition: exitFor(durations.fast),
                  }),
                }}
                initial="enter"
                animate="shown"
                exit="leave"
                transition={{
                  opacity: { duration: durations.base, ease: easings.enter },
                  x: motionSafe ? springs.glide : { duration: 0 },
                }}
              >
                {panels[step]}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="order-1 min-w-0 @min-[40rem]/chart-recipe:order-2">
          <div className="flex flex-col gap-2 @min-[40rem]/chart-recipe:sticky @min-[40rem]/chart-recipe:top-0">
            <div className="h-[11.5rem] @min-[40rem]/chart-recipe:h-[15rem]">
              {preview}
            </div>
            {legend}
          </div>
        </div>
      </div>
    );

  const primaryLabel =
    created && step === 3
      ? "Create another"
      : step === 3
        ? "Create report"
        : "Next";

  return (
    <div
      className={cn("@container/chart-recipe w-full", className)}
      style={
        {
          "--cr-accent": "var(--accent-bright)",
          "--cr-fill": "oklch(from var(--accent-bright) 0.58 0.15 h)",
          "--cr-s0": colors[0],
          "--cr-s1": colors[1],
          "--cr-s2": colors[2],
          "--cr-s3": colors[3],
        } as React.CSSProperties
      }
    >
      <div
        role="region"
        aria-labelledby={titleId}
        className={cn(
          "relative mx-auto flex max-h-[35rem] w-full max-w-[56rem] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_14%,transparent)]",
          disabled && "opacity-70",
        )}
      >
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3 @min-[30rem]/chart-recipe:px-5">
          <div className="min-w-0 flex-1 basis-40">
            <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
              {title}
            </h2>
            <p className="truncate text-[12px] leading-4 text-ink-3">
              {subtitle}
            </p>
          </div>
          <span className="font-mono text-[11px] text-ink-3 tabular-nums">
            Step {step + 1} of 4
          </span>
        </header>

        {ready ? (
          <div
            role="tablist"
            aria-label="Report steps"
            className="flex shrink-0 items-center gap-1 border-b border-hairline px-3 py-2 @min-[30rem]/chart-recipe:px-4"
          >
            {STEPS.map((s, i) => {
              const open = unlocked(i);
              const on = i === step;
              const doneStep =
                i === 0
                  ? hasData
                  : i === 1
                    ? kind !== null
                    : i === 2
                      ? step > 2
                      : recipe.annotations.length > 0;
              const pick =
                i === 0
                  ? source?.label
                  : i === 1
                    ? chartTypes.find((c) => c.id === kind)?.label
                    : i === 2
                      ? win?.label
                      : recipe.annotations.length
                        ? `${recipe.annotations.length} ${recipe.annotations.length === 1 ? "note" : "notes"}`
                        : undefined;
              return (
                <React.Fragment key={s.id}>
                  {i > 0 ? (
                    <span
                      aria-hidden
                      className="h-px w-2 shrink-0 bg-hairline-strong @min-[30rem]/chart-recipe:w-3"
                    />
                  ) : null}
                  <button
                    ref={(node) => {
                      tabs.current[i] = node;
                    }}
                    id={`${uid}-tab-${i}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-label={`Step ${i + 1}, ${s.label}${pick ? `: ${pick}` : ""}${open ? "" : ", locked"}`}
                    aria-controls={`${uid}-panel`}
                    aria-disabled={!open || undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={() => goTo(i)}
                    onKeyDown={(event) => onTabKey(event, i)}
                    className={cn(
                      "group/cr-tab flex h-9 min-w-0 items-center gap-2 rounded-2 px-1.5 text-left transition-colors @min-[30rem]/chart-recipe:px-2",
                      on
                        ? "bg-[color-mix(in_oklab,var(--cr-accent)_9%,transparent)]"
                        : open
                          ? "hover:bg-surface-2"
                          : "cursor-not-allowed",
                      FOCUS_RING,
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums transition-colors",
                        on
                          ? "border-(--cr-accent) bg-(--cr-fill) text-white"
                          : doneStep
                            ? "border-(--cr-accent) text-(--cr-accent)"
                            : open
                              ? "border-hairline-strong text-ink-2"
                              : "border-hairline text-ink-3",
                      )}
                    >
                      {doneStep && !on ? (
                        <Check className="size-3" strokeWidth={2.5} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-col",
                        on ? "flex" : "hidden @min-[30rem]/chart-recipe:flex",
                      )}
                    >
                      <span
                        className={cn(
                          "truncate text-[12px] leading-4 font-medium",
                          open ? "text-foreground" : "text-ink-3",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="hidden truncate text-[11px] leading-3.5 text-ink-3 @min-[40rem]/chart-recipe:block">
                        {pick ?? (open ? "To choose" : "Locked")}
                      </span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        ) : null}

        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
          {body}
        </div>

        {ready ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface-1 px-4 py-3 @min-[30rem]/chart-recipe:px-5">
            <AnimatePresence initial={false}>
              {created ? (
                <motion.p
                  key="created"
                  className="mr-auto flex min-w-0 items-center gap-1.5 text-[12px] text-success"
                  initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{
                    opacity: { duration: durations.fast },
                    y: motionSafe ? springs.recoil : { duration: 0 },
                  }}
                >
                  <Check aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">Created {created}</span>
                </motion.p>
              ) : null}
            </AnimatePresence>
            <button
              type="button"
              onClick={onSecondary}
              aria-disabled={disabled || undefined}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-2 border border-hairline bg-card px-3.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              {step === 0 ? "Cancel" : "Back"}
            </button>
            <button
              type="button"
              onClick={created && step === 3 ? startOver : onPrimary}
              aria-disabled={!canNext || disabled || undefined}
              className={cn(
                "inline-flex h-9 min-w-24 items-center justify-center rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 aria-disabled:opacity-55",
                FOCUS_RING,
              )}
            >
              {primaryLabel}
            </button>
          </footer>
        ) : null}

        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </div>
  );
}
