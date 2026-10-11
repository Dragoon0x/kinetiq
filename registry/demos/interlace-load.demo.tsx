"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { InterlaceLoad } from "@/registry/ui/interlace-load";

export const tweaks = defineTweaks({
  passes: {
    kind: "range",
    label: "Passes",
    default: 7,
    min: 3,
    max: 7,
    step: 1,
  },
  speed: {
    kind: "range",
    label: "Speed",
    default: 1,
    min: 0.5,
    max: 2,
    step: 0.25,
    unit: "×",
  },
  scheme: {
    kind: "choice",
    label: "Scheme",
    default: "grid",
    options: ["rows", "grid", "scan"],
    names: { rows: "Rows", grid: "Grid", scan: "Scan" },
  },
});

/**
 * The Fernworks Journal's lead picture for its North Fork piece, arriving
 * the old way as the reader scrolls to it.
 */
export function InterlaceLoadDemo({
  chrome = true,
  // The image is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [state, setState] = React.useState<{
    pass: number;
    total: number;
    done: boolean;
  }>({ pass: 0, total: 0, done: false });
  const scheme = values.scheme ?? tweaks.scheme.default;

  const caption = (
    <span className="inline-flex rounded-2 border border-hairline bg-card/85 px-2 py-1 font-mono text-[10px] tracking-[0.08em] text-ink-2 uppercase">
      North Fork · first light
    </span>
  );

  if (!chrome) {
    return (
      <div className="flex w-full">
        <InterlaceLoad
          alt="The North Fork valley at first light, a lake below pine ridges"
          caption={caption}
          className="h-52 w-full"
          {...values}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Fernworks Journal · field notes
          </p>
          <p className="text-base font-medium text-foreground">
            Three days on the North Fork
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState({ pass: 0, total: 0, done: false });
            setRound((n) => n + 1);
          }}
          className="inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-surface-1 px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
          Replay
        </button>
      </div>
      <InterlaceLoad
        key={round}
        alt="The North Fork valley at first light, a lake below pine ridges"
        caption={caption}
        onPassChange={(pass, total) => setState({ pass, total, done: false })}
        onComplete={() => setState((s) => ({ ...s, done: true }))}
        className="h-60 w-full"
        {...values}
      />
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {state.done
            ? "loaded"
            : state.total
              ? `pass ${state.pass} of ${state.total}`
              : "waiting"}
        </span>{" "}
        · {state.total || values.passes || tweaks.passes.default} passes ·{" "}
        {scheme}
      </p>
    </div>
  );
}
