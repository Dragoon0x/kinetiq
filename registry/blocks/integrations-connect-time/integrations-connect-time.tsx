"use client";

import * as React from "react";

import { motion } from "motion/react";

import { Readout } from "@/registry/ui/readout";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ConnectStep = {
  id: string;
  name: string;
  /** Minutes it actually takes, start to finish. */
  minutes: number;
  /** What you must have in hand before you begin. */
  needs: string[];
  /** Who has to do it, when it is not the reader. */
  owner?: string;
  /** Marked when the connection cannot be undone cleanly. */
  oneWay?: boolean;
};

export type IntegrationsConnectTimeProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  connections?: ConnectStep[];
  needsLabel?: string;
  className?: string;
};

const DEFAULT_CONNECTIONS: ConnectStep[] = [
  {
    id: "c1",
    name: "Weather service",
    minutes: 2,
    needs: ["Nothing — it is on by default"],
  },
  {
    id: "c2",
    name: "Identity provider",
    minutes: 20,
    needs: ["Admin on your IdP", "A metadata URL"],
    owner: "Your IT admin",
  },
  {
    id: "c3",
    name: "Terminal operating system",
    minutes: 90,
    needs: ["A read/write API user", "Your berth naming convention"],
    owner: "Your TOS vendor, usually",
  },
  {
    id: "c4",
    name: "Payroll",
    minutes: 45,
    needs: ["Your hour codes", "A sandbox to test against"],
    owner: "Your finance lead",
    oneWay: true,
  },
];

/**
 * Integrations priced in the only currency that matters at setup: minutes,
 * and whose minutes. Every row says how long it really takes, what you need
 * in hand before starting, and which ones you cannot do yourself. The patch
 * bay is a catalogue and the two-way table answers what moves; this one
 * answers the question that decides whether a rollout slips — who has to be
 * in the room.
 */
export function IntegrationsConnectTime({
  eyebrow = "Waylight · what it takes",
  headline = "Every connection, in minutes.",
  copy = "These are measured from real setups, not estimated. Where a row needs someone other than you, we have said so rather than letting you find out on the day.",
  connections = DEFAULT_CONNECTIONS,
  needsLabel = "Have ready",
  className,
}: IntegrationsConnectTimeProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(connections.length);

  const total = connections.reduce((sum, item) => sum + item.minutes, 0);

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

        <ul className="mt-10 flex flex-col">
          {connections.map((item, index) => (
            <motion.li
              key={item.id}
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
              className="grid min-w-0 gap-x-6 gap-y-2 border-t border-hairline py-5 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{item.name}</span>
                  {item.oneWay && (
                    <StatusSeal variant="warn">not reversible</StatusSeal>
                  )}
                </p>
                <p className="mt-2 text-label text-ink-3">{needsLabel}</p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {item.needs.map((need) => (
                    <li key={need} className="text-sm text-ink-2">
                      {need}
                    </li>
                  ))}
                </ul>
                {item.owner && (
                  <p className="mt-2 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    Needs {item.owner}
                  </p>
                )}
              </div>
              <p className="flex shrink-0 items-baseline gap-1 sm:justify-end">
                <Readout value={item.minutes} size="lg" />
                <span className="text-sm text-ink-3">min</span>
              </p>
            </motion.li>
          ))}
        </ul>

        <p className="mt-6 flex flex-wrap items-baseline gap-x-2 border-t border-hairline pt-5 text-sm text-ink-2">
          <span>All four, end to end:</span>
          <Readout value={total} />
          <span className="text-ink-3">
            minutes of actual work, usually spread over two or three days.
          </span>
        </p>
      </div>
    </section>
  );
}
