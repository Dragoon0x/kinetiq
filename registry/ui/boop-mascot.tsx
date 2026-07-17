"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useSpring } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { usePointerFine } from "@/registry/hooks/use-pointer-tilt";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BoopMascotProps = {
  ref?: React.Ref<HTMLButtonElement>;
  /** Accessible name for the toy. @default "Boop the mascot" */
  label?: string;
  /** Rendered pixel size of the square face. @default 128 */
  size?: number;
  /** Fires on every boop. */
  onBoop?: () => void;
  className?: string;
};

const EYE_L = 46;
const EYE_R = 74;
const EYE_Y = 54;
const SQUASH_TIMES = [0, 0.18, 0.5, 0.78, 1];

/**
 * A small face that reacts. Its eyes follow the pointer on a drift spring, and
 * a click, tap, or Enter/Space "boops" it — the whole head squashes and springs
 * back, the eyes pinch shut, the smile rounds into an "o", and cheeks flush for
 * a beat. Under reduced motion it still boops (mouth, cheeks, a soft pulse) but
 * skips the squash-and-stretch and the eye-tracking spring.
 */
export function BoopMascot({
  ref,
  label = "Boop the mascot",
  size = 128,
  onBoop,
  className,
}: BoopMascotProps) {
  const motionSafe = useMotionSafe();
  const finePointer = usePointerFine();
  const [booped, setBooped] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const resetTimer = React.useRef<number | null>(null);

  const scaleX = useMotionValue(1);
  const scaleY = useMotionValue(1);

  // Pupils track the pointer; the spring only smooths when motion is allowed.
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const springX = useSpring(rawX, springs.drift);
  const springY = useSpring(rawY, springs.drift);
  const pupilX = motionSafe && finePointer ? springX : rawX;
  const pupilY = motionSafe && finePointer ? springY : rawY;

  const setButtonRef = (node: HTMLButtonElement | null) => {
    buttonRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) {
      (ref as React.RefObject<HTMLButtonElement | null>).current = node;
    }
  };

  React.useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const trackPointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!finePointer) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    rawX.set(Math.max(-1, Math.min(1, nx * 2)) * 4);
    rawY.set(Math.max(-1, Math.min(1, ny * 2)) * 3);
  };

  const resetPointer = () => {
    rawX.set(0);
    rawY.set(0);
  };

  const boop = () => {
    onBoop?.();
    setBooped(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setBooped(false), 460);

    if (!motionSafe) return;
    animate(scaleX, [1, 1.14, 0.95, 1.02, 1], {
      duration: 0.5,
      ease: easings.move,
      times: SQUASH_TIMES,
    });
    animate(scaleY, [1, 0.8, 1.06, 0.98, 1], {
      duration: 0.5,
      ease: easings.move,
      times: SQUASH_TIMES,
    });
  };

  return (
    <motion.button
      ref={setButtonRef}
      type="button"
      aria-label={label}
      onClick={boop}
      onPointerMove={trackPointer}
      onPointerLeave={resetPointer}
      whileTap={motionSafe ? undefined : { scale: 0.96 }}
      style={{ width: size, height: size, scaleX, scaleY }}
      className={cn(
        "focus-visible:ring-cobalt-bright/50 focus-visible:ring-offset-surface-1 relative grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        className,
      )}
    >
      <svg
        viewBox="0 0 120 120"
        width="100%"
        height="100%"
        aria-hidden
        className="overflow-visible"
      >
        {/* Head */}
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="var(--accent-wash)"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <circle cx="60" cy="60" r="48" fill="url(#boop-sheen)" />
        <defs>
          <radialGradient id="boop-sheen" cx="0.38" cy="0.32" r="0.75">
            <stop offset="0%" stopColor="var(--card)" stopOpacity="0.5" />
            <stop offset="60%" stopColor="var(--card)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Cheeks — bloom on boop */}
        <motion.circle
          cx="38"
          cy="70"
          r="7"
          fill="var(--accent)"
          animate={{ opacity: booped ? 0.5 : 0 }}
          transition={{ duration: durations.fast, ease: easings.enter }}
        />
        <motion.circle
          cx="82"
          cy="70"
          r="7"
          fill="var(--accent)"
          animate={{ opacity: booped ? 0.5 : 0 }}
          transition={{ duration: durations.fast, ease: easings.enter }}
        />

        {/* Open eyes — pupils track the pointer; the whole set blinks out on boop */}
        <motion.g
          initial={false}
          animate={{ opacity: booped ? 0 : 1 }}
          transition={{ duration: durations.blink }}
        >
          <ellipse cx={EYE_L} cy={EYE_Y} rx="9" ry="11" fill="var(--card)" />
          <ellipse cx={EYE_R} cy={EYE_Y} rx="9" ry="11" fill="var(--card)" />
          <motion.circle
            cx={EYE_L}
            cy={EYE_Y}
            r="4.5"
            fill="var(--ink)"
            style={{ x: pupilX, y: pupilY }}
          />
          <motion.circle
            cx={EYE_R}
            cy={EYE_Y}
            r="4.5"
            fill="var(--ink)"
            style={{ x: pupilX, y: pupilY }}
          />
        </motion.g>
        {/* Squint arcs replace them mid-boop */}
        <motion.g
          initial={false}
          animate={{ opacity: booped ? 1 : 0 }}
          transition={{ duration: durations.blink, ease: easings.enter }}
        >
          <path
            d={`M${EYE_L - 11} ${EYE_Y + 2} q11 -13 22 0`}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d={`M${EYE_R - 11} ${EYE_Y + 2} q11 -13 22 0`}
            fill="none"
            stroke="var(--ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </motion.g>

        {/* Mouth — smile fades to an "o" on boop */}
        <motion.path
          d="M48 80 q12 12 24 0"
          fill="none"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinecap="round"
          animate={{ opacity: booped ? 0 : 1 }}
          transition={{ duration: durations.blink }}
        />
        <motion.ellipse
          cx="60"
          cy="84"
          rx="6"
          ry="7"
          fill="var(--ink)"
          animate={{ opacity: booped ? 1 : 0, scale: booped ? 1 : 0.4 }}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          transition={{ duration: durations.fast, ease: easings.enter }}
        />
      </svg>
    </motion.button>
  );
}
