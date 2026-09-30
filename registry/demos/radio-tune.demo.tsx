"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RadioTune } from "@/registry/ui/radio-tune";

export const tweaks = defineTweaks({
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  band: {
    kind: "choice",
    label: "Band",
    default: "fm",
    options: ["fm", "am", "sw"],
    names: { fm: "FM", am: "AM", sw: "SW" },
  },
  dial: {
    kind: "choice",
    label: "Dial",
    default: "walnut",
    options: ["cream", "walnut", "black"],
    names: { cream: "Cream", walnut: "Walnut", black: "Black" },
  },
});

/** Pairing, start to finish, in ms. */
const PAIR_MS = 5000;
const TICK_MS = 100;

const HOME: Record<string, string> = {
  fm: "97.5 mhz",
  am: "880 khz",
  sw: "11.82 mhz",
};

/**
 * Gaugeworks pairing a meter with its relay: the radio searches the dial
 * while the relay is found, and a meter in the list below listens with a
 * small one. In chrome, Pair runs a real determinate job through `progress`
 * and the needle locks onto the relay's station when it is done.
 */
export function RadioTuneDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [job, setJob] = React.useState<"idle" | "running" | "done">("idle");
  const [share, setShare] = React.useState(0);

  React.useEffect(() => {
    if (job !== "running") return;
    let done = 0;
    const id = window.setInterval(() => {
      done = Math.min(1, Number((done + TICK_MS / PAIR_MS).toFixed(4)));
      setShare(done);
      if (done >= 1) setJob("done");
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [job]);

  const start = () => {
    setShare(0);
    setJob("running");
  };

  const label =
    job === "running"
      ? "Pairing with the relay"
      : job === "done"
        ? "Relay found"
        : "Finding the relay";

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-4 self-center">
        <RadioTune
          label={label}
          size={48}
          progress={job === "idle" ? undefined : share}
          className="text-sm text-foreground"
          sound={sound}
          {...values}
        />
        <div className="flex w-64 max-w-full items-center justify-between gap-3 rounded-3 border border-hairline bg-card px-3 py-2 text-xs">
          <span className="truncate text-foreground">Meter 14, north yard</span>
          <RadioTune
            label="Listening"
            size={16}
            speed={values.speed}
            band={values.band}
            dial={values.dial}
            className="shrink-0 text-ink-3"
          />
        </div>
      </div>
      {chrome ? (
        <>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={start}
              disabled={job === "running"}
              className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50"
            >
              {job === "done" ? "Pair again" : "Pair the meter"}
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {job === "running" ? (
              <>
                <span className="text-signal">pairing</span> ·{" "}
                {Math.round(share * 100)}%
              </>
            ) : job === "done" ? (
              <>
                <span className="text-signal">locked</span> ·{" "}
                {HOME[values.band ?? "fm"]} · relay found
              </>
            ) : (
              <>
                <span className="text-signal">searching</span> ·{" "}
                {values.band ?? "fm"} · turn the knob
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
