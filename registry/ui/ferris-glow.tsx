"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/** Cabin count is clamped to this range regardless of what the prop asks for. */
const MIN_CABINS = 6;
const MAX_CABINS = 12;
const DEFAULT_CABINS = 8;

/** Card geometry, in px. */
const CARD_W = 300;
const CARD_H = 252;
/** Hub position measured from the card's top-left. */
const HUB_Y = 92;
/** Wheel diameter — the rotor box the cabins revolve inside. */
const WHEEL_D = 156;
const ROTOR_CENTER = WHEEL_D / 2;
/** Rim radius sits a few px inside the rotor box so strokes never clip. */
const RIM_R = ROTOR_CENTER - 6;
const HUB_R = 7;

/** Support legs — feet spread from below the hub down near the card edge. */
const LEG_SPAN = 62;
const LEG_FOOT_Y = CARD_H - 20;

/** Cabin gondola box, and the small light window inside it. */
const CABIN_SIZE = 20;
const CABIN_LIGHT_SIZE = 8;
/** Rim bulb dot, sitting at the midpoint between each pair of cabins. */
const BULB_SIZE = 6;

/** Ambient turn — one lap in this many seconds. Hover trims it down. */
const ROTATE_PERIOD_S = 18;
const HOVER_ROTATE_PERIOD_S = 11;
/** Reduced motion parks the wheel here instead of turning it. */
const REDUCED_ANGLE_DEG = 22;

/** Cabin lights pulse on one slow loop, bulbs on a different one — distinct
 * durations and per-index steps so the two families never line up. */
const CABIN_PULSE_DURATION = 2.6;
const CABIN_PHASE_STEP = 0.31;
const BULB_PULSE_DURATION = 2.1;
const BULB_PHASE_STEP = 0.24;

/** Resting/idle opacity floor, and the pulse it breathes between. */
const REST_LIGHT_OPACITY = 0.4;
/** Reduced motion holds every light at this flat mid brightness. */
const REDUCED_LIGHT_OPACITY = 0.55;
const LIGHT_PULSE_KEYFRAMES = [0.4, 1, 0.4] as const;
const LIGHT_PULSE_TIMES = [0, 0.5, 1] as const;

/** Beat-drop timing: hold at full bright, then fall back in a cascade. */
const BRIGHT_HOLD_MS = 90;
/** How long the caption reads "all lit." (and, under reduced motion, how
 * long every light stays at full brightness). */
const CAPTION_HOLD_MS = 520;

const WARM_LIGHT = "color-mix(in oklab, var(--warning, #b45309) 75%, white)";
const DUSK_GRADIENT =
  "linear-gradient(180deg, var(--surface-2) 0%, color-mix(in oklab, var(--warning, #b45309) 24%, var(--surface-1)) 100%)";

type GlowPhase = "none" | "bright" | "falling";

export type FerrisGlowProps = {
  /** Number of cabins on the wheel, clamped to 6–12. @default 8 */
  cabins?: number;
  /** Fires every time the wheel is lit (a click, or Enter/Space). */
  onLight?: () => void;
  className?: string;
};

/**
 * A little ferris wheel turning at dusk, on a card whose vertical gradient
 * cools toward the top and warms toward the bottom. A support frame holds a
 * hub, spokes, and a rim that all turn together on one shared motion value;
 * each cabin hangs in a wrapper placed by that same angle, then
 * counter-rotates by its negation so it stays level and never tips as the
 * wheel comes around. Warm cabin lights and the rim's own bulbs pulse on
 * slow, independent loops, each index carrying a fixed phase offset so the
 * wheel twinkles rather than blinking in unison. The card is a real button:
 * hovering swaps in a brisker rotation duration, and a click snaps every
 * light to full brightness before it falls back in a cascade, flashing the
 * mono caption to "all lit." for a beat.
 * Reduced motion: the wheel holds a fixed angle instead of turning, lights
 * sit at a steady mid brightness instead of pulsing, and a click brightens
 * them all instantly for a beat with no cascade.
 */
export function FerrisGlow({
  cabins = DEFAULT_CABINS,
  onLight,
  className,
}: FerrisGlowProps): React.JSX.Element {
  const motionSafe = useMotionSafe();
  const cabinCount = Math.min(
    MAX_CABINS,
    Math.max(MIN_CABINS, Math.round(cabins)),
  );

  const [hovering, setHovering] = React.useState(false);
  const [glowPhase, setGlowPhase] = React.useState<GlowPhase>("none");
  const [lit, setLit] = React.useState(false);

  const glowTimerRef = React.useRef<number | null>(null);
  const litTimerRef = React.useRef<number | null>(null);

  /** The one value the wheel turns on. */
  const wheelAngle = useMotionValue(0);
  /** Created once, reused by every cabin — the counter-rotation that keeps
   * them level regardless of how far the wheel itself has turned. */
  const counterRotate = useTransform(wheelAngle, (angle) => -angle);

  // Ambient rotation: a single linear tween looping forever. 360° lands back
  // on 0° visually, so restarting the loop on hover never pops. Reduced
  // motion parks the wheel at a fixed angle instead of animating it.
  React.useEffect(() => {
    if (!motionSafe) {
      wheelAngle.jump(REDUCED_ANGLE_DEG);
      return;
    }
    const from = wheelAngle.get();
    const controls = animate(wheelAngle, from + 360, {
      duration: hovering ? HOVER_ROTATE_PERIOD_S : ROTATE_PERIOD_S,
      ease: easings.linear,
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [motionSafe, hovering, wheelAngle]);

  // Clear every outstanding timer on unmount.
  React.useEffect(() => {
    return () => {
      if (glowTimerRef.current !== null)
        window.clearTimeout(glowTimerRef.current);
      if (litTimerRef.current !== null)
        window.clearTimeout(litTimerRef.current);
    };
  }, []);

  const handlePointerEnter = () => {
    if (motionSafe) setHovering(true);
  };
  const handlePointerLeave = () => {
    setHovering(false);
  };

  const cascadeStep = cascade(cabinCount);

  const handleLight = () => {
    onLight?.();

    if (litTimerRef.current !== null) window.clearTimeout(litTimerRef.current);
    setLit(true);
    litTimerRef.current = window.setTimeout(() => {
      litTimerRef.current = null;
      setLit(false);
    }, CAPTION_HOLD_MS);

    if (glowTimerRef.current !== null)
      window.clearTimeout(glowTimerRef.current);

    if (!motionSafe) {
      setGlowPhase("bright");
      glowTimerRef.current = window.setTimeout(() => {
        glowTimerRef.current = null;
        setGlowPhase("none");
      }, CAPTION_HOLD_MS);
      return;
    }

    setGlowPhase("bright");
    glowTimerRef.current = window.setTimeout(() => {
      setGlowPhase("falling");
      const fallSeconds = (cabinCount - 1) * cascadeStep + durations.fast;
      glowTimerRef.current = window.setTimeout(() => {
        glowTimerRef.current = null;
        setGlowPhase("none");
      }, fallSeconds * 1000);
    }, BRIGHT_HOLD_MS);
  };

  /** Per-light animate/transition pair — idle pulse at rest, an instant
   * jump to full on "bright", and a cascade fall-back on "falling". */
  const glowStyle = (
    index: number,
    phaseStep: number,
    pulseDuration: number,
  ) => {
    const phaseDelay = index * phaseStep;
    if (!motionSafe) {
      return {
        animate: {
          opacity: glowPhase === "bright" ? 1 : REDUCED_LIGHT_OPACITY,
        },
        transition: { duration: 0 },
      };
    }
    if (glowPhase === "bright") {
      return {
        animate: { opacity: 1 },
        transition: { duration: durations.blink, ease: easings.enter },
      };
    }
    if (glowPhase === "falling") {
      return {
        animate: { opacity: REST_LIGHT_OPACITY },
        transition: {
          duration: durations.fast,
          delay: index * cascadeStep,
          ease: easings.exit,
        },
      };
    }
    return {
      animate: { opacity: [...LIGHT_PULSE_KEYFRAMES] },
      transition: {
        duration: pulseDuration,
        ease: "easeInOut" as const,
        repeat: Infinity,
        delay: phaseDelay,
        times: [...LIGHT_PULSE_TIMES],
      },
    };
  };

  const cabinPositions = Array.from({ length: cabinCount }, (_, index) => {
    const deg = (index / cabinCount) * 360 - 90;
    const rad = (deg * Math.PI) / 180;
    return {
      x: ROTOR_CENTER + RIM_R * Math.cos(rad),
      y: ROTOR_CENTER + RIM_R * Math.sin(rad),
    };
  });

  const bulbPositions = Array.from({ length: cabinCount }, (_, index) => {
    const deg = (index / cabinCount) * 360 - 90 + 180 / cabinCount;
    const rad = (deg * Math.PI) / 180;
    return {
      x: ROTOR_CENTER + RIM_R * Math.cos(rad),
      y: ROTOR_CENTER + RIM_R * Math.sin(rad),
    };
  });

  const caption = lit ? "all lit." : "dusk";

  return (
    <div className={cn("inline-flex flex-col items-center gap-3", className)}>
      <button
        type="button"
        aria-label="Light the wheel"
        onClick={handleLight}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        className={cn(
          "relative block cursor-pointer overflow-hidden rounded-4 border border-hairline shadow-raised outline-none select-none",
          "focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0",
        )}
        style={{ width: CARD_W, height: CARD_H, background: DUSK_GRADIENT }}
      >
        {/* Support frame — two legs converging at the hub, never rotating. */}
        <svg
          aria-hidden
          viewBox={`0 0 ${CARD_W} ${CARD_H}`}
          width={CARD_W}
          height={CARD_H}
          className="absolute inset-0"
        >
          <line
            x1={CARD_W / 2 - LEG_SPAN}
            y1={LEG_FOOT_Y}
            x2={CARD_W / 2}
            y2={HUB_Y}
            stroke="var(--ink-3)"
            strokeWidth={4}
            strokeLinecap="round"
          />
          <line
            x1={CARD_W / 2 + LEG_SPAN}
            y1={LEG_FOOT_Y}
            x2={CARD_W / 2}
            y2={HUB_Y}
            stroke="var(--ink-3)"
            strokeWidth={4}
            strokeLinecap="round"
          />
        </svg>

        {/* The wheel — hub, spokes, rim, and bulbs all turn together on
            `wheelAngle`; the cabins are placed with it but each carries a
            counter-rotation so it never tips. */}
        <motion.div
          aria-hidden
          className="absolute"
          style={{
            left: "50%",
            top: HUB_Y,
            width: WHEEL_D,
            height: WHEEL_D,
            marginLeft: -WHEEL_D / 2,
            marginTop: -WHEEL_D / 2,
            rotate: wheelAngle,
          }}
        >
          <svg
            viewBox={`0 0 ${WHEEL_D} ${WHEEL_D}`}
            width={WHEEL_D}
            height={WHEEL_D}
            className="absolute inset-0"
          >
            <circle
              cx={ROTOR_CENTER}
              cy={ROTOR_CENTER}
              r={RIM_R}
              fill="none"
              stroke="var(--hairline-strong)"
              strokeWidth={2}
            />
            {cabinPositions.map((pos, index) => (
              <line
                key={index}
                x1={ROTOR_CENTER}
                y1={ROTOR_CENTER}
                x2={pos.x}
                y2={pos.y}
                stroke="var(--hairline)"
                strokeWidth={1}
              />
            ))}
            <circle
              cx={ROTOR_CENTER}
              cy={ROTOR_CENTER}
              r={HUB_R}
              fill="var(--surface-2)"
              stroke="var(--hairline-strong)"
              strokeWidth={1.5}
            />
          </svg>

          {bulbPositions.map((pos, index) => {
            const { animate: bulbAnimate, transition: bulbTransition } =
              glowStyle(index, BULB_PHASE_STEP, BULB_PULSE_DURATION);
            return (
              <motion.span
                key={index}
                aria-hidden
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: BULB_SIZE,
                  height: BULB_SIZE,
                  background: WARM_LIGHT,
                }}
                initial={false}
                animate={bulbAnimate}
                transition={bulbTransition}
              />
            );
          })}

          {cabinPositions.map((pos, index) => {
            const { animate: cabinAnimate, transition: cabinTransition } =
              glowStyle(index, CABIN_PHASE_STEP, CABIN_PULSE_DURATION);
            return (
              <div
                key={index}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: CABIN_SIZE,
                  height: CABIN_SIZE,
                }}
              >
                <motion.div
                  className="flex size-full items-center justify-center rounded-1 border border-hairline-strong bg-surface-1 shadow-raised"
                  style={{ rotate: counterRotate }}
                >
                  <motion.span
                    aria-hidden
                    className="rounded-full"
                    style={{
                      width: CABIN_LIGHT_SIZE,
                      height: CABIN_LIGHT_SIZE,
                      background: WARM_LIGHT,
                    }}
                    initial={false}
                    animate={cabinAnimate}
                    transition={cabinTransition}
                  />
                </motion.div>
              </div>
            );
          })}
        </motion.div>
      </button>

      <motion.span
        key={caption}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3"
        initial={motionSafe ? { opacity: 0, y: distances.nudge } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        {caption}
      </motion.span>

      <span role="status" aria-live="polite" className="sr-only">
        {lit ? "all lit." : ""}
      </span>
    </div>
  );
}
