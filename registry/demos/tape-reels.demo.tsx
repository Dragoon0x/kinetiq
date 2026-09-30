"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { TapeReels } from "@/registry/ui/tape-reels";

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
  shell: {
    kind: "choice",
    label: "Shell",
    default: "clear",
    options: ["clear", "smoke", "ivory"],
    names: { clear: "Clear", smoke: "Smoke", ivory: "Ivory" },
  },
  sticker: { kind: "toggle", label: "Paper label", default: true },
});

/** How long the backup runs, how often it reports, and the pause before the card runs it again. */
const RUN_MS = 7200;
const STEP_MS = 160;
const REST_MS = 3200;

/**
 * A pretend backup that reports its progress in uneven steps, the way files
 * of different sizes go. On the card it runs again after a pause; on the
 * page it runs once and waits for Back up again.
 */
function useBackup(loop: boolean) {
  const [progress, setProgress] = React.useState(0);
  const [run, setRun] = React.useState(0);

  React.useEffect(() => {
    let share = 0;
    let rest = 0;
    let tick = 0;
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
      tick += 1;
      // Big files stall the run for a beat; small ones hurry it.
      const burst = tick % 7 === 3 ? 0.2 : tick % 5 === 1 ? 2.2 : 1;
      share = Math.min(1, share + (STEP_MS / RUN_MS) * burst);
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
 * Basinworks backing up a studio's session files to tape, with a second
 * cassette winding inline while side B is copied.
 */
export function TapeReelsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const { progress, again } = useBackup(!chrome);
  const done = progress >= 1;

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-3 self-center">
        <TapeReels
          size={64}
          label="Backing up sessions"
          progress={progress}
          sound={sound}
          {...values}
        />
        <p className="text-center text-sm text-ink-2">
          Side B{" "}
          <TapeReels size={16} label="winding" sound={sound} {...values} />
        </p>
      </div>
      {chrome ? (
        <>
          <button
            type="button"
            onClick={again}
            className="inline-flex h-8 items-center self-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Back up again
          </button>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {done ? (
              <>
                <span className="text-signal">backed up</span> · drag the tape
                to look
              </>
            ) : (
              <>
                <span className="text-signal">winding</span> · side a ·{" "}
                {Math.floor(progress * 10) * 10}%
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
