"use client";

import * as React from "react";

import { RefreshCw } from "lucide-react";
import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";
import { Flapboard } from "@/registry/ui/flapboard";
import { Readout } from "@/registry/ui/readout";

export type ReadoutGridMetrics = {
  counter: {
    label: string;
    value: number;
    unit?: string;
    delta: { value: string; direction: "up" | "down" };
  };
  sparkline: { label: string; points: number[]; caption: string };
  flap: { label: string; value: string; caption: string };
  gauge: { label: string; value: number; caption: string };
};

export type ReadoutGridProps = {
  /** Full metric override; Refresh walks values from whatever is shown. */
  metrics?: ReadoutGridMetrics;
  className?: string;
};

const DEFAULT_METRICS: ReadoutGridMetrics = {
  counter: {
    label: "Throughput",
    value: 4182,
    unit: "req/s",
    delta: { value: "+3.2%", direction: "up" },
  },
  sparkline: {
    label: "P95 Latency",
    points: [
      44.2, 41.8, 43.1, 39.6, 40.2, 38.4, 39.1, 37.8, 38.9, 36.4, 37.2, 38.8,
      37.5, 38.1,
    ],
    caption: "38.1 ms",
  },
  flap: { label: "Error Rate", value: "+0.02%", caption: "24h drift" },
  gauge: { label: "Uptime", value: 99, caption: "SLO 99.9%" },
};

/** Deterministic LCG so refresh walks are reproducible and SSR-safe. */
const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const formatGauge = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/** Pseudo-random walk from the currently shown values. */
function walkMetrics(
  prev: ReadoutGridMetrics,
  rand: () => number,
): ReadoutGridMetrics {
  const counterStep = Math.round((rand() - 0.42) * 420);
  const counterValue = Math.max(0, prev.counter.value + counterStep);
  const pct =
    prev.counter.value > 0 ? (counterStep / prev.counter.value) * 100 : 0;

  const lastPoint = prev.sparkline.points.at(-1) ?? 40;
  const points: number[] = [];
  let point = lastPoint;
  for (let i = 0; i < Math.max(prev.sparkline.points.length, 2); i += 1) {
    point = Math.max(1, point + (rand() - 0.5) * 8);
    points.push(Number(point.toFixed(1)));
  }
  const captionSuffix = prev.sparkline.caption.replace(/^[\d.,\s]+/, "");
  const lastNew = points.at(-1) ?? lastPoint;

  const flapSign = rand() < 0.5 ? "+" : "-";
  const flapMagnitude = rand() * 0.4;

  const gaugeValue = Number(
    clamp(prev.gauge.value + (rand() - 0.5) * 2.4, 88, 100).toFixed(1),
  );

  return {
    counter: {
      ...prev.counter,
      value: counterValue,
      delta: {
        value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
        direction: pct >= 0 ? "up" : "down",
      },
    },
    sparkline: {
      ...prev.sparkline,
      points,
      caption: `${lastNew.toFixed(1)} ${captionSuffix}`.trim(),
    },
    flap: { ...prev.flap, value: `${flapSign}${flapMagnitude.toFixed(2)}%` },
    gauge: { ...prev.gauge, value: gaugeValue },
  };
}

type SparkGeometry = { points: string; endX: number; endY: number };

function buildSparkline(values: number[]): SparkGeometry {
  const width = 120;
  const height = 36;
  const pad = 4;
  if (values.length === 0) {
    return { points: "", endX: width - pad, endY: height / 2 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / Math.max(values.length - 1, 1);
  const coords = values.map((value, index) => ({
    x: pad + index * step,
    y: height - pad - ((value - min) / span) * (height - pad * 2),
  }));
  const end = coords[coords.length - 1] ?? { x: width - pad, y: height / 2 };
  return {
    points: coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" "),
    endX: end.x,
    endY: end.y,
  };
}

function Sparkline({
  points,
  tick,
  motionSafe,
}: {
  points: number[];
  tick: number;
  motionSafe: boolean;
}) {
  const geo = React.useMemo(() => buildSparkline(points), [points]);
  return (
    <svg viewBox="0 0 120 36" aria-hidden className="w-full">
      <motion.polyline
        key={`line-${tick}`}
        points={geo.points}
        fill="none"
        stroke="var(--signal, var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      />
      <circle
        cx={geo.endX}
        cy={geo.endY}
        r="2"
        fill="var(--signal, var(--primary))"
      />
      {motionSafe && (
        <motion.circle
          key={`pulse-${tick}`}
          cx={geo.endX}
          cy={geo.endY}
          fill="none"
          stroke="var(--signal, var(--primary))"
          strokeWidth="1"
          initial={{ r: 2, opacity: 0.8 }}
          animate={{ r: 7, opacity: 0 }}
          transition={{ delay: 0.5, duration: durations.slow, ease: easings.enter }}
        />
      )}
    </svg>
  );
}

const GAUGE_ARC = "M 10 46 A 40 40 0 0 1 90 46";

function GaugeDial({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const clamped = clamp(value, 0, 100);
  const angle = -90 + (clamped / 100) * 180;
  return (
    <div className="relative" aria-hidden>
      <svg viewBox="0 0 100 54" className="w-full">
        <path
          d={GAUGE_ARC}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <motion.path
          d={GAUGE_ARC}
          fill="none"
          stroke="var(--signal, var(--primary))"
          strokeWidth="7"
          strokeLinecap="round"
          initial={motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: clamped / 100 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
        <motion.line
          x1={50}
          y1={46}
          x2={50}
          y2={18}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          style={{ originX: 0.5, originY: 1 }}
          initial={motionSafe ? { rotate: -90 } : false}
          animate={{ rotate: angle }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
        <circle cx={50} cy={46} r={3} fill="currentColor" />
      </svg>
      <p className="pointer-events-none absolute inset-x-0 bottom-[22%] text-center font-mono text-base font-semibold tabular-nums">
        {formatGauge(value)}%
      </p>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  srValue: string;
  footnote?: string;
  index: number;
  motionSafe: boolean;
  children: React.ReactNode;
};

function MetricCard({
  label,
  srValue,
  footnote,
  index,
  motionSafe,
  children,
}: MetricCardProps) {
  const delay = index * cascade(4);
  return (
    <motion.article
      aria-label={`${label}: ${srValue}`}
      initial={motionSafe ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              delay,
              opacity: { duration: durations.base, ease: easings.enter, delay },
            }
          : { duration: 0 }
      }
      className="border-border bg-card rounded-3 border p-4"
    >
      <p className="text-muted-foreground font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
        {label}
      </p>
      <div className="mt-2">{children}</div>
      {footnote ? (
        <p className="text-muted-foreground mt-2 font-mono text-[11px] tabular-nums">
          {footnote}
        </p>
      ) : null}
    </motion.article>
  );
}

/**
 * Dashboard stats as instrument cards. Four instruments in a 2×2 grid — a
 * carry-rolling `Readout` counter, a self-drawing sparkline (`glide`
 * pathLength, phosphor stroke), a split-flap delta (`Flapboard`), and a
 * speedometer gauge whose needle sweeps on `snap` with a slight overshoot.
 * Cards cascade in 12px risers on mount; Refresh walks every value with a
 * deterministic LCG and each instrument animates its change. Reduced motion
 * skips the cascade, draws visuals fully, and swaps values instantly.
 */
export function ReadoutGrid({ metrics, className }: ReadoutGridProps) {
  const motionSafe = useMotionSafe();
  const [tick, setTick] = React.useState(0);
  const [data, setData] = React.useState<ReadoutGridMetrics>(
    () => metrics ?? DEFAULT_METRICS,
  );
  const [announcement, setAnnouncement] = React.useState("");

  // An external override resets the walk (render-phase state adjustment).
  const [prevMetrics, setPrevMetrics] = React.useState(metrics);
  if (metrics !== prevMetrics) {
    setPrevMetrics(metrics);
    if (metrics) {
      setData(metrics);
      setTick(0);
    }
  }

  // Clear the live region so the next refresh announces again.
  React.useEffect(() => {
    if (announcement === "") return;
    const timer = window.setTimeout(() => setAnnouncement(""), 1500);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  const refresh = () => {
    const nextTick = tick + 1;
    const rand = lcg((Math.imul(nextTick, 0x9e3779b1) ^ 0x85ebca6b) >>> 0);
    setTick(nextTick);
    setData(walkMetrics(data, rand));
    setAnnouncement("Metrics refreshed");
  };

  const { counter, sparkline, flap, gauge } = data;

  return (
    <div className={cn("w-full max-w-md", className)}>
      <div className="mb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh metrics"
          className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-2 px-2.5 py-1.5 font-mono text-[11px] font-medium tracking-[0.08em] uppercase transition-colors"
        >
          <RefreshCw aria-hidden className="size-3" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          index={0}
          motionSafe={motionSafe}
          label={counter.label}
          srValue={`${counter.value.toLocaleString("en-US")}${counter.unit ? ` ${counter.unit}` : ""}`}
          footnote={counter.unit}
        >
          <Readout
            size="lg"
            value={counter.value}
            delta={counter.delta}
            className="font-semibold"
          />
        </MetricCard>

        <MetricCard
          index={1}
          motionSafe={motionSafe}
          label={sparkline.label}
          srValue={sparkline.caption}
          footnote={sparkline.caption}
        >
          <Sparkline
            points={sparkline.points}
            tick={tick}
            motionSafe={motionSafe}
          />
        </MetricCard>

        <MetricCard
          index={2}
          motionSafe={motionSafe}
          label={flap.label}
          srValue={flap.value}
          footnote={flap.caption}
        >
          <Flapboard
            value={flap.value}
            size="sm"
            chars=" 0123456789.+-%"
            padTo={6}
            align="right"
          />
        </MetricCard>

        <MetricCard
          index={3}
          motionSafe={motionSafe}
          label={gauge.label}
          srValue={`${formatGauge(gauge.value)} percent`}
          footnote={gauge.caption}
        >
          <GaugeDial value={gauge.value} motionSafe={motionSafe} />
          <span className="sr-only">{formatGauge(gauge.value)}%</span>
        </MetricCard>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
