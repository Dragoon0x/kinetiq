"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { HarpStrings, type HarpStringsPluck } from "@/registry/ui/harp-strings";

export const tweaks = defineTweaks({
  strings: {
    kind: "range",
    label: "Strings",
    default: 24,
    min: 12,
    max: 36,
    step: 4,
  },
  damping: {
    kind: "range",
    label: "Damping",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.05,
  },
  color: {
    kind: "choice",
    label: "Color",
    default: "cobalt",
    options: ["cobalt", "signal", "brass", "rose"],
    names: { cobalt: "Cobalt", signal: "Signal", brass: "Brass", rose: "Rose" },
  },
});

/**
 * Coldbrook Conservatory, a music school: its welcome sits on a wall of
 * strings that ring as a visitor's hand passes.
 */
export function HarpStringsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [last, setLast] = React.useState<HarpStringsPluck | null>(null);
  const quiet = React.useRef(0);
  const strings = values.strings ?? 24;

  React.useEffect(() => () => window.clearTimeout(quiet.current), []);

  // The status names the last string plucked while it rings, then rests.
  const onPluck = (p: HarpStringsPluck) => {
    setLast(p);
    window.clearTimeout(quiet.current);
    quiet.current = window.setTimeout(() => setLast(null), 2200);
  };

  const harp = (
    <HarpStrings
      onPluck={onPluck}
      sound={sound}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-center p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Coldbrook Conservatory
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Lessons that ring true
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                Harp, guitar and voice, all ages
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Book a lesson
              </button>
            </>
          ) : null}
        </div>
      </div>
    </HarpStrings>
  );

  if (!chrome) return <div className="flex w-full">{harp}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {harp}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {last ? (
          <>
            <span className="text-signal">string {last.string + 1}</span> ·{" "}
            {last.note} · ringing
          </>
        ) : (
          <>
            <span className="text-signal">{strings} strings</span> · a breeze
            across them
          </>
        )}
      </p>
    </div>
  );
}
