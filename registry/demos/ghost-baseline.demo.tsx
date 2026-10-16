"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultMetricComparisons,
  defaultMetricNow,
  defaultMetricSeries,
  GhostBaseline,
  type MetricRange,
  type MetricStatus,
} from "@/registry/ui/ghost-baseline";

export const tweaks = defineTweaks({
  ghostStyle: {
    kind: "choice",
    label: "Ghost",
    default: "dashed",
    options: ["dashed", "dotted", "area"],
    names: { dashed: "Dashed", dotted: "Dotted", area: "Area" },
  },
  lineWidth: {
    kind: "range",
    label: "Line",
    default: 1.5,
    min: 1,
    max: 3,
    step: 0.25,
    unit: "px",
  },
  palette: {
    kind: "choice",
    label: "Palette",
    default: "cobalt",
    options: ["cobalt", "mono", "warm", "cool"],
    names: { cobalt: "Cobalt", mono: "Mono", warm: "Warm", cool: "Cool" },
  },
});

const LOAD_MS = 600;
const SPAN_MS = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

/** The mean of one route's readings in a window. */
function meanOf(index: number, from: number, to: number) {
  const points = defaultMetricSeries[index]?.points ?? [];
  let sum = 0;
  let n = 0;
  for (const p of points) {
    if (p.t < from || p.t >= to || p.v === null) continue;
    sum += p.v;
    n += 1;
  }
  return n ? sum / n : null;
}

/**
 * Waylight's API team checks whether Thursday's 10:00 deploy slowed search.
 * The card turns last week on once it is in view, so the ghost sweeps in by
 * itself the first time; after that the visitor drives it. Every window
 * change goes through a short simulated load, and Fail next refresh shows the
 * last result surviving a failed one.
 */
export function GhostBaselineDemo({
  chrome = true,
  // The explorer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [range, setRange] = React.useState<MetricRange>({
    span: "24h",
    end: defaultMetricNow,
  });
  const [compare, setCompare] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<MetricStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const touched = React.useRef(false);
  const timer = React.useRef<number | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  // Once in view, the first time: last week slides in under today.
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let wait = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        wait = window.setTimeout(() => {
          if (!touched.current) setCompare((c) => c ?? "week");
        }, 900);
      },
      { threshold: 0.35 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      window.clearTimeout(wait);
    };
  }, [run]);

  const load = (fail: boolean) => {
    if (timer.current) window.clearTimeout(timer.current);
    setStatus("loading");
    timer.current = window.setTimeout(() => {
      setStatus(fail ? "error" : "ready");
      if (fail) setFailNext(false);
    }, LOAD_MS);
  };

  const explorer = (
    <GhostBaseline
      key={run}
      range={range}
      onRangeChange={(next) => {
        setRange(next);
        load(failNext);
      }}
      compare={compare}
      onCompareChange={(id) => {
        touched.current = true;
        setCompare(id);
      }}
      status={status}
      onRetry={() => load(false)}
      {...values}
    />
  );

  const summary = React.useMemo(() => {
    const c = defaultMetricComparisons.find((x) => x.id === compare);
    const to = range.end;
    const from = to - SPAN_MS[range.span];
    if (!c) return { label: "no comparison", delta: null as string | null };
    const a = meanOf(1, from, to);
    const b = meanOf(1, from - c.offset, to - c.offset);
    if (a === null || b === null) return { label: c.label, delta: null };
    const pct = Math.round(((a - b) / b) * 100);
    return {
      label: c.label,
      delta: `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`,
    };
  }, [compare, range]);

  if (!chrome) {
    return (
      <div ref={ref} className="w-full">
        {explorer}
      </div>
    );
  }

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={ref} className="flex w-full max-w-3xl flex-col gap-4">
      {explorer}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next refresh
        </button>
        <button
          type="button"
          onClick={() => {
            if (timer.current) window.clearTimeout(timer.current);
            touched.current = false;
            setRange({ span: "24h", end: defaultMetricNow });
            setCompare(null);
            setStatus("ready");
            setFailNext(false);
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">loading {range.span}</span>
        ) : status === "error" ? (
          <>
            <span className="text-signal">refresh failed</span> · last result
            kept
          </>
        ) : (
          <>
            <span className="text-signal">{range.span}</span> ·{" "}
            {summary.label.toLowerCase()}
            {summary.delta ? ` · /v1/search ${summary.delta} on average` : ""}
          </>
        )}
      </p>
    </div>
  );
}
