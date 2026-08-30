"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShelfChunk = {
  id: string;
  /** What this chunk is, in three or four words. */
  title: string;
  /** The retrieved passage itself, excerpted. */
  excerpt: string;
  /** Characters in the full chunk, pre-counted. */
  characters: number;
  /** The document it came from. */
  source: { name: string; kind: string };
};

export type SourceShelfProps = {
  /** Header label over the shelf. */
  heading?: string;
  /** Total chunks in the working set, including ones not shown. */
  total?: number;
  chunks?: ShelfChunk[];
  className?: string;
};

const DEFAULT_CHUNKS: ShelfChunk[] = [
  {
    id: "k1",
    title: "Crane hold rule",
    excerpt:
      "Holds entered after 05:30 cannot be folded into the morning cut; they propagate to the next revision instead.",
    characters: 412,
    source: { name: "Cutting SOP.pdf", kind: "PDF" },
  },
  {
    id: "k2",
    title: "Crew rest window",
    excerpt:
      "Minimum rest is counted from shift end. Back shifts inherit the previous morning's overrun in full.",
    characters: 268,
    source: { name: "Rostering rules.md", kind: "MD" },
  },
  {
    id: "k3",
    title: "Reshuffle velocity row",
    excerpt:
      "Q1 table: north basin 41/wk, kettle point 12/wk, relay floor 88/wk; propagation median 1.4s.",
    characters: 1250,
    source: { name: "Reshuffle Export.csv", kind: "CSV" },
  },
];

/**
 * The retrieved context, shelved in plain sight: each chunk carries its
 * title, the excerpt itself, a character count, and the document it came
 * from typed by kind — so what the model was given is inspectable, not
 * implied. The count header admits how much of the working set is off-shelf.
 * An answer's context is part of the answer; a system that hides its
 * retrieval asks to be trusted twice.
 *
 * Reduced motion: cards print in place.
 */
export function SourceShelf({
  heading = "All chunks",
  total,
  chunks = DEFAULT_CHUNKS,
  className,
}: SourceShelfProps) {
  const motionSafe = useMotionSafe();
  const step = cascade(chunks.length);
  const count = total ?? chunks.length;

  return (
    <div className={cn("w-full max-w-md", className)}>
      <p className="flex items-baseline gap-2">
        <span className="text-label text-ink-3">{heading}</span>
        <span className="rounded-full border border-hairline px-1.5 py-px font-mono text-[10px] text-ink-3">
          {count}
        </span>
      </p>

      <ul className="mt-3 flex flex-col gap-3">
        {chunks.map((chunk, index) => (
          <motion.li
            key={chunk.id}
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
            className="min-w-0 rounded-3 border border-hairline bg-surface-1 p-3.5"
          >
            <p className="flex min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium text-ink">
                {chunk.title}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                {chunk.characters.toLocaleString()} characters
              </span>
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
              {chunk.excerpt}
            </p>
            <p className="mt-2.5 flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 rounded-[4px] border border-hairline px-1 py-px font-mono text-[9px] tracking-[0.08em] text-ink-3">
                {chunk.source.kind}
              </span>
              <span className="min-w-0 truncate text-xs text-ink-3">
                {chunk.source.name}
              </span>
            </p>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
