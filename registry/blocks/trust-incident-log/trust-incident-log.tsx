"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Incident = {
  id: string;
  /** Pre-formatted date — the section never touches a clock. */
  date: string;
  title: string;
  /** Minutes of degraded or lost service. */
  minutes: number;
  severity: "degraded" | "outage";
  /** What actually happened, without euphemism. */
  what: string;
  /** What changed because of it. */
  changed: string;
};

export type TrustIncidentLogProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  incidents?: Incident[];
  /** Summary counters above the log. */
  windowLabel?: string;
  totalMinutesLabel?: string;
  className?: string;
};

const DEFAULT_INCIDENTS: Incident[] = [
  {
    id: "i1",
    date: "14 Jan",
    title: "Boards slow to cut for 41 minutes",
    minutes: 41,
    severity: "degraded",
    what: "A migration held a lock on the planning tables longer than we had tested. Boards still cut, but some took over a minute.",
    changed:
      "Migrations now run against a copy first, and the planner reports its own latency to the status page rather than to us.",
  },
  {
    id: "i2",
    date: "2 Nov",
    title: "Gate view unavailable, 12 minutes",
    minutes: 12,
    severity: "outage",
    what: "A bad config reached production because the deploy gate only checked the primary region. Two yards saw an error page at shift change, which is the worst possible minute.",
    changed:
      "Config changes now roll region by region with a five minute soak, and the gate view falls back to the last cut board offline.",
  },
  {
    id: "i3",
    date: "8 Aug",
    title: "Exports delayed overnight",
    minutes: 380,
    severity: "degraded",
    what: "A queue backed up behind one very large export and nothing shed load. Nightly exports landed at 06:40 instead of 23:00.",
    changed:
      "Large exports run on their own lane, and anything late now tells the customer before we notice.",
  },
];

/**
 * Trust argued from the incidents rather than the certificates: every failure
 * of the last year, what actually happened in plain words, and what changed
 * because of it. The vault brief states the controls; this one states the
 * times the controls were not enough — which is the harder claim and the one
 * an experienced buyer is actually testing for. A page with no incidents on
 * it is a page that is not counting.
 */
export function TrustIncidentLog({
  eyebrow = "Waylight · what went wrong",
  headline = "Every incident of the last year.",
  copy = "Written by the person who fixed it, published whether or not anyone noticed. If this list were empty we would not expect you to believe it.",
  incidents = DEFAULT_INCIDENTS,
  windowLabel = "incidents, last 12 months",
  totalMinutesLabel = "minutes affected, total",
  className,
}: TrustIncidentLogProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(incidents.length);

  const totalMinutes = incidents.reduce(
    (sum, incident) => sum + incident.minutes,
    0,
  );

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-24">
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

        <dl className="mt-10 grid grid-cols-2 gap-6 border-y border-hairline py-6">
          <div className="min-w-0">
            <dd>
              <Readout value={incidents.length} size="lg" />
            </dd>
            <dt className="mt-1 text-label text-ink-3">{windowLabel}</dt>
          </div>
          <div className="min-w-0">
            <dd>
              <Readout value={totalMinutes} size="lg" />
            </dd>
            <dt className="mt-1 text-label text-ink-3">{totalMinutesLabel}</dt>
          </div>
        </dl>

        <ol className="mt-8 flex flex-col gap-8">
          {incidents.map((incident, index) => (
            <motion.li
              key={incident.id}
              initial={{ opacity: motionSafe ? 0 : 1 }}
              whileInView={{ opacity: 1 }}
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
              className="min-w-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <span className="font-mono text-[11px] tracking-[0.06em] text-ink-3">
                  {incident.date}
                </span>
                <h3 className="min-w-0 font-semibold tracking-tight text-ink">
                  {incident.title}
                </h3>
                <StatusSeal
                  variant={incident.severity === "outage" ? "danger" : "warn"}
                >
                  {incident.severity}
                </StatusSeal>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-2 sm:gap-6">
                <div className="min-w-0">
                  <dt className="text-label text-ink-3">What happened</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink-2">
                    {incident.what}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-label text-ink-3">What changed</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink-2">
                    {incident.changed}
                  </dd>
                </div>
              </dl>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
