"use client";

import * as React from "react";

import { motion } from "motion/react";

import { durations, easings } from "@/registry/lib/motion";
import { ThinkingFold } from "@/registry/ui/thinking-fold";

/** Gaugeworks Reasoner in Fieldline's quoting tool, working through three quotes. */
const LINES = [
  "Reading the three quotes and their billing terms.",
  "Fernworks bills monthly; Coldbrook and Basinworks bill quarterly.",
  "Normalising all three to a 12-month total with setup fees included.",
  "The Fieldline renewal comes out 40.00 under the next cheapest.",
];

/** Tenths of a second at which each line lands, and when the answer begins. */
const ARRIVALS = [6, 14, 23, 31];
const SETTLE_AT = 36;

const button =
  "flex h-8 items-center rounded-2 border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function ThinkingFoldDemo() {
  const [ticks, setTicks] = React.useState(0);
  const [running, setRunning] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  // A hidden tab pauses the clock; thinking should not finish unseen.
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const thinking = running && ticks < SETTLE_AT;

  React.useEffect(() => {
    if (!thinking || !visible) return;
    const timer = window.setInterval(() => setTicks((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [thinking, visible]);

  const lines = LINES.slice(0, ARRIVALS.filter((at) => at <= ticks).length);
  const elapsed = Math.min(ticks, SETTLE_AT) / 10;
  const answered = running && ticks >= SETTLE_AT;

  const status = !running
    ? "Idle · press play"
    : `${thinking ? "Thinking" : "Thought for"} · ${elapsed.toFixed(1)}s · ${lines.length} lines · ${open ? "unfolded" : "folded"}`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ThinkingFold
          thinking={thinking}
          lines={lines}
          elapsed={running ? elapsed : 0}
          open={open}
          onOpenChange={setOpen}
        />
        {answered ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="px-1 text-sm leading-relaxed text-foreground"
          >
            Renew with Fieldline. Over 12 months it comes to 40.00 less than the
            Fernworks quote, and the other two bill quarterly with a setup fee.
          </motion.p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTicks(0);
            setRunning(true);
          }}
          className={button}
        >
          {running ? "Replay" : "Play"}
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status}
      </p>
    </div>
  );
}
