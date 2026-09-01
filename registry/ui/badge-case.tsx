"use client";

import * as React from "react";

import {
  Anchor,
  Check,
  CloudLightning,
  Compass,
  Ghost,
  Hammer,
  Link,
  Lock,
  Ship,
  Waves,
} from "lucide-react";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { clamp } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";
import { Readout } from "@/registry/ui/readout";

/** Medallion footprint (px) and its hexagon silhouette, shared by every badge. */
const MEDALLION_SIZE = 64;
const HEX_CLIP =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

/** How long a name-and-hint caption holds before it clears. */
const CAPTION_MS = 1400;
/** The wide sweep that crosses the case on completion. */
const PANEL_SWEEP_S = 0.6;
/** The per-badge flash that rides the completion cascade. */
const PULSE_S = 0.5;
const PULSE_TIMES = [0, 0.4, 1] as const;

/** How far a badge lifts before settling back on `springs.recoil`. */
const LIFT_PEAK_BASE = 8;
/** The impact ring's base diameter, before a rarer badge's bigger reaction. */
const RING_SIZE_BASE = 88;
/** Six fixed spark vectors, never random — trig off a fixed count. */
const SPARK_COUNT = 6;
const SPARK_SPREAD_BASE = 22;
const TAU = Math.PI * 2;

/** Rarity below this percent starts warming the badge's tint and reaction;
 * at 0% it reaches the full warm step. Not a hard rarity tier, just a dial. */
const RARE_THRESHOLD = 25;
const WARM_STEP_MAX = 70;
const REACTION_SCALE_MAX = 0.5;

/** How warm (toward `--warn`) a badge's tint runs, as a color-mix percent —
 * 0 for anything at or above the rarity threshold, climbing toward
 * `WARM_STEP_MAX` as rarity approaches zero. */
function warmPctFor(rarity: number): number {
  const pct = clamp(rarity, 0, 100);
  if (pct >= RARE_THRESHOLD) return 0;
  return Math.round(((RARE_THRESHOLD - pct) / RARE_THRESHOLD) * WARM_STEP_MAX);
}

function tintFor(rarity: number): string {
  const warm = warmPctFor(rarity);
  return warm > 0
    ? `color-mix(in oklab, var(--warn) ${warm}%, var(--primary) ${100 - warm}%)`
    : "var(--primary)";
}

/** Rarer badges react bigger — up to 1.5× the spark spread, ring size, and
 * lift peak of the most common badge in the case. */
function reactionScaleFor(rarity: number): number {
  return 1 + (warmPctFor(rarity) / WARM_STEP_MAX) * REACTION_SCALE_MAX;
}

function sparkVectors(spread: number): { dx: number; dy: number }[] {
  return Array.from({ length: SPARK_COUNT }, (_, i) => {
    const angle = (i / SPARK_COUNT) * TAU - TAU / 4;
    return { dx: Math.cos(angle) * spread, dy: Math.sin(angle) * spread };
  });
}

/** The badge's glyph, cycling through a fixed set by position — the `Badge`
 * type carries no icon field, so every badge in the case draws from the same
 * shipwright set in order. A pure lookup returning the rendered element,
 * never a component reference, so it stays safe to call during render. */
function glyphFor(index: number, className: string): React.JSX.Element {
  switch (index % 8) {
    case 0:
      return <Hammer aria-hidden className={className} />;
    case 1:
      return <Anchor aria-hidden className={className} />;
    case 2:
      return <Link aria-hidden className={className} />;
    case 3:
      return <Ship aria-hidden className={className} />;
    case 4:
      return <Compass aria-hidden className={className} />;
    case 5:
      return <Waves aria-hidden className={className} />;
    case 6:
      return <CloudLightning aria-hidden className={className} />;
    default:
      return <Ghost aria-hidden className={className} />;
  }
}

export type Badge = {
  id: string;
  name: string;
  /** Mono hint shown while locked, and folded into the unlock caption. */
  hint: string;
  /** Percent of players who hold this badge — the social proof, and the
   * dial on how warm its tint runs and how big its unlock reaction lands. */
  rarity: number;
  /** True for the one badge whose name stays masked ("? ? ?") until found. */
  secret?: boolean;
};

const DEFAULT_BADGES: readonly Badge[] = [
  {
    id: "first-cut",
    name: "FIRST CUT",
    hint: "make your first cut",
    rarity: 92,
  },
  { id: "keel-layer", name: "KEEL LAYER", hint: "lay 10 keels", rarity: 68 },
  {
    id: "rope-splice",
    name: "ROPE SPLICE",
    hint: "splice 40 lines",
    rarity: 51,
  },
  { id: "hull-smith", name: "HULL SMITH", hint: "plank 25 hulls", rarity: 33 },
  {
    id: "harbourmaster",
    name: "HARBOURMASTER",
    hint: "cut 50 boards",
    rarity: 19,
  },
  {
    id: "tide-reader",
    name: "TIDE READER",
    hint: "predict 20 tides",
    rarity: 24,
  },
  {
    id: "storm-runner",
    name: "STORM RUNNER",
    hint: "sail through 5 storms",
    rarity: 7,
  },
  {
    id: "ghost-ship",
    name: "GHOST SHIP",
    hint: "found by accident",
    rarity: 2,
    secret: true,
  },
] as const;

type BadgeMedallionProps = {
  badge: Badge;
  index: number;
  unlocked: boolean;
  motionSafe: boolean;
  /** A fresh id triggers this badge's own unlock ceremony; null otherwise. */
  unlockToken: number | null;
  cascadeDelay: number;
  /** 0 until the case completes, then a fresh id per completion. */
  completeKey: number;
  completeDelay: number;
  onSequenceDone: () => void;
};

/** One achievement medallion. Owns the motion values its unlock ceremony
 * needs — fill scale, the flip's scaleX, and the lift's y — so the parent
 * grid never calls a hook inside its badge map. */
function BadgeMedallion({
  badge,
  index,
  unlocked,
  motionSafe,
  unlockToken,
  cascadeDelay,
  completeKey,
  completeDelay,
  onSequenceDone,
}: BadgeMedallionProps): React.JSX.Element {
  // `revealedState` only ever flips true from inside the motion-safe chain
  // below. Reduced motion never touches it — it commits straight through the
  // `unlocked` prop instead, so the two are combined here at render time
  // rather than synced through an effect.
  const [revealedState, setRevealedState] = React.useState(unlocked);
  const revealed = revealedState || unlocked;
  const [impactKey, setImpactKey] = React.useState(0);

  const fillScale = useMotionValue<number>(unlocked ? 1 : 0);
  const flipScaleX = useMotionValue<number>(1);
  const liftY = useMotionValue<number>(0);

  const fillAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const flipAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const liftAnim = React.useRef<ReturnType<typeof animate> | null>(null);

  const onSequenceDoneRef = React.useRef(onSequenceDone);
  React.useEffect(() => {
    onSequenceDoneRef.current = onSequenceDone;
  }, [onSequenceDone]);

  React.useEffect(() => {
    return () => {
      fillAnim.current?.stop();
      flipAnim.current?.stop();
      liftAnim.current?.stop();
    };
  }, []);

  // Reduced motion commits `unlocked` straight through, without ever sending
  // this badge an unlock token — the chain below never runs, so it never
  // sets `fillScale` either. This keeps the motion value itself correct
  // (rather than deriving the style from `motionSafe` at render time), which
  // also survives the OS setting flipping live after the commit. `.set()` is
  // a motion-value write, not React state — nothing here re-renders.
  React.useEffect(() => {
    if (unlocked) fillScale.set(1);
  }, [unlocked, fillScale]);

  React.useEffect(() => {
    if (unlockToken == null || !motionSafe) return;

    const liftPeak = LIFT_PEAK_BASE * reactionScaleFor(badge.rarity);

    // Stage 1 — the silhouette fills from centre.
    fillAnim.current?.stop();
    fillScale.set(0);
    fillAnim.current = animate(fillScale, 1, {
      ...springs.glide,
      onComplete: () => {
        // Stage 2a — the lock flips out (shrinks to nothing).
        flipAnim.current?.stop();
        flipScaleX.set(1);
        flipAnim.current = animate(flipScaleX, 0, {
          duration: durations.fast,
          ease: easings.exit,
          onComplete: () => {
            // The face swaps at the midpoint, while scaleX sits at zero.
            setRevealedState(true);
            // Stage 2b — the real glyph flips in.
            flipAnim.current = animate(flipScaleX, 1, {
              duration: durations.base,
              ease: easings.enter,
              onComplete: () => {
                // Stage 3 & 4 — ring, sparks, and a set-then-spring lift.
                setImpactKey((k) => k + 1);
                liftAnim.current?.stop();
                liftY.set(-liftPeak);
                liftAnim.current = animate(liftY, 0, {
                  ...springs.recoil,
                  onComplete: () => {
                    onSequenceDoneRef.current();
                  },
                });
              },
            });
          },
        });
      },
    });
    // fillScale/flipScaleX/liftY are stable across renders, like refs — this
    // effect actually reruns only when a fresh unlock token arrives.
  }, [unlockToken, motionSafe, badge.rarity, fillScale, flipScaleX, liftY]);

  const rarity = Math.round(clamp(badge.rarity, 0, 100));
  const tint = tintFor(badge.rarity);
  const ringSize = RING_SIZE_BASE * reactionScaleFor(badge.rarity);
  const sparks = sparkVectors(
    SPARK_SPREAD_BASE * reactionScaleFor(badge.rarity),
  );
  const isLockedDisplay = !revealed;
  const showSecret = badge.secret === true && isLockedDisplay;
  const displayName = showSecret ? "? ? ?" : badge.name;

  return (
    <motion.div
      className="group relative flex flex-col items-center gap-1.5 text-center"
      initial={motionSafe ? { opacity: 0, y: distances.step } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              duration: durations.base,
              ease: easings.enter,
              delay: cascadeDelay,
            }
          : { duration: 0 }
      }
      whileHover={
        isLockedDisplay && motionSafe
          ? { y: -3, transition: springs.flick }
          : undefined
      }
    >
      <div
        className="relative"
        style={{ width: MEDALLION_SIZE, height: MEDALLION_SIZE }}
      >
        <motion.div className="absolute inset-0" style={{ y: liftY }}>
          <span
            aria-hidden
            className={cn(
              "absolute inset-0",
              isLockedDisplay && "bg-surface-2",
            )}
            style={{
              clipPath: HEX_CLIP,
              boxShadow: !isLockedDisplay
                ? `var(--edge-highlight), 0 0 0 1px color-mix(in oklab, ${tint} 45%, transparent)`
                : "var(--edge-highlight)",
            }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0"
            style={{
              clipPath: HEX_CLIP,
              background: `linear-gradient(155deg, color-mix(in oklab, ${tint} 85%, var(--card)) 0%, color-mix(in oklab, ${tint} 45%, var(--card)) 100%)`,
              scale: fillScale,
            }}
          />

          <span className="absolute inset-0 flex items-center justify-center">
            <motion.span
              className="flex items-center justify-center"
              style={{ scaleX: flipScaleX }}
            >
              {revealed ? (
                glyphFor(index, "size-6 text-primary-foreground")
              ) : (
                <Lock aria-hidden className="size-5 text-ink-3" />
              )}
            </motion.span>
          </span>

          {motionSafe && impactKey > 0 && (
            <motion.span
              key={`ring-${impactKey}`}
              aria-hidden
              className="pointer-events-none absolute rounded-full"
              style={{
                left: "50%",
                top: "50%",
                width: ringSize,
                height: ringSize,
                marginLeft: -(ringSize / 2),
                marginTop: -(ringSize / 2),
                border: `2px solid ${tint}`,
              }}
              initial={{ scale: 0.6, opacity: 0.9 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: durations.slow, ease: easings.exit }}
            />
          )}

          {motionSafe && impactKey > 0 && (
            <span
              key={`sparks-${impactKey}`}
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            >
              {sparks.map((s, i) => (
                <motion.span
                  key={i}
                  className="absolute size-1 rounded-full"
                  style={{ background: tint }}
                  initial={{ x: 0, y: 0, opacity: 1 }}
                  animate={{ x: s.dx, y: s.dy, opacity: 0 }}
                  transition={{ duration: durations.slow, ease: easings.exit }}
                />
              ))}
            </span>
          )}

          {motionSafe && completeKey > 0 && (
            <motion.span
              key={`pulse-${completeKey}`}
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                clipPath: HEX_CLIP,
                background:
                  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.5) 50%, transparent 100%)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: PULSE_S,
                times: [...PULSE_TIMES],
                ease: easings.move,
                delay: completeDelay,
              }}
            />
          )}
        </motion.div>
      </div>

      <span
        className={cn(
          "max-w-[104px] text-xs leading-tight font-semibold",
          isLockedDisplay ? "text-ink-2" : "text-ink",
        )}
      >
        {displayName}
      </span>

      {isLockedDisplay ? (
        <span className="max-w-[104px] text-label text-ink-3 transition-colors group-hover:text-ink-2">
          {showSecret ? "found by accident" : badge.hint}
        </span>
      ) : (
        <span className="flex flex-col items-center gap-1">
          <span className="flex items-center gap-1 rounded-2 border border-hairline-strong bg-surface-2 px-1.5 py-0.5 text-label text-ink-2">
            <Check aria-hidden className="size-2.5 text-success" />
            earned
          </span>
          <span className="text-label" style={{ color: tint }}>
            earned by {rarity}%
          </span>
        </span>
      )}
    </motion.div>
  );
}

export type BadgeCaseProps = {
  /** The case, in fixed unlock order. @default 8 shipwright badges, one secret */
  badges?: Badge[];
  /** How many badges, from the front of the array, start unlocked. @default 3 */
  unlocked?: number;
  /** Fires once, as each unlock begins. */
  onUnlock?: (id: string) => void;
  className?: string;
};

/**
 * A case of achievement badges, most of them still locked. Each hexagonal
 * medallion keeps its name legible even while locked — a locked achievement
 * whose name is hidden teaches nothing about what to chase — pairing it with
 * either a mono hint ("cut 50 boards") or, once earned, an "earned" tag and
 * an "earned by N%" rarity line that runs warmer and reacts bigger the rarer
 * it is. Exactly one badge is a secret, its name masked "? ? ?" until found.
 * The single "Unlock the next badge" button always opens the next locked
 * medallion in fixed order: the silhouette fills from centre on
 * `springs.glide`, the lock flips to the real glyph across two chained
 * tweens, a ring and six fixed sparks fire, the badge lifts on a
 * set-then-`springs.recoil` settle, a mono caption names what was earned,
 * and the header count rolls on `Readout`. Clearing the case sweeps it once
 * and pulses every medallion through a `cascade()`, and the caption settles
 * on "case complete". Reduced motion: no fill, flip, sparks, or sweep — an
 * unlock swaps the badge straight to its unlocked state, with the caption
 * still flashing.
 */
export function BadgeCase({
  badges = [...DEFAULT_BADGES],
  unlocked = 3,
  onUnlock,
  className,
}: BadgeCaseProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const total = badges.length;
  const cascadeStep = cascade(total);

  const [unlockedFlags, setUnlockedFlags] = React.useState<boolean[]>(() => {
    const seedCount = clamp(Math.round(unlocked), 0, total);
    return badges.map((_, i) => i < seedCount);
  });
  const [unlockingIndex, setUnlockingIndex] = React.useState<number | null>(
    null,
  );
  const [unlockToken, setUnlockToken] = React.useState(0);
  const [flareCaption, setFlareCaption] = React.useState<string | null>(null);
  const [completeKey, setCompleteKey] = React.useState(0);
  const [announce, setAnnounce] = React.useState("");

  const idCounter = React.useRef(0);
  const captionTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (captionTimer.current !== null)
        window.clearTimeout(captionTimer.current);
    };
  }, []);

  const unlockedCount = unlockedFlags.filter(Boolean).length;
  const allUnlocked = total > 0 && unlockedCount >= total;

  const commitUnlock = (index: number) => {
    setUnlockingIndex(null);
    const badge = badges[index];
    if (!badge) return;

    const next = unlockedFlags.map((v, i) => (i === index ? true : v));
    setUnlockedFlags(next);

    setFlareCaption(`${badge.name} · ${badge.hint}`);
    if (captionTimer.current !== null)
      window.clearTimeout(captionTimer.current);
    captionTimer.current = window.setTimeout(() => {
      captionTimer.current = null;
      setFlareCaption(null);
    }, CAPTION_MS);

    const willComplete = total > 0 && next.every(Boolean);
    setAnnounce(
      willComplete
        ? `${badge.name} unlocked. Case complete.`
        : `${badge.name} unlocked.`,
    );
    if (willComplete && motionSafe) setCompleteKey((k) => k + 1);
  };

  const handleUnlock = () => {
    if (unlockingIndex !== null) return;
    const nextIndex = unlockedFlags.findIndex((v) => !v);
    if (nextIndex === -1) return;
    const badge = badges[nextIndex];
    if (!badge) return;

    onUnlock?.(badge.id);

    if (!motionSafe) {
      commitUnlock(nextIndex);
      return;
    }

    setUnlockingIndex(nextIndex);
    idCounter.current += 1;
    setUnlockToken(idCounter.current);
  };

  const captionText = flareCaption ?? (allUnlocked ? "case complete" : "");
  const unlockDisabled = unlockingIndex !== null || allUnlocked;

  return (
    <div
      className={cn(
        "relative w-full max-w-2xl rounded-4 border border-hairline bg-surface-1 p-5",
        className,
      )}
    >
      {completeKey > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
        >
          <motion.span
            key={completeKey}
            className="absolute inset-y-0 w-1/4 bg-primary-foreground/10"
            style={{ skewX: -14 }}
            initial={{ x: "-160%" }}
            animate={{ x: "420%" }}
            transition={
              motionSafe
                ? { duration: PANEL_SWEEP_S, ease: easings.linear }
                : { duration: 0 }
            }
          />
        </span>
      )}

      <div className="flex items-baseline gap-1.5 text-label text-ink-3">
        <span>achievements</span>
        <span aria-hidden>·</span>
        <Readout value={unlockedCount} size="sm" className="text-ink-2" />
        <span>of {total}</span>
      </div>

      <div className="relative mt-4 grid grid-cols-4 gap-x-3 gap-y-5">
        {badges.map((badge, i) => (
          <BadgeMedallion
            key={badge.id}
            badge={badge}
            index={i}
            unlocked={unlockedFlags[i] ?? false}
            motionSafe={motionSafe}
            unlockToken={unlockingIndex === i ? unlockToken : null}
            cascadeDelay={i * cascadeStep}
            completeKey={completeKey}
            completeDelay={i * cascadeStep}
            onSequenceDone={() => commitUnlock(i)}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span
          aria-hidden
          className="flex h-4 items-center overflow-hidden font-mono text-[11px] text-ink-3"
        >
          <AnimatePresence mode="wait" initial={false}>
            {captionText && (
              <motion.span
                key={captionText}
                initial={motionSafe ? { opacity: 0, y: 4 } : { opacity: 1 }}
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
                className="tracking-[0.06em] uppercase"
              >
                {captionText}
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <motion.button
          type="button"
          aria-label="Unlock the next badge"
          onClick={handleUnlock}
          disabled={unlockDisabled}
          whileTap={motionSafe && !unlockDisabled ? { scale: 0.94 } : undefined}
          transition={springs.flick}
          className={cn(
            "rounded-2 bg-primary px-3 py-1.5 font-mono text-xs font-semibold tracking-wide text-primary-foreground uppercase shadow-raised transition-[filter] outline-none",
            "hover:brightness-110 active:brightness-95",
            "disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
          )}
        >
          Unlock
        </motion.button>
      </div>

      <span role="status" aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
