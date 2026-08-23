"use client";

import * as React from "react";

import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { Readout } from "@/registry/ui/readout";
import { TraceInput } from "@/registry/ui/trace-input";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BackIssue = {
  id: string;
  number: number;
  title: string;
  /** Pre-formatted date; the section never touches a clock. */
  date: string;
  readMinutes: number;
  href: string;
};

export type NewsletterBackIssuesProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  issues?: BackIssue[];
  /** How many issues exist in total, including the ones not listed. */
  totalIssues?: number;
  cadence?: string;
  cta?: string;
  onSubscribe?: (email: string) => void;
  className?: string;
};

const DEFAULT_ISSUES: BackIssue[] = [
  {
    id: "i1",
    number: 41,
    title: "What a crane hold actually costs, measured across nine yards",
    date: "4 Mar",
    readMinutes: 6,
    href: "#i41",
  },
  {
    id: "i2",
    number: 40,
    title: "We got tide modelling wrong for four months",
    date: "18 Feb",
    readMinutes: 9,
    href: "#i40",
  },
  {
    id: "i3",
    number: 39,
    title: "Why we stopped shipping a mobile app",
    date: "4 Feb",
    readMinutes: 5,
    href: "#i39",
  },
  {
    id: "i4",
    number: 38,
    title: "Reading a shift plan in the rain: a field note",
    date: "21 Jan",
    readMinutes: 4,
    href: "#i38",
  },
];

/**
 * Signup with the back catalogue in front of it: four real issues, readable
 * now, before anything is asked for. Every newsletter section promises the
 * reader something good will arrive; this one lets them check by reading four
 * that already did — which is a far cheaper thing to ask than trust, and the
 * only honest way to sell a mailing list.
 */
export function NewsletterBackIssues({
  eyebrow = "Waylight · the yard letter",
  headline = "Read four before you decide.",
  copy = "Every second Tuesday, on what we got right and what we did not. Nothing is gated — the archive is open whether or not you subscribe.",
  issues = DEFAULT_ISSUES,
  totalIssues = 41,
  cadence = "Every second Tuesday · unsubscribe in one click",
  cta = "Subscribe",
  onSubscribe,
  className,
}: NewsletterBackIssuesProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(issues.length);
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || done) return;
    onSubscribe?.(email.trim());
    setDone(true);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl min-w-0">
            <p className="text-label text-ink-3">{eyebrow}</p>
            <h2
              id={headingId}
              className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
            >
              {headline}
            </h2>
            <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
          </div>
          <p className="flex flex-col items-start sm:items-end">
            <Readout value={totalIssues} size="lg" />
            <span className="mt-1 text-label text-ink-3">issues, all open</span>
          </p>
        </div>

        <ul className="mt-10 flex flex-col">
          {issues.map((issue, index) => (
            <motion.li
              key={issue.id}
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
              className="border-t border-hairline"
            >
              <a
                href={issue.href}
                className="group flex min-w-0 items-baseline gap-4 py-4"
              >
                <span className="w-8 shrink-0 font-mono text-[11px] text-ink-3">
                  {issue.number}
                </span>
                <span className="min-w-0 flex-1 leading-snug text-ink transition-colors group-hover:text-primary">
                  {issue.title}
                </span>
                <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 sm:inline">
                  {issue.date} · {issue.readMinutes} min
                </span>
                <ArrowUpRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-ink-3 transition-colors group-hover:text-primary"
                />
              </a>
            </motion.li>
          ))}
        </ul>

        <form
          onSubmit={submit}
          aria-label={cta}
          className="mt-8 flex flex-wrap items-start gap-2 border-t border-hairline pt-8"
        >
          <TraceInput
            label="Email"
            labelHidden
            type="email"
            placeholder="you@yard.example"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            className="min-w-0 flex-1"
            disabled={done}
          />
          <PressureButton
            type="submit"
            className="h-11 shrink-0"
            disabled={done}
          >
            {done ? "Subscribed" : cta}
          </PressureButton>
        </form>
        <p role="status" className="mt-2 min-h-4 text-xs text-ink-3">
          {done
            ? "You are on the list. Issue 42 lands on the fourth."
            : cadence}
        </p>
      </div>
    </section>
  );
}
