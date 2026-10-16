"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultDryRunSource,
  DryRun,
  type DryRunCounts,
  type DryRunStep,
} from "@/registry/ui/dry-run";

export const tweaks = defineTweaks({
  counterStyle: {
    kind: "choice",
    label: "Counters",
    default: "digits",
    options: ["digits", "bars", "waffle"],
    names: { digits: "Digits", bars: "Bars", waffle: "Waffle" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "signal",
    options: ["signal", "cobalt", "ember", "moss"],
    names: { signal: "Signal", cobalt: "Cobalt", ember: "Ember", moss: "Moss" },
  },
});

const STEP_NAMES: Record<DryRunStep, string> = {
  connect: "connect",
  map: "map",
  rehearse: "rehearse",
  run: "run",
};
const ORDER: DryRunStep[] = ["connect", "map", "rehearse", "run"];
const n = (v: number) => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type Event =
  | { kind: "step"; step: DryRunStep }
  | { kind: "rehearsing" }
  | { kind: "rehearsed"; counts: DryRunCounts }
  | { kind: "running" }
  | { kind: "ran"; counts: DryRunCounts }
  | { kind: "report"; skipped: number };

/**
 * The October Coldbrook billing export on its way into Gaugeworks: the file
 * is connected and mapped, and the migration waits at the rehearsal.
 */
export function DryRunDemo({
  chrome = true,
  // The wizard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<Event>({
    kind: "step",
    step: "rehearse",
  });

  const surface = (
    <DryRun
      key={round}
      defaultStep="rehearse"
      onStepChange={(step) => setEvent({ kind: "step", step })}
      onDryRun={() => setEvent({ kind: "rehearsing" })}
      onRun={() => setEvent({ kind: "running" })}
      onPassEnd={(pass, counts) =>
        setEvent(
          pass === "rehearsal"
            ? { kind: "rehearsed", counts }
            : { kind: "ran", counts },
        )
      }
      onDownloadReport={(report) =>
        setEvent({ kind: "report", skipped: report.run.skip })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const line =
    event.kind === "step" ? (
      <>
        <span className="text-signal">
          step {ORDER.indexOf(event.step) + 1} of 4 · {STEP_NAMES[event.step]}
        </span>{" "}
        · {n(defaultDryRunSource.rows)} rows
      </>
    ) : event.kind === "rehearsing" ? (
      <>
        <span className="text-signal">rehearsing</span> · nothing is written
      </>
    ) : event.kind === "rehearsed" ? (
      <>
        <span className="text-signal">rehearsed</span> · would create{" "}
        {n(event.counts.create)} · update {n(event.counts.update)} · skip{" "}
        {n(event.counts.skip)}
      </>
    ) : event.kind === "running" ? (
      <>
        <span className="text-signal">running</span> · writing to gaugeworks
      </>
    ) : event.kind === "ran" ? (
      <>
        <span className="text-signal">migrated</span> · created{" "}
        {n(event.counts.create)} · updated {n(event.counts.update)} · skipped{" "}
        {n(event.counts.skip)}
      </>
    ) : (
      <>
        <span className="text-signal">report ready</span> · {event.skipped} rows
        skipped
      </>
    );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setEvent({ kind: "step", step: "rehearse" });
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line}
      </p>
    </div>
  );
}
