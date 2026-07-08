"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const DEFAULT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·-";

/** Long distances jump most of the way, then flip the last few steps. */
const MAX_FLIPS = 8;
const COLUMN_STAGGER_MS = 30;

const SIZE_CLASSES = {
  sm: "h-6 w-3.5 text-[11px]",
  md: "h-8 w-5 text-sm",
  lg: "h-11 w-7 text-lg",
} as const;

export type FlapboardProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children"
> & {
  /** Text to display. Characters normalize to the charset case. */
  value: string;
  /** Charset cells scan through, in flip order. */
  chars?: string;
  /** Milliseconds per flip step (one half-fold + catch). */
  flipSpeed?: number;
  /** Minimum cell count — shorter values pad with spaces. */
  padTo?: number;
  /** Which side the value sits on when padded. */
  align?: "left" | "right";
  size?: keyof typeof SIZE_CLASSES;
};

function normalizeValue(
  value: string,
  chars: string,
  padTo: number | undefined,
  align: "left" | "right",
): string {
  const mapped = Array.from(value)
    .map((char) =>
      chars.includes(char)
        ? char
        : chars.includes(char.toUpperCase())
          ? char.toUpperCase()
          : char,
    )
    .join("");
  if (padTo === undefined || mapped.length >= padTo) return mapped;
  const pad = " ".repeat(padTo - mapped.length);
  return align === "right" ? pad + mapped : mapped + pad;
}

/** Sequential scan through the charset, capped — jump closer first if far. */
function buildQueue(from: string, to: string, chars: string): string[] {
  if (from === to) return [];
  const list = Array.from(chars);
  const fromIndex = list.indexOf(from);
  const toIndex = list.indexOf(to);
  // Unknown characters land directly with a single flip.
  if (fromIndex === -1 || toIndex === -1) return [to];
  const length = list.length;
  let distance = (toIndex - fromIndex + length) % length;
  let start = fromIndex;
  if (distance > MAX_FLIPS) {
    start = (toIndex - MAX_FLIPS + length) % length;
    distance = MAX_FLIPS;
  }
  const queue: string[] = [];
  for (let step = 1; step <= distance; step++) {
    queue.push(list[(start + step) % length] ?? to);
  }
  return queue;
}

type CellFlip = { from: string; to: string; id: number };

type FlapCellProps = {
  target: string;
  chars: string;
  flipSpeed: number;
  delay: number;
  className?: string;
};

function FlapCell({ target, chars, flipSpeed, delay, className }: FlapCellProps) {
  const [display, setDisplay] = React.useState(target);
  const [flip, setFlip] = React.useState<CellFlip | null>(null);
  const displayRef = React.useRef(target);
  const flipCount = React.useRef(0);

  // Per-cell state machine: advance through the queue on a setTimeout chain.
  React.useEffect(() => {
    if (displayRef.current === target) {
      setFlip(null);
      return;
    }
    const timers: number[] = [];
    const advance = (queue: readonly string[], index: number) => {
      const next = queue[index];
      if (next === undefined) {
        setFlip(null);
        return;
      }
      const from = displayRef.current;
      displayRef.current = next;
      flipCount.current += 1;
      setDisplay(next);
      setFlip({ from, to: next, id: flipCount.current });
      timers.push(window.setTimeout(() => advance(queue, index + 1), flipSpeed));
    };
    timers.push(
      window.setTimeout(() => {
        advance(buildQueue(displayRef.current, target, chars), 0);
      }, delay),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [target, chars, flipSpeed, delay]);

  const half = flipSpeed / 2000;
  const topChar = flip ? flip.to : display;
  const bottomChar = flip ? flip.from : display;

  return (
    <span
      className={cn(
        "border-border bg-muted relative block overflow-hidden rounded-1 border",
        className,
      )}
      style={{ perspective: 240 }}
    >
      {/* Static top window: the incoming char, revealed as the flap falls. */}
      <span className="absolute inset-x-0 top-0 h-1/2 overflow-hidden">
        <span className="flex h-[200%] items-center justify-center">
          {topChar}
        </span>
      </span>
      {/* Static bottom window: the outgoing char, covered when the flap lands. */}
      <span className="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
        <span className="flex h-[200%] -translate-y-1/2 items-center justify-center">
          {bottomChar}
        </span>
      </span>
      {flip && (
        <>
          {/* Outgoing top half folds down over the seam. */}
          <motion.span
            key={`top-${flip.id}`}
            className="bg-muted absolute inset-x-0 top-0 block h-1/2 overflow-hidden"
            style={{ transformOrigin: "50% 100%", backfaceVisibility: "hidden" }}
            initial={{ rotateX: 0 }}
            animate={{ rotateX: -90 }}
            transition={{ duration: half, ease: easings.exit }}
          >
            <span className="flex h-[200%] items-center justify-center">
              {flip.from}
            </span>
            <span className="from-background/0 to-background/50 absolute inset-0 bg-linear-to-b" />
          </motion.span>
          {/* Incoming bottom half catches after the fold. */}
          <motion.span
            key={`bottom-${flip.id}`}
            className="bg-muted absolute inset-x-0 bottom-0 block h-1/2 overflow-hidden"
            style={{ transformOrigin: "50% 0%", backfaceVisibility: "hidden" }}
            initial={{ rotateX: 90 }}
            animate={{ rotateX: 0 }}
            transition={{ duration: half, delay: half, ease: easings.enter }}
          >
            <span className="flex h-[200%] -translate-y-1/2 items-center justify-center">
              {flip.to}
            </span>
            <span className="from-background/0 to-background/50 absolute inset-0 bg-linear-to-t" />
          </motion.span>
        </>
      )}
      {/* Seam across the middle of the tile. */}
      <span className="border-border absolute inset-x-0 top-1/2 z-10 border-t" />
    </span>
  );
}

/**
 * Split-flap departures for your data. When a character changes, its cell
 * flips through intermediate charset steps — the outgoing top half folds down
 * on `easings.exit`, the incoming bottom half catches on `easings.enter` —
 * and columns cascade left to right 30ms apart. A polite live region
 * announces the settled value once the board stops. Reduced motion skips the
 * flipping and crossfades the whole board at `durations.fast`.
 */
export function Flapboard({
  value,
  chars = DEFAULT_CHARS,
  flipSpeed = 40,
  padTo,
  align = "left",
  size = "md",
  className,
  ...props
}: FlapboardProps) {
  const motionSafe = useMotionSafe();
  const speed = Math.max(16, flipSpeed);
  const normalized = React.useMemo(
    () => normalizeValue(value, chars, padTo, align),
    [value, chars, padTo, align],
  );
  const cells = React.useMemo(() => Array.from(normalized), [normalized]);
  const [announced, setAnnounced] = React.useState(normalized);

  // Announce once per change, debounced until the last column settles.
  React.useEffect(() => {
    const settleMs = motionSafe
      ? cells.length * COLUMN_STAGGER_MS + (MAX_FLIPS + 1) * speed + 120
      : durations.fast * 1000;
    const timer = window.setTimeout(() => setAnnounced(normalized), settleMs);
    return () => window.clearTimeout(timer);
  }, [normalized, cells.length, speed, motionSafe]);

  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={cn(
        "text-foreground relative inline-flex font-mono font-medium tabular-nums",
        className,
      )}
      {...props}
    >
      {motionSafe ? (
        <div aria-hidden className="flex gap-0.5">
          {cells.map((char, index) => (
            <FlapCell
              key={index}
              target={char}
              chars={chars}
              flipSpeed={speed}
              delay={index * COLUMN_STAGGER_MS}
              className={sizeClass}
            />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={normalized}
            aria-hidden
            className="flex gap-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
          >
            {cells.map((char, index) => (
              <span
                key={index}
                className={cn(
                  "border-border bg-muted relative flex items-center justify-center overflow-hidden rounded-1 border",
                  sizeClass,
                )}
              >
                {char}
                <span className="border-border absolute inset-x-0 top-1/2 border-t" />
              </span>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
      <span className="sr-only">{normalized.trim()}</span>
      <span role="status" className="sr-only">
        {announced.trim()}
      </span>
    </div>
  );
}
