"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { LavaDrift } from "@/registry/ui/lava-drift";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.1,
    unit: "×",
  },
  wax: {
    kind: "choice",
    label: "Wax",
    default: "amber",
    options: ["amber", "rose", "teal"],
    names: { amber: "Amber", rose: "Rose", teal: "Teal" },
  },
  blobs: {
    kind: "range",
    label: "Blobs",
    default: 4,
    min: 2,
    max: 6,
    step: 1,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** How long the model takes to warm, how often it reports, and the pause before the card warms it again. */
const RUN_MS = 8000;
const STEP_MS = 160;
const REST_MS = 3600;

/**
 * A pretend warm-up that reports its progress steadily. On the card it runs
 * again after a pause; on the page it runs once and waits for Warm again.
 */
function useWarmUp(loop: boolean) {
  const [progress, setProgress] = React.useState(0);
  const [run, setRun] = React.useState(0);

  React.useEffect(() => {
    let share = 0;
    let rest = 0;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (share >= 1) {
        if (!loop) return;
        rest += STEP_MS;
        if (rest < REST_MS) return;
        share = 0;
        rest = 0;
        setProgress(0);
        return;
      }
      share = Math.min(1, share + STEP_MS / RUN_MS);
      setProgress(Math.round(share * 100) / 100);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [loop, run]);

  const again = () => {
    setProgress(0);
    setRun((n) => n + 1);
  };
  return { progress, again };
}

/**
 * Gaugeworks warming a forecast model: the lamp fills as it warms, and a
 * sandbox idles inline with its wax rising and falling.
 */
export function LavaDriftDemo({
  chrome = true,
  // The lamp is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const { progress, again } = useWarmUp(!chrome);
  const warm = progress >= 1;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 self-center">
        <LavaDrift
          size={64}
          label="Warming the model"
          progress={progress}
          {...values}
        />
        <p className="text-center text-sm text-ink-2">
          Sandbox <LavaDrift size={16} label="warming up" {...values} />
        </p>
      </div>
      {chrome ? (
        <>
          <button
            type="button"
            onClick={again}
            className="inline-flex h-8 items-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Warm again
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {warm ? (
              <>
                <span className="text-signal">warm</span> · hover the lamp
              </>
            ) : (
              <>
                <span className="text-signal">rising</span> ·{" "}
                {Math.floor(progress * 10) * 10}%
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
