"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KeycapPress, type KeycapPressVia } from "@/registry/ui/keycap-press";

export const tweaks = defineTweaks({
  switch: {
    kind: "choice",
    label: "Switch",
    default: "clicky",
    options: ["clicky", "tactile", "linear"],
    names: { clicky: "Clicky", tactile: "Tactile", linear: "Linear" },
  },
  height: {
    kind: "range",
    label: "Height",
    default: 8,
    min: 4,
    max: 14,
    step: 1,
    unit: "px",
  },
  legend: {
    kind: "choice",
    label: "Legend",
    default: "both",
    options: ["both", "key", "label"],
    names: { both: "Both", key: "Key", label: "Label" },
  },
  glow: { kind: "toggle", label: "Glow", default: true },
});

/** The Fieldline Mail inbox, on a loop so the key never runs out of work. */
const THREADS = [
  { from: "Basinworks billing", subject: "Invoice 2291 is ready" },
  { from: "Gaugeworks", subject: "Uptime report: May" },
  { from: "Coldbrook Bank", subject: "March statement" },
  { from: "Fernworks", subject: "Order FW-4410 shipped" },
  { from: "Waylight Pay", subject: "Payout of 1,240 sent" },
  { from: "Fieldline", subject: "3 reviews waiting" },
] as const;

const HOW: Record<KeycapPressVia, string> = {
  shortcut: "with the e key",
  keyboard: "from the keyboard",
  pointer: "by click",
};

/**
 * Inbox triage in Fieldline Mail: the top thread and an Archive key whose
 * shortcut is E. Click it, focus it and press Space, or type E anywhere on
 * the page — the key goes down each way, and the next thread comes up.
 */
export function KeycapPressDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [archived, setArchived] = React.useState(0);
  const [via, setVia] = React.useState<KeycapPressVia | null>(null);
  const thread = THREADS[archived % THREADS.length] ?? THREADS[0];

  return (
    <div className="flex w-full max-w-xs flex-col gap-4">
      <div className="flex items-center gap-4 rounded-3 border border-hairline bg-card py-3 pr-3 pl-4">
        <motion.div
          key={archived}
          className="min-w-0 flex-1"
          initial={
            archived === 0
              ? false
              : motionSafe
                ? { opacity: 0, y: distances.nudge }
                : { opacity: 0 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <p className="truncate text-xs text-ink-3" title={thread.from}>
            {thread.from}
          </p>
          <p
            className="truncate text-sm text-foreground"
            title={thread.subject}
          >
            {thread.subject}
          </p>
        </motion.div>
        <KeycapPress
          label="Archive"
          shortcut="e"
          onPress={(how) => {
            setArchived((n) => n + 1);
            setVia(how);
          }}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {archived === 0 || via === null ? (
            <>
              <span className="text-signal">inbox</span> · press e or click
              archive
            </>
          ) : (
            <>
              <span className="text-signal">{archived} archived</span> · last{" "}
              {HOW[via]}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
