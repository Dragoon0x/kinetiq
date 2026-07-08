"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const SIZE_CLASSES = {
  sm: "text-sm",
  md: "text-xl",
  lg: "text-2xl",
  xl: "text-4xl",
} as const;

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Carry propagation: each higher-order changed digit waits one more step. */
const CARRY_STEP_S = 0.06;

/** Live announcements fire this long after the last change settles. */
const ANNOUNCE_DEBOUNCE_MS = 600;

const defaultFormat = (v: number): string => v.toLocaleString("en-US");

const isDigitChar = (ch: string): boolean => ch >= "0" && ch <= "9";

type Cell = {
  key: string;
  char: string;
  /** 0–9 for rolling cells; null renders a static separator/sign/unit cell. */
  digit: number | null;
  /** Fractional digits settle on the faster spring. */
  isDecimal: boolean;
  /** Seconds this digit waits for the carry to reach it. */
  delay: number;
  /** Skip the roll entirely (mount, reduced motion, or a rollOn miss). */
  instant: boolean;
};

function buildCells(
  formatted: string,
  prev: string | null,
  instant: boolean,
): Cell[] {
  const chars = Array.from(formatted);
  const prevChars = prev === null ? null : Array.from(prev);
  // Numbers grow at their left edge, so old and new align from the right.
  const offset = prevChars === null ? 0 : prevChars.length - chars.length;
  const dotIndex = chars.indexOf(".");

  // Digit order counted from the right, skipping separators.
  const orders: number[] = [];
  let order = 0;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    orders[i] = isDigitChar(chars[i] ?? "") ? order++ : -1;
  }

  const changed = chars.map((ch, i) => {
    if (!isDigitChar(ch) || prevChars === null) return false;
    return prevChars[i + offset] !== ch;
  });
  let lowestChangedOrder = Number.POSITIVE_INFINITY;
  changed.forEach((didChange, i) => {
    if (didChange) {
      lowestChangedOrder = Math.min(lowestChangedOrder, orders[i] ?? 0);
    }
  });

  return chars.map((ch, i) => {
    const fromRight = chars.length - i;
    if (!isDigitChar(ch)) {
      return {
        key: `s${fromRight}:${ch}`,
        char: ch,
        digit: null,
        isDecimal: false,
        delay: 0,
        instant: true,
      };
    }
    // The lowest changed digit starts now; each higher order joins 60ms later.
    const delay =
      changed[i] && Number.isFinite(lowestChangedOrder)
        ? ((orders[i] ?? 0) - lowestChangedOrder) * CARRY_STEP_S
        : 0;
    return {
      key: `d${fromRight}`,
      char: ch,
      digit: ch.charCodeAt(0) - 48,
      isDecimal: dotIndex !== -1 && i > dotIndex,
      delay,
      instant,
    };
  });
}

export type ReadoutProps = {
  value: number;
  /** Formats the value; any non-digit character renders as a static cell. */
  format?: (value: number) => string;
  size?: keyof typeof SIZE_CLASSES;
  /**
   * "increase" swaps decreases in instantly — for latency-style metrics
   * where down is instant-good and only regressions deserve momentum.
   */
  rollOn?: "any" | "increase";
  /** Change badge that flips up whenever it changes. */
  delta?: { value: string; direction: "up" | "down" };
  className?: string;
};

/**
 * Numbers with momentum. Each digit is an overflow-hidden window over a 0–9
 * strip that rolls to its target on `glide` (decimals settle on the faster
 * `flick`), and changes carry right-to-left: the lowest changed digit moves
 * first and each higher order follows 60ms later, so 199 → 200 visibly
 * carries. The delta badge flips up on `snap`. Reduced motion swaps the value
 * instantly and pulses the background instead.
 */
export function Readout({
  value,
  format,
  size = "md",
  rollOn = "any",
  delta,
  className,
}: ReadoutProps) {
  const motionSafe = useMotionSafe();
  const formatted = (format ?? defaultFormat)(value);

  const [cells, setCells] = React.useState<Cell[]>(() =>
    buildCells(formatted, null, true),
  );
  const [announced, setAnnounced] = React.useState(formatted);
  const [pulseKey, setPulseKey] = React.useState(0);
  const prevRef = React.useRef({ formatted, value });

  React.useEffect(() => {
    const prev = prevRef.current;
    if (prev.formatted === formatted) return;
    const instant =
      !motionSafe || (rollOn === "increase" && value < prev.value);
    setCells(buildCells(formatted, prev.formatted, instant));
    if (!motionSafe) setPulseKey((k) => k + 1);
    prevRef.current = { formatted, value };
  }, [formatted, value, motionSafe, rollOn]);

  // Announce once per burst — rapid streams reset the timer instead of spamming.
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnounced(formatted),
      ANNOUNCE_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [formatted]);

  return (
    <span className={cn("relative inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "relative inline-flex font-mono leading-none tabular-nums",
          SIZE_CLASSES[size],
        )}
      >
        {!motionSafe && pulseKey > 0 && (
          <motion.span
            key={pulseKey}
            className="bg-accent absolute -inset-x-1 -inset-y-0.5 rounded-1"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}
        {cells.map((cell) =>
          cell.digit === null ? (
            <span
              key={cell.key}
              className="relative inline-block h-[1em] whitespace-pre"
            >
              {cell.char}
            </span>
          ) : (
            <span
              key={cell.key}
              className="relative inline-block h-[1em] overflow-hidden"
            >
              <motion.span
                className="flex flex-col"
                initial={false}
                animate={{ y: `${-cell.digit}em` }}
                transition={
                  cell.instant
                    ? { duration: 0 }
                    : {
                        ...(cell.isDecimal ? springs.flick : springs.glide),
                        delay: cell.delay,
                      }
                }
              >
                {DIGITS.map((d) => (
                  <span key={d} className="block h-[1em]">
                    {d}
                  </span>
                ))}
              </motion.span>
            </span>
          ),
        )}
      </span>

      {delta && (
        <motion.span
          key={`${delta.direction}:${delta.value}`}
          initial={motionSafe ? { opacity: 0, y: 6, rotateX: -80 } : false}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{
            ...springs.snap,
            opacity: { duration: durations.fast, ease: easings.enter },
          }}
          style={{ transformPerspective: 300 }}
          className={cn(
            "font-mono text-xs font-medium tabular-nums",
            delta.direction === "up" ? "text-success" : "text-destructive",
          )}
        >
          {delta.value}
        </motion.span>
      )}

      <span className="sr-only">{formatted}</span>
      <span aria-live="polite" className="sr-only">
        {announced}
      </span>
    </span>
  );
}
