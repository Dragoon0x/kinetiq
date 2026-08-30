"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TrimValues = {
  width: number;
  height: number;
  radius: number;
  /** 0–100. */
  opacity: number;
};

export type TrimStep = {
  id: string;
  /** What the agent says as it makes this adjustment. */
  note: string;
  values: TrimValues;
};

export type TrimPanelProps = {
  heading?: string;
  /** The starting reading. */
  initial?: TrimValues;
  /** The agent's adjustments, applied one per interval. */
  steps?: TrimStep[];
  /** Seconds between adjustments. @default 2.2 */
  interval?: number;
  className?: string;
};

const DEFAULT_INITIAL: TrimValues = {
  width: 220,
  height: 132,
  radius: 6,
  opacity: 100,
};

const DEFAULT_STEPS: TrimStep[] = [
  {
    id: "t1",
    note: "Widening to fit the caption",
    values: { width: 260, height: 132, radius: 6, opacity: 100 },
  },
  {
    id: "t2",
    note: "Softening the corners",
    values: { width: 260, height: 148, radius: 16, opacity: 100 },
  },
  {
    id: "t3",
    note: "Easing it back for the overlay",
    values: { width: 240, height: 140, radius: 12, opacity: 85 },
  },
];

/**
 * The inspector with an agent's hands on it: width, height, radius, and
 * opacity read out as rolling numerals while the stage element re-trims
 * live on the glide spring — every adjustment narrated, because a tool
 * that changes your design silently is indistinguishable from a bug. The
 * fields are the record, the stage is the proof, and the two cannot
 * disagree: both read from the same values.
 *
 * The walk through the steps is a mount-driven interval, never the wall
 * clock. Reduced motion: values swap and the stage re-trims without travel;
 * the numerals still roll, because a changing number is information.
 */
export function TrimPanel({
  heading = "Handover card",
  initial = DEFAULT_INITIAL,
  steps = DEFAULT_STEPS,
  interval = 2.2,
  className,
}: TrimPanelProps) {
  const motionSafe = useMotionSafe();
  const [stepIndex, setStepIndex] = React.useState(-1);

  React.useEffect(() => {
    if (steps.length === 0) return;
    const ms = Math.max(600, interval * 1000);
    const id = window.setInterval(() => {
      setStepIndex((current) => {
        if (current + 1 >= steps.length) {
          window.clearInterval(id);
          return current;
        }
        return current + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [steps, interval]);

  const active = stepIndex >= 0 ? steps[stepIndex] : undefined;
  const values = active?.values ?? initial;

  const fields: { key: keyof TrimValues; label: string; suffix?: string }[] = [
    { key: "width", label: "W" },
    { key: "height", label: "H" },
    { key: "radius", label: "Radius" },
    { key: "opacity", label: "Opacity", suffix: "%" },
  ];

  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-4 border border-hairline bg-surface-1",
        className,
      )}
    >
      {/* The stage: the element being trimmed, re-trimming live. */}
      <div className="flex min-h-48 items-center justify-center p-6">
        <motion.div
          aria-hidden
          className="flex items-end border border-hairline-strong bg-surface-0 p-3 shadow-raised"
          animate={{
            width: values.width,
            height: values.height,
            borderRadius: values.radius,
            opacity: values.opacity / 100,
          }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {heading}
          </span>
        </motion.div>
      </div>

      <div className="border-t border-hairline p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-label text-ink-3">Layout</p>
          <p
            role="status"
            className="min-w-0 truncate text-right text-xs text-ink-3"
          >
            {active ? active.note : "Waiting for the agent"}
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2.5">
          {fields.map((field) => (
            <div
              key={field.key}
              className="flex items-baseline justify-between gap-2 rounded-2 border border-hairline bg-surface-0 px-2.5 py-1.5"
            >
              <dt className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {field.label}
              </dt>
              <dd className="flex items-baseline gap-0.5 font-mono text-sm text-ink">
                <Readout value={values[field.key]} size="sm" />
                {field.suffix && (
                  <span className="text-[11px] text-ink-3">{field.suffix}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
