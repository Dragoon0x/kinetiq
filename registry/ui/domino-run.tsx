"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Tile footprint. Thin and tall, so a topple reads as a fall, not a tip. */
const TILE_W = 9;
const TILE_H = 36;
/** Pitch between tiles — tight enough that a fallen tile visibly leans into its neighbor. */
const TILE_GAP = 8;

/** How far a tile rotates once knocked, degrees around its bottom edge. */
const FALL_DEG = 74;

/** Flag pole footprint, matched roughly to a tile's height. */
const POLE_W = 3;
const POLE_H = 34;

/** Flag rotation states, degrees around the pole's bottom edge. 0 is upright. */
const FLAG_DOWN_DEG = -90;
/** Overshoot peak the flag is set to before `springs.recoil` pulls it to rest. */
const FLAG_PEAK_DEG = 14;
const FLAG_UP_DEG = 0;

/**
 * Rough settle time for `springs.glide`, used only to time the flag's cue —
 * the tiles themselves ride real spring physics, not this estimate.
 */
const FALL_SETTLE_MS = 450;
/** How long the finished row holds before it resets. */
const BEAT_MS = 1600;

const CAPTIONS = {
  idle: "knock it over",
  running: "…",
  done: "every one.",
} as const;

type Phase = keyof typeof CAPTIONS;

export type DominoRunProps = {
  /** Number of dominoes in the row, clamped 5–14. @default 9 */
  tiles?: number;
  /** Fires once the last tile has landed and the flag is raised. */
  onFinish?: () => void;
  className?: string;
};

/**
 * A row of dominoes standing on a baseline, a lowered flag waiting at the
 * end. Knocking the first tile — click, Enter, or Space on the real button
 * this component is — starts a fall that propagates down the row: each tile
 * rotates on `springs.glide` after its own index times `cascade(count)`
 * delay, leaning into its neighbor with a fading dust puff at its base. The
 * last tile hits the flag, which is set to an overshoot peak and recoils to
 * standing on `springs.recoil`; after a beat the row stands back up in
 * reverse order on `springs.snap` and the flag lowers, ready for the next
 * knock. A mono caption tracks the phase — "knock it over", "…", "every
 * one." — and clicks mid-run are ignored.
 * Reduced motion: the fall and the reset are both instant swaps with no
 * stagger — every tile flips to fallen at once, the flag jumps straight up,
 * and after the same beat everything swaps back — while the caption still
 * cycles through all three phases.
 */
export function DominoRun({
  tiles = 9,
  onFinish,
  className,
}: DominoRunProps): React.JSX.Element {
  const count = Math.min(14, Math.max(5, Math.round(tiles)));
  // Keyed on count: a tile-count change should redraw the row at rest rather
  // than leave a stale run mid-flight against a layout that no longer
  // matches it, and a fresh mount is simpler than an effect reaching back
  // into React state to force that.
  return (
    <DominoRunInner
      key={count}
      count={count}
      onFinish={onFinish}
      className={className}
    />
  );
}

type DominoRunInnerProps = {
  count: number;
  onFinish?: () => void;
  className?: string;
};

function DominoRunInner({
  count,
  onFinish,
  className,
}: DominoRunInnerProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const step = cascade(count);

  const [phase, setPhase] = React.useState<Phase>("idle");

  const flagRotation = useMotionValue(FLAG_DOWN_DEG);
  const flagAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const doneTimer = React.useRef<number | null>(null);
  const resetTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      flagAnim.current?.stop();
    };
  }, []);

  const raiseFlag = () => {
    flagAnim.current?.stop();
    if (motionSafe) {
      flagRotation.set(FLAG_PEAK_DEG);
      flagAnim.current = animate(flagRotation, FLAG_UP_DEG, springs.recoil);
    } else {
      flagRotation.set(FLAG_UP_DEG);
    }
  };

  const resetRun = () => {
    setPhase("idle");
    flagAnim.current?.stop();
    if (motionSafe) {
      flagAnim.current = animate(flagRotation, FLAG_DOWN_DEG, springs.snap);
    } else {
      flagRotation.set(FLAG_DOWN_DEG);
    }
  };

  const finishRun = () => {
    raiseFlag();
    setPhase("done");
    onFinish?.();
    resetTimer.current = window.setTimeout(resetRun, BEAT_MS);
  };

  const handleClick = () => {
    if (phase !== "idle") return;
    setPhase("running");
    // Reduced motion still yields a beat so the "…" caption paints before
    // "every one." replaces it — only the tiles' own stagger is skipped.
    const totalMs = motionSafe ? (count - 1) * step * 1000 + FALL_SETTLE_MS : 0;
    doneTimer.current = window.setTimeout(finishRun, totalMs);
  };

  return (
    <>
      <button
        type="button"
        aria-label="Topple the dominoes"
        onClick={handleClick}
        className={cn(
          "inline-flex cursor-pointer flex-col items-center gap-3 rounded-3 p-3 select-none",
          "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          className,
        )}
      >
        <span className="relative flex items-end" style={{ gap: TILE_GAP }}>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-hairline"
          />
          {Array.from({ length: count }, (_, i) => (
            <Tile
              key={i}
              index={i}
              count={count}
              phase={phase}
              step={step}
              motionSafe={motionSafe}
            />
          ))}
          <span className="ml-1" aria-hidden>
            <Flag rotation={flagRotation} />
          </span>
        </span>

        <span
          aria-hidden
          className="h-4 text-label font-mono leading-none text-ink-3"
        >
          {CAPTIONS[phase]}
        </span>
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {phase === "done" ? "every one." : ""}
      </span>
    </>
  );
}

type TileProps = {
  index: number;
  count: number;
  phase: Phase;
  step: number;
  motionSafe: boolean;
};

/**
 * One domino. Its rotation and dust-puff opacity are both driven from
 * `phase`: a transition into "running" falls forward on `springs.glide`
 * after `index * step`; a transition from "done" back to "idle" stands the
 * tile back up on `springs.snap` after `(count - 1 - index) * step`, so the
 * row rises tail first. `phase === "done"` itself is a no-op — the tile is
 * already fallen from the run that led there.
 */
function Tile({ index, count, phase, step, motionSafe }: TileProps) {
  const rotate = useMotionValue(0);
  const dust = useMotionValue(0);
  const rotateAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const dustAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevPhase = React.useRef<Phase>("idle");

  React.useEffect(() => {
    const from = prevPhase.current;
    prevPhase.current = phase;
    if (from === phase) return;

    rotateAnim.current?.stop();

    if (phase === "running") {
      const delay = index * step;
      if (motionSafe) {
        rotateAnim.current = animate(rotate, FALL_DEG, {
          ...springs.glide,
          delay,
        });
        dustAnim.current?.stop();
        dust.set(0);
        dustAnim.current = animate(dust, [1, 0], {
          duration: durations.fast,
          ease: easings.exit,
          delay,
        });
      } else {
        rotate.set(FALL_DEG);
      }
    } else if (phase === "idle" && from === "done") {
      const delay = (count - 1 - index) * step;
      if (motionSafe) {
        rotateAnim.current = animate(rotate, 0, { ...springs.snap, delay });
      } else {
        rotate.set(0);
      }
      dustAnim.current?.stop();
      dust.set(0);
    } else if (phase === "idle") {
      rotate.set(0);
      dust.set(0);
    }
  }, [phase, index, count, step, motionSafe, rotate, dust]);

  React.useEffect(
    () => () => {
      rotateAnim.current?.stop();
      dustAnim.current?.stop();
    },
    [],
  );

  return (
    <span
      className="relative block shrink-0"
      style={{ width: TILE_W, height: TILE_H }}
    >
      {/* Contact shadow — fixed to the ground, never rotates with the tile. */}
      <span
        aria-hidden
        className="absolute -bottom-0.5 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-ink-3/50 blur-[1.5px]"
      />
      {/* Dust puff — flashes on at the fall delay, then tweens out. */}
      <motion.span
        aria-hidden
        className="absolute -bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full bg-ink-3"
        style={{ opacity: dust }}
      />
      <motion.span
        aria-hidden
        className="absolute bottom-0 left-0 origin-bottom rounded-1 border border-hairline bg-surface-2"
        style={{ width: TILE_W, height: TILE_H, rotate }}
      >
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-hairline-strong" />
        <span className="absolute top-1/4 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3" />
        <span className="absolute top-3/4 left-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3" />
      </motion.span>
    </span>
  );
}

/**
 * The flag on its pole, pivoting as one rigid piece around the pole's base.
 * Lowered lies the pennant back toward the row; a knock sets it straight to
 * its overshoot peak and lets `springs.recoil` settle it upright.
 */
function Flag({ rotation }: { rotation: MotionValue<number> }) {
  return (
    <motion.span
      className="relative block origin-bottom rounded-full bg-ink-3"
      style={{ width: POLE_W, height: POLE_H, rotate: rotation }}
    >
      <span className="absolute top-0.5 left-full h-2 w-3 rounded-r-1 bg-primary" />
    </motion.span>
  );
}
