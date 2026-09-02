"use client";

import * as React from "react";

import { MousePointer2 } from "lucide-react";
import { motion } from "motion/react";
import type { Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type VignetteBlankBoardProps = {
  label?: string;
  className?: string;
};

// ---- Stage geometry (fixed, ~260×170) ----------------------------------

const STAGE_W = 260;
const STAGE_H = 170;

const COLUMN_W = 75;
const COLUMN_GAP = 6;
const COLUMN_TOP = 8;
const COLUMN_H = STAGE_H - COLUMN_TOP * 2;

const COLUMNS = [
  { key: "todo", title: "todo", x: 12 },
  { key: "doing", title: "doing", x: 12 + COLUMN_W + COLUMN_GAP },
  { key: "done", title: "done", x: 12 + (COLUMN_W + COLUMN_GAP) * 2 },
] as const;

const CARD_W = 63;
const CARD_H = 44;
const SLOT_GAP = 6;
const SLOT_1_Y = COLUMN_TOP + 26;
const SLOT_2_Y = SLOT_1_Y + CARD_H + SLOT_GAP;

const CARD_HOME_X = COLUMNS[0].x + 6;
const CARD_MID_X = COLUMNS[1].x + 6;
const CARD_DONE_X = COLUMNS[2].x + 6;
const CARD_REST_Y = SLOT_1_Y;
const CARD_LIFT_Y = SLOT_1_Y - 4;

/** The cursor rides the card's top-right corner while they travel together. */
const CURSOR_OFFSET_X = 44;
const CURSOR_OFFSET_Y = -10;

// The dashed slots that never animate — every slot except the last column's
// first, which is the one the loop fills.
const STATIC_SLOTS: { id: string; x: number; y: number }[] = COLUMNS.flatMap(
  (column) =>
    column.key === "done"
      ? [{ id: `${column.key}-2`, x: column.x + 6, y: SLOT_2_Y }]
      : [
          { id: `${column.key}-1`, x: column.x + 6, y: SLOT_1_Y },
          { id: `${column.key}-2`, x: column.x + 6, y: SLOT_2_Y },
        ],
);

// ---- The shared clock ----------------------------------------------------
// One loop: idle → the cursor arrives and grips the card → the card lifts →
// they carry it to column two, pause, then column three → it drops and
// settles into the first dashed slot, which fills → the cursor drifts off →
// a hold → the board resets. Every array below is a keyframe list against
// the same BOARD_TIMES stops, so nothing can fall out of step with anything
// else on the clock.

/** Seconds for one full pickup-carry-drop loop. */
const LOOP_SECONDS = 9;

const DROP_T = 0.76;
// The settle bounce borrows its cadence from the calibration set: a blink to
// overshoot, a fast beat to rest.
const OVERSHOOT_T = DROP_T + durations.blink / LOOP_SECONDS;
const SETTLED_T = OVERSHOOT_T + durations.fast / LOOP_SECONDS;

const BOARD_TIMES = [
  0,
  0.08,
  0.14,
  0.2,
  0.4,
  0.5,
  0.7,
  DROP_T,
  OVERSHOOT_T,
  SETTLED_T,
  0.9,
  1,
] as const;

const RUN_TRANSITION: Transition = {
  duration: LOOP_SECONDS,
  repeat: Infinity,
  ease: easings.move,
  times: [...BOARD_TIMES],
  type: "tween",
};

const CARD_X = [
  CARD_HOME_X,
  CARD_HOME_X,
  CARD_HOME_X,
  CARD_HOME_X,
  CARD_MID_X,
  CARD_MID_X,
  CARD_DONE_X,
  CARD_DONE_X,
  CARD_DONE_X,
  CARD_DONE_X,
  CARD_DONE_X,
  CARD_DONE_X,
] as const;

const CARD_Y = [
  CARD_REST_Y,
  CARD_REST_Y,
  CARD_REST_Y,
  CARD_LIFT_Y,
  CARD_LIFT_Y,
  CARD_LIFT_Y,
  CARD_LIFT_Y,
  CARD_REST_Y,
  CARD_REST_Y,
  CARD_REST_Y,
  CARD_REST_Y,
  CARD_REST_Y,
] as const;

// Lift at the pickup, a slight undershoot on the drop, one small overshoot
// on the settle, then rest — all tween keyframes, never a spring.
const CARD_SCALE = [
  1, 1, 1, 1.04, 1.04, 1.04, 1.04, 0.98, 1.01, 1, 1, 1,
] as const;

// Stays visible the whole loop; the single dip to 0 lands exactly on the
// last stop so the jump back to the start position never shows.
const CARD_OPACITY = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0] as const;

// The lift shadow: an overlay's opacity only, never an animated box-shadow.
const SHADOW_OPACITY = [0, 0, 0, 1, 1, 1, 1, 0.4, 0.1, 0, 0, 0] as const;

const CURSOR_X = [
  -10,
  40,
  CARD_HOME_X + CURSOR_OFFSET_X,
  CARD_HOME_X + CURSOR_OFFSET_X,
  CARD_MID_X + CURSOR_OFFSET_X,
  CARD_MID_X + CURSOR_OFFSET_X,
  CARD_DONE_X + CURSOR_OFFSET_X,
  CARD_DONE_X + CURSOR_OFFSET_X,
  CARD_DONE_X + CURSOR_OFFSET_X,
  CARD_DONE_X + CURSOR_OFFSET_X,
  STAGE_W,
  STAGE_W + 10,
] as const;

const CURSOR_Y = [
  -10,
  6,
  CARD_REST_Y + CURSOR_OFFSET_Y,
  CARD_LIFT_Y + CURSOR_OFFSET_Y,
  CARD_LIFT_Y + CURSOR_OFFSET_Y,
  CARD_LIFT_Y + CURSOR_OFFSET_Y,
  CARD_LIFT_Y + CURSOR_OFFSET_Y,
  CARD_REST_Y + CURSOR_OFFSET_Y,
  CARD_REST_Y + CURSOR_OFFSET_Y,
  CARD_REST_Y + CURSOR_OFFSET_Y,
  60,
  70,
] as const;

// 0 at both ends of the wrap, so looping the cursor back to its entrance is
// invisible — unlike the card, it needs no snap-at-the-seam trick.
const CURSOR_OPACITY = [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0] as const;

// The first slot in "done": dashed and faint until the card lands, then it
// fades — the fill is the moment the loop is building toward.
const SLOT_FILL_OPACITY = [
  0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.35, 0.1, 0, 0, 0,
] as const;

const cursorTag = (
  <span className="flex items-start text-primary">
    <MousePointer2 className="size-3.5" fill="currentColor" />
    <span className="mt-2.5 -ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground">
      You
    </span>
  </span>
);

/**
 * A first-run board: three empty columns, one dashed starter card, and a
 * cursor that carries it from todo to done. The cursor and the card share
 * one clock — the same times array drives both, offset by a fixed hand
 * position, so they can never drift apart or arrive out of step. It lifts
 * with a scale nudge and a shadow overlay's opacity (never an animated
 * box-shadow), rides the columns, and settles with a small bounce; the drop
 * filling the last dashed outline is the moment the whole loop builds
 * toward. Presentational, marked as one image to assistive tech.
 *
 * Reduced motion: renders the final frame — the card seated in "done", the
 * cursor off-stage — nothing moves.
 */
export function VignetteBlankBoard({
  label = "A starter card carried from todo to done",
  className,
}: VignetteBlankBoardProps) {
  const motionSafe = useMotionSafe();
  const [running, setRunning] = React.useState(true);
  const stageRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!motionSafe) return;
    const node = stageRef.current;
    if (!node) return;

    let inView = true;
    const sync = () => setRunning(inView && !document.hidden);

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) inView = entry.isIntersecting;
      sync();
    });
    observer.observe(node);
    document.addEventListener("visibilitychange", sync);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [motionSafe]);

  const active = motionSafe && running;

  return (
    <div
      role="img"
      aria-label={label}
      className={cn("w-full max-w-sm", className)}
    >
      <div
        ref={stageRef}
        aria-hidden
        className="relative mx-auto overflow-hidden rounded-4 border border-hairline bg-surface-0"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {COLUMNS.map((column) => (
          <div
            key={column.key}
            className="absolute rounded-2 border border-hairline bg-surface-1"
            style={{
              left: column.x,
              top: COLUMN_TOP,
              width: COLUMN_W,
              height: COLUMN_H,
            }}
          >
            <span className="block px-2 pt-1.5 text-label text-ink-3">
              {column.title}
            </span>
          </div>
        ))}

        {STATIC_SLOTS.map((slot) => (
          <span
            key={slot.id}
            className="absolute rounded-2 border border-dashed border-hairline-strong opacity-50"
            style={{ left: slot.x, top: slot.y, width: CARD_W, height: CARD_H }}
          />
        ))}

        {/* The one slot the loop fills: dashed, then fades as the card lands. */}
        <motion.span
          className="absolute rounded-2 border border-dashed border-hairline-strong"
          style={{
            left: COLUMNS[2].x + 6,
            top: SLOT_1_Y,
            width: CARD_W,
            height: CARD_H,
            opacity: motionSafe ? undefined : 0,
          }}
          animate={active ? { opacity: [...SLOT_FILL_OPACITY] } : undefined}
          transition={active ? RUN_TRANSITION : undefined}
        />

        {/* The lift shadow: a second element, opacity only. */}
        <motion.div
          className="absolute top-0 left-0 rounded-2 bg-surface-2 shadow-raised"
          style={{
            width: CARD_W,
            height: CARD_H,
            x: motionSafe ? undefined : CARD_DONE_X,
            y: motionSafe ? undefined : CARD_REST_Y,
            opacity: motionSafe ? undefined : 0,
          }}
          animate={
            active
              ? { x: [...CARD_X], y: [...CARD_Y], opacity: [...SHADOW_OPACITY] }
              : undefined
          }
          transition={active ? RUN_TRANSITION : undefined}
        />

        {/* The starter card: title bar and two text lines as bars. */}
        <motion.div
          className="absolute top-0 left-0 flex flex-col gap-1.5 rounded-2 border border-hairline-strong bg-surface-0 p-2"
          style={{
            width: CARD_W,
            height: CARD_H,
            x: motionSafe ? undefined : CARD_DONE_X,
            y: motionSafe ? undefined : CARD_REST_Y,
            opacity: motionSafe ? undefined : 1,
          }}
          animate={
            active
              ? {
                  x: [...CARD_X],
                  y: [...CARD_Y],
                  scale: [...CARD_SCALE],
                  opacity: [...CARD_OPACITY],
                }
              : undefined
          }
          transition={active ? RUN_TRANSITION : undefined}
        >
          <span className="h-1.5 w-8 rounded-full bg-ink-2" />
          <span className="h-1 w-full rounded-full bg-ink-3/70" />
          <span className="h-1 w-3/4 rounded-full bg-ink-3/70" />
        </motion.div>

        {/* The cursor: an HTML wrapper carries the position; the SVG never
            animates directly, so it never needs a transformOrigin. */}
        <motion.div
          className="absolute top-0 left-0"
          style={{
            x: motionSafe ? undefined : STAGE_W + 10,
            y: motionSafe ? undefined : 70,
            opacity: motionSafe ? undefined : 0,
          }}
          animate={
            active
              ? {
                  x: [...CURSOR_X],
                  y: [...CURSOR_Y],
                  opacity: [...CURSOR_OPACITY],
                }
              : undefined
          }
          transition={active ? RUN_TRANSITION : undefined}
        >
          {cursorTag}
        </motion.div>
      </div>
    </div>
  );
}
