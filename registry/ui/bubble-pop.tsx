"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Raised bubbles sit at 1; popped cells rest flat at this scale. */
const FLAT_SCALE = 0.9;

/** The beat between the last pop and the refill. */
const REFILL_PAUSE_MS = 700;

/** How long after the last cascade delay the recoil needs to settle. */
const RECOIL_SETTLE_MS = 900;

/**
 * Fixed puff vectors — five flecks, biased upward, one per index.
 * Angles and reaches are hand-set so every pop throws the same puff:
 * no randomness anywhere in the sheet.
 */
const PUFF = [
  { angle: -124, dist: 22, size: 5 },
  { angle: -78, dist: 27, size: 4 },
  { angle: -22, dist: 21, size: 5 },
  { angle: 44, dist: 24, size: 4 },
  { angle: 148, dist: 23, size: 4 },
].map(({ angle, dist, size }) => ({
  dx: Math.cos((angle * Math.PI) / 180) * dist,
  dy: Math.sin((angle * Math.PI) / 180) * dist,
  size,
}));

type BubbleProps = {
  index: number;
  popped: boolean;
  refilling: boolean;
  motionSafe: boolean;
  /** Per-index cascade delay interval, in seconds. */
  stagger: number;
  onPop: (index: number) => void;
};

/**
 * One cell. The face is declarative: popping retargets scale to a
 * two-keyframe `flick` squash (the jump to the first keyframe is the snap),
 * refilling retargets it to a two-keyframe `recoil` inflate behind a
 * cascade delay. The puff mounts once per pop and plays itself out.
 */
function Bubble({
  index,
  popped,
  refilling,
  motionSafe,
  stagger,
  onPop,
}: BubbleProps): React.JSX.Element {
  const face = popped
    ? { scale: motionSafe ? [0.72, FLAT_SCALE] : FLAT_SCALE }
    : { scale: motionSafe && refilling ? [0.55, 1] : 1 };
  const faceTransition = !motionSafe
    ? { duration: 0 }
    : popped
      ? springs.flick
      : refilling
        ? { ...springs.recoil, delay: index * stagger }
        : springs.snap;
  const sheenDelay = motionSafe && refilling && !popped ? index * stagger : 0;

  return (
    <button
      type="button"
      aria-label={`Pop bubble ${index + 1}`}
      aria-pressed={popped}
      onPointerDown={(event) => {
        if (event.button === 0) onPop(index);
      }}
      onClick={() => onPop(index)}
      className={cn(
        "relative size-9 touch-manipulation rounded-full outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-ring/60",
        popped ? "cursor-default" : "cursor-pointer",
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={face}
        transition={faceTransition}
        whileHover={
          motionSafe && !popped && !refilling
            ? { scale: 1.06, transition: springs.snap }
            : undefined
        }
        className={cn(
          "absolute inset-0 block rounded-full border",
          popped
            ? "border-hairline bg-surface-1 shadow-[inset_0_1px_3px_var(--hairline-strong)]"
            : "border-hairline-strong bg-surface-2 shadow-raised",
        )}
      >
        {/* Translucent tint + specular spot — the inflated look, faded flat on pop. */}
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            motionSafe && "transition-opacity duration-150 ease-out",
          )}
          style={{
            background: "var(--primary)",
            opacity: popped ? 0 : 0.14,
            transitionDelay: `${sheenDelay}s`,
          }}
        />
        <span
          className={cn(
            "absolute inset-0 rounded-full",
            motionSafe && "transition-opacity duration-150 ease-out",
          )}
          style={{
            background:
              "radial-gradient(circle at 32% 28%, var(--primary-foreground) 0%, transparent 46%)",
            opacity: popped ? 0 : 0.55,
            transitionDelay: `${sheenDelay}s`,
          }}
        />
      </motion.span>

      {/* Fires once on mount (per pop) and ends invisible; unmounts on refill. */}
      {motionSafe && popped && (
        <span aria-hidden className="pointer-events-none absolute inset-0 z-10">
          {PUFF.map((fleck, i) => (
            <motion.span
              key={i}
              className="absolute top-1/2 left-1/2 rounded-full"
              style={{
                width: fleck.size,
                height: fleck.size,
                marginLeft: -fleck.size / 2,
                marginTop: -fleck.size / 2,
                background: "var(--primary)",
              }}
              initial={{ x: 0, y: 0, scale: 0.5, opacity: 0.9 }}
              animate={{ x: fleck.dx, y: fleck.dy, scale: 1, opacity: 0 }}
              transition={{
                x: springs.snap,
                y: springs.snap,
                scale: springs.snap,
                opacity: { duration: durations.base, ease: easings.exit },
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

export type BubblePopProps = {
  /** Bubbles per row. @default 6 */
  columns?: number;
  /** Rows in the sheet. @default 4 */
  rows?: number;
  /** Fires the moment the last bubble pops, before the refill. */
  onAllPopped?: () => void;
  className?: string;
};

/**
 * A sheet of bubble wrap you actually get to pop. Every cell is a real
 * button: pressing one squashes it flat on `flick`, throws a fixed
 * five-fleck puff, and leaves it matte — popped cells keep focus but ignore
 * further presses, exactly like the real thing. A mono counter tracks the
 * damage, and once the sheet is spent it pauses a beat and re-inflates in a
 * `cascade` stagger with a `recoil` bounce per bubble, so the toy never
 * runs out. The whole device is deterministic — hand-set puff angles, no
 * randomness — so the same press always pops the same way. Reduced motion:
 * pops and refills swap instantly — no squash, no puff, no cascade.
 */
export function BubblePop({
  columns = 6,
  rows = 4,
  onAllPopped,
  className,
}: BubblePopProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const cols = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.floor(rows));
  const count = cols * rowCount;
  const stagger = cascade(count);

  const [popped, setPopped] = React.useState<boolean[]>([]);
  const [refilling, setRefilling] = React.useState(false);
  const refillTimer = React.useRef<number | null>(null);
  const settleTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (refillTimer.current !== null)
        window.clearTimeout(refillTimer.current);
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
    };
  }, []);

  // A columns/rows change resets the sheet by derivation, not by effect.
  const cells =
    popped.length === count
      ? popped
      : Array.from({ length: count }, () => false);
  const popCount = cells.reduce((total, cell) => (cell ? total + 1 : total), 0);

  const handlePop = (index: number) => {
    if (cells[index]) return;
    const next = cells.slice();
    next[index] = true;
    setPopped(next);
    if (!next.every(Boolean)) return;

    onAllPopped?.();
    if (refillTimer.current !== null) window.clearTimeout(refillTimer.current);
    refillTimer.current = window.setTimeout(() => {
      setPopped(Array.from({ length: count }, () => false));
      if (!motionSafe) return;
      setRefilling(true);
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(
        () => setRefilling(false),
        (count - 1) * stagger * 1000 + RECOIL_SETTLE_MS,
      );
    }, REFILL_PAUSE_MS);
  };

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div
        role="group"
        aria-label="Bubble wrap"
        className="grid gap-1.5 rounded-3 border border-hairline bg-surface-1 p-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cells.map((cell, i) => (
          <Bubble
            key={i}
            index={i}
            popped={cell}
            refilling={refilling}
            motionSafe={motionSafe}
            stagger={stagger}
            onPop={handlePop}
          />
        ))}
      </div>
      <p
        aria-live="polite"
        className="font-mono text-xs text-ink-3 tabular-nums"
      >
        {popCount} of {count} popped
      </p>
    </div>
  );
}
