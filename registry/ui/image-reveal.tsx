"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ImageRevealProps = {
  ref?: React.Ref<HTMLDivElement>;
  /** Generation progress from 0 to 1, owned by the host. */
  progress?: number;
  /** Discrete sharpening steps the blur resolves through. @default 4 */
  steps?: number;
  /** The render is in flight: sets `aria-busy` and disables the retry control. */
  generating?: boolean;
  /** Drives the procedural picture; changing it regenerates with a wipe. @default 1 */
  seed?: number;
  /** What was asked for; names the picture and heads the footer. */
  label: string;
  /** An invented model name for the footer line. */
  model?: string;
  /** Fires from the Retry button (labelled Generate before the first picture). */
  onRegenerate?: () => void;
  /** Fires once when the final sharpening step has finished. */
  onResolve?: () => void;
  className?: string;
};

/** Blur radius of the untouched field, in px. */
const MAX_BLUR = 14;

/** Saturation of the untouched field; a render starts grey and finds its colour. */
const MIN_SATURATION = 0.4;

const OPEN = "inset(0 0% 0 0)";
const CLIPPED_RIGHT = "inset(0 100% 0 0)";

/**
 * A small integer hash stream: integer ops only, so Node and the browser draw
 * the same picture for the same seed.
 */
function stream(seed: number) {
  let state = (Math.floor(seed) * 0x9e3779b1) >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (value: number) => Number(value.toFixed(3));

type Scene = {
  sun: { cx: number; cy: number; r: number };
  hills: string[];
  tower: { x: number; top: number };
};

/** A cold-morning coastline from a seed: a sun, three ridges, one tower. */
function scene(seed: number): Scene {
  const next = stream(seed);
  const sun = {
    cx: round(24 + next() * 112),
    cy: round(14 + next() * 22),
    r: round(6 + next() * 5),
  };
  const ridges: number[][] = [];
  const hills = [0, 1, 2].map((layer) => {
    const base = 54 + layer * 15;
    const ys = Array.from({ length: 9 }, () =>
      round(base - next() * (14 - layer * 2)),
    );
    ridges.push(ys);
    const line = ys.map((y, index) => `L${index * 20},${y}`).join(" ");
    return `M0,100 ${line} L160,100 Z`;
  });
  const stop = 2 + Math.floor(next() * 5);
  const middle = ridges[1] ?? [];
  const tower = { x: stop * 20, top: round((middle[stop] ?? 70) - 22) };
  return { sun, hills, tower };
}

/**
 * A generated image that sharpens in steps. `progress` is quantised into
 * `steps`; each step drops the blur and lifts the saturation on a
 * `durations.slow` tween with the enter ease — blur is a tween property, not
 * physics — and nothing moves between steps, so the viewer reads a picture
 * developing rather than a fade. A ring in the corner drains as progress
 * grows and gives way to a tick drawn on `flick` when the last step lands;
 * `onResolve` fires from that tick's completion, which is the one animation
 * both motion branches run.
 *
 * A new `seed` wipes in over the old picture: the new field mounts behind a
 * `clipPath` inset that opens left to right on the move ease with a bright
 * edge riding the front, and the old picture leaves once the front has
 * passed. The picture itself is procedural — token colours, seeded shapes —
 * never an asset. Under reduced motion each step swaps instantly, the wipe is
 * a cross-fade, and the ring and tick still show, because progress is
 * information.
 */
export function ImageReveal({
  ref,
  progress = 0,
  steps = 4,
  generating = false,
  seed = 1,
  label,
  model,
  onRegenerate,
  onResolve,
  className,
}: ImageRevealProps) {
  const motionSafe = useMotionSafe();
  const baseId = React.useId();
  const skyId = `${baseId}-sky`;

  const count = Math.max(1, Math.floor(steps));
  const fraction = Math.min(1, Math.max(0, progress));
  const stepsDone = Math.min(count, Math.floor(fraction * count + 1e-6));
  const complete = stepsDone >= count;
  const active = generating || fraction > 0;

  // The first seed this instance saw; any other seed is a retake.
  const [firstSeed] = React.useState(seed);
  const retake = seed !== firstSeed;

  const remaining = (count - stepsDone) / count;
  const blur = Math.round(MAX_BLUR * remaining * remaining * 10) / 10;
  const saturation = round(
    MIN_SATURATION + (1 - MIN_SATURATION) * (1 - remaining),
  );
  const filter = `blur(${blur}px) saturate(${saturation})`;
  const drawing = React.useMemo(() => scene(seed), [seed]);

  const wipe = { duration: durations.slow, ease: easings.move } as const;
  const fade = { duration: durations.base, ease: easings.enter } as const;

  const stage = complete ? "resolved" : active ? "rendering" : "idle";
  const announcement =
    stage === "resolved"
      ? "Image resolved"
      : stage === "rendering"
        ? retake
          ? "Rendering again"
          : "Rendering"
        : "";

  return (
    <div
      ref={ref}
      className={cn(
        "w-full overflow-hidden rounded-3 border border-hairline bg-surface-1",
        className,
      )}
    >
      <div
        role="img"
        aria-label={active ? label : `${label}, not rendered yet`}
        aria-busy={generating || undefined}
        className="relative aspect-[16/10] w-full overflow-hidden bg-surface-2"
      >
        <AnimatePresence initial={false}>
          {!active ? (
            <motion.span
              key="idle"
              className="absolute inset-0 flex items-center justify-center text-xs text-ink-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={fade}
            >
              Nothing rendered yet
            </motion.span>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {active ? (
            <motion.div
              key={`take-${seed}`}
              aria-hidden
              className="absolute inset-0"
              initial={
                motionSafe ? { clipPath: CLIPPED_RIGHT } : { opacity: 0 }
              }
              animate={{ clipPath: OPEN, opacity: 1, filter }}
              exit={
                motionSafe
                  ? // Stays whole beneath the wipe and leaves only once the
                    // front has crossed; a fade during the wipe would show
                    // the empty field through the still-clipped strip.
                    {
                      opacity: 0,
                      transition: {
                        duration: durations.blink,
                        delay: wipe.duration,
                      },
                    }
                  : { opacity: 0, transition: exitFor() }
              }
              transition={{
                clipPath: wipe,
                opacity: fade,
                filter: motionSafe
                  ? { duration: durations.slow, ease: easings.enter }
                  : { duration: 0 },
              }}
            >
              <svg
                viewBox="0 0 160 100"
                preserveAspectRatio="xMidYMid slice"
                className="block size-full"
              >
                <defs>
                  <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="var(--color-cobalt-wash)" />
                    <stop offset="1" stopColor="var(--color-surface-0)" />
                  </linearGradient>
                </defs>
                <rect width="160" height="100" fill={`url(#${skyId})`} />
                <circle
                  cx={drawing.sun.cx}
                  cy={drawing.sun.cy}
                  r={drawing.sun.r}
                  className="fill-warn"
                />
                {drawing.hills.map((d, index) => (
                  <path
                    key={index}
                    d={d}
                    className="fill-cobalt"
                    fillOpacity={0.3 + index * 0.25}
                  />
                ))}
                <rect
                  x={drawing.tower.x - 3}
                  y={drawing.tower.top}
                  width="6"
                  height="30"
                  className="fill-ink"
                />
                <circle
                  cx={drawing.tower.x}
                  cy={drawing.tower.top}
                  r="2.5"
                  className="fill-warn"
                />
              </svg>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {motionSafe ? (
          <AnimatePresence initial={false}>
            {active ? (
              <motion.span
                key={`edge-${seed}`}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-0.5 bg-cobalt-bright"
                initial={{ left: "0%", opacity: 1 }}
                animate={{ left: "100%", opacity: 0 }}
                exit={{ opacity: 0, transition: { duration: 0 } }}
                transition={{
                  left: wipe,
                  opacity: {
                    duration: durations.fast,
                    delay: wipe.duration - durations.fast,
                  },
                }}
              />
            ) : null}
          </AnimatePresence>
        ) : null}

        <AnimatePresence initial={false}>
          {active ? (
            <motion.span
              key="chip"
              aria-hidden
              className="absolute top-2 right-2 grid size-7 place-items-center rounded-full border border-hairline bg-surface-0/85"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor() }}
              transition={fade}
            >
              <motion.svg
                viewBox="0 0 24 24"
                className="col-start-1 row-start-1 size-5"
                animate={{ opacity: complete ? 0 : 1 }}
                transition={fade}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.2"
                  strokeWidth="2.5"
                />
                <motion.circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  className="text-cobalt-bright"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  transform="rotate(-90 12 12)"
                  initial={false}
                  animate={{ strokeDashoffset: round(1 - fraction) }}
                  transition={fade}
                />
              </motion.svg>
              {/* The tick is the one animation both motion branches run, so
                  its completion is where the resolve is reported from. It is
                  keyed by seed so a retake mounts a fresh one. */}
              <AnimatePresence>
                {complete ? (
                  <motion.svg
                    key={`tick-${seed}`}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="col-start-1 row-start-1 size-4 text-success"
                    exit={{ opacity: 0, transition: { duration: 0 } }}
                  >
                    <motion.path
                      d="M3.5 8.5 6.5 11.5 12.5 4.5"
                      initial={
                        motionSafe
                          ? { pathLength: 0, opacity: 1 }
                          : { pathLength: 1, opacity: 0 }
                      }
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={
                        motionSafe
                          ? { ...springs.flick, delay: durations.slow }
                          : { duration: durations.fast }
                      }
                      onAnimationComplete={() => onResolve?.()}
                    />
                  </motion.svg>
                ) : null}
              </AnimatePresence>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3 border-t border-hairline px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium text-foreground"
            title={label}
          >
            {label}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {model ? `${model} · ` : ""}
            {complete
              ? `${count} steps`
              : active
                ? `Step ${Math.min(count, stepsDone + 1)} of ${count}`
                : "Not rendered"}
          </p>
        </div>
        <button
          type="button"
          disabled={generating}
          onClick={() => onRegenerate?.()}
          className={cn(
            "flex h-8 shrink-0 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent disabled:opacity-50 disabled:hover:bg-transparent",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {active ? "Retry" : "Generate"}
        </button>
      </div>

      <span role="status" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
