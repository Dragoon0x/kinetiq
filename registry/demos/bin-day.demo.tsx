"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { BinDay, type BinDayWeekday } from "@/registry/ui/bin-day";

export const tweaks = defineTweaks({
  bins: {
    kind: "range",
    label: "Bins",
    default: 3,
    min: 2,
    max: 4,
    step: 1,
  },
  day: {
    kind: "choice",
    label: "Day",
    default: "thu",
    options: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    names: {
      mon: "Mon",
      tue: "Tue",
      wed: "Wed",
      thu: "Thu",
      fri: "Fri",
      sat: "Sat",
      sun: "Sun",
    },
  },
  colours: {
    kind: "choice",
    label: "Colours",
    default: "council",
    options: ["council", "pastel", "mono"],
    names: { council: "Council", pastel: "Pastel", mono: "Mono" },
  },
});

const DAY = 86_400_000;
/** Wednesday 7 October 2026, 18:00 — fixed, so the server and the page agree. */
const START = Date.UTC(2026, 9, 7, 18, 0);
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MO = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const NAMES = ["rubbish", "recycling", "garden", "food"];

/**
 * Coldbrook Council's collections for 12 Mill Lane: one bin a week, in
 * turn, and tonight is a put-out night.
 */
export function BinDayDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const fromTweak: BinDayWeekday = values.day ?? tweaks.day.default;
  const [day, setDay] = React.useState<BinDayWeekday>(fromTweak);
  const [seen, setSeen] = React.useState(fromTweak);
  const [now, setNow] = React.useState(START);
  const [doneFor, setDoneFor] = React.useState<number | null>(null);
  // The tweak sets the collection day; the strip changes it from there.
  if (seen !== fromTweak) {
    setSeen(fromTweak);
    setDay(fromTweak);
  }

  // The same rotation the widget keeps, for the status line.
  const n = Math.max(2, Math.min(4, values.bins ?? tweaks.bins.default));
  const today = Math.floor(now / DAY);
  const until =
    (WEEKDAYS.indexOf(day) - new Date(today * DAY).getUTCDay() + 7) % 7;
  const dueDay = today + until;
  const binOf = (d: number) => Math.floor((d + 3) / 7) % n;
  const done = doneFor === dueDay;
  const dueName = NAMES[binOf(dueDay)] ?? "";
  const nextName = NAMES[binOf(dueDay + 7)] ?? "";
  const date = (d: number) => {
    const at = new Date(d * DAY);
    return `${at.getUTCDate()} ${MO[at.getUTCMonth()]}`;
  };
  const when =
    until === 0 ? "out today" : until === 1 ? "out tonight" : "out this week";

  return (
    <div className="flex w-full max-w-80 flex-col items-center gap-4">
      <BinDay
        {...values}
        label="Bin day, 12 Mill Lane"
        now={now}
        day={day}
        onDayChange={setDay}
        done={done}
        onDoneChange={(d) => setDoneFor(d ? dueDay : null)}
        sound={sound}
      />
      {chrome ? (
        <>
          <button
            type="button"
            onClick={() => setNow((t) => t + DAY)}
            className="inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Next day
          </button>
          <p
            role="status"
            className="w-full border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {done ? (
              <>
                <span className="text-signal">{dueName} done</span> · next{" "}
                {nextName} {date(dueDay + 7)}
              </>
            ) : (
              <>
                <span className="text-signal">{dueName}</span> · {when} ·{" "}
                {date(dueDay)}
              </>
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}
