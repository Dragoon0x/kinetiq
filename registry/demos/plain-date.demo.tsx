"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { PlainDate } from "@/registry/ui/plain-date";

export const tweaks = defineTweaks({
  weekStart: {
    kind: "choice",
    label: "Week starts",
    default: "mon",
    options: ["mon", "sun", "sat"],
    names: { mon: "Monday", sun: "Sunday", sat: "Saturday" },
  },
  format: {
    kind: "choice",
    label: "Format",
    default: "short",
    options: ["short", "long", "iso", "relative"],
    names: { short: "Short", long: "Long", iso: "ISO", relative: "Relative" },
  },
  calendar: { kind: "toggle", label: "Calendar", default: true },
  strict: { kind: "toggle", label: "Strict", default: false },
});

/**
 * Tuesday 13 October 2026, 9:30 am. Fixed, so the phrases read the same on
 * the server, in every browser and on every day the page is opened.
 */
const NOW = new Date(2026, 9, 13, 9, 30);

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MONTHS = [
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
] as const;

const dueLine = (d: Date, hasTime: boolean) => {
  const day = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (!hasTime) return day;
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}, ${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
};

/**
 * A Fernworks task, "Restock the Basin sampling kits", with a Due field that
 * opens on "next fri 3pm" — said on a Tuesday, so it has two readings.
 */
export function PlainDateDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [due, setDue] = React.useState<{ date: Date; hasTime: boolean } | null>(
    null,
  );

  const field = (
    <PlainDate
      label="Due"
      now={NOW}
      defaultText="next fri 3pm"
      value={due?.date ?? null}
      onValueChange={(date, { hasTime }) =>
        setDue(date ? { date, hasTime } : null)
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full max-w-xl">{field}</div>;

  return (
    <div className="flex w-full max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Restock the Basin sampling kits
          </p>
          <p className="text-xs text-ink-3">Fernworks · Field ops</p>
        </div>
        {field}
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {due ? (
          <>
            <span className="text-signal">due</span> ·{" "}
            {dueLine(due.date, due.hasTime)}
          </>
        ) : (
          <>
            <span className="text-signal">not set</span> · type a day, enter
            sets it
          </>
        )}
      </p>
    </div>
  );
}
