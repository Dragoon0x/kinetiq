"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const SIZES = { sm: 24, md: 40, lg: 64 } as const;

const PERCENT_TEXT = {
  sm: "text-[7px]",
  md: "text-[10px]",
  lg: "text-sm",
} as const;

export type MetronomeLoaderProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children"
> & {
  /** Indeterminate style. Ignored once `value` is set. */
  variant?: "pendulum" | "bearing" | "sweep";
  size?: keyof typeof SIZES;
  /** 0–100. Providing a number morphs the loader into an arc gauge. */
  value?: number;
  /** Accessible name; visually hidden unless `showLabel`. */
  label?: string;
  showLabel?: boolean;
};

/** Pivot dot + rod + bob swinging ±28°, ~1.6s per full cycle (drift feel). */
function Pendulum({ px, active }: { px: number; active: boolean }) {
  const pivotTop = px * 0.12;
  const armLength = px * 0.66;
  const bob = Math.max(5, Math.round(px * 0.2));
  const dot = Math.max(3, Math.round(px * 0.09));
  return (
    <div className="relative size-full">
      <motion.div
        className="absolute"
        style={{
          left: "50%",
          x: "-50%",
          top: pivotTop,
          width: bob,
          height: armLength,
          transformOrigin: "50% 0%",
        }}
        initial={false}
        animate={active ? { rotate: [-28, 28] } : { rotate: 0 }}
        transition={
          active
            ? {
                duration: 0.8,
                ease: "easeInOut",
                repeat: Infinity,
                repeatType: "reverse",
              }
            : { duration: 0 }
        }
      >
        <span className="bg-muted-foreground absolute top-0 left-1/2 h-full w-px -translate-x-1/2" />
        <span
          className="bg-primary absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full"
          style={{ width: bob, height: bob }}
        />
      </motion.div>
      <span
        className="bg-foreground absolute rounded-full"
        style={{
          left: "50%",
          top: pivotTop,
          width: dot,
          height: dot,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

/** Momentum cradle: end balls trade swings while the middle row shunts 1px. */
function Bearing({ px, active }: { px: number; active: boolean }) {
  const ball = Math.max(4, Math.round(px * 0.16));
  const out = Math.max(6, Math.round(px * 0.22));
  const middle = {
    x: [0, 0, 1, 0, 0, -1, 0],
    times: [0, 0.4, 0.44, 0.5, 0.88, 0.92, 1],
  };
  const balls = [
    {
      x: [0, -out, 0, 0, -1, 0, 0],
      times: [0, 0.19, 0.4, 0.88, 0.92, 0.96, 1],
    },
    middle,
    middle,
    middle,
    {
      x: [0, 0, 1, 0, out, 0, 0],
      times: [0, 0.4, 0.44, 0.48, 0.68, 0.9, 1],
    },
  ];
  return (
    <div className="flex size-full items-center justify-center gap-px">
      {balls.map((keyframes, index) => (
        <motion.span
          key={index}
          className="bg-foreground/75 block shrink-0 rounded-full"
          style={{ width: ball, height: ball }}
          initial={false}
          animate={active ? { x: keyframes.x } : { x: 0 }}
          transition={
            active
              ? {
                  duration: 1.4,
                  times: keyframes.times,
                  ease: "easeInOut",
                  repeat: Infinity,
                }
              : { duration: 0 }
          }
        />
      ))}
    </div>
  );
}

/** Radar arc: gradient sweep line rotating over faint graticule rings. */
function Sweep({ active }: { active: boolean }) {
  return (
    <div className="relative size-full">
      <svg viewBox="0 0 40 40" fill="none" className="absolute inset-0 size-full">
        <circle cx="20" cy="20" r="19" stroke="var(--border)" />
        <circle cx="20" cy="20" r="12.5" stroke="var(--border)" />
        <circle cx="20" cy="20" r="6" stroke="var(--border)" />
        <circle cx="20" cy="20" r="1.6" fill="var(--muted-foreground)" />
      </svg>
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={active ? { rotate: 360 } : { rotate: 0 }}
        transition={
          active
            ? { duration: 1.8, ease: "linear", repeat: Infinity }
            : { duration: 0 }
        }
      >
        <span
          className="absolute inset-0 rounded-full opacity-40"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, var(--primary) 360deg)",
          }}
        />
        <span className="bg-primary absolute top-[5%] left-1/2 h-[45%] w-px -translate-x-1/2" />
      </motion.div>
    </div>
  );
}

/** Determinate arc gauge; the arc fills on `glide`, percentage in the middle. */
function Gauge({
  value,
  textClass,
  motionSafe,
}: {
  value: number;
  textClass: string;
  motionSafe: boolean;
}) {
  return (
    <div className="relative size-full">
      <svg viewBox="0 0 40 40" fill="none" className="size-full -rotate-90">
        <circle cx="20" cy="20" r="16.5" stroke="var(--border)" strokeWidth="3" />
        <motion.circle
          cx="20"
          cy="20"
          r="16.5"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="1 1"
          initial={false}
          animate={{ strokeDashoffset: 1 - value / 100 }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        />
      </svg>
      <span
        className={cn(
          "text-foreground absolute inset-0 flex items-center justify-center font-mono font-medium tabular-nums",
          textClass,
        )}
      >
        {Math.round(value)}%
      </span>
    </div>
  );
}

/**
 * Waiting, kept honest. Three indeterminate faces — a pendulum swinging ±28°
 * on a ~1.6s period, a momentum cradle of five bearings, a 1.8s radar sweep —
 * that crossfade into a determinate arc gauge (filled on `glide`) the moment
 * `value` arrives. Reduced motion freezes the glyph to a ≤1Hz opacity pulse;
 * the gauge steps instantly.
 */
export function MetronomeLoader({
  variant = "pendulum",
  size = "md",
  value,
  label,
  showLabel = false,
  className,
  ...props
}: MetronomeLoaderProps) {
  const motionSafe = useMotionSafe();
  const px = SIZES[size];
  const determinate = typeof value === "number";
  const clamped = determinate ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div
      {...props}
      role="progressbar"
      aria-label={label ?? "Loading"}
      {...(determinate
        ? {
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": Math.round(clamped),
          }
        : { "aria-valuetext": "Loading" })}
      className={cn("inline-flex flex-col items-center gap-1.5", className)}
    >
      <div aria-hidden className="relative" style={{ width: px, height: px }}>
        <AnimatePresence initial={false}>
          {determinate ? (
            <motion.div
              key="gauge"
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              <Gauge
                value={clamped}
                textClass={PERCENT_TEXT[size]}
                motionSafe={motionSafe}
              />
            </motion.div>
          ) : (
            <motion.div
              key={variant}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.base) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {/* Reduced motion: static glyph with a 0.5Hz opacity pulse. */}
              <motion.div
                className="size-full"
                animate={motionSafe ? undefined : { opacity: [0.5, 1] }}
                transition={
                  motionSafe
                    ? undefined
                    : {
                        duration: 1,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                      }
                }
              >
                {variant === "pendulum" ? (
                  <Pendulum px={px} active={motionSafe} />
                ) : variant === "bearing" ? (
                  <Bearing px={px} active={motionSafe} />
                ) : (
                  <Sweep active={motionSafe} />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {label ? (
        <span
          className={
            showLabel
              ? "text-muted-foreground font-mono text-[10px] tracking-[0.08em] uppercase"
              : "sr-only"
          }
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
