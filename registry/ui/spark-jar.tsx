"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Capacity is clamped into this range regardless of what the prop asks for. */
const CAPACITY_MIN = 4;
const CAPACITY_MAX = 16;

/** Stage footprint, in px. */
const STAGE_W = 300;
const STAGE_H = 224;

/** Jar geometry: the lid overhangs the glass body by a few px each side. */
const JAR_W = 100;
const LID_W = 110;
const LID_H = 16;
const JAR_BODY_H = 60;
const JAR_TOTAL_H = LID_H + JAR_BODY_H;
const FLOOR_GAP = 14;

/** The jar wrapper's top-left, in stage coordinates. */
const JAR_WRAPPER_LEFT = (STAGE_W - LID_W) / 2;
const JAR_TOP = STAGE_H - FLOOR_GAP - JAR_TOTAL_H;

/** Where a caught spark's flight aims for — the neck, just under the lid. */
const JAR_MOUTH_X = STAGE_W / 2;
const JAR_MOUTH_Y = JAR_TOP + LID_H + 6;

type Point = { readonly left: number; readonly top: number };

type SparkSlot = {
  readonly anchor: Point;
  readonly path: {
    readonly x: readonly number[];
    readonly y: readonly number[];
  };
  readonly times: readonly number[];
  /** Loop length, s. */
  readonly duration: number;
  /** Fixed phase offset, s — the reason no two sparks ever line up. */
  readonly delay: number;
};

/**
 * Five fixed drift slots. Every path is a hand-set round trip (each
 * keyframe list starts and ends at 0) so a slot always resets clean when it
 * respawns. Durations and delays are all distinct — no shared factor keeps
 * any pair in phase for long.
 */
const SPARK_SLOTS = [
  {
    anchor: { left: 60, top: 50 },
    path: { x: [0, 22, -14, 9, 0], y: [0, -12, 8, -6, 0] },
    times: [0, 0.28, 0.56, 0.8, 1],
    duration: 9.4,
    delay: 0,
  },
  {
    anchor: { left: 230, top: 64 },
    path: { x: [0, -24, 14, -8, 0], y: [0, 14, -10, 6, 0] },
    times: [0, 0.3, 0.58, 0.82, 1],
    duration: 10.6,
    delay: 2.7,
  },
  {
    anchor: { left: 150, top: 30 },
    path: { x: [0, 18, -20, 11, 0], y: [0, -9, 13, -6, 0] },
    times: [0, 0.26, 0.54, 0.78, 1],
    duration: 8.7,
    delay: 4.9,
  },
  {
    anchor: { left: 96, top: 106 },
    path: { x: [0, -14, 18, -10, 0], y: [0, 10, -13, 6, 0] },
    times: [0, 0.3, 0.6, 0.84, 1],
    duration: 11.3,
    delay: 1.4,
  },
  {
    anchor: { left: 248, top: 108 },
    path: { x: [0, 15, -17, 8, 0], y: [0, -13, 9, -5, 0] },
    times: [0, 0.27, 0.55, 0.79, 1],
    duration: 9.8,
    delay: 6.2,
  },
] as const satisfies readonly SparkSlot[];

/** Fixed flight offset from each slot's anchor to the jar mouth. */
const FLIGHT_TARGETS = SPARK_SLOTS.map((slot) => ({
  dx: JAR_MOUTH_X - slot.anchor.left,
  dy: JAR_MOUTH_Y - slot.anchor.top,
}));

/** Caught sparks cluster inside the glass, wrapper-local coordinates. */
const JAR_BODY_CENTER_X = LID_W / 2;
const JAR_BODY_BASE_Y = 46;

/**
 * Sixteen fixed seats — one per possible caught spark, matching
 * `CAPACITY_MAX`. Laid out bottom row first, alternating rows zig so the
 * cluster reads as settled rather than gridded. No randomness: same
 * capacity always fills the same way.
 */
const JAR_SLOTS: { x: number; y: number }[] = Array.from(
  { length: CAPACITY_MAX },
  (_, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const zig = row % 2 === 0 ? 0 : 7;
    return {
      x: JAR_BODY_CENTER_X + (-21 + col * 14 + zig),
      y: JAR_BODY_BASE_Y + (18 - row * 11),
    };
  },
);

/** Dot sizes, px. */
const SPARK_SIZE = 10;
const CAUGHT_SIZE = 9;
/** Comfortable tap target for the tiny drifting dot. */
const HIT_SIZE = 30;

/** Timing, s / ms. */
const CATCH_FLIGHT_S = 0.45;
const DRAIN_FLIGHT_S = 0.55;
const RESPAWN_BEAT_MS = 900;
const FULL_HOLD_MS = 2400;
const BOB_S = 3.4;

/** How far the lid hops on a catch, and how far it lifts to let sparks out. */
const LID_HOP_Y = -6;
const LID_OPEN_Y = -26;

/** The jar's inner glow tops out here, however many sparks are caught. */
const GLOW_MAX = 0.85;

const SPARK_FILL =
  "radial-gradient(circle at 35% 30%, color-mix(in oklab, var(--warning, #b45309) 55%, var(--primary-foreground)) 0%, var(--warning, #b45309) 78%)";
const SPARK_GLOW =
  "0 0 10px 2px color-mix(in oklab, var(--warning, #b45309) 55%, transparent), 0 0 3px 1px color-mix(in oklab, var(--warning, #b45309) 85%, transparent)";
const GLOW_BG =
  "radial-gradient(ellipse at 50% 75%, color-mix(in oklab, var(--warning, #b45309) 65%, transparent) 0%, transparent 70%)";
const BLOOM_BG =
  "radial-gradient(circle, color-mix(in oklab, var(--warning, #b45309) 45%, transparent) 0%, transparent 72%)";
const VIGNETTE_SHADOW = "inset 0 0 44px oklch(0.1 0.02 258 / 0.4)";

type Phase = "idle" | "full" | "draining";

type CaughtEntry = { id: number };

type FlightEntry = {
  id: number;
  anchor: Point;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

/** The dot itself — reused by the drifting, flying, and caught renderings. */
function SparkDot({ size = SPARK_SIZE }: { size?: number }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="block rounded-full"
      style={{
        width: size,
        height: size,
        background: SPARK_FILL,
        boxShadow: SPARK_GLOW,
      }}
    />
  );
}

type DriftSparkProps = {
  index: number;
  slot: SparkSlot;
  x: MotionValue<number>;
  y: MotionValue<number>;
  motionSafe: boolean;
  onCatch: (index: number) => void;
};

/**
 * One drift slot's real button, seated at its fixed anchor. The loop itself
 * is driven imperatively by the parent (so a catch can read the live
 * position); this component only binds the resulting `x`/`y` motion values
 * to its transform.
 */
function DriftSpark({
  index,
  slot,
  x,
  y,
  motionSafe,
  onCatch,
}: DriftSparkProps): React.JSX.Element {
  return (
    <motion.button
      type="button"
      aria-label="Catch a spark"
      onClick={() => onCatch(index)}
      whileTap={motionSafe ? { scale: 0.8 } : undefined}
      transition={springs.flick}
      className="absolute cursor-pointer touch-manipulation rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/60"
      style={{
        left: slot.anchor.left,
        top: slot.anchor.top,
        marginLeft: -HIT_SIZE / 2,
        marginTop: -HIT_SIZE / 2,
        width: HIT_SIZE,
        height: HIT_SIZE,
        x,
        y,
      }}
    >
      <span className="flex size-full items-center justify-center">
        <SparkDot />
      </span>
    </motion.button>
  );
}

/**
 * A caught spark's quick trip from wherever it was drifting to the jar
 * mouth: one authored tween carrying x, y, scale, and opacity together, so
 * it visibly shrinks in as it arrives.
 */
function CatchFlight({
  entry,
  onArrive,
}: {
  entry: FlightEntry;
  onArrive: (id: number) => void;
}): React.JSX.Element {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: entry.anchor.left,
        top: entry.anchor.top,
        marginLeft: -SPARK_SIZE / 2,
        marginTop: -SPARK_SIZE / 2,
        width: SPARK_SIZE,
        height: SPARK_SIZE,
      }}
      initial={{ x: entry.fromX, y: entry.fromY, scale: 1, opacity: 1 }}
      animate={{ x: entry.toX, y: entry.toY, scale: 0.35, opacity: 0.9 }}
      transition={{ duration: CATCH_FLIGHT_S, ease: easings.move }}
      onAnimationComplete={() => onArrive(entry.id)}
    >
      <SparkDot />
    </motion.span>
  );
}

/**
 * One settled spark inside the glass: pops into its fixed cluster seat and
 * bobs on a slow loop with a per-index phase offset. Its `exit` variant —
 * only ever played when the jar drains — fans it out to a fixed angle and
 * reach computed from its own index against the full jar's count, staggered
 * by `cascade`.
 */
function CaughtSpark({
  index,
  total,
  motionSafe,
}: {
  index: number;
  total: number;
  motionSafe: boolean;
}): React.JSX.Element {
  const slot = JAR_SLOTS[index] ??
    JAR_SLOTS[0] ?? { x: JAR_BODY_CENTER_X, y: JAR_BODY_BASE_Y };
  const bobDelay = (index * 0.37) % BOB_S;

  const n = Math.max(total, 1);
  const angle = -170 + (n <= 1 ? 80 : (index / (n - 1)) * 160);
  const rad = (angle * Math.PI) / 180;
  const reach = 74 + (index % 3) * 14;
  const exitDx = Math.cos(rad) * reach;
  const exitDy = Math.sin(rad) * reach;
  const exitDelay = index * cascade(n);

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: slot.x,
        top: slot.y,
        marginLeft: -CAUGHT_SIZE / 2,
        marginTop: -CAUGHT_SIZE / 2,
        width: CAUGHT_SIZE,
        height: CAUGHT_SIZE,
      }}
      initial={
        motionSafe ? { opacity: 0, scale: 0.4 } : { opacity: 1, scale: 1 }
      }
      animate={
        motionSafe
          ? { opacity: 1, scale: 1, y: [0, -3, 0] }
          : { opacity: 1, scale: 1 }
      }
      exit={
        motionSafe
          ? {
              x: exitDx,
              y: exitDy,
              opacity: 0,
              scale: 0.5,
              transition: {
                duration: DRAIN_FLIGHT_S,
                ease: easings.exit,
                delay: exitDelay,
              },
            }
          : { opacity: 0, transition: { duration: 0 } }
      }
      transition={
        motionSafe
          ? {
              opacity: { duration: durations.fast, ease: easings.enter },
              scale: springs.flick,
              y: {
                duration: BOB_S,
                times: [0, 0.5, 1],
                repeat: Infinity,
                ease: "easeInOut",
                delay: bobDelay,
              },
            }
          : { duration: 0 }
      }
    >
      <SparkDot size={CAUGHT_SIZE} />
    </motion.span>
  );
}

export type SparkJarProps = {
  /** How many caught sparks fill the jar before it resets. Clamped 4-16. @default 10 */
  capacity?: number;
  /** Fires once each time the jar reaches capacity. */
  onFull?: () => void;
  className?: string;
};

/**
 * A jar you fill by hand, one firefly at a time. Five sparks drift the
 * stage on their own multi-keyframe tween loops — hand-set x/y waypoints,
 * each on a distinct phase delay so the field never lines up. Every spark
 * is a real button: catch one and it breaks from its path, flies to the jar
 * mouth on a quick 0.45s tween, and shrinks in to settle among the others,
 * bobbing gently on its own loop while the inner glow of the jar brightens
 * a step. The caught slot respawns at its drift start after a beat, so the
 * sky is never empty. Fill the jar to `capacity` and the lid taps shut with
 * a spring hop, the whole jar blooms warm, and a mono caption flashes "jar
 * full." — after about 2.4s the lid opens, every caught spark streams back
 * out on a staggered exit, and the count resets to zero so the toy just
 * keeps going.
 * Reduced motion: sparks sit at their fixed drift positions with no loop, a
 * catch moves the spark into the jar instantly with no flight or bobbing,
 * and the full-jar bloom appears as a static state before the instant
 * reset.
 */
export function SparkJar({
  capacity: capacityProp = 10,
  onFull,
  className,
}: SparkJarProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const capacity = Math.min(
    CAPACITY_MAX,
    Math.max(CAPACITY_MIN, Math.round(capacityProp)),
  );

  const [slotActive, setSlotActive] = React.useState<boolean[]>([
    true,
    true,
    true,
    true,
    true,
  ]);
  const [flights, setFlights] = React.useState<FlightEntry[]>([]);
  const [caughtSparks, setCaughtSparks] = React.useState<CaughtEntry[]>([]);
  const [phase, setPhase] = React.useState<Phase>("idle");

  // Fixed hook count: exactly five drift slots, never derived from props.
  const x0 = useMotionValue(0);
  const y0 = useMotionValue(0);
  const x1 = useMotionValue(0);
  const y1 = useMotionValue(0);
  const x2 = useMotionValue(0);
  const y2 = useMotionValue(0);
  const x3 = useMotionValue(0);
  const y3 = useMotionValue(0);
  const x4 = useMotionValue(0);
  const y4 = useMotionValue(0);
  const xValues = [x0, x1, x2, x3, x4] as const;
  const yValues = [y0, y1, y2, y3, y4] as const;

  const lidY = useMotionValue(0);
  const bloomOpacity = useMotionValue(0);
  const glowOpacity = useMotionValue(0);

  const xControls = React.useRef<Array<ReturnType<typeof animate> | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const yControls = React.useRef<Array<ReturnType<typeof animate> | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const lidAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const bloomAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const glowAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const respawnTimers = React.useRef<Array<number | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const fullTimer = React.useRef<number | null>(null);
  const drainTimer = React.useRef<number | null>(null);

  const flightIdRef = React.useRef(0);
  const catchIdRef = React.useRef(0);
  const caughtCountRef = React.useRef(0);

  // Latest-ref mirrors so timers scheduled ahead of time never act on a
  // stale prop or preference.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const capacityRef = React.useRef(capacity);
  React.useEffect(() => {
    capacityRef.current = capacity;
  }, [capacity]);
  const onFullRef = React.useRef(onFull);
  React.useEffect(() => {
    onFullRef.current = onFull;
  }, [onFull]);

  /** (Re)starts one slot's round-trip loop from its drift start. */
  const startDrift = (i: number) => {
    const slot = SPARK_SLOTS[i];
    const xmv = xValues[i];
    const ymv = yValues[i];
    if (!slot || !xmv || !ymv) return;
    xControls.current[i]?.stop();
    yControls.current[i]?.stop();
    xmv.jump(0);
    ymv.jump(0);
    if (!motionSafeRef.current) return; // Reduced motion: sit at the anchor.
    xControls.current[i] = animate(xmv, [...slot.path.x], {
      duration: slot.duration,
      times: [...slot.times],
      repeat: Infinity,
      ease: "easeInOut",
      delay: slot.delay,
    });
    yControls.current[i] = animate(ymv, [...slot.path.y], {
      duration: slot.duration,
      times: [...slot.times],
      repeat: Infinity,
      ease: "easeInOut",
      delay: slot.delay,
    });
  };

  React.useEffect(() => {
    for (let i = 0; i < SPARK_SLOTS.length; i += 1) startDrift(i);
    // Alias the arrays themselves, not their contents: the slots are mutated
    // in place as drifts restart, so cleanup still sees whatever is in flight.
    const xs = xControls.current;
    const ys = yControls.current;
    const respawns = respawnTimers.current;
    return () => {
      for (let i = 0; i < SPARK_SLOTS.length; i += 1) {
        xs[i]?.stop();
        ys[i]?.stop();
      }
      for (const timer of respawns) {
        if (timer !== null) window.clearTimeout(timer);
      }
      if (fullTimer.current !== null) window.clearTimeout(fullTimer.current);
      if (drainTimer.current !== null) window.clearTimeout(drainTimer.current);
      lidAnim.current?.stop();
      bloomAnim.current?.stop();
      glowAnim.current?.stop();
    };
  }, []);

  const stepGlow = (count: number) => {
    glowAnim.current?.stop();
    const value = Math.min(count / capacityRef.current, 1) * GLOW_MAX;
    if (!motionSafeRef.current) {
      glowOpacity.jump(value);
      return;
    }
    glowAnim.current = animate(glowOpacity, value, {
      duration: durations.base,
      ease: easings.enter,
    });
  };

  const finishDrain = () => {
    caughtCountRef.current = 0;
    setCaughtSparks([]);
    setPhase("idle");
    if (motionSafeRef.current) {
      lidAnim.current?.stop();
      lidAnim.current = animate(lidY, 0, springs.snap);
    } else {
      lidY.jump(0);
    }
    glowOpacity.jump(0);
    bloomOpacity.jump(0);
  };

  const beginDrain = () => {
    setPhase("draining");
    const n = caughtCountRef.current;
    const step = cascade(Math.max(n, 1));

    if (motionSafeRef.current) {
      lidAnim.current?.stop();
      lidAnim.current = animate(lidY, LID_OPEN_Y, springs.snap);
      bloomAnim.current?.stop();
      bloomAnim.current = animate(bloomOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
      });
      glowAnim.current?.stop();
      glowAnim.current = animate(glowOpacity, 0, {
        duration: durations.slow,
        ease: easings.exit,
      });
    } else {
      bloomOpacity.jump(0);
      glowOpacity.jump(0);
    }

    setCaughtSparks([]); // AnimatePresence plays each spark's own exit.

    const drainMs = motionSafeRef.current
      ? Math.max(n - 1, 0) * step * 1000 + DRAIN_FLIGHT_S * 1000 + 150
      : 0;
    drainTimer.current = window.setTimeout(() => {
      drainTimer.current = null;
      finishDrain();
    }, drainMs);
  };

  const beginFull = () => {
    setPhase("full");
    onFullRef.current?.();

    if (motionSafeRef.current) {
      lidY.jump(LID_HOP_Y);
      lidAnim.current?.stop();
      lidAnim.current = animate(lidY, 0, springs.flick);
      bloomAnim.current?.stop();
      bloomOpacity.jump(0);
      bloomAnim.current = animate(bloomOpacity, 1, {
        duration: durations.slow,
        ease: easings.enter,
      });
    } else {
      bloomOpacity.jump(1);
    }

    fullTimer.current = window.setTimeout(() => {
      fullTimer.current = null;
      beginDrain();
    }, FULL_HOLD_MS);
  };

  const settleCatch = () => {
    // Several flights can land in the same tick right at the threshold —
    // state has not re-rendered between them, so the count itself (synchronous,
    // ref-backed) is what guards against overshooting capacity twice.
    if (caughtCountRef.current >= capacityRef.current) return;
    const id = catchIdRef.current;
    catchIdRef.current += 1;
    const nextCount = caughtCountRef.current + 1;
    caughtCountRef.current = nextCount;
    setCaughtSparks((prev) => [...prev, { id }]);
    stepGlow(nextCount);
    if (nextCount >= capacityRef.current) {
      beginFull();
    }
  };

  const handleArrive = (flightId: number) => {
    setFlights((prev) => prev.filter((f) => f.id !== flightId));
    settleCatch();
  };

  const handleCatch = (i: number) => {
    if (phase !== "idle") return; // Jar is full or draining — hands off.
    if (!(slotActive[i] ?? true)) return;
    const slot = SPARK_SLOTS[i];
    const target = FLIGHT_TARGETS[i];
    const xmv = xValues[i];
    const ymv = yValues[i];
    if (!slot || !target || !xmv || !ymv) return;

    setSlotActive((prev) => prev.map((v, idx) => (idx === i ? false : v)));

    const timers = respawnTimers.current;
    const existing = timers[i] ?? null;
    if (existing !== null) window.clearTimeout(existing);
    timers[i] = window.setTimeout(() => {
      timers[i] = null;
      startDrift(i);
      setSlotActive((prev) => prev.map((v, idx) => (idx === i ? true : v)));
    }, RESPAWN_BEAT_MS);

    if (!motionSafeRef.current) {
      xmv.jump(0);
      ymv.jump(0);
      settleCatch();
      return;
    }

    xControls.current[i]?.stop();
    yControls.current[i]?.stop();
    const fromX = xmv.get();
    const fromY = ymv.get();

    const id = flightIdRef.current;
    flightIdRef.current += 1;
    setFlights((prev) => [
      ...prev,
      { id, anchor: slot.anchor, fromX, fromY, toX: target.dx, toY: target.dy },
    ]);
  };

  const captionKey = phase === "idle" ? "count" : "full";
  const captionText =
    phase === "idle"
      ? `${caughtSparks.length} of ${capacity} caught`
      : "jar full.";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <div
        className="relative overflow-hidden rounded-4 border border-hairline bg-surface-2"
        style={{ width: STAGE_W, height: STAGE_H, boxShadow: VIGNETTE_SHADOW }}
      >
        {SPARK_SLOTS.map((slot, i) => {
          const xmv = xValues[i];
          const ymv = yValues[i];
          const isActive = slotActive[i] ?? true;
          if (!isActive || !xmv || !ymv) return null;
          return (
            <DriftSpark
              key={i}
              index={i}
              slot={slot}
              x={xmv}
              y={ymv}
              motionSafe={motionSafe}
              onCatch={handleCatch}
            />
          );
        })}

        <div
          aria-hidden
          className="absolute"
          style={{
            left: JAR_WRAPPER_LEFT,
            top: JAR_TOP,
            width: LID_W,
            height: JAR_TOTAL_H,
          }}
        >
          <motion.span
            className="pointer-events-none absolute -inset-6 rounded-full blur-xl"
            style={{ background: BLOOM_BG, opacity: bloomOpacity }}
          />

          <div
            className="absolute overflow-hidden rounded-t-1 rounded-b-3 border border-hairline-strong bg-surface-1/40"
            style={{
              left: (LID_W - JAR_W) / 2,
              top: LID_H,
              width: JAR_W,
              height: JAR_BODY_H,
              boxShadow:
                "inset 0 1px 0 var(--hairline-strong), inset 0 -12px 18px -10px oklch(0.1 0.02 258 / 0.5)",
            }}
          >
            <motion.span
              className="pointer-events-none absolute inset-0"
              style={{ background: GLOW_BG, opacity: glowOpacity }}
            />
            <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-ink-2/50" />
          </div>

          <div className="pointer-events-none absolute inset-0">
            <AnimatePresence>
              {caughtSparks.map((entry, i) => (
                <CaughtSpark
                  key={entry.id}
                  index={i}
                  total={caughtSparks.length}
                  motionSafe={motionSafe}
                />
              ))}
            </AnimatePresence>
          </div>

          <motion.div
            className="absolute top-0 left-0 rounded-2 border border-hairline-strong bg-surface-1 shadow-raised"
            style={{ width: LID_W, height: LID_H, y: lidY }}
          />
        </div>

        {flights.map((f) => (
          <CatchFlight key={f.id} entry={f} onArrive={handleArrive} />
        ))}
      </div>

      <span
        aria-live="polite"
        className="flex h-4 items-center overflow-hidden font-mono text-xs text-ink-3 tabular-nums"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionKey}
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
    </div>
  );
}
