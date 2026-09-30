"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { SundialHour } from "@/registry/ui/sundial-hour";

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
  dial: {
    kind: "choice",
    label: "Dial",
    default: "stone",
    options: ["stone", "brass", "slate"],
    names: { stone: "Stone", brass: "Brass", slate: "Slate" },
  },
  numerals: {
    kind: "choice",
    label: "Numerals",
    default: "roman",
    options: ["roman", "arabic", "ticks"],
    names: { roman: "Roman", arabic: "Arabic", ticks: "Ticks" },
  },
});

/** A business day squeezed into seconds, how often it reports, and the pause before the card runs it again. */
const DAY_MS = 9600;
const STEP_MS = 160;
const REST_MS = 3200;

/** 06:00 → 18:00 as "9 am", "noon", "4 pm". */
const hourOf = (share: number) => {
  const h = Math.floor(6 + 12 * share);
  if (h === 12) return "noon";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
};

/**
 * A pretend business day that reports how much of it has passed. On the
 * card it runs again after a pause; on the page it runs once and waits for
 * Run the day again.
 */
function useDay(loop: boolean) {
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
      share = Math.min(1, share + STEP_MS / DAY_MS);
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
 * Coldbrook Bank settling the day's transfers by evening, and a payout that
 * arrives by the end of the day, told by a sundial inline.
 */
export function SundialHourDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const { progress, again } = useDay(!chrome);
  const settled = progress >= 1;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 self-center">
        <SundialHour
          size={64}
          label="Settling today's transfers"
          progress={progress}
          sound={sound}
          {...values}
        />
        <p className="text-center text-sm text-ink-2">
          Payout{" "}
          <SundialHour
            size={16}
            label="arrives by evening"
            sound={sound}
            {...values}
          />
        </p>
      </div>
      {chrome ? (
        <>
          <button
            type="button"
            onClick={again}
            className="inline-flex h-8 items-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Run the day again
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {settled ? (
              <>
                <span className="text-signal">settled</span> · drag the shadow
              </>
            ) : (
              <>
                <span className="text-signal">settling</span> ·{" "}
                {hourOf(progress)}
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
