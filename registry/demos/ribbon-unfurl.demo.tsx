"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { RibbonUnfurl, type RibbonNotice } from "@/registry/ui/ribbon-unfurl";

export const tweaks = defineTweaks({
  duration: {
    kind: "range",
    label: "Duration",
    default: 6,
    min: 3,
    max: 12,
    step: 1,
    unit: "s",
  },
  swing: {
    kind: "range",
    label: "Swing",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.05,
  },
  fabric: {
    kind: "choice",
    label: "Fabric",
    default: "satin",
    options: ["satin", "canvas", "paper"],
    names: { satin: "Satin", canvas: "Canvas", paper: "Paper" },
  },
});

const FEED: RibbonNotice[] = [
  {
    id: "crew-4",
    title: "Crew 4 checked in at Basin Road",
    body: "Shift started 06:40. Two vans on site.",
    tone: "success",
  },
  {
    id: "rain-b",
    title: "Rain moving in over Site B",
    body: "Cover the open trench before 15:00.",
    tone: "warn",
  },
  {
    id: "permit",
    title: "Permit 118 renewed",
    body: "Valid through the end of the quarter.",
    tone: "info",
  },
  {
    id: "generator",
    title: "Generator 2 is offline",
    body: "Crew 7 is on the way with a spare.",
    tone: "danger",
  },
  {
    id: "survey",
    title: "Survey for Lot 9 synced",
    body: "42 points uploaded from the rover.",
    tone: "success",
  },
];

const CREWS = [
  { crew: "Crew 2", site: "Coldbrook culvert", state: "On site" },
  { crew: "Crew 4", site: "Basin Road", state: "On site" },
  { crew: "Crew 7", site: "Depot", state: "Loading" },
  { crew: "Crew 9", site: "Lot 9 survey", state: "Travelling" },
];

/**
 * Fieldline's crew board, with a notice roller along its top edge. The feed
 * keeps coming, so the board is never bare.
 */
export function RibbonUnfurlDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [list, setList] = React.useState<RibbonNotice[]>(() =>
    FEED.slice(0, 3),
  );
  const [kept, setKept] = React.useState<string | null>(null);
  const [last, setLast] = React.useState<string | null>(null);
  const sent = React.useRef(3);

  const send = React.useCallback(() => {
    const n = sent.current;
    sent.current = n + 1;
    const next = FEED[n % FEED.length] as RibbonNotice;
    setList((l) => [...l, { ...next, id: `${next.id}-${n}` }]);
  }, []);

  // An empty roller gets the next notice after a moment.
  React.useEffect(() => {
    if (list.length > 0) return;
    const t = window.setTimeout(send, 1400);
    return () => window.clearTimeout(t);
  }, [list.length, send]);

  const front = list[0];
  const waiting = Math.max(0, list.length - 1);

  return (
    <div className="flex w-full max-w-2xl flex-col gap-3">
      <RibbonUnfurl
        notices={list}
        onDismiss={(id) => {
          setLast(list.find((n) => n.id === id)?.title ?? null);
          setKept((k) => (k === id ? null : k));
          setList((l) => l.filter((n) => n.id !== id));
        }}
        onPin={(id, pinned) => setKept(pinned ? id : null)}
        sound={sound}
        className="rounded-3"
        {...values}
      >
        <div className="flex flex-col gap-3 rounded-3 border border-hairline bg-card px-4 pt-7 pb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-foreground">
              Fieldline · Crew board
            </p>
            <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              Tue 14 Oct
            </p>
          </div>
          <ul role="list" className="flex flex-col divide-y divide-hairline">
            {CREWS.map((row) => (
              <li
                key={row.crew}
                className="flex h-9 items-center justify-between gap-3 text-xs"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 font-medium text-foreground">
                    {row.crew}
                  </span>
                  <span className="truncate text-ink-3">{row.site}</span>
                </span>
                <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">
                  {row.state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </RibbonUnfurl>

      {chrome ? (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p
            role="status"
            className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            {front ? (
              <>
                <span className="text-signal">
                  {kept === front.id ? "kept open" : "on the roller"}
                </span>{" "}
                · {front.title}
                {waiting > 0 ? ` · ${waiting} waiting` : ""}
              </>
            ) : (
              <>
                <span className="text-signal">rolled up</span>
                {last ? ` · ${last}` : ""}
              </>
            )}
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
