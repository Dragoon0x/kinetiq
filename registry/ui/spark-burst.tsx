"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const RAY_BOUNDS = { min: 4, max: 24 } as const;
/** Dot sparks fly a touch past the rays; count is fixed for a calibrated read. */
const DOT_COUNT = 4;

const clampRays = (count: number): number =>
  Math.max(RAY_BOUNDS.min, Math.min(RAY_BOUNDS.max, Math.round(count)));

/**
 * djb2 over the burst id and a lane index — the only entropy in the piece.
 * Deterministic in, deterministic out: no Math.random, so SSR and client
 * agree and replays are identical. Returns a positive 32-bit integer.
 */
const djb2 = (id: number, lane: number): number => {
  let hash = 5381;
  const seed = `${id}:${lane}`;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33) ^ seed.charCodeAt(index);
  }
  return hash >>> 0;
};

/** Maps a hash into [-0.5, 0.5) — signed jitter, stable per (id, lane). */
const signedUnit = (id: number, lane: number): number =>
  (djb2(id, lane) % 1000) / 1000 - 0.5;

type Burst = {
  id: number;
  rays: number;
};

export type SparkBurstHandle = {
  /** Emit one burst. `rays` overrides the default for this shot only. */
  fire: (opts?: { rays?: number }) => void;
};

export type SparkBurstProps = {
  /** Default ray count; clamped to [4, 24]. Default 12. */
  rays?: number;
  /** Ray/spark/ring color. Default the mint `--signal` token. */
  color?: string;
  /** Distance in px the rays travel from center. Default 40. */
  spread?: number;
  className?: string;
};

/**
 * A single burst laid out around the center: N hairline rays on an even
 * 360/N division (with a small deterministic angle + length jitter), a few
 * dot sparks thrown a bit past them, and one fast expanding ring. Rays draw
 * from length 0 outward on `glide` while fading on `exit`; the whole group
 * unmounts via its parent's AnimatePresence once the slowest tween ends.
 */
function BurstRays({
  burst,
  color,
  spread,
}: {
  burst: Burst;
  color: string;
  spread: number;
}) {
  const rays = React.useMemo(() => {
    const step = 360 / burst.rays;
    return Array.from({ length: burst.rays }, (_, index) => {
      // ±0.4 step of angular jitter keeps the ring readable but un-mechanical.
      const angle = step * index + signedUnit(burst.id, index) * step * 0.4;
      // Length varies ±18% so the rim breathes instead of stamping a circle.
      const length = spread * (1 + signedUnit(burst.id, index + 101) * 0.36);
      return { angle, length, key: index };
    });
  }, [burst.id, burst.rays, spread]);

  const dots = React.useMemo(() => {
    const step = 360 / DOT_COUNT;
    return Array.from({ length: DOT_COUNT }, (_, index) => {
      const angle =
        step * index +
        45 +
        signedUnit(burst.id, index + 211) * step * 0.5;
      // Dots overshoot the rays by 12–28%.
      const distance = spread * (1.12 + Math.abs(signedUnit(burst.id, index + 307)) * 0.32);
      return { angle, distance, key: index };
    });
  }, [burst.id, spread]);

  return (
    <>
      {/* Expanding hairline ring — scales to just past the rays, fading out. */}
      <motion.span
        aria-hidden
        className="absolute rounded-full border"
        style={{
          width: spread * 0.9,
          height: spread * 0.9,
          borderColor: color,
        }}
        initial={{ scale: 0.2, opacity: 0.9 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{
          scale: springs.glide,
          opacity: { duration: durations.base, ease: easings.exit },
        }}
      />

      {rays.map((ray) => (
        <motion.span
          key={ray.key}
          aria-hidden
          className="absolute origin-left"
          style={{
            height: 1,
            borderRadius: 1,
            background: color,
            rotate: `${ray.angle}deg`,
          }}
          initial={{ width: 0, opacity: 0.95, x: 0 }}
          animate={{ width: ray.length, opacity: 0, x: ray.length * 0.35 }}
          transition={{
            width: springs.glide,
            x: springs.glide,
            opacity: { duration: durations.base, ease: easings.exit },
          }}
        />
      ))}

      {dots.map((dot) => {
        const radians = (dot.angle * Math.PI) / 180;
        return (
          <motion.span
            key={`dot-${dot.key}`}
            aria-hidden
            className="absolute rounded-full"
            style={{ width: 2.5, height: 2.5, background: color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(radians) * dot.distance,
              y: Math.sin(radians) * dot.distance,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{
              x: springs.glide,
              y: springs.glide,
              opacity: { duration: durations.slow, ease: easings.exit },
              scale: { duration: durations.slow, ease: easings.exit },
            }}
          />
        );
      })}
    </>
  );
}

/** Reduced-motion feedback: one centered dot + ring, a brief opacity flash. */
function BurstPulse({ color, spread }: { color: string; spread: number }) {
  return (
    <>
      <motion.span
        aria-hidden
        className="absolute rounded-full border"
        style={{ width: spread * 0.5, height: spread * 0.5, borderColor: color }}
        initial={{ opacity: 0.7, scale: 0.9 }}
        animate={{ opacity: 0 }}
        transition={{ duration: durations.fast, ease: easings.exit }}
      />
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{ width: 4, height: 4, background: color }}
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 0 }}
        transition={{ duration: durations.fast, ease: easings.exit }}
      />
    </>
  );
}

/**
 * A calibrated celebration — not confetti. Call the imperative `fire()` and a
 * tight radial burst of hairline rays (plus a few dot sparks and one fast
 * expanding ring) shoots from the center and fades on glide/exit timing.
 * Each `fire()` pushes an independent burst so rapid taps stack; every burst
 * cleans itself up via AnimatePresence once its animation settles. The box is
 * `pointer-events-none`, so a SparkBurst layered over a button never eats the
 * click. Reduced motion swaps the rays for a single centered pulse. Nothing
 * renders until the first fire.
 */
export const SparkBurst = React.forwardRef<SparkBurstHandle, SparkBurstProps>(
  function SparkBurst(
    { rays = 12, color = "var(--signal)", spread = 40, className },
    ref,
  ) {
    const motionSafe = useMotionSafe();
    const [bursts, setBursts] = React.useState<Burst[]>([]);
    // Monotonic id source — deterministic, never Date.now(). Not read in render.
    const nextId = React.useRef(0);

    const defaultRays = clampRays(rays);

    // Timers that retire settled bursts from state; cleared on unmount so no
    // setState fires after teardown.
    const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>());
    React.useEffect(() => {
      const pending = timers.current;
      return () => {
        pending.forEach((timer) => clearTimeout(timer));
        pending.clear();
      };
    }, []);

    const fire = React.useCallback(
      (opts?: { rays?: number }) => {
        const id = nextId.current;
        nextId.current += 1;
        const count =
          opts?.rays === undefined ? defaultRays : clampRays(opts.rays);
        setBursts((current) => [...current, { id, rays: count }]);

        // AnimatePresence has no exit here (the burst fades in place), so we
        // retire each descriptor on a timer past its slowest tween (~900ms).
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          setBursts((current) => current.filter((burst) => burst.id !== id));
        }, 1000);
        timers.current.add(timer);
      },
      [defaultRays],
    );

    React.useImperativeHandle(ref, () => ({ fire }), [fire]);

    return (
      <span
        aria-hidden
        className={cn(
          "pointer-events-none relative inline-block",
          className,
        )}
        style={{ width: spread * 2, height: spread * 2 }}
      >
        {/* Every burst is centered on this point; children position by transform. */}
        <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <AnimatePresence>
            {bursts.map((burst) => (
              <span
                key={burst.id}
                className="absolute top-0 left-0 flex items-center justify-center"
              >
                {motionSafe ? (
                  <BurstRays burst={burst} color={color} spread={spread} />
                ) : (
                  <BurstPulse color={color} spread={spread} />
                )}
              </span>
            ))}
          </AnimatePresence>
        </span>
      </span>
    );
  },
);
