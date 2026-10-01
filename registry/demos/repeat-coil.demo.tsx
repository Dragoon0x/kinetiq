"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RepeatCoil, type RepeatMode } from "@/registry/ui/repeat-coil";

export const tweaks = defineTweaks({
  coil: {
    kind: "range",
    label: "Coil",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
  pip: { kind: "toggle", label: "Pip", default: true },
  compact: { kind: "toggle", label: "Compact", default: false },
});

const STATUS: Record<RepeatMode, [string, string]> = {
  off: ["repeat off", "queue ends after track 12"],
  all: ["repeat all", "queue loops after track 12"],
  one: ["repeat one", "low tide plays again"],
};

/**
 * Fieldline Radio's now-playing card: the fourth of twelve tracks, with the
 * repeat control beside the scrubber.
 */
export function RepeatCoilDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [mode, setMode] = React.useState<RepeatMode>("off");
  const [head, tail] = STATUS[mode];

  return (
    <div className="flex w-full max-w-80 flex-col gap-4">
      <div className="flex w-full max-w-xs flex-col gap-3 self-center rounded-3 border border-hairline bg-card p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-2 bg-cobalt-wash"
          >
            <svg width={22} height={14} viewBox="0 0 22 14" fill="none">
              <path
                d="M1 4 Q 4.5 1 8 4 T 15 4 T 21 4 M1 10 Q 4.5 7 8 10 T 15 10 T 21 10"
                strokeWidth={1.6}
                strokeLinecap="round"
                className="stroke-cobalt-bright"
              />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              Low Tide
            </p>
            <p
              className="truncate text-xs text-ink-3"
              title="Coldbrook Quartet · Fieldline Sessions"
            >
              Coldbrook Quartet
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="h-1 overflow-clip rounded-full bg-surface-2">
              <div className="h-full w-[43%] rounded-full bg-ink-3" />
            </div>
            <p className="mt-1.5 flex justify-between gap-2 font-mono text-[10px] text-ink-3 tabular-nums">
              <span>1:42</span>
              <span>3:58</span>
            </p>
          </div>
          <RepeatCoil
            size="lg"
            value={mode}
            onValueChange={setMode}
            sound={sound}
            {...values}
          />
        </div>
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{head}</span> · {tail}
        </p>
      ) : null}
    </div>
  );
}
