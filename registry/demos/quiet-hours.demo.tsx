"use client";

import * as React from "react";

import { QuietHours } from "@/registry/ui/quiet-hours";

/** The demo clock runs 240×, so one demo minute is a quarter of a second. */
const TICK_MS = 250;
const DAY = 1440;

const clockOf = (minute: number): string => {
  const total = ((Math.round(minute) % DAY) + DAY) % DAY;
  const hour24 = Math.floor(total / 60);
  const rest = total % 60;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(rest).padStart(2, "0")} ${hour24 < 12 ? "am" : "pm"}`;
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function QuietHoursDemo() {
  const [now, setNow] = React.useState(1230);
  const [range, setRange] = React.useState({ start: 1320, end: 420 });
  const [on, setOn] = React.useState(true);
  const [quiet, setQuiet] = React.useState(false);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      // A clock nobody is watching does not need to run.
      if (document.hidden) return;
      setNow((minute) => (minute + 1) % DAY);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  /** Ten minutes short of the next start, worked out from the live minute. */
  const skip = () =>
    setNow(
      (minute) =>
        (minute + (((range.start - minute + DAY) % DAY) - 10) + DAY) % DAY,
    );

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <QuietHours
        nowMinutes={now}
        start={range.start}
        end={range.end}
        onRangeChange={setRange}
        enabled={on}
        onEnabledChange={setOn}
        onQuietChange={setQuiet}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={skip} className={chip}>
          Skip to ten minutes before
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {on ? (
          <>
            <span className={quiet ? "text-signal" : undefined}>
              {quiet ? "Quiet now" : "Notifications on"}
            </span>
            {` · ${clockOf(range.start)} – ${clockOf(range.end)} · now ${clockOf(now)}`}
          </>
        ) : (
          `Quiet hours off · now ${clockOf(now)}`
        )}
      </p>
    </div>
  );
}
