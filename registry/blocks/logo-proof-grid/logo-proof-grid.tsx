"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ProofMark = { id: string; name: string; mono?: boolean };

export type LogoProofGridProps = {
  claim?: string;
  marks?: ProofMark[];
  /** The line under the grid — where these names come from. */
  attestation?: string;
  className?: string;
};

const DEFAULT_MARKS: ProofMark[] = [
  { id: "fieldline", name: "Fieldline" },
  { id: "relay", name: "RELAY", mono: true },
  { id: "basinworks", name: "Basinworks" },
  { id: "keeper", name: "KEEPER", mono: true },
  { id: "switchyard", name: "Switchyard" },
  { id: "ovenword", name: "Ovenword" },
  { id: "ferrite", name: "FERRITE", mono: true },
  { id: "waylight", name: "Waylight" },
];

/**
 * The still logo wall: typographic marks in a hairline grid, resolving one
 * after another on the cascade and then holding — for pages where the moving
 * tape would compete with the content around it. Stillness here is a choice,
 * not a fallback; the grid reads like a plaque, and the attestation line
 * says what earned a place on it.
 */
export function LogoProofGrid({
  claim = "The morning shift runs through",
  marks = DEFAULT_MARKS,
  attestation = "Teams with live production use in the last 30 days.",
  className,
}: LogoProofGridProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(marks.length);

  return (
    <section
      aria-label={claim}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
        <p className="text-label text-ink-3 text-center">{claim}</p>

        <ul className="border-hairline mt-8 grid grid-cols-2 overflow-hidden rounded-3 border sm:grid-cols-4">
          {marks.map((mark, index) => (
            <motion.li
              key={mark.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={
                motionSafe
                  ? { duration: durations.base, ease: easings.enter, delay: index * step }
                  : { duration: 0 }
              }
              className="border-hairline flex h-20 items-center justify-center border-[0.5px]"
            >
              <span
                className={cn(
                  "text-ink-3 text-lg font-semibold tracking-tight",
                  mark.mono && "font-mono text-base tracking-[0.14em]",
                )}
              >
                {mark.name}
              </span>
            </motion.li>
          ))}
        </ul>

        <p className="text-ink-3 mt-6 text-center font-mono text-[11px] tracking-[0.08em] uppercase">
          {attestation}
        </p>
      </div>
    </section>
  );
}
