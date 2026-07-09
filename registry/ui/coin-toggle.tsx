"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { perspectives } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Horizontal sheen — lives inside each face, so it flips with the metal. */
const SHEEN: React.CSSProperties = {
  background:
    "linear-gradient(105deg, rgba(255,255,255,0.14) 10%, rgba(255,255,255,0) 40%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.16) 92%)",
};

/** Default artwork: a filled accent dot for heads, a hollow ring for tails. */
const DEFAULT_FACES = {
  on: (
    <>
      <span aria-hidden className="absolute inset-0 rounded-full bg-cobalt-wash" />
      <span
        aria-hidden
        className="relative size-[34%] rounded-full bg-cobalt-bright shadow-[0_0_10px_2px_var(--accent-wash)]"
      />
    </>
  ),
  off: (
    <span aria-hidden className="size-[34%] rounded-full border-2 border-ink-3" />
  ),
} as const;

export type CoinToggleProps = {
  /** Controlled state — heads up. */
  checked?: boolean;
  /** Uncontrolled initial state. @default false */
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Coin diameter, px. @default 56 */
  size?: number;
  /** Face artwork: `on` is heads, `off` is tails. */
  faces?: { on: React.ReactNode; off: React.ReactNode };
  className?: string;
  /** Required — the coin is a bare switch with no text of its own. */
  "aria-label": string;
};

/**
 * A coin that flips to switch state. Two faces sit back to back inside a
 * preserve-3d container while the button supplies `perspectives.near`; each
 * toggle accumulates +180° of rotateY on `springs.snap`, so the coin always
 * flips forward — rapid toggles stop the in-flight spring and retarget it
 * rather than rewinding. When a flip settles, the landing kicks rotateZ to 5°
 * and `springs.recoil` rocks it back level — a coin wobbling on its edge.
 * Pressing squashes the coin to 0.94 on `springs.flick`. A static rim behind
 * the faces peeks through mid-flip so the disc reads with thickness, and each
 * face carries a horizontal sheen that flips with it.
 *
 * Semantics: a real `<button role="switch" aria-checked>` — Space and Enter
 * toggle natively, focus-visible draws a ring, `disabled` dims and inerts.
 * Controlled via `checked`/`onCheckedChange`, uncontrolled via
 * `defaultChecked`.
 *
 * Reduced motion: no flip, wobble, or press scale — the faces crossfade at
 * `durations.fast` and the accent change carries the state.
 */
export function CoinToggle({
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled = false,
  size = 56,
  faces,
  className,
  "aria-label": ariaLabel,
}: CoinToggleProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolledOn, setUncontrolledOn] = React.useState(defaultChecked);
  const isOn = checked ?? uncontrolledOn;
  const face = faces ?? DEFAULT_FACES;

  // Heads rests at even multiples of 180°, tails at odd — parity is state.
  const rotateY = useMotionValue(isOn ? 0 : 180);
  const rotateZ = useMotionValue(0);
  const flipControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const wobbleControls = React.useRef<ReturnType<typeof animate> | null>(null);
  const prevOnRef = React.useRef(isOn);

  const stopAll = React.useCallback(() => {
    flipControls.current?.stop();
    flipControls.current = null;
    wobbleControls.current?.stop();
    wobbleControls.current = null;
  }, []);
  React.useEffect(() => stopAll, [stopAll]);

  React.useEffect(() => {
    if (prevOnRef.current === isOn) return;
    prevOnRef.current = isOn;

    stopAll();
    rotateZ.set(0);

    if (!motionSafe) {
      // No theatrics — park the coin on the parity-correct face.
      rotateY.set(isOn ? 0 : 180);
      return;
    }

    // Always forward: the next multiple of 180° ahead of the current angle
    // whose parity matches the new state (self-heals if reduced motion left
    // the rotation stale).
    const current = rotateY.get();
    let target = (Math.floor(current / 180) + 1) * 180;
    if (((target / 180) % 2 === 0) !== isOn) target += 180;

    flipControls.current = animate(rotateY, target, {
      ...springs.snap,
      onComplete: () => {
        flipControls.current = null;
        // Land the edge-wobble on the recoil spring.
        rotateZ.set(5);
        wobbleControls.current = animate(rotateZ, 0, springs.recoil);
      },
    });
  }, [isOn, motionSafe, rotateY, rotateZ, stopAll]);

  const handleClick = () => {
    const next = !isOn;
    if (checked === undefined) setUncontrolledOn(next);
    onCheckedChange?.(next);
  };

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={ariaLabel}
      data-state={isOn ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={handleClick}
      whileTap={motionSafe && !disabled ? { scale: 0.94 } : undefined}
      transition={springs.flick}
      style={{ width: size, height: size, perspective: `${perspectives.near}px` }}
      className={cn(
        "relative inline-block shrink-0 rounded-full outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {/* Static rim — the darker edge that peeks through mid-flip, selling
          the disc as a coin with thickness. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border border-hairline-strong bg-surface-1 shadow-[inset_0_0_6px_1px_rgba(0,0,0,0.35)]"
      />

      <motion.span
        aria-hidden
        className="absolute inset-0 block rounded-full"
        style={
          motionSafe
            ? { rotateY, rotateZ, transformStyle: "preserve-3d" }
            : undefined
        }
      >
        <Face motionSafe={motionSafe} visible={isOn}>
          {face.on}
        </Face>
        <Face motionSafe={motionSafe} visible={!isOn} back>
          {face.off}
        </Face>
      </motion.span>
    </motion.button>
  );
}

type FaceProps = {
  motionSafe: boolean;
  /** Reduced-motion crossfade target; ignored while rich motion plays. */
  visible: boolean;
  /** Pre-rotated 180° so it shows at odd half-turns. */
  back?: boolean;
  children: React.ReactNode;
};

/**
 * One coin face. With rich motion, both faces stay opaque and
 * backface-visibility decides which one shows; under reduced motion the 3D
 * rig is detached and the faces simply crossfade at `durations.fast`.
 */
function Face({ motionSafe, visible, back = false, children }: FaceProps) {
  return (
    <motion.span
      className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full border border-hairline-strong bg-surface-2"
      initial={false}
      animate={{ opacity: motionSafe || visible ? 1 : 0 }}
      transition={{ duration: durations.fast }}
      style={
        motionSafe
          ? {
              backfaceVisibility: "hidden",
              transform: back ? "rotateY(180deg)" : undefined,
            }
          : undefined
      }
    >
      {children}
      <span aria-hidden className="pointer-events-none absolute inset-0" style={SHEEN} />
    </motion.span>
  );
}
