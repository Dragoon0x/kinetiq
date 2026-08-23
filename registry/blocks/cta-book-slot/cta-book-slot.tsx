"use client";

import * as React from "react";

import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, distances, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BookDay = {
  id: string;
  /** "Tue 4 Mar" — pre-formatted, so the section never touches a clock. */
  label: string;
  slots: { id: string; time: string; taken?: boolean }[];
};

export type CtaBookSlotProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  days?: BookDay[];
  /** What the meeting actually is. */
  promise?: string[];
  cta?: string;
  onBook?: (dayId: string, slotId: string) => void;
  className?: string;
};

const DEFAULT_DAYS: BookDay[] = [
  {
    id: "d1",
    label: "Tue 4 Mar",
    slots: [
      { id: "d1s1", time: "08:00" },
      { id: "d1s2", time: "11:30", taken: true },
      { id: "d1s3", time: "15:00" },
    ],
  },
  {
    id: "d2",
    label: "Wed 5 Mar",
    slots: [
      { id: "d2s1", time: "07:30" },
      { id: "d2s2", time: "13:00" },
      { id: "d2s3", time: "16:30", taken: true },
    ],
  },
  {
    id: "d3",
    label: "Thu 6 Mar",
    slots: [
      { id: "d3s1", time: "09:00" },
      { id: "d3s2", time: "12:00" },
      { id: "d3s3", time: "17:00" },
    ],
  },
];

const DEFAULT_PROMISE = [
  "Thirty minutes, and we will use about twenty",
  "Your yard on screen, not a slide deck",
  "No second call before you ask for one",
];

/**
 * The close as a specific time: real slots on real days, taken ones visibly
 * spent, and the promise of what the half hour actually contains printed
 * beside them. A "book a demo" button asks the visitor to start a
 * negotiation; a grid of times asks them to pick one, which is a far smaller
 * thing to agree to. Times are pre-formatted strings, so the section never
 * touches a clock and never disagrees with the server about today.
 */
export function CtaBookSlot({
  eyebrow = "Waylight · talk to someone who ran a yard",
  headline = "Pick a half hour.",
  copy = "These are real openings this week. Whoever takes it has worked a shift, and will have your yard on screen before you join.",
  days = DEFAULT_DAYS,
  promise = DEFAULT_PROMISE,
  cta = "Book it",
  onBook,
  className,
}: CtaBookSlotProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(days.length);
  const [picked, setPicked] = React.useState<{
    day: string;
    slot: string;
  } | null>(null);

  const pickedLabel = React.useMemo(() => {
    if (!picked) return null;
    const day = days.find((d) => d.id === picked.day);
    const slot = day?.slots.find((s) => s.id === picked.slot);
    return day && slot ? `${day.label}, ${slot.time}` : null;
  }, [picked, days]);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto grid w-full max-w-5xl gap-10 px-6 py-20 sm:py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16">
        <div className="min-w-0">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
          <ul className="mt-6 flex flex-col gap-2">
            {promise.map((line) => (
              <li
                key={line}
                className="flex items-start gap-2 text-sm text-ink-2"
              >
                <span
                  aria-hidden
                  className="mt-2.5 h-px w-3 shrink-0 bg-hairline-strong"
                />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <fieldset className="min-w-0">
            <legend className="mb-3 text-label text-ink-3">This week</legend>
            <div className="flex flex-col gap-4">
              {days.map((day, index) => (
                <motion.div
                  key={day.id}
                  initial={{
                    opacity: motionSafe ? 0 : 1,
                    y: motionSafe ? distances.nudge : 0,
                  }}
                  whileInView={{ opacity: 1, y: 0 }}
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
                  className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline pb-4"
                >
                  <p className="w-24 shrink-0 font-mono text-xs tracking-[0.06em] text-ink">
                    {day.label}
                  </p>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {day.slots.map((slot) => {
                      const active =
                        picked?.day === day.id && picked?.slot === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          disabled={slot.taken}
                          aria-pressed={active}
                          onClick={() =>
                            setPicked({ day: day.id, slot: slot.id })
                          }
                          className={cn(
                            "rounded-2 border px-3 py-1.5 font-mono text-xs transition-colors",
                            slot.taken
                              ? "cursor-not-allowed border-hairline text-ink-3 line-through opacity-50"
                              : active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-hairline text-ink-2 hover:border-hairline-strong hover:text-ink",
                          )}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>
          </fieldset>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <PressureButton
              size="lg"
              disabled={!picked}
              onClick={() => picked && onBook?.(picked.day, picked.slot)}
            >
              {cta}
            </PressureButton>
            {pickedLabel && (
              <StatusSeal variant="success">{pickedLabel}</StatusSeal>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
