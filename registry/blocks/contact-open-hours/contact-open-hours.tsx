"use client";

import * as React from "react";

import { motion } from "motion/react";

import { StatusPip } from "@/registry/ui/status-pip";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OpenHour = {
  id: string;
  /** Pre-formatted day and time in one stated zone; no clock is read. */
  when: string;
  /** What this session is for. */
  focus: string;
  /** Who will be on it. */
  host: string;
  /** Marked on the one happening next. */
  next?: boolean;
};

export type ContactOpenHoursProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  hours?: OpenHour[];
  joinLabel?: string;
  joinHref?: string;
  /** What to bring, so the half hour is not wasted. */
  bring?: string[];
  /** The line for people who cannot make any of them. */
  fallbackLine?: string;
  className?: string;
};

const DEFAULT_HOURS: OpenHour[] = [
  {
    id: "h1",
    when: "Tuesdays 07:00 UTC",
    focus: "Setup and first boards",
    host: "Nour, field",
    next: true,
  },
  {
    id: "h2",
    when: "Wednesdays 15:00 UTC",
    focus: "Constraints and scheduling behaviour",
    host: "Mara, founder",
  },
  {
    id: "h3",
    when: "Thursdays 21:00 UTC",
    focus: "Integrations and the API",
    host: "Ilya, reliability",
  },
];

const DEFAULT_BRING = [
  "Your yard name, if you already have one",
  "A morning that went badly, ideally last week's",
  "Anything the board got wrong",
];

/**
 * Contact as a standing invitation rather than a form or an address: three
 * open sessions a week, each with a stated subject and a named host, plus
 * what to bring so the half hour is not spent establishing context. The
 * routing desk asks why you are writing and the direct lines give you
 * addresses; this one gives a time and a person, which is the shortest path
 * for anyone whose question is really a conversation.
 */
export function ContactOpenHours({
  eyebrow = "Waylight · open hours",
  headline = "Three standing half hours a week.",
  copy = "No booking, no agenda, no sales call. Turn up to whichever one matches your question — or to none of them and write instead.",
  hours = DEFAULT_HOURS,
  joinLabel = "Join link",
  joinHref = "#join",
  bring = DEFAULT_BRING,
  fallbackLine = "None of these work? Write to the address on the contact page — the same people answer it, usually within a shift.",
  className,
}: ContactOpenHoursProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(hours.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto grid w-full max-w-4xl gap-10 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
        <div className="min-w-0">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>

          <ul className="mt-8 flex flex-col">
            {hours.map((hour, index) => (
              <motion.li
                key={hour.id}
                initial={{ opacity: motionSafe ? 0 : 1 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={
                  motionSafe
                    ? {
                        duration: durations.base,
                        ease: easings.enter,
                        delay: index * step,
                      }
                    : { duration: 0 }
                }
                className="min-w-0 border-t border-hairline py-4"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {hour.next ? (
                    <StatusPip
                      status="online"
                      label={hour.when}
                      pulse={motionSafe}
                    />
                  ) : (
                    <span className="font-mono text-sm tracking-[0.04em] text-ink">
                      {hour.when}
                    </span>
                  )}
                  <a
                    href={joinHref}
                    className="ml-auto text-xs text-ink-3 underline underline-offset-4 transition-colors hover:text-ink"
                  >
                    {joinLabel}
                  </a>
                </div>
                <p className="mt-1.5 text-sm text-ink-2">{hour.focus}</p>
                <p className="mt-0.5 text-xs text-ink-3">{hour.host}</p>
              </motion.li>
            ))}
          </ul>
        </div>

        <aside className="min-w-0 rounded-4 border border-hairline bg-surface-1 p-6">
          <p className="text-label text-ink-3">Worth bringing</p>
          <ul className="mt-3 flex flex-col gap-2">
            {bring.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm text-ink-2"
              >
                <span
                  aria-hidden
                  className="mt-2.5 h-px w-3 shrink-0 bg-hairline-strong"
                />
                {item}
              </li>
            ))}
          </ul>
          {fallbackLine && (
            <p className="mt-5 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-3">
              {fallbackLine}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
