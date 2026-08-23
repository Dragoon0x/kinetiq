"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LogoReceipt = {
  id: string;
  /** The wordmark. */
  mark: string;
  /** The measured result this customer gave permission to print. */
  value: number;
  suffix?: string;
  prefix?: string;
  /** What that number is. */
  measure: string;
};

export type LogoReceiptWallProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  receipts?: LogoReceipt[];
  /** The line that keeps the wall honest. */
  footnote?: string;
  className?: string;
};

const DEFAULT_RECEIPTS: LogoReceipt[] = [
  {
    id: "r1",
    mark: "NORTH BASIN",
    value: 74,
    measure: "minutes back per morning",
  },
  {
    id: "r2",
    mark: "KETTLE POINT",
    value: 91,
    suffix: "%",
    measure: "reshuffles not re-keyed",
  },
  { id: "r3", mark: "MILLRACE", value: 4, measure: "yards on one record" },
  {
    id: "r4",
    mark: "DRY DOCK 2",
    value: 3,
    suffix: "×",
    measure: "faster shift close",
  },
  {
    id: "r5",
    mark: "COLD STORE CO",
    value: 0,
    measure: "missed sequence windows since May",
  },
  {
    id: "r6",
    mark: "TWO BRIDGES",
    value: 38,
    suffix: "%",
    measure: "fewer radio calls at shift change",
  },
];

/**
 * A logo wall where every mark carries the number it earned. Bare wordmarks
 * ask the reader to assume the relationship went well; a mark with a measured
 * result attached makes the far stronger claim, and the customer had to agree
 * to the number as well as the name. Use fewer, better marks here — six with
 * receipts beat thirty without.
 */
export function LogoReceiptWall({
  eyebrow = "Waylight · with receipts",
  headline = "Every mark brought a number.",
  copy = "Each of these agreed to publish a measurement, not just a logo. They chose which one.",
  receipts = DEFAULT_RECEIPTS,
  footnote = "Measured by the yard, not by us, over their own first six months. We publish whatever they send, including the flat ones.",
  className,
}: LogoReceiptWallProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(receipts.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
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

        <ul className="mt-12 grid gap-px overflow-hidden sm:grid-cols-2 lg:grid-cols-3">
          {receipts.map((receipt, index) => (
            <motion.li
              key={receipt.id}
              initial={{
                opacity: motionSafe ? 0 : 1,
                y: motionSafe ? distances.nudge : 0,
              }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={
                motionSafe
                  ? {
                      duration: durations.base,
                      ease: easings.enter,
                      delay: index * step,
                    }
                  : { duration: 0 }
              }
              className="min-w-0 border-t border-hairline bg-surface-0 py-6"
            >
              <p className="font-mono text-[11px] tracking-[0.14em] text-ink-3">
                {receipt.mark}
              </p>
              <p className="mt-3 flex items-baseline gap-0.5">
                {receipt.prefix && (
                  <span className="text-lg text-ink-3">{receipt.prefix}</span>
                )}
                <Readout value={receipt.value} size="lg" />
                {receipt.suffix && (
                  <span className="text-lg text-ink-3">{receipt.suffix}</span>
                )}
              </p>
              <p className="mt-1 text-sm leading-snug text-balance text-ink-2">
                {receipt.measure}
              </p>
            </motion.li>
          ))}
        </ul>

        {footnote && (
          <p className="mt-8 max-w-xl border-t border-hairline pt-5 text-xs leading-relaxed text-ink-3">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
