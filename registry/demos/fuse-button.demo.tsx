"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, easings } from "@/registry/lib/motion";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FuseButton, type FuseState } from "@/registry/ui/fuse-button";

export const tweaks = defineTweaks({
  laps: {
    kind: "range",
    label: "Laps",
    default: 1,
    min: 1,
    max: 2,
    step: 1,
  },
  burn: {
    kind: "range",
    label: "Burn",
    default: 2,
    min: 1,
    max: 4,
    step: 0.5,
    unit: "s",
  },
  spark: {
    kind: "range",
    label: "Spark",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.1,
  },
  smoke: { kind: "toggle", label: "Smoke", default: true },
});

/** Each deploy ships the waiting release; the next patch comes up behind it. */
const version = (deploys: number) => `4.2.${deploys}`;
const CHANGES = [18, 6, 11, 3, 9];

/**
 * Shipping a Gaugeworks release to production: a deploy that should not
 * happen by a stray click, so it takes a held fuse.
 */
export function FuseButtonDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const motionSafe = useMotionSafe();
  const [deploys, setDeploys] = React.useState(0);
  const [fuse, setFuse] = React.useState<{ state: FuseState; share: number }>({
    state: "idle",
    share: 0,
  });
  const seconds = (values.burn ?? 2) * (values.laps ?? 1);
  const changes = CHANGES[deploys % CHANGES.length] ?? 18;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-3 border border-hairline bg-card py-1 pr-1 pl-4">
        <motion.div
          key={deploys}
          className="min-w-0 py-2"
          initial={
            deploys === 0
              ? false
              : motionSafe
                ? { opacity: 0, y: distances.nudge }
                : { opacity: 0 }
          }
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <p className="truncate text-sm text-foreground">
            Release {version(deploys)} to production
          </p>
          <p className="truncate text-xs text-ink-3">
            Gaugeworks · {changes} changes
          </p>
        </motion.div>
        <FuseButton
          label="Hold to deploy"
          onConfirm={() => setDeploys((n) => n + 1)}
          onStateChange={(state, share) => setFuse({ state, share })}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {fuse.state === "burning" ? (
            <>
              <span className="text-signal">burning</span> · hold till it lands
            </>
          ) : fuse.state === "paused" ? (
            <>
              <span className="text-signal">
                paused at {Math.round(fuse.share * 100)}%
              </span>{" "}
              · hold to relight
            </>
          ) : fuse.state === "fired" ? (
            <>
              <span className="text-signal">
                deployed {version(deploys - 1)}
              </span>{" "}
              · {deploys} {deploys === 1 ? "deploy" : "deploys"} today
            </>
          ) : (
            <>
              <span className="text-signal">hold to deploy</span> · the fuse is{" "}
              {seconds} s
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
