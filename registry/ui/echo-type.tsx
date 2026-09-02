"use client";

import * as React from "react";

import { motion, type Transition } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, springs } from "@/registry/lib/motion";
import { mapRange } from "@/registry/lib/spatial";
import { cn } from "@/registry/lib/utils";

/** Opacity floor at the farthest echo; the lead itself always reads at 1. */
const TAIL_OPACITY = 0.12;
/** mode="always" breathing period, seconds — one full out-and-back mirror. */
const BREATH_SECONDS = 4;
/** Breathing floor as a fraction of the full fanned spread — ceiling is 100%. */
const BREATH_MIN = 0.7;

export type EchoTypeProps = {
  /** The word or numeral to ring. Rendered once, plainly, for the a11y tree. */
  text: string;
  /** Echo layers behind the lead. @default 5 */
  echoes?: number;
  /** Fan direction: echoes spread along this vector (px per layer at full fan). @default { x: 10, y: 10 } */
  spread?: { x: number; y: number };
  /** "hover" fans on pointer/focus; "always" fans on mount and breathes gently. @default "hover" */
  mode?: "hover" | "always";
  as?: "h1" | "h2" | "p" | "span";
  className?: string;
};

/**
 * A word rung like a bell: `echoes` faint copies stack directly behind the
 * lead text, each one step further out along `spread` than the last, opacity
 * falling off from the lead's full 1 down to about 0.12 at the farthest
 * layer. Hovering or focusing the wrapper fans them out on `glide`, cascading
 * from the nearest echo outward; leaving reverses the stagger — outermost
 * first — so the layers re-stack like a deck closing. `mode="always"` skips
 * the gesture entirely: every echo fans on mount and a slow 4s tween breathes
 * the spread between 70% and 100%, mirrored forever. The echoes are
 * `aria-hidden` and purely decorative; the lead text and a matching
 * `aria-label` on the focusable wrapper carry the word for assistive tech.
 * Reduced motion: every echo renders at its fully fanned position outright,
 * in either mode, and nothing animates.
 */
export function EchoType({
  text,
  echoes = 5,
  spread = { x: 10, y: 10 },
  mode = "hover",
  as = "span",
  className,
}: EchoTypeProps) {
  const motionSafe = useMotionSafe();
  const [hovering, setHovering] = React.useState(false);
  const [focused, setFocused] = React.useState(false);

  const count = Math.max(0, Math.round(echoes));
  const hoverable = mode === "hover";
  const fanned = hoverable ? hovering || focused : true;

  const wrapperProps = {
    tabIndex: 0,
    "aria-label": text,
    onPointerEnter: hoverable ? () => setHovering(true) : undefined,
    onPointerLeave: hoverable ? () => setHovering(false) : undefined,
    onFocus: hoverable ? () => setFocused(true) : undefined,
    onBlur: hoverable ? () => setFocused(false) : undefined,
    className: cn(
      "relative inline-block rounded-2 outline-none",
      "focus-visible:ring-2 focus-visible:ring-ring",
      className,
    ),
  };

  return React.createElement(
    as,
    wrapperProps,
    Array.from({ length: count }, (_, i) => (
      <Echo
        key={i}
        index={i}
        count={count}
        text={text}
        spread={spread}
        mode={mode}
        fanned={fanned}
        motionSafe={motionSafe}
      />
    )),
    <span className="relative" style={{ zIndex: count + 1 }}>
      {text}
    </span>,
  );
}

type EchoProps = {
  /** 0 = nearest the lead, count-1 = farthest out. */
  index: number;
  count: number;
  text: string;
  spread: { x: number; y: number };
  mode: "hover" | "always";
  fanned: boolean;
  motionSafe: boolean;
};

/**
 * One echo layer. Its full-fan offset and rest opacity are pure functions of
 * its index; only the transform (x/y) ever animates — colour is always the
 * inherited text colour at a fixed opacity, never tweened.
 */
function Echo({
  index,
  count,
  text,
  spread,
  mode,
  fanned,
  motionSafe,
}: EchoProps) {
  const fullX = spread.x * (index + 1);
  const fullY = spread.y * (index + 1);
  const opacity = mapRange(index + 1, 0, count, 1, TAIL_OPACITY);

  // Fan cascades nearest-outward (small index, small delay); un-fan reverses
  // it so the outermost echo leads the close, like a deck folding shut.
  const interval = cascade(count);
  const delay = fanned ? index * interval : (count - 1 - index) * interval;

  let animate: { x: number | number[]; y: number | number[] };
  let transition: Transition;

  if (!motionSafe) {
    // Reduced motion: park every echo at its fanned position, statically —
    // the shape reads without motion, and nothing here ever transitions.
    animate = { x: fullX, y: fullY };
    transition = { duration: 0 };
  } else if (mode === "always") {
    // A self-contained two-point loop: the keyframe array runs immediately
    // on mount even under initial={false}, unlike a scalar target.
    animate = {
      x: [fullX, fullX * BREATH_MIN],
      y: [fullY, fullY * BREATH_MIN],
    };
    transition = {
      duration: BREATH_SECONDS,
      repeat: Infinity,
      repeatType: "mirror",
      ease: "easeInOut",
    };
  } else {
    animate = fanned ? { x: fullX, y: fullY } : { x: 0, y: 0 };
    transition = { ...springs.glide, delay };
  }

  return (
    <motion.span
      aria-hidden
      className="pointer-events-none select-none"
      // Positioned via inline style, not a Tailwind inset/translate utility —
      // this element also animates x/y, and Tailwind's transform utilities
      // would fight Motion for the inline transform.
      style={{ position: "absolute", inset: 0, opacity, zIndex: count - index }}
      initial={false}
      animate={animate}
      transition={transition}
    >
      {text}
    </motion.span>
  );
}
