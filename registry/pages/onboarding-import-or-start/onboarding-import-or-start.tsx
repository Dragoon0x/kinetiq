"use client";

import * as React from "react";

import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type StartRoute = {
  id: string;
  title: string;
  copy: string;
  /** How long this path takes, plainly. */
  effort: string;
  /** What you need before you begin, if anything. */
  needs?: string;
  /** Marked on the route most people should take. */
  suggested?: boolean;
};

export type OnboardingImportOrStartProps = {
  wordmark?: string;
  headline?: string;
  copy?: string;
  routes?: StartRoute[];
  onPick?: (id: string) => void;
  /** The line that makes the choice reversible. */
  reversibleLine?: string;
  className?: string;
};

const DEFAULT_ROUTES: StartRoute[] = [
  {
    id: "import",
    title: "Bring a week over",
    copy: "Paste last week's plan — a spreadsheet, a photo of the whiteboard, anything. We read it into constraints you can correct.",
    effort: "Ten minutes",
    needs: "One week of a real plan",
    suggested: true,
  },
  {
    id: "blank",
    title: "Start from nothing",
    copy: "Name the yard and its crews, and cut a first board from public tide and weather alone. It will be visibly incomplete, which is the point.",
    effort: "Three minutes",
  },
  {
    id: "watch",
    title: "Watch a yard first",
    copy: "A read-only sample yard with a fortnight of real-shaped history. Nothing you do in it is saved.",
    effort: "As long as you like",
  },
];

/**
 * The fork at the start: bring something over, start clean, or look around
 * first — each with its cost in minutes and what it needs from you. Products
 * that force the import path lose everyone who does not have their data to
 * hand at that moment, and products that hide it lose everyone who does.
 */
export function OnboardingImportOrStart({
  wordmark = "WAYLIGHT",
  headline = "Three ways to begin.",
  copy = "None of these locks anything in. You can switch paths later, and the sample yard is there whenever you want it.",
  routes = DEFAULT_ROUTES,
  onPick,
  reversibleLine = "Whichever you pick, you can import later or start over — nothing here is a one-way door.",
  className,
}: OnboardingImportOrStartProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(routes.length);

  return (
    <main
      className={cn(
        "flex min-h-screen items-center justify-center bg-surface-0 px-6 py-16",
        className,
      )}
    >
      <div className="w-full max-w-2xl">
        <p className="font-mono text-[11px] tracking-[0.18em] text-ink-3">
          {wordmark}
        </p>
        <h1
          id={headingId}
          className="mt-6 text-3xl font-semibold tracking-tight text-ink sm:text-4xl"
        >
          {headline}
        </h1>
        <p className="mt-3 leading-relaxed text-ink-2">{copy}</p>

        <ul className="mt-8 flex flex-col gap-3">
          {routes.map((route, index) => (
            <motion.li
              key={route.id}
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
            >
              <button
                type="button"
                onClick={() => onPick?.(route.id)}
                className={cn(
                  "group flex w-full min-w-0 items-start gap-4 rounded-4 border border-hairline p-5 text-left transition-colors hover:border-hairline-strong hover:bg-surface-1",
                  route.suggested && "border-hairline-strong bg-surface-1",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{route.title}</span>
                    {route.suggested && <StatusSeal>most people</StatusSeal>}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-ink-2">
                    {route.copy}
                  </span>
                  <span className="mt-2 block font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    {route.effort}
                    {route.needs ? ` · needs ${route.needs}` : ""}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="mt-1 size-4 shrink-0 text-ink-3 transition-colors group-hover:text-primary"
                />
              </button>
            </motion.li>
          ))}
        </ul>

        <p className="mt-8 border-t border-hairline pt-6 text-xs leading-relaxed text-ink-3">
          {reversibleLine}
        </p>
      </div>
    </main>
  );
}
