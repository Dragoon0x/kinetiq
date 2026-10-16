"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSlotAvailability,
  defaultSlotZones,
  DurationSlots,
  type SlotPick,
} from "@/registry/ui/duration-slots";

export const tweaks = defineTweaks({
  pillShape: {
    kind: "choice",
    label: "Pills",
    default: "soft",
    options: ["round", "soft", "square"],
    names: { round: "Round", soft: "Soft", square: "Square" },
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
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Iris",
    },
  },
});

const hhmm = (m: number) => {
  const v = ((m % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const dayText = (iso: string) => {
  const [y = 2026, m = 1, d = 1] = iso.split("-").map(Number);
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? ""} ${d} oct`;
};

/** How many times a day offers at a length: runs partitioned from their start. */
const timesOn = (iso: string, length: number) => {
  const k = length / 30;
  const mins = (defaultSlotAvailability[iso] ?? [])
    .map((t) => {
      const [h = 0, m = 0] = t.split(":").map(Number);
      return h * 60 + m;
    })
    .sort((a, b) => a - b);
  let count = 0;
  let run = 0;
  mins.forEach((m, i) => {
    run = i > 0 && m - (mins[i - 1] ?? 0) === 30 ? run + 1 : 1;
    const next = mins[i + 1];
    if (next === undefined || next - m !== 30) count += Math.floor(run / k);
  });
  return count;
};

/**
 * Coldbrook Clinic's booking page for a first nutrition consultation. Switch
 * the length from 30 to 60 minutes and the open times join into pairs.
 */
export function DurationSlotsDemo({
  chrome = true,
  // The page is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [length, setLength] = React.useState(30);
  const [day, setDay] = React.useState("2026-10-22");
  const [pick, setPick] = React.useState<SlotPick | null>(null);
  const [zone, setZone] = React.useState("lisbon");
  const [booked, setBooked] = React.useState<SlotPick | null>(null);
  const [run, setRun] = React.useState(0);

  const page = (
    <DurationSlots
      key={run}
      duration={length}
      onDurationChange={setLength}
      date={day}
      onDateChange={setDay}
      value={pick}
      onPick={(p) => {
        setPick(p);
        setBooked(null);
      }}
      onConfirm={setBooked}
      zone={zone}
      onZoneChange={setZone}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{page}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );
  const z = defaultSlotZones.find((x) => x.id === zone);
  const shift = (z?.offset ?? 60) - 60;
  const zoneName = (z?.label ?? "Lisbon").toLowerCase();
  const n = timesOn(day, length);

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {page}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setLength(30);
            setDay("2026-10-22");
            setPick(null);
            setZone("lisbon");
            setBooked(null);
            setRun((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {booked ? (
          <>
            <span className="text-signal">booked</span> · {dayText(booked.date)}{" "}
            {hhmm(booked.start + shift)} {zoneName}
          </>
        ) : pick ? (
          <>
            <span className="text-signal">picked</span> ·{" "}
            {hhmm(pick.start + shift)}–{hhmm(pick.end + shift)} {zoneName}
          </>
        ) : (
          <>
            <span className="text-signal">{length} min</span> ·{" "}
            {n === 1 ? "1 time" : `${n} times`} on {dayText(day)}
          </>
        )}
      </p>
    </div>
  );
}
