"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Sky panel footprint, px. */
const STAGE_W = 320;
const STAGE_H = 220;

/** Row rockets appear to leave from — near the top of the skyline band. */
const LAUNCH_Y = STAGE_H - 40;

/** Clamp bounds so every burst, rocket start included, stays on the card. */
const MARGIN_X = 40;
const MIN_APEX_Y = 26;
const MAX_APEX_Y = LAUNCH_Y - 40;

/** At most this many fireworks stay aloft; further clicks are ignored. */
const MAX_CONCURRENT = 3;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Moonless-night gradient stops shared with the kit's day/night scenery, so
 *  the card reads as night regardless of the app's light/dark theme. */
const SKY_BACKGROUND =
  "linear-gradient(to bottom, oklch(0.13 0.03 265) 0%, oklch(0.18 0.045 280) 100%)";

/** Skyline silhouette — darker than the sky it sits against. */
const SKYLINE_FILL = "oklch(0.08 0.02 265)";

/** Fixed faint stars: position and size only, never randomized. */
const STARS = [
  { left: 24, top: 20, size: 2 },
  { left: 60, top: 46, size: 1.5 },
  { left: 100, top: 16, size: 1.5 },
  { left: 140, top: 60, size: 2 },
  { left: 180, top: 24, size: 1.5 },
  { left: 220, top: 50, size: 2 },
  { left: 250, top: 18, size: 1.5 },
  { left: 284, top: 40, size: 2 },
  { left: 40, top: 90, size: 1.5 },
  { left: 300, top: 84, size: 1.5 },
] as const;

/** Skyline: simple rectangles of varied height, left edge to right edge. */
const SKYLINE = [
  { left: 0, width: 26, height: 22 },
  { left: 26, width: 20, height: 34 },
  { left: 46, width: 30, height: 18 },
  { left: 76, width: 22, height: 40 },
  { left: 98, width: 26, height: 26 },
  { left: 124, width: 18, height: 46 },
  { left: 142, width: 34, height: 20 },
  { left: 176, width: 24, height: 36 },
  { left: 200, width: 20, height: 24 },
  { left: 220, width: 30, height: 44 },
  { left: 250, width: 22, height: 20 },
  { left: 272, width: 26, height: 32 },
  { left: 298, width: 22, height: 22 },
] as const;

/** Four fixed launch spots, cycled in order by Enter/Space. */
const KEYBOARD_LAUNCHES = [
  { x: 70, y: 60 },
  { x: 160, y: 100 },
  { x: 250, y: 50 },
  { x: 110, y: 130 },
] as const;

/** Palette cycle — each firework takes the next color, so consecutive
 *  bursts never repeat back to back. */
const PALETTE = [
  "var(--primary)",
  "var(--success, #047857)",
  "var(--warning, #b45309)",
  "oklch(0.95 0.01 90)",
] as const;

const paletteColorFor = (index: number): string =>
  PALETTE[index % PALETTE.length] ?? PALETTE[0] ?? "var(--primary)";

/** Twelve radial vectors: angle = index/count * 2π, a fixed base radius plus
 *  a small per-index variation from a fixed table. Computed once at module
 *  load from that formula — never re-derived, never random. */
const SPARK_COUNT = 12;
const BASE_RADIUS = 60;
const RADIUS_VARIATION = [0, 8, -6, 10, -8, 5, -10, 6, -4, 9, -7, 3] as const;
const GRAVITY_DROOP = 22;

const SPARK_TABLE = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * Math.PI * 2;
  const radius = BASE_RADIUS + (RADIUS_VARIATION[i] ?? 0);
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
});

const SPARK_TIMES = [0, 0.35, 0.7, 1] as const;
const BRIGHTEN_TIMES = [0, 0.4, 1] as const;

/** Timing, seconds. The rocket reuses the shared "page" bucket since it
 *  lands on the same ~0.7s beat; the bloom's arc is a bespoke choreography
 *  length authored for this component, well past the shared tween scale. */
const ROCKET_S = durations.page;
const BLOOM_S = 1.3;
const FLASH_S = durations.slow;
const BRIGHTEN_S = durations.slow;
const REDUCED_HOLD_MS = 550;

type FireworkPhase = "rocket" | "bloom";

type Firework = {
  readonly id: number;
  readonly x: number;
  readonly apexY: number;
  readonly paletteIndex: number;
  readonly phase: FireworkPhase;
};

/**
 * Renders one firework's rocket-or-bloom layer. A plain function, not a
 * component: it calls no hooks and only reads the entry's fixed fields plus
 * the module-level tables above, so it is safe to invoke from inside the
 * fireworks `.map()` below.
 */
function renderFirework(fw: Firework, motionSafe: boolean): React.JSX.Element {
  const color = paletteColorFor(fw.paletteIndex);
  const isRocket = fw.phase === "rocket";

  return (
    <motion.div
      key={fw.id}
      aria-hidden
      className="pointer-events-none absolute inset-0"
      initial={false}
      exit={{ opacity: 0 }}
      transition={{ duration: durations.fast, ease: easings.exit }}
    >
      {isRocket && motionSafe && (
        <motion.span
          className="absolute block"
          style={{ left: fw.x, top: LAUNCH_Y }}
          initial={{ y: 0 }}
          animate={{ y: fw.apexY - LAUNCH_Y }}
          transition={{ duration: ROCKET_S, ease: easings.exit }}
        >
          <span
            className="absolute block rounded-full"
            style={{
              width: 5,
              height: 5,
              marginLeft: -2.5,
              marginTop: -2.5,
              background: color,
            }}
          />
          <span
            className="absolute block"
            style={{
              width: 2,
              marginLeft: -1,
              top: 3,
              height: 16,
              background: `linear-gradient(to bottom, ${color}, transparent)`,
            }}
          />
        </motion.span>
      )}

      {!isRocket && (
        <>
          {motionSafe && (
            <motion.span
              className="absolute inset-0 block"
              style={{ background: "oklch(0.95 0.02 260)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.14, 0] }}
              transition={{
                duration: BRIGHTEN_S,
                times: [...BRIGHTEN_TIMES],
                ease: easings.move,
              }}
            />
          )}

          {motionSafe && (
            <motion.span
              className="absolute block rounded-full"
              style={{
                left: fw.x,
                top: fw.apexY,
                width: 18,
                height: 18,
                marginLeft: -9,
                marginTop: -9,
                border: `2px solid ${color}`,
              }}
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: FLASH_S, ease: easings.exit }}
            />
          )}

          {SPARK_TABLE.map((spark, i) => {
            const endX = spark.dx;
            const endY = spark.dy + GRAVITY_DROOP;
            return (
              <motion.span
                key={i}
                className="absolute block rounded-full"
                style={{
                  left: fw.x,
                  top: fw.apexY,
                  width: 5,
                  height: 5,
                  marginLeft: -2.5,
                  marginTop: -2.5,
                  background: color,
                }}
                initial={
                  motionSafe
                    ? { x: 0, y: 0, opacity: 1 }
                    : { x: endX, y: endY, opacity: 0.5 }
                }
                animate={
                  motionSafe
                    ? {
                        x: [0, spark.dx * 0.6, spark.dx, spark.dx],
                        y: [0, spark.dy * 0.5, spark.dy, endY],
                        opacity: [1, 1, 0.8, 0],
                      }
                    : { x: endX, y: endY, opacity: 0.5 }
                }
                transition={
                  motionSafe
                    ? {
                        x: {
                          duration: BLOOM_S,
                          times: [...SPARK_TIMES],
                          ease: easings.move,
                        },
                        y: {
                          duration: BLOOM_S,
                          times: [...SPARK_TIMES],
                          ease: easings.move,
                        },
                        opacity: {
                          duration: BLOOM_S,
                          times: [...SPARK_TIMES],
                          ease: easings.exit,
                        },
                      }
                    : { duration: 0 }
                }
              />
            );
          })}
        </>
      )}
    </motion.div>
  );
}

export type SkyBloomProps = {
  /** Fires with the running total each time a firework blooms. */
  onBloom?: (count: number) => void;
  className?: string;
};

/**
 * Fireworks you set off yourself in a small night sky: click anywhere on the
 * card and a rocket climbs from the skyline to that height on an authored
 * tween, then blooms into twelve sparks that fly out on fixed radial
 * vectors, arc under authored gravity, and fade at the tail, while a flash
 * ring marks the burst and the sky brightens for a beat. Palettes cycle in a
 * fixed order so consecutive fireworks read as different colors, launches
 * are clamped so every burst stays on the card, and at most three fireworks
 * stay aloft at once — further clicks are ignored until one clears. Enter
 * and Space set one off at the next of four fixed positions, and a mono
 * caption counts each one set off. Reduced motion: no rocket flight and no
 * arcs — a click paints the bloom instantly at the click position with its
 * sparks already at their dimmed end points, and it fades after a beat with
 * no flash ring and no sky brighten.
 */
export function SkyBloom({
  onBloom,
  className,
}: SkyBloomProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [fireworks, setFireworks] = React.useState<Firework[]>([]);
  const [count, setCount] = React.useState(0);

  const idCounter = React.useRef(0);
  const paletteCursor = React.useRef(0);
  const keyboardCursor = React.useRef(0);
  const countRef = React.useRef(0);
  const timerIds = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    const timers = timerIds.current;
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
  }, []);

  const runTimer = (fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      timerIds.current.delete(id);
      fn();
    }, delayMs);
    timerIds.current.add(id);
  };

  const launch = (rawX: number, rawY: number) => {
    if (fireworks.length >= MAX_CONCURRENT) return;

    const x = clamp(rawX, MARGIN_X, STAGE_W - MARGIN_X);
    const apexY = clamp(rawY, MIN_APEX_Y, MAX_APEX_Y);
    const id = idCounter.current;
    idCounter.current += 1;
    const paletteIndex = paletteCursor.current;
    paletteCursor.current += 1;

    const bloomNow = () => {
      countRef.current += 1;
      const next = countRef.current;
      setCount(next);
      onBloom?.(next);
      runTimer(
        () => {
          setFireworks((prev) => prev.filter((fw) => fw.id !== id));
        },
        motionSafe ? BLOOM_S * 1000 : REDUCED_HOLD_MS,
      );
    };

    if (motionSafe) {
      setFireworks((prev) => [
        ...prev,
        { id, x, apexY, paletteIndex, phase: "rocket" },
      ]);
      runTimer(() => {
        setFireworks((prev) =>
          prev.map((fw) => (fw.id === id ? { ...fw, phase: "bloom" } : fw)),
        );
        bloomNow();
      }, ROCKET_S * 1000);
    } else {
      setFireworks((prev) => [
        ...prev,
        { id, x, apexY, paletteIndex, phase: "bloom" },
      ]);
      bloomNow();
    }
  };

  const handleActivate = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Keyboard activation reports (0,0); cycle a fixed spot then instead.
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;
    if (fromKeyboard) {
      const cursor = keyboardCursor.current % KEYBOARD_LAUNCHES.length;
      keyboardCursor.current += 1;
      const spot = KEYBOARD_LAUNCHES[cursor] ??
        KEYBOARD_LAUNCHES[0] ?? { x: STAGE_W / 2, y: 80 };
      launch(spot.x, spot.y);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    launch(event.clientX - rect.left, event.clientY - rect.top);
  };

  const captionText = count === 0 ? "tap the sky" : `${count} set off`;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-3 rounded-3 border border-hairline bg-surface-0 p-6 shadow-raised",
        className,
      )}
    >
      <button
        type="button"
        aria-label="Set off a firework"
        onClick={handleActivate}
        className="relative block overflow-hidden rounded-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
        style={{ width: STAGE_W, height: STAGE_H, background: SKY_BACKGROUND }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-0">
          {STARS.map((star, i) => (
            <span
              key={i}
              className="absolute block rounded-full"
              style={{
                left: star.left,
                top: star.top,
                width: star.size,
                height: star.size,
                background: "oklch(0.95 0.01 260 / 0.65)",
              }}
            />
          ))}
          {SKYLINE.map((building, i) => (
            <span
              key={i}
              className="absolute bottom-0 block"
              style={{
                left: building.left,
                width: building.width,
                height: building.height,
                background: SKYLINE_FILL,
              }}
            />
          ))}
        </span>

        <AnimatePresence>
          {fireworks.map((fw) => renderFirework(fw, motionSafe))}
        </AnimatePresence>
      </button>

      <span
        aria-live="polite"
        className="text-label font-mono text-ink-3 normal-case"
      >
        {captionText}
      </span>
    </div>
  );
}
