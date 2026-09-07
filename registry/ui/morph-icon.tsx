"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type MorphPairName =
  "play-pause" | "menu-close" | "plus-cross" | "heart" | "sun-moon";

export type MorphIconProps = {
  /** Which morph. */
  pair: MorphPairName;
  /** Controlled state. */
  pressed?: boolean;
  /** Initial state for uncontrolled usage. */
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Accessible names for the two states; defaults come with the pair. */
  labels?: [string, string];
  /** Icon size in pixels. @default 24 */
  size?: number;
  className?: string;
};

/**
 * One shape per path, in both states. The two `d` strings of a pair carry the
 * same commands in the same order with the same number of points, which is the
 * whole trick: only then does an interpolator have corners to walk between
 * rather than one string to swap for another.
 */
type MorphPath = {
  off: string;
  on: string;
  /** Painted rather than stroked. */
  fill?: boolean;
  offOpacity?: number;
  onOpacity?: number;
};

/** The play triangle is split down the middle so it has two quads, like the bars. */
const PLAY: [string, string] = [
  "M 7 5 L 13 8.5 L 13 15.5 L 7 19 Z",
  "M 13 8.5 L 19 12 L 19 12 L 13 15.5 Z",
];
const PAUSE: [string, string] = [
  "M 7 5 L 10.5 5 L 10.5 19 L 7 19 Z",
  "M 13.5 5 L 17 5 L 17 19 L 13.5 19 Z",
];

const HEART_SLIM =
  "M 12 20.5 C 12 20.5 3 14.7 3 9.2 C 3 6.3 5.3 4.5 7.7 4.5 C 9.7 4.5 11.3 5.8 12 7.2 C 12.7 5.8 14.3 4.5 16.3 4.5 C 18.7 4.5 21 6.3 21 9.2 C 21 14.7 12 20.5 12 20.5 Z";
const HEART_FULL =
  "M 12 20.98 C 12 20.98 2.46 14.83 2.46 9 C 2.46 5.93 4.9 4.02 7.44 4.02 C 9.56 4.02 11.26 5.4 12 6.88 C 12.74 5.4 14.44 4.02 16.56 4.02 C 19.1 4.02 21.54 5.93 21.54 9 C 21.54 14.83 12 20.98 12 20.98 Z";

/** A circle and a crescent, both as four cubics, so one can become the other. */
const SUN_BODY =
  "M 12 7.5 C 14.49 7.5 16.5 9.51 16.5 12 C 16.5 14.49 14.49 16.5 12 16.5 C 9.51 16.5 7.5 14.49 7.5 12 C 7.5 9.51 9.51 7.5 12 7.5 Z";
const MOON_BODY =
  "M 10.34 4.79 C 8.91 7.35 9.12 10.5 10.88 12.84 C 12.64 15.18 15.61 16.27 18.46 15.61 C 15.85 20.28 9.29 20.72 6.08 16.44 C 2.87 12.16 5.12 5.99 10.34 4.79 Z";

/** Every ray retreats to the same point, so only the crescent is left standing. */
const RAY_HOME = "M 12 12 L 12 12";
const SUN_RAYS = [
  "M 18.4 12 L 20.2 12",
  "M 16.53 16.53 L 17.8 17.8",
  "M 12 18.4 L 12 20.2",
  "M 7.47 16.53 L 6.2 17.8",
  "M 5.6 12 L 3.8 12",
  "M 7.47 7.47 L 6.2 6.2",
  "M 12 5.6 L 12 3.8",
  "M 16.53 7.47 L 17.8 6.2",
];

const PAIRS: Record<
  MorphPairName,
  { paths: MorphPath[]; labels: [string, string] }
> = {
  "play-pause": {
    labels: ["Play", "Pause"],
    paths: [
      { off: PLAY[0], on: PAUSE[0], fill: true },
      { off: PLAY[1], on: PAUSE[1], fill: true },
    ],
  },
  "menu-close": {
    labels: ["Open menu", "Close menu"],
    paths: [
      { off: "M 4 7 L 20 7", on: "M 6.7 6.7 L 17.3 17.3" },
      // The middle rule has nowhere to go in a cross, so it shortens into the
      // centre and fades rather than leaving a dot under the round cap.
      { off: "M 4 12 L 20 12", on: RAY_HOME, offOpacity: 1, onOpacity: 0 },
      { off: "M 4 17 L 20 17", on: "M 6.7 17.3 L 17.3 6.7" },
    ],
  },
  "plus-cross": {
    labels: ["Add", "Cancel"],
    // Endpoints swapped through the rotation, so the plus reads as turning 45°
    // rather than as two lines swapping ends.
    paths: [
      { off: "M 12 5 L 12 19", on: "M 16.95 7.05 L 7.05 16.95" },
      { off: "M 5 12 L 19 12", on: "M 7.05 7.05 L 16.95 16.95" },
    ],
  },
  heart: {
    labels: ["Save", "Saved"],
    paths: [
      { off: HEART_SLIM, on: HEART_FULL },
      { off: HEART_SLIM, on: HEART_FULL, fill: true, offOpacity: 0 },
    ],
  },
  "sun-moon": {
    labels: ["Light", "Dark"],
    paths: [
      { off: SUN_BODY, on: MOON_BODY },
      ...SUN_RAYS.map((ray) => ({ off: ray, on: RAY_HOME, onOpacity: 0 })),
    ],
  },
};

/**
 * Icons that become each other rather than swapping. Each pair is drawn twice
 * with matching commands and point counts, so motion interpolates the `d`
 * attribute directly and every corner travels to its counterpart on `snap` —
 * one crisp overshoot, the physics of a switch, arriving at the shape it means.
 * Where a stroke has nowhere to go in the other state, like the middle rule of a
 * menu, it retreats to the centre and fades instead of collapsing into a dot.
 *
 * The control is a real toggle button: `aria-pressed` carries the state, the
 * accessible name swaps with it, and Enter and Space work because nothing was
 * reinvented. Under reduced motion the icons swap outright — the state is the
 * information, the morph is only the manner.
 */
export function MorphIcon({
  pair,
  pressed,
  defaultPressed,
  onPressedChange,
  labels,
  size = 24,
  className,
}: MorphIconProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(
    defaultPressed ?? false,
  );

  const spec = PAIRS[pair];
  const isControlled = pressed !== undefined;
  const on = isControlled ? pressed : uncontrolled;
  const names = labels ?? spec.labels;

  const toggle = () => {
    const next = !on;
    if (!isControlled) setUncontrolled(next);
    onPressedChange?.(next);
  };

  const transition = motionSafe
    ? {
        ...springs.snap,
        opacity: { duration: durations.base, ease: easings.move },
      }
    : { duration: 0 };

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={names[on ? 1 : 0]}
      onClick={toggle}
      className={cn(
        "inline-flex items-center justify-center rounded-2 border border-input bg-transparent p-2.5 text-foreground transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden
        className="block shrink-0"
      >
        {spec.paths.map((path, index) => (
          <motion.path
            key={index}
            // The attribute is rendered as well as animated: the server sends
            // the shape the state actually calls for, so nothing snaps on
            // hydration.
            d={on ? path.on : path.off}
            opacity={on ? (path.onOpacity ?? 1) : (path.offOpacity ?? 1)}
            initial={false}
            animate={{
              d: on ? path.on : path.off,
              opacity: on ? (path.onOpacity ?? 1) : (path.offOpacity ?? 1),
            }}
            transition={transition}
            fill={path.fill ? "currentColor" : "none"}
            stroke={path.fill ? "none" : "currentColor"}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </button>
  );
}
