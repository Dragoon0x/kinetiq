"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Snap grid — both drag-release rounding and each arrow-key step, in px. */
const GRID = 12;
const KEY_STEP = GRID;

/** Magnet stage, in door-local px — the area magnets are free to occupy. */
const STAGE_W = 300;
const STAGE_H = 192;
/** Clamp bounds for a magnet's top-left corner (leaves room for its own footprint). */
const MAGNET_MAX_X = 216;
const MAGNET_MAX_Y = 168;

/** Door panel geometry, in px. */
const DOOR_W = 360;
const DOOR_H = 260;
const STAGE_LEFT = 18;
const STAGE_TOP = 34;
const HANDLE_RIGHT = 16;
const HANDLE_WIDTH = 8;
const HANDLE_INSET_Y = 40;
const SEAM_TOP = 150;
const SEAM_LEFT = 16;
const SEAM_RIGHT = 40;

/** Landing jiggle — a small rotate tween, ~0.25s, back to rest. */
const JIGGLE_ROTATE = [0, -5, 4, -2, 0] as const;
const JIGGLE_TIMES = [0, 0.3, 0.6, 0.85, 1] as const;

const DEFAULT_WORDS: readonly string[] = [
  "the",
  "morning",
  "cuts",
  "itself",
  "before",
  "the",
  "gate",
  "opens",
  "again",
  "quietly",
] as const;

/** Fixed pre-placed layout, one slot per default word — all multiples of GRID. */
const LAYOUT: readonly { x: number; y: number }[] = [
  { x: 0, y: 0 },
  { x: 48, y: 0 },
  { x: 156, y: 12 },
  { x: 204, y: 48 },
  { x: 12, y: 48 },
  { x: 120, y: 48 },
  { x: 24, y: 96 },
  { x: 96, y: 96 },
  { x: 180, y: 108 },
  { x: 36, y: 144 },
] as const;

/** Fixed small jostle applied per magnet on "shake the door" — no collision math. */
const NUDGES: readonly { dx: number; dy: number }[] = [
  { dx: -6, dy: 4 },
  { dx: 8, dy: -6 },
  { dx: -4, dy: -8 },
  { dx: 6, dy: 6 },
  { dx: -8, dy: 2 },
  { dx: 4, dy: -4 },
  { dx: -6, dy: 8 },
  { dx: 8, dy: 4 },
  { dx: -4, dy: -6 },
  { dx: 6, dy: -2 },
] as const;

/** Fixed tint cycle, token palette only. */
const TINTS = [
  "var(--primary)",
  "var(--success, #047857)",
  "var(--warning, #b45309)",
  "var(--ink-2)",
] as const;

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

type MagnetState = {
  x: number;
  y: number;
  /** Monotonic touch counter — the highest value renders on top. */
  lift: number;
  /** Nonce: incrementing replays the landing jiggle. */
  jiggle: number;
  /** Stagger delay applied only by the "shake the door" cascade. */
  jiggleDelay: number;
};

function initialMagnets(count: number): MagnetState[] {
  return Array.from({ length: count }, (_, index) => {
    const slot = LAYOUT[index % LAYOUT.length] ?? { x: 0, y: 0 };
    return { x: slot.x, y: slot.y, lift: 0, jiggle: 0, jiggleDelay: 0 };
  });
}

/** A coarse, three-by-two reading of where a magnet landed. */
function coarseRegion(x: number, y: number): string {
  const col =
    x < MAGNET_MAX_X / 3
      ? "left"
      : x < (MAGNET_MAX_X * 2) / 3
        ? "center"
        : "right";
  const row = y < MAGNET_MAX_Y / 2 ? "top" : "bottom";
  return `${row} ${col}`;
}

export type FridgePoetryProps = {
  /** The magnet set, in reading order. @default the built-in ten. */
  words?: string[];
  /** Fires with the word whenever its magnet is deliberately moved (drag or key). */
  onArrange?: (word: string) => void;
  className?: string;
};

/**
 * Ten word magnets scattered across a cool-tinted fridge door, each a real
 * button you can drag into a sentence or nudge with the arrow keys. Dragging
 * writes straight into a shared pair of motion values so the tile tracks the
 * pointer 1:1, and letting go rounds its position to the nearest 12px cell,
 * springs it there on `springs.snap`, and finishes with a small rotate tween
 * that sells the landing weight. Touching a magnet — by drag or by key —
 * lifts it above its neighbors via a monotonic z-order counter. The "shake
 * the door" button jiggles every magnet at once on a `cascade()` stagger and
 * nudges each one apart by a small fixed offset from a lookup table, not a
 * real collision pass. A polite live region announces every deliberate move
 * with a coarse position.
 * Reduced motion: dragging still tracks the pointer 1:1, but every settle —
 * a drag release, an arrow-key step, or a shake — lands instantly with no
 * spring and no landing jiggle.
 */
export function FridgePoetry({
  words: wordsProp,
  onArrange,
  className,
}: FridgePoetryProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const words: readonly string[] = wordsProp ?? DEFAULT_WORDS;

  const [positions, setPositions] = React.useState<MagnetState[]>(() =>
    initialMagnets(words.length),
  );
  // Rapid input (arrow-key repeat) can fire faster than a render commits —
  // this ref is the synchronous source of truth handlers read from; state
  // exists to drive the render.
  const positionsRef = React.useRef<MagnetState[]>(positions);
  const commitPositions = (next: MagnetState[]) => {
    positionsRef.current = next;
    setPositions(next);
  };

  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [announceNonce, setAnnounceNonce] = React.useState(0);
  const announce = (text: string) => {
    setAnnouncement(text);
    setAnnounceNonce((n) => n + 1);
  };

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const stageRectRef = React.useRef({ left: 0, top: 0 });
  const grabOffsetRef = React.useRef({ dx: 0, dy: 0 });
  const liftCounterRef = React.useRef(0);

  // The one magnet under an active drag is driven through this shared pair —
  // never a motion value per magnet.
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);

  const snapTransition = motionSafe ? springs.snap : { duration: 0 };

  const handlePointerDown = (
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    // A second pointer can't steal the shared dragX/dragY pair while another
    // magnet is still mid-drag (or mid-settle) with them.
    if (draggingIndex !== null && draggingIndex !== index) return;
    const magnet = positionsRef.current[index];
    const rect = stageRef.current?.getBoundingClientRect();
    if (!magnet || !rect) return;
    stageRectRef.current = { left: rect.left, top: rect.top };
    grabOffsetRef.current = {
      dx: event.clientX - rect.left - magnet.x,
      dy: event.clientY - rect.top - magnet.y,
    };
    dragX.set(magnet.x);
    dragY.set(magnet.y);
    event.currentTarget.setPointerCapture(event.pointerId);
    liftCounterRef.current += 1;
    const lift = liftCounterRef.current;
    commitPositions(
      positionsRef.current.map((m, i) => (i === index ? { ...m, lift } : m)),
    );
    setDraggingIndex(index);
  };

  const handlePointerMove = (
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (draggingIndex !== index) return;
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const { left, top } = stageRectRef.current;
    const x = clamp(
      event.clientX - left - grabOffsetRef.current.dx,
      0,
      MAGNET_MAX_X,
    );
    const y = clamp(
      event.clientY - top - grabOffsetRef.current.dy,
      0,
      MAGNET_MAX_Y,
    );
    dragX.set(x);
    dragY.set(y);
  };

  const settleDrag = (
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (draggingIndex !== index) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const snappedX = clamp(
      Math.round(dragX.get() / GRID) * GRID,
      0,
      MAGNET_MAX_X,
    );
    const snappedY = clamp(
      Math.round(dragY.get() / GRID) * GRID,
      0,
      MAGNET_MAX_Y,
    );
    commitPositions(
      positionsRef.current.map((m, i) =>
        i === index
          ? {
              ...m,
              x: snappedX,
              y: snappedY,
              jiggle: motionSafe ? m.jiggle + 1 : m.jiggle,
              jiggleDelay: 0,
            }
          : m,
      ),
    );
    if (motionSafe) {
      animate(dragX, snappedX, {
        ...springs.snap,
        onComplete: () => setDraggingIndex(null),
      });
      animate(dragY, snappedY, springs.snap);
    } else {
      dragX.set(snappedX);
      dragY.set(snappedY);
      setDraggingIndex(null);
    }
    const word = words[index] ?? "word";
    onArrange?.(word);
    announce(`${word} moved to ${coarseRegion(snappedX, snappedY)}.`);
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const { key } = event;
    const dx =
      key === "ArrowLeft" ? -KEY_STEP : key === "ArrowRight" ? KEY_STEP : 0;
    const dy =
      key === "ArrowUp" ? -KEY_STEP : key === "ArrowDown" ? KEY_STEP : 0;
    if (dx === 0 && dy === 0) return;
    event.preventDefault();
    const magnet = positionsRef.current[index];
    if (!magnet) return;
    const nextX = clamp(magnet.x + dx, 0, MAGNET_MAX_X);
    const nextY = clamp(magnet.y + dy, 0, MAGNET_MAX_Y);
    liftCounterRef.current += 1;
    const lift = liftCounterRef.current;
    commitPositions(
      positionsRef.current.map((m, i) =>
        i === index ? { ...m, x: nextX, y: nextY, lift } : m,
      ),
    );
    const word = words[index] ?? "word";
    onArrange?.(word);
    announce(`${word} moved to ${coarseRegion(nextX, nextY)}.`);
  };

  const handleShake = () => {
    const current = positionsRef.current;
    const interval = motionSafe ? cascade(current.length) : 0;
    const next = current.map((m, i) => {
      const nudge = NUDGES[i % NUDGES.length] ?? { dx: 0, dy: 0 };
      return {
        ...m,
        x: clamp(m.x + nudge.dx, 0, MAGNET_MAX_X),
        y: clamp(m.y + nudge.dy, 0, MAGNET_MAX_Y),
        jiggle: motionSafe ? m.jiggle + 1 : m.jiggle,
        jiggleDelay: i * interval,
      };
    });
    commitPositions(next);
    announce("Shook the door; every magnet resettled.");
  };

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 select-none",
        className,
      )}
    >
      <div
        className="relative rounded-4 border border-hairline shadow-raised"
        style={{
          width: DOOR_W,
          height: DOOR_H,
          background: "color-mix(in oklab, var(--primary) 5%, var(--card))",
        }}
      >
        {/* Faint horizontal seam */}
        <span
          aria-hidden
          className="absolute border-t border-hairline"
          style={{ top: SEAM_TOP, left: SEAM_LEFT, right: SEAM_RIGHT }}
        />

        {/* Vertical handle bar */}
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline bg-surface-1 shadow-raised"
          style={{
            right: HANDLE_RIGHT,
            top: HANDLE_INSET_Y,
            bottom: HANDLE_INSET_Y,
            width: HANDLE_WIDTH,
          }}
        />

        {/* The magnet stage */}
        <div
          ref={stageRef}
          className="absolute"
          style={{
            left: STAGE_LEFT,
            top: STAGE_TOP,
            width: STAGE_W,
            height: STAGE_H,
          }}
        >
          {positions.map((p, i) => {
            const isDragging = draggingIndex === i;
            const word = words[i] ?? "word";
            const tint = TINTS[i % TINTS.length] ?? "var(--ink-2)";
            const jiggling = motionSafe && p.jiggle > 0;
            return (
              <motion.div
                key={i}
                className="absolute top-0 left-0"
                style={{
                  zIndex: p.lift,
                  ...(isDragging ? { x: dragX, y: dragY } : {}),
                }}
                animate={isDragging ? undefined : { x: p.x, y: p.y }}
                transition={isDragging ? undefined : snapTransition}
              >
                <motion.div
                  key={`jiggle-${p.jiggle}`}
                  initial={jiggling ? { rotate: 0 } : false}
                  animate={
                    jiggling ? { rotate: [...JIGGLE_ROTATE] } : { rotate: 0 }
                  }
                  transition={
                    jiggling
                      ? {
                          duration: durations.base,
                          ease: easings.move,
                          times: [...JIGGLE_TIMES],
                          delay: p.jiggleDelay,
                        }
                      : { duration: 0 }
                  }
                  style={{ transformOrigin: "50% 50%" }}
                >
                  <button
                    type="button"
                    aria-label={`Drag the word ${word}`}
                    onPointerDown={(event) => handlePointerDown(i, event)}
                    onPointerMove={(event) => handlePointerMove(i, event)}
                    onPointerUp={(event) => settleDrag(i, event)}
                    onPointerCancel={(event) => settleDrag(i, event)}
                    onKeyDown={(event) => handleKeyDown(i, event)}
                    className={cn(
                      "touch-none rounded-2 border border-hairline px-2 py-1 font-mono text-xs whitespace-nowrap text-ink shadow-raised outline-none select-none",
                      "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
                      isDragging ? "cursor-grabbing" : "cursor-grab",
                    )}
                    style={{
                      background: `color-mix(in oklab, ${tint} 22%, var(--card))`,
                    }}
                  >
                    {word}
                  </button>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div
        className="flex items-center justify-between"
        style={{ width: DOOR_W }}
      >
        <p aria-hidden className="text-label text-ink-3 normal-case">
          fridge poetry
        </p>
        <button
          type="button"
          onClick={handleShake}
          className="text-label text-ink-3 normal-case outline-none hover:text-ink-2 hover:underline focus-visible:underline"
        >
          shake the door
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        <span key={announceNonce}>{announcement}</span>
      </span>
    </div>
  );
}
