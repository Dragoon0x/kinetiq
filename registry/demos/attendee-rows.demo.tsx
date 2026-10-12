"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  AttendeeRows,
  computeAttendeeTotals,
  defaultAttendeeDiscount,
  defaultAttendees,
  defaultAttendeeTicketTypes,
  type Attendee,
  type AttendeeStatus,
} from "@/registry/ui/attendee-rows";

export const tweaks = defineTweaks({
  summaryPosition: {
    kind: "choice",
    label: "Summary",
    default: "side",
    options: ["side", "foot"],
    names: { side: "Beside", foot: "At the foot" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "success"],
    names: { cobalt: "Cobalt", signal: "Signal", success: "Green" },
  },
});

/**
 * The Fernmoor co-op registering for Coldbrook Field Day: two names in, a
 * third row waiting, and a group discount two attendees away.
 */
export function AttendeeRowsDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [value, setValue] = React.useState<Attendee[]>(defaultAttendees);
  const [status, setStatus] = React.useState<AttendeeStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  if (!chrome) {
    return (
      <div className="w-full">
        <AttendeeRows height={540} {...values} />
      </div>
    );
  }

  const reload = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setStatus("loading");
    const fail = failNext;
    setFailNext(false);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus(fail ? "error" : "ready");
    }, 900);
  };

  const totals = computeAttendeeTotals(
    value,
    defaultAttendeeTicketTypes,
    defaultAttendeeDiscount,
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      <AttendeeRows
        height={560}
        value={value}
        onChange={setValue}
        status={status}
        onRetry={reload}
        onSubmit={() => setSubmitted((n) => n + 1)}
        {...values}
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">
            {totals.attendees} attendees · ${totals.total.toFixed(2)}
          </span>{" "}
          ·{" "}
          {totals.discount > 0
            ? `${defaultAttendeeDiscount.percent}% group discount`
            : "no discount yet"}
          {submitted > 0 ? ` · registered ${submitted}×` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFailNext(true)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:border-hairline-strong aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next load
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setValue(defaultAttendees);
              setSubmitted(0);
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
