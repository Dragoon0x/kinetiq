"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry (px) — the whole scene lives in this fixed coordinate space. */
const STAGE_W = 180;
const STAGE_H = 208;

/** Ceiling mount. */
const ROD_Y = 6;
const ROD_W = 40;
const ROD_H = 6;

/** Shade cone — a trapezoid via clip-path, narrow throat to a flared skirt. */
const SHADE_TOP = 16;
const SHADE_H = 26;
const SHADE_BOTTOM_W = 56;
const SHADE_CLIP = "polygon(39% 0%, 61% 0%, 100% 100%, 0% 100%)";

/** Bulb, nested in the shade's throat. */
const BULB_CY = SHADE_TOP + SHADE_H + 8;
const BULB_R = 8;

/** Bead diameter — the cord+bead wrapper also carries the swing rotation, so
 * it centers via marginLeft rather than a translate-x class: Motion writes
 * its own inline `transform` for `rotate`, which would clobber a class-based
 * translateX sharing the same property. */
const BEAD = 16;

/** Cord — hangs from just under the bulb. */
const CORD_ANCHOR_Y = BULB_CY + BULB_R + 2;
const REST_CORD = 40;
const MAX_PULL = 54;
/** Drag past this many px beyond rest, then release, and the light toggles. */
const THRESHOLD = 34;

/** Warm pool of light under the shade. */
const POOL_SIZE = 170;
const POOL_TOP = BULB_CY + 34 - POOL_SIZE / 2;

/** A couple of decaying swings on release — a tween, never a spring. */
const SWING_ROTATE = [0, -9, 6, -3, 1, 0] as const;
const SWING_TIMES = [0, 0.18, 0.42, 0.64, 0.85, 1] as const;
const SWING_DURATION = 0.9;

/** How long the caption savors "let there be light" before settling back. */
const CAPTION_HOLD_MS = 1600;

/** Fixed dust-mote positions and phase delays — drifting slowly upward. */
const MOTES = [
  { x: 44, y: 66, delay: 0, duration: 5.4 },
  { x: 120, y: 52, delay: 1.4, duration: 6.2 },
  { x: 68, y: 118, delay: 2.6, duration: 5.8 },
  { x: 108, y: 96, delay: 0.7, duration: 6.6 },
] as const;

const CAPTIONS = {
  pull: "pull",
  lit: "let there be light",
} as const;

type Caption = keyof typeof CAPTIONS;

/** A cool, dark navy the room reads as "lights off" — independent of app theme. */
const NIGHT_FILL = "oklch(0.14 0.03 258 / 0.93)";

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export type PullCordProps = {
  /** Whether the lamp starts switched on. @default false */
  defaultOn?: boolean;
  /** Fires each time the light toggles, with the new state. */
  onToggle?: (on: boolean) => void;
  className?: string;
};

/**
 * A pendant lamp waiting in the dark for a tug on its cord. Drag the bead at
 * the end of the cord downward — pointer, or ArrowDown, Enter, or Space —
 * and the cord stretches with it 1:1, capped at a short max pull. Cross
 * roughly 34px and release, and the light TOGGLES: the cord snaps home on
 * `recoil` and swings a couple of times on a multi-keyframe tween, the dark
 * overlay fades off, a warm pool blooms under the shade, the bulb brightens,
 * and a few dust motes drift slowly upward through the beam. Release short
 * of that threshold and the cord just springs back on `snap` with no toggle
 * — a nice not-quite. A mono caption flashes "let there be light" the moment
 * the lamp comes on, then settles back to "pull".
 * Reduced motion: dragging still tracks the bead 1:1, but the toggle itself
 * is instant — no swing, no fade, the overlay and pool simply swap states —
 * and the dust motes are not rendered at all.
 */
export function PullCord({
  defaultOn = false,
  onToggle,
  className,
}: PullCordProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [on, setOn] = React.useState(defaultOn);
  const [dragging, setDragging] = React.useState(false);
  const [caption, setCaption] = React.useState<Caption>("pull");

  // Additional cord length beyond rest, 0 (at rest) → MAX_PULL (full drag).
  const pull = useMotionValue(0);
  const cordHeight = useTransform(pull, (v) => REST_CORD + v);
  // Swing rotation applied at the shade pivot — untouched while dragging.
  const pivotRotate = useMotionValue(0);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const stageTopRef = React.useRef(0);
  const grabOffsetRef = React.useRef(0);

  const pullAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const swingAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      pullAnim.current?.stop();
      swingAnim.current?.stop();
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
    };
  }, []);

  /** Ends a pull: toggles on a clean threshold pass, always settles the cord. */
  const releaseCord = (passedThreshold: boolean) => {
    if (passedThreshold) {
      const next = !on;
      setOn(next);
      onToggle?.(next);
      if (captionTimer.current !== null) {
        window.clearTimeout(captionTimer.current);
        captionTimer.current = null;
      }
      if (next) {
        setCaption("lit");
        captionTimer.current = window.setTimeout(() => {
          setCaption("pull");
          captionTimer.current = null;
        }, CAPTION_HOLD_MS);
      } else {
        setCaption("pull");
      }
    }

    if (!motionSafe) {
      pull.set(0);
      pivotRotate.set(0);
      return;
    }

    pullAnim.current?.stop();
    pullAnim.current = animate(
      pull,
      0,
      passedThreshold ? springs.recoil : springs.snap,
    );

    if (passedThreshold) {
      swingAnim.current?.stop();
      pivotRotate.set(0);
      swingAnim.current = animate(pivotRotate, [...SWING_ROTATE], {
        duration: SWING_DURATION,
        ease: easings.move,
        times: [...SWING_TIMES],
      });
    }
  };

  /** Keyboard activation: a quick anticipatory tug, then the same release. */
  const completePull = () => {
    if (!motionSafe) {
      releaseCord(true);
      return;
    }
    pullAnim.current?.stop();
    pullAnim.current = animate(pull, THRESHOLD + 8, {
      ...springs.flick,
      onComplete: () => releaseCord(true),
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    pullAnim.current?.stop();
    swingAnim.current?.stop();
    pivotRotate.set(0);
    stageTopRef.current = rect.top;
    grabOffsetRef.current =
      event.clientY - rect.top - CORD_ANCHOR_Y - REST_CORD - pull.get();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const next = clamp(
      event.clientY -
        stageTopRef.current -
        CORD_ANCHOR_Y -
        REST_CORD -
        grabOffsetRef.current,
      0,
      MAX_PULL,
    );
    pull.set(next);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    releaseCord(pull.get() >= THRESHOLD);
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    releaseCord(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowDown") return;
    event.preventDefault();
    if (event.repeat) return;
    completePull();
  };

  // Enter/Space arrive as native clicks with detail 0 — pointer interactions
  // already ran through down/move/up, so real clicks (detail !== 0) pass.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    completePull();
  };

  const fadeTransition = motionSafe
    ? { duration: durations.slow, ease: easings.move }
    : { duration: 0 };

  return (
    <div
      className={cn("inline-flex flex-col items-center select-none", className)}
    >
      <div
        ref={stageRef}
        className="relative rounded-4 border border-hairline bg-surface-1 shadow-raised"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Warm pool of light under the shade */}
        <motion.span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            top: POOL_TOP,
            width: POOL_SIZE,
            height: POOL_SIZE,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--warning, #b45309) 38%, transparent) 0%, transparent 72%)",
          }}
          animate={{ opacity: on ? 1 : 0 }}
          transition={fadeTransition}
        />

        {/* Ceiling mount */}
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-1 border border-hairline bg-surface-2"
          style={{ top: ROD_Y, width: ROD_W, height: ROD_H }}
        />
        {/* Strut from mount to shade */}
        <span
          aria-hidden
          className="absolute left-1/2 w-px -translate-x-1/2 bg-ink-3/50"
          style={{ top: ROD_Y + ROD_H, height: SHADE_TOP - (ROD_Y + ROD_H) }}
        />

        {/* Shade — a cone via clip-path */}
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 border border-hairline bg-surface-2"
          style={{
            top: SHADE_TOP,
            width: SHADE_BOTTOM_W,
            height: SHADE_H,
            clipPath: SHADE_CLIP,
          }}
        />

        {/* Bulb — dim glass base, warm core and halo crossfade in on `on` */}
        <span
          aria-hidden
          className="absolute rounded-full border border-hairline bg-surface-2"
          style={{
            left: STAGE_W / 2 - BULB_R,
            top: BULB_CY - BULB_R,
            width: BULB_R * 2,
            height: BULB_R * 2,
          }}
        />
        <motion.span
          aria-hidden
          className="absolute rounded-full blur-md"
          style={{
            left: STAGE_W / 2 - BULB_R * 2,
            top: BULB_CY - BULB_R * 2,
            width: BULB_R * 4,
            height: BULB_R * 4,
            background:
              "color-mix(in oklab, var(--warning, #b45309) 60%, transparent)",
          }}
          animate={{ opacity: on ? 0.9 : 0 }}
          transition={fadeTransition}
        />
        <motion.span
          aria-hidden
          className="absolute rounded-full"
          style={{
            left: STAGE_W / 2 - BULB_R,
            top: BULB_CY - BULB_R,
            width: BULB_R * 2,
            height: BULB_R * 2,
            background:
              "color-mix(in oklab, var(--warning, #b45309) 88%, var(--card))",
          }}
          animate={{ opacity: on ? 1 : 0 }}
          transition={fadeTransition}
        />

        {/* Dark overlay — the room, lights off */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-4"
          style={{ background: NIGHT_FILL }}
          animate={{ opacity: on ? 0 : 1 }}
          transition={fadeTransition}
        />

        {/* Dust motes — only while lit, and only with motion allowed */}
        {on && motionSafe && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            {MOTES.map((mote) => (
              <motion.span
                key={`${mote.x}-${mote.y}`}
                className="absolute size-[3px] rounded-full"
                style={{
                  left: mote.x,
                  top: mote.y,
                  background:
                    "color-mix(in oklab, var(--warning, #b45309) 75%, transparent)",
                }}
                initial={{ opacity: 0, y: 0 }}
                animate={{ opacity: [0, 0.6, 0], y: -30 }}
                transition={{
                  duration: mote.duration,
                  ease: easings.move,
                  repeat: Infinity,
                  delay: mote.delay,
                }}
              />
            ))}
          </span>
        )}

        {/* Cord + bead — pivot at the shade for the release swing. Centered
            via marginLeft, not a translate-x class: this element also
            carries the `rotate` motion value, and Motion's own inline
            `transform` would otherwise override a class-based translateX. */}
        <motion.div
          className="absolute left-1/2 flex flex-col items-center"
          style={{
            top: CORD_ANCHOR_Y,
            marginLeft: -(BEAD / 2),
            rotate: pivotRotate,
            transformOrigin: "50% 0%",
          }}
        >
          <motion.span
            aria-hidden
            className="block w-px rounded-full bg-ink-3/70"
            style={{ height: cordHeight }}
          />
          <button
            type="button"
            aria-label="Pull the light cord"
            aria-pressed={on}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleKeyDown}
            onClick={handleClick}
            className={cn(
              "-mt-px block size-4 touch-none rounded-full border border-hairline bg-surface-2 shadow-raised outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
          />
        </motion.div>
      </div>

      <span
        aria-hidden
        className="mt-2 h-4 text-label font-mono leading-none text-ink-3"
      >
        {CAPTIONS[caption]}
      </span>

      <span role="status" aria-live="polite" className="sr-only">
        {on ? "Light on." : "Light off."}
      </span>
    </div>
  );
}
