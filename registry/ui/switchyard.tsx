"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type YardChip = { id: string; text: string; tone?: "entity" | "value" };

export type YardClause = {
  id: string;
  /** e.g. "if", "and", "then". */
  connective: string;
  /** The clause as chips and words, in order. */
  parts: (string | YardChip)[];
};

export type YardNode = {
  id: string;
  /** The card's role, printed on its rail. */
  role: string;
  title: string;
  /** A plain sentence under the title, or clauses with chips. */
  note?: string;
  clauses?: YardClause[];
};

export type SwitchyardProps = {
  nodes?: YardNode[];
  /** Accessible name for the canvas. */
  label?: string;
  className?: string;
};

const DEFAULT_NODES: YardNode[] = [
  {
    id: "n1",
    role: "Trigger",
    title: "A hold is entered",
    note: "Runs whenever any yard writes a new hold.",
  },
  {
    id: "n2",
    role: "If / else",
    title: "Does the hold touch a cut board?",
    clauses: [
      {
        id: "c1",
        connective: "if",
        parts: [
          { id: "p1", text: "hold", tone: "entity" },
          "window overlaps",
          { id: "p2", text: "board", tone: "entity" },
          "slots",
        ],
      },
      {
        id: "c2",
        connective: "and",
        parts: [
          { id: "p3", text: "hold", tone: "entity" },
          "entered before",
          { id: "p4", text: "05:30", tone: "value" },
        ],
      },
      {
        id: "c3",
        connective: "then",
        parts: ["recut the board and notify both crews"],
      },
    ],
  },
];

/**
 * A workflow drawn as cards on a dotted yard: a trigger, then the switches —
 * each condition a clause of words and chips, entities and values set apart
 * from the prose so the rule reads as a rule. The cards hang off one drawn
 * spine, arriving down it in order. This is the still, legible cousin of the
 * flow instruments: nothing here simulates — it states, because a rule you
 * are about to enable deserves to be read at rest.
 *
 * Reduced motion: the spine is drawn instantly and cards print in place.
 */
export function Switchyard({
  nodes = DEFAULT_NODES,
  label = "Workflow",
  className,
}: SwitchyardProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(nodes.length);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative w-full max-w-sm rounded-4 p-5",
        // The dotted yard the cards sit on.
        "bg-[radial-gradient(var(--hairline)_1px,transparent_1px)] [background-size:14px_14px]",
        className,
      )}
    >
      <div className="relative">
        {/* The spine the cards hang off. */}
        <motion.span
          aria-hidden
          className="absolute top-2 bottom-2 left-3 w-px origin-top bg-hairline-strong"
          initial={{ scaleY: motionSafe ? 0 : 1 }}
          animate={{ scaleY: 1 }}
          transition={
            motionSafe
              ? { duration: durations.slow, ease: easings.enter }
              : { duration: 0 }
          }
        />
        <ol className="flex flex-col gap-4">
          {nodes.map((node, index) => (
            <motion.li
              key={node.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
              }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="relative pl-8"
            >
              <span
                aria-hidden
                className="absolute top-4 left-3 size-2 -translate-x-1/2 rounded-full border-2 border-hairline-strong bg-surface-0"
              />
              <div className="rounded-3 border border-hairline bg-surface-1 p-3.5 shadow-raised">
                <p className="text-label text-ink-3">{node.role}</p>
                <p className="mt-1 text-sm font-medium text-ink">
                  {node.title}
                </p>
                {node.note && (
                  <p className="mt-1 text-sm leading-relaxed text-ink-2">
                    {node.note}
                  </p>
                )}
                {node.clauses && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {node.clauses.map((clause) => (
                      <li
                        key={clause.id}
                        className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm"
                      >
                        <span className="w-8 shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          {clause.connective}
                        </span>
                        {clause.parts.map((part, partIndex) =>
                          typeof part === "string" ? (
                            <span key={partIndex} className="text-ink-2">
                              {part}
                            </span>
                          ) : (
                            <span
                              key={part.id}
                              className={cn(
                                "rounded-full border px-1.5 py-px font-mono text-[11px]",
                                part.tone === "value"
                                  ? "border-hairline text-ink"
                                  : "border-primary/40 bg-primary/8 text-primary",
                              )}
                            >
                              {part.text}
                            </span>
                          ),
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}
