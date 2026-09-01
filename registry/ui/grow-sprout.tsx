"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* Card geometry — hand-set so the soil, stem base, and droplets line up. */
const CARD_W = 208;
const CARD_H = 184;
const CENTER_X = CARD_W / 2;
/** Px from the card's bottom edge up to the soil surface / stem base. */
const ANCHOR_BOTTOM = 32;
/** Px from the stem base up to its fully-grown tip, in wrapper-local space. */
const STEM_TIP = 78;

/* Palette — earth and greens mix toward the ink so both themes stay legible;
   petals and droplets read off the interactive accent per house convention. */
const SOIL = "color-mix(in oklab, var(--warning, #b45309) 60%, var(--ink))";
const SEED_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 34%, var(--ink))";
const STEM = "color-mix(in oklab, var(--success, #047857) 62%, var(--ink))";
const LEAF = "color-mix(in oklab, var(--success, #047857) 76%, var(--ink))";
const PETAL = "var(--primary)";
const CENTER_DISC =
  "color-mix(in oklab, var(--warning, #b45309) 48%, var(--card))";
const DROPLET = "color-mix(in oklab, var(--primary) 78%, var(--card))";

/** Stem draw paths — two segments so the second click extends the first. */
const STEM_SEG_1 = "M8 80 C7 68 9 56 8 44";
const STEM_SEG_2 = "M8 44 C9 30 7 16 8 2";

/** Fixed droplet vectors — three falls, always the same three. */
const DROPLETS = [
  { key: "a", x: -18, fall: 128 },
  { key: "b", x: 0, fall: 138 },
  { key: "c", x: 18, fall: 128 },
] as const;

/** Six petal angles, evenly spaced — no trig at runtime. */
const PETAL_ANGLES = [0, 60, 120, 180, 240, 300] as const;
const PETAL_REACH = 15;

/** One gentle nod once the bloom settles. */
const NOD_KEYFRAMES = [0, -8, 5, -2, 0] as const;
const NOD_TIMES = [0, 0.3, 0.55, 0.8, 1] as const;

const STAGE_NAMES = ["seed", "sprout", "stem", "leaves", "flower"] as const;

/* Timing — derived from the shared scale where the spec gives one, hand-set
   from each spring's documented settle time otherwise. Nothing here reads a
   clock or a random source; every sequence plays back identically. */
const WATER_FALL_MS = Math.round(durations.slow * 1000);
const WATER_STAGGER_MS = Math.round(cascade(3) * 1000);
const WATER_MS = WATER_FALL_MS + 2 * WATER_STAGGER_MS;

const STEM_DRAW_MS = 600;
const LEAF_DELAY_MS = 300;
const LEAF_GLIDE_MS = 450;
const LEAN_DRIFT_MS = 800;
const BUD_RECOIL_MS = 700;
const PETAL_STAGGER_MS = Math.round(cascade(6) * 1000);
const PETAL_GLIDE_MS = 450;
const PETAL_CASCADE_MS = 5 * PETAL_STAGGER_MS + PETAL_GLIDE_MS;
const NOD_MS = 350;

/** How long a stage transition's own choreography runs, once the water lands. */
const GROW_MS: Record<1 | 2 | 3 | 4, number> = {
  1: Math.max(STEM_DRAW_MS, LEAF_DELAY_MS + LEAF_GLIDE_MS),
  2: Math.max(STEM_DRAW_MS, LEAF_DELAY_MS + LEAF_GLIDE_MS),
  3: Math.max(LEAF_GLIDE_MS, LEAN_DRIFT_MS),
  4: BUD_RECOIL_MS + PETAL_CASCADE_MS + NOD_MS,
};

const RELEASE_ARC_MS = 900;
const FADE_STAGGER_MS = Math.round(cascade(4) * 1000);
const FADE_MS = Math.round(durations.slow * 0.6 * 1000);
const RESEED_MS = RELEASE_ARC_MS + 3 * FADE_STAGGER_MS + FADE_MS;

/** How long the "bloom." / "again." caption flash holds before reverting. */
const FLASH_HOLD_MS = 500;

const NO_TRANSITION = { duration: 0 };

/** Clears a pending setTimeout tracked by a `useRef<number | null>` and resets it. */
function clearTimer(ref: { current: number | null }): void {
  if (ref.current !== null) window.clearTimeout(ref.current);
  ref.current = null;
}

export type GrowSproutProps = {
  /** Fires once per cycle, the instant the fourth click brings the bloom. */
  onBloom?: () => void;
  className?: string;
};

/**
 * A seed that grows into a flower, four clicks at a time. Each click on the
 * stage waters it first — three droplets fall and land — then the plant
 * advances: a stem draws upward with cotyledons unfolding, extends taller
 * with a first true leaf, gains a second leaf and a slight lean, then a bud
 * swells and blooms into six fanned petals with a caption flash. A fifth
 * click releases a seed from the bloom, arcs it down to the soil, and fades
 * the spent plant away so the cycle can start over. Clicks are ignored while
 * a transition is still animating. Reduced motion: no droplet fall, no path
 * draws, and no petal cascade — each click swaps directly to the next
 * fully-formed stage still, and the fifth swaps straight back to the seed.
 */
export function GrowSprout({
  onBloom,
  className,
}: GrowSproutProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [stage, setStage] = React.useState<0 | 1 | 2 | 3 | 4>(0);
  const [busy, setBusy] = React.useState(false);
  const [watering, setWatering] = React.useState(false);
  const [waterBurst, setWaterBurst] = React.useState(0);
  const [reseeding, setReseeding] = React.useState(false);
  const [nodding, setNodding] = React.useState(false);
  const [flash, setFlash] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  const budScale = useMotionValue(1);
  const budAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  // One named timer per distinct scheduled beat, so a fresh click can cancel
  // any trailing timer a previous cycle left running (the bloom's caption
  // flash, for instance, outlives that cycle's own busy lock).
  const stepTimer = React.useRef<number | null>(null);
  const flashTimer = React.useRef<number | null>(null);
  const nodStartTimer = React.useRef<number | null>(null);
  const nodEndTimer = React.useRef<number | null>(null);
  const busyTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      clearTimer(stepTimer);
      clearTimer(flashTimer);
      clearTimer(nodStartTimer);
      clearTimer(nodEndTimer);
      clearTimer(busyTimer);
      budAnim.current?.stop();
    };
  }, []);

  const handleClick = () => {
    if (!motionSafe) {
      if (stage === 4) {
        setStage(0);
        setAnnounce("Seed planted again.");
      } else {
        const next = (stage + 1) as 1 | 2 | 3 | 4;
        setStage(next);
        setAnnounce(`Grew to ${STAGE_NAMES[next] ?? "seed"}.`);
        if (next === 4) onBloom?.();
      }
      return;
    }

    if (busy) return;

    clearTimer(stepTimer);
    clearTimer(flashTimer);
    clearTimer(nodStartTimer);
    clearTimer(nodEndTimer);
    clearTimer(busyTimer);

    setBusy(true);
    setWatering(true);
    setWaterBurst((n) => n + 1);
    setAnnounce("Watering.");

    stepTimer.current = window.setTimeout(() => {
      stepTimer.current = null;
      setWatering(false);

      if (stage === 4) {
        setReseeding(true);
        setFlash("again.");
        setAnnounce("The bloom releases a seed.");
        stepTimer.current = window.setTimeout(() => {
          stepTimer.current = null;
          setStage(0);
          setReseeding(false);
          setBusy(false);
          setAnnounce("Seed planted again.");
        }, RESEED_MS);
        flashTimer.current = window.setTimeout(() => {
          flashTimer.current = null;
          setFlash(null);
        }, RESEED_MS + FLASH_HOLD_MS);
        return;
      }

      const next = (stage + 1) as 1 | 2 | 3 | 4;
      setStage(next);
      setAnnounce(`Grew to ${STAGE_NAMES[next] ?? "seed"}.`);

      if (next === 4) {
        onBloom?.();
        setFlash("bloom.");
        budAnim.current?.stop();
        budScale.set(1.3);
        budAnim.current = animate(budScale, 1, springs.recoil);
        nodStartTimer.current = window.setTimeout(() => {
          nodStartTimer.current = null;
          setNodding(true);
        }, BUD_RECOIL_MS + PETAL_CASCADE_MS);
        nodEndTimer.current = window.setTimeout(
          () => {
            nodEndTimer.current = null;
            setNodding(false);
          },
          BUD_RECOIL_MS + PETAL_CASCADE_MS + NOD_MS,
        );
        flashTimer.current = window.setTimeout(() => {
          flashTimer.current = null;
          setFlash(null);
        }, GROW_MS[4] + FLASH_HOLD_MS);
      }

      busyTimer.current = window.setTimeout(() => {
        busyTimer.current = null;
        setBusy(false);
      }, GROW_MS[next]);
    }, WATER_MS);
  };

  const leaning = stage >= 3 && !reseeding;
  const fading = reseeding;
  const caption = flash ?? STAGE_NAMES[stage] ?? "seed";

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <button
        type="button"
        aria-label="Water the sprout"
        onClick={handleClick}
        className={cn(
          "relative rounded-3 border border-hairline bg-surface-1 shadow-raised outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          !motionSafe && "active:brightness-95",
        )}
        style={{ width: CARD_W, height: CARD_H }}
      >
        <span
          aria-hidden
          className="absolute inset-x-2 bottom-2 block h-6 rounded-3"
          style={{ background: SOIL }}
        />

        {stage === 0 && !reseeding && (
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: CENTER_X - 5,
              bottom: ANCHOR_BOTTOM - 5,
              width: 10,
              height: 10,
              background: SEED_COLOR,
            }}
          />
        )}

        {stage >= 1 && (
          <motion.div
            aria-hidden
            className="absolute"
            style={{
              left: CENTER_X,
              bottom: ANCHOR_BOTTOM,
              transformOrigin: "50% 100%",
            }}
            initial={false}
            animate={{ rotate: leaning ? 5 : 0 }}
            transition={motionSafe ? springs.drift : NO_TRANSITION}
          >
            {/* Fade layer — carries the whole plant out on reseed, each part
                staggered so the exit reads as a cascade rather than a block. */}
            <PlantFade fading={fading} motionSafe={motionSafe} index={0}>
              <svg
                width={16}
                height={80}
                viewBox="0 0 16 80"
                className="absolute overflow-visible"
                style={{ left: -8, bottom: 0 }}
              >
                <motion.path
                  d={STEM_SEG_1}
                  fill="none"
                  stroke={STEM}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  initial={motionSafe ? { pathLength: 0 } : false}
                  animate={{ pathLength: 1 }}
                  transition={
                    motionSafe
                      ? { duration: STEM_DRAW_MS / 1000, ease: easings.enter }
                      : NO_TRANSITION
                  }
                />
                {stage >= 2 && (
                  <motion.path
                    d={STEM_SEG_2}
                    fill="none"
                    stroke={STEM}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    initial={motionSafe ? { pathLength: 0 } : false}
                    animate={{ pathLength: 1 }}
                    transition={
                      motionSafe
                        ? {
                            duration: STEM_DRAW_MS / 1000,
                            ease: easings.enter,
                          }
                        : NO_TRANSITION
                    }
                  />
                )}
              </svg>
            </PlantFade>

            {/* Cotyledons — the sprout's first tiny leaves at the tip. */}
            <PlantFade fading={fading} motionSafe={motionSafe} index={1}>
              <PlantLeaf
                left={-9}
                bottom={34}
                width={10}
                height={6}
                restRotate={-45}
                origin="100% 50%"
                delayMs={motionSafe ? LEAF_DELAY_MS : 0}
                motionSafe={motionSafe}
              />
              <PlantLeaf
                left={-1}
                bottom={34}
                width={10}
                height={6}
                restRotate={45}
                origin="0% 50%"
                delayMs={motionSafe ? LEAF_DELAY_MS : 0}
                motionSafe={motionSafe}
              />
            </PlantFade>

            {stage >= 2 && (
              <PlantFade fading={fading} motionSafe={motionSafe} index={2}>
                <PlantLeaf
                  left={-15}
                  bottom={20}
                  width={20}
                  height={11}
                  restRotate={-32}
                  origin="100% 50%"
                  delayMs={motionSafe ? LEAF_DELAY_MS : 0}
                  motionSafe={motionSafe}
                />
              </PlantFade>
            )}

            {stage >= 3 && (
              <PlantFade fading={fading} motionSafe={motionSafe} index={3}>
                <PlantLeaf
                  left={7}
                  bottom={52}
                  width={20}
                  height={11}
                  restRotate={32}
                  origin="0% 50%"
                  delayMs={0}
                  motionSafe={motionSafe}
                />
              </PlantFade>
            )}

            {stage >= 4 && (
              <PlantFade fading={fading} motionSafe={motionSafe} index={4}>
                <motion.div
                  className="absolute"
                  style={{
                    left: 0,
                    bottom: STEM_TIP,
                    transformOrigin: "50% 50%",
                  }}
                  initial={false}
                  animate={{ rotate: nodding ? [...NOD_KEYFRAMES] : 0 }}
                  transition={
                    motionSafe && nodding
                      ? {
                          duration: NOD_MS / 1000,
                          ease: easings.move,
                          times: [...NOD_TIMES],
                        }
                      : NO_TRANSITION
                  }
                >
                  <motion.div
                    className="relative"
                    style={{ scale: motionSafe ? budScale : 1 }}
                  >
                    {PETAL_ANGLES.map((angle, i) => (
                      <div
                        key={angle}
                        className="absolute top-0 left-0"
                        style={{
                          transform: `rotate(${angle}deg) translateY(-${PETAL_REACH}px)`,
                        }}
                      >
                        <motion.div
                          className="absolute"
                          style={{
                            left: -6,
                            top: -9,
                            transformOrigin: "50% 50%",
                          }}
                          initial={
                            motionSafe
                              ? { scale: 0, rotate: -18, opacity: 0 }
                              : false
                          }
                          animate={{ scale: 1, rotate: 0, opacity: 1 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.glide,
                                  delay: i * cascade(6),
                                }
                              : NO_TRANSITION
                          }
                        >
                          <span
                            className="block rounded-full"
                            style={{
                              width: 12,
                              height: 18,
                              background: PETAL,
                            }}
                          />
                        </motion.div>
                      </div>
                    ))}
                    <span
                      className="absolute top-0 left-0 rounded-full"
                      style={{
                        width: 10,
                        height: 10,
                        marginLeft: -5,
                        marginTop: -5,
                        background: CENTER_DISC,
                      }}
                    />
                  </motion.div>
                </motion.div>
              </PlantFade>
            )}
          </motion.div>
        )}

        {motionSafe && watering && (
          <div
            key={waterBurst}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-2"
          >
            {DROPLETS.map((drop, i) => (
              <motion.span
                key={drop.key}
                className="absolute top-0 left-1/2 block rounded-full"
                style={{
                  width: 4,
                  height: 7,
                  marginLeft: drop.x - 2,
                  background: DROPLET,
                }}
                initial={{ opacity: 1, y: 0 }}
                animate={{ opacity: 0, y: drop.fall }}
                transition={{
                  duration: WATER_FALL_MS / 1000,
                  ease: easings.exit,
                  delay: i * cascade(3),
                }}
              />
            ))}
          </div>
        )}

        {reseeding && (
          <motion.span
            aria-hidden
            className="absolute rounded-full"
            style={{
              left: CENTER_X - 5,
              bottom: ANCHOR_BOTTOM + STEM_TIP - 5,
              width: 10,
              height: 10,
              background: SEED_COLOR,
            }}
            initial={motionSafe ? { y: 0, opacity: 1 } : false}
            animate={
              motionSafe
                ? { y: [0, -10, STEM_TIP], opacity: 1 }
                : { y: 0, opacity: 1 }
            }
            transition={
              motionSafe
                ? {
                    duration: RELEASE_ARC_MS / 1000,
                    ease: easings.move,
                    times: [0, 0.3, 1],
                  }
                : NO_TRANSITION
            }
          />
        )}
      </button>

      <div aria-hidden className="flex h-4 items-center">
        <motion.span
          key={caption}
          className="text-label text-ink-3 normal-case"
          initial={motionSafe ? { opacity: 0, y: 3 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { duration: durations.base, ease: easings.enter }
              : NO_TRANSITION
          }
        >
          {caption}
        </motion.span>
      </div>

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}

type PlantFadeProps = {
  fading: boolean;
  motionSafe: boolean;
  /** Cascade position — later parts exit a beat after earlier ones. */
  index: number;
  children: React.ReactNode;
};

/** Wraps one plant part so the reseed exit staggers across the whole plant. */
function PlantFade({ fading, motionSafe, index, children }: PlantFadeProps) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: fading ? 0 : 1, y: fading ? 6 : 0 }}
      transition={
        !motionSafe
          ? NO_TRANSITION
          : fading
            ? {
                duration: FADE_MS / 1000,
                ease: easings.exit,
                delay: RELEASE_ARC_MS / 1000 + index * cascade(4),
              }
            : NO_TRANSITION
      }
    >
      {children}
    </motion.div>
  );
}

type PlantLeafProps = {
  left: number;
  bottom: number;
  width: number;
  height: number;
  restRotate: number;
  origin: string;
  delayMs: number;
  motionSafe: boolean;
};

/** One leaf: unfolds from its base with a rotate + scale on `glide`. */
function PlantLeaf({
  left,
  bottom,
  width,
  height,
  restRotate,
  origin,
  delayMs,
  motionSafe,
}: PlantLeafProps) {
  return (
    <motion.div
      className="absolute"
      style={{ left, bottom, transformOrigin: origin }}
      initial={
        motionSafe ? { scale: 0, rotate: restRotate * 0.35, opacity: 0 } : false
      }
      animate={{ scale: 1, rotate: restRotate, opacity: 1 }}
      transition={
        motionSafe ? { ...springs.glide, delay: delayMs / 1000 } : NO_TRANSITION
      }
    >
      <span
        className="block"
        style={{
          width,
          height,
          background: LEAF,
          borderRadius: "0% 60% 0% 60%",
        }}
      />
    </motion.div>
  );
}
