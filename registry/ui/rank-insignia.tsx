"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

const TAU = Math.PI * 2;

/** Five fixed tiers, ascending tint and one added chevron each. */
const TIERS = [
  { name: "FIELD HAND", color: "var(--ink-2)" },
  { name: "GATEKEEPER", color: "var(--success, #047857)" },
  { name: "SHIFT LEAD", color: "var(--primary)" },
  { name: "HARBOURMASTER", color: "var(--warning, #b45309)" },
  {
    name: "MERIDIAN",
    color: "color-mix(in oklab, var(--accent-bright) 65%, var(--signal) 35%)",
  },
] as const;

type Tier = (typeof TIERS)[number];

const MAX_TIER = TIERS.length - 1;

/** `TIERS[1]` is a literal-index tuple read — always defined, so this guards
 * every variable-indexed lookup without a raw fallback object at each call. */
const tierAt = (index: number): Tier => TIERS[index] ?? TIERS[1];

const clampTier = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(MAX_TIER, Math.max(0, Math.round(value)))
    : 1;

/** Progress is a plain 0..100 percent — `perClick` adds points directly, so
 * a default 25 takes exactly four presses to fill the ring. */
const TARGET = 100;
/** Past the top tier, clicks feed this asymptote instead: it climbs fast at
 * first and forever approaches 100 without ever touching it. */
const MERIDIAN_SCALE = 200;

const CAPTION_MS = 1400;
/** The pause between the new plate settling and its chevron stamping on. */
const POST_LAND_BEAT_MS = 160;
const SWEEP_S = 0.6;

/** Stage (ring) and plate geometry, px. */
const RING_SIZE = 140;
const RING_R = 62;
const RING_CENTER = 70;
const RING_STROKE = 3;
const PLATE_W = 100;
const PLATE_H = 114;
/** How far above rest the plate starts its recoil drop. */
const PLATE_DROP = 46;
const FIELD_INSET_X = 10;
const FIELD_INSET_TOP = 9;
const FIELD_INSET_BOTTOM = 11;
const BAR_W = 30;
const BAR_H = 5;
const CHEVRON_W = 42;
const CHEVRON_H = 15;
const FLASH_D = 96;
const SHOCK_D = 84;
const SWEEP_W = 20;
const SWEEP_HIDDEN_LEFT = -(SWEEP_W + 14);
const SWEEP_VISIBLE_LEFT = PLATE_W + 14;

/** One shield silhouette, reused at plate and (smaller, inset) field size. */
const SHIELD_CLIP =
  "polygon(15% 0%, 85% 0%, 100% 30%, 100% 58%, 50% 100%, 0% 58%, 0% 30%)";

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

/** The demote "dim" pulse — a tween, never a spring (three keyframes). */
const DIM_KEYFRAMES = [1, 0.55, 1] as const;
const DIM_TIMES = [0, 0.45, 1] as const;

/** Eight fixed spark vectors, evenly spaced from the top. No Math.random. */
const SPARK_COUNT = 8;
const SPARK_SPREAD = 26;
const SPARKS = Array.from({ length: SPARK_COUNT }, (_, i) => {
  const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
  return {
    dx: Math.cos(angle) * SPARK_SPREAD,
    dy: Math.sin(angle) * SPARK_SPREAD,
  };
});

type Phase = "idle" | "promoting";
type CaptionMode = "normal" | "promoted";

export type RankInsigniaProps = {
  /** Starting rank tier, 0–4. @default 1 */
  tier?: number;
  /** Progress points earned per "Earn progress" click. @default 25 */
  perClick?: number;
  /** Fires once, right as each promotion begins. */
  onPromote?: (tier: number, name: string) => void;
  className?: string;
};

/**
 * A rank badge that promotes with real ceremony. The centred insignia — a
 * DOM-clipped shield plate around an SVG chevron stack, one chevron per
 * tier, plus a small rank bar beneath — sits inside a thin progress ring
 * that fills on `springs.glide` as the "Earn progress" button is pressed.
 * Filling the ring launches the promotion: the old plate cracks and clears
 * behind an expanding flash ring, the new plate drops in from above on
 * `springs.recoil` as a shockwave pulses out, its freshest chevron stamps
 * on `springs.flick` after a short beat, a light sweep crosses the plate,
 * the rank name rolls to its new word, eight fixed sparks fire outward, and
 * a mono caption flashes "PROMOTED" for about 1.4s. Past the top tier the
 * ring keeps taking clicks into a "MERIDIAN" meter that approaches full but
 * never completes — an honest ceiling instead of a sixth fake tier — and
 * its caption says so. The demote button steps back one tier for demos: the
 * plate dims, its top chevron falls away, and the name rolls back, with no
 * ceremony attached.
 * Reduced motion: promotion swaps the insignia and chevron count straight
 * to the new tier — no crack, drop, sweep, or sparks — though the caption
 * still flashes.
 */
export function RankInsignia({
  tier = 1,
  perClick = 25,
  onPromote,
  className,
}: RankInsigniaProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const seedTier = clampTier(tier);

  const [displayTier, setDisplayTier] = React.useState(seedTier);
  const [chevronCount, setChevronCount] = React.useState(seedTier);
  const [progress, setProgress] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [captionMode, setCaptionMode] = React.useState<CaptionMode>("normal");
  const [flashKey, setFlashKey] = React.useState(0);
  const [shockwaveKey, setShockwaveKey] = React.useState(0);
  const [sparkKey, setSparkKey] = React.useState(0);
  const [sweepKey, setSweepKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const tierRef = React.useRef(seedTier);
  const progressRef = React.useRef(0);
  const meridianAccRef = React.useRef(0);
  const phaseRef = React.useRef<Phase>("idle");

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const perClickRef = React.useRef(perClick);
  React.useEffect(() => {
    perClickRef.current = perClick;
  }, [perClick]);
  const onPromoteRef = React.useRef(onPromote);
  React.useEffect(() => {
    onPromoteRef.current = onPromote;
  }, [onPromote]);

  const plateScale = useMotionValue<number>(1);
  const plateOpacity = useMotionValue<number>(1);
  const plateY = useMotionValue<number>(0);
  const dimOpacity = useMotionValue<number>(1);
  const ringFill = useMotionValue<number>(0);

  const plateScaleAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const plateOpacityAnim = React.useRef<ReturnType<typeof animate> | null>(
    null,
  );
  const plateYAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const dimAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const ringAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const captionTimer = React.useRef<number | null>(null);
  const beatTimer = React.useRef<number | null>(null);
  const sweepEndTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      if (beatTimer.current !== null) window.clearTimeout(beatTimer.current);
      if (sweepEndTimer.current !== null)
        window.clearTimeout(sweepEndTimer.current);
      plateScaleAnim.current?.stop();
      plateOpacityAnim.current?.stop();
      plateYAnim.current?.stop();
      ringAnim.current?.stop();
      dimAnim.current?.stop();
    };
  }, []);

  const setRingFill = (target: number, drain?: boolean) => {
    ringAnim.current?.stop();
    if (!motionSafeRef.current) {
      ringFill.jump(target);
      return;
    }
    ringAnim.current = animate(
      ringFill,
      target,
      drain ? { duration: durations.slow, ease: easings.exit } : springs.glide,
    );
  };

  const beginPromotion = () => {
    const fromTier = tierRef.current;
    const toTier = Math.min(fromTier + 1, MAX_TIER);
    if (toTier <= fromTier) return;

    const nextDef = tierAt(toTier);

    phaseRef.current = "promoting";
    setPhase("promoting");
    progressRef.current = 0;
    meridianAccRef.current = 0;
    setProgress(0);
    setRingFill(0, true);

    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    setCaptionMode("promoted");
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setCaptionMode("normal");
    }, CAPTION_MS);

    setAnnounce(`Promoted to ${nextDef.name}.`);
    onPromoteRef.current?.(toTier, nextDef.name);

    if (!motionSafeRef.current) {
      tierRef.current = toTier;
      setDisplayTier(toTier);
      setChevronCount(toTier);
      phaseRef.current = "idle";
      setPhase("idle");
      return;
    }

    plateScaleAnim.current?.stop();
    plateOpacityAnim.current?.stop();
    plateYAnim.current?.stop();
    setFlashKey((k) => k + 1);

    // Phase A — the old plate cracks and clears.
    plateScaleAnim.current = animate(plateScale, 1.12, {
      duration: durations.slow,
      ease: easings.exit,
    });
    plateOpacityAnim.current = animate(plateOpacity, 0, {
      duration: durations.slow,
      ease: easings.exit,
      onComplete: () => {
        tierRef.current = toTier;
        setDisplayTier(toTier);

        // Phase B — the new plate lands.
        plateScale.set(1);
        plateY.set(-PLATE_DROP);
        plateOpacity.set(0);
        setShockwaveKey((k) => k + 1);

        plateOpacityAnim.current = animate(plateOpacity, 1, {
          duration: durations.fast,
          ease: easings.enter,
        });
        plateYAnim.current = animate(plateY, 0, {
          ...springs.recoil,
          onComplete: () => {
            beatTimer.current = window.setTimeout(() => {
              beatTimer.current = null;
              setChevronCount(toTier);
              setSparkKey((k) => k + 1);
              setSweepKey((k) => k + 1);
              sweepEndTimer.current = window.setTimeout(
                () => {
                  sweepEndTimer.current = null;
                  phaseRef.current = "idle";
                  setPhase("idle");
                },
                SWEEP_S * 1000 + 150,
              );
            }, POST_LAND_BEAT_MS);
          },
        });
      },
    });
  };

  const handleEarn = () => {
    if (phaseRef.current === "promoting") return;
    const amount = perClickRef.current;

    if (tierRef.current >= MAX_TIER) {
      meridianAccRef.current += amount;
      const pct =
        (100 * meridianAccRef.current) /
        (meridianAccRef.current + MERIDIAN_SCALE);
      setProgress(pct);
      setRingFill(pct / 100);
      return;
    }

    const next = progressRef.current + amount;
    if (next >= TARGET) {
      progressRef.current = TARGET;
      setProgress(TARGET);
      setRingFill(1);
      beginPromotion();
    } else {
      progressRef.current = next;
      setProgress(next);
      setRingFill(next / 100);
    }
  };

  const handleDemote = () => {
    if (phaseRef.current === "promoting") return;
    const fromTier = tierRef.current;
    if (fromTier <= 0) return;
    const toTier = fromTier - 1;
    const nextDef = tierAt(toTier);

    tierRef.current = toTier;
    setDisplayTier(toTier);
    setChevronCount(toTier);
    progressRef.current = 0;
    meridianAccRef.current = 0;
    setProgress(0);
    setRingFill(0);
    setAnnounce(`Demoted to ${nextDef.name}.`);

    if (motionSafeRef.current) {
      dimAnim.current?.stop();
      dimOpacity.set(1);
      dimAnim.current = animate(dimOpacity, [...DIM_KEYFRAMES], {
        duration: 0.4,
        ease: easings.move,
        times: [...DIM_TIMES],
      });
    }
  };

  const currentTier = tierAt(displayTier);
  const tint = currentTier.color;
  const meridian = displayTier >= MAX_TIER;
  const plateBg = `linear-gradient(155deg, color-mix(in oklab, ${tint} 85%, var(--card)) 0%, color-mix(in oklab, ${tint} 45%, var(--card)) 100%)`;
  const fieldBg = `color-mix(in oklab, ${tint} 38%, var(--card))`;
  const chevronColor = `color-mix(in oklab, var(--card) 82%, ${tint} 18%)`;
  const barColor = `color-mix(in oklab, ${tint} 72%, var(--card) 28%)`;

  const captionText =
    captionMode === "promoted"
      ? "PROMOTED"
      : meridian
        ? "top of the ladder"
        : `${Math.round(progress)} / ${TARGET}`;
  const captionKey =
    captionMode === "promoted" ? "promoted" : meridian ? "meridian" : "normal";

  const earnDisabled = phase === "promoting";
  const demoteDisabled = phase === "promoting" || displayTier <= 0;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1 select-none",
        className,
      )}
    >
      <div
        role="progressbar"
        aria-label="Rank progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-valuetext={
          meridian
            ? "Meridian, top of the ladder"
            : `${currentTier.name}, ${Math.round(progress)} of ${TARGET}`
        }
        className="relative"
        style={{ width: RING_SIZE, height: RING_SIZE }}
      >
        <svg
          aria-hidden
          className="absolute inset-0"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        >
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_R}
            fill="none"
            stroke="var(--hairline-strong)"
            strokeWidth={RING_STROKE}
          />
          <motion.circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_R}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}
            style={{
              pathLength: ringFill,
              stroke: tint,
              transition: "stroke 300ms ease",
            }}
          />
        </svg>

        {motionSafe && flashKey > 0 && (
          <motion.span
            key={flashKey}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: FLASH_D,
              height: FLASH_D,
              marginLeft: -(FLASH_D / 2),
              marginTop: -(FLASH_D / 2),
              border: "2px solid var(--ink)",
            }}
            initial={{ scale: 0.8, opacity: 0.9 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          />
        )}

        {motionSafe && shockwaveKey > 0 && (
          <motion.span
            key={shockwaveKey}
            aria-hidden
            className="pointer-events-none absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: SHOCK_D,
              height: SHOCK_D,
              marginLeft: -(SHOCK_D / 2),
              marginTop: -(SHOCK_D / 2),
              border: `2px solid ${tint}`,
            }}
            initial={{ scale: 0.5, opacity: 0.85 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 0.5, ease: easings.exit }}
          />
        )}

        {/* The plate — one persistent node, replayed (never remounted) on
            every promotion, matching the house arrival pattern rather than
            an AnimatePresence remount. */}
        <motion.div
          aria-hidden
          className="absolute top-1/2 left-1/2"
          style={{
            width: PLATE_W,
            height: PLATE_H,
            marginLeft: -(PLATE_W / 2),
            marginTop: -(PLATE_H / 2),
            clipPath: SHIELD_CLIP,
            background: plateBg,
            boxShadow: "var(--edge-highlight)",
            scale: plateScale,
            opacity: plateOpacity,
            y: plateY,
          }}
        >
          <motion.div
            className="absolute flex flex-col items-center justify-center gap-2"
            style={{
              left: FIELD_INSET_X,
              right: FIELD_INSET_X,
              top: FIELD_INSET_TOP,
              bottom: FIELD_INSET_BOTTOM,
              clipPath: SHIELD_CLIP,
              background: fieldBg,
              opacity: dimOpacity,
            }}
          >
            <div className="flex flex-col items-center gap-1">
              <AnimatePresence initial={false}>
                {Array.from({ length: chevronCount }, (_, i) => (
                  <motion.div
                    key={i}
                    initial={motionSafe ? { scale: 0, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={
                      motionSafe
                        ? {
                            y: 8,
                            opacity: 0,
                            transition: exitFor(durations.base),
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                    transition={
                      motionSafe
                        ? {
                            scale: springs.flick,
                            opacity: {
                              duration: durations.fast,
                              ease: easings.enter,
                            },
                          }
                        : { duration: 0 }
                    }
                  >
                    <svg
                      width={CHEVRON_W}
                      height={CHEVRON_H}
                      viewBox="0 0 42 15"
                      aria-hidden
                    >
                      <polyline
                        points="4,13 21,2 38,13"
                        fill="none"
                        stroke={chevronColor}
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <span
              className="rounded-full"
              style={{
                width: BAR_W,
                height: BAR_H,
                background: barColor,
                boxShadow: `0 0 6px 1px color-mix(in oklab, ${tint} 45%, transparent)`,
              }}
            />
          </motion.div>

          {motionSafe && sweepKey > 0 && (
            <motion.span
              key={sweepKey}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                top: "-20%",
                height: "140%",
                width: SWEEP_W,
                transform: "skewX(-20deg)",
                background: SHEEN,
              }}
              initial={{ left: SWEEP_HIDDEN_LEFT }}
              animate={{ left: SWEEP_VISIBLE_LEFT }}
              transition={{ duration: SWEEP_S, ease: easings.move }}
            />
          )}
        </motion.div>

        {motionSafe && sparkKey > 0 && (
          <span
            key={sparkKey}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            {SPARKS.map((s, i) => (
              <motion.span
                key={i}
                className="absolute size-[3px] rounded-full bg-signal"
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                transition={{ duration: durations.slow, ease: easings.exit }}
              />
            ))}
          </span>
        )}
      </div>

      <div className="relative mt-1 h-[22px] w-48 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={displayTier}
            className="absolute inset-x-0 text-center font-mono text-sm font-semibold tracking-[0.14em] whitespace-nowrap text-ink uppercase"
            initial={motionSafe ? { y: 14, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            exit={
              motionSafe
                ? { y: -14, opacity: 0, transition: exitFor(durations.base) }
                : { opacity: 0, transition: { duration: 0 } }
            }
            transition={
              motionSafe
                ? { duration: durations.base, ease: easings.enter }
                : { duration: 0 }
            }
          >
            {currentTier.name}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative h-4 w-48 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={captionKey}
            className="absolute inset-x-0 text-center text-label whitespace-nowrap text-ink-3"
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
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          aria-label="Earn progress"
          onClick={handleEarn}
          disabled={earnDisabled}
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          Earn
        </button>

        <button
          type="button"
          onClick={handleDemote}
          disabled={demoteDisabled}
          className={cn(
            "rounded-1 text-label text-ink-3 transition-colors outline-none",
            "hover:text-ink-2",
            "disabled:pointer-events-none disabled:opacity-40",
            "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
          )}
        >
          Demote
        </button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
