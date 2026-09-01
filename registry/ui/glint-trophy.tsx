"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Stage geometry (px). */
const STAGE_W = 300;
const STAGE_H = 168;

/** Shelf plank — a line across the stage the trophies stand on. */
const SHELF_BOTTOM = 26;
const SHELF_THICKNESS = 10;

/** Trophy footprint — every silhouette shares this bounding box. */
const TROPHY_W = 44;
const TROPHY_H = 64;

/** Contact shadow under each trophy. */
const SHADOW_W = 34;
const SHADOW_H = 7;

/** Arrival — trophies start this far below rest and slide up on a spring.
 * `ARRIVE_SETTLE_S` is the rough settle time of springs.glide (see
 * registry/lib/motion.ts), used only to time the glint cycle's first tick. */
const ARRIVE_FROM_Y = 26;
const ARRIVE_SETTLE_S = 0.45;

/** Glint sweep — a skewed band crossing one trophy behind its own
 * overflow-hidden mask. Hidden left/right sit outside that mask. */
const GLINT_W = 16;
const GLINT_HIDDEN_LEFT = -(GLINT_W + 6);
const GLINT_VISIBLE_LEFT = TROPHY_W + 6;
const GLINT_SWEEP_DURATION = 0.6;
const GLINT_SWEEP_DURATION_MS = 600;
const GLINT_INTERVAL_MS = 3400;

/** Polish wiggle — a small decaying rotate tween, never a spring. */
const WIGGLE_KEYFRAMES = [0, -9, 7, -4, 2, 0] as const;
const WIGGLE_TIMES = [0, 0.2, 0.45, 0.68, 0.86, 1] as const;
const WIGGLE_DURATION = 0.4;
const WIGGLE_DURATION_MS = 400;

/** Sparkle flecks — four fixed vectors, never random. */
const SPARK_VECTORS: readonly { dx: number; dy: number }[] = [
  { dx: -16, dy: -14 },
  { dx: 16, dy: -14 },
  { dx: -13, dy: 13 },
  { dx: 13, dy: 13 },
] as const;
const SPARKLE_DURATION = 0.5;
const SPARKLE_DURATION_MS = 500;

/** Dust sweep — a wide wipe band crossing the whole stage. */
const DUST_BAND_W = 70;
const DUST_HIDDEN_LEFT = -(DUST_BAND_W + 20);
const DUST_VISIBLE_LEFT = STAGE_W + 20;
const DUST_DURATION = 0.55;
const DUST_DURATION_MS = 550;

/** Brightness earned per polish, in a color-mix percentage, capped at three. */
const MAX_POLISH = 3;
const BRIGHTEN_STEP_PCT = 8;

/** How long the reduced-motion flash holds before it clears. */
const FLASH_HOLD_MS = 260;

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

type TrophyShapeProps = { color: string };

/** Cup with two handles, on a stem and base. */
function CupShape({ color }: TrophyShapeProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 44 64"
      width={TROPHY_W}
      height={TROPHY_H}
      aria-hidden
      focusable="false"
    >
      <rect x="14" y="56" width="16" height="6" rx="1.5" fill={color} />
      <rect x="20" y="46" width="4" height="12" fill={color} />
      <path d="M10 18 H34 L30 40 Q22 46 14 40 Z" fill={color} />
      <path
        d="M10 22 Q2 22 2 30 Q2 38 10 36"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M34 22 Q42 22 42 30 Q42 38 34 36"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A five-point star raised on a plinth. */
function StarShape({ color }: TrophyShapeProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 44 64"
      width={TROPHY_W}
      height={TROPHY_H}
      aria-hidden
      focusable="false"
    >
      <rect x="10" y="52" width="24" height="8" rx="1.5" fill={color} />
      <rect x="16" y="44" width="12" height="10" fill={color} />
      <path
        d="M22 6 L26.5 20 L41 20 L29.5 28.5 L34 43 L22 34.5 L10 43 L14.5 28.5 L3 20 L17.5 20 Z"
        fill={color}
      />
    </svg>
  );
}

/** A small tapering obelisk on a base. */
function ObeliskShape({ color }: TrophyShapeProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 44 64"
      width={TROPHY_W}
      height={TROPHY_H}
      aria-hidden
      focusable="false"
    >
      <rect x="8" y="54" width="28" height="7" rx="1.5" fill={color} />
      <path d="M17 54 L17 16 L22 6 L27 16 L27 54 Z" fill={color} />
    </svg>
  );
}

/** Fixed ring of petal angles fanning the rosette bloom — trig, not randomness. */
const ROSETTE_PETAL_ANGLES: readonly number[] = [
  0, 45, 90, 135, 180, 225, 270, 315,
];

/** A ribbon rosette — a pleated bloom over two tails. */
function RosetteShape({ color }: TrophyShapeProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 44 64"
      width={TROPHY_W}
      height={TROPHY_H}
      aria-hidden
      focusable="false"
    >
      <path d="M16 32 L9 60 L20 51 Z" fill={color} />
      <path d="M28 32 L35 60 L24 51 Z" fill={color} />
      <g transform="translate(22 20)">
        {ROSETTE_PETAL_ANGLES.map((angle) => (
          <rect
            key={angle}
            x="-3"
            y="-15"
            width="6"
            height="15"
            rx="3"
            fill={color}
            transform={`rotate(${angle})`}
          />
        ))}
        <circle r="7" fill={color} />
      </g>
    </svg>
  );
}

type TrophyDef = {
  id: string;
  /** Lowercase noun used in the caption and passed to onPolish. */
  name: string;
  label: string;
  tint: string;
  Shape: (props: TrophyShapeProps) => React.JSX.Element;
};

/** Fixed shelf of four — order, names and tints never change at runtime. */
const TROPHIES: readonly TrophyDef[] = [
  {
    id: "cup",
    name: "cup",
    label: "Polish the cup",
    tint: "var(--warning, #b45309)",
    Shape: CupShape,
  },
  {
    id: "star",
    name: "star",
    label: "Polish the star",
    tint: "var(--primary)",
    Shape: StarShape,
  },
  {
    id: "obelisk",
    name: "obelisk",
    label: "Polish the obelisk",
    tint: "var(--success, #047857)",
    Shape: ObeliskShape,
  },
  {
    id: "rosette",
    name: "rosette",
    label: "Polish the rosette",
    tint: "var(--ink-2)",
    Shape: RosetteShape,
  },
] as const;

const TROPHY_COUNT = TROPHIES.length;
const ARRIVE_STEP = cascade(TROPHY_COUNT);

/** Blends a trophy's base tint toward white by a fixed step per polish, capped. */
function brightenTint(tint: string, polishCount: number): string {
  const pct = Math.min(polishCount, MAX_POLISH) * BRIGHTEN_STEP_PCT;
  if (pct <= 0) return tint;
  return `color-mix(in oklab, ${tint} ${100 - pct}%, white ${pct}%)`;
}

export type GlintTrophyProps = {
  /** Fires with the trophy's name (e.g. "cup") each time it is polished. */
  onPolish?: (name: string) => void;
  className?: string;
};

/** One live sweep at a time — index of the trophy it plays across, plus a
 * unique id so the same trophy can retrigger the sweep before it settles. */
type GlintState = { index: number; id: number } | null;

/**
 * A shelf of four trophies — cup, star, obelisk, rosette — that arrive one at
 * a time in a cascade(4) stagger and settle on a spring, each casting a thin
 * shadow as it lands. Left alone, the shelf stays alive on its own: every
 * 3.4 seconds one trophy, cycling in fixed order, catches a sheen sweep
 * behind its own overflow-hidden mask, never two at once. Clicking a trophy —
 * each is its own named button — polishes it: a quick wiggle, an immediate
 * sheen sweep, four sparkle flecks on fixed vectors, and a mono caption
 * naming what was polished, while the trophy itself gets a fixed step
 * brighter, permanently, capped after three polishes. "dust the shelf"
 * resets every trophy's shine with one wipe crossing the whole stage.
 * Reduced motion: trophies are simply present with no arrival slide and no
 * ambient glint cycle; a click swaps in a static highlight for a beat in
 * place of the wiggle and sweep, still brightens the trophy, and the dust
 * wipe is instant.
 */
export function GlintTrophy({
  onPolish,
  className,
}: GlintTrophyProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [polishCount, setPolishCount] = React.useState<number[]>(() =>
    TROPHIES.map(() => 0),
  );
  const [wiggleToken, setWiggleToken] = React.useState<Array<number | null>>(
    () => TROPHIES.map(() => null),
  );
  const [sparkleToken, setSparkleToken] = React.useState<Array<number | null>>(
    () => TROPHIES.map(() => null),
  );
  const [flashToken, setFlashToken] = React.useState<Array<number | null>>(() =>
    TROPHIES.map(() => null),
  );
  const [glint, setGlint] = React.useState<GlintState>(null);
  const [dust, setDust] = React.useState<number | null>(null);
  const [caption, setCaption] = React.useState("");

  const idCounter = React.useRef(0);
  const cycleIndexRef = React.useRef(0);
  const glintTimer = React.useRef<number | null>(null);
  const dustTimer = React.useRef<number | null>(null);
  const wiggleTimers = React.useRef<Array<number | null>>(
    TROPHIES.map(() => null),
  );
  const sparkleTimers = React.useRef<Array<number | null>>(
    TROPHIES.map(() => null),
  );
  const flashTimers = React.useRef<Array<number | null>>(
    TROPHIES.map(() => null),
  );

  /** Plays the sweep on one trophy, replacing whatever sweep is already
   * showing — the single `glint` slot is what guarantees only one ever
   * plays at a time, whether it came from the cycle or from a click. */
  const triggerGlint = React.useCallback((index: number, id: number) => {
    if (glintTimer.current !== null) window.clearTimeout(glintTimer.current);
    setGlint({ index, id });
    glintTimer.current = window.setTimeout(() => {
      setGlint(null);
      glintTimer.current = null;
    }, GLINT_SWEEP_DURATION_MS);
  }, []);

  // Ambient glint cycle: starts once the arrival cascade has settled, then
  // ticks forever in fixed order. Reduced motion skips it entirely.
  React.useEffect(() => {
    if (!motionSafe) return;
    const startDelayMs =
      ((TROPHY_COUNT - 1) * ARRIVE_STEP + ARRIVE_SETTLE_S) * 1000;
    let glintInterval: number | null = null;
    const startTimer = window.setTimeout(() => {
      cycleIndexRef.current = 0;
      idCounter.current += 1;
      triggerGlint(cycleIndexRef.current, idCounter.current);
      glintInterval = window.setInterval(() => {
        cycleIndexRef.current = (cycleIndexRef.current + 1) % TROPHY_COUNT;
        idCounter.current += 1;
        triggerGlint(cycleIndexRef.current, idCounter.current);
      }, GLINT_INTERVAL_MS);
    }, startDelayMs);
    return () => {
      window.clearTimeout(startTimer);
      if (glintInterval !== null) window.clearInterval(glintInterval);
    };
  }, [motionSafe, triggerGlint]);

  // Clears every outstanding timer on unmount. The per-trophy arrays are
  // aliased by reference, not copied: slots are rewritten in place as effects
  // fire, so cleanup still sees whatever timer is currently pending.
  React.useEffect(() => {
    const wiggles = wiggleTimers.current;
    const sparkles = sparkleTimers.current;
    const flashes = flashTimers.current;
    return () => {
      if (glintTimer.current !== null) window.clearTimeout(glintTimer.current);
      if (dustTimer.current !== null) window.clearTimeout(dustTimer.current);
      for (const t of wiggles) if (t !== null) window.clearTimeout(t);
      for (const t of sparkles) if (t !== null) window.clearTimeout(t);
      for (const t of flashes) if (t !== null) window.clearTimeout(t);
    };
  }, []);

  const handlePolish = (index: number) => {
    const trophy = TROPHIES[index];
    if (!trophy) return;

    setPolishCount((prev) =>
      prev.map((count, i) => {
        if (i !== index) return count;
        return count >= MAX_POLISH ? count : count + 1;
      }),
    );
    setCaption(`${trophy.name} · polished`);
    onPolish?.(trophy.name);

    idCounter.current += 1;
    const id = idCounter.current;

    if (!motionSafe) {
      setFlashToken((prev) => prev.map((v, i) => (i === index ? id : v)));
      const existing = flashTimers.current[index];
      if (existing !== null && existing !== undefined)
        window.clearTimeout(existing);
      flashTimers.current[index] = window.setTimeout(() => {
        setFlashToken((prev) => prev.map((v, i) => (i === index ? null : v)));
        flashTimers.current[index] = null;
      }, FLASH_HOLD_MS);
      return;
    }

    setWiggleToken((prev) => prev.map((v, i) => (i === index ? id : v)));
    const wExisting = wiggleTimers.current[index];
    if (wExisting !== null && wExisting !== undefined)
      window.clearTimeout(wExisting);
    wiggleTimers.current[index] = window.setTimeout(() => {
      setWiggleToken((prev) => prev.map((v, i) => (i === index ? null : v)));
      wiggleTimers.current[index] = null;
    }, WIGGLE_DURATION_MS);

    setSparkleToken((prev) => prev.map((v, i) => (i === index ? id : v)));
    const sExisting = sparkleTimers.current[index];
    if (sExisting !== null && sExisting !== undefined)
      window.clearTimeout(sExisting);
    sparkleTimers.current[index] = window.setTimeout(() => {
      setSparkleToken((prev) => prev.map((v, i) => (i === index ? null : v)));
      sparkleTimers.current[index] = null;
    }, SPARKLE_DURATION_MS);

    triggerGlint(index, id);
  };

  const handleDust = () => {
    setPolishCount(TROPHIES.map(() => 0));
    setCaption("shelf dusted.");
    if (!motionSafe) return;

    idCounter.current += 1;
    const id = idCounter.current;
    if (dustTimer.current !== null) window.clearTimeout(dustTimer.current);
    setDust(id);
    dustTimer.current = window.setTimeout(() => {
      setDust(null);
      dustTimer.current = null;
    }, DUST_DURATION_MS);
  };

  return (
    <div
      className={cn("inline-flex flex-col items-center select-none", className)}
    >
      <div
        className="relative overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        <span
          aria-hidden
          className="absolute inset-x-4 rounded-full"
          style={{
            bottom: SHELF_BOTTOM,
            height: SHELF_THICKNESS,
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--ink-2) 32%, var(--surface-2)) 0%, color-mix(in oklab, var(--ink-2) 52%, var(--surface-2)) 100%)",
          }}
        />

        <div
          className="absolute inset-x-5 flex items-end justify-between"
          style={{ bottom: SHELF_BOTTOM + SHELF_THICKNESS - 2 }}
        >
          {TROPHIES.map((trophy, index) => {
            const count = polishCount[index] ?? 0;
            const tintColor = brightenTint(trophy.tint, count);
            const isWiggling = wiggleToken[index] != null;
            const isFlashing = flashToken[index] != null;
            const sparkleId = sparkleToken[index] ?? null;
            const Shape = trophy.Shape;

            return (
              <div
                key={trophy.id}
                className="relative flex flex-col items-center"
                style={{ width: TROPHY_W }}
              >
                <motion.span
                  aria-hidden
                  className="absolute rounded-full bg-ink-3/50 blur-[1.5px]"
                  style={{
                    bottom: -4,
                    left: (TROPHY_W - SHADOW_W) / 2,
                    width: SHADOW_W,
                    height: SHADOW_H,
                  }}
                  initial={{ opacity: motionSafe ? 0 : 1 }}
                  animate={{ opacity: 1 }}
                  transition={
                    motionSafe
                      ? {
                          duration: durations.base,
                          ease: easings.enter,
                          delay: index * ARRIVE_STEP + ARRIVE_SETTLE_S,
                        }
                      : { duration: 0 }
                  }
                />

                <motion.div
                  initial={{
                    y: motionSafe ? ARRIVE_FROM_Y : 0,
                    opacity: motionSafe ? 0 : 1,
                  }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={
                    motionSafe
                      ? { ...springs.glide, delay: index * ARRIVE_STEP }
                      : { duration: 0 }
                  }
                >
                  <motion.button
                    type="button"
                    aria-label={trophy.label}
                    onClick={() => handlePolish(index)}
                    className="relative block appearance-none overflow-hidden border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
                    style={{ width: TROPHY_W, height: TROPHY_H }}
                    animate={{ rotate: isWiggling ? [...WIGGLE_KEYFRAMES] : 0 }}
                    transition={
                      isWiggling
                        ? {
                            duration: WIGGLE_DURATION,
                            ease: easings.move,
                            times: [...WIGGLE_TIMES],
                          }
                        : { duration: 0 }
                    }
                  >
                    <Shape color={tintColor} />

                    {isFlashing && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{ background: SHEEN, opacity: 1 }}
                      />
                    )}

                    <AnimatePresence>
                      {motionSafe &&
                        glint !== null &&
                        glint.index === index && (
                          <motion.span
                            key={glint.id}
                            aria-hidden
                            className="pointer-events-none absolute"
                            style={{
                              top: "-10%",
                              height: "120%",
                              width: GLINT_W,
                              transform: "skewX(-20deg)",
                              background: SHEEN,
                            }}
                            initial={{ left: GLINT_HIDDEN_LEFT }}
                            animate={{ left: GLINT_VISIBLE_LEFT }}
                            exit={{
                              opacity: 0,
                              transition: {
                                duration: durations.fast,
                                ease: easings.exit,
                              },
                            }}
                            transition={{
                              duration: GLINT_SWEEP_DURATION,
                              ease: easings.move,
                            }}
                          />
                        )}
                    </AnimatePresence>
                  </motion.button>
                </motion.div>

                <div
                  className="pointer-events-none absolute"
                  style={{ left: TROPHY_W / 2, top: TROPHY_H * 0.32 }}
                >
                  <AnimatePresence>
                    {motionSafe &&
                      sparkleId !== null &&
                      SPARK_VECTORS.map((vector, i) => (
                        <motion.span
                          key={`${sparkleId}-${i}`}
                          aria-hidden
                          className="absolute rounded-full"
                          style={{ width: 4, height: 4, background: tintColor }}
                          initial={{ opacity: 1, scale: 0.6, x: 0, y: 0 }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                            x: vector.dx,
                            y: vector.dy,
                          }}
                          exit={{
                            opacity: 0,
                            transition: {
                              duration: durations.fast,
                              ease: easings.exit,
                            },
                          }}
                          transition={{
                            duration: SPARKLE_DURATION,
                            ease: easings.move,
                          }}
                        />
                      ))}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {motionSafe && dust !== null && (
            <motion.span
              key={dust}
              aria-hidden
              className="pointer-events-none absolute inset-y-0"
              style={{
                width: DUST_BAND_W,
                transform: "skewX(-20deg)",
                background: SHEEN,
              }}
              initial={{ left: DUST_HIDDEN_LEFT }}
              animate={{ left: DUST_VISIBLE_LEFT }}
              exit={{
                opacity: 0,
                transition: { duration: durations.fast, ease: easings.exit },
              }}
              transition={{ duration: DUST_DURATION, ease: easings.move }}
            />
          )}
        </AnimatePresence>
      </div>

      <span aria-hidden className="mt-2 h-4 text-label leading-none text-ink-3">
        {caption || " "}
      </span>

      <button
        type="button"
        onClick={handleDust}
        className="mt-1 text-label text-ink-3 underline-offset-4 transition-colors outline-none hover:text-ink hover:underline focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      >
        dust the shelf
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {caption}
      </span>
    </div>
  );
}
