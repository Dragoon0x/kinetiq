"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { DustMotes } from "@/registry/ui/dust-motes";

export const tweaks = defineTweaks({
  count: {
    kind: "range",
    label: "Count",
    default: 220,
    min: 40,
    max: 600,
    step: 20,
  },
  focus: {
    kind: "range",
    label: "Focus",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.05,
  },
  drift: {
    kind: "range",
    label: "Drift",
    default: 0.6,
    min: 0,
    max: 2,
    step: 0.1,
  },
});

/**
 * The Waylight Archive's reading room in the late afternoon: the hero is the
 * light in the room, dust turning slowly through it.
 */
export function DustMotesDemo({
  chrome = true,
  // The room is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // Reduced motion holds the field still, whatever the speed says.
  const motionSafe = useMotionSafe();
  const [leaning, setLeaning] = React.useState(false);
  const [pulled, setPulled] = React.useState<number | null>(null);
  const focus = values.focus ?? 0.45;
  const count = values.count ?? 220;
  const drift = values.drift ?? 0.6;

  // A new resting focus from the panel is the lens's focus again.
  const [shownFocus, setShownFocus] = React.useState(focus);
  if (shownFocus !== focus) {
    setShownFocus(focus);
    setPulled(null);
  }

  const room = (
    <DustMotes
      onActiveChange={setLeaning}
      // The lens reports its let-go too (null), so a touch's held focus
      // stays on the status line for as long as it holds.
      onFocusPull={setPulled}
      className={
        chrome
          ? "h-64 rounded-3 border border-hairline"
          : "h-52 rounded-3 border border-hairline"
      }
      {...values}
    >
      <div className="flex size-full items-end p-4 sm:p-6">
        <div className="max-w-64 rounded-3 border border-hairline bg-background/85 px-4 py-3 backdrop-blur-sm">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Waylight Archive
          </p>
          <p className="mt-1 text-base leading-snug font-medium text-balance text-foreground">
            Rooms full of afternoon
          </p>
          {chrome ? (
            <>
              <p className="mt-1 text-xs text-ink-2">
                The reading room is open late on Thursdays
              </p>
              <button
                type="button"
                className="mt-3 inline-flex h-8 items-center rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors outline-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                Plan a visit
              </button>
            </>
          ) : null}
        </div>
      </div>
    </DustMotes>
  );

  if (!chrome) return <div className="flex w-full">{room}</div>;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      {room}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {pulled !== null ? (
          <>
            <span className="text-signal">focus pulled</span> ·{" "}
            {pulled.toFixed(2)} deep
          </>
        ) : leaning ? (
          <>
            <span className="text-signal">leaning</span> · the room follows your
            hand
          </>
        ) : (
          <>
            <span className="text-signal">focus {focus.toFixed(2)}</span> ·{" "}
            {count} motes · {drift > 0 && motionSafe ? "drifting" : "still"}
          </>
        )}
      </p>
    </div>
  );
}
