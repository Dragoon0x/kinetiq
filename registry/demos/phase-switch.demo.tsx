"use client";

import * as React from "react";

import { PhaseSwitch } from "@/registry/ui/phase-switch";
import { cn } from "@/registry/lib/utils";

const ROWS = [
  { label: "EXPOSURE", value: "1/125 s" },
  { label: "APERTURE", value: "f/5.6" },
  { label: "SKY GLOW", value: "-42 dBm" },
] as const;

/**
 * The sample card carries its own local palette; PhaseSwitch flips that
 * state, so the clip reveal is demonstrated without touching the docs theme.
 * (View Transitions snapshot the whole page — here the visible change is the
 * card.) In an app, `onCheckedChange` flips the real theme class instead.
 */
export function PhaseSwitchDemo() {
  const [dark, setDark] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-3">
      <div
        className={cn(
          "w-full rounded-3 border shadow-sm",
          dark
            ? "border-zinc-800 bg-zinc-950 text-zinc-50"
            : "border-zinc-200 bg-white text-zinc-900",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between border-b px-4 py-2.5",
            dark ? "border-zinc-800" : "border-zinc-200",
          )}
        >
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold">Observation deck</h3>
            <span
              className={cn(
                "font-mono text-[10px] tracking-[0.14em] uppercase",
                dark ? "text-zinc-500" : "text-zinc-400",
              )}
            >
              {dark ? "Night watch" : "Day shift"}
            </span>
          </div>
          <PhaseSwitch
            checked={dark}
            onCheckedChange={setDark}
            label="Toggle deck theme"
            className={
              dark
                ? "border-zinc-800 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-50"
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
            }
          />
        </div>
        <div className="space-y-2 px-4 py-3 font-mono text-xs">
          {ROWS.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between"
            >
              <span className={dark ? "text-zinc-500" : "text-zinc-400"}>
                {row.label}
              </span>
              <span className="tabular-nums">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-muted-foreground text-center text-xs">
        Wired to this card only — your app flips its real theme class.
      </p>
    </div>
  );
}
