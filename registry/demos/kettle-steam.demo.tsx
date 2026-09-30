"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { KettleSteam } from "@/registry/ui/kettle-steam";

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
  steam: {
    kind: "range",
    label: "Steam",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  body: {
    kind: "choice",
    label: "Body",
    default: "steel",
    options: ["steel", "enamel", "copper"],
    names: { steel: "Steel", enamel: "Enamel", copper: "Copper" },
  },
});

/** How long the report takes to brew, how often it reports, and the pause before the card brews again. */
const RUN_MS = 6400;
const STEP_MS = 160;
const REST_MS = 3600;

/**
 * A pretend job that reports its progress: quick at first and slow near the
 * end, the way water comes to the boil. On the card it runs again after a
 * pause; on the page it runs once and waits for Brew again.
 */
function useBrew(loop: boolean) {
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
      share = Math.min(1, share + (STEP_MS / RUN_MS) * (1.35 - 0.7 * share));
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
 * Fieldline brewing a weekly report: the kettle heats with the job and
 * whistles when pressed at the boil, and a digest simmers inline.
 */
export function KettleSteamDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const { progress, again } = useBrew(!chrome);
  const boiled = progress >= 1;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 self-center">
        <KettleSteam
          size={64}
          label="Brewing the report"
          progress={progress}
          sound={sound}
          {...values}
        />
        <p className="text-center text-sm text-ink-2">
          Fieldline digest{" "}
          <KettleSteam size={16} label="simmering" sound={sound} {...values} />
        </p>
      </div>
      {chrome ? (
        <>
          <button
            type="button"
            onClick={again}
            className="inline-flex h-8 items-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Brew again
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {boiled ? (
              <>
                <span className="text-signal">boiled</span> · press the kettle
                to whistle
              </>
            ) : (
              <>
                <span className="text-signal">heating</span> ·{" "}
                {Math.floor(progress * 10) * 10}%
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
