"use client";

import * as React from "react";

import { BurgerSheet } from "@/registry/ui/burger-sheet";

const LINKS = [
  { label: "Runs", href: "#waylight-runs" },
  { label: "Depots", href: "#waylight-depots" },
  { label: "Carriers", href: "#waylight-carriers" },
  { label: "Sweep sheets", href: "#waylight-sweeps" },
  { label: "Settings", href: "#waylight-settings" },
];

const ROWS = [
  ["WL-4192", "Basinworks depot 3", "In transit"],
  ["WL-4188", "Coldbrook yard", "Held"],
  ["WL-4171", "Fernworks bench", "Delivered"],
  ["WL-4166", "Gaugeworks line 2", "Delivered"],
  ["WL-4150", "Fieldline north dock", "Delivered"],
  ["WL-4149", "Basinworks depot 1", "Delivered"],
] as const;

export function BurgerSheetDemo() {
  const frame = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative flex h-[340px] flex-col overflow-hidden rounded-3 border border-border bg-card">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-2">
          <span className="pl-1 text-sm font-semibold">Waylight</span>
          <span className="ml-auto font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            6 runs
          </span>
          <BurgerSheet
            items={LINKS}
            open={open}
            onOpenChange={setOpen}
            container={frame}
            title="Waylight"
            label="Menu"
          />
        </header>

        <div ref={frame} className="min-h-0 flex-1 overflow-y-auto">
          <ul className="p-3">
            {ROWS.map(([id, place, state]) => (
              <li
                key={id}
                className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-0"
              >
                <span className="font-mono text-xs tabular-nums">{id}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {place}
                </span>
                <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {state}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Menu{" "}
        <span className="text-[var(--signal,var(--primary))]">
          {open ? "open" : "closed"}
        </span>
      </p>
    </div>
  );
}
