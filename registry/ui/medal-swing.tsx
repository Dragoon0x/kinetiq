"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Mirrors registry/ui/caliper-slider.tsx — avoids the "useLayoutEffect does
 * nothing on the server" warning while still priming the off-stage position
 * before the browser's first paint (a plain useEffect runs after paint, which
 * would flash the medal at rest for a frame before it jumped up to drop in). */
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

/** Stage geometry (px). */
const STAGE_W = 170;
const STAGE_H = 190;

/** Pivot mount — the lanyard's top point, and the swing's transform origin. */
const LANYARD_TOP = 14;

/** Lanyard ribbon — two bands sharing the pivot, flaring down to the disc. */
const LANYARD_H = 38;
const BAND_W = 9;
const BAND_LEN = 44;
const BAND_ANGLE = 15;

/** Medal disc. */
const DISC_D = 84;
const RIM_THICKNESS = 9;
const INNER_D = DISC_D - RIM_THICKNESS * 2;
const STAR_SIZE = 26;

/** Fixed ring of fluting marks around the rim — trig, not randomness. */
const NOTCH_COUNT = 26;
const NOTCH_LEN = 7;
const NOTCH_W = 2;
const NOTCH_ANGLES: readonly number[] = Array.from(
  { length: NOTCH_COUNT },
  (_, i) => (i * 360) / NOTCH_COUNT,
);

/** Arrival — the medal starts this far above rest and drops in on a spring. */
const ARRIVE_FROM = -150;

/** Decaying swings — tweens with explicit times, never springs. The arrival
 * swing carries more energy (it just fell); the tap swing is a light nudge. */
const ARRIVE_SWING = [0, -14, 10, -6, 3, 0] as const;
const ARRIVE_SWING_TIMES = [0, 0.16, 0.38, 0.6, 0.82, 1] as const;
const ARRIVE_SWING_DURATION = 1;

const TAP_SWING = [0, -7, 5, -2, 0] as const;
const TAP_SWING_TIMES = [0, 0.22, 0.55, 0.8, 1] as const;
const TAP_SWING_DURATION = 0.6;

/** Glint — a skewed band sweeping left-to-right behind the disc's own
 * overflow-hidden circle. Hidden left/right sit outside that circle. */
const GLINT_W = 26;
const GLINT_HIDDEN_LEFT = -(GLINT_W + 18);
const GLINT_VISIBLE_LEFT = DISC_D + 18;
const GLINT_CENTER_LEFT = (DISC_D - GLINT_W) / 2;
const GLINT_SWEEP_DURATION = 0.7;
const GLINT_INTERVAL_MS = 5000;

/** How long the reduced-motion flash holds before it clears. */
const FLASH_HOLD_MS = 260;

const SHEEN =
  "linear-gradient(115deg, transparent 0%, oklch(1 0 0 / 0.05) 22%, oklch(1 0 0 / 0.55) 50%, oklch(1 0 0 / 0.05) 78%, transparent 100%)";

export type MedalSwingProps = {
  /** Ribbon and disc tint. @default "gold" */
  tier?: "gold" | "silver" | "bronze";
  /** Right half of the caption, e.g. "gold · first place". @default "first place" */
  label?: string;
  /** Fires when the medal is (re-)awarded via the button. */
  onAward?: () => void;
  className?: string;
};

/** Each tier's base hue — bronze is a color-mixed warm blend, not a token. */
const TIER_BASE: Record<NonNullable<MedalSwingProps["tier"]>, string> = {
  gold: "var(--warning, #b45309)",
  silver: "var(--ink-2)",
  bronze: "color-mix(in oklab, var(--warning, #b45309) 58%, #7c2d12 42%)",
};

/**
 * A medal that drops onto its lanyard, swings a few times, and settles into
 * a steady shine. It arrives the moment it mounts — the ribbon and disc fall
 * in on a spring, then a decaying rotate tween swings the assembly to rest
 * at the lanyard's pivot — and the "Award it" button replays the same
 * arrival on demand. Once it settles, a diagonal sheen sweeps the disc and
 * keeps sweeping on a slow interval; hovering pulls one extra sweep (never
 * stacking two at once), and tapping the disc itself gives it one more,
 * smaller swing. A mono caption underneath reads the tier and the label.
 * Reduced motion: the medal is simply present, with no drop, swing, or
 * repeating sheen — a click (the button or the disc) flashes the sheen once
 * as a static highlight for a beat.
 */
export function MedalSwing({
  tier = "gold",
  label = "first place",
  onAward,
  className,
}: MedalSwingProps): React.JSX.Element {
  const motionSafe = useMotionSafe();

  const [status, setStatus] = React.useState("");

  const dropY = useMotionValue(0);
  const swingRotate = useMotionValue(0);
  const glintLeft = useMotionValue(GLINT_HIDDEN_LEFT);
  const glintOpacity = useMotionValue(0);

  const dropAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const swingAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const glintAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const glintInterval = React.useRef<number | null>(null);
  const flashTimer = React.useRef<number | null>(null);
  const glintRunning = React.useRef(false);

  /** Sweeps the glint once, guarded so hover-spam and the interval never
   * stack two sweeps on top of each other. */
  const triggerGlint = () => {
    if (glintRunning.current) return;
    glintRunning.current = true;
    glintAnim.current?.stop();
    glintLeft.set(GLINT_HIDDEN_LEFT);
    glintAnim.current = animate(glintLeft, GLINT_VISIBLE_LEFT, {
      duration: GLINT_SWEEP_DURATION,
      ease: easings.move,
      onComplete: () => {
        glintRunning.current = false;
      },
    });
  };

  /** Reduced motion's stand-in for the sweep: an instant highlight that
   * holds for a beat, no translation. */
  const flash = () => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    glintOpacity.set(1);
    flashTimer.current = window.setTimeout(() => {
      glintOpacity.set(0);
      flashTimer.current = null;
    }, FLASH_HOLD_MS);
  };

  /** The arrival itself — drop, swing, then the glint takes over. Reusable
   * for the automatic mount play and for the "Award it" replay; purely
   * motion-value work, so it is safe to call from the mount effect below. */
  const beginArrival = () => {
    dropAnim.current?.stop();
    swingAnim.current?.stop();
    glintAnim.current?.stop();
    if (glintInterval.current !== null) {
      window.clearInterval(glintInterval.current);
      glintInterval.current = null;
    }
    glintRunning.current = false;

    if (!motionSafe) {
      dropY.set(0);
      swingRotate.set(0);
      glintOpacity.set(0);
      return;
    }

    dropY.set(ARRIVE_FROM);
    swingRotate.set(0);
    glintOpacity.set(1);

    dropAnim.current = animate(dropY, 0, {
      ...springs.glide,
      onComplete: () => {
        swingAnim.current = animate(swingRotate, [...ARRIVE_SWING], {
          duration: ARRIVE_SWING_DURATION,
          ease: easings.move,
          times: [...ARRIVE_SWING_TIMES],
          onComplete: () => {
            triggerGlint();
            glintInterval.current = window.setInterval(
              triggerGlint,
              GLINT_INTERVAL_MS,
            );
          },
        });
      },
    });
  };

  useIsomorphicLayoutEffect(() => {
    beginArrival();
    return () => {
      dropAnim.current?.stop();
      swingAnim.current?.stop();
      glintAnim.current?.stop();
      if (glintInterval.current !== null)
        window.clearInterval(glintInterval.current);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
    // Mount-only: the medal arrives once when this instance appears, not
    // every time motionSafe or props happen to change on a later render.
  }, []);

  const handleAward = () => {
    beginArrival();
    if (!motionSafe) flash();
    onAward?.();
    setStatus(`${tier} medal awarded — ${label}.`);
  };

  const handleDiscClick = () => {
    if (!motionSafe) {
      flash();
      return;
    }
    swingAnim.current?.stop();
    swingRotate.set(0);
    swingAnim.current = animate(swingRotate, [...TAP_SWING], {
      duration: TAP_SWING_DURATION,
      ease: easings.move,
      times: [...TAP_SWING_TIMES],
    });
  };

  const handleDiscHover = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!motionSafe || event.pointerType !== "mouse") return;
    triggerGlint();
  };

  const base = TIER_BASE[tier];
  const lanyardColor = `color-mix(in oklab, ${base} 75%, transparent)`;
  const rimColor = `linear-gradient(155deg, color-mix(in oklab, ${base} 88%, var(--card)) 0%, color-mix(in oklab, ${base} 58%, var(--card)) 100%)`;
  const faceColor = `color-mix(in oklab, ${base} 42%, var(--card))`;
  const notchColor = `color-mix(in oklab, ${base} 55%, var(--ink))`;
  const starColor = `color-mix(in oklab, var(--card) 78%, ${base} 22%)`;
  const glintLeftValue = motionSafe ? glintLeft : GLINT_CENTER_LEFT;

  return (
    <div
      className={cn("inline-flex flex-col items-center select-none", className)}
    >
      <div
        className="relative overflow-hidden rounded-4 border border-hairline bg-surface-1 shadow-raised"
        style={{ width: STAGE_W, height: STAGE_H }}
      >
        {/* Lanyard + disc — one pivot carries both the drop and the swing,
            pivoting at its own top edge. Centered via marginLeft, not a
            translate-x class: Motion writes its own inline `transform` for
            y/rotate here, which would clobber a class-based translateX. */}
        <motion.div
          className="absolute left-1/2"
          style={{
            top: LANYARD_TOP,
            marginLeft: -(DISC_D / 2),
            y: dropY,
            rotate: swingRotate,
            transformOrigin: "top center",
          }}
        >
          {/* Two angled bands sharing the pivot point, meeting at the top */}
          <div
            style={{ position: "relative", width: DISC_D, height: LANYARD_H }}
          >
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                top: 0,
                left: "50%",
                marginLeft: -(BAND_W / 2),
                width: BAND_W,
                height: BAND_LEN,
                transformOrigin: "top center",
                transform: `rotate(-${BAND_ANGLE}deg)`,
                background: lanyardColor,
              }}
            />
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                top: 0,
                left: "50%",
                marginLeft: -(BAND_W / 2),
                width: BAND_W,
                height: BAND_LEN,
                transformOrigin: "top center",
                transform: `rotate(${BAND_ANGLE}deg)`,
                background: lanyardColor,
              }}
            />
          </div>

          <button
            type="button"
            aria-label="Swing the medal"
            onClick={handleDiscClick}
            onPointerEnter={handleDiscHover}
            className="relative block appearance-none rounded-full border border-hairline-strong p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
            style={{
              width: DISC_D,
              height: DISC_D,
              marginTop: -8,
              overflow: "hidden",
              background: rimColor,
            }}
          >
            {/* Inner face */}
            <span
              aria-hidden
              className="absolute rounded-full"
              style={{
                left: "50%",
                top: "50%",
                width: INNER_D,
                height: INNER_D,
                marginLeft: -(INNER_D / 2),
                marginTop: -(INNER_D / 2),
                background: faceColor,
              }}
            />

            {/* Fluting notches, fixed ring */}
            {NOTCH_ANGLES.map((angle, i) => (
              <span
                key={i}
                aria-hidden
                className="absolute rounded-full"
                style={{
                  left: "50%",
                  top: "50%",
                  width: NOTCH_W,
                  height: NOTCH_LEN,
                  marginLeft: -(NOTCH_W / 2),
                  marginTop: -(DISC_D / 2),
                  transformOrigin: `50% ${DISC_D / 2}px`,
                  transform: `rotate(${angle}deg)`,
                  background: notchColor,
                }}
              />
            ))}

            {/* Center star */}
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center"
              style={{ fontSize: STAR_SIZE, lineHeight: 1, color: starColor }}
            >
              ★
            </span>

            {/* Glint — sweeps under motion, flashes in place under reduced motion */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                top: "-20%",
                height: "140%",
                width: GLINT_W,
                left: glintLeftValue,
                opacity: glintOpacity,
                transform: "skewX(-20deg)",
                background: SHEEN,
              }}
            />
          </button>
        </motion.div>
      </div>

      <span className="mt-2 text-label leading-none text-ink-3">
        {tier} · {label}
      </span>

      <button
        type="button"
        aria-label="Award the medal"
        onClick={handleAward}
        className={cn(
          "mt-3 rounded-2 border border-hairline bg-surface-2 px-3 py-1 text-label text-ink-2 transition-colors outline-none",
          "hover:text-ink focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        )}
      >
        Award it
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {status}
      </span>
    </div>
  );
}
