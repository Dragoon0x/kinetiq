"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import {
  SegmentedControl,
  SegmentedControlItem,
} from "@/registry/ui/segmented-control";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Persona = {
  id: string;
  /** Short label for the control. */
  label: string;
  /** The line that names what this reader wants. */
  lede: string;
  points: { id: string; title: string; copy: string }[];
};

export type FeaturesPersonaSwitchProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  personas?: Persona[];
  className?: string;
};

const DEFAULT_PERSONAS: Persona[] = [
  {
    id: "yard",
    label: "Yard lead",
    lede: "You need the morning settled before the gate opens.",
    points: [
      {
        id: "y1",
        title: "The board is cut by 05:55",
        copy: "Overnight changes are folded in before anyone arrives, with the cause printed.",
      },
      {
        id: "y2",
        title: "Readable in gloves and glare",
        copy: "Large targets, high contrast, no confirmation taps to fumble.",
      },
      {
        id: "y3",
        title: "One edit, every board",
        copy: "A crane hold propagates to both yards sharing it without a phone call.",
      },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    lede: "You need to see four yards without four dashboards.",
    points: [
      {
        id: "o1",
        title: "The floor on one page",
        copy: "Every yard's morning derived from the same rows the crews are working.",
      },
      {
        id: "o2",
        title: "Drift visible early",
        copy: "Each yard carries its own history, so a slow yard shows before it fails.",
      },
      {
        id: "o3",
        title: "Exceptions, not noise",
        copy: "You are told when a plan could not be explained — roughly once a fortnight.",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    lede: "You need the hours to be defensible.",
    points: [
      {
        id: "f1",
        title: "Signed hours, nightly",
        copy: "Payroll takes what a supervisor actually signed, not what a sheet claims.",
      },
      {
        id: "f2",
        title: "Audits from exports",
        copy: "Files carry their own provenance, so a review quotes rows instead of memory.",
      },
      {
        id: "f3",
        title: "One number per yard",
        copy: "Cost per morning, on the same record everyone else is reading.",
      },
    ],
  },
];

/**
 * The same product, argued three ways: a control picks the reader, and the
 * claims swap for the ones that person actually cares about. It solves the
 * real problem of a mixed audience without the usual answer — three
 * near-identical feature sections stacked down the page — and the thumb's
 * travel belongs to the segmented instrument.
 */
export function FeaturesPersonaSwitch({
  eyebrow = "Waylight · depending who is asking",
  headline = "Whose morning are we talking about?",
  copy = "The product is one thing. What it is for depends entirely on where you stand — so pick a chair.",
  personas = DEFAULT_PERSONAS,
  className,
}: FeaturesPersonaSwitchProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [active, setActive] = React.useState(personas[0]?.id ?? "");

  const current =
    personas.find((persona) => persona.id === active) ?? personas[0];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        {/* Long labels would overflow the narrow end, so the control keeps
            its own rail. */}
        <div className="-mx-6 mt-8 overflow-x-auto px-6 pb-1">
          <SegmentedControl
            value={active}
            onValueChange={setActive}
            aria-label="Choose a reader"
            className="w-max"
          >
            {personas.map((persona) => (
              <SegmentedControlItem key={persona.id} value={persona.id}>
                {persona.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>

        {/* Sized to the tallest reader's panel, so the frame bridges the swap
            without standing open under the shortest one. */}
        <div className="mt-8 min-h-44">
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={current?.id ?? "none"}
              initial={{
                opacity: 0,
                y: motionSafe ? distances.nudge : 0,
              }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                transition: exitFor(
                  motionSafe ? durations.base : durations.fast,
                ),
              }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter }
                  : { duration: 0 }
              }
            >
              <p className="text-xl font-medium tracking-tight text-balance text-ink">
                {current?.lede}
              </p>
              <ul className="mt-6 grid gap-6 sm:grid-cols-3">
                {(current?.points ?? []).map((point) => (
                  <li
                    key={point.id}
                    className="min-w-0 border-t border-hairline pt-4"
                  >
                    <h3 className="font-semibold tracking-tight text-ink">
                      {point.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
                      {point.copy}
                    </p>
                  </li>
                ))}
              </ul>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
