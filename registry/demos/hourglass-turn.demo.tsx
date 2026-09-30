"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HourglassTurn } from "@/registry/ui/hourglass-turn";

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
  sand: {
    kind: "choice",
    label: "Sand",
    default: "sand",
    options: ["sand", "rose", "mint"],
    names: { sand: "Sand", rose: "Rose", mint: "Mint" },
  },
  size: {
    kind: "range",
    label: "Size",
    default: 32,
    min: 16,
    max: 48,
    step: 4,
    unit: "px",
  },
});

const FILES = 12;
/** One export, start to finish, in ms. */
const EXPORT_MS = 6000;
const TICK_MS = 100;

/**
 * Basinworks backing up a vault: the hourglass keeps turning while the
 * backup runs, and a ledger export in the list below waits its turn. In
 * chrome, Export runs a real determinate job through `progress`.
 */
export function HourglassTurnDemo({
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
      done = Math.min(1, Number((done + TICK_MS / EXPORT_MS).toFixed(4)));
      setShare(done);
      if (done >= 1) setJob("done");
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [job]);

  const start = () => {
    setShare(0);
    setJob("running");
  };

  const percent = Math.round(share * 100);
  const files = Math.min(FILES, Math.floor(share * FILES));
  const label =
    job === "running"
      ? "Exporting the ledger"
      : job === "done"
        ? "Ledger exported"
        : "Backing up the vault";

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex flex-col items-center gap-4 self-center">
        <HourglassTurn
          label={label}
          progress={job === "idle" ? undefined : share}
          className="text-sm text-foreground"
          sound={sound}
          {...values}
        />
        <div className="flex w-64 max-w-full items-center justify-between gap-3 rounded-3 border border-hairline bg-card px-3 py-2 text-xs">
          <span className="truncate text-foreground">Ledger export, March</span>
          <HourglassTurn
            label="Queued"
            size={16}
            speed={values.speed}
            sand={values.sand}
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
              {job === "done" ? "Export again" : "Export ledger"}
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {job === "running" ? (
              <>
                <span className="text-signal">exporting</span> · {percent}%
              </>
            ) : job === "done" ? (
              <>
                <span className="text-signal">exported</span> · {FILES} of{" "}
                {FILES} files
              </>
            ) : (
              <>
                <span className="text-signal">backing up</span> · drag the glass
                to turn it
              </>
            )}
            {job === "running" ? ` · ${files} of ${FILES} files` : null}
          </p>
        </>
      ) : null}
    </div>
  );
}
