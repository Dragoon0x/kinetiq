"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage box, in px — room for the glow halo behind the gem. */
const STAGE = 208;
/** Glow halo diameter, px — a heavily blurred disc centered behind the gem. */
const GLOW_SIZE = 172;
/** Gem SVG render size, px. */
const GEM_SIZE = 132;
/** Gem radius in local SVG units (the viewBox is authored around this). */
const GEM_R = 80;
/** Padding around the facet fan so stroke edges never clip. */
const VIEW_PAD = 8;
const VIEW_HALF = GEM_R + VIEW_PAD;

/** Facets, hub to rim — 7 wedges sharing the center vertex (6–8 is the range). */
const FACET_COUNT = 7;
/** Per-vertex radius ratio, rim to rim — an irregular cut, not a perfect ring. */
const FACET_RADII = [1, 0.84, 0.97, 0.8, 1, 0.88, 0.82] as const;
/** Per-facet light/shadow mix into the mood color — how a cut gem catches light. */
const FACET_TINT: readonly { with: "white" | "black"; pct: number }[] = [
  { with: "white", pct: 34 },
  { with: "black", pct: 24 },
  { with: "white", pct: 10 },
  { with: "black", pct: 38 },
  { with: "white", pct: 4 },
  { with: "black", pct: 16 },
  { with: "white", pct: 26 },
];

type Vertex = { x: number; y: number };

/** Vertex ring: fixed angle step, per-vertex radius from FACET_RADII — deterministic, no Math.random. */
const buildVertices = (): Vertex[] => {
  const vertices: Vertex[] = [];
  for (let i = 0; i < FACET_COUNT; i++) {
    const angleDeg = (360 / FACET_COUNT) * i - 90;
    const angle = (angleDeg * Math.PI) / 180;
    const radius = GEM_R * (FACET_RADII[i] ?? 1);
    vertices.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return vertices;
};

const buildFacetPaths = (vertices: Vertex[]): string[] => {
  const paths: string[] = [];
  for (let i = 0; i < FACET_COUNT; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % FACET_COUNT];
    if (!a || !b) continue;
    paths.push(
      `M 0 0 L ${a.x.toFixed(2)} ${a.y.toFixed(2)} L ${b.x.toFixed(2)} ${b.y.toFixed(2)} Z`,
    );
  }
  return paths;
};

const VERTICES = buildVertices();
const FACET_PATHS = buildFacetPaths(VERTICES);

const facetFill = (index: number, moodColor: string): string => {
  const tint = FACET_TINT[index] ?? { with: "white" as const, pct: 20 };
  return `color-mix(in oklab, ${moodColor} ${100 - tint.pct}%, ${tint.with})`;
};

const easeCss = (curve: readonly number[]): string =>
  `cubic-bezier(${curve.join(",")})`;

type MoodName = "restless" | "calm" | "content" | "still";

type MoodDef = { name: MoodName; color: string; glow: number };

/** The fixed mood set — color pulled straight from tokens, per the spec. */
const MOODS: Record<MoodName, MoodDef> = {
  restless: { name: "restless", color: "var(--warning, #b45309)", glow: 0.95 },
  calm: { name: "calm", color: "var(--primary)", glow: 0.6 },
  content: { name: "content", color: "var(--success, #047857)", glow: 0.78 },
  still: { name: "still", color: "var(--ink-2)", glow: 0.4 },
};

/** One very slow ambient turn — the facets catch differently over time. */
const ROTATE_PERIOD_S = 24;
/** Facet + glow recolor tween length, seconds. */
const RECOLOR_S = 0.5;
/** How long a click "sets" the mood, holding it against movement, ms. */
const HOLD_MS = 3000;
/** How long the click's ring flash stays mounted, ms. */
const FLASH_MS = 500;

/** Dwell tick period, ms — the only clock dwell advances on (never Date.now). */
const TICK_MS = 300;
/** Ticks of low movement before dwell reads as "content" (~2.4s). */
const CONTENT_TICKS = 8;
/** Pointer speed, px/s, above which movement reads as "restless". */
const FAST_PX_S = 640;
/** Below this speed a move is "slow" and doesn't interrupt a dwell streak. */
const SLOW_PX_S = 120;
/** Per-tick decay applied to tracked speed when no fresh move lands. */
const SPEED_DECAY = 0.55;
/** Pointer samples further apart than this restart the speed estimate (s). */
const MAX_SAMPLE_GAP_S = 0.25;

export type MoodGemProps = {
  /** Fires whenever the derived mood actually changes. */
  onMood?: (mood: string) => void;
  className?: string;
};

/**
 * A faceted gem, card-mounted, that takes on a mood from how you move the
 * pointer over it. A scoped pointermove handler writes speed to a motion
 * value and a dwell counter advances on its own timer — never per-move
 * state — and the two combine into one of four fixed moods: fast movement
 * reads "restless", slow movement reads "calm", a long dwell with little
 * movement settles into "content", and no pointer at all is "still". A mood
 * change recolors the seven facets on a short tween, gives the gem a small
 * `flick` pulse, and resizes its glow on `glide`; independently, the gem
 * turns a slow ambient loop, one revolution every 24s, so the facets keep
 * catching light differently. Clicking the gem sets the current mood — a
 * bright ring flashes and the caption gains a period — and holds it for
 * about three seconds before movement can change it again.
 * Reduced motion: no rotation loop and no pulse; mood changes swap facet
 * colors instantly instead of tweening, and clicking still sets and holds
 * the mood, just without the ring flash.
 */
export function MoodGem({
  onMood,
  className,
}: MoodGemProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [bucket, setBucket] = React.useState<MoodName>("still");
  const [held, setHeld] = React.useState(false);
  const [flashId, setFlashId] = React.useState(0);
  const [flashVisible, setFlashVisible] = React.useState(false);

  const insideRef = React.useRef(false);
  const heldRef = React.useRef(false);
  const dwellTicksRef = React.useRef(0);
  const lastSampleRef = React.useRef<{
    x: number;
    y: number;
    t: number;
  } | null>(null);

  const tickTimer = React.useRef<number | null>(null);
  const holdTimer = React.useRef<number | null>(null);
  const flashTimer = React.useRef<number | null>(null);

  const onMoodRef = React.useRef(onMood);
  React.useEffect(() => {
    onMoodRef.current = onMood;
  });

  const speed = useMotionValue(0);
  const rotate = useMotionValue(0);
  const gemScale = useMotionValue(1);
  const glowScale = useMotionValue(MOODS.still.glow);

  /** What the bucket would be right now, from refs + the speed motion value only. */
  const deriveBucket = (): MoodName => {
    if (!insideRef.current) return "still";
    if (speed.get() > FAST_PX_S) return "restless";
    if (dwellTicksRef.current >= CONTENT_TICKS) return "content";
    return "calm";
  };

  /** The single funnel for bucket transitions — a no-op while a click holds the mood. */
  const applyBucket = (next: MoodName) => {
    if (heldRef.current) return;
    setBucket((current) => {
      if (current === next) return current;
      onMoodRef.current?.(next);
      return next;
    });
  };

  const clearTick = () => {
    if (tickTimer.current !== null) {
      window.clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  };

  const startTick = () => {
    clearTick();
    tickTimer.current = window.setInterval(() => {
      if (!insideRef.current) return;
      dwellTicksRef.current += 1;
      speed.set(speed.get() * SPEED_DECAY);
      applyBucket(deriveBucket());
    }, TICK_MS);
  };

  const handleEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    insideRef.current = true;
    dwellTicksRef.current = 0;
    speed.set(0);
    lastSampleRef.current = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    };
    startTick();
    applyBucket(deriveBucket());
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const last = lastSampleRef.current;
    lastSampleRef.current = {
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
    };
    if (last) {
      const dt = (event.timeStamp - last.t) / 1000;
      if (dt > 0 && dt <= MAX_SAMPLE_GAP_S) {
        const dist = Math.hypot(event.clientX - last.x, event.clientY - last.y);
        const v = dist / dt;
        speed.set(v);
        if (v > SLOW_PX_S) dwellTicksRef.current = 0;
      }
    }
    applyBucket(deriveBucket());
  };

  const handleLeave = () => {
    insideRef.current = false;
    clearTick();
    applyBucket("still");
  };

  const handleSet = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);

    heldRef.current = true;
    setHeld(true);
    setFlashId((id) => id + 1);
    setFlashVisible(true);

    flashTimer.current = window.setTimeout(() => {
      setFlashVisible(false);
    }, FLASH_MS);

    holdTimer.current = window.setTimeout(() => {
      heldRef.current = false;
      setHeld(false);
      applyBucket(deriveBucket());
    }, HOLD_MS);
  };

  // Mood change: facets recolor via CSS transition (below), the gem pulses on
  // `flick` (set-then-animate), and the glow resizes on `glide`. Reduced
  // motion skips both animations — the glow just jumps to its target.
  React.useEffect(() => {
    const target = MOODS[bucket].glow;
    if (!motionSafe) {
      glowScale.jump(target);
      return;
    }
    gemScale.set(0.94);
    const scaleControls = animate(gemScale, 1, springs.flick);
    const glowControls = animate(glowScale, target, springs.glide);
    return () => {
      scaleControls.stop();
      glowControls.stop();
    };
  }, [bucket, motionSafe, gemScale, glowScale]);

  // Ambient rotation: a single linear tween looping forever. 360° lands back
  // on 0° visually, so the per-cycle reset is seamless. Reduced motion never
  // starts the loop at all.
  React.useEffect(() => {
    if (!motionSafe) {
      rotate.jump(0);
      return;
    }
    const controls = animate(rotate, 360, {
      duration: ROTATE_PERIOD_S,
      ease: easings.linear,
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [motionSafe, rotate]);

  // Clear every timer on unmount so nothing fires after teardown.
  React.useEffect(() => {
    return () => {
      if (tickTimer.current !== null) window.clearInterval(tickTimer.current);
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, []);

  const mood = MOODS[bucket];
  const caption = held ? `${mood.name}.` : mood.name;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-4 rounded-4 border border-hairline bg-card p-8",
        className,
      )}
      onPointerEnter={handleEnter}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="relative" style={{ width: STAGE, height: STAGE }}>
        {/* Glow halo — recolors on a CSS tween, resizes on a glide spring. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute rounded-full blur-2xl"
          style={{
            left: "50%",
            top: "50%",
            width: GLOW_SIZE,
            height: GLOW_SIZE,
            marginLeft: -GLOW_SIZE / 2,
            marginTop: -GLOW_SIZE / 2,
            backgroundColor: mood.color,
            opacity: 0.45,
            scale: glowScale,
            transition: motionSafe
              ? `background-color ${RECOLOR_S}s ${easeCss(easings.move)}`
              : "none",
          }}
        />

        {/* The gem — an HTML wrapper carries the rotation, never an SVG child. */}
        <motion.div
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: GEM_SIZE,
            height: GEM_SIZE,
            marginLeft: -GEM_SIZE / 2,
            marginTop: -GEM_SIZE / 2,
            rotate,
            scale: gemScale,
          }}
        >
          <button
            type="button"
            onClick={handleSet}
            aria-label={`Set the current mood, ${mood.name}`}
            className={cn(
              "relative block size-full cursor-pointer rounded-full outline-none select-none",
              "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            )}
          >
            <svg
              aria-hidden
              viewBox={`${-VIEW_HALF} ${-VIEW_HALF} ${VIEW_HALF * 2} ${VIEW_HALF * 2}`}
              width={GEM_SIZE}
              height={GEM_SIZE}
              className="block"
            >
              {FACET_PATHS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill={facetFill(i, mood.color)}
                  stroke="var(--card)"
                  strokeWidth={0.75}
                  style={{
                    transition: motionSafe
                      ? `fill ${RECOLOR_S}s ${easeCss(easings.move)}`
                      : "none",
                  }}
                />
              ))}
            </svg>

            {motionSafe && (
              <AnimatePresence>
                {flashVisible && (
                  <motion.span
                    key={flashId}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full"
                    style={{ border: `2px solid ${mood.color}` }}
                    initial={{ scale: 0.7, opacity: 0.95 }}
                    animate={{ scale: 1.45, opacity: 0 }}
                    exit={{
                      opacity: 0,
                      transition: {
                        duration: durations.fast,
                        ease: easings.exit,
                      },
                    }}
                    transition={{
                      duration: durations.slow,
                      ease: easings.move,
                    }}
                  />
                )}
              </AnimatePresence>
            )}
          </button>
        </motion.div>
      </div>

      <p
        aria-live="polite"
        className="min-h-[1em] font-mono text-[11px] tracking-[0.08em] text-ink-3"
      >
        {caption}
      </p>
    </div>
  );
}
