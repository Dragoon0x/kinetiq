"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { FocusMoon } from "@/registry/ui/focus-moon";

export const tweaks = defineTweaks({
  minutes: {
    kind: "range",
    label: "Minutes",
    default: 60,
    min: 15,
    max: 120,
    step: 15,
    unit: "min",
  },
  stars: {
    kind: "range",
    label: "Stars",
    default: 5,
    min: 0,
    max: 8,
    step: 1,
  },
  glow: {
    kind: "range",
    label: "Glow",
    default: 0.6,
    min: 0,
    max: 1,
    step: 0.05,
  },
});

/** The demo's clock stands still at 14:00 UTC, so every render agrees. */
const NOW = Date.UTC(2026, 9, 2, 14, 0);

const clock = (date: Date) =>
  `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;

/**
 * A Gaugeworks team chat: hold your notifications while you work, until a
 * time you can push back by holding the button.
 */
export function FocusMoonDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [focusing, setFocusing] = React.useState(false);
  const [until, setUntil] = React.useState<Date | undefined>(undefined);
  const minutes = values.minutes ?? 60;

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3 border border-hairline bg-card py-3 pr-3 pl-4">
        <div className="flex min-w-36 flex-1 items-center gap-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-cobalt-wash text-xs font-medium text-cobalt-bright"
          >
            MO
          </span>
          <div className="min-w-0">
            <p
              className="truncate text-sm font-medium text-foreground"
              title="Mara Okafor"
            >
              Mara Okafor
            </p>
            <p
              className="truncate text-xs text-ink-3"
              title="Gaugeworks · review at 16:00"
            >
              Gaugeworks · review at 16:00
            </p>
          </div>
        </div>
        <FocusMoon
          pressed={focusing}
          onPressedChange={setFocusing}
          until={until}
          onUntilChange={setUntil}
          now={NOW}
          sound={sound}
          {...values}
        />
      </div>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {focusing && until ? (
            <>
              <span className="text-signal">
                notifications paused until {clock(until)}
              </span>{" "}
              · hold to extend
            </>
          ) : (
            <>
              <span className="text-signal">notifications on</span> · press to
              focus for {minutes} min
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
