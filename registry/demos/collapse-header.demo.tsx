"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  CollapseHeader,
  defaultHeaderActions,
} from "@/registry/ui/collapse-header";

export const tweaks = defineTweaks({
  parallax: {
    kind: "range",
    label: "Parallax",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.1,
  },
  dock: {
    kind: "choice",
    label: "Dock",
    default: "start",
    options: ["start", "center"],
    names: { start: "Beside back", center: "Centred" },
  },
  threshold: {
    kind: "range",
    label: "Threshold",
    default: 0.6,
    min: 0.3,
    max: 1,
    step: 0.1,
  },
});

type Note = { plot: string; title: string; who: string; when: string };

const NOTES: Note[] = [
  {
    plot: "P3",
    title: "Core at 30 cm, loam over clay",
    who: "Ines Calder",
    when: "09:15",
  },
  {
    plot: "P4",
    title: "Standing water in the north corner",
    who: "Tomas Reyes",
    when: "09:20",
  },
  {
    plot: "P7",
    title: "Probe 2 reseated, cable chewed",
    who: "Bram Okafor",
    when: "10:05",
  },
  {
    plot: "P9",
    title: "Moisture 18%, up from 12%",
    who: "Ines Calder",
    when: "10:40",
  },
  {
    plot: "P11",
    title: "Fence line moved by the landowner",
    who: "Priya Anand",
    when: "11:10",
  },
  {
    plot: "P12",
    title: "Second core for the lab",
    who: "Tomas Reyes",
    when: "11:35",
  },
  {
    plot: "P13",
    title: "Gateway battery at 41%",
    who: "Bram Okafor",
    when: "12:20",
  },
  {
    plot: "P14",
    title: "First core cracked, resampled",
    who: "Ines Calder",
    when: "14:20",
  },
  {
    plot: "P15",
    title: "Photos of the drainage ditch",
    who: "Priya Anand",
    when: "14:55",
  },
  {
    plot: "P16",
    title: "No change since autumn",
    who: "Tomas Reyes",
    when: "15:30",
  },
  {
    plot: "P17",
    title: "Samples bagged and labelled",
    who: "Bram Okafor",
    when: "15:50",
  },
  {
    plot: "Lab",
    title: "Cool box handed to Coldbrook soils",
    who: "Ines Calder",
    when: "16:05",
  },
];

/**
 * A Fieldline survey collection: twelve field notes from the spring sampling
 * day, under a header whose title docks as you scroll.
 */
export function CollapseHeaderDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [docked, setDocked] = React.useState(false);
  const [pressed, setPressed] = React.useState<string | null>(null);
  const count = defaultHeaderActions.length;
  const label = (id: string) =>
    id === "back"
      ? "back"
      : (defaultHeaderActions.find((a) => a.id === id)?.label ?? id);

  return (
    <div className="flex w-full max-w-80 flex-col gap-3">
      <CollapseHeader
        title="Basin Road survey"
        eyebrow="Fieldline · Spring field day"
        subtitle="14 plots · 12 notes · Sat 14 Mar 2026"
        height={chrome ? 440 : 556}
        onDockChange={(next) => {
          setDocked(next);
          setPressed(null);
        }}
        onAction={setPressed}
        onBack={() => setPressed("back")}
        sound={sound}
        {...values}
      >
        <ul role="list" className="flex flex-col px-5 pb-6">
          {NOTES.map((n) => (
            <li
              key={n.plot}
              className="flex items-center gap-3 border-t border-hairline py-2.5"
            >
              <span className="w-9 shrink-0 font-mono text-[11px] text-ink-3">
                {n.plot}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-foreground">
                  {n.title}
                </span>
                <span className="block truncate text-[11px] text-ink-3">
                  {n.who}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
                {n.when}
              </span>
            </li>
          ))}
        </ul>
      </CollapseHeader>
      {chrome ? (
        <p
          role="status"
          className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {pressed ? (
            <>
              <span className="text-signal">{label(pressed)} pressed</span> ·{" "}
              {docked ? "docked" : "expanded"}
            </>
          ) : docked ? (
            <>
              <span className="text-signal">docked</span> · {count} in menu
            </>
          ) : (
            <>
              <span className="text-signal">expanded</span> · {count} actions
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}
