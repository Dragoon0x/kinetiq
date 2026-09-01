"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp, djb2, mapRange, seeded } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Flake count is clamped into this range regardless of what the prop asks for. */
const MIN_FLAKES = 6;
const MAX_FLAKES = 24;

/** Globe geometry, px. The dome is a true circle; the base sits under it. */
const DOME_D = 176;
const DRIFT_H = 34;
const BASE_W = 158;
const BASE_H = 34;
const BASE_OVERLAP = 14;

/** The house diorama, hand-placed inside the dome's coordinate box. */
const HOUSE_CX = DOME_D / 2;
const ROOF_W = 38;
const ROOF_H = 15;
const HOUSE_W = 30;
const HOUSE_H = 18;
const BODY_TOP = 126;
const ROOF_TOP = BODY_TOP - ROOF_H;
const WINDOW_SIZE = 4;

/** A rounded-ish trapezoid: sloped sides, chamfered bottom corners. */
const BASE_CLIP =
  "polygon(10% 0%, 90% 0%, 100% 82%, 92% 100%, 8% 100%, 0% 82%)";

const BASE_BG =
  "linear-gradient(180deg, color-mix(in oklab, var(--warning, #b45309) 30%, var(--color-surface-1)) 0%, color-mix(in oklab, var(--warning, #b45309) 46%, var(--color-surface-2)) 100%)";

/** Glass: a bright rim highlight top-left, a soft shadow bottom-right. */
const GLASS_SHEEN = [
  "radial-gradient(120% 100% at 28% 14%, oklch(1 0 0 / 0.22) 0%, transparent 45%)",
  "radial-gradient(130% 110% at 78% 88%, oklch(0 0 0 / 0.1) 0%, transparent 60%)",
].join(", ");
const GLASS_STREAK =
  "linear-gradient(90deg, transparent, oklch(0.95 0.01 258 / 0.45) 45%, transparent)";

/** A pale dot, mixed rather than pure white so it reads in both themes. */
const FLAKE_FILL =
  "color-mix(in oklab, var(--primary-foreground) 88%, var(--ink-2) 12%)";
const DRIFT_BG =
  "linear-gradient(180deg, color-mix(in oklab, var(--primary-foreground) 92%, var(--ink-2) 8%) 0%, color-mix(in oklab, var(--primary-foreground) 78%, var(--ink-2) 22%) 100%)";

/** Click gives a modest, reliable shake even with no drag behind it. */
const BASE_CLICK_ENERGY = 0.4;
/** Drag tuning: rubber-resisted wobble while held, energy from distance thrown. */
const MAX_DRAG_TRAVEL = 16;
const ROT_PER_PX = 0.35;
const DRAG_ENERGY_SATURATE_PX = 260;
const DRAG_MOVE_THRESHOLD = 4;

/** The globe rock: six keyframes, decaying. First frame null continues from
 *  wherever the globe currently sits, so a release mid-drag flows straight in. */
const ROCK_DURATION_S = 0.55;
const ROCK_TIMES = [0, 0.12, 0.28, 0.46, 0.66, 0.88, 1] as const;
const ROCK_ROTATE_UNIT = [null, -1, 0.72, -0.48, 0.26, -0.1, 0] as const;
const ROCK_X_UNIT = [null, -1, 0.7, -0.45, 0.24, -0.1, 0] as const;
const MAX_ROCK_DEG = 9;
const MIN_ROCK_DEG = 2.5;
const MAX_ROCK_X = 8;
const MIN_ROCK_X = 2;

/** Per-flake swirl duration scales with energy across this band. */
const SWIRL_MIN_S = 1.8;
const SWIRL_MAX_S = 3.2;
/** How long "settled." holds before the caption returns to "shake it". */
const SETTLE_BEAT_MS = 900;
/** Reduced motion: how long the "just shaken" pose holds before resting. */
const REDUCED_SNOW_BEAT_MS = 460;
/** The drift's scaleY ceiling once every flake in a cycle has landed. */
const DRIFT_GROWTH_MAX = 0.14;

type FlakeConst = {
  readonly size: number;
  readonly opacity: number;
  readonly restX: number;
  readonly restY: number;
  readonly pathX: readonly number[];
  readonly pathY: readonly number[];
  readonly times: readonly number[];
  readonly durationJitter: number;
  readonly delay: number;
  /** Reduced-motion snapshot offset — the "just shaken" pose. */
  readonly shakenX: number;
  readonly shakenY: number;
};

/**
 * One flake's rest spot, seeded swirl path, and timing — deterministic by
 * index alone, so the same flake count always draws the same drift and the
 * same flight every time, on server and client alike.
 */
function buildFlake(index: number): FlakeConst {
  const rng = seeded(djb2(`snow-shake:${index}`));
  const size = 3 + rng() * 2.6;
  const opacity = 0.55 + ((size - 3) / 2.6) * 0.4;

  // Rest position: a triangular distribution mounds flakes near the middle
  // of the drift rather than spreading them flat and even.
  const spread = ((rng() + rng()) / 2) * 2 - 1;
  const restX = HOUSE_CX + spread * (DOME_D * 0.3);
  const lift = rng();
  const restY = DOME_D - 30 - lift * 10;

  // Swirl: four waypoints that lift off, curl one way then the other, and
  // ease back toward zero offset — the final keyframe always rejoins rest.
  const dir = rng() < 0.5 ? -1 : 1;
  const p1x = dir * (14 + rng() * 10);
  const p1y = -(28 + rng() * 18);
  const p2x = -dir * (16 + rng() * 14);
  const p2y = -(52 + rng() * 24);
  const p3x = dir * (9 + rng() * 15);
  const p3y = -(34 + rng() * 18);
  const p4x = -dir * (5 + rng() * 9);
  const p4y = -(9 + rng() * 10);

  const t1 = 0.13 + rng() * 0.04;
  const t2 = 0.33 + rng() * 0.05;
  const t3 = 0.52 + rng() * 0.05;
  const t4 = 0.71 + rng() * 0.05;

  return {
    size,
    opacity,
    restX,
    restY,
    pathX: [0, p1x, p2x, p3x, p4x, 0],
    pathY: [0, p1y, p2y, p3y, p4y, 0],
    times: [0, t1, t2, t3, t4, 1],
    durationJitter: 0.85 + rng() * 0.3,
    delay: rng() * 0.6,
    shakenX: p2x * 0.7,
    shakenY: p2y * 0.7,
  };
}

type FlakeProps = {
  c: FlakeConst;
  /** False only before the globe has ever been shaken. */
  play: boolean;
  motionSafe: boolean;
  arrangement: "rest" | "shaken";
  duration: number;
  onLand: () => void;
};

/**
 * One flake dot. Motion-safe and mid-flight, it is a real authored x/y tween
 * from rest through its seeded swirl and back to rest — that arrival is what
 * reports the landing. Otherwise it is a plain, unanimated span: sitting at
 * rest, or — under reduced motion, while `arrangement` is "shaken" — snapped
 * straight to its fixed just-shaken offset.
 */
function Flake({
  c,
  play,
  motionSafe,
  arrangement,
  duration,
  onLand,
}: FlakeProps): React.JSX.Element {
  const style: React.CSSProperties = {
    left: c.restX,
    top: c.restY,
    marginLeft: -c.size / 2,
    marginTop: -c.size / 2,
    width: c.size,
    height: c.size,
    background: FLAKE_FILL,
    opacity: c.opacity,
  };

  if (play && motionSafe) {
    return (
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={style}
        initial={{ x: 0, y: 0 }}
        animate={{ x: [...c.pathX], y: [...c.pathY] }}
        transition={{
          duration,
          times: [...c.times],
          delay: c.delay,
          ease: easings.move,
        }}
        onAnimationComplete={onLand}
      />
    );
  }

  const shaken = play && !motionSafe && arrangement === "shaken";
  return (
    <span
      aria-hidden
      className="absolute rounded-full"
      style={{
        ...style,
        left: c.restX + (shaken ? c.shakenX : 0),
        top: c.restY + (shaken ? c.shakenY : 0),
      }}
    />
  );
}

/** The default scene: a small silhouette house with one lit window. */
function HouseScene(): React.JSX.Element {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span
        className="absolute"
        style={{
          left: HOUSE_CX - ROOF_W / 2,
          top: ROOF_TOP,
          width: ROOF_W,
          height: ROOF_H,
          clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)",
          background: "var(--ink-2)",
        }}
      />
      <span
        className="absolute rounded-[1px]"
        style={{
          left: HOUSE_CX - HOUSE_W / 2,
          top: BODY_TOP,
          width: HOUSE_W,
          height: HOUSE_H,
          background: "var(--ink-3)",
        }}
      />
      <span
        className="absolute rounded-[1px]"
        style={{
          left: HOUSE_CX - WINDOW_SIZE / 2,
          top: BODY_TOP + 6,
          width: WINDOW_SIZE,
          height: WINDOW_SIZE,
          background:
            "color-mix(in oklab, var(--warning, #b45309) 70%, var(--primary-foreground))",
        }}
      />
    </div>
  );
}

type DragState = {
  id: number;
  originX: number;
  lastX: number;
  moved: boolean;
  energyPx: number;
};

type Caption = "idle" | "snowing" | "settled";

export type SnowShakeProps = {
  /** Flake count, clamped 6-24. @default 14 */
  flakes?: number;
  /** Fires once the last flake lands and the scene reads "settled." */
  onSettle?: () => void;
  className?: string;
};

/**
 * A snow globe you shake by hand: a glass dome — a translucent circle with a
 * bright rim highlight — holds a tiny house nestled in a drift, all set on a
 * warm wooden-toned base. The dome is a real button: click it, or grab it and
 * drag (pointer-captured, rubber-resisted) to wind up shake energy from the
 * distance you throw it. On release the whole globe rocks through a decaying
 * six-keyframe tween sized to that energy while every one of `flakes` lifts
 * off the drift on its own authored, seeded swirl — duration scaled by
 * energy, arrival staggered by a per-flake seeded delay — before settling
 * back into its rest spot; the drift steps up a hair with each landing and
 * resets at the next shake. A mono caption reads "shake it" at rest, "…"
 * while it snows, and "settled." for a beat once the last flake is down.
 * Reduced motion: no rock and no swirl — a click jumps every flake straight
 * to a fixed "just shaken" arrangement, then straight back to rest after a
 * beat, while the caption still cycles through its three states.
 */
export function SnowShake({
  flakes: flakesProp = 14,
  onSettle,
  className,
}: SnowShakeProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const count = Math.round(clamp(flakesProp, MIN_FLAKES, MAX_FLAKES));
  const flakeConsts = React.useMemo(
    () => Array.from({ length: count }, (_, i) => buildFlake(i)),
    [count],
  );

  const [cycle, setCycle] = React.useState(0);
  const [energy, setEnergy] = React.useState(BASE_CLICK_ENERGY);
  const [caption, setCaption] = React.useState<Caption>("idle");
  const [arrangement, setArrangement] = React.useState<"rest" | "shaken">(
    "rest",
  );

  const globeX = useMotionValue(0);
  const globeRotate = useMotionValue(0);
  const driftScaleY = useMotionValue(1);

  const rockXAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const rockRotateAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const driftAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const dragRef = React.useRef<DragState | null>(null);
  const pointerActivatedRef = React.useRef(false);
  const landedRef = React.useRef(0);

  const settleTimer = React.useRef<number | null>(null);
  const reducedBeatTimer = React.useRef<number | null>(null);
  const reducedHoldTimer = React.useRef<number | null>(null);

  const onSettleRef = React.useRef(onSettle);
  React.useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  React.useEffect(() => {
    return () => {
      rockXAnim.current?.stop();
      rockRotateAnim.current?.stop();
      driftAnim.current?.stop();
      if (settleTimer.current !== null)
        window.clearTimeout(settleTimer.current);
      if (reducedBeatTimer.current !== null)
        window.clearTimeout(reducedBeatTimer.current);
      if (reducedHoldTimer.current !== null)
        window.clearTimeout(reducedHoldTimer.current);
    };
  }, []);

  // Re-seat the globe the moment the motion pathway switches to reduced.
  React.useEffect(() => {
    if (motionSafe) return;
    rockXAnim.current?.stop();
    rockRotateAnim.current?.stop();
    dragRef.current = null;
    globeX.jump(0);
    globeRotate.jump(0);
  }, [motionSafe, globeX, globeRotate]);

  const clearTimers = () => {
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current);
      settleTimer.current = null;
    }
    if (reducedBeatTimer.current !== null) {
      window.clearTimeout(reducedBeatTimer.current);
      reducedBeatTimer.current = null;
    }
    if (reducedHoldTimer.current !== null) {
      window.clearTimeout(reducedHoldTimer.current);
      reducedHoldTimer.current = null;
    }
  };

  const triggerShake = (energyValue: number) => {
    clearTimers();
    landedRef.current = 0;
    setEnergy(energyValue);
    setCycle((c) => c + 1);
    setCaption("snowing");

    // The drift's growth is per-cycle — every shake starts it fresh.
    driftAnim.current?.stop();
    driftScaleY.jump(1);

    if (motionSafe) {
      rockXAnim.current?.stop();
      rockRotateAnim.current?.stop();
      const rockDeg = clamp(
        energyValue * MAX_ROCK_DEG,
        MIN_ROCK_DEG,
        MAX_ROCK_DEG,
      );
      const rockPx = clamp(energyValue * MAX_ROCK_X, MIN_ROCK_X, MAX_ROCK_X);
      rockXAnim.current = animate(
        globeX,
        ROCK_X_UNIT.map((u) => (u === null ? null : u * rockPx)),
        {
          duration: ROCK_DURATION_S,
          ease: easings.move,
          times: [...ROCK_TIMES],
        },
      );
      rockRotateAnim.current = animate(
        globeRotate,
        ROCK_ROTATE_UNIT.map((u) => (u === null ? null : u * rockDeg)),
        {
          duration: ROCK_DURATION_S,
          ease: easings.move,
          times: [...ROCK_TIMES],
        },
      );
      // Flakes are driven declaratively (see the .map below); landings are
      // reported one at a time through each flake's onAnimationComplete.
      return;
    }

    // Reduced motion: no rock, no swirl — jump to a fixed pose, then rest.
    globeX.jump(0);
    globeRotate.jump(0);
    setArrangement("shaken");
    reducedBeatTimer.current = window.setTimeout(() => {
      reducedBeatTimer.current = null;
      setArrangement("rest");
      driftScaleY.jump(1 + DRIFT_GROWTH_MAX);
      setCaption("settled");
      onSettleRef.current?.();
      reducedHoldTimer.current = window.setTimeout(() => {
        reducedHoldTimer.current = null;
        setCaption("idle");
      }, SETTLE_BEAT_MS);
    }, REDUCED_SNOW_BEAT_MS);
  };

  const handleLand = () => {
    landedRef.current += 1;
    const n = landedRef.current;
    const target = 1 + (n / count) * DRIFT_GROWTH_MAX;
    driftAnim.current?.stop();
    driftAnim.current = animate(driftScaleY, target, springs.flick);

    if (n >= count) {
      setCaption("settled");
      onSettleRef.current?.();
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        setCaption("idle");
      }, SETTLE_BEAT_MS);
    }
  };

  const finishDrag = (drag: DragState) => {
    dragRef.current = null;
    pointerActivatedRef.current = true;
    const energyValue = drag.moved
      ? clamp(
          mapRange(
            drag.energyPx,
            0,
            DRAG_ENERGY_SATURATE_PX,
            BASE_CLICK_ENERGY,
            1,
          ),
          BASE_CLICK_ENERGY,
          1,
        )
      : BASE_CLICK_ENERGY;
    triggerShake(energyValue);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!motionSafe) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (dragRef.current !== null) return;
    rockXAnim.current?.stop();
    rockRotateAnim.current?.stop();
    dragRef.current = {
      id: event.pointerId,
      originX: event.clientX,
      lastX: event.clientX,
      moved: false,
      energyPx: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.id) return;
    if (event.buttons === 0) {
      finishDrag(drag);
      return;
    }
    const rawDelta = event.clientX - drag.originX;
    const travel = MAX_DRAG_TRAVEL * Math.tanh(rawDelta / MAX_DRAG_TRAVEL);
    const stepDelta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    if (Math.abs(rawDelta) > DRAG_MOVE_THRESHOLD) drag.moved = true;
    drag.energyPx += Math.abs(stepDelta);
    globeX.set(travel);
    globeRotate.set(travel * ROT_PER_PX);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag === null || event.pointerId !== drag.id) return;
    finishDrag(drag);
  };

  const handleClick = () => {
    if (pointerActivatedRef.current) {
      pointerActivatedRef.current = false;
      return;
    }
    triggerShake(BASE_CLICK_ENERGY);
  };

  const captionText =
    caption === "idle" ? "shake it" : caption === "snowing" ? "…" : "settled.";
  const play = cycle > 0;

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Shake the snow globe"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onClick={handleClick}
        className={cn(
          "relative inline-flex flex-col items-center rounded-3 p-1 outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          motionSafe && "cursor-grab touch-none active:cursor-grabbing",
        )}
      >
        <motion.span
          aria-hidden
          className="relative flex flex-col items-center"
          style={{ x: globeX, rotate: globeRotate, transformOrigin: "50% 50%" }}
        >
          <span
            className="relative block overflow-hidden rounded-full border border-hairline-strong bg-surface-1 shadow-raised"
            style={{ width: DOME_D, height: DOME_D }}
          >
            <HouseScene />

            <motion.span
              aria-hidden
              className="absolute inset-x-0 bottom-0"
              style={{
                height: DRIFT_H,
                scaleY: driftScaleY,
                transformOrigin: "50% 100%",
                background: DRIFT_BG,
                borderTopLeftRadius: DRIFT_H,
                borderTopRightRadius: DRIFT_H,
              }}
            />

            {flakeConsts.map((c, i) => (
              <Flake
                key={`${i}-${cycle}`}
                c={c}
                play={play}
                motionSafe={motionSafe}
                arrangement={arrangement}
                duration={clamp(
                  mapRange(energy, 0, 1, SWIRL_MIN_S, SWIRL_MAX_S) *
                    c.durationJitter,
                  1.5,
                  3.7,
                )}
                onLand={handleLand}
              />
            ))}

            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: GLASS_SHEEN }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -rotate-[30deg] rounded-full"
              style={{
                left: "16%",
                top: "16%",
                width: "26%",
                height: 3,
                background: GLASS_STREAK,
              }}
            />
          </span>

          <span
            aria-hidden
            className="relative block shadow-raised"
            style={{ width: BASE_W, height: BASE_H, marginTop: -BASE_OVERLAP }}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{ clipPath: BASE_CLIP, background: BASE_BG }}
            />
          </span>
        </motion.span>
      </button>

      <span
        aria-hidden
        className="flex h-4 items-center overflow-hidden font-mono text-xs text-ink-3 normal-case"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={caption}
            initial={motionSafe ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              motionSafe
                ? {
                    opacity: 0,
                    y: -4,
                    transition: {
                      duration: durations.fast,
                      ease: easings.exit,
                    },
                  }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {captionText}
          </motion.span>
        </AnimatePresence>
      </span>

      <span aria-live="polite" className="sr-only">
        {caption === "settled"
          ? "Settled."
          : caption === "snowing"
            ? "Snowing."
            : ""}
      </span>
    </div>
  );
}
