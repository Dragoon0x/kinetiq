"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SoundToggleProps = {
  /** Controlled sound-on state. */
  on?: boolean;
  /** Initial state for uncontrolled usage. @default true */
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
  className?: string;
};

const WAVES = [
  "M13.5 9.5 a3.5 3.5 0 0 1 0 5",
  "M15.5 7 a7 7 0 0 1 0 10",
  "M17.5 4.5 a10.5 10.5 0 0 1 0 15",
];

/**
 * A mute switch whose sound is visible. Turning it on draws the waves out of the
 * speaker in a quick outward stagger; muting retracts them and strikes a slash
 * across in their place, so the state is legible at a glance without reading a
 * word. It is a real `switch`, checked and labelled, so it toggles on Enter and
 * Space and its state is announced. Reduced motion swaps the waves and the slash
 * in place with no draw.
 */
export function SoundToggle({
  on,
  defaultOn = true,
  onChange,
  className,
}: SoundToggleProps) {
  const motionSafe = useMotionSafe();
  const [uncontrolled, setUncontrolled] = React.useState(defaultOn);
  const isControlled = on !== undefined;
  const isOn = isControlled ? on : uncontrolled;

  const toggle = () => {
    const next = !isOn;
    if (!isControlled) setUncontrolled(next);
    onChange?.(next);
  };

  const draw = (visible: boolean, delay = 0) =>
    motionSafe
      ? {
          duration: durations.fast,
          ease: easings.enter,
          delay: visible ? delay : 0,
        }
      : { duration: 0 };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOn}
      aria-label={isOn ? "Mute" : "Unmute"}
      onClick={toggle}
      className={cn(
        "border-hairline bg-surface-1 hover:bg-surface-2 relative flex size-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="text-ink size-6" fill="none" aria-hidden>
        <path d="M4 9 h3 l4 -3.2 v12.4 l-4 -3.2 H4 Z" fill="currentColor" />
        {WAVES.map((d, index) => (
          <motion.path
            key={d}
            d={d}
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            initial={false}
            animate={{ opacity: isOn ? 1 : 0, pathLength: isOn ? 1 : 0 }}
            transition={draw(isOn, index * 0.05)}
          />
        ))}
        <motion.path
          d="M14 8.5 L21 15.5"
          stroke="var(--danger)"
          strokeWidth={2}
          strokeLinecap="round"
          initial={false}
          animate={{ opacity: isOn ? 0 : 1, pathLength: isOn ? 0 : 1 }}
          transition={draw(!isOn)}
        />
      </svg>
    </button>
  );
}
