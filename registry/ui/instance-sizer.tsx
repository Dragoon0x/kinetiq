"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Check, Inbox, RotateCcw, Scale, TriangleAlert, X } from "lucide-react";

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

export type InstanceFamily = "general" | "compute" | "memory" | "storage";
export type InstanceCommitment = "hourly" | "1y" | "3y";
export type InstanceCostUnit = "month" | "hour";
export type InstanceDensity = "compact" | "cozy" | "roomy";
export type InstanceAccent = "cobalt" | "signal" | "success";
export type InstanceStatus = "ready" | "loading" | "error";

/** One instance type in the catalogue. */
export type InstanceSpec = {
  id: string;
  /** Catalogue name, e.g. "c2.xlarge". */
  name: string;
  family: InstanceFamily;
  vcpu: number;
  memoryGb: number;
  storageGb: number;
  /** On-demand price per hour in the base region. */
  hourly: number;
  /** Region ids it is sold in; absent means every region. */
  regions?: string[];
};

export type InstanceRegion = {
  id: string;
  /** The region's name, e.g. "Harbor East". */
  label: string;
  /** Its short code, e.g. "us-east-1". */
  code: string;
  /** Price against the base region: 1.08 is eight percent dearer. */
  multiplier: number;
};

/** A "recommend for" preset: the sliders it sets. */
export type InstanceWorkload = {
  id: string;
  label: string;
  vcpu: number;
  memoryGb: number;
  storageGb: number;
};

/** What the host asks for: the three sliders, the region and the commitment. */
export type InstanceRequirements = {
  vcpu: number;
  memoryGb: number;
  storageGb: number;
  region: string;
  commitment: InstanceCommitment;
};

/** The sliders' bounds; storage moves in steps of ten. */
export type InstanceRanges = {
  vcpu: [number, number];
  memoryGb: [number, number];
  storageGb: [number, number];
};

export type InstanceChangeField =
  | "vcpu"
  | "memoryGb"
  | "storageGb"
  | "region"
  | "commitment"
  | "workload"
  | "largest";

/** One catalogue entry priced and measured against the requirements. */
export type InstanceQuote = {
  instance: InstanceSpec;
  /** Price per hour in the chosen region at the chosen commitment. */
  hourly: number;
  /** Price per month, at 730 hours. */
  monthly: number;
  /** Meets every requirement and is sold in the region. */
  fits: boolean;
  /** Why it does not fit, in words; null when it does. */
  shortfall: string | null;
  /** The cheapest instance that fits. */
  best: boolean;
};

export type InstanceSizerProps = {
  /** The figure the cost panel leads with: per month or per hour; the other is printed under it. @default "month" */
  costUnit?: InstanceCostUnit;
  /** Padding, type size and row heights. @default "cozy" */
  density?: InstanceDensity;
  /** The colour of the slider fills, the best-fit mark and the compare ticks, from the theme's tokens. @default "cobalt" */
  accent?: InstanceAccent;
  /** The catalogue the requirements are matched against. @default defaultInstanceCatalogue */
  instances?: InstanceSpec[];
  /** The regions on offer, each with its price multiplier. @default defaultInstanceRegions */
  regions?: InstanceRegion[];
  /** The "recommend for" presets. @default defaultInstanceWorkloads */
  workloads?: InstanceWorkload[];
  /** The sliders' bounds. @default defaultInstanceRanges */
  ranges?: InstanceRanges;
  /** Controlled requirements. */
  value?: InstanceRequirements;
  /** Initial requirements when uncontrolled. @default defaultInstanceRequirements */
  defaultValue?: InstanceRequirements;
  /** Fires from the drag, press or key that changed a requirement, with the field it came from. */
  onChange?: (value: InstanceRequirements, field: InstanceChangeField) => void;
  /** Monthly budget; the budget line turns amber when the best fit costs more. 0 hides it. @default 300 */
  budget?: number;
  /** Controlled ids in the comparison tray. */
  compare?: string[];
  /** Initial ids in the tray when uncontrolled. @default defaultInstanceCompare */
  defaultCompare?: string[];
  /** An instance was added to or removed from the tray. */
  onCompareChange?: (ids: string[]) => void;
  /** Most instances the tray holds. @default 3 */
  compareLimit?: number;
  /** A row was activated with Enter or a press, with its quote. */
  onSelectInstance?: (quote: InstanceQuote) => void;
  /** Whether the catalogue and prices have arrived. @default "ready" */
  status?: InstanceStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Size an instance" */
  title?: string;
  /** The product, under the heading. @default "Basinworks Cloud" */
  product?: string;
  /** Printed before every price. @default "$" */
  currency?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the controls and the list scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be moved, picked or compared. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultInstanceRegions: InstanceRegion[] = [
  { id: "harbor", label: "Harbor East", code: "us-east-1", multiplier: 1 },
  { id: "basin", label: "Basin West", code: "us-west-2", multiplier: 1.04 },
  { id: "coldbrook", label: "Coldbrook", code: "eu-west-1", multiplier: 1.08 },
  { id: "fernmoor", label: "Fernmoor", code: "eu-north-1", multiplier: 1.1 },
  { id: "kestrel", label: "Kestrel", code: "ap-south-1", multiplier: 1.14 },
];

const spec = (
  id: string,
  family: InstanceFamily,
  vcpu: number,
  memoryGb: number,
  storageGb: number,
  hourly: number,
  regions?: string[],
): InstanceSpec => ({
  id: id.replace(".", "-"),
  name: id,
  family,
  vcpu,
  memoryGb,
  storageGb,
  hourly,
  ...(regions ? { regions } : {}),
});

/** Basinworks Cloud's catalogue: four families, eighteen sizes. */
export const defaultInstanceCatalogue: InstanceSpec[] = [
  spec("b1.small", "general", 1, 2, 20, 0.012),
  spec("b1.medium", "general", 2, 4, 40, 0.024),
  spec("b1.large", "general", 4, 8, 80, 0.048),
  spec("b1.xlarge", "general", 4, 16, 120, 0.078),
  spec("b1.2xlarge", "general", 8, 32, 200, 0.156),
  spec("c2.large", "compute", 4, 8, 60, 0.062),
  spec("c2.xlarge", "compute", 8, 16, 120, 0.124),
  spec("c2.2xlarge", "compute", 16, 32, 240, 0.248),
  spec("c2.4xlarge", "compute", 32, 64, 480, 0.496),
  spec("c2.8xlarge", "compute", 64, 128, 960, 0.992, ["harbor", "basin"]),
  spec("m3.large", "memory", 2, 16, 80, 0.066),
  spec("m3.xlarge", "memory", 4, 32, 160, 0.132),
  spec("m3.2xlarge", "memory", 8, 64, 320, 0.264),
  spec("m3.4xlarge", "memory", 16, 128, 640, 0.528),
  spec("m3.8xlarge", "memory", 32, 256, 1280, 1.056, ["harbor", "fernmoor"]),
  spec("s4.large", "storage", 4, 16, 1000, 0.118),
  spec("s4.xlarge", "storage", 8, 32, 2000, 0.236),
  spec("s4.2xlarge", "storage", 16, 64, 4000, 0.472),
];

export const defaultInstanceWorkloads: InstanceWorkload[] = [
  { id: "web", label: "Web app", vcpu: 2, memoryGb: 4, storageGb: 40 },
  { id: "db", label: "Database", vcpu: 8, memoryGb: 64, storageGb: 500 },
  { id: "batch", label: "Batch jobs", vcpu: 32, memoryGb: 64, storageGb: 200 },
  { id: "cache", label: "Cache", vcpu: 4, memoryGb: 32, storageGb: 20 },
];

export const defaultInstanceRanges: InstanceRanges = {
  vcpu: [1, 64],
  memoryGb: [1, 256],
  storageGb: [10, 2000],
};

export const defaultInstanceRequirements: InstanceRequirements = {
  vcpu: 4,
  memoryGb: 16,
  storageGb: 100,
  region: "harbor",
  commitment: "hourly",
};

export const defaultInstanceCompare: string[] = [];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Hours billed in a month. */
export const INSTANCE_HOURS = 730;

const COMMITMENTS: {
  id: InstanceCommitment;
  label: string;
  factor: number;
  note: string;
}[] = [
  { id: "hourly", label: "Hourly", factor: 1, note: "no term" },
  { id: "1y", label: "1 year", factor: 0.72, note: "-28%" },
  { id: "3y", label: "3 years", factor: 0.55, note: "-45%" },
];

/** What each resource weighs in a price, for the breakdown bar's splits. */
const RATES = { vcpu: 0.021, memoryGb: 0.0034, storageGb: 0.0001 };

const FAMILY_WORD: Record<InstanceFamily, string> = {
  general: "General",
  compute: "Compute",
  memory: "Memory",
  storage: "Storage",
};

const ACCENTS: Record<InstanceAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const DENSITY: Record<
  InstanceDensity,
  { pad: string; row: string; name: string; section: string }
> = {
  compact: {
    pad: "px-3 py-2",
    row: "py-1.5",
    name: "text-[12px]",
    section: "gap-3",
  },
  cozy: {
    pad: "px-4 py-3",
    row: "py-2",
    name: "text-[13px]",
    section: "gap-4",
  },
  roomy: {
    pad: "px-5 py-4",
    row: "py-2.5",
    name: "text-[14px]",
    section: "gap-5",
  },
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const commitmentOf = (id: InstanceCommitment) =>
  COMMITMENTS.find((c) => c.id === id) ?? COMMITMENTS[0];

/** "$312" for a month, "$0.427" for an hour. */
export const formatInstancePrice = (
  amount: number,
  unit: InstanceCostUnit,
  currency = "$",
) =>
  unit === "hour"
    ? `${currency}${amount.toFixed(3)}`
    : `${currency}${Math.round(amount).toLocaleString("en-US")}`;

const UNIT_WORD: Record<InstanceCostUnit, string> = {
  month: "a month",
  hour: "an hour",
};

/** Prices and measures every instance against the requirements, cheapest fit first. */
export const quoteInstances = (
  instances: InstanceSpec[],
  value: InstanceRequirements,
  regions: InstanceRegion[] = defaultInstanceRegions,
): InstanceQuote[] => {
  const region = regions.find((r) => r.id === value.region);
  const factor =
    (region?.multiplier ?? 1) * (commitmentOf(value.commitment)?.factor ?? 1);
  const quotes = instances.map((instance) => {
    const hourly = instance.hourly * factor;
    const sold = !instance.regions || instance.regions.includes(value.region);
    const reasons: string[] = [];
    if (!sold) reasons.push(`not sold in ${region?.label ?? value.region}`);
    if (instance.vcpu < value.vcpu)
      reasons.push(`${value.vcpu - instance.vcpu} vCPU short`);
    if (instance.memoryGb < value.memoryGb)
      reasons.push(`${value.memoryGb - instance.memoryGb} GB short on memory`);
    if (instance.storageGb < value.storageGb)
      reasons.push(
        `${value.storageGb - instance.storageGb} GB short on storage`,
      );
    const gap =
      (sold ? 0 : 10) +
      Math.max(0, (value.vcpu - instance.vcpu) / Math.max(1, value.vcpu)) +
      Math.max(
        0,
        (value.memoryGb - instance.memoryGb) / Math.max(1, value.memoryGb),
      ) +
      Math.max(
        0,
        (value.storageGb - instance.storageGb) / Math.max(1, value.storageGb),
      );
    return {
      quote: {
        instance,
        hourly,
        monthly: hourly * INSTANCE_HOURS,
        fits: reasons.length === 0,
        shortfall: reasons.length ? reasons.join(", ") : null,
        best: false,
      } as InstanceQuote,
      gap,
    };
  });
  quotes.sort((a, b) => {
    if (a.quote.fits !== b.quote.fits) return a.quote.fits ? -1 : 1;
    if (a.quote.fits) return a.quote.monthly - b.quote.monthly;
    return a.gap - b.gap || a.quote.monthly - b.quote.monthly;
  });
  const first = quotes[0];
  if (first && first.quote.fits) first.quote.best = true;
  return quotes.map((q) => q.quote);
};

/** The compute, memory and storage shares of an instance's price. */
const splitOf = (instance: InstanceSpec) => {
  const c = instance.vcpu * RATES.vcpu;
  const m = instance.memoryGb * RATES.memoryGb;
  const s = instance.storageGb * RATES.storageGb;
  const sum = Math.max(1e-6, c + m + s);
  return { compute: c / sum, memory: m / sum, storage: s / sum };
};

type SliderKey = "vcpu" | "memoryGb" | "storageGb";

const numPatch = (key: SliderKey, v: number): Partial<InstanceRequirements> => {
  const patch: Partial<InstanceRequirements> = {};
  patch[key] = v;
  return patch;
};

const roving = (key: string, index: number, count: number): number | null => {
  if (count === 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % count;
  if (key === "ArrowLeft" || key === "ArrowUp")
    return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
};

/* ----------------------------------------------------------------------- */
/*                               Rolling text                               */
/* ----------------------------------------------------------------------- */

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.2;

/** A price whose digits roll on snap; the currency sign and the point sit still. */
function RollText({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        // Keyed from the right, so a new leading digit slides in while the
        // ones already there keep rolling in place.
        const slot = chars.length - 1 - i;
        if (!/\d/.test(c)) {
          return (
            <span key={`s${slot}`} className="inline-block">
              {c}
            </span>
          );
        }
        return (
          <span
            key={`d${slot}`}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Slider                                  */
/* ----------------------------------------------------------------------- */

type SliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Printed beside the label and read as the value text. */
  valueText: string;
  /** Delay before the thumb travels, for a preset's cascade. */
  delay: number;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

/** One horizontal slider: drag anywhere on the track, or arrow the thumb. */
function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  valueText,
  delay,
  disabled,
  motionSafe,
  onChange,
  onCommit,
}: SliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<number | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const span = Math.max(1, max - min);
  const frac = clamp((value - min) / span, 0, 1);
  const labelId = `${id}-label`;

  const snapTo = (v: number) =>
    clamp(min + Math.round((v - min) / step) * step, min, max);

  const valueAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snapTo(min + x * span);
  };

  const moveBy = (steps: number) => {
    const next = snapTo(value + steps * step);
    if (next !== value) {
      onChange(next);
      onCommit(next);
    }
  };

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has nothing to capture; the thumb still tracks.
    }
    drag.current = event.pointerId;
    setDragging(true);
    const next = valueAt(event.clientX);
    if (next !== value) onChange(next);
    thumbRef.current?.focus({ preventScroll: true });
  };

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
    const next = valueAt(event.clientX);
    if (next !== value) onChange(next);
  };

  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current !== event.pointerId) return;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Never captured, or nothing to release.
    }
    drag.current = null;
    setDragging(false);
    onCommit(valueAt(event.clientX));
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const big = event.shiftKey ? 10 : 1;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        moveBy(big);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        moveBy(-big);
        break;
      case "PageUp":
        event.preventDefault();
        moveBy(10);
        break;
      case "PageDown":
        event.preventDefault();
        moveBy(-10);
        break;
      case "Home":
        event.preventDefault();
        if (value !== min) {
          onChange(min);
          onCommit(min);
        }
        break;
      case "End":
        event.preventDefault();
        if (value !== max) {
          onChange(max);
          onCommit(max);
        }
        break;
      default:
        break;
    }
  };

  const move =
    dragging || !motionSafe ? { duration: 0 } : { ...springs.snap, delay };
  const pct = `${r3(frac * 100)}%`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span
          id={labelId}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {label}
        </span>
        <span className="font-mono text-[12px] text-foreground tabular-nums">
          {valueText}
        </span>
      </div>
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn(
          "relative h-6 w-full touch-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2" />
        <motion.span
          aria-hidden
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-(--is-accent)"
          initial={false}
          animate={{ width: pct }}
          transition={move}
        />
        <motion.div
          ref={thumbRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valueText}
          aria-disabled={disabled || undefined}
          onKeyDown={onKey}
          initial={false}
          animate={{ left: pct }}
          transition={move}
          className={cn(
            "absolute top-1/2 -mt-2 -ml-2 size-4 rounded-full border-2 bg-card transition-colors",
            dragging ? "border-(--is-accent)" : "border-ink-2",
            FOCUS_RING,
          )}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                              Small controls                              */
/* ----------------------------------------------------------------------- */

/** The "recommend for" chips: one toolbar, each press sets the three sliders. */
function WorkloadChips({
  workloads,
  current,
  disabled,
  onPick,
}: {
  workloads: InstanceWorkload[];
  current: InstanceRequirements;
  disabled: boolean;
  onPick: (workload: InstanceWorkload) => void;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const [active, setActive] = React.useState<string | null>(null);
  const matched = workloads.find(
    (w) =>
      w.vcpu === current.vcpu &&
      w.memoryGb === current.memoryGb &&
      w.storageGb === current.storageGb,
  );
  const activeId =
    active && workloads.some((w) => w.id === active)
      ? active
      : (matched?.id ?? workloads[0]?.id ?? null);
  return (
    <div
      role="toolbar"
      aria-label="Recommend for"
      className="flex flex-wrap items-center gap-1.5"
    >
      <span className="mr-0.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        For
      </span>
      {workloads.map((w, i) => {
        const on = matched?.id === w.id;
        return (
          <button
            key={w.id}
            ref={(node) => {
              if (node) nodes.current.set(w.id, node);
              else nodes.current.delete(w.id);
            }}
            type="button"
            tabIndex={activeId === w.id ? 0 : -1}
            aria-pressed={on}
            aria-disabled={disabled || undefined}
            aria-label={`${w.label}: ${w.vcpu} vCPU, ${w.memoryGb} GB memory, ${w.storageGb} GB storage`}
            onFocus={() => setActive(w.id)}
            onClick={() => {
              if (!disabled) onPick(w);
            }}
            onKeyDown={(event) => {
              const to = roving(event.key, i, workloads.length);
              if (to === null) return;
              event.preventDefault();
              const target = workloads[to];
              if (target) nodes.current.get(target.id)?.focus();
            }}
            className={cn(
              "inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors",
              on
                ? "border-[color-mix(in_oklab,var(--is-accent)_40%,transparent)] bg-(--is-wash) text-(--is-accent)"
                : "border-hairline-strong bg-transparent text-ink-2 hover:bg-surface-2 hover:text-foreground",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {w.label}
          </button>
        );
      })}
    </div>
  );
}

/** The regions as one listbox; the selection follows the arrow keys. */
function RegionList({
  uid,
  regions,
  value,
  disabled,
  motionSafe,
  onPick,
}: {
  uid: string;
  regions: InstanceRegion[];
  value: string;
  disabled: boolean;
  motionSafe: boolean;
  onPick: (region: InstanceRegion) => void;
}) {
  const nodes = React.useRef(new Map<string, HTMLLIElement>());
  const selected = regions.some((r) => r.id === value)
    ? value
    : (regions[0]?.id ?? null);
  return (
    <ul
      role="listbox"
      aria-label="Region"
      className="flex flex-col gap-0.5 rounded-3 border border-hairline bg-surface-0 p-1"
    >
      {regions.map((region, i) => {
        const on = region.id === selected;
        const extra = Math.round((region.multiplier - 1) * 100);
        return (
          <li
            key={region.id}
            ref={(node) => {
              if (node) nodes.current.set(region.id, node);
              else nodes.current.delete(region.id);
            }}
            role="option"
            aria-selected={on}
            aria-disabled={disabled || undefined}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!disabled) onPick(region);
            }}
            onKeyDown={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                if (!disabled) onPick(region);
                return;
              }
              const to = roving(event.key, i, regions.length);
              if (to === null) return;
              event.preventDefault();
              const target = regions[to];
              if (!target) return;
              nodes.current.get(target.id)?.focus();
              if (!disabled) onPick(target);
            }}
            className={cn(
              "relative grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2 px-2.5 text-left text-xs transition-colors",
              on ? "text-foreground" : "text-ink-2 hover:text-foreground",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${uid}-region` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-2 bg-surface-2"
              />
            ) : null}
            <span className="relative flex min-w-0 items-baseline gap-1.5">
              <span className="truncate">{region.label}</span>
              <span className="hidden font-mono text-[10px] text-ink-3 @min-[52rem]:inline">
                {region.code}
              </span>
            </span>
            <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
              {extra === 0 ? "base" : `+${extra}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Hourly, one year, three years: a radio group drawn as a segmented control. */
function CommitmentControl({
  uid,
  value,
  disabled,
  motionSafe,
  onPick,
}: {
  uid: string;
  value: InstanceCommitment;
  disabled: boolean;
  motionSafe: boolean;
  onPick: (commitment: InstanceCommitment) => void;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  return (
    <div
      role="radiogroup"
      aria-label="Commitment"
      className="grid grid-cols-3 gap-0.5 rounded-3 border border-hairline bg-surface-0 p-1"
    >
      {COMMITMENTS.map((c, i) => {
        const on = c.id === value;
        return (
          <button
            key={c.id}
            ref={(node) => {
              if (node) nodes.current.set(c.id, node);
              else nodes.current.delete(c.id);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={disabled || undefined}
            aria-label={`${c.label}, ${c.note}`}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!disabled) onPick(c.id);
            }}
            onKeyDown={(event) => {
              const to = roving(event.key, i, COMMITMENTS.length);
              if (to === null) return;
              event.preventDefault();
              const target = COMMITMENTS[to];
              if (!target) return;
              nodes.current.get(target.id)?.focus();
              if (!disabled) onPick(target.id);
            }}
            className={cn(
              "relative flex h-9 flex-col items-center justify-center rounded-2 px-1 leading-none transition-colors",
              on ? "text-foreground" : "text-ink-2 hover:text-foreground",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
              FOCUS_RING,
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={motionSafe ? `${uid}-commit` : undefined}
                transition={springs.snap}
                className="absolute inset-0 rounded-2 bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_14%,transparent)] ring-1 ring-hairline"
              />
            ) : null}
            <span className="relative text-xs font-medium">{c.label}</span>
            <span
              className={cn(
                "relative mt-1 font-mono text-[10px] tabular-nums",
                on && c.id !== "hourly" ? "text-success" : "text-ink-3",
              )}
            >
              {c.note}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Cost panel                                */
/* ----------------------------------------------------------------------- */

const SPLIT_KEYS = ["compute", "memory", "storage"] as const;
const SPLIT_WORD = { compute: "Compute", memory: "Memory", storage: "Storage" };
const SPLIT_TONE = {
  compute: "var(--is-accent)",
  memory: "color-mix(in oklab, var(--is-accent) 55%, var(--bg-2))",
  storage: "color-mix(in oklab, var(--is-accent) 25%, var(--bg-2))",
};

function CostPanel({
  quote,
  count,
  costUnit,
  budget,
  currency,
  commitment,
  motionSafe,
  pad,
}: {
  quote: InstanceQuote | null;
  count: number;
  costUnit: InstanceCostUnit;
  budget: number;
  currency: string;
  commitment: InstanceCommitment;
  motionSafe: boolean;
  pad: string;
}) {
  const lead = quote
    ? costUnit === "month"
      ? quote.monthly
      : quote.hourly
    : null;
  const other = quote
    ? costUnit === "month"
      ? quote.hourly
      : quote.monthly
    : null;
  const otherUnit: InstanceCostUnit = costUnit === "month" ? "hour" : "month";
  const split = quote ? splitOf(quote.instance) : null;
  const budgetShown = budget > 0;
  const budgetInUnit = costUnit === "month" ? budget : budget / INSTANCE_HOURS;
  const over = quote !== null && budgetShown && quote.monthly > budget;
  const ratio = quote && budgetShown ? clamp(quote.monthly / budget, 0, 1) : 0;
  const bar = motionSafe ? springs.glide : { duration: 0 };
  const term = commitmentOf(commitment);

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-3 border-b border-hairline",
        pad,
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {quote ? `Best fit · ${quote.instance.name}` : "Best fit"}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="sr-only">
              {lead !== null
                ? `${formatInstancePrice(lead, costUnit, currency)} ${UNIT_WORD[costUnit]}`
                : "No price"}
            </span>
            {lead !== null ? (
              <RollText
                text={formatInstancePrice(lead, costUnit, currency)}
                motionSafe={motionSafe}
                className="text-2xl font-semibold text-foreground"
              />
            ) : (
              <span aria-hidden className="text-2xl font-semibold text-ink-3">
                --
              </span>
            )}
            <span aria-hidden className="text-xs text-ink-3">
              /{costUnit === "month" ? "mo" : "hr"}
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[11px] text-ink-2 tabular-nums">
            {other !== null
              ? `${formatInstancePrice(other, otherUnit, currency)} ${UNIT_WORD[otherUnit]}`
              : `${count} fit`}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-ink-3">
            {term?.id === "hourly" ? "on demand" : `${term?.label} term`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          aria-hidden
          className="flex h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          {SPLIT_KEYS.map((k) => (
            <motion.span
              key={k}
              className="h-full"
              style={{ background: SPLIT_TONE[k] }}
              initial={false}
              animate={{ width: `${split ? r3(split[k] * 100) : 0}%` }}
              transition={bar}
            />
          ))}
        </div>
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5">
          {SPLIT_KEYS.map((k) => (
            <div key={k} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ background: SPLIT_TONE[k] }}
              />
              <dt className="font-mono text-[10px] text-ink-3 uppercase">
                {SPLIT_WORD[k]}
              </dt>
              <dd className="font-mono text-[10px] text-ink-2 tabular-nums">
                {split ? `${Math.round(split[k] * 100)}%` : "--"}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {budgetShown ? (
        <div
          className={cn(
            "flex flex-col gap-1 transition-colors duration-200",
            over ? "text-warn" : "text-ink-2",
          )}
        >
          <div className="flex items-baseline justify-between gap-2 text-[11px]">
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase">
              Budget {formatInstancePrice(budgetInUnit, costUnit, currency)}/
              {costUnit === "month" ? "mo" : "hr"}
            </span>
            <span className="font-mono text-[10px] tabular-nums">
              {quote === null
                ? "nothing to price"
                : over
                  ? `over by ${formatInstancePrice(
                      costUnit === "month"
                        ? quote.monthly - budget
                        : quote.hourly - budgetInUnit,
                      costUnit,
                      currency,
                    )}`
                  : `${Math.round((1 - ratio) * 100)}% headroom`}
            </span>
          </div>
          <div
            aria-hidden
            className={cn(
              "relative h-1 w-full overflow-hidden rounded-full transition-colors duration-200",
              over
                ? "bg-[color-mix(in_oklab,var(--warn)_25%,transparent)]"
                : "bg-surface-2",
            )}
          >
            <motion.span
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-colors duration-200",
                over ? "bg-warn" : "bg-(--is-accent)",
              )}
              initial={false}
              animate={{ width: `${r3(ratio * 100)}%` }}
              transition={bar}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Compare tray                               */
/* ----------------------------------------------------------------------- */

function CompareTray({
  quotes,
  limit,
  costUnit,
  currency,
  live,
  disabled,
  motionSafe,
  pad,
  onRemove,
}: {
  quotes: InstanceQuote[];
  limit: number;
  costUnit: InstanceCostUnit;
  currency: string;
  live: boolean;
  disabled: boolean;
  motionSafe: boolean;
  pad: string;
  onRemove: (id: string) => void;
}) {
  const cheapest = quotes.reduce<InstanceQuote | null>(
    (acc, q) => (acc === null || q.monthly < acc.monthly ? q : acc),
    null,
  );
  return (
    <div className={cn("shrink-0 border-t border-hairline", pad)}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <Scale aria-hidden className="size-3" />
          Compare
          <span className="tabular-nums">
            {quotes.length}/{limit}
          </span>
        </p>
        {quotes.length === 0 ? (
          <p className="truncate text-[11px] text-ink-3">
            Space on a row adds it here
          </p>
        ) : null}
      </div>
      <AnimatePresence initial={false}>
        {quotes.length > 0 ? (
          <motion.div
            key="tray"
            role="table"
            aria-label="Compared instances"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
            className="overflow-hidden"
          >
            <div
              role="row"
              className="mt-2 grid gap-1.5"
              style={{
                gridTemplateColumns: `repeat(${quotes.length}, minmax(0, 1fr))`,
              }}
            >
              <AnimatePresence initial={false}>
                {quotes.map((q, i) => {
                  const lead = costUnit === "month" ? q.monthly : q.hourly;
                  const low = cheapest?.instance.id === q.instance.id;
                  return (
                    <motion.div
                      key={q.instance.id}
                      role="cell"
                      layout={motionSafe ? "position" : false}
                      initial={
                        live
                          ? {
                              opacity: 0,
                              y: motionSafe ? distances.step : 0,
                              scale: motionSafe ? 0.96 : 1,
                            }
                          : false
                      }
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 0.96 : 1,
                        transition: exitFor(durations.fast),
                      }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.recoil,
                              delay: r3(i * cascade(quotes.length)),
                              layout: springs.glide,
                              opacity: {
                                duration: durations.base,
                                ease: easings.enter,
                              },
                            }
                          : { duration: durations.fast }
                      }
                      className={cn(
                        "relative flex min-w-0 flex-col gap-1 rounded-3 border p-2",
                        low && quotes.length > 1
                          ? "border-[color-mix(in_oklab,var(--is-accent)_40%,transparent)] bg-(--is-wash)"
                          : "border-hairline bg-surface-0",
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="min-w-0">
                          <span className="block truncate font-mono text-[12px] text-foreground">
                            {q.instance.name}
                          </span>
                          <span className="block font-mono text-[10px] text-ink-3 uppercase">
                            {FAMILY_WORD[q.instance.family]}
                          </span>
                        </p>
                        <button
                          type="button"
                          aria-label={`Remove ${q.instance.name} from compare`}
                          aria-disabled={disabled || undefined}
                          onClick={() => {
                            if (!disabled) onRemove(q.instance.id);
                          }}
                          className={cn(
                            "-mt-0.5 -mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                            FOCUS_RING,
                          )}
                        >
                          <X aria-hidden className="size-3" />
                        </button>
                      </div>
                      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-1.5 font-mono text-[10px] tabular-nums">
                        <dt className="text-ink-3">vCPU</dt>
                        <dd className="text-ink-2">{q.instance.vcpu}</dd>
                        <dt className="text-ink-3">Mem</dt>
                        <dd className="text-ink-2">{q.instance.memoryGb} GB</dd>
                        <dt className="text-ink-3">Disk</dt>
                        <dd className="text-ink-2">
                          {q.instance.storageGb} GB
                        </dd>
                      </dl>
                      <p
                        className={cn(
                          "mt-0.5 font-mono text-[12px] tabular-nums",
                          low && quotes.length > 1
                            ? "text-(--is-accent)"
                            : "text-foreground",
                        )}
                      >
                        {formatInstancePrice(lead, costUnit, currency)}
                        <span className="text-[10px] text-ink-3">
                          /{costUnit === "month" ? "mo" : "hr"}
                        </span>
                      </p>
                      {!q.fits ? (
                        <p className="truncate text-[10px] text-warn">
                          {q.shortfall}
                        </p>
                      ) : null}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A sizer for a compute instance. Three sliders (vCPU, memory, storage), a
 * region listbox and a commitment control on the left; on the right the
 * catalogue, re-sorted as the requirements move, with the cost of the best
 * fit above it and a comparison tray below.
 *
 * Every move re-sorts the list on `springs.glide`: instances that fit rise
 * and sort by price, the cheapest takes a "Best fit" mark that lands on
 * `springs.recoil`, and the ones that fall short dim in place with a word on
 * what they lack. The cost panel rolls its monthly and hourly figures on
 * `springs.snap` while a breakdown bar glides to the compute, memory and
 * storage splits of the instance; a budget line under it turns amber and
 * says by how much when the best fit costs more. A "recommend for" chip sets
 * the three sliders in a cascade, each thumb leaving a beat after the last.
 * Space on a row adds it to the tray, where up to three instances sit side by
 * side, each column landing on recoil and the cheapest tinted.
 *
 * The sliders take arrows (Shift for ten), PageUp/PageDown and Home/End; the
 * region listbox and the commitment radios select as the arrows move; the
 * chips are one toolbar; and the list is a listbox where Up/Down move, Space
 * toggles compare and Enter selects. Every change is announced in words with
 * its consequence. Under reduced motion thumbs, rows and bars are placed and
 * the digits change in place.
 */
export function InstanceSizer({
  costUnit = "month",
  density = "cozy",
  accent = "cobalt",
  instances = defaultInstanceCatalogue,
  regions = defaultInstanceRegions,
  workloads = defaultInstanceWorkloads,
  ranges = defaultInstanceRanges,
  value,
  defaultValue = defaultInstanceRequirements,
  onChange,
  budget = 300,
  compare,
  defaultCompare = defaultInstanceCompare,
  onCompareChange,
  compareLimit = 3,
  onSelectInstance,
  status = "ready",
  onRetry,
  title = "Size an instance",
  product = "Basinworks Cloud",
  currency = "$",
  label,
  height = 540,
  disabled = false,
  className,
}: InstanceSizerProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-list`;

  const [own, setOwn] = React.useState<InstanceRequirements>(defaultValue);
  const current = value ?? own;
  const [ownCompare, setOwnCompare] = React.useState<string[]>(defaultCompare);
  const compared = compare ?? ownCompare;
  const ready = status === "ready";
  const inert = disabled || !ready;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [cascading, setCascading] = React.useState(false);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const cascadeTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (cascadeTimer.current !== null)
        window.clearTimeout(cascadeTimer.current);
    },
    [],
  );

  /* -------------------------------- data ------------------------------- */

  const quotes = React.useMemo(
    () => quoteInstances(instances, current, regions),
    [instances, current, regions],
  );
  const fitting = quotes.filter((q) => q.fits);
  const best = fitting[0] ?? null;
  const byId = new Map(quotes.map((q) => [q.instance.id, q]));
  const trayQuotes = compared
    .map((id) => byId.get(id))
    .filter((q): q is InstanceQuote => q !== undefined);
  const region = regions.find((r) => r.id === current.region);

  const summaryOf = (next: InstanceRequirements) => {
    const qs = quoteInstances(instances, next, regions);
    const fits = qs.filter((q) => q.fits);
    const top = fits[0];
    if (!top) return "Nothing in the catalogue fits.";
    const lead = costUnit === "month" ? top.monthly : top.hourly;
    const overBudget = budget > 0 && top.monthly > budget;
    return `${fits.length} ${fits.length === 1 ? "instance fits" : "instances fit"}, best ${top.instance.name} at ${formatInstancePrice(lead, costUnit, currency)} ${UNIT_WORD[costUnit]}${overBudget ? ", over budget" : ""}.`;
  };

  /* ------------------------------- changes ----------------------------- */

  const update = (
    patch: Partial<InstanceRequirements>,
    field: InstanceChangeField,
  ) => {
    const next = { ...current, ...patch };
    if (value === undefined) setOwn(next);
    onChange?.(next, field);
    return next;
  };

  const announce = (lead: string, next: InstanceRequirements) =>
    setAnnouncement(`${lead} ${summaryOf(next)}`);

  const pickWorkload = (w: InstanceWorkload) => {
    if (inert) return;
    const next = update(
      {
        vcpu: clamp(w.vcpu, ranges.vcpu[0], ranges.vcpu[1]),
        memoryGb: clamp(w.memoryGb, ranges.memoryGb[0], ranges.memoryGb[1]),
        storageGb: clamp(w.storageGb, ranges.storageGb[0], ranges.storageGb[1]),
      },
      "workload",
    );
    if (motionSafe) {
      setCascading(true);
      if (cascadeTimer.current !== null)
        window.clearTimeout(cascadeTimer.current);
      cascadeTimer.current = window.setTimeout(
        () => {
          cascadeTimer.current = null;
          setCascading(false);
        },
        Math.round((2 * cascade(3) + 0.4) * 1000),
      );
    }
    announce(
      `${w.label}: ${next.vcpu} vCPU, ${next.memoryGb} GB memory, ${next.storageGb} GB storage.`,
      next,
    );
  };

  const pickRegion = (r: InstanceRegion) => {
    if (inert || r.id === current.region) return;
    const next = update({ region: r.id }, "region");
    const extra = Math.round((r.multiplier - 1) * 100);
    announce(
      `Region ${r.label}${extra > 0 ? `, ${extra} percent dearer` : ""}.`,
      next,
    );
  };

  const pickCommitment = (c: InstanceCommitment) => {
    if (inert || c === current.commitment) return;
    const next = update({ commitment: c }, "commitment");
    const term = commitmentOf(c);
    announce(`${term?.label ?? c}, ${term?.note ?? ""}.`, next);
  };

  const fitLargest = () => {
    if (inert) return;
    const sold = instances.filter(
      (i) => !i.regions || i.regions.includes(current.region),
    );
    const largest = sold.reduce<InstanceSpec | null>(
      (acc, i) =>
        acc === null ||
        i.vcpu * i.memoryGb * i.storageGb >
          acc.vcpu * acc.memoryGb * acc.storageGb
          ? i
          : acc,
      null,
    );
    if (!largest) return;
    const next = update(
      {
        vcpu: clamp(largest.vcpu, ranges.vcpu[0], ranges.vcpu[1]),
        memoryGb: clamp(
          largest.memoryGb,
          ranges.memoryGb[0],
          ranges.memoryGb[1],
        ),
        storageGb: clamp(
          Math.min(largest.storageGb, current.storageGb),
          ranges.storageGb[0],
          ranges.storageGb[1],
        ),
      },
      "largest",
    );
    announce(`Fitted to ${largest.name}.`, next);
  };

  const toggleCompare = (id: string) => {
    if (inert) return;
    const q = byId.get(id);
    if (!q) return;
    const has = compared.includes(id);
    if (!has && compared.length >= compareLimit) {
      setAnnouncement(
        `Compare is full, ${compareLimit} of ${compareLimit}. Remove one first.`,
      );
      return;
    }
    const next = has ? compared.filter((k) => k !== id) : [...compared, id];
    if (compare === undefined) setOwnCompare(next);
    onCompareChange?.(next);
    setAnnouncement(
      `${q.instance.name} ${has ? "removed from" : "added to"} compare, ${next.length} of ${compareLimit}.`,
    );
  };

  /* -------------------------------- rows ------------------------------- */

  const activeId =
    activeRow && byId.has(activeRow)
      ? activeRow
      : (quotes[0]?.instance.id ?? null);

  const onRowKey = (
    event: React.KeyboardEvent,
    q: InstanceQuote,
    i: number,
  ) => {
    if (event.key === " ") {
      event.preventDefault();
      toggleCompare(q.instance.id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!disabled) onSelectInstance?.(q);
      return;
    }
    if (
      (event.key === "Delete" || event.key === "Backspace") &&
      compared.includes(q.instance.id)
    ) {
      event.preventDefault();
      toggleCompare(q.instance.id);
      return;
    }
    const to = roving(event.key, i, quotes.length);
    if (to === null) return;
    event.preventDefault();
    const target = quotes[to];
    if (target) rowNodes.current.get(target.instance.id)?.focus();
  };

  const step = cascade(Math.min(quotes.length, 12));
  const accentVar = ACCENTS[accent] ?? ACCENTS.cobalt;
  const sliderDelay = (i: number) => (cascading ? r3(i * cascade(3)) : 0);

  const sliders: {
    key: SliderKey;
    label: string;
    step: number;
    text: (v: number) => string;
  }[] = [
    { key: "vcpu", label: "vCPU", step: 1, text: (v) => `${v} vCPU` },
    { key: "memoryGb", label: "Memory", step: 1, text: (v) => `${v} GB` },
    { key: "storageGb", label: "Storage", step: 10, text: (v) => `${v} GB` },
  ];

  /* ------------------------------- render ------------------------------ */

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
        ["--is-accent" as string]: accentVar,
        ["--is-wash" as string]: `color-mix(in oklab, ${accentVar} 12%, transparent)`,
      }}
    >
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline",
          d.pad,
        )}
      >
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {product}
          </p>
        </div>
        {ready ? (
          <p className="flex shrink-0 items-baseline gap-1 text-[12px] text-ink-2">
            <span className="sr-only">
              {fitting.length} of {quotes.length} instances fit
            </span>
            <RollText
              text={String(fitting.length)}
              motionSafe={motionSafe}
              className="font-mono text-[13px] text-foreground"
            />
            <span aria-hidden>of {quotes.length}</span>
            <span aria-hidden className="hidden @min-[24rem]:inline">
              fit
            </span>
          </p>
        ) : null}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The catalogue didn&apos;t load.
          </p>
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
          className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden @min-[40rem]:grid-cols-[17rem_minmax(0,1fr)]"
        >
          <div className={cn("flex flex-col gap-4", d.pad)}>
            <div className="flex gap-1.5">
              {Array.from({ length: 3 }, (_, i) => (
                <span
                  key={i}
                  className="h-7 rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    width: 64 + ((i * 17) % 24),
                    animationDelay: `${i * 70}ms`,
                  }}
                />
              ))}
            </div>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <span className="h-2.5 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className="h-1 w-full rounded-full bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              </div>
            ))}
            <span className="h-24 w-full rounded-3 bg-surface-2 motion-safe:animate-pulse" />
          </div>
          <div className="hidden flex-col border-l border-hairline @min-[40rem]:flex">
            <div
              className={cn(
                "flex flex-col gap-3 border-b border-hairline",
                d.pad,
              )}
            >
              <span className="h-7 w-28 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
              <span className="h-2 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
            <div className={cn("flex flex-col gap-1.5", d.pad)}>
              {Array.from({ length: 7 }, (_, i) => (
                <span
                  key={i}
                  className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${i * 80}ms` }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <LayoutGroup id={uid}>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain @min-[40rem]:grid @min-[40rem]:grid-cols-[17rem_minmax(0,1fr)] @min-[40rem]:overflow-hidden">
            {/* ------------------------- controls ------------------------- */}
            <section
              aria-label="Requirements"
              className={cn(
                "flex shrink-0 flex-col border-b border-hairline @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:border-r @min-[40rem]:border-b-0",
                d.pad,
                d.section,
              )}
            >
              <WorkloadChips
                workloads={workloads}
                current={current}
                disabled={inert}
                onPick={pickWorkload}
              />
              <div className="flex flex-col gap-3">
                {sliders.map((s, i) => {
                  const [min, max] = ranges[s.key];
                  return (
                    <Slider
                      key={s.key}
                      id={`${uid}-${s.key}`}
                      label={s.label}
                      value={clamp(current[s.key], min, max)}
                      min={min}
                      max={max}
                      step={s.step}
                      valueText={s.text(current[s.key])}
                      delay={sliderDelay(i)}
                      disabled={inert}
                      motionSafe={motionSafe}
                      onChange={(v) => {
                        if (v !== current[s.key])
                          update(numPatch(s.key, v), s.key);
                      }}
                      onCommit={(v) =>
                        announce(`${s.label} ${s.text(v)}.`, {
                          ...current,
                          ...numPatch(s.key, v),
                        })
                      }
                    />
                  );
                })}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Region
                </span>
                <RegionList
                  uid={uid}
                  regions={regions}
                  value={current.region}
                  disabled={inert}
                  motionSafe={motionSafe}
                  onPick={pickRegion}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Commitment
                </span>
                <CommitmentControl
                  uid={uid}
                  value={current.commitment}
                  disabled={inert}
                  motionSafe={motionSafe}
                  onPick={pickCommitment}
                />
              </div>
            </section>

            {/* --------------------------- results ------------------------ */}
            <section
              aria-label="Instances"
              className="flex flex-col @min-[40rem]:min-h-0"
            >
              <CostPanel
                quote={best}
                count={fitting.length}
                costUnit={costUnit}
                budget={budget}
                currency={currency}
                commitment={current.commitment}
                motionSafe={motionSafe}
                pad={d.pad}
              />

              {quotes.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                  <Inbox aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm text-ink-2">The catalogue is empty.</p>
                </div>
              ) : fitting.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                  <Inbox aria-hidden className="size-5 text-ink-3" />
                  <p className="text-sm text-ink-2">
                    Nothing fits {current.vcpu} vCPU, {current.memoryGb} GB and{" "}
                    {current.storageGb} GB in {region?.label ?? current.region}.
                  </p>
                  <button
                    type="button"
                    onClick={fitLargest}
                    aria-disabled={inert || undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    Fit the largest sold here
                  </button>
                </div>
              ) : null}

              {quotes.length > 0 ? (
                <ul
                  id={listId}
                  role="listbox"
                  aria-label="Instances, cheapest fit first"
                  aria-multiselectable
                  className={cn(
                    "relative flex flex-col @min-[40rem]:min-h-0 @min-[40rem]:flex-1 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain",
                    "px-2 py-1.5",
                    fitting.length === 0 && "border-t border-hairline",
                  )}
                >
                  {quotes.map((q, i) => {
                    const inTray = compared.includes(q.instance.id);
                    const lead = costUnit === "month" ? q.monthly : q.hourly;
                    const price = formatInstancePrice(lead, costUnit, currency);
                    const desc = [
                      `${q.instance.name}`,
                      `${q.instance.vcpu} vCPU, ${q.instance.memoryGb} GB memory, ${q.instance.storageGb} GB storage`,
                      `${price} ${UNIT_WORD[costUnit]}`,
                      q.best
                        ? "best fit"
                        : q.fits
                          ? "fits"
                          : `does not fit: ${q.shortfall}`,
                      inTray ? "in compare" : "",
                    ]
                      .filter(Boolean)
                      .join(", ");
                    return (
                      <motion.li
                        key={q.instance.id}
                        ref={(node) => {
                          if (node) rowNodes.current.set(q.instance.id, node);
                          else rowNodes.current.delete(q.instance.id);
                        }}
                        role="option"
                        aria-selected={inTray}
                        aria-label={desc}
                        aria-disabled={inert || undefined}
                        tabIndex={activeId === q.instance.id ? 0 : -1}
                        onFocus={() => setActiveRow(q.instance.id)}
                        onClick={() => {
                          if (!disabled) onSelectInstance?.(q);
                        }}
                        onKeyDown={(event) => onRowKey(event, q, i)}
                        layout={motionSafe ? "position" : false}
                        initial={false}
                        animate={{ opacity: q.fits ? 1 : 0.45 }}
                        transition={{
                          layout: {
                            ...springs.glide,
                            delay: r3(Math.min(i, 12) * step * 0.5),
                          },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                          },
                        }}
                        className={cn(
                          "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 rounded-2 px-2 transition-colors hover:bg-surface-2",
                          d.row,
                          q.best && "bg-(--is-wash)",
                          inert && "cursor-not-allowed",
                          FOCUS_RING,
                        )}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span
                              className={cn(
                                "truncate font-mono text-foreground",
                                d.name,
                              )}
                            >
                              {q.instance.name}
                            </span>
                            <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 uppercase @min-[52rem]:inline">
                              {FAMILY_WORD[q.instance.family]}
                            </span>
                            <AnimatePresence initial={false}>
                              {q.best ? (
                                <motion.span
                                  key="best"
                                  aria-hidden
                                  initial={
                                    motionSafe
                                      ? { opacity: 0, scale: 0.6 }
                                      : { opacity: 0 }
                                  }
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{
                                    opacity: 0,
                                    transition: exitFor(durations.fast),
                                  }}
                                  transition={
                                    motionSafe
                                      ? {
                                          ...springs.recoil,
                                          opacity: { duration: durations.fast },
                                        }
                                      : { duration: durations.fast }
                                  }
                                  className="inline-flex h-4 shrink-0 items-center gap-0.5 rounded-full bg-(--is-accent) px-1.5 font-mono text-[9px] tracking-[0.06em] text-primary-foreground uppercase"
                                >
                                  <Check aria-hidden className="size-2.5" />
                                  Best fit
                                </motion.span>
                              ) : null}
                            </AnimatePresence>
                          </span>
                          <span className="truncate font-mono text-[10px] text-ink-3 tabular-nums">
                            {q.fits
                              ? `${q.instance.vcpu} vCPU · ${q.instance.memoryGb} GB · ${q.instance.storageGb} GB`
                              : q.shortfall}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="sr-only">{price}</span>
                          <RollText
                            text={price}
                            motionSafe={motionSafe}
                            className={cn(
                              "font-mono text-[12px] text-foreground",
                              !q.fits && "text-ink-2",
                            )}
                          />
                          <span
                            aria-hidden
                            className="block font-mono text-[9px] text-ink-3"
                          >
                            /{costUnit === "month" ? "mo" : "hr"}
                          </span>
                        </span>
                        <span
                          aria-hidden
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleCompare(q.instance.id);
                          }}
                          className={cn(
                            "flex size-5 items-center justify-center rounded-1 border transition-colors",
                            inTray
                              ? "border-(--is-accent) bg-(--is-accent) text-primary-foreground"
                              : "border-hairline-strong bg-transparent text-transparent hover:border-ink-2",
                          )}
                        >
                          <svg viewBox="0 0 14 14" className="size-3">
                            <motion.path
                              d="M3 7.4 5.8 10 11 4.2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              initial={false}
                              animate={{ pathLength: inTray ? 1 : 0 }}
                              transition={
                                motionSafe ? springs.flick : { duration: 0 }
                              }
                            />
                          </svg>
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>
              ) : null}

              <CompareTray
                quotes={trayQuotes}
                limit={compareLimit}
                costUnit={costUnit}
                currency={currency}
                live={live}
                disabled={inert}
                motionSafe={motionSafe}
                pad={d.pad}
                onRemove={toggleCompare}
              />
            </section>
          </div>
        </LayoutGroup>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
