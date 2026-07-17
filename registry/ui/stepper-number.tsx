"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StepperNumberProps = {
  ref?: React.Ref<HTMLDivElement>;
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name for the control. @default "Amount" */
  label?: string;
  /** Formats the display and aria-valuetext. */
  format?: (value: number) => string;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function Chevron({ dir }: { dir: "up" | "down" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d={dir === "up" ? "M3.5 8.5 7 5 10.5 8.5" : "M3.5 5.5 7 9 10.5 5.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * A number spinner with weight to it. Hold a button and it accelerates from a
 * tick to a blur; each change rolls the readout like an odometer, up or down
 * with the direction of travel; and a push past the limit nudges and bounces
 * back instead of doing nothing. A real spinbutton — arrows, PageUp/Down, and
 * Home/End all work. Under reduced motion the readout swaps with no roll.
 */
export function StepperNumber({
  ref,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label = "Amount",
  format = (v) => String(v),
  className,
}: StepperNumberProps) {
  const motionSafe = useMotionSafe();
  const [dir, setDir] = React.useState(1);
  const valueRef = React.useRef(value);
  const hold = React.useRef<{ start: number | null; tick: number | null }>({
    start: null,
    tick: null,
  });
  const bounceX = useMotionValue(0);

  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const bounce = (direction: number) => {
    if (!motionSafe) return;
    animate(bounceX, [0, direction * 5, 0], {
      duration: durations.base,
      ease: easings.move,
    });
  };

  // Commit one step; returns false (and bounces) when already at the limit.
  const stepBy = (direction: number): boolean => {
    const cur = valueRef.current;
    const raw = cur + direction * step;
    const next = clamp(Number(raw.toFixed(6)), min, max);
    if (next === cur) {
      bounce(direction);
      return false;
    }
    valueRef.current = next;
    setDir(direction > 0 ? 1 : -1);
    onValueChange(next);
    return true;
  };

  const stopHold = React.useCallback(() => {
    if (hold.current.start !== null) window.clearTimeout(hold.current.start);
    if (hold.current.tick !== null) window.clearTimeout(hold.current.tick);
    hold.current.start = null;
    hold.current.tick = null;
  }, []);

  React.useEffect(() => stopHold, [stopHold]);

  const startHold = (direction: number) => {
    if (!stepBy(direction)) return;
    hold.current.start = window.setTimeout(() => {
      let delay = 120;
      const run = () => {
        if (!stepBy(direction)) {
          stopHold();
          return;
        }
        delay = Math.max(40, delay - 8);
        hold.current.tick = window.setTimeout(run, delay);
      };
      run();
    }, 380);
  };

  const setDirect = (next: number) => {
    const clamped = clamp(next, min, max);
    if (clamped === valueRef.current) return;
    setDir(clamped > valueRef.current ? 1 : -1);
    valueRef.current = clamped;
    onValueChange(clamped);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowUp":
        event.preventDefault();
        stepBy(1);
        break;
      case "ArrowDown":
        event.preventDefault();
        stepBy(-1);
        break;
      case "PageUp":
        event.preventDefault();
        setDirect(value + step * 10);
        break;
      case "PageDown":
        event.preventDefault();
        setDirect(value - step * 10);
        break;
      case "Home":
        event.preventDefault();
        setDirect(min);
        break;
      case "End":
        event.preventDefault();
        setDirect(max);
        break;
      default:
        break;
    }
  };

  const rollOffset = motionSafe ? "100%" : "0%";
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <div
      ref={ref}
      className={cn(
        "border-hairline bg-surface-1 inline-flex items-center gap-1 rounded-3 border p-1",
        className,
      )}
    >
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onPointerDown={(e) => {
          e.preventDefault();
          startHold(-1);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className={cn(
          "text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:ring-cobalt-bright/50 grid size-8 place-items-center rounded-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
          atMin && "opacity-40",
        )}
      >
        <Chevron dir="down" />
      </button>

      <motion.div
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={format(value)}
        onKeyDown={onKeyDown}
        style={{ x: bounceX }}
        className="focus-visible:ring-cobalt-bright/50 relative h-8 min-w-[3.5rem] overflow-hidden rounded-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={value}
            initial={{ y: dir > 0 ? rollOffset : `-${rollOffset}`, opacity: 0 }}
            animate={{
              y: "0%",
              opacity: 1,
              transition: motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast },
            }}
            exit={{
              y: dir > 0 ? `-${rollOffset}` : rollOffset,
              opacity: 0,
              transition: { duration: durations.fast, ease: easings.exit },
            }}
            className="text-ink absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums"
          >
            {format(value)}
          </motion.span>
        </AnimatePresence>
      </motion.div>

      <button
        type="button"
        aria-label={`Increase ${label}`}
        onPointerDown={(e) => {
          e.preventDefault();
          startHold(1);
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        className={cn(
          "text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:ring-cobalt-bright/50 grid size-8 place-items-center rounded-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
          atMax && "opacity-40",
        )}
      >
        <Chevron dir="up" />
      </button>
    </div>
  );
}
