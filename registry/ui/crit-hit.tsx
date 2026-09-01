"use client";

import * as React from "react";

import { animate, AnimatePresence, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

const TAU = Math.PI * 2;

export type DamageTier = {
  id: string;
  label: string;
  amount: number;
  /** Escalation rank, 0..3 (grey → accent → warm → bold). Rounded and
   * clamped into range — it drives every visual step (tint, size, punch,
   * flecks, ring, shake) independently of `amount`, so a rebalanced amount
   * table still reads as the same four dramatic beats. */
  weight: number;
};

/** Fixed four-tier cycle — GRAZE, HIT, CRIT, CRUSH — indexed by strike count,
 * never rolled. The whole point of a fixed cycle: the Nth strike always
 * lands the same tier, so a test (or a player) can predict it. */
const DEFAULT_TIERS: DamageTier[] = [
  { id: "graze", label: "GRAZE", amount: 4, weight: 0 },
  { id: "hit", label: "HIT", amount: 14, weight: 1 },
  { id: "crit", label: "CRIT", amount: 30, weight: 2 },
  { id: "crush", label: "CRUSH", amount: 58, weight: 3 },
];

const FALLBACK_TIER: DamageTier = DEFAULT_TIERS[0] ?? {
  id: "hit",
  label: "HIT",
  amount: 10,
  weight: 1,
};

/** Weight rank at which a hit counts as "critical" for onCrit, the shake,
 * the starburst ring, and flecks. */
const CRIT_WEIGHT_MIN = 2;
/** Weight rank reserved for CRUSH — the heaviest beat: vignette + caption. */
const CRUSH_WEIGHT = 3;

type Vec = { dx: number; dy: number };

const buildFlecks = (count: number, spread: number): Vec[] =>
  Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * TAU - TAU / 4;
    return { dx: Math.cos(angle) * spread, dy: Math.sin(angle) * spread };
  });

const NO_FLECKS: Vec[] = [];

type TierVisual = {
  color: string;
  sizeClass: string;
  weightClass: string;
  rotateDeg: number;
  /** Scale the number is set to instantly, then springs down to 1 from —
   * 1 means no punch (GRAZE/HIT never pop). */
  peakScale: number;
  risePx: number;
  floatS: number;
  /** Multiplies the shared arc-fan table so heavier tiers stay closer to
   * center (a CRUSH number punches in place more than it drifts). */
  arcScale: number;
  /** 0 = no target shake. */
  shakeAmplitude: number;
  ringScaleEnd: number;
  ringDurationS: number;
  flecks: readonly Vec[];
};

const GRAZE_VISUAL: TierVisual = {
  color: "color-mix(in oklab, var(--ink-2) 74%, transparent)",
  sizeClass: "text-sm",
  weightClass: "font-medium",
  rotateDeg: 0,
  peakScale: 1,
  risePx: 22,
  floatS: 1.1,
  arcScale: 0.2,
  shakeAmplitude: 0,
  ringScaleEnd: 0,
  ringDurationS: 0,
  flecks: NO_FLECKS,
};

const TIER_VISUALS: TierVisual[] = [
  GRAZE_VISUAL,
  {
    color: "color-mix(in oklab, var(--primary) 86%, transparent)",
    sizeClass: "text-base",
    weightClass: "font-semibold",
    rotateDeg: 0,
    peakScale: 1,
    risePx: 30,
    floatS: 0.85,
    arcScale: 1,
    shakeAmplitude: 0,
    ringScaleEnd: 0,
    ringDurationS: 0,
    flecks: NO_FLECKS,
  },
  {
    color: "color-mix(in oklab, var(--warning, #b45309) 88%, transparent)",
    sizeClass: "text-xl",
    weightClass: "font-bold",
    rotateDeg: -7,
    peakScale: 1.3,
    risePx: 38,
    floatS: 0.75,
    arcScale: 0.7,
    shakeAmplitude: -6,
    ringScaleEnd: 2.1,
    ringDurationS: durations.slow,
    flecks: buildFlecks(6, 26),
  },
  {
    color: "color-mix(in oklab, var(--warning, #b45309) 94%, var(--ink))",
    sizeClass: "text-2xl",
    weightClass: "font-black",
    rotateDeg: 11,
    peakScale: 1.55,
    risePx: 46,
    floatS: 0.85,
    arcScale: 0.55,
    shakeAmplitude: -11,
    ringScaleEnd: 2.9,
    ringDurationS: durations.page,
    flecks: buildFlecks(10, 36),
  },
];

const visualFor = (weightIdx: number): TierVisual =>
  TIER_VISUALS[weightIdx] ??
  TIER_VISUALS[TIER_VISUALS.length - 1] ??
  GRAZE_VISUAL;

/** Fixed x-fan table, cycled by a running number index (not by tier) so
 * consecutive floats — of any tier, mid-flurry — spread apart instead of
 * stacking on the same column. No Math.random. */
const ARC_FAN_X = [-26, 18, -12, 30, -34, 10] as const;
const arcFanFor = (numberIdx: number): number =>
  ARC_FAN_X[numberIdx % ARC_FAN_X.length] ?? 0;

const FLURRY_WINDOW_MS = 350;
const FLURRY_HEAT_THRESHOLD = 5;
const CAPTION_HOLD_MS = 1400;
const REDUCED_LIFETIME_MS = 700;
const RING_SIZE_PX = 96;

const HEAT_BORDER_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 75%, transparent)";
const HEAT_TEXT_COLOR =
  "color-mix(in oklab, var(--warning, #b45309) 92%, var(--ink))";
const VIGNETTE_GRADIENT =
  "radial-gradient(ellipse at center, transparent 45%, color-mix(in oklab, var(--warning, #b45309) 42%, transparent) 100%)";

type DamageNumberItem = {
  key: number;
  amount: number;
  weightIdx: number;
  midX: number;
  endX: number;
  midY: number;
  endY: number;
  rotate: number;
  color: string;
  sizeClass: string;
  weightClass: string;
  peakScale: number;
  floatS: number;
};

type RingBurst = { key: number; weightIdx: number };
type BestHit = { amount: number; label: string };
type LastHit = { amount: number; label: string };

export type CritHitProps = {
  /** The fixed outcome cycle, cycled by strike count. @default four tiers — GRAZE, HIT, CRIT, CRUSH */
  tiers?: DamageTier[];
  /** Fires on every CRIT-or-heavier hit (weight ≥ 2), with the amount landed. */
  onCrit?: (amount: number) => void;
  className?: string;
};

/**
 * A training-dummy target you strike, its damage rolling through a fixed
 * four-tier cycle — GRAZE, HIT, CRIT, CRUSH by default — rather than a roll
 * of the dice, so the Nth strike always lands the same tier and a flurry of
 * clicks is always reproducible. Each STRIKE floats its number out along a
 * fixed arc pulled from a vector table cycled by index, so a fast flurry
 * fans numbers apart instead of stacking them; CRIT and above punch the
 * number in on a spring, throw flecks, ring a starburst, and shake the post
 * on a three-keyframe tween, and CRUSH escalates further with a heavier
 * punch, more flecks, a shockwave ring, a vignette flash scoped to the card,
 * and a caption that names it. A damage total rolls in the header through
 * `Readout` alongside the best hit landed, striking within ~350ms of the
 * last hit builds a flurry counter beside the target that heats its outline
 * past five hits before decaying on its own timer, and a mono line under the
 * target tracks strike count and the last hit landed.
 * Reduced motion: numbers appear at their end position and fade with no
 * arcs, the target never shakes, and rings, flecks, and the vignette are all
 * skipped — tiers still read apart by size, weight, and tint.
 */
export function CritHit({
  tiers = DEFAULT_TIERS,
  onCrit,
  className,
}: CritHitProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [total, setTotal] = React.useState(0);
  const [best, setBest] = React.useState<BestHit | null>(null);
  const [lastHit, setLastHit] = React.useState<LastHit | null>(null);
  const [strikeCount, setStrikeCount] = React.useState(0);
  const [flurry, setFlurry] = React.useState(0);
  const [damageNumbers, setDamageNumbers] = React.useState<DamageNumberItem[]>(
    [],
  );
  const [ringBurst, setRingBurst] = React.useState<RingBurst | null>(null);
  const [vignetteKey, setVignetteKey] = React.useState(0);
  const [caption, setCaption] = React.useState<string | null>(null);
  const [announce, setAnnounce] = React.useState("");

  // Refs are the source of truth inside the strike handler and its timers —
  // a rapid flurry of clicks would otherwise race stale state/closures.
  const tiersRef = React.useRef(tiers);
  React.useEffect(() => {
    tiersRef.current = tiers;
  }, [tiers]);
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  }, [motionSafe]);
  const onCritRef = React.useRef(onCrit);
  React.useEffect(() => {
    onCritRef.current = onCrit;
  }, [onCrit]);

  const totalRef = React.useRef(0);
  const bestRef = React.useRef<BestHit | null>(null);
  const strikeCountRef = React.useRef(0);
  const strikeIndexRef = React.useRef(0);
  const flurryRef = React.useRef(0);
  const lastStrikeTimeRef = React.useRef<number | null>(null);
  const numberIndexRef = React.useRef(0);
  const numberKeyRef = React.useRef(0);
  const ringKeyRef = React.useRef(0);
  const vignetteKeyRef = React.useRef(0);

  const flurryTimer = React.useRef<number | null>(null);
  const captionTimer = React.useRef<number | null>(null);
  const numberTimersRef = React.useRef<number[]>([]);

  const shakeX = useMotionValue<number>(0);
  const shakeAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  React.useEffect(() => {
    const numberTimers = numberTimersRef.current;
    return () => {
      if (flurryTimer.current !== null)
        window.clearTimeout(flurryTimer.current);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      numberTimers.forEach((id) => window.clearTimeout(id));
      shakeAnim.current?.stop();
    };
  }, []);

  const handleStrike = (event: React.MouseEvent<HTMLButtonElement>) => {
    const cycle =
      tiersRef.current.length > 0 ? tiersRef.current : DEFAULT_TIERS;
    const cycleIndex = strikeIndexRef.current % cycle.length;
    strikeIndexRef.current += 1;
    const tier = cycle[cycleIndex] ?? cycle[0] ?? FALLBACK_TIER;
    const weightIdx = clamp(
      Math.round(tier.weight),
      0,
      TIER_VISUALS.length - 1,
    );
    const visual = visualFor(weightIdx);

    const nextTotal = totalRef.current + tier.amount;
    totalRef.current = nextTotal;
    setTotal(nextTotal);

    if (bestRef.current === null || tier.amount > bestRef.current.amount) {
      bestRef.current = { amount: tier.amount, label: tier.label };
      setBest(bestRef.current);
    }

    strikeCountRef.current += 1;
    setStrikeCount(strikeCountRef.current);
    setLastHit({ amount: tier.amount, label: tier.label });

    // Flurry window: consecutive strikes inside FLURRY_WINDOW_MS keep the
    // chain alive; anything past it restarts at 1. event.timeStamp — never
    // Date.now — keeps this deterministic under test.
    const now = event.timeStamp;
    const last = lastStrikeTimeRef.current;
    const withinWindow = last !== null && now - last <= FLURRY_WINDOW_MS;
    const nextFlurry = withinWindow ? flurryRef.current + 1 : 1;
    flurryRef.current = nextFlurry;
    lastStrikeTimeRef.current = now;
    setFlurry(nextFlurry);
    if (flurryTimer.current !== null) window.clearTimeout(flurryTimer.current);
    flurryTimer.current = window.setTimeout(() => {
      flurryTimer.current = null;
      flurryRef.current = 0;
      setFlurry(0);
    }, FLURRY_WINDOW_MS);

    const fanIdx = numberIndexRef.current;
    numberIndexRef.current += 1;
    const fan = arcFanFor(fanIdx) * visual.arcScale;
    const rotate = fanIdx % 2 === 0 ? visual.rotateDeg : -visual.rotateDeg;

    numberKeyRef.current += 1;
    const numberKey = numberKeyRef.current;
    const item: DamageNumberItem = {
      key: numberKey,
      amount: tier.amount,
      weightIdx,
      midX: fan * 0.55,
      endX: fan,
      midY: -visual.risePx * 0.5,
      endY: -visual.risePx,
      rotate,
      color: visual.color,
      sizeClass: visual.sizeClass,
      weightClass: visual.weightClass,
      peakScale: visual.peakScale,
      floatS: visual.floatS,
    };
    setDamageNumbers((list) => [...list, item]);

    const lifetimeMs = motionSafeRef.current
      ? visual.floatS * 1000 + 80
      : REDUCED_LIFETIME_MS;
    const numberTimerId = window.setTimeout(() => {
      setDamageNumbers((list) => list.filter((d) => d.key !== numberKey));
      const idx = numberTimersRef.current.indexOf(numberTimerId);
      if (idx !== -1) numberTimersRef.current.splice(idx, 1);
    }, lifetimeMs);
    numberTimersRef.current.push(numberTimerId);

    if (weightIdx >= CRIT_WEIGHT_MIN) {
      onCritRef.current?.(tier.amount);

      if (motionSafeRef.current) {
        shakeAnim.current?.stop();
        shakeX.set(0);
        shakeAnim.current = animate(shakeX, [0, visual.shakeAmplitude, 0], {
          duration: durations.base,
          ease: easings.move,
          times: [0, 0.5, 1],
        });

        ringKeyRef.current += 1;
        setRingBurst({ key: ringKeyRef.current, weightIdx });
      }
    }

    if (weightIdx === CRUSH_WEIGHT) {
      if (motionSafeRef.current) {
        vignetteKeyRef.current += 1;
        setVignetteKey(vignetteKeyRef.current);
      }
      setCaption(`${tier.label}!`);
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
      captionTimer.current = window.setTimeout(() => {
        captionTimer.current = null;
        setCaption(null);
      }, CAPTION_HOLD_MS);
    }

    setAnnounce(`${tier.label} for ${tier.amount}. Total ${nextTotal}.`);
  };

  const heated = flurry >= FLURRY_HEAT_THRESHOLD;
  const flurryLabel =
    flurry <= 0 ? null : heated ? `flurry ×${flurry}` : `×${flurry}`;
  const crushColor = visualFor(CRUSH_WEIGHT).color;

  return (
    <div
      role="group"
      aria-label="Crit hit"
      className={cn(
        "relative w-full max-w-sm overflow-hidden rounded-4 border border-hairline bg-surface-1 p-5 shadow-raised",
        className,
      )}
    >
      <div>
        <span className="font-mono text-[10px] font-medium tracking-[0.16em] text-ink-3 uppercase">
          damage
        </span>
        <div className="mt-1">
          <Readout value={total} size="xl" />
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-ink-3">
          best hit {best ? `${best.amount} · ${best.label}` : "—"}
        </p>
      </div>

      <div className="relative mt-6 flex items-center justify-center gap-4">
        <div className="relative">
          <span
            aria-hidden
            className="absolute top-[92%] left-1/2 h-8 w-3 -translate-x-1/2 rounded-b-1 border border-hairline-strong bg-surface-2"
          />

          <motion.button
            type="button"
            aria-label="Strike the target"
            onClick={handleStrike}
            style={{
              x: shakeX,
              borderColor: heated ? HEAT_BORDER_COLOR : undefined,
            }}
            className={cn(
              "relative flex size-28 items-center justify-center rounded-full border-2 border-hairline-strong bg-surface-2 shadow-raised transition-colors duration-300 outline-none",
              "hover:brightness-105 active:brightness-95",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-2 rounded-full"
              style={{
                background:
                  "color-mix(in oklab, var(--warning, #b45309) 22%, var(--card))",
              }}
            />
            <span
              aria-hidden
              className="absolute inset-6 rounded-full"
              style={{
                background:
                  "color-mix(in oklab, var(--warning, #b45309) 46%, var(--card))",
              }}
            />
            <span
              aria-hidden
              className="absolute inset-[38px] rounded-full"
              style={{
                background:
                  "color-mix(in oklab, var(--warning, #b45309) 78%, var(--card))",
              }}
            />
            <span
              aria-hidden
              className="relative size-2.5 rounded-full"
              style={{ background: "var(--ink)" }}
            />
          </motion.button>

          <div aria-hidden className="pointer-events-none absolute inset-0">
            {damageNumbers.map((d) => (
              <span
                key={d.key}
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <motion.span
                  className={cn(
                    "block font-mono whitespace-nowrap tabular-nums",
                    d.sizeClass,
                    d.weightClass,
                  )}
                  style={{ color: d.color }}
                  initial={
                    motionSafe
                      ? {
                          x: 0,
                          y: 0,
                          opacity: 0,
                          scale: d.peakScale,
                          rotate: 0,
                        }
                      : { x: d.endX, y: d.endY, opacity: 0, rotate: 0 }
                  }
                  animate={
                    motionSafe
                      ? {
                          x: [0, d.midX, d.endX],
                          y: [0, d.midY, d.endY],
                          opacity: [0, 1, 1, 0],
                          scale: 1,
                          rotate: d.rotate,
                        }
                      : { opacity: 1 }
                  }
                  transition={
                    motionSafe
                      ? {
                          x: {
                            duration: d.floatS,
                            ease: easings.move,
                            times: [0, 0.45, 1],
                          },
                          y: {
                            duration: d.floatS,
                            ease: easings.exit,
                            times: [0, 0.45, 1],
                          },
                          opacity: {
                            duration: d.floatS,
                            ease: easings.exit,
                            times: [0, 0.12, 0.7, 1],
                          },
                          scale:
                            d.peakScale > 1
                              ? springs.recoil
                              : {
                                  duration: durations.fast,
                                  ease: easings.enter,
                                },
                          rotate: {
                            duration: durations.fast,
                            ease: easings.enter,
                          },
                        }
                      : { duration: durations.fast, ease: easings.enter }
                  }
                >
                  {d.amount}
                </motion.span>
              </span>
            ))}

            {motionSafe && ringBurst && (
              <React.Fragment key={ringBurst.key}>
                <span
                  className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{ width: RING_SIZE_PX, height: RING_SIZE_PX }}
                >
                  <motion.span
                    className={cn(
                      "absolute inset-0 rounded-full",
                      ringBurst.weightIdx === CRUSH_WEIGHT
                        ? "border-4"
                        : "border-2",
                    )}
                    style={{
                      borderColor: visualFor(ringBurst.weightIdx).color,
                    }}
                    initial={{ scale: 0.55, opacity: 0.9 }}
                    animate={{
                      scale: visualFor(ringBurst.weightIdx).ringScaleEnd,
                      opacity: 0,
                    }}
                    transition={{
                      duration: visualFor(ringBurst.weightIdx).ringDurationS,
                      ease: easings.exit,
                    }}
                  />
                </span>
                <span className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {visualFor(ringBurst.weightIdx).flecks.map((f, i) => (
                    <motion.span
                      key={i}
                      className="absolute size-[3px] rounded-full"
                      style={{
                        background: visualFor(ringBurst.weightIdx).color,
                      }}
                      initial={{ x: 0, y: 0, opacity: 1 }}
                      animate={{ x: f.dx, y: f.dy, opacity: 0 }}
                      transition={{
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    />
                  ))}
                </span>
              </React.Fragment>
            )}

            <div className="absolute inset-x-0 top-1 flex justify-center">
              <AnimatePresence>
                {caption && (
                  <motion.span
                    key={caption}
                    className="font-mono text-lg font-black tracking-wide whitespace-nowrap"
                    style={{ color: crushColor }}
                    initial={motionSafe ? { opacity: 0, scale: 0.6 } : false}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={
                      motionSafe
                        ? {
                            opacity: 0,
                            transition: {
                              duration: durations.slow,
                              ease: easings.exit,
                            },
                          }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  >
                    {caption}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {flurryLabel && (
          <span
            className="rounded-1 border px-1.5 py-0.5 font-mono text-[10px] font-semibold whitespace-nowrap text-ink-2 uppercase transition-colors duration-300"
            style={
              heated
                ? { borderColor: HEAT_BORDER_COLOR, color: HEAT_TEXT_COLOR }
                : { borderColor: "var(--hairline-strong)" }
            }
          >
            {flurryLabel}
          </span>
        )}
      </div>

      <p className="mt-4 text-center font-mono text-[11px] text-ink-3">
        strikes {strikeCount} · last{" "}
        {lastHit ? `${lastHit.label.toLowerCase()} +${lastHit.amount}` : "—"}
      </p>

      {motionSafe && vignetteKey > 0 && (
        <motion.span
          key={vignetteKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-4"
          style={{ background: VIGNETTE_GRADIENT }}
          initial={{ opacity: 0.85 }}
          animate={{ opacity: 0 }}
          transition={{ duration: durations.slow, ease: easings.exit }}
        />
      )}

      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
