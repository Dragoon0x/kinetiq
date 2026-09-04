"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { StepperFlow } from "@/registry/ui/stepper-flow";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type Station = {
  id: string;
  label: string;
  title: string;
  copy: string;
  /** What the product holds at this station, shown in the scene panel. */
  artifacts: { name: string; state: string }[];
};

export type HowStationLineProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  stations?: Station[];
  className?: string;
};

const DEFAULT_STATIONS: Station[] = [
  {
    id: "collect",
    label: "Collect",
    title: "Everything lands in the intake",
    copy: "Reports, feeds, and notes arrive with their source attached. Nothing waits in an inbox; nothing arrives loose.",
    artifacts: [
      { name: "North weir sensor feed", state: "live" },
      { name: "Crew report — morning", state: "filed" },
      { name: "Lab assay #91", state: "attached" },
    ],
  },
  {
    id: "rule",
    label: "Rule",
    title: "Conflicts wait for a person",
    copy: "When two sources disagree the row holds open. Someone rules, signs it, and both readings stay on the record.",
    artifacts: [
      { name: "Flow rate conflict", state: "held open" },
      { name: "Ruling — G. Ide", state: "signed" },
      { name: "Both readings", state: "kept" },
    ],
  },
  {
    id: "publish",
    label: "Publish",
    title: "Reports quote rows, not memory",
    copy: "Exports carry lineage, revisions propagate to every citation, and the paper trail keeps itself.",
    artifacts: [
      { name: "Q3 basin report", state: "cites 214" },
      { name: "Revision r2", state: "propagated" },
      { name: "Export bundle", state: "with lineage" },
    ],
  },
];

/**
 * How-it-works as a station line: the journey is the library's own stepper —
 * pick a station and its scene slides in from the direction of travel,
 * showing the artifacts the product actually holds at that point. The
 * stepper carries the geometry and the keyboard; the section only stages
 * what each stop means.
 */
export function HowStationLine({
  eyebrow = "Basinworks · how it works",
  headline = "Three stations between a reading and a report.",
  copy = "Walk the line. Every stop shows what the product is holding for you at that moment.",
  stations = DEFAULT_STATIONS,
  className,
}: HowStationLineProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [current, setCurrent] = React.useState(0);

  // The frame takes the height of the panel standing in it. A fixed reserve
  // is wrong for every panel but one — too tall and the section stands open
  // under the shortest, too short and it jumps — so it is measured. The last
  // measured height holds while mode="wait" empties the frame between swaps.
  const [panelHeight, setPanelHeight] = React.useState<number | null>(null);
  const panelObserver = React.useRef<ResizeObserver | null>(null);
  const measurePanel = React.useCallback((node: HTMLDivElement | null) => {
    panelObserver.current?.disconnect();
    panelObserver.current = null;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      const next = node.offsetHeight;
      if (next > 0) setPanelHeight(next);
    });
    observer.observe(node);
    panelObserver.current = observer;
  }, []);
  React.useEffect(
    () => () => {
      panelObserver.current?.disconnect();
    },
    [],
  );
  const [direction, setDirection] = React.useState(1);
  const station = stations[current];

  const go = (index: number) => {
    setDirection(index >= current ? 1 : -1);
    setCurrent(Math.max(0, Math.min(stations.length - 1, index)));
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("relative bg-surface-0", className)}
    >
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="mt-4 leading-relaxed text-ink-2">{copy}</p>
        </div>

        <div className="mt-10">
          <StepperFlow
            steps={stations.map((s) => ({ id: s.id, label: s.label }))}
            current={current}
            onStepChange={go}
          />
        </div>

        <motion.div
          className="relative mt-8 overflow-hidden"
          animate={{ height: panelHeight ?? "auto" }}
          transition={
            motionSafe && panelHeight !== null ? springs.glide : { duration: 0 }
          }
        >
          <div ref={measurePanel}>
            <AnimatePresence mode="wait" initial={false}>
              {station && (
                <motion.div
                  key={station.id}
                  initial={
                    motionSafe
                      ? { opacity: 0, x: direction * distances.shift }
                      : { opacity: 0 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: durations.fast },
                  }}
                  transition={
                    motionSafe
                      ? { duration: durations.base, ease: easings.enter }
                      : { duration: durations.fast }
                  }
                  className="grid items-start gap-6 md:grid-cols-2"
                >
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold tracking-tight">
                      {station.title}
                    </h3>
                    <p className="mt-3 leading-relaxed text-ink-2">
                      {station.copy}
                    </p>
                  </div>
                  <ul className="min-w-0 rounded-4 border border-hairline bg-surface-1 p-4 shadow-raised">
                    {station.artifacts.map((artifact) => (
                      <li
                        key={artifact.name}
                        className="flex items-center justify-between gap-3 border-b border-hairline px-1 py-2.5 last:border-b-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">
                          {artifact.name}
                        </span>
                        <StatusSeal
                          variant="info"
                          className="shrink-0 text-[10px]"
                        >
                          {artifact.state}
                        </StatusSeal>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <p className="mt-6 text-center font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">
          Station {current + 1} of {stations.length}
        </p>
      </div>
    </section>
  );
}
