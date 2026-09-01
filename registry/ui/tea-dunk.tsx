"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry (px) — every actor shares this fixed coordinate space. */
const STAGE_W = 200;
const STAGE_H = 248;
/** Where the string leaves the anchor rod. */
const STRING_TOP = 10;
/** Bag top when fully lifted out (bagY = 0). */
const BAG_REST = 60;
const BAG_H = 40;
/** Water surface, in stage coordinates. */
const WATERLINE = 154;
/** bagY at which the bag bottom breaks the surface. */
const SUBMERGE_AT = WATERLINE - BAG_REST - BAG_H;
/** bagY when the bag is parked fully in the mug. */
const DUNK_MAX = 106;
/** ArrowDown/ArrowUp move the bag this many px per press. */
const KEY_STEP = 27;
/** Steep bonus for each full dunk (out → in). */
const DUNK_BONUS = 7;
/** Steep timer resolution. */
const TICK_MS = 100;

/** Fixed drip choreography — offsets from center, stagger in seconds. */
const DRIPS = [
  { x: -9, delay: 0 },
  { x: 1, delay: 0.08 },
  { x: 8, delay: 0.16 },
] as const;
const DRIP_TOP = BAG_REST + BAG_H + 8;
const DRIP_FALL = WATERLINE - DRIP_TOP;

/** Two ripple rings per entry, staggered. */
const RIPPLE_DELAYS = [0, 0.09] as const;

/** Fixed steam phases — offsets from center, delay in seconds. */
const STEAM = [
  { x: -16, delay: 0 },
  { x: -2, delay: 0.8 },
  { x: 12, delay: 1.5 },
] as const;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

export type TeaDunkProps = {
  /** Steep gained per second while the bag is submerged. @default 14 */
  steepRate?: number;
  /** Fires once, the moment steep reaches 100. */
  onReady?: () => void;
  className?: string;
};

/**
 * A mug of hot water and a teabag begging to be dunked. Drag the bag — or
 * press ArrowDown/ArrowUp while it has focus — below the waterline and it
 * steeps: two ripple rings bloom at the entry point on an exit tween, the
 * water deepens from pale to amber via a live color-mix, and lifting it back
 * out sheds a stagger of drips that tick the surface. Release mid-drag and
 * the bag snaps to the nearest state, in or out, on `snap`. Parking it steeps
 * at `steepRate` per second, but each full dunk adds a bonus, so playful
 * dunking finishes faster; at 100 the mono caption flips to "steeped.", steam
 * wisps curl off the surface on slow looping tweens, and `onReady` fires
 * once. Reduced motion: dragging still tracks 1:1 and the water still
 * deepens, but ripples and drips are omitted, snaps are instant, and the
 * steam becomes a static ready glyph.
 */
export function TeaDunk({
  steepRate = 14,
  onReady,
  className,
}: TeaDunkProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const bagY = useMotionValue(0);
  const stringHeight = useTransform(bagY, (y) => BAG_REST - STRING_TOP + y);

  const [submerged, setSubmerged] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [steep, setSteep] = React.useState(0);
  const [dunks, setDunks] = React.useState(0);
  /** Remount keys — each crossing restarts its burst choreography. */
  const [rippleKey, setRippleKey] = React.useState(0);
  const [dripKey, setDripKey] = React.useState(0);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const stageTopRef = React.useRef(0);
  const grabOffsetRef = React.useRef(0);
  const submergedRef = React.useRef(false);
  const readyFiredRef = React.useRef(false);

  // Latest-ref: onReady is read inside an effect, kept current from an effect.
  const onReadyRef = React.useRef(onReady);
  React.useEffect(() => {
    onReadyRef.current = onReady;
  });

  const steepPct = clamp(steep, 0, 100);
  const ready = steepPct >= 100;

  // The steep clock: a fixed-rate interval that only runs while submerged and
  // not yet ready. State changes live in the interval callback, not the
  // effect body.
  React.useEffect(() => {
    if (!submerged || ready) return;
    const perTick = (steepRate * TICK_MS) / 1000;
    const interval = window.setInterval(() => {
      setSteep((s) => clamp(s + perTick, 0, 100));
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [submerged, ready, steepRate]);

  // Fire onReady exactly once, the render after steep crosses 100.
  React.useEffect(() => {
    if (ready && !readyFiredRef.current) {
      readyFiredRef.current = true;
      onReadyRef.current?.();
    }
  }, [ready]);

  const snapTransition = motionSafe ? springs.snap : { duration: 0 };

  /** Tracks waterline crossings: counts dunks going in, sheds drips going out. */
  const crossCheck = (y: number) => {
    const inWater = y >= SUBMERGE_AT;
    if (inWater === submergedRef.current) return;
    submergedRef.current = inWater;
    setSubmerged(inWater);
    if (inWater) {
      setDunks((d) => d + 1);
      setSteep((s) => clamp(s + DUNK_BONUS, 0, 100));
      setRippleKey((k) => k + 1);
    } else {
      setDripKey((k) => k + 1);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    stageTopRef.current = rect.top;
    grabOffsetRef.current = event.clientY - rect.top - BAG_REST - bagY.get();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const y = clamp(
      event.clientY - stageTopRef.current - BAG_REST - grabOffsetRef.current,
      0,
      DUNK_MAX,
    );
    bagY.set(y);
    keyTargetRef.current = y;
    crossCheck(y);
  };

  /** Release anywhere: settle to the nearest state — in or out — on `snap`. */
  const settle = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
    const target = bagY.get() >= SUBMERGE_AT ? DUNK_MAX : 0;
    keyTargetRef.current = target;
    animate(bagY, target, snapTransition);
    crossCheck(target);
  };

  // Rapid key presses must accumulate against the logical target, not the
  // mid-spring live value — reading bagY.get() here made six ArrowDowns
  // collapse into one step.
  const keyTargetRef = React.useRef(0);

  const moveBy = (delta: number) => {
    const next = clamp(keyTargetRef.current + delta, 0, DUNK_MAX);
    keyTargetRef.current = next;
    animate(bagY, next, snapTransition);
    crossCheck(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveBy(KEY_STEP);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveBy(-KEY_STEP);
    }
  };

  // Enter/Space arrive as clicks with detail 0 — toggle a full dunk. Pointer
  // interactions were already handled down/move/up, so real clicks pass.
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0) return;
    const target = submergedRef.current ? 0 : DUNK_MAX;
    keyTargetRef.current = target;
    animate(bagY, target, snapTransition);
    crossCheck(target);
  };

  // Water deepens with steep: pale (10%) to deep amber (68%) via color-mix.
  const waterMix = Math.round((10 + steepPct * 0.58) * 10) / 10;
  const waterColor = `color-mix(in oklab, var(--warning, #b45309) ${waterMix}%, var(--card))`;
  const bagFill = `color-mix(in oklab, var(--warning, #b45309) ${submerged ? 30 : 14}%, var(--card))`;
  const rippleStroke =
    "color-mix(in oklab, var(--warning, #b45309) 55%, var(--card))";
  const steamColor =
    "color-mix(in oklab, var(--ink-2, #a8adb8) 70%, transparent)";

  return (
    <div
      className={cn("inline-flex flex-col items-center select-none", className)}
    >
      <div
        ref={stageRef}
        className="relative"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Anchor rod the string hangs from */}
        <span
          aria-hidden
          className="absolute top-1 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded-full border border-hairline bg-surface-1 shadow-raised"
        />

        {/* String — taut→slack is purely a length change tracking the bag */}
        <motion.span
          aria-hidden
          className="absolute left-1/2 w-px bg-ink-3/70"
          style={{ top: STRING_TOP, height: stringHeight }}
        />

        {/* Mug with handle and the steeping water */}
        <div
          aria-hidden
          className="absolute bottom-2 left-1/2 h-24 w-[124px] -translate-x-1/2 rounded-t-1 rounded-b-3 border border-hairline bg-surface-1 shadow-raised"
        >
          <span className="absolute top-4 -right-[18px] h-10 w-6 rounded-r-full border-4 border-hairline" />
          <div
            className="absolute inset-x-1.5 top-2.5 bottom-1.5 overflow-hidden rounded-t-1 rounded-b-2"
            style={{ backgroundColor: waterColor }}
          >
            {/* Surface sheen */}
            <span className="absolute inset-x-0 top-0 h-px bg-surface-1/60" />
          </div>
        </div>

        {/* Entry ripples — two rings on an exit tween, restarted per dunk */}
        {motionSafe && rippleKey > 0 && (
          <span aria-hidden>
            {RIPPLE_DELAYS.map((delay) => (
              <motion.span
                key={`${rippleKey}-${delay}`}
                className="absolute left-1/2 h-2 w-8 rounded-full border"
                style={{
                  top: WATERLINE - 4,
                  x: "-50%",
                  borderColor: rippleStroke,
                }}
                initial={{ scale: 0.4, opacity: 0.9 }}
                animate={{ scale: 2.1, opacity: 0 }}
                transition={{
                  duration: durations.slow,
                  ease: easings.exit,
                  delay,
                }}
              />
            ))}
          </span>
        )}

        {/* Drips — fixed offsets fall back to the water, each with a tick */}
        {motionSafe && dripKey > 0 && !submerged && (
          <span aria-hidden>
            {DRIPS.map((drip) => (
              <React.Fragment key={`${dripKey}-${drip.x}`}>
                <motion.span
                  className="absolute h-2 w-1 rounded-full"
                  style={{
                    top: DRIP_TOP,
                    left: STAGE_W / 2 + drip.x,
                    backgroundColor: waterColor,
                  }}
                  initial={{ y: 0, opacity: 0.9 }}
                  animate={{ y: DRIP_FALL, opacity: 0 }}
                  transition={{
                    duration: durations.slow,
                    ease: easings.exit,
                    delay: drip.delay,
                  }}
                />
                <motion.span
                  className="absolute h-px w-3 rounded-full"
                  style={{
                    top: WATERLINE - 1,
                    left: STAGE_W / 2 + drip.x - 5,
                    backgroundColor: rippleStroke,
                  }}
                  initial={{ scaleX: 0.3, opacity: 0 }}
                  animate={{ scaleX: [0.3, 1, 0.6], opacity: [0, 0.8, 0] }}
                  transition={{
                    duration: durations.base,
                    ease: easings.exit,
                    delay: drip.delay + 0.34,
                  }}
                />
              </React.Fragment>
            ))}
          </span>
        )}

        {/* Steam — slow looping rise-and-fade wisps once the tea is ready */}
        {ready && motionSafe && (
          <span aria-hidden>
            {STEAM.map((wisp) => (
              <motion.span
                key={wisp.x}
                className="absolute h-7 w-[3px] rounded-full"
                style={{
                  top: WATERLINE - 34,
                  left: STAGE_W / 2 + wisp.x,
                  backgroundColor: steamColor,
                }}
                initial={{ y: 0, opacity: 0 }}
                animate={{ y: -20, x: [0, 4, -3, 0], opacity: [0, 0.55, 0] }}
                transition={{
                  duration: 2.8,
                  ease: easings.move,
                  repeat: Infinity,
                  delay: wisp.delay,
                }}
              />
            ))}
          </span>
        )}
        {ready && !motionSafe && (
          <span
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 font-mono text-sm text-ink-2"
            style={{ top: WATERLINE - 40 }}
          >
            ♨
          </span>
        )}

        {/* The teabag — a real button: draggable, arrow-keyable */}
        <motion.button
          type="button"
          aria-label="Dunk the teabag"
          aria-pressed={submerged}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={settle}
          onPointerCancel={settle}
          onKeyDown={handleKeyDown}
          onClick={handleClick}
          className={cn(
            "absolute left-1/2 block touch-none rounded-2",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
            dragging ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{
            top: BAG_REST,
            y: bagY,
            x: "-50%",
            width: 34,
            height: BAG_H,
          }}
        >
          <span aria-hidden className="relative block size-full">
            {/* Folded top the string ties onto */}
            <span className="absolute inset-x-[6px] top-0 h-2 rounded-t-1 border border-b-0 border-hairline bg-surface-1" />
            {/* Bag body — reads wetter while submerged */}
            <span
              className="absolute inset-x-0 top-[6px] bottom-0 rounded-2 border border-hairline shadow-raised"
              style={{ backgroundColor: bagFill }}
            />
            {/* Stitch line */}
            <span className="absolute inset-x-[5px] top-[13px] border-t border-dashed border-hairline" />
          </span>
        </motion.button>
      </div>

      {/* Mono caption: progress on the right, verdict on the left */}
      <div
        className="mt-2 flex items-baseline justify-between font-mono text-[11px] text-ink-2 tabular-nums"
        style={{ width: STAGE_W }}
      >
        <motion.span
          key={ready ? "steeped" : "dunking"}
          initial={{ y: 4, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={
            motionSafe
              ? {
                  y: springs.snap,
                  opacity: { duration: durations.fast, ease: easings.enter },
                }
              : { duration: 0 }
          }
        >
          {ready ? "steeped." : "keep dunking"}
        </motion.span>
        <span>
          {dunks} {dunks === 1 ? "dunk" : "dunks"} · {Math.round(steepPct)}%
        </span>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {ready ? "Tea is steeped and ready." : ""}
      </span>
    </div>
  );
}
