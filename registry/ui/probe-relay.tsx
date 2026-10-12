"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import { Globe, Play, RotateCcw, TriangleAlert } from "lucide-react";

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

export type ProbeRegion = {
  id: string;
  /** The city, e.g. "Frankfurt". */
  label: string;
  /** Its short code, drawn beside the node, e.g. "FRA". */
  code: string;
  /** The round trip the simulator centres on, in ms. */
  baseline: number;
  /** How often the simulator fails a probe from here, 0 to 1. @default 0.03 */
  flakiness?: number;
};

/** Where one round trip went, in ms; the four add up to the latency. */
export type ProbeBreakdown = {
  dns: number;
  connect: number;
  tls: number;
  firstByte: number;
};

/** What one probe measured; the host's `onProbe` returns one of these. */
export type ProbeSample = {
  ok: boolean;
  /** The round trip in ms; on a failure, how long it waited. */
  latency: number;
  breakdown?: ProbeBreakdown;
  /** Why it failed, e.g. "Timeout after 2 s". */
  error?: string;
};

export type ProbeResult = ProbeSample & {
  regionId: string;
  /** When it landed, in ms. */
  at: number;
};

/** Each region's history, oldest first. */
export type ProbeResults = Record<string, ProbeResult[]>;

export type ProbeStatus = "ready" | "loading" | "error";
export type ProbeLayout = "arc" | "ring" | "list";
export type ProbePulse = "dot" | "comet" | "dash";
export type ProbeAccent = "cobalt" | "signal" | "success";

export type ProbeRelayProps = {
  /** The regions probed, in list order. @default defaultProbeRegions */
  regions?: ProbeRegion[];
  /** The endpoint every probe is sent to, as shown under the hub. @default "api.fieldline.dev/health" */
  endpoint?: string;
  /** Controlled histories, one list per region id. */
  results?: ProbeResults;
  /** Initial histories when uncontrolled. @default defaultProbeResults */
  defaultResults?: ProbeResults;
  /** Fires as each probe lands, with every history and the result that landed. */
  onResultsChange?: (results: ProbeResults, result: ProbeResult) => void;
  /** Runs one probe: resolves with what it measured. Its pulse lands when it resolves. @default defaultProbeSimulator */
  onProbe?: (
    region: ProbeRegion,
    endpoint: string,
  ) => Promise<ProbeSample> | ProbeSample;
  /** Controlled selection: the region whose spoke is lit and whose breakdown shows. */
  value?: string | null;
  /** Initial selection when uncontrolled. @default null */
  defaultValue?: string | null;
  /** The selection changed, from a press or Enter. */
  onChange?: (regionId: string | null) => void;
  /** Results each region's strip keeps. @default 12 */
  historyLength?: number;
  /** How the nodes sit around the hub: on an arc above it, in a ring around it, or in a column beside it. @default "arc" */
  layout?: ProbeLayout;
  /** What travels the spoke: a dot, a dot with a tail, or a short dash. @default "dot" */
  pulse?: ProbePulse;
  /** The colour of pulses, lit spokes and the selection. @default "cobalt" */
  accent?: ProbeAccent;
  /** Whether the regions have arrived. @default "ready" */
  status?: ProbeStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Probe relay" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the list scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing runs and the selection cannot change. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Six Fieldline probe regions, closest to the endpoint first. */
export const defaultProbeRegions: ProbeRegion[] = [
  { id: "fra", label: "Frankfurt", code: "FRA", baseline: 14 },
  { id: "dub", label: "Dublin", code: "DUB", baseline: 28 },
  { id: "iad", label: "Ashburn", code: "IAD", baseline: 92 },
  {
    id: "sin",
    label: "Singapore",
    code: "SIN",
    baseline: 162,
    flakiness: 0.06,
  },
  { id: "gru", label: "Sao Paulo", code: "GRU", baseline: 188, flakiness: 0.2 },
  { id: "syd", label: "Sydney", code: "SYD", baseline: 234, flakiness: 0.1 },
];

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAILURES = [
  "Timeout after 2 s",
  "TLS handshake failed",
  "503 from upstream",
];

/** Measures one probe with a seeded generator: splits a round trip around the region's baseline. */
const measure = (rand: () => number, region: ProbeRegion): ProbeSample => {
  const flakiness = region.flakiness ?? 0.03;
  if (rand() < flakiness) {
    const which = Math.floor(rand() * FAILURES.length);
    const error = FAILURES[which] ?? FAILURES[0] ?? "Failed";
    return { ok: false, latency: which === 0 ? 2000 : 0, error };
  }
  const total = Math.max(
    6,
    Math.round(region.baseline * (0.82 + rand() * 0.42) + rand() * 6),
  );
  const dns = Math.round(total * (0.06 + rand() * 0.08));
  const connect = Math.round(total * (0.24 + rand() * 0.1));
  const tls = Math.round(total * (0.24 + rand() * 0.1));
  const firstByte = Math.max(1, total - dns - connect - tls);
  return {
    ok: true,
    latency: total,
    breakdown: { dns, connect, tls, firstByte },
  };
};

/** Friday 9 October 2026, 15:10 UTC: when the seeded histories end. */
export const defaultProbeNow = Date.UTC(2026, 9, 9, 15, 10);

/** Eight seeded results per region, one Sao Paulo timeout among them. */
export const defaultProbeResults: ProbeResults = (() => {
  const rand = mulberry32(1652);
  const out: ProbeResults = {};
  for (const region of defaultProbeRegions) {
    const list: ProbeResult[] = [];
    for (let i = 0; i < 8; i += 1) {
      const sample = measure(rand, { ...region, flakiness: 0 });
      list.push({
        ...sample,
        regionId: region.id,
        at: defaultProbeNow - (8 - i) * 60_000,
      });
    }
    out[region.id] = list;
  }
  const gru = out.gru;
  const sixth = gru?.[5];
  if (gru && sixth) {
    gru[5] = {
      regionId: "gru",
      at: sixth.at,
      ok: false,
      latency: 2000,
      error: "Timeout after 2 s",
    };
  }
  return out;
})();

/**
 * A probe that resolves after its own latency, so far regions land later
 * than near ones. Seeded, so a page shows the same run each time it loads.
 */
export const createProbeSimulator = (
  seed = 1652,
  /** Longest wait before a probe resolves, in ms. @default 1400 */
  cap = 1400,
) => {
  const rand = mulberry32(seed);
  return (region: ProbeRegion): Promise<ProbeSample> => {
    const sample = measure(rand, region);
    const wait = Math.min(cap, sample.ok ? sample.latency : cap);
    return new Promise((resolve) => {
      setTimeout(() => resolve(sample), wait);
    });
  };
};

export const defaultProbeSimulator = createProbeSimulator();

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<ProbeAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const VB_W = 360;
const VB_H = 220;
/** Where a pulse waits for its result, as a fraction of the spoke. */
const HOLD = 0.82;
const LAND_MS = 360;
const FAIL_MS = 320;
const FLASH_MS = 520;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};
/** Stamps a landing. Only a promise callback reads the clock, never render. */
const readClock = () => Date.now();

type Pt = { x: number; y: number };
type Anchor = "start" | "middle" | "end";
type Geometry = {
  hub: Pt;
  nodes: Pt[];
  labels: { at: Pt; anchor: Anchor }[];
};

const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: r3(a.x + (b.x - a.x) * t),
  y: r3(a.y + (b.y - a.y) * t),
});

const anchorFor = (cos: number): Anchor =>
  cos < -0.35 ? "end" : cos > 0.35 ? "start" : "middle";

/** Node, label and hub positions in the diagram's 360 x 220 box. */
function geometryFor(layout: ProbeLayout, n: number): Geometry {
  const nodes: Pt[] = [];
  const labels: Geometry["labels"] = [];
  if (layout === "list") {
    const hub = { x: 312, y: 110 };
    for (let i = 0; i < n; i += 1) {
      const y = r3(n === 1 ? 110 : 24 + (172 * (i + 0.5)) / n);
      nodes.push({ x: 52, y });
      labels.push({ at: { x: 40, y: y + 3.5 }, anchor: "end" });
    }
    return { hub, nodes, labels };
  }
  const ring = layout === "ring";
  const hub = ring ? { x: 180, y: 110 } : { x: 180, y: 178 };
  const r = ring ? 78 : 122;
  for (let i = 0; i < n; i += 1) {
    const a = ring
      ? -Math.PI / 2 + (2 * Math.PI * i) / n
      : -Math.PI + (Math.PI * (i + 0.5)) / n;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    nodes.push({ x: r3(hub.x + r * cos), y: r3(hub.y + r * sin) });
    const anchor = anchorFor(cos);
    const lr = r + 16;
    labels.push({
      at: {
        x: r3(hub.x + lr * cos),
        y: r3(
          hub.y + lr * sin + (anchor === "middle" ? (sin < 0 ? 0 : 7) : 3.5),
        ),
      },
      anchor,
    });
  }
  return { hub, nodes, labels };
}

const latestOf = (list: ProbeResult[] | undefined) =>
  list && list.length > 0 ? list[list.length - 1] : undefined;

const rateOf = (list: ProbeResult[] | undefined) => {
  if (!list || list.length === 0) return null;
  return Math.round((100 * list.filter((r) => r.ok).length) / list.length);
};

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] ?? 0;
  const lo = sorted[mid - 1] ?? hi;
  return sorted.length % 2 ? hi : Math.round((lo + hi) / 2);
};

type Flight = {
  seq: number;
  phase: "out" | "landing" | "failed";
  /** Seconds before it departs, for a cascade. */
  delay: number;
};

type Flash = { id: number; failed: boolean };

const SEGMENTS: { key: keyof ProbeBreakdown; label: string; mix: number }[] = [
  { key: "dns", label: "DNS", mix: 40 },
  { key: "connect", label: "Connect", mix: 60 },
  { key: "tls", label: "TLS", mix: 80 },
  { key: "firstByte", label: "First byte", mix: 100 },
];

/* ----------------------------------------------------------------------- */
/*                               History strip                              */
/* ----------------------------------------------------------------------- */

function HistoryStrip({
  list,
  length,
  motionSafe,
}: {
  list: ProbeResult[];
  length: number;
  motionSafe: boolean;
}) {
  const shown = list.slice(-length);
  const empties = Math.max(0, length - shown.length);
  return (
    <span
      aria-hidden
      className="flex h-2 items-stretch gap-[2px]"
      style={{ width: length * 7 - 2 }}
    >
      {Array.from({ length: empties }, (_, i) => (
        <span
          key={`e-${i}`}
          className="w-[5px] shrink-0 rounded-[1px] bg-surface-2"
        />
      ))}
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((result) => (
          <motion.span
            key={result.at}
            layout={motionSafe ? "position" : false}
            initial={motionSafe ? { scaleY: 0.2, opacity: 0 } : { opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              layout: springs.glide,
              scaleY: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
            className={cn(
              "w-[5px] shrink-0 rounded-[1px]",
              result.ok ? "bg-(--pr-ok)" : "bg-danger",
            )}
            style={{ originY: 1 }}
          />
        ))}
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Region row                                */
/* ----------------------------------------------------------------------- */

type RowProps = {
  region: ProbeRegion;
  list: ProbeResult[];
  flight: Flight | undefined;
  selected: boolean;
  focusable: boolean;
  historyLength: number;
  motionSafe: boolean;
  disabled: boolean;
  optionId: string;
  /** Fades in when it mounts after the page is live, in a cascade by index. */
  enter: boolean;
  index: number;
  nodeRef: (node: HTMLLIElement | null) => void;
  onSelect: () => void;
  onRun: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function RegionRow({
  region,
  list,
  flight,
  selected,
  focusable,
  historyLength,
  motionSafe,
  disabled,
  optionId,
  enter,
  index,
  nodeRef,
  onSelect,
  onRun,
  onFocus,
  onBlur,
  onNav,
}: RowProps) {
  const latest = latestOf(list);
  const rate = rateOf(list);
  const pending = flight !== undefined && flight.phase !== "failed";
  const dotState = pending
    ? "pending"
    : latest
      ? latest.ok
        ? "ok"
        : "fail"
      : "none";
  const latencyText = latest
    ? latest.ok
      ? `${latest.latency} ms`
      : "failed"
    : "--";
  const spoken = [
    region.label,
    pending
      ? "probing"
      : latest
        ? latest.ok
          ? `${latest.latency} milliseconds`
          : `failed, ${latest.error ?? "no reply"}`
        : "not probed yet",
    rate === null ? null : `${rate} percent ok`,
    selected ? "selected" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <motion.li
      ref={nodeRef}
      id={optionId}
      role="option"
      aria-selected={selected}
      aria-label={spoken}
      aria-disabled={disabled || undefined}
      tabIndex={focusable ? 0 : -1}
      initial={
        enter ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: motionSafe
          ? { ...springs.glide, delay: r3(Math.min(index, 10) * cascade(10)) }
          : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSelect();
          return;
        }
        if (event.key === " ") {
          event.preventDefault();
          onRun();
          return;
        }
        onNav(event);
      }}
      className={cn(
        "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2.5 gap-y-1.5 rounded-2 px-2.5 py-2 transition-colors",
        selected ? "bg-surface-2" : "hover:bg-surface-1",
        disabled && "cursor-default",
        FOCUS_RING,
      )}
    >
      <span className="relative flex size-3 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={dotState}
            initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              scale: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
            className={cn(
              "absolute size-2 rounded-full",
              dotState === "ok" && "bg-(--pr-ok)",
              dotState === "fail" && "bg-danger",
              dotState === "pending" &&
                "border-[1.5px] border-(--pr-accent) bg-transparent",
              dotState === "none" && "border border-hairline-strong",
            )}
          />
        </AnimatePresence>
      </span>
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-[13px] text-foreground">
          {region.label}
        </span>
        <span className="hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[24rem]:inline">
          {region.code}
        </span>
      </span>
      <span className="relative w-[4.2rem] text-right font-mono text-[12px] tabular-nums">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={latest ? latest.at : "none"}
            initial={motionSafe ? { scale: 1.18, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              scale: motionSafe ? springs.flick : { duration: 0 },
              opacity: { duration: durations.fast, ease: easings.enter },
            }}
            className={cn(
              "inline-block",
              latest && !latest.ok
                ? "text-danger"
                : latest
                  ? "text-foreground"
                  : "text-ink-3",
              pending && "opacity-50",
            )}
            style={{ originX: 1 }}
          >
            {latencyText}
          </motion.span>
        </AnimatePresence>
      </span>
      <span
        className={cn(
          "w-9 text-right font-mono text-[11px] tabular-nums",
          rate === null
            ? "text-ink-3"
            : rate < 80
              ? "text-danger"
              : rate < 100
                ? "text-warn"
                : "text-ink-2",
        )}
      >
        {rate === null ? "--" : `${rate}%`}
      </span>
      <span className="col-span-full flex items-center gap-2 pl-[1.375rem]">
        <HistoryStrip
          list={list}
          length={historyLength}
          motionSafe={motionSafe}
        />
        {latest && !latest.ok ? (
          <span className="min-w-0 truncate text-[10px] text-ink-3">
            {latest.error}
          </span>
        ) : null}
      </span>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Diagram                                 */
/* ----------------------------------------------------------------------- */

function Pulse({
  from,
  to,
  flight,
  style,
  motionSafe,
}: {
  from: Pt;
  to: Pt;
  flight: Flight;
  style: ProbePulse;
  motionSafe: boolean;
}) {
  const failed = flight.phase === "failed";
  const t = flight.phase === "landing" ? 1 : HOLD;
  const head = motionSafe ? lerp(from, to, t) : lerp(from, to, 0.5);
  const tail = motionSafe
    ? lerp(from, to, Math.max(0, t - (style === "dash" ? 0.07 : 0.12)))
    : lerp(from, to, 0.5 - (style === "dash" ? 0.07 : 0.12));
  const start = lerp(from, to, 0);
  const color = failed ? "var(--danger)" : "var(--pr-accent)";
  const travel = motionSafe
    ? { ...springs.glide, delay: flight.phase === "out" ? flight.delay : 0 }
    : { duration: 0 };
  const fade = {
    duration: durations.fast,
    ease: easings.enter,
    delay: motionSafe ? flight.delay : 0,
  };
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ opacity: fade }}
    >
      {style !== "dot" ? (
        <motion.line
          initial={
            motionSafe
              ? { x1: start.x, y1: start.y, x2: start.x, y2: start.y }
              : false
          }
          animate={{
            x1: tail.x,
            y1: tail.y,
            x2: head.x,
            y2: head.y,
            stroke: color,
          }}
          transition={{
            x1: travel,
            y1: travel,
            x2: travel,
            y2: travel,
            stroke: { duration: durations.fast },
          }}
          strokeWidth={style === "dash" ? 3.5 : 2}
          strokeLinecap="round"
          strokeOpacity={style === "dash" ? 1 : 0.45}
        />
      ) : null}
      {style !== "dash" ? (
        <motion.circle
          initial={motionSafe ? { cx: start.x, cy: start.y } : false}
          animate={{ cx: head.x, cy: head.y, fill: color }}
          transition={{
            cx: travel,
            cy: travel,
            fill: { duration: durations.fast },
          }}
          r={3.5}
        />
      ) : null}
    </motion.g>
  );
}

function HubFlash({
  hub,
  flash,
  motionSafe,
}: {
  hub: Pt;
  flash: Flash;
  motionSafe: boolean;
}) {
  return (
    <motion.circle
      cx={hub.x}
      cy={hub.y}
      fill="none"
      stroke={flash.failed ? "var(--danger)" : "var(--pr-accent)"}
      strokeWidth={2}
      initial={motionSafe ? { r: 6, opacity: 0.9 } : { r: 14, opacity: 0.7 }}
      animate={{ r: motionSafe ? 18 : 14, opacity: 0 }}
      transition={{
        r: motionSafe ? springs.flick : { duration: 0 },
        opacity: { duration: durations.slow, ease: easings.exit },
      }}
    />
  );
}

type DiagramProps = {
  regions: ProbeRegion[];
  results: ProbeResults;
  flights: Record<string, Flight>;
  flashes: Flash[];
  layout: ProbeLayout;
  pulse: ProbePulse;
  selected: string | null;
  focused: string | null;
  motionSafe: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
};

function Diagram({
  regions,
  results,
  flights,
  flashes,
  layout,
  pulse,
  selected,
  focused,
  motionSafe,
  disabled,
  onSelect,
}: DiagramProps) {
  const geo = geometryFor(layout, regions.length);
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full select-none"
    >
      {/* Spokes first, so nodes and pulses sit over them. */}
      {regions.map((region, i) => {
        const node = geo.nodes[i];
        if (!node) return null;
        const latest = latestOf(results[region.id]);
        const flight = flights[region.id];
        const failed = flight
          ? flight.phase === "failed"
          : latest
            ? !latest.ok
            : false;
        const lit = selected === region.id || (flight !== undefined && !failed);
        return (
          <line
            key={region.id}
            x1={node.x}
            y1={node.y}
            x2={geo.hub.x}
            y2={geo.hub.y}
            stroke={
              failed
                ? "var(--danger)"
                : lit
                  ? "var(--pr-accent)"
                  : "var(--hairline-strong)"
            }
            strokeWidth={selected === region.id ? 2 : 1.25}
            strokeDasharray={failed ? "4 4" : undefined}
            strokeOpacity={failed ? 0.8 : lit ? 0.9 : 1}
            className="transition-[stroke,stroke-width,stroke-opacity] duration-200"
          />
        );
      })}

      <AnimatePresence>
        {regions.map((region, i) => {
          const node = geo.nodes[i];
          const flight = flights[region.id];
          if (!node || !flight) return null;
          return (
            <Pulse
              key={`${region.id}-${flight.seq}`}
              from={node}
              to={geo.hub}
              flight={flight}
              style={pulse}
              motionSafe={motionSafe}
            />
          );
        })}
      </AnimatePresence>

      {regions.map((region, i) => {
        const node = geo.nodes[i];
        const text = geo.labels[i];
        if (!node || !text) return null;
        const latest = latestOf(results[region.id]);
        const isSelected = selected === region.id;
        const failed = latest ? !latest.ok : false;
        return (
          <g
            key={region.id}
            onClick={() => {
              if (!disabled) onSelect(region.id);
            }}
            className={disabled ? undefined : "cursor-pointer"}
          >
            {focused === region.id ? (
              <circle
                cx={node.x}
                cy={node.y}
                r={11}
                fill="none"
                stroke="var(--pr-accent)"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
            ) : null}
            <motion.circle
              cx={node.x}
              cy={node.y}
              initial={false}
              animate={{ r: isSelected ? 7 : 5.5 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
              fill={
                isSelected
                  ? "var(--pr-accent)"
                  : failed
                    ? "var(--danger)"
                    : "var(--bg-0)"
              }
              stroke={
                isSelected
                  ? "var(--pr-accent)"
                  : failed
                    ? "var(--danger)"
                    : "var(--hairline-strong)"
              }
              strokeWidth={1.5}
              className="transition-[fill,stroke] duration-200"
            />
            <text
              x={text.at.x}
              y={text.at.y}
              textAnchor={text.anchor}
              className={cn(
                "fill-current font-mono text-[10px] tracking-[0.08em] uppercase",
                isSelected ? "text-foreground" : "text-ink-3",
              )}
            >
              {region.code}
            </text>
          </g>
        );
      })}

      {/* The hub: the endpoint every spoke runs to. */}
      <circle
        cx={geo.hub.x}
        cy={geo.hub.y}
        r={11}
        fill="var(--bg-0)"
        stroke="var(--hairline-strong)"
        strokeWidth={1.5}
      />
      <circle cx={geo.hub.x} cy={geo.hub.y} r={4} fill="var(--pr-accent)" />
      <AnimatePresence>
        {flashes.map((flash) => (
          <HubFlash
            key={flash.id}
            hub={geo.hub}
            flash={flash}
            motionSafe={motionSafe}
          />
        ))}
      </AnimatePresence>
    </svg>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Breakdown                                */
/* ----------------------------------------------------------------------- */

function Breakdown({
  region,
  latest,
  pending,
  motionSafe,
}: {
  region: ProbeRegion | undefined;
  latest: ProbeResult | undefined;
  pending: boolean;
  motionSafe: boolean;
}) {
  const parts = latest?.ok ? latest.breakdown : undefined;
  const total = parts
    ? Math.max(1, parts.dns + parts.connect + parts.tls + parts.firstByte)
    : 1;
  const failed = latest !== undefined && !latest.ok;
  const heading = !region
    ? "Select a region for its breakdown"
    : !latest
      ? `${region.label} has not been probed yet`
      : failed
        ? `${region.label} failed: ${latest.error ?? "no reply"}`
        : `${region.label} in ${latest.latency} ms`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[12px] text-ink-2">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Breakdown
          </span>
          <span aria-hidden className="mx-1.5 text-ink-3">
            ·
          </span>
          <span className={cn(failed && "text-danger")}>{heading}</span>
        </p>
        {pending ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-(--pr-accent) uppercase">
            Probing
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          "flex h-2 w-full overflow-hidden rounded-1 bg-surface-2",
          failed && "border border-dashed border-danger bg-transparent",
        )}
      >
        {SEGMENTS.map((segment, i) => (
          <motion.span
            key={segment.key}
            initial={false}
            animate={{
              width: `${parts ? (100 * parts[segment.key]) / total : 0}%`,
            }}
            transition={
              motionSafe
                ? { ...springs.glide, delay: r3(i * cascade(SEGMENTS.length)) }
                : { duration: 0 }
            }
            className="h-full shrink-0"
            style={{
              background: `color-mix(in oklab, var(--pr-accent) ${segment.mix}%, var(--bg-2))`,
            }}
          />
        ))}
      </div>
      <dl className="grid grid-cols-4 gap-2">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-[1px]"
                style={{
                  background: `color-mix(in oklab, var(--pr-accent) ${segment.mix}%, var(--bg-2))`,
                }}
              />
              <span className="truncate">{segment.label}</span>
            </dt>
            <dd className="font-mono text-[12px] text-foreground tabular-nums">
              {parts ? `${parts[segment.key]} ms` : "--"}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * Synthetic monitoring from several regions to one endpoint. The regions
 * are a list on the left with each one's last latency, success rate and a
 * strip of its last twelve results; on the right every region is a node on
 * an arc with the endpoint at the hub. Run probes sends a pulse out of every
 * node along its spoke on `springs.glide`, departing in a cascade; each one
 * waits near the hub until its probe resolves, so near regions land before
 * far ones, then glides the last stretch and lands with a ring that opens on
 * `springs.flick`. The landing writes the latency into the row, where it
 * ticks in on the same spring, and a new cell enters the strip on
 * `springs.snap` while the oldest leaves. A failed probe turns its spoke
 * dashed red, drops its pulse where it was and turns the row's dot red.
 *
 * Selecting a region lights its spoke and opens its breakdown: DNS,
 * connect, TLS and first byte as a stacked bar whose segments glide to
 * their lengths. The pulses are the only motion and they run on demand:
 * nothing moves once every probe has landed.
 *
 * The regions are a listbox: Up and Down move, Home and End jump, Enter
 * selects, Space runs that one region's probe, Escape clears the
 * selection, and the node of the focused row is ringed in the diagram.
 * Under reduced motion no pulse travels: a marker sits on the spoke while
 * the probe is out, the landing cross-fades, and every latency, dot, cell
 * and bar still changes.
 */
export function ProbeRelay({
  regions = defaultProbeRegions,
  endpoint = "api.fieldline.dev/health",
  results,
  defaultResults = defaultProbeResults,
  onResultsChange,
  onProbe = defaultProbeSimulator,
  value,
  defaultValue = null,
  onChange,
  historyLength = 12,
  layout = "arc",
  pulse = "dot",
  accent = "cobalt",
  status = "ready",
  onRetry,
  title = "Probe relay",
  label,
  height = 540,
  disabled = false,
  className,
}: ProbeRelayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<ProbeResults>(defaultResults);
  const current = results ?? own;
  const [ownSelected, setOwnSelected] = React.useState<string | null>(
    defaultValue,
  );
  const selectedRaw = value !== undefined ? value : ownSelected;
  const selected =
    selectedRaw && regions.some((r) => r.id === selectedRaw)
      ? selectedRaw
      : null;

  const [flights, setFlights] = React.useState<Record<string, Flight>>({});
  const [flashes, setFlashes] = React.useState<Flash[]>([]);
  const [focused, setFocused] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration; true once the page is live.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const ready = status === "ready";
  const inert = disabled || !ready;
  const keep = Math.max(1, Math.round(historyLength));

  // Landings arrive from promises, so they read the latest histories,
  // flights and preference from refs rather than a stale closure. Each is
  // also written synchronously where it changes, so two landings in one
  // tick chain correctly; the effect only tracks what the host changes.
  const resultsRef = React.useRef(current);
  const flightsRef = React.useRef(flights);
  const motionRef = React.useRef(motionSafe);
  React.useEffect(() => {
    resultsRef.current = current;
    flightsRef.current = flights;
    motionRef.current = motionSafe;
  }, [current, flights, motionSafe]);
  const alive = React.useRef(true);
  const seq = React.useRef(0);
  const flashSeq = React.useRef(0);
  const batch = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());

  const later = React.useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      if (alive.current) fn();
    }, ms);
    timers.current.add(id);
  }, []);

  React.useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  /* ------------------------------ selection ----------------------------- */

  const select = (id: string | null) => {
    if (inert) return;
    if (id === selected) return;
    if (value === undefined) setOwnSelected(id);
    onChange?.(id);
    const region = regions.find((r) => r.id === id);
    setAnnouncement(
      region ? `${region.label} selected.` : "Selection cleared.",
    );
  };

  /* ------------------------------- probing ------------------------------ */

  const commit = (result: ProbeResult) => {
    const base = resultsRef.current;
    const list = [...(base[result.regionId] ?? []), result].slice(-keep);
    const next: ProbeResults = { ...base, [result.regionId]: list };
    resultsRef.current = next;
    if (results === undefined) setOwn(next);
    onResultsChange?.(next, result);
  };

  const dropFlight = (id: string, at: number) => {
    setFlights((f) => {
      if (f[id]?.seq !== at) return f;
      const rest = { ...f };
      delete rest[id];
      return rest;
    });
  };

  const flash = (failed: boolean) => {
    flashSeq.current += 1;
    const id = flashSeq.current;
    setFlashes((list) => [...list, { id, failed }]);
    later(FLASH_MS, () =>
      setFlashes((list) => list.filter((x) => x.id !== id)),
    );
  };

  const summarise = () => {
    batch.current -= 1;
    if (batch.current > 0) return;
    batch.current = 0;
    const latest = regions
      .map((r) => latestOf(resultsRef.current[r.id]))
      .filter((r): r is ProbeResult => r !== undefined);
    const ok = latest.filter((r) => r.ok);
    const slowest = ok.reduce<ProbeResult | null>(
      (acc, r) => (acc === null || r.latency > acc.latency ? r : acc),
      null,
    );
    const slowName = slowest
      ? regions.find((r) => r.id === slowest.regionId)?.label
      : undefined;
    setAnnouncement(
      `All probes landed. ${ok.length} of ${latest.length} ok${
        slowest && slowName
          ? `, slowest ${slowName} at ${slowest.latency} milliseconds`
          : ""
      }.`,
    );
  };

  const arrive = (region: ProbeRegion, at: number, sample: ProbeSample) => {
    if (!alive.current) return;
    if (flightsRef.current[region.id]?.seq !== at) return;
    const result: ProbeResult = {
      ...sample,
      regionId: region.id,
      at: readClock(),
    };
    if (!sample.ok) {
      commit(result);
      setFlights((f) => ({
        ...f,
        [region.id]: { seq: at, phase: "failed", delay: 0 },
      }));
      setAnnouncement(`${region.label} failed: ${sample.error ?? "no reply"}.`);
      later(FAIL_MS, () => {
        dropFlight(region.id, at);
        summarise();
      });
      return;
    }
    setFlights((f) => ({
      ...f,
      [region.id]: { seq: at, phase: "landing", delay: 0 },
    }));
    later(motionRef.current ? LAND_MS : 0, () => {
      commit(result);
      dropFlight(region.id, at);
      flash(false);
      setAnnouncement(`${region.label} ${sample.latency} milliseconds.`);
      summarise();
    });
  };

  const launch = (region: ProbeRegion, delay: number) => {
    seq.current += 1;
    const at = seq.current;
    batch.current += 1;
    setFlights((f) => ({
      ...f,
      [region.id]: { seq: at, phase: "out", delay },
    }));
    flightsRef.current = {
      ...flightsRef.current,
      [region.id]: { seq: at, phase: "out", delay },
    };
    let promise: Promise<ProbeSample>;
    try {
      promise = Promise.resolve(onProbe(region, endpoint));
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise.then(
      (sample) => arrive(region, at, sample),
      (error: unknown) =>
        arrive(region, at, {
          ok: false,
          latency: 0,
          error: error instanceof Error ? error.message : "Probe threw",
        }),
    );
  };

  const runOne = (region: ProbeRegion) => {
    if (inert) return;
    const flight = flightsRef.current[region.id];
    if (flight && flight.phase !== "failed") return;
    setAnnouncement(`Probing ${region.label}.`);
    launch(region, 0);
  };

  const runAll = () => {
    if (inert || regions.length === 0) return;
    const step = cascade(regions.length);
    const idle = regions.filter((r) => {
      const flight = flightsRef.current[r.id];
      return !flight || flight.phase === "failed";
    });
    if (idle.length === 0) return;
    setAnnouncement(
      `Probing ${idle.length} ${idle.length === 1 ? "region" : "regions"}.`,
    );
    idle.forEach((region, i) => launch(region, r3(i * step)));
  };

  /* ------------------------------ keyboard ------------------------------ */

  const activeOption =
    activeId && regions.some((r) => r.id === activeId)
      ? activeId
      : (regions[0]?.id ?? null);

  const onNav = (event: React.KeyboardEvent, i: number) => {
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = regions.length - 1;
    else if (event.key === "Escape") {
      if (selected === null) return;
      event.preventDefault();
      select(null);
      return;
    } else return;
    event.preventDefault();
    const target = regions[clamp(to, 0, regions.length - 1)];
    if (target) rowNodes.current.get(target.id)?.focus({ preventScroll: true });
  };

  /* -------------------------------- render ------------------------------ */

  const running = Object.values(flights).some((f) => f.phase !== "failed");
  const latestAll = regions
    .map((r) => latestOf(current[r.id]))
    .filter((r): r is ProbeResult => r !== undefined);
  const okCount = latestAll.filter((r) => r.ok).length;
  const p50 = median(latestAll.filter((r) => r.ok).map((r) => r.latency));
  const selectedRegion = regions.find((r) => r.id === selected);
  const selectedFlight = selected ? flights[selected] : undefined;
  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;

  const body =
    status === "error" ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The regions didn&apos;t load.</p>
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
    ) : status === "loading" ? (
      <div
        aria-hidden
        className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @min-[40rem]:grid-cols-[17rem_minmax(0,1fr)] @min-[40rem]:grid-rows-1"
      >
        <div className="order-2 flex flex-col gap-2 px-3 py-2 @min-[40rem]:order-1 @min-[40rem]:border-r @min-[40rem]:border-hairline">
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className="h-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        <div className="order-1 flex items-center justify-center p-6 @min-[40rem]:order-2">
          <span className="size-28 rounded-full border-2 border-dashed border-hairline-strong motion-safe:animate-pulse @min-[40rem]:size-40" />
        </div>
      </div>
    ) : regions.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <Globe aria-hidden className="size-5 text-ink-3" />
        <p className="text-sm text-foreground">No regions configured.</p>
        <p className="max-w-[24rem] text-[12px] text-ink-3">
          Add a probe region and it will appear here as a node with a spoke to{" "}
          <span className="font-mono">{endpoint}</span>.
        </p>
      </div>
    ) : (
      <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @min-[40rem]:grid-cols-[17rem_minmax(0,1fr)] @min-[40rem]:grid-rows-1">
        <div className="order-2 flex min-h-0 flex-col border-t border-hairline @min-[40rem]:order-1 @min-[40rem]:border-t-0 @min-[40rem]:border-r">
          <ul
            role="listbox"
            aria-label="Regions"
            aria-describedby={hintId}
            aria-disabled={inert || undefined}
            className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5 py-1.5"
          >
            {regions.map((region, i) => (
              <RegionRow
                key={region.id}
                region={region}
                list={current[region.id] ?? []}
                flight={flights[region.id]}
                selected={selected === region.id}
                focusable={activeOption === region.id}
                historyLength={keep}
                motionSafe={motionSafe}
                disabled={inert}
                optionId={`${uid}-opt-${region.id}`}
                enter={live}
                index={i}
                nodeRef={(node) => {
                  if (node) rowNodes.current.set(region.id, node);
                  else rowNodes.current.delete(region.id);
                }}
                onSelect={() =>
                  select(selected === region.id ? null : region.id)
                }
                onRun={() => runOne(region)}
                onFocus={() => {
                  setActiveId(region.id);
                  setFocused(region.id);
                }}
                onBlur={() => setFocused((f) => (f === region.id ? null : f))}
                onNav={(event) => onNav(event, i)}
              />
            ))}
          </ul>
        </div>
        <div className="order-1 flex min-h-0 flex-col @min-[40rem]:order-2">
          <div className="relative h-44 min-h-0 shrink-0 px-3 pt-2 @min-[40rem]:h-auto @min-[40rem]:flex-1 @min-[40rem]:shrink">
            <Diagram
              regions={regions}
              results={current}
              flights={flights}
              flashes={flashes}
              layout={layout}
              pulse={pulse}
              selected={selected}
              focused={focused}
              motionSafe={motionSafe}
              disabled={inert}
              onSelect={(id) => select(selected === id ? null : id)}
            />
            <p className="pointer-events-none absolute right-3 bottom-1 max-w-[60%] truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              <span aria-hidden>to </span>
              <span className="normal-case">{endpoint}</span>
            </p>
          </div>
          <div className="shrink-0 border-t border-hairline px-4 py-3">
            <Breakdown
              region={selectedRegion}
              latest={selected ? latestOf(current[selected]) : undefined}
              pending={
                selectedFlight !== undefined &&
                selectedFlight.phase !== "failed"
              }
              motionSafe={motionSafe}
            />
          </div>
        </div>
      </div>
    );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{
        height,
        ["--pr-accent" as string]: accentVar,
        ["--pr-ok" as string]: "var(--success)",
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between regions. Enter selects one, Space runs its
        probe, Escape clears the selection.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready && regions.length > 0 ? (
            <p className="hidden min-w-0 truncate font-mono text-[11px] text-ink-3 tabular-nums @min-[30rem]:block">
              {latestAll.length > 0 ? (
                <>
                  <span
                    className={cn(
                      okCount < latestAll.length ? "text-danger" : "text-ink-2",
                    )}
                  >
                    {okCount} of {regions.length} ok
                  </span>
                  {p50 !== null ? <> · p50 {p50} ms</> : null}
                </>
              ) : (
                "no results yet"
              )}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={runAll}
          aria-disabled={inert || running || regions.length === 0 || undefined}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-xs font-medium transition-colors",
            !inert && !running && regions.length > 0
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "cursor-default bg-surface-2 text-ink-3",
            FOCUS_RING,
          )}
        >
          <Play aria-hidden className="size-3.5" />
          {running ? "Probing" : "Run probes"}
        </button>
      </header>

      {body}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
