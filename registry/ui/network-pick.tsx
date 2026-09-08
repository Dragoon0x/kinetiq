"use client";

import * as React from "react";

import { motion } from "motion/react";

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

/** Token tones only — a chain's colour has to survive both themes. */
export type NetworkTone = "cobalt" | "signal" | "success" | "warn" | "danger";

export type NetworkChain = {
  id: string;
  name: string;
  /** Ticker printed after the native balance. */
  symbol: string;
  tone: NetworkTone;
  /** Holding in native units. */
  balance: number;
  /** The same holding in the account's reporting currency, in major units. */
  fiat: number;
};

export type NetworkPickProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** The chains, left to right. */
  chains: NetworkChain[];
  /** Controlled chain id. */
  value?: string;
  /** Initial chain id for uncontrolled usage. @default the first chain */
  defaultValue?: string;
  /** Fires from the press or key that changed the pick. */
  onValueChange?: (id: string) => void;
  /** Prints the headline figure. */
  format?: (value: number) => string;
  /** Prints the native balance. */
  formatUnits?: (value: number, symbol: string) => string;
  /** Visible group label. Omit it and pass `aria-label` to label invisibly. */
  label?: React.ReactNode;
  /** A quiet line under the balance — the account the header belongs to. */
  caption?: React.ReactNode;
  className?: string;
  "aria-label"?: string;
};

const TONES: Record<
  NetworkTone,
  { wash: string; edge: string; ink: string; dot: string; border: string }
> = {
  cobalt: {
    wash: "bg-cobalt-bright/12",
    edge: "bg-cobalt-bright",
    ink: "text-cobalt-bright",
    dot: "bg-cobalt-bright",
    border: "border-cobalt-bright/50",
  },
  signal: {
    wash: "bg-signal/12",
    edge: "bg-signal",
    ink: "text-signal",
    dot: "bg-signal",
    border: "border-signal/50",
  },
  success: {
    wash: "bg-success/12",
    edge: "bg-success",
    ink: "text-success",
    dot: "bg-success",
    border: "border-success/50",
  },
  warn: {
    wash: "bg-warn/14",
    edge: "bg-warn",
    ink: "text-warn",
    dot: "bg-warn",
    border: "border-warn/50",
  },
  danger: {
    wash: "bg-danger/12",
    edge: "bg-danger",
    ink: "text-danger",
    dot: "bg-danger",
    border: "border-danger/50",
  },
};

/**
 * An explicit locale, not the visitor's: a server that formats in one locale and
 * a client that formats in another produce different text for the same number,
 * which is a hydration mismatch on the largest string on the screen.
 */
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const units = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

const defaultFormat = (value: number) => currency.format(value);
const defaultFormatUnits = (value: number, symbol: string) =>
  `${units.format(value)} ${symbol}`;

const DIGITS = "0123456789";

/** FNV-1a: a stable seed per chain id, so the mark is the same on both passes. */
const seedOf = (input: string): number => {
  let h = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    h ^= input.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** A six-point mark whose alternating radii come from the seed's low bits. */
const markPath = (seed: number): string => {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI * 2 * index) / 6 - Math.PI / 2;
    const radius = (seed >>> (index * 3)) & 1 ? 9 : 6.2;
    const x = 12 + Math.cos(angle) * radius;
    const y = 12 + Math.sin(angle) * radius;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `M${points.join("L")}Z`;
};

/**
 * The headline figure. Each digit column is one ten-face strip translated by a
 * percentage of its own height, so a single `y` moves exactly one face, and the
 * cascade runs from the units column leftwards the way an odometer's small
 * wheels stop first.
 *
 * Hidden from assistive technology: the status sentence below already carries
 * the amount, and no reader should wade through ten faces a column.
 */
function RollingFigure({
  text,
  motionSafe,
}: {
  text: string;
  motionSafe: boolean;
}) {
  const chars = text.split("");
  const stagger = cascade(chars.length);

  return (
    <span aria-hidden className="inline-flex items-center tabular-nums">
      {chars.map((char, index) => {
        const digit = DIGITS.indexOf(char);
        // Keyed from the right so the units column keeps its identity when the
        // figure gains or loses a digit and only the new column mounts.
        const key = chars.length - index;
        if (digit < 0) {
          return (
            <span key={key} className="inline-block">
              {char}
            </span>
          );
        }
        const fromRight = chars.length - 1 - index;
        return (
          <span
            key={key}
            className="relative inline-block h-[1.15em] w-[1ch] overflow-hidden"
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col"
              initial={false}
              animate={{ y: `${digit * -10}%` }}
              transition={
                motionSafe
                  ? { ...springs.snap, delay: fromRight * stagger }
                  : { duration: 0 }
              }
            >
              {DIGITS.split("").map((face) => (
                <span
                  key={face}
                  className="flex h-[1.15em] items-center justify-center"
                >
                  {face}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A wallet header that changes chain without moving anything else. Picking a
 * chain wipes its tone across the header — a `clipPath` tween that enters from
 * the side the pick lies on, so the colour arrives from the direction you moved
 * — while the chain badge leaves on the exit ease and the new one arrives from
 * 8px away on `snap`, one crisp overshoot, the physics of an indicator taking a
 * new position. The balance re-rolls beneath it on `snap`, cascading from the
 * units column leftwards.
 *
 * Every layer is drawn for every chain and collapsed to the edge it sits on
 * rather than mounted on demand: an element that is already in place cannot
 * disagree with the one leaving about which direction the wipe runs, and there
 * is no exit to schedule.
 *
 * It is a radio group: a roving tabindex where Left and Right step without
 * wrapping past the ends, Home and End jump, and Space selects. Under reduced
 * motion the wash cross-fades, the badge swaps in place and the digits jump to
 * their faces — the tone and the figure still change, because which chain you
 * are on is the information.
 */
export function NetworkPick({
  ref,
  chains,
  value,
  defaultValue,
  onValueChange,
  format = defaultFormat,
  formatUnits = defaultFormatUnits,
  label,
  caption,
  className,
  "aria-label": ariaLabel,
}: NetworkPickProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const labelId = `${baseId}-label`;

  const [uncontrolled, setUncontrolled] = React.useState<string>(
    defaultValue ?? chains[0]?.id ?? "",
  );
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolled;
  const currentIndex = Math.max(
    0,
    chains.findIndex((chain) => chain.id === current),
  );
  const chain = chains[currentIndex];

  const select = (next: string) => {
    if (next === current) return;
    if (!isControlled) setUncontrolled(next);
    onValueChange?.(next);
  };

  const focusAt = (index: number) => {
    const clamped = Math.min(chains.length - 1, Math.max(0, index));
    const target = chains[clamped];
    if (!target) return;
    document.getElementById(`${baseId}-chip-${target.id}`)?.focus();
    select(target.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(chains.length - 1);
        break;
      case " ":
        event.preventDefault();
        select(chains[index]?.id ?? "");
        break;
      default:
        break;
    }
  };

  const wipe = { duration: durations.base, ease: easings.enter } as const;
  const fade = { duration: durations.fast, ease: easings.enter } as const;

  if (!chain) return null;

  return (
    <div ref={ref} className={cn("flex w-full flex-col gap-3", className)}>
      {label ? (
        <span id={labelId} className="text-sm font-semibold">
          {label}
        </span>
      ) : null}

      <div className="relative overflow-hidden rounded-3 border border-hairline bg-surface-1">
        {chains.map((entry, index) => {
          const tone = TONES[entry.tone];
          const chosen = index === currentIndex;
          // Collapsed toward the edge the chain sits on, so selecting it
          // expands the wash from that side and deselecting retreats it there.
          const clipPath = chosen
            ? "inset(0% 0% 0% 0%)"
            : index < currentIndex
              ? "inset(0% 100% 0% 0%)"
              : "inset(0% 0% 0% 100%)";
          return (
            <motion.span
              key={entry.id}
              aria-hidden
              className={cn("absolute inset-0", tone.wash)}
              initial={false}
              animate={
                motionSafe
                  ? { clipPath, opacity: 1 }
                  : { clipPath: "inset(0% 0% 0% 0%)", opacity: chosen ? 1 : 0 }
              }
              transition={motionSafe ? wipe : fade}
            >
              <span
                className={cn("absolute inset-x-0 top-0 h-0.5", tone.edge)}
              />
            </motion.span>
          );
        })}

        <div className="relative flex flex-col gap-3 p-4">
          {/* One grid cell holds every badge, so the cell is as wide as the
              widest chain and a switch cannot shift the figure beneath it. */}
          <div className="grid min-w-0">
            {chains.map((entry, index) => {
              const tone = TONES[entry.tone];
              const chosen = index === currentIndex;
              const offset = chosen
                ? 0
                : index < currentIndex
                  ? -distances.step
                  : distances.step;
              return (
                <motion.span
                  key={entry.id}
                  aria-hidden
                  className={cn(
                    "col-start-1 row-start-1 flex min-w-0 items-center gap-2",
                    !chosen && "pointer-events-none",
                  )}
                  initial={false}
                  animate={
                    motionSafe
                      ? { x: offset, opacity: chosen ? 1 : 0 }
                      : { x: 0, opacity: chosen ? 1 : 0 }
                  }
                  transition={
                    motionSafe
                      ? chosen
                        ? { ...springs.snap, opacity: fade }
                        : exitFor()
                      : fade
                  }
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline bg-surface-0">
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden
                      className={cn("size-4", tone.ink)}
                    >
                      <path
                        d={markPath(seedOf(entry.id))}
                        fill="currentColor"
                        fillOpacity="0.22"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span
                      title={entry.name}
                      className="truncate text-sm leading-tight font-medium text-ink"
                    >
                      {entry.name}
                    </span>
                    <span className="font-mono text-[10px] leading-tight tracking-[0.08em] text-ink-3 uppercase">
                      {entry.symbol}
                    </span>
                  </span>
                </motion.span>
              );
            })}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-2xl leading-none font-semibold text-ink">
              <RollingFigure
                text={format(chain.fiat)}
                motionSafe={motionSafe}
              />
            </span>
            {/* The native figure is the quiet half of the swap: it cross-fades
                in one shared cell so the row keeps the widest chain's width. */}
            <span className="grid justify-items-start">
              {chains.map((entry, index) => (
                <motion.span
                  key={entry.id}
                  aria-hidden
                  className="col-start-1 row-start-1 font-mono text-[11px] text-ink-2 tabular-nums"
                  initial={false}
                  animate={{ opacity: index === currentIndex ? 1 : 0 }}
                  transition={fade}
                >
                  {formatUnits(entry.balance, entry.symbol)}
                </motion.span>
              ))}
            </span>
          </div>

          {caption ? (
            <span className="text-[11px] text-ink-3">{caption}</span>
          ) : null}
        </div>
      </div>

      <div
        role="radiogroup"
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : ariaLabel}
        className="flex flex-wrap gap-1.5"
      >
        {chains.map((entry, index) => {
          const tone = TONES[entry.tone];
          const chosen = index === currentIndex;
          return (
            <button
              key={entry.id}
              id={`${baseId}-chip-${entry.id}`}
              type="button"
              role="radio"
              aria-checked={chosen}
              tabIndex={chosen ? 0 : -1}
              onClick={() => select(entry.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                chosen
                  ? cn("text-ink", tone.border, tone.wash)
                  : "border-hairline text-ink-3 hover:bg-accent hover:text-ink",
              )}
            >
              <span
                aria-hidden
                className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
              />
              {entry.name}
            </button>
          );
        })}
      </div>

      <span role="status" className="sr-only">
        {`${chain.name}. ${formatUnits(chain.balance, chain.symbol)}, ${format(chain.fiat)}.`}
      </span>
    </div>
  );
}
