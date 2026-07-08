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
  variant?: "pendulum" | "bearing" | "sweep" | "helix" | "printout" | "scramble";
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

/** Two dots counter-orbiting a vertical axis; scale/opacity fake the depth. */
function Helix({ px, active }: { px: number; active: boolean }) {
  const dot = Math.max(4, Math.round(px * 0.16));
  const swing = px * 0.28;
  const dots = [
    {
      x: [0, swing, 0, -swing, 0],
      scale: [1, 0.8, 0.55, 0.8, 1],
      opacity: [1, 0.75, 0.45, 0.75, 1],
      rest: { x: -dot * 0.45, scale: 1, opacity: 1 },
    },
    {
      x: [0, -swing, 0, swing, 0],
      scale: [0.55, 0.8, 1, 0.8, 0.55],
      opacity: [0.45, 0.75, 1, 0.75, 0.45],
      rest: { x: dot * 0.45, scale: 0.6, opacity: 0.5 },
    },
  ];
  return (
    <div className="relative size-full">
      <span className="bg-border absolute top-[18%] bottom-[18%] left-1/2 w-px -translate-x-1/2" />
      {dots.map((config, index) => (
        <motion.span
          key={index}
          className="bg-primary absolute top-1/2 left-1/2 rounded-full"
          style={{ width: dot, height: dot, y: "-50%", marginLeft: -dot / 2 }}
          initial={false}
          // Quarter-phase sine samples; easeInOut segments round them off.
          animate={
            active
              ? { x: config.x, scale: config.scale, opacity: config.opacity }
              : config.rest
          }
          transition={
            active
              ? {
                  duration: 1.6,
                  times: [0, 0.25, 0.5, 0.75, 1],
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

const PRINTOUT_CYCLE = 1.4;

/** A slot hairline emits three mono tick rows that step upward and fade. */
function Printout({ px, active }: { px: number; active: boolean }) {
  const step = px * 0.18;
  const dashHeight = Math.max(1, Math.round(px * 0.05));
  const rows = [
    { widths: [0.18, 0.1, 0.14], delay: 0 },
    { widths: [0.1, 0.2, 0.1], delay: PRINTOUT_CYCLE / 3 },
    { widths: [0.14, 0.1, 0.18], delay: (PRINTOUT_CYCLE / 3) * 2 },
  ];
  return (
    <div className="relative size-full">
      <span className="bg-muted-foreground absolute inset-x-[16%] bottom-[24%] h-px" />
      {rows.map((row, index) => (
        <motion.span
          key={index}
          className="absolute inset-x-0 bottom-[24%] flex items-center justify-center"
          style={{ gap: Math.max(2, Math.round(px * 0.06)) }}
          initial={false}
          // Hold-then-jump keyframes: each row climbs in discrete steps.
          animate={
            active
              ? {
                  y: [0, -step, -step, -2 * step, -2 * step, -3 * step],
                  opacity: [0, 1, 1, 0.7, 0.7, 0],
                }
              : { y: -step * (3 - index), opacity: 0.35 + index * 0.3 }
          }
          transition={
            active
              ? {
                  duration: PRINTOUT_CYCLE,
                  times: [0, 0.18, 0.4, 0.58, 0.8, 1],
                  ease: "easeOut",
                  repeat: Infinity,
                  delay: row.delay,
                }
              : { duration: 0 }
          }
        >
          {row.widths.map((width, dashIndex) => (
            <span
              key={dashIndex}
              className="bg-foreground/70 block rounded-full"
              style={{
                width: Math.max(2, Math.round(px * width)),
                height: dashHeight,
              }}
            />
          ))}
        </motion.span>
      ))}
    </div>
  );
}

const SCRAMBLE_TICK_MS = 30;
const SCRAMBLE_GLYPHS = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·-");

/** djb2 — deterministic per cell, so SSR and client agree on every glyph. */
const djb2 = (input: string): number => {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(hash, 33) + input.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
};

const SCRAMBLE_SEEDS = [0, 1, 2].map((cell) => djb2(`metronome:${cell}`));

/** Three mono cells cycling hash-seeded glyphs on one shared ~30ms clock. */
function Scramble({ px, active }: { px: number; active: boolean }) {
  const [tick, setTick] = React.useState(0);

  // Elapsed-time rAF clock; stalls while the document is hidden.
  React.useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last: number | null = null;
    let elapsed = 0;

    const step = (now: number) => {
      raf = 0;
      if (last !== null) elapsed += now - last;
      last = now;
      const next = Math.floor(elapsed / SCRAMBLE_TICK_MS);
      setTick((current) => (current === next ? current : next));
      raf = requestAnimationFrame(step);
    };
    const start = () => {
      if (raf) return;
      last = null;
      raf = requestAnimationFrame(step);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active]);

  return (
    <div
      className="text-foreground/80 flex size-full items-center justify-center font-mono font-medium"
      style={{
        fontSize: Math.max(9, Math.round(px * 0.3)),
        gap: Math.max(2, Math.round(px * 0.07)),
      }}
    >
      {SCRAMBLE_SEEDS.map((seed, cell) => (
        <span
          key={cell}
          className="flex items-center justify-center tabular-nums"
          style={{ width: Math.max(7, Math.round(px * 0.24)) }}
        >
          {active
            ? (SCRAMBLE_GLYPHS[(seed + tick) % SCRAMBLE_GLYPHS.length] ?? "·")
            : "·"}
        </span>
      ))}
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
 * Waiting, kept honest. Six indeterminate faces — a pendulum swinging ±28°
 * on a ~1.6s period, a momentum cradle of five bearings, a 1.8s radar sweep,
 * two dots counter-orbiting a helix axis (1.6s, depth faked by scale), a
 * printout slot stepping tick rows upward on a ~1.4s stagger, and three mono
 * cells scrambling hash-seeded glyphs on a shared ~30ms clock — that
 * crossfade into a determinate arc gauge (filled on `glide`) the moment
 * `value` arrives. Reduced motion freezes the glyph (crossed helix pose,
 * static printout strip, frozen "···") to a ≤1Hz opacity pulse; the gauge
 * steps instantly.
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
                ) : variant === "helix" ? (
                  <Helix px={px} active={motionSafe} />
                ) : variant === "printout" ? (
                  <Printout px={px} active={motionSafe} />
                ) : variant === "scramble" ? (
                  <Scramble px={px} active={motionSafe} />
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
