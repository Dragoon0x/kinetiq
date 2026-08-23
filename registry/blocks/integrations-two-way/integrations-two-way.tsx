"use client";

import * as React from "react";

import { ArrowLeft, ArrowLeftRight, ArrowRight } from "lucide-react";
import { motion } from "motion/react";

import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, easings } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type FlowDirection = "in" | "out" | "both";

export type IntegrationFlow = {
  id: string;
  name: string;
  /** What the other system is, in two or three words. */
  kind: string;
  direction: FlowDirection;
  /** What Waylight takes from it. */
  reads?: string;
  /** What Waylight sends to it. */
  writes?: string;
  beta?: boolean;
};

export type IntegrationsTwoWayProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  flows?: IntegrationFlow[];
  /** The footnote most integration pages omit. */
  caveat?: string;
  className?: string;
};

const DEFAULT_FLOWS: IntegrationFlow[] = [
  {
    id: "f1",
    name: "Terminal operating system",
    kind: "System of record",
    direction: "both",
    reads: "Berths, moves, and holds, every 60s",
    writes: "Confirmed plan and crew assignment",
  },
  {
    id: "f2",
    name: "Payroll",
    kind: "Finance",
    direction: "out",
    writes: "Signed hours, per shift, once nightly",
  },
  {
    id: "f3",
    name: "Weather service",
    kind: "Conditions",
    direction: "in",
    reads: "Wind and swell for the planning window",
  },
  {
    id: "f4",
    name: "Maintenance log",
    kind: "Assets",
    direction: "both",
    reads: "Crane and gear availability",
    writes: "Faults raised from the board",
    beta: true,
  },
  {
    id: "f5",
    name: "Identity provider",
    kind: "Access",
    direction: "in",
    reads: "Who may sign a plan",
  },
];

const DIRECTION_META: Record<
  FlowDirection,
  { icon: React.ElementType; label: string }
> = {
  in: { icon: ArrowLeft, label: "Reads only" },
  out: { icon: ArrowRight, label: "Writes only" },
  both: { icon: ArrowLeftRight, label: "Two-way" },
};

/**
 * Integrations answered honestly: not which logos we have, but which
 * direction the data actually moves, what is read, what is written, and how
 * often. The patch bay is for browsing a catalogue; this is for the buyer who
 * has been burned by a "integration" that turned out to be a nightly CSV, and
 * who will ask the question in the second call if the page does not answer it
 * in the first.
 */
export function IntegrationsTwoWay({
  eyebrow = "Waylight · what actually moves",
  headline = "Which way the data goes.",
  copy = "Every connection below states its direction and its payload. If a row says two-way, both halves are live — we do not count a nightly export as an integration.",
  flows = DEFAULT_FLOWS,
  caveat = "Sync intervals are floors, not averages. Anything slower than stated is an incident, and you will hear about it from us first.",
  className,
}: IntegrationsTwoWayProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const step = cascade(flows.length);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
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

        <ul className="mt-10 flex flex-col border-t border-hairline">
          {flows.map((flow, index) => {
            const meta = DIRECTION_META[flow.direction];
            const Icon = meta.icon;
            return (
              <motion.li
                key={flow.id}
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
                className="grid gap-3 border-b border-hairline py-5 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,1.1fr)] sm:items-center sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{flow.name}</span>
                    {flow.beta && <StatusSeal variant="warn">beta</StatusSeal>}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-3">{flow.kind}</p>
                </div>

                <p className="flex items-center gap-2 text-sm text-ink-2">
                  <Icon aria-hidden className="size-4 shrink-0 text-ink-3" />
                  {meta.label}
                </p>

                <dl className="min-w-0 space-y-1">
                  {flow.reads && (
                    <div className="flex min-w-0 gap-2">
                      <dt className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        in
                      </dt>
                      <dd className="min-w-0 text-sm text-ink-2">
                        {flow.reads}
                      </dd>
                    </div>
                  )}
                  {flow.writes && (
                    <div className="flex min-w-0 gap-2">
                      <dt className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                        out
                      </dt>
                      <dd className="min-w-0 text-sm text-ink-2">
                        {flow.writes}
                      </dd>
                    </div>
                  )}
                </dl>
              </motion.li>
            );
          })}
        </ul>

        {caveat && (
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-3">
            {caveat}
          </p>
        )}
      </div>
    </section>
  );
}
