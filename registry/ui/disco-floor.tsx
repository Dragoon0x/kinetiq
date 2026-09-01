"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type DiscoFloorProps = {
  /** Fires on every beat drop — a click or a keyboard Enter/Space. */
  onBeat?: () => void;
  className?: string;
};

const GRID_COLS = 6;
const GRID_ROWS = 4;
const TILE_COUNT = GRID_COLS * GRID_ROWS;

/** How long the pointer must be away before the floor starts dancing. */
const IDLE_DELAY_MS = 1600;
/** Idle frame advance rate. */
const IDLE_FRAME_MS = 420;
/** The flash's own tween, and how long it holds at full brightness before falling. */
const FLASH_TWEEN_S = durations.blink;
const FLASH_HOLD_MS = 90;
/** How long the caption reads "boom." (and, under reduced motion, how long the floor stays lit). */
const BOOM_MS = 520;

/**
 * A fixed authored cycle — never random. Six frames sweep the columns left
 * to right, the seventh flashes a checkerboard, the eighth pulses the four
 * center tiles, then it loops.
 */
const DANCE_FRAMES: number[][] = [
  [0, 6, 12, 18],
  [1, 7, 13, 19],
  [2, 8, 14, 20],
  [3, 9, 15, 21],
  [4, 10, 16, 22],
  [5, 11, 17, 23],
  [0, 2, 4, 7, 9, 11, 12, 14, 16, 19, 21, 23],
  [8, 9, 14, 15],
];

/** Tile color cycles this 4-token palette by column. */
const PALETTE = [
  "var(--primary)",
  "var(--success, #047857)",
  "var(--warning, #b45309)",
  "var(--ink-2)",
] as const;

type LitLevel = 0 | 1 | 2;
type BeatPhase = "none" | "flash" | "fall";

const columnOf = (index: number): number => index % GRID_COLS;
const rowOf = (index: number): number => Math.floor(index / GRID_COLS);

/** True for the up-to-eight tiles surrounding `center` (Chebyshev distance 1). */
function isNeighbor(index: number, center: number): boolean {
  const dr = Math.abs(rowOf(index) - rowOf(center));
  const dc = Math.abs(columnOf(index) - columnOf(center));
  return dr <= 1 && dc <= 1 && (dr !== 0 || dc !== 0);
}

/** The tile's resting light level — before any beat-drop override. */
function restLevel(
  index: number,
  hoverIndex: number | null,
  dancing: boolean,
  frame: number,
): LitLevel {
  if (hoverIndex !== null) {
    if (index === hoverIndex) return 2;
    return isNeighbor(index, hoverIndex) ? 1 : 0;
  }
  if (dancing) {
    const tiles = DANCE_FRAMES[frame % DANCE_FRAMES.length] ?? [];
    return tiles.includes(index) ? 2 : 0;
  }
  return 0;
}

/** Pointer position, in client coords, to a tile index inside `rect`. */
function tileIndexFromPoint(
  rect: DOMRect,
  clientX: number,
  clientY: number,
): number {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const col = Math.min(
    GRID_COLS - 1,
    Math.max(0, Math.floor((x / rect.width) * GRID_COLS)),
  );
  const row = Math.min(
    GRID_ROWS - 1,
    Math.max(0, Math.floor((y / rect.height) * GRID_ROWS)),
  );
  return row * GRID_COLS + col;
}

/**
 * A little 6×4 dance floor. Pointer moves compute the hovered tile from
 * `getBoundingClientRect` and light it bright with its up-to-eight neighbours
 * dimmer, state gated so it changes only when the tile index changes, never
 * per pixel. Left alone for ~1.6s, the floor free-dances through a fixed
 * eight-frame table — a column sweep, a checker flash, a center pulse —
 * advancing on a plain interval and looping; the pointer returning
 * interrupts it on its next move. The grid is a real button, so a click or
 * Enter/Space is a beat drop: every tile flashes bright at once, falls back
 * on a `cascade(24)` stagger, the idle pattern restarts from frame 0, and the
 * mono caption flips to "boom." for a beat. Tile color cycles a 4-token
 * palette by column so the floor reads as color, not grayscale.
 *
 * Reduced motion: no idle pattern (the floor stays unlit until hovered),
 * tile lighting swaps instantly with no tween, and the beat drop lights
 * every tile at once with no flash and no cascade.
 */
export function DiscoFloor({
  onBeat,
  className,
}: DiscoFloorProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const [idleActive, setIdleActive] = React.useState(false);
  const [frame, setFrame] = React.useState(0);
  const [beatPhase, setBeatPhase] = React.useState<BeatPhase>("none");
  const [booming, setBooming] = React.useState(false);

  const awayTimerRef = React.useRef<number | null>(null);
  const beatTimerRef = React.useRef<number | null>(null);
  const boomTimerRef = React.useRef<number | null>(null);

  const dancing = motionSafe && idleActive;

  // Starts (or restarts) the away-countdown: dancing begins once the pointer
  // has been gone for IDLE_DELAY_MS. Never scheduled under reduced motion.
  const startAwayCountdown = React.useCallback(() => {
    if (awayTimerRef.current !== null)
      window.clearTimeout(awayTimerRef.current);
    if (!motionSafe) return;
    awayTimerRef.current = window.setTimeout(() => {
      awayTimerRef.current = null;
      setIdleActive(true);
    }, IDLE_DELAY_MS);
  }, [motionSafe]);

  // The floor is "away" from mount until the first hover, so the countdown
  // also starts here; it restarts whenever motionSafe flips.
  React.useEffect(() => {
    startAwayCountdown();
    return () => {
      if (awayTimerRef.current !== null)
        window.clearTimeout(awayTimerRef.current);
    };
  }, [startAwayCountdown]);

  // Idle frame advance — only while dancing. Stopping (pointer back, or
  // reduced motion turning on) tears the interval down via cleanup.
  React.useEffect(() => {
    if (!dancing) return;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % DANCE_FRAMES.length);
    }, IDLE_FRAME_MS);
    return () => window.clearInterval(id);
  }, [dancing]);

  // Timers not already covered by an effect above: clear on unmount only.
  React.useEffect(() => {
    return () => {
      if (beatTimerRef.current !== null)
        window.clearTimeout(beatTimerRef.current);
      if (boomTimerRef.current !== null)
        window.clearTimeout(boomTimerRef.current);
    };
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = tileIndexFromPoint(rect, event.clientX, event.clientY);
    setHoverIndex((current) => (current === index ? current : index));
    if (idleActive) setIdleActive(false);
    if (awayTimerRef.current !== null)
      window.clearTimeout(awayTimerRef.current);
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
    startAwayCountdown();
  };

  const handleBeat = () => {
    onBeat?.();
    setFrame(0);

    if (boomTimerRef.current !== null)
      window.clearTimeout(boomTimerRef.current);
    setBooming(true);
    boomTimerRef.current = window.setTimeout(() => {
      boomTimerRef.current = null;
      setBooming(false);
    }, BOOM_MS);

    if (beatTimerRef.current !== null)
      window.clearTimeout(beatTimerRef.current);

    if (!motionSafe) {
      setBeatPhase("flash");
      beatTimerRef.current = window.setTimeout(() => {
        beatTimerRef.current = null;
        setBeatPhase("none");
      }, BOOM_MS);
      return;
    }

    setBeatPhase("flash");
    beatTimerRef.current = window.setTimeout(() => {
      setBeatPhase("fall");
      const fallSeconds =
        (TILE_COUNT - 1) * cascade(TILE_COUNT) + durations.fast;
      beatTimerRef.current = window.setTimeout(() => {
        beatTimerRef.current = null;
        setBeatPhase("none");
      }, fallSeconds * 1000);
    }, FLASH_HOLD_MS);
  };

  const cascadeStep = cascade(TILE_COUNT);
  const caption = booming ? "boom." : "move over it";

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Light the dance floor"
        onClick={handleBeat}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "grid grid-cols-6 gap-1.5 rounded-3 border border-hairline bg-surface-1 p-2.5 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        )}
      >
        {Array.from({ length: TILE_COUNT }, (_, index) => {
          const level =
            beatPhase === "flash"
              ? 2
              : restLevel(index, hoverIndex, dancing, frame);
          const opacity = level === 2 ? 1 : level === 1 ? 0.4 : 0;
          const color = PALETTE[columnOf(index) % PALETTE.length] ?? PALETTE[0];

          const transition = !motionSafe
            ? { duration: 0 }
            : beatPhase === "flash"
              ? { duration: FLASH_TWEEN_S, ease: easings.enter }
              : beatPhase === "fall"
                ? {
                    duration: durations.fast,
                    delay: index * cascadeStep,
                    ease: easings.exit,
                  }
                : { duration: durations.fast, ease: easings.enter };

          return (
            <span
              key={index}
              aria-hidden
              className="relative size-8 overflow-hidden rounded-1 bg-surface-2"
            >
              <motion.span
                className="absolute inset-0"
                style={{ backgroundColor: color }}
                initial={false}
                animate={{ opacity }}
                transition={transition}
              />
            </span>
          );
        })}
      </button>

      <motion.span
        key={caption}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3"
        initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        {caption}
      </motion.span>
    </div>
  );
}
