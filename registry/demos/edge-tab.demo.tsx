"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { EdgeTab, type EdgeTabNotice } from "@/registry/ui/edge-tab";

export const tweaks = defineTweaks({
  peek: {
    kind: "range",
    label: "Peek",
    default: 16,
    min: 8,
    max: 32,
    step: 2,
    unit: "px",
  },
  side: {
    kind: "choice",
    label: "Side",
    default: "right",
    options: ["left", "right"],
    names: { left: "Left", right: "Right" },
  },
  stack: {
    kind: "choice",
    label: "Stack",
    default: "urgency",
    options: ["urgency", "time"],
    names: { urgency: "Urgency", time: "Time" },
  },
});

const FIRST: EdgeTabNotice[] = [
  {
    id: "backup",
    title: "Backup finished",
    body: "Line settings saved to the Basinworks vault.",
    tone: "success",
    time: "06:30",
  },
  {
    id: "report",
    title: "Shift report ready",
    body: "Night shift closed with two open tickets.",
    tone: "info",
    time: "07:02",
  },
  {
    id: "filter",
    title: "Filter swap due",
    body: "The Line 1 intake filter has run 400 hours.",
    tone: "warn",
    time: "09:15",
  },
  {
    id: "pressure",
    title: "Pressure high on Line 3",
    body: "8.4 bar against a 7.5 limit. Check valve V-12.",
    tone: "danger",
    time: "09:42",
  },
];

const MORE: EdgeTabNotice[] = [
  {
    id: "hopper",
    title: "Hopper 2 is nearly empty",
    body: "Refill before 11:00 or Line 2 idles.",
    tone: "warn",
    time: "10:05",
  },
  {
    id: "sensor",
    title: "Sensor T-4 calibrated",
    body: "Drift is back inside 0.2 degrees.",
    tone: "success",
    time: "10:18",
  },
  {
    id: "door",
    title: "Cabinet door open on Line 2",
    body: "Close it before the line restarts.",
    tone: "danger",
    time: "10:31",
  },
];

const READINGS = [
  { name: "Line 1 · intake", value: "6.1 bar" },
  { name: "Line 1 · outlet", value: "5.8 bar" },
  { name: "Line 2 · intake", value: "6.4 bar" },
  { name: "Line 2 · outlet", value: "6.0 bar" },
  { name: "Line 3 · intake", value: "8.4 bar" },
  { name: "Line 3 · outlet", value: "7.9 bar" },
  { name: "Boiler · return", value: "71 °C" },
];

const BARS = [42, 48, 45, 52, 58, 55, 61, 66, 72, 79, 84, 81];

/**
 * Gaugeworks' line monitor, with its notices waiting at the edge of the
 * screen. Snoozes are short here so one visibly runs out.
 */
export function EdgeTabDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<EdgeTabNotice[]>(FIRST);
  const [open, setOpen] = React.useState<string | null>(null);
  const [snoozed, setSnoozed] = React.useState<string | null>(null);
  const sent = React.useRef(0);

  const send = React.useCallback(() => {
    const n = sent.current;
    sent.current = n + 1;
    const next = MORE[n % MORE.length] as EdgeTabNotice;
    setList((l) => [...l, { ...next, id: `${next.id}-${n}` }]);
  }, []);

  // A board with one tab left gets another after a moment.
  React.useEffect(() => {
    if (list.length > 1) return;
    const t = window.setTimeout(send, 1600);
    return () => window.clearTimeout(t);
  }, [list.length, send]);

  const titleOf = (id: string | null) =>
    id ? list.find((n) => n.id === id)?.title : undefined;
  const openTitle = titleOf(open);
  const snoozedTitle = titleOf(snoozed);

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <EdgeTab
        notices={list}
        onDismiss={(id) => {
          setList((l) => l.filter((n) => n.id !== id));
          setSnoozed((s) => (s === id ? null : s));
        }}
        onSnooze={setSnoozed}
        onOpenChange={setOpen}
        snoozeFor={20}
        sound={sound}
        className="rounded-3"
        {...values}
      >
        <div className="flex flex-col gap-4 rounded-3 border border-hairline bg-card px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">
              Gaugeworks · Line monitor
            </p>
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 font-mono text-[10px] text-ink-2">
              Live
            </span>
          </div>
          <div
            aria-hidden
            className="flex h-24 items-end gap-1.5 rounded-2 bg-surface-2 px-3 pt-3"
          >
            {BARS.map((b, i) => (
              <span
                key={i}
                className="flex-1 rounded-t-1 bg-cobalt-bright/60"
                style={{ height: `${b}%` }}
              />
            ))}
          </div>
          <ul role="list" className="flex flex-col divide-y divide-hairline">
            {READINGS.map((r) => (
              <li
                key={r.name}
                className="flex h-9 items-center justify-between gap-3 text-xs"
              >
                <span className="truncate text-ink-2">{r.name}</span>
                <span className="shrink-0 font-mono text-foreground tabular-nums">
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </EdgeTab>

      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{list.length} waiting</span>
            {openTitle
              ? ` · ${openTitle} open`
              : snoozedTitle
                ? ` · snoozed · ${snoozedTitle}`
                : " · pull a tab"}
          </p>
          <button
            type="button"
            onClick={send}
            className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Send one
          </button>
        </div>
      ) : null}
    </div>
  );
}
