"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Minus,
  PackageOpen,
  Plus,
  ReceiptText,
  RotateCcw,
  TriangleAlert,
  X,
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

export type AddOnCycle = "monthly" | "annual";
export type AddOnKind = "switch" | "stepper" | "slider";
export type AddOnStatus = "ready" | "loading" | "error";
export type AddOnPlacement = "side" | "foot";
export type AddOnDensity = "compact" | "cozy" | "roomy";
export type AddOnAccent = "cobalt" | "signal" | "success";

export type AddOnPlan = {
  id: string;
  /** The plan's name, e.g. "Team". */
  name: string;
  /** What the plan includes, under its name. */
  description?: string;
  /** Price per month in cents, billed monthly. */
  monthly: number;
  /** Price per year in cents, billed annually. */
  annual: number;
};

export type AddOn = {
  id: string;
  name: string;
  description?: string;
  /** How it is set: on or off, a counted quantity, or a sized amount. @default "switch" */
  kind?: AddOnKind;
  /** Price per unit per month in cents, billed monthly. */
  monthly: number;
  /** Price per unit per year in cents, billed annually. */
  annual: number;
  /** What one unit is called, for steppers and sliders: "seat", "GB". */
  unit?: { one: string; other: string };
  /** The largest quantity a stepper or slider reaches. @default 10 */
  max?: number;
  /** The quantity a stepper or slider moves by. @default 1 */
  step?: number;
};

/** Quantities by add-on id; absent or 0 is off, and a switch holds 1. */
export type AddOnValue = Record<string, number>;

export type AddOnChange = { id: string; from: number; to: number };

/** One invoice line, as shown. */
export type AddOnLine = {
  id: string;
  name: string;
  quantity: number;
  /** The unit word for the quantity, when the add-on has one. */
  unit?: string;
  /** The line's amount in cents for the cycle. */
  amount: number;
  /** The base plan's line, which cannot be removed. */
  base?: boolean;
};

export type AddOnSummary = {
  cycle: AddOnCycle;
  lines: AddOnLine[];
  /** The base plan's price for the cycle, in cents. */
  base: number;
  /** All add-ons for the cycle, in cents. */
  addOns: number;
  total: number;
  /** The prorated difference charged now, in cents. */
  dueToday: number;
  daysLeft: number;
  periodDays: number;
  renewsAt: number;
};

export type AddOnTrayProps = {
  /** Where the invoice preview sits: beside the tray from a 44rem container, or under it. @default "side" */
  invoicePlacement?: AddOnPlacement;
  /** Card padding, type size and row heights. @default "cozy" */
  density?: AddOnDensity;
  /** The colour an added card, the switches and the badge take. @default "cobalt" */
  accent?: AddOnAccent;
  /** The base plan the add-ons sit on. @default defaultAddOnPlan */
  plan?: AddOnPlan;
  /** The add-ons on offer, in tray order. @default defaultAddOns */
  addOns?: AddOn[];
  /** Controlled quantities by add-on id; absent or 0 is off. */
  value?: AddOnValue;
  /** Initial quantities when uncontrolled. @default defaultAddOnValue */
  defaultValue?: AddOnValue;
  /** Fires from the switch, step, drag or key that changed an add-on, with every quantity and the change. */
  onChange?: (value: AddOnValue, change: AddOnChange) => void;
  /** Controlled billing cycle. */
  cycle?: AddOnCycle;
  /** Initial cycle when uncontrolled. @default "monthly" */
  defaultCycle?: AddOnCycle;
  /** The annual switch was turned. */
  onCycleChange?: (cycle: AddOnCycle) => void;
  /** What the subscription already carries; today's charge covers only the difference. @default {} */
  current?: AddOnValue;
  /** The checkout button was pressed, with the invoice as shown. */
  onCheckout?: (summary: AddOnSummary) => void;
  /** When the current period ends and the full price starts, in ms. @default defaultAddOnRenewsAt */
  renewsAt?: number;
  /** The day proration counts from, in ms — never read from the clock. @default defaultAddOnNow */
  now?: number;
  /** Turns cents into printed money. @default formatCents */
  format?: (cents: number) => string;
  /** The checkout button's text. @default "Update plan" */
  checkoutLabel?: string;
  /** Whether the plan and prices have arrived. @default "ready" */
  status?: AddOnStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Add-ons" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the tray and the invoice scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be switched, stepped or dragged. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** Monday 12 October 2026. */
export const defaultAddOnNow = Date.UTC(2026, 9, 12);

/** The period renews on 1 November 2026. */
export const defaultAddOnRenewsAt = Date.UTC(2026, 10, 1);

/** Gaugeworks Pay's Team plan: five seats and 100 GB in the price. */
export const defaultAddOnPlan: AddOnPlan = {
  id: "team",
  name: "Team",
  description: "Gaugeworks Pay · 5 seats, 100 GB and standard support included",
  monthly: 7900,
  annual: 79000,
};

export const defaultAddOns: AddOn[] = [
  {
    id: "seats",
    name: "Extra seats",
    description: "Beyond the five in the plan.",
    kind: "stepper",
    monthly: 1200,
    annual: 12000,
    unit: { one: "seat", other: "seats" },
    max: 25,
  },
  {
    id: "support",
    name: "Priority support",
    description: "A named engineer and a one-hour response.",
    monthly: 4900,
    annual: 49000,
  },
  {
    id: "reports",
    name: "Advanced reports",
    description: "Cohorts, settlement breakdowns and exports.",
    monthly: 2900,
    annual: 29000,
  },
  {
    id: "storage",
    name: "Extra storage",
    description: "For receipts, statements and attachments.",
    kind: "slider",
    monthly: 10,
    annual: 100,
    unit: { one: "GB", other: "GB" },
    max: 1000,
    step: 50,
  },
  {
    id: "domain",
    name: "Custom domain",
    description: "Hosted checkout on your own address.",
    monthly: 800,
    annual: 8000,
  },
];

/** Three extra seats, priority support and 250 GB. */
export const defaultAddOnValue: AddOnValue = {
  seats: 3,
  support: 1,
  storage: 250,
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
/** How long a struck line stays before it leaves. */
const STRIKE_MS = 260;

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

const ACCENTS: Record<AddOnAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

type Density = {
  pad: string;
  gap: string;
  tray: string;
  name: string;
  desc: string;
  row: string;
};

const DENSITY: Record<AddOnDensity, Density> = {
  compact: {
    pad: "p-2.5",
    gap: "gap-1.5",
    tray: "gap-2 p-2.5",
    name: "text-[12px]",
    desc: "text-[10.5px]",
    row: "h-7",
  },
  cozy: {
    pad: "p-3",
    gap: "gap-2",
    tray: "gap-2.5 p-3",
    name: "text-[13px]",
    desc: "text-[11px]",
    row: "h-8",
  },
  roomy: {
    pad: "p-4",
    gap: "gap-3",
    tray: "gap-3 p-4",
    name: "text-sm",
    desc: "text-[12px]",
    row: "h-9",
  },
};

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

/** Cents to "$1,234.56"; negative amounts take a leading minus. */
export const formatCents = (cents: number): string => {
  const abs = Math.abs(Math.round(cents));
  const whole = String(Math.floor(abs / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const frac = String(abs % 100).padStart(2, "0");
  return `${cents < 0 ? "-" : ""}$${whole}.${frac}`;
};

const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const kindOf = (a: AddOn): AddOnKind => a.kind ?? "switch";
const maxOf = (a: AddOn) =>
  kindOf(a) === "switch" ? 1 : Math.max(1, Math.round(a.max ?? 10));
const stepOf = (a: AddOn) =>
  kindOf(a) === "switch" ? 1 : Math.max(1, Math.round(a.step ?? 1));
const priceOf = (p: { monthly: number; annual: number }, cycle: AddOnCycle) =>
  cycle === "annual" ? p.annual : p.monthly;
const unitWord = (a: AddOn, q: number) =>
  a.unit ? (q === 1 ? a.unit.one : a.unit.other) : "";
const quantityText = (a: AddOn, q: number) =>
  kindOf(a) === "switch" ? "" : `${q} ${unitWord(a, q)}`.trim();
const cycleWord = (cycle: AddOnCycle) =>
  cycle === "annual" ? "year" : "month";
const cycleShort = (cycle: AddOnCycle) => (cycle === "annual" ? "yr" : "mo");

/** Days in the period that ends at `renewsAt`: the month or the year before it. */
const periodDaysOf = (renewsAt: number, cycle: AddOnCycle) => {
  const start = new Date(renewsAt);
  if (cycle === "annual") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else start.setUTCMonth(start.getUTCMonth() - 1);
  return Math.max(1, Math.round((renewsAt - start.getTime()) / DAY));
};

/** Prices a plan and its add-ons for a cycle, with what is charged today. */
export function summarizeAddOns(input: {
  plan: AddOnPlan;
  addOns: AddOn[];
  value: AddOnValue;
  cycle: AddOnCycle;
  current?: AddOnValue;
  now?: number;
  renewsAt?: number;
}): AddOnSummary {
  const {
    plan,
    addOns,
    value,
    cycle,
    current = {},
    now = defaultAddOnNow,
    renewsAt = defaultAddOnRenewsAt,
  } = input;
  const base = priceOf(plan, cycle);
  const lines: AddOnLine[] = [
    { id: plan.id, name: plan.name, quantity: 1, amount: base, base: true },
  ];
  let sum = 0;
  let had = 0;
  for (const a of addOns) {
    const q = clamp(Math.round(value[a.id] ?? 0), 0, maxOf(a));
    const was = clamp(Math.round(current[a.id] ?? 0), 0, maxOf(a));
    had += was * priceOf(a, cycle);
    if (q <= 0) continue;
    const amount = q * priceOf(a, cycle);
    sum += amount;
    lines.push({
      id: a.id,
      name: a.name,
      quantity: q,
      unit: unitWord(a, q) || undefined,
      amount,
    });
  }
  const periodDays = periodDaysOf(renewsAt, cycle);
  const daysLeft = clamp(Math.ceil((renewsAt - now) / DAY), 0, periodDays);
  const dueToday = Math.max(
    0,
    Math.round(((sum - had) * daysLeft) / periodDays),
  );
  return {
    cycle,
    lines,
    base,
    addOns: sum,
    total: base + sum,
    dueToday,
    daysLeft,
    periodDays,
    renewsAt,
  };
}

/* ----------------------------------------------------------------------- */
/*                            Rolling and fading                            */
/* ----------------------------------------------------------------------- */

/** Printed money whose digits roll on snap; the symbol and separators sit still. */
function Roll({
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
      {/* Gives the row a text baseline, so a suffix beside it lines up. */}
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        const key = chars.length - 1 - i;
        if (!/\d/.test(c)) return <span key={`s${key}`}>{c}</span>;
        return (
          <span
            key={key}
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

/** Cross-fades its children whenever `id` changes: the re-price, not a roll. */
function Fade({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={id}
        className={cn("inline-flex items-baseline", className)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={{ duration: durations.fast, ease: easings.enter }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Controls                                 */
/* ----------------------------------------------------------------------- */

function Switch({
  checked,
  label,
  hintId,
  disabled,
  motionSafe,
  onToggle,
}: {
  checked: boolean;
  label: string;
  hintId: string;
  disabled: boolean;
  motionSafe: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
        checked
          ? "border-transparent bg-(--at-accent)"
          : "border-hairline-strong bg-surface-2",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute top-px left-px flex size-5 items-center justify-center rounded-full bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_35%,transparent)]"
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {checked ? (
          <svg viewBox="0 0 14 14" className="size-3 text-(--at-accent)">
            <motion.path
              d="M3 7.4 5.8 10 11 4.2"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={motionSafe ? { pathLength: 0 } : false}
              animate={{ pathLength: 1 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        ) : null}
      </motion.span>
    </button>
  );
}

function Stepper({
  value,
  max,
  step,
  unit,
  label,
  hintId,
  disabled,
  motionSafe,
  onChange,
}: {
  value: number;
  max: number;
  step: number;
  unit: { one: string; other: string };
  label: string;
  hintId: string;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (value: number) => void;
}) {
  const set = (to: number) => {
    if (disabled) return;
    const q = clamp(Math.round(to / step) * step, 0, max);
    if (q !== value) onChange(q);
  };
  const atMin = value <= 0;
  const atMax = value >= max;
  const btn =
    "flex w-7 items-center justify-center text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent";
  return (
    <div className="inline-flex h-7 shrink-0 items-stretch rounded-2 border border-hairline-strong bg-card">
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={`Fewer ${unit.other}`}
        aria-disabled={disabled || atMin || undefined}
        onClick={() => set(value - step)}
        whileTap={
          !disabled && !atMin && motionSafe ? { scale: 0.86 } : undefined
        }
        transition={springs.flick}
        className={cn(btn, "rounded-l-[5px] border-r border-hairline")}
      >
        <Minus aria-hidden className="size-3.5" />
      </motion.button>
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={
          value === 0
            ? "Off"
            : `${value} ${value === 1 ? unit.one : unit.other}`
        }
        aria-disabled={disabled || undefined}
        onKeyDown={(event) => {
          let to: number | null = null;
          switch (event.key) {
            case "ArrowUp":
            case "ArrowRight":
              to = value + step;
              break;
            case "ArrowDown":
            case "ArrowLeft":
              to = value - step;
              break;
            case "PageUp":
              to = value + step * 5;
              break;
            case "PageDown":
              to = value - step * 5;
              break;
            case "Home":
              to = 0;
              break;
            case "End":
              to = max;
              break;
            default:
              return;
          }
          event.preventDefault();
          set(to);
        }}
        className={cn(
          "flex min-w-9 items-center justify-center px-1.5 font-mono text-[12px] tabular-nums",
          value === 0 ? "text-ink-3" : "text-foreground",
          FOCUS_RING,
        )}
      >
        <Roll text={String(value)} motionSafe={motionSafe} />
      </span>
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label={`More ${unit.other}`}
        aria-disabled={disabled || atMax || undefined}
        onClick={() => set(value + step)}
        whileTap={
          !disabled && !atMax && motionSafe ? { scale: 0.86 } : undefined
        }
        transition={springs.flick}
        className={cn(btn, "rounded-r-[5px] border-l border-hairline")}
      >
        <Plus aria-hidden className="size-3.5" />
      </motion.button>
    </div>
  );
}

function Slider({
  value,
  max,
  step,
  unit,
  label,
  hintId,
  valueText,
  disabled,
  motionSafe,
  onChange,
  onCommit,
}: {
  value: number;
  max: number;
  step: number;
  unit: { one: string; other: string };
  label: string;
  hintId: string;
  valueText: string;
  disabled: boolean;
  motionSafe: boolean;
  /** A move: from a drag (silent) or a key (announced). */
  onChange: (value: number, speak: boolean) => void;
  /** A drag was released. */
  onCommit: () => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const thumbRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<number | null>(null);
  const [dragging, setDragging] = React.useState(false);

  const pct = max > 0 ? (value / max) * 100 : 0;
  const quantize = (v: number) => clamp(Math.round(v / step) * step, 0, max);
  const valueAt = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return value;
    return quantize(((clientX - r.left) / r.width) * max);
  };
  const transition = dragging || !motionSafe ? { duration: 0 } : springs.snap;
  const ticks = [0.25, 0.5, 0.75];

  const onDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer has nothing to capture; the thumb still tracks.
    }
    dragRef.current = event.pointerId;
    setDragging(true);
    const q = valueAt(event.clientX);
    if (q !== value) onChange(q, false);
    thumbRef.current?.focus({ preventScroll: true });
  };
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    const q = valueAt(event.clientX);
    if (q !== value) onChange(q, false);
  };
  const onUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Already released.
    }
    onCommit();
  };

  return (
    <div className="flex items-center gap-2.5">
      <div
        ref={trackRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className={cn(
          "relative h-7 min-w-0 flex-1 touch-none",
          disabled ? "cursor-not-allowed" : "cursor-ew-resize",
        )}
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2"
        />
        {ticks.map((t) => (
          <span
            key={t}
            aria-hidden
            className="absolute top-1/2 h-1 w-px -translate-y-1/2 bg-hairline-strong"
            style={{ left: `${t * 100}%` }}
          />
        ))}
        <motion.span
          aria-hidden
          className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-(--at-accent)"
          initial={false}
          animate={{ width: `${r3(pct)}%` }}
          transition={transition}
        />
        <motion.div
          ref={thumbRef}
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-describedby={hintId}
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valueText}
          aria-disabled={disabled || undefined}
          onKeyDown={(event) => {
            let to: number | null = null;
            switch (event.key) {
              case "ArrowRight":
              case "ArrowUp":
                to = value + step;
                break;
              case "ArrowLeft":
              case "ArrowDown":
                to = value - step;
                break;
              case "PageUp":
                to = value + step * 5;
                break;
              case "PageDown":
                to = value - step * 5;
                break;
              case "Home":
                to = 0;
                break;
              case "End":
                to = max;
                break;
              default:
                return;
            }
            event.preventDefault();
            if (disabled) return;
            const q = quantize(to);
            if (q !== value) onChange(q, true);
          }}
          initial={false}
          animate={{ left: `${r3(pct)}%` }}
          transition={transition}
          className={cn(
            "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_30%,transparent)] transition-colors duration-200",
            value > 0 || dragging
              ? "border-(--at-accent)"
              : "border-hairline-strong",
            FOCUS_RING,
          )}
        />
      </div>
      <span
        aria-hidden
        className={cn(
          "w-14 shrink-0 text-right font-mono text-[11px] tabular-nums",
          value === 0 ? "text-ink-3" : "text-foreground",
        )}
      >
        {value === 0 ? "Off" : `${value} ${unit.other}`}
      </span>
    </div>
  );
}

function CycleSwitch({
  annual,
  disabled,
  motionSafe,
  onToggle,
}: {
  annual: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={annual}
      aria-label="Bill annually"
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={cn(
        "relative grid h-7 shrink-0 grid-cols-2 rounded-full border border-hairline-strong bg-surface-1 p-0.5 text-[11px] font-medium",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_25%,transparent)]"
        initial={false}
        animate={{ x: annual ? "100%" : "0%" }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      />
      <span
        aria-hidden
        className={cn(
          "relative z-10 px-2.5 leading-none transition-colors duration-200",
          annual ? "text-ink-3" : "text-foreground",
        )}
      >
        Monthly
      </span>
      <span
        aria-hidden
        className={cn(
          "relative z-10 px-2.5 leading-none transition-colors duration-200",
          annual ? "text-foreground" : "text-ink-3",
        )}
      >
        Annual
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Card                                   */
/* ----------------------------------------------------------------------- */

type CardProps = {
  addOn: AddOn;
  quantity: number;
  cycle: AddOnCycle;
  format: (cents: number) => string;
  d: Density;
  motionSafe: boolean;
  inert: boolean;
  hintId: string;
  /** Fades and rises in when it mounts after hydration. */
  enter: boolean;
  index: number;
  step: number;
  onQuantity: (quantity: number, speak: boolean) => void;
  onCommit: () => void;
};

function Card({
  addOn,
  quantity,
  cycle,
  format,
  d,
  motionSafe,
  inert,
  hintId,
  enter,
  index,
  step,
  onQuantity,
  onCommit,
}: CardProps) {
  const uid = React.useId();
  const nameId = `${uid}-name`;
  const kind = kindOf(addOn);
  const on = quantity > 0;
  const unitPrice = priceOf(addOn, cycle);
  const amount = quantity * unitPrice;
  const per = cycleShort(cycle);
  const unit = addOn.unit ?? { one: "unit", other: "units" };
  const delay = r3(index * step);

  return (
    <motion.div
      initial={
        enter ? { opacity: 0, y: motionSafe ? distances.step : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        y: { ...springs.glide, delay },
        opacity: { duration: durations.base, ease: easings.enter, delay },
      }}
    >
      <motion.div
        role="group"
        aria-labelledby={nameId}
        initial={false}
        animate={{ y: on && motionSafe ? -2 : 0 }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
        className={cn(
          "relative flex flex-col rounded-3 border transition-[border-color,background-color,box-shadow] duration-200",
          d.pad,
          d.gap,
          on
            ? "border-(--at-line) bg-card shadow-[0_10px_24px_-16px_var(--at-shadow)]"
            : "border-hairline bg-surface-0",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p id={nameId} className={cn("font-medium", d.name)}>
              {addOn.name}
            </p>
            {addOn.description ? (
              <p className={cn("text-ink-2", d.desc)}>{addOn.description}</p>
            ) : null}
          </div>
          {kind === "switch" ? (
            <Switch
              checked={on}
              label={addOn.name}
              hintId={hintId}
              disabled={inert}
              motionSafe={motionSafe}
              onToggle={() => onQuantity(on ? 0 : 1, true)}
            />
          ) : kind === "stepper" ? (
            <Stepper
              value={quantity}
              max={maxOf(addOn)}
              step={stepOf(addOn)}
              unit={unit}
              label={addOn.name}
              hintId={hintId}
              disabled={inert}
              motionSafe={motionSafe}
              onChange={(q) => onQuantity(q, true)}
            />
          ) : null}
        </div>
        {kind === "slider" ? (
          <Slider
            value={quantity}
            max={maxOf(addOn)}
            step={stepOf(addOn)}
            unit={unit}
            label={addOn.name}
            hintId={hintId}
            valueText={
              on
                ? `${quantity} ${unit.other}, ${format(amount)} per ${cycleWord(cycle)}`
                : "Off"
            }
            disabled={inert}
            motionSafe={motionSafe}
            onChange={onQuantity}
            onCommit={onCommit}
          />
        ) : null}
        <div className="flex items-baseline justify-between gap-2 font-mono text-[11px] tabular-nums">
          <Fade id={cycle} className="min-w-0 truncate text-ink-3">
            {format(unitPrice)}
            {addOn.unit ? ` / ${addOn.unit.one}` : ""} / {per}
          </Fade>
          {on ? (
            <span className="flex shrink-0 items-baseline gap-1 text-foreground">
              {kind !== "switch" ? (
                <span className="text-ink-3">
                  {quantityText(addOn, quantity)} ·
                </span>
              ) : null}
              <Fade id={cycle}>
                <Roll text={format(amount)} motionSafe={motionSafe} />
              </Fade>
              <span className="text-ink-3">/{per}</span>
            </span>
          ) : (
            <span className="shrink-0 text-ink-3">Not added</span>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Invoice line                               */
/* ----------------------------------------------------------------------- */

type LineProps = {
  line: AddOnLine;
  cycle: AddOnCycle;
  format: (cents: number) => string;
  d: Density;
  /** Struck through, about to leave. */
  leaving: boolean;
  placement: AddOnPlacement;
  motionSafe: boolean;
  inert: boolean;
  tabIndex: number;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onRemove: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function Line({
  line,
  cycle,
  format,
  d,
  leaving,
  placement,
  motionSafe,
  inert,
  tabIndex,
  nodeRef,
  onRemove,
  onFocus,
  onNav,
}: LineProps) {
  const fromSide = motionSafe && placement === "side";
  const fromTop = motionSafe && placement === "foot";
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      initial={{
        opacity: 0,
        x: fromSide ? -distances.shift : 0,
        y: fromTop ? -distances.step : 0,
      }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{
        layout: springs.glide,
        x: springs.glide,
        y: springs.glide,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto_1.5rem] items-center gap-x-2 px-1",
        d.row,
      )}
    >
      <span
        className={cn(
          "relative min-w-0 truncate text-[12px] transition-colors duration-200",
          leaving ? "text-ink-3" : "text-foreground",
        )}
      >
        {line.name}
        {line.unit ? (
          <span className="text-ink-3">
            {" "}
            x {line.quantity} {line.unit}
          </span>
        ) : null}
        {leaving ? (
          <motion.span
            aria-hidden
            className="absolute inset-x-0 top-1/2 h-px bg-current"
            style={{ originX: 0 }}
            initial={motionSafe ? { scaleX: 0 } : false}
            animate={{ scaleX: 1 }}
            transition={motionSafe ? springs.flick : { duration: 0 }}
          />
        ) : null}
      </span>
      <span
        className={cn(
          "font-mono text-[12px] tabular-nums transition-colors duration-200",
          leaving ? "text-ink-3" : "text-foreground",
        )}
      >
        <span className="sr-only">{format(line.amount)}</span>
        <Fade id={cycle}>
          <Roll text={format(line.amount)} motionSafe={motionSafe} />
        </Fade>
      </span>
      <motion.button
        ref={nodeRef}
        type="button"
        tabIndex={tabIndex}
        aria-label={`Remove ${line.name}`}
        aria-disabled={inert || leaving || undefined}
        onFocus={onFocus}
        onClick={() => {
          if (!inert && !leaving) onRemove();
        }}
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            if (!inert && !leaving) onRemove();
            return;
          }
          onNav(event);
        }}
        whileTap={
          !inert && !leaving && motionSafe ? { scale: 0.88 } : undefined
        }
        transition={springs.flick}
        className={cn(
          "flex size-6 items-center justify-center justify-self-end rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40",
          FOCUS_RING,
        )}
      >
        <X aria-hidden className="size-3.5" />
      </motion.button>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Skeleton                                 */
/* ----------------------------------------------------------------------- */

function TraySkeleton({ d }: { d: Density }) {
  return (
    <div aria-hidden className={cn("flex flex-col", d.tray)}>
      <span className="h-16 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
      <span className="h-3 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
      <div className="grid gap-2 @min-[28rem]:grid-cols-2">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className="h-[4.5rem] rounded-3 bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function InvoiceSkeleton({ d }: { d: Density }) {
  return (
    <div aria-hidden className="flex flex-col gap-1.5 px-3 py-3">
      {Array.from({ length: 4 }, (_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-2 bg-surface-2 motion-safe:animate-pulse",
            d.row,
          )}
          style={{ animationDelay: `${i * 110}ms` }}
        />
      ))}
      <span className="mt-2 h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Shown = { line: AddOnLine; leaving: boolean };

/**
 * An add-ons tray for a billing page. The base plan sits at the top with its
 * price; under it a tray of add-on cards — a stepper for seats, switches for
 * support, reports and a domain, a slider for storage — and beside them the
 * invoice preview with every line, the total and a note of what is charged
 * today.
 *
 * Switching an add-on on lifts its card two pixels on `springs.snap`, the
 * switch's knob crossing on the same spring as a check draws in on
 * `springs.flick`, and a line slides into the invoice on `springs.glide` from
 * the tray's side while the lines below it glide down and the total rolls.
 * Steppers and the slider roll their line's amount as it changes. The annual
 * switch re-prices every figure with a cross-fade — a re-price is not a
 * change in quantity, so nothing rolls — and a "save 2 months" badge lands
 * on `springs.recoil`. Removing a line, from the tray or its own X, strikes
 * it through on `springs.flick` and then it leaves on the exit ease while the
 * rest close up.
 *
 * Every control is reachable by key: switches take Space, the stepper and the
 * slider take the arrows, Page keys, Home and End, and the invoice's remove
 * buttons are one roving list where Up and Down move and Delete removes.
 * Every change is announced with the new total and today's charge. Under
 * reduced motion nothing lifts, slides or rolls: lines fade in place, digits
 * and prices change at once, and the strike appears whole before the line
 * fades.
 */
export function AddOnTray({
  invoicePlacement = "side",
  density = "cozy",
  accent = "cobalt",
  plan = defaultAddOnPlan,
  addOns = defaultAddOns,
  value,
  defaultValue = defaultAddOnValue,
  onChange,
  cycle: cycleProp,
  defaultCycle = "monthly",
  onCycleChange,
  current: committed,
  onCheckout,
  renewsAt = defaultAddOnRenewsAt,
  now = defaultAddOnNow,
  format = formatCents,
  checkoutLabel = "Update plan",
  status = "ready",
  onRetry,
  title = "Add-ons",
  label,
  height = 540,
  disabled = false,
  className,
}: AddOnTrayProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const invoiceId = `${uid}-invoice`;

  const [ownValue, setOwnValue] = React.useState<AddOnValue>(defaultValue);
  const [ownCycle, setOwnCycle] = React.useState<AddOnCycle>(defaultCycle);
  const current = value ?? ownValue;
  const cycle = cycleProp ?? ownCycle;
  const annual = cycle === "annual";
  const ready = status === "ready";
  const inert = disabled || !ready;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const side = invoicePlacement === "side";

  const [leaving, setLeaving] = React.useState<Record<string, AddOnLine>>({});
  const [activeLine, setActiveLine] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    id: string | null;
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so cards already on the page
  // never rise in; true for cards that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const leavingRef = React.useRef<Record<string, AddOnLine>>({});
  const timers = React.useRef(new Map<string, number>());
  const prevRef = React.useRef<AddOnValue>(current);
  const lineNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const checkoutRef = React.useRef<HTMLButtonElement | null>(null);

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(addOns.map((a) => [a.id, a]));
  const summary = summarizeAddOns({
    plan,
    addOns,
    value: current,
    cycle,
    current: committed,
    now,
    renewsAt,
  });
  const lineById = new Map(summary.lines.map((l) => [l.id, l]));
  const monthsSaved =
    plan.monthly > 0
      ? Math.max(0, Math.round(12 - plan.annual / plan.monthly))
      : 0;
  const per = cycleShort(cycle);
  const enabledCount = summary.lines.length - 1;

  // Lines in tray order: every enabled add-on, and any struck one on its
  // way out, which keeps the amount it had.
  const shown: Shown[] = [];
  for (const a of addOns) {
    const line = lineById.get(a.id);
    if (line) shown.push({ line, leaving: false });
    else {
      const gone = leaving[a.id];
      if (gone) shown.push({ line: gone, leaving: true });
    }
  }

  /* ----------------------------- announcing ---------------------------- */

  const speak = (
    lead: string,
    nextValue: AddOnValue,
    nextCycle: AddOnCycle,
  ) => {
    const s = summarizeAddOns({
      plan,
      addOns,
      value: nextValue,
      cycle: nextCycle,
      current: committed,
      now,
      renewsAt,
    });
    setAnnouncement(
      `${lead} Total ${format(s.total)} per ${cycleWord(nextCycle)}, ${format(s.dueToday)} today.`,
    );
  };

  /* ------------------------------- changes ----------------------------- */

  const setQuantity = (id: string, to: number, say: boolean) => {
    if (inert) return;
    const addOn = byId.get(id);
    if (!addOn) return;
    const from = clamp(Math.round(current[id] ?? 0), 0, maxOf(addOn));
    const q = clamp(Math.round(to), 0, maxOf(addOn));
    if (q === from) return;
    const next: AddOnValue = { ...current };
    if (q === 0) delete next[id];
    else next[id] = q;
    if (value === undefined) setOwnValue(next);
    onChange?.(next, { id, from, to: q });
    if (!say) return;
    const amount = q * priceOf(addOn, cycle);
    const lead =
      q === 0
        ? `${addOn.name} removed.`
        : kindOf(addOn) === "switch"
          ? `${addOn.name} added, ${format(amount)} per ${cycleWord(cycle)}.`
          : `${addOn.name}: ${quantityText(addOn, q)}, ${format(amount)} per ${cycleWord(cycle)}.`;
    speak(lead, next, cycle);
  };

  /** A drag was released: say where it landed. */
  const commitQuantity = (id: string) => {
    const addOn = byId.get(id);
    if (!addOn) return;
    const q = clamp(Math.round(current[id] ?? 0), 0, maxOf(addOn));
    const amount = q * priceOf(addOn, cycle);
    speak(
      q === 0
        ? `${addOn.name} removed.`
        : `${addOn.name}: ${quantityText(addOn, q)}, ${format(amount)} per ${cycleWord(cycle)}.`,
      current,
      cycle,
    );
  };

  const toggleCycle = () => {
    if (inert) return;
    const next: AddOnCycle = annual ? "monthly" : "annual";
    if (cycleProp === undefined) setOwnCycle(next);
    onCycleChange?.(next);
    speak(
      next === "annual"
        ? `Billing annually${monthsSaved > 0 ? `, saving ${monthsSaved} ${monthsSaved === 1 ? "month" : "months"}` : ""}.`
        : "Billing monthly.",
      current,
      next,
    );
  };

  /* ---------------------------- departures ----------------------------- */

  const writeLeaving = (next: Record<string, AddOnLine>) => {
    leavingRef.current = next;
    setLeaving(next);
  };

  const clearTimer = (id: string) => {
    const t = timers.current.get(id);
    if (t !== undefined) window.clearTimeout(t);
    timers.current.delete(id);
  };

  // Reconciles against the value, wherever a change came from: an add-on
  // that just went to zero is struck and held for a beat before it leaves,
  // and one switched back on while struck is simply itself again.
  React.useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = current;
    let next: Record<string, AddOnLine> | null = null;
    for (const a of addOns) {
      const was = clamp(Math.round(prev[a.id] ?? 0), 0, maxOf(a));
      const is = clamp(Math.round(current[a.id] ?? 0), 0, maxOf(a));
      if (was > 0 && is === 0) {
        clearTimer(a.id);
        next = next ?? { ...leavingRef.current };
        next[a.id] = {
          id: a.id,
          name: a.name,
          quantity: was,
          unit: unitWord(a, was) || undefined,
          amount: was * priceOf(a, cycle),
        };
        timers.current.set(
          a.id,
          window.setTimeout(() => {
            timers.current.delete(a.id);
            const rest = { ...leavingRef.current };
            delete rest[a.id];
            writeLeaving(rest);
          }, STRIKE_MS),
        );
      } else if (is > 0 && leavingRef.current[a.id]) {
        clearTimer(a.id);
        next = next ?? { ...leavingRef.current };
        delete next[a.id];
      }
    }
    if (next) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      writeLeaving(next);
    }
  }, [current, addOns, cycle]);

  // Every strike still waiting stops with the surface.
  React.useEffect(
    () => () => {
      for (const t of timers.current.values()) window.clearTimeout(t);
      timers.current.clear();
    },
    [],
  );

  /* ------------------------------ keyboard ----------------------------- */

  const lineKeys = shown.map((s) => s.line.id);
  const activeKey =
    activeLine && lineKeys.includes(activeLine)
      ? activeLine
      : (lineKeys[0] ?? null);

  const onLineNav = (event: React.KeyboardEvent, id: string) => {
    const i = lineKeys.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = lineKeys.length - 1;
    else return;
    event.preventDefault();
    const target = lineKeys[clamp(to, 0, lineKeys.length - 1)];
    if (target) lineNodes.current.get(target)?.focus();
  };

  const removeLine = (id: string) => {
    const i = lineKeys.indexOf(id);
    const hasFocus =
      typeof document !== "undefined" &&
      document.activeElement === lineNodes.current.get(id);
    setQuantity(id, 0, true);
    if (!hasFocus) return;
    const next = lineKeys[i + 1] ?? lineKeys[i - 1] ?? null;
    setFocusReq((f) => ({ id: next, seq: (f?.seq ?? 0) + 1 }));
  };

  // Focus moves on to the next line, or to checkout, once the line has gone.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      (focusReq.id ? lineNodes.current.get(focusReq.id) : undefined) ??
      checkoutRef.current;
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- render ------------------------------ */

  const accentColor = ACCENTS[accent] ?? ACCENTS.cobalt;
  const step = cascade(addOns.length + 1);
  const day = dayLabel(renewsAt);
  const proration =
    summary.dueToday > 0
      ? `${summary.daysLeft} of ${summary.periodDays} days left before ${day}: ${format(summary.dueToday)} charged today, then ${format(summary.total)}/${per} from ${day}.`
      : `Nothing charged today. ${format(summary.total)}/${per} from ${day}.`;

  const invoice = (
    <aside
      aria-labelledby={invoiceId}
      className={cn(
        "flex shrink-0 flex-col border-t border-hairline bg-surface-0",
        side
          ? "@min-[44rem]:min-h-0 @min-[44rem]:w-[42%] @min-[44rem]:max-w-[22rem] @min-[44rem]:border-t-0 @min-[44rem]:border-l"
          : "@min-[44rem]:flex-row",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-col",
          side ? "@min-[44rem]:min-h-0 @min-[44rem]:flex-1" : "flex-1",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
          <p id={invoiceId} className={cn("flex items-center gap-1.5", LABEL)}>
            <ReceiptText aria-hidden className="size-3" />
            Invoice preview
          </p>
          <Fade id={cycle} className={LABEL}>
            {annual ? "Billed yearly" : "Billed monthly"}
          </Fade>
        </div>
        {status === "loading" ? (
          <InvoiceSkeleton d={d} />
        ) : (
          <ul
            role="list"
            aria-label="Invoice lines"
            className={cn(
              "flex max-h-40 flex-col overflow-y-auto overscroll-contain px-2 pb-1.5",
              side &&
                "@min-[44rem]:max-h-none @min-[44rem]:min-h-0 @min-[44rem]:flex-1",
            )}
          >
            <li
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto_1.5rem] items-center gap-x-2 px-1",
                d.row,
              )}
            >
              <span className="min-w-0 truncate text-[12px] text-foreground">
                {plan.name}
                <span className="text-ink-3"> plan</span>
              </span>
              <span className="font-mono text-[12px] text-foreground tabular-nums">
                <span className="sr-only">{format(summary.base)}</span>
                <Fade id={cycle}>
                  <Roll text={format(summary.base)} motionSafe={motionSafe} />
                </Fade>
              </span>
              <span />
            </li>
            <AnimatePresence initial={false} mode="popLayout">
              {shown.map(({ line, leaving: gone }) => (
                <Line
                  key={line.id}
                  line={line}
                  cycle={cycle}
                  format={format}
                  d={d}
                  leaving={gone}
                  placement={invoicePlacement}
                  motionSafe={motionSafe}
                  inert={inert}
                  tabIndex={activeKey === line.id ? 0 : -1}
                  nodeRef={(node) => {
                    if (node) lineNodes.current.set(line.id, node);
                    else lineNodes.current.delete(line.id);
                  }}
                  onRemove={() => removeLine(line.id)}
                  onFocus={() => setActiveLine(line.id)}
                  onNav={(event) => onLineNav(event, line.id)}
                />
              ))}
              {shown.length === 0 ? (
                <motion.li
                  key="__empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={{ duration: durations.base, ease: easings.enter }}
                  className="px-1 py-1.5 text-[11px] text-ink-3"
                >
                  {addOns.length === 0
                    ? "No add-ons for this plan."
                    : "No add-ons yet. Switch one on and it lands here."}
                </motion.li>
              ) : null}
            </AnimatePresence>
          </ul>
        )}
      </div>
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 border-t border-hairline px-3 pt-2 pb-3",
          !side &&
            "@min-[44rem]:w-[40%] @min-[44rem]:max-w-[20rem] @min-[44rem]:border-t-0 @min-[44rem]:border-l",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] text-ink-2">Total</span>
          <span className="flex items-baseline gap-1 font-mono tabular-nums">
            <span className="sr-only">
              {format(summary.total)} per {cycleWord(cycle)}
            </span>
            {status === "loading" ? (
              <span
                aria-hidden
                className="inline-block h-4 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse"
              />
            ) : (
              <Fade id={cycle}>
                <Roll
                  text={format(summary.total)}
                  motionSafe={motionSafe}
                  className="text-[15px] text-foreground"
                />
              </Fade>
            )}
            <span aria-hidden className="text-[11px] text-ink-3">
              /{per}
            </span>
          </span>
        </div>
        <p className="text-[11px] leading-snug text-ink-2">
          {status === "loading" ? "Working out today's charge." : proration}
        </p>
        <motion.button
          ref={checkoutRef}
          type="button"
          aria-disabled={inert || undefined}
          onClick={() => {
            if (!inert) onCheckout?.(summary);
          }}
          whileTap={!inert && motionSafe ? { scale: 0.98 } : undefined}
          transition={springs.flick}
          className={cn(
            "flex h-8 items-center justify-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity",
            inert ? "cursor-not-allowed opacity-50" : "cursor-pointer",
            FOCUS_RING,
          )}
        >
          {checkoutLabel}
          {ready ? (
            <span className="font-mono text-[11px] tabular-nums opacity-75">
              · {format(summary.dueToday)} today
            </span>
          ) : null}
        </motion.button>
      </div>
    </aside>
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
        ["--at-accent" as string]: accentColor,
        ["--at-wash" as string]: `color-mix(in oklab, ${accentColor} 12%, transparent)`,
        ["--at-line" as string]: `color-mix(in oklab, ${accentColor} 45%, transparent)`,
        ["--at-shadow" as string]: `color-mix(in oklab, ${accentColor} 35%, transparent)`,
      }}
    >
      <p id={hintId} className="sr-only">
        Switches turn an add-on on or off with Space. Steppers and sliders take
        the arrow keys, Page Up and Page Down, Home and End. In the invoice,
        arrows move between lines and Delete removes one.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <AnimatePresence>
            {ready && annual && monthsSaved > 0 ? (
              <motion.span
                key="badge"
                initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
                className="rounded-full bg-(--at-wash) px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap text-(--at-accent) uppercase"
              >
                Save {monthsSaved} {monthsSaved === 1 ? "month" : "months"}
              </motion.span>
            ) : null}
          </AnimatePresence>
          <CycleSwitch
            annual={annual}
            disabled={inert}
            motionSafe={motionSafe}
            onToggle={toggleCycle}
          />
        </div>
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The prices didn&apos;t load.
          </p>
          <p className="max-w-xs text-[12px] text-ink-2">
            Nothing has changed on the plan. Try again and the tray fills in.
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
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            side && "@min-[44rem]:flex-row",
          )}
        >
          <div className="@container flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
            {status === "loading" ? (
              <TraySkeleton d={d} />
            ) : (
              <div className={cn("flex flex-col", d.tray)}>
                <div
                  className={cn(
                    "flex items-start justify-between gap-3 rounded-3 border border-hairline-strong bg-card",
                    d.pad,
                  )}
                >
                  <div className="min-w-0">
                    <p className={LABEL}>Base plan</p>
                    <p className={cn("font-semibold", d.name)}>{plan.name}</p>
                    {plan.description ? (
                      <p className={cn("text-ink-2", d.desc)}>
                        {plan.description}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right font-mono tabular-nums">
                    <span className="sr-only">
                      {format(summary.base)} per {cycleWord(cycle)}
                    </span>
                    <Fade id={cycle} className="text-[15px] text-foreground">
                      {format(summary.base)}
                    </Fade>
                    <span aria-hidden className="text-[11px] text-ink-3">
                      /{per}
                    </span>
                  </p>
                </div>

                <p className={cn("flex items-baseline gap-2", LABEL)}>
                  Add-ons
                  <span className="tracking-normal normal-case">
                    {enabledCount} of {addOns.length} added
                  </span>
                </p>

                {addOns.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-3 border border-dashed border-hairline-strong px-6 py-8 text-center">
                    <PackageOpen aria-hidden className="size-5 text-ink-3" />
                    <p className="text-sm text-ink-2">
                      No add-ons for this plan.
                    </p>
                    <p className="text-[11px] text-ink-3">
                      The base price is all there is to pay.
                    </p>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "grid grid-cols-1 @min-[28rem]:grid-cols-2",
                      d.gap,
                    )}
                  >
                    {addOns.map((addOn, i) => (
                      <Card
                        key={addOn.id}
                        addOn={addOn}
                        quantity={clamp(
                          Math.round(current[addOn.id] ?? 0),
                          0,
                          maxOf(addOn),
                        )}
                        cycle={cycle}
                        format={format}
                        d={d}
                        motionSafe={motionSafe}
                        inert={inert}
                        hintId={hintId}
                        enter={live}
                        index={i}
                        step={step}
                        onQuantity={(q, say) => setQuantity(addOn.id, q, say)}
                        onCommit={() => commitQuantity(addOn.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {invoice}
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
