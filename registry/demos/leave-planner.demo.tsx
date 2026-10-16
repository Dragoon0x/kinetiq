"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLeaveBalance,
  defaultLeaveHolidays,
  defaultLeavePolicies,
  defaultLeaveTeam,
  LeavePlanner,
  type LeaveRange,
  type LeaveRequest,
} from "@/registry/ui/leave-planner";

export const tweaks = defineTweaks({
  stripeStyle: {
    kind: "choice",
    label: "Away",
    default: "bands",
    options: ["bands", "hatch", "dots"],
    names: { bands: "Bands", hatch: "Hatch", dots: "Dots" },
  },
  monthCount: {
    kind: "range",
    label: "Months",
    default: 2,
    min: 1,
    max: 3,
    step: 1,
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "cobalt",
    options: ["cobalt", "moss", "ember", "plum"],
    names: { cobalt: "Cobalt", moss: "Moss", ember: "Ember", plum: "Plum" },
  },
});

const DAY = 86_400_000;
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const WEEKDAYS = "sun mon tue wed thu fri sat".split(" ");
const dayText = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};
const holidays = new Set(defaultLeaveHolidays.map((h) => h.date));
const workingDays = (r: LeaveRange) => {
  let n = 0;
  for (let t = r.from; t <= r.to; t += DAY) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(t)) n += 1;
  }
  return n;
};
const awayCount = (r: LeaveRange) =>
  defaultLeaveTeam.filter((m) =>
    m.away.some((a) => a.from <= r.to && r.from <= a.to),
  ).length;

/**
 * The Fernworks studio's leave calendar, today Monday 19 October: nine
 * annual days left, and late November already busy. Press a first day and
 * drag (or press a last day) to watch the balance drain into the calendar.
 */
export function LeavePlannerDemo({
  chrome = true,
  // The planner is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [type, setType] = React.useState("annual");
  const [range, setRange] = React.useState<LeaveRange | null>(null);
  const [requests, setRequests] = React.useState<LeaveRequest[]>([]);
  const [note, setNote] = React.useState<string | null>(null);
  const [run, setRun] = React.useState(0);

  const planner = (
    <LeavePlanner
      key={run}
      policies={defaultLeavePolicies}
      balance={defaultLeaveBalance}
      type={type}
      onTypeChange={(t) => {
        setType(t);
        setNote(null);
      }}
      range={range}
      onRangeChange={(r) => {
        setRange(r);
        setNote(null);
      }}
      requests={requests}
      onRequestsChange={setRequests}
      onRequest={(r) =>
        setNote(`requested · ${r.days === 1 ? "1 day" : `${r.days} days`}`)
      }
      onCancel={(r) =>
        setNote(`cancelled · ${dayText(r.from)} – ${dayText(r.to)}`)
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{planner}</div>;

  const policy = defaultLeavePolicies.find((p) => p.id === type);
  const pending = requests
    .filter((r) => r.type === type)
    .reduce((t, r) => t + r.days, 0);
  const left =
    policy?.allowance !== undefined
      ? (defaultLeaveBalance[type] ?? policy.allowance) - pending
      : null;
  const days = range ? workingDays(range) : 0;
  const status = note
    ? note
    : range
      ? left !== null && days > left
        ? `${days - left} ${days - left === 1 ? "day" : "days"} over balance`
        : `${dayText(range.from)} – ${dayText(range.to)} · ${days === 1 ? "1 day" : `${days} days`} · ${awayCount(range)} away`
      : `${policy?.label.toLowerCase() ?? type} · ${left === null ? "no cap" : `${left} left`}`;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {planner}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setType("annual");
            setRange(null);
            setRequests([]);
            setNote(null);
            setRun((r) => r + 1);
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
        <span className="text-signal">{status}</span>
      </p>
    </div>
  );
}
