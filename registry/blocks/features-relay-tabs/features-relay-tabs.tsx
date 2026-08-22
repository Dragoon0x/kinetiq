"use client";

import * as React from "react";

import { Inbox, Route, ShieldCheck } from "lucide-react";

import {
  GantryTabs,
  GantryTabsContent,
  GantryTabsList,
  GantryTabsTrigger,
} from "@/registry/ui/gantry-tabs";
import { StatusSeal } from "@/registry/ui/status-seal";
import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings } from "@/registry/lib/motion";
import { motion } from "motion/react";
import { cn } from "@/registry/lib/utils";

export type RelayScene = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  title: string;
  copy: string;
  /** Terminal-style beats shown in the scene's panel, top to bottom. */
  beats: { line: string; state: string }[];
};

export type FeaturesRelayTabsProps = {
  eyebrow?: string;
  headline?: string;
  copy?: string;
  scenes?: RelayScene[];
  className?: string;
};

const DEFAULT_SCENES: RelayScene[] = [
  {
    value: "receive",
    label: "Receive",
    icon: <Inbox className="size-4" aria-hidden />,
    title: "Requests arrive already sorted",
    copy: "Every inbound request is classified on arrival — intent, urgency, and the team it belongs to — before anyone reads it.",
    beats: [
      { line: "ticket #4180 · billing dispute", state: "classified" },
      { line: "intent: refund · urgency: high", state: "0.3s" },
      { line: "routed → payments desk", state: "done" },
    ],
  },
  {
    value: "route",
    label: "Route",
    icon: <Route className="size-4" aria-hidden />,
    title: "The right desk, not the next desk",
    copy: "Routing follows load and skill, not a round-robin — the dispute lands with whoever has both context and capacity.",
    beats: [
      { line: "payments desk · 3 open", state: "capacity ok" },
      { line: "match: prior case #3921", state: "context" },
      { line: "assigned → R. Okafor", state: "done" },
    ],
  },
  {
    value: "audit",
    label: "Audit",
    icon: <ShieldCheck className="size-4" aria-hidden />,
    title: "Every hop on the record",
    copy: "Each classification and reassignment is logged with its reason, so a month later the path a request took is a fact, not a memory.",
    beats: [
      { line: "hops: 2 · reasons attached", state: "logged" },
      { line: "SLA clock · 41m remaining", state: "on track" },
      { line: "export → weekly review", state: "ready" },
    ],
  },
];

/**
 * A staged feature tour on the library's own tab gantry: three scenes, one
 * stage. The tab indicator's travel comes from gantry-tabs — its leading edge
 * gliding ahead of the trailing edge — and each scene's panel plays a short
 * terminal sequence of beats, faded in down the list, so switching tabs reads
 * as changing what the product is doing rather than swapping a screenshot.
 */
export function FeaturesRelayTabs({
  eyebrow = "Switchyard · request routing",
  headline = "Watch a request find its way.",
  copy = "One request, three moments — received, routed, and on the record. Pick a stage; the scene plays it.",
  scenes = DEFAULT_SCENES,
  className,
}: FeaturesRelayTabsProps) {
  const headingId = React.useId();
  const motionSafe = useMotionSafe();

  return (
    <section
      aria-labelledby={headingId}
      className={cn("bg-surface-0 relative", className)}
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-label text-ink-3">{eyebrow}</p>
          <h2
            id={headingId}
            className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            {headline}
          </h2>
          <p className="text-ink-2 mt-4 leading-relaxed">{copy}</p>
        </div>

        <div className="mx-auto mt-10 max-w-3xl">
          <GantryTabs defaultValue={scenes[0]?.value} variant="underline">
            <GantryTabsList className="justify-center">
              {scenes.map((scene) => (
                <GantryTabsTrigger
                  key={scene.value}
                  value={scene.value}
                  icon={scene.icon}
                >
                  {scene.label}
                </GantryTabsTrigger>
              ))}
            </GantryTabsList>

            {scenes.map((scene) => (
              <GantryTabsContent
                key={scene.value}
                value={scene.value}
                className="pt-8"
              >
                <div className="grid min-w-0 items-start gap-8 md:grid-cols-2">
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold tracking-tight">
                      {scene.title}
                    </h3>
                    <p className="text-ink-2 mt-3 leading-relaxed">
                      {scene.copy}
                    </p>
                  </div>
                  <div className="border-hairline bg-surface-1 rounded-4 min-w-0 border p-4 shadow-raised">
                    <ul className="flex flex-col gap-2">
                      {scene.beats.map((beat, index) => (
                        <motion.li
                          key={beat.line}
                          initial={motionSafe ? { opacity: 0, y: 6 } : false}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: durations.base,
                            ease: easings.enter,
                            delay: motionSafe ? index * 0.12 : 0,
                          }}
                          className="border-hairline bg-surface-0 rounded-2 flex items-center justify-between gap-3 border px-3 py-2.5"
                        >
                          <span className="text-ink min-w-0 flex-1 truncate font-mono text-xs">
                            {beat.line}
                          </span>
                          <StatusSeal variant="info" className="shrink-0 text-[10px]">
                            {beat.state}
                          </StatusSeal>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </div>
              </GantryTabsContent>
            ))}
          </GantryTabs>
        </div>
      </div>
    </section>
  );
}
