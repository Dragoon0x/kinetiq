"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";

import { PressureButton } from "@/registry/ui/pressure-button";
import { StatusSeal } from "@/registry/ui/status-seal";
import { VignetteHub } from "@/registry/ui/vignette-hub";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type OrbitApp = {
  id: string;
  label: string;
  /** Which way data actually moves. */
  direction: "read" | "write" | "both";
  /** How often, in the app's own words — "every 60s", "nightly". */
  cadence: string;
  /** One line on what the connection is for. */
  note: string;
};

export type IntegrationsOrbitHubProps = {
  eyebrow?: string;
  headline?: string;
  deck?: string;
  apps?: OrbitApp[];
  /** Node selected on mount. @default apps[0]?.id */
  defaultActiveId?: string;
  onConnect?: (id: string) => void;
  className?: string;
};

const DEFAULT_APPS: OrbitApp[] = [
  {
    id: "tidebook",
    label: "Tidebook",
    direction: "both",
    cadence: "every 60s",
    note: "Berth plans and holds move both ways, live.",
  },
  {
    id: "berthline",
    label: "Berthline",
    direction: "read",
    cadence: "every 5 min",
    note: "Quay sensors report berth occupancy straight through.",
  },
  {
    id: "crewcall",
    label: "Crewcall",
    direction: "write",
    cadence: "as shifts change",
    note: "Call-outs post the moment the roster moves.",
  },
  {
    id: "gangway",
    label: "Gangway",
    direction: "read",
    cadence: "on each visit",
    note: "Crew credentials are checked at the gate, per visit.",
  },
  {
    id: "driftmark",
    label: "Driftmark",
    direction: "both",
    cadence: "every 15 min",
    note: "Wind and swell arrive; deck holds go back out.",
  },
  {
    id: "wharfnote",
    label: "Wharfnote",
    direction: "read",
    cadence: "every 2 min",
    note: "Maintenance faults land the moment they are raised.",
  },
  {
    id: "sparline",
    label: "Sparline",
    direction: "write",
    cadence: "every 60s",
    note: "Gate changes post straight to the crew channel.",
  },
  {
    id: "chartroom",
    label: "Chartroom",
    direction: "write",
    cadence: "nightly",
    note: "Signed hours land as journal lines, tagged by berth.",
  },
];

const DIRECTION_LABEL: Record<OrbitApp["direction"], string> = {
  read: "Reads only",
  write: "Writes only",
  both: "Reads and writes",
};

/**
 * The hub, made selectable: the ring of nodes from vignette-hub becomes a
 * row of buttons, and picking one swaps the panel beside it instead of
 * navigating anywhere. Where the patch bay is a catalogue of jacks, this
 * section answers one question at a time for the app you just picked: which
 * way the data moves, and how often, rather than lining up logos and calling
 * it done. Connecting is a single press: the button confirms, a seal stamps,
 * and the mono count below it ticks up.
 *
 * Reduced motion: the hub falls back to its own static layout, and the panel
 * swap is instant rather than a cross-fade.
 */
export function IntegrationsOrbitHub({
  eyebrow = "Waylight · integrations",
  headline = "Pick a tool. See exactly what it does.",
  deck = "Every node on the hub is a real connection, not a logo. Select one to see which way the data moves, how often, and to switch it on.",
  apps = DEFAULT_APPS,
  defaultActiveId,
  onConnect,
  className,
}: IntegrationsOrbitHubProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();
  const [activeId, setActiveId] = React.useState(
    () => defaultActiveId ?? apps[0]?.id ?? "",
  );
  const [connected, setConnected] = React.useState<Record<string, boolean>>(
    {},
  );

  const active = apps.find((app) => app.id === activeId) ?? apps[0];
  const nodes = apps.map((app) => ({ id: app.id, label: app.label }));
  const connectedCount = Object.values(connected).filter(Boolean).length;
  const isActiveConnected = active ? Boolean(connected[active.id]) : false;

  const handleConnect = () => {
    if (!active || connected[active.id]) return;
    const id = active.id;
    setConnected((prev) => ({ ...prev, [id]: true }));
    onConnect?.(id);
  };

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:items-start lg:gap-16">
        <div className="max-w-xl">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{deck}</p>
        </div>

        <div className="flex flex-col items-center gap-8">
          <VignetteHub
            nodes={nodes}
            activeId={activeId}
            onNodeSelect={setActiveId}
            className="max-w-xs"
          />

          <div className="w-full max-w-sm">
            <div
              aria-live="polite"
              className="border-hairline min-h-52 border-t pt-6"
            >
              <AnimatePresence mode="wait" initial={false}>
                {active && (
                  <motion.div
                    key={active.id}
                    initial={motionSafe ? { opacity: 0 } : false}
                    animate={{ opacity: 1 }}
                    exit={
                      motionSafe
                        ? { opacity: 0, transition: exitFor(durations.base) }
                        : { opacity: 0, transition: { duration: 0 } }
                    }
                    transition={
                      motionSafe
                        ? { duration: durations.base, ease: easings.enter }
                        : { duration: 0 }
                    }
                  >
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-ink text-xl font-medium tracking-tight">
                        {active.label}
                      </span>
                      {isActiveConnected && (
                        <StatusSeal variant="success" live>
                          connected
                        </StatusSeal>
                      )}
                    </p>
                    <p className="text-ink-2 mt-3 text-sm leading-relaxed">
                      {active.note}
                    </p>

                    <dl className="mt-4 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <dt className="text-ink-3 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase">
                          Direction
                        </dt>
                        <dd className="text-ink-2 text-sm">
                          {DIRECTION_LABEL[active.direction]}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="text-ink-3 shrink-0 font-mono text-[10px] tracking-[0.08em] uppercase">
                          Cadence
                        </dt>
                        <dd className="text-ink-2 text-sm">
                          {active.cadence}
                        </dd>
                      </div>
                    </dl>

                    <PressureButton
                      onClick={handleConnect}
                      disabled={isActiveConnected}
                      className="mt-6 w-full"
                    >
                      {isActiveConnected
                        ? "Connected"
                        : `Connect ${active.label}`}
                    </PressureButton>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <p role="status" className="text-label text-ink-3 mt-4">
              CONNECTED · {connectedCount}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
