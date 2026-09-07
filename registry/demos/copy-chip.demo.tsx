"use client";

import * as React from "react";

import { CopyChip } from "@/registry/ui/copy-chip";

const ROWS = [
  {
    id: "key",
    caption: "Project key",
    value: "wl_live_7f3ca2b91d4e",
    variant: "chip" as const,
    label: "Copy",
  },
  {
    id: "cli",
    caption: "Install",
    value: "npx waylight init",
    variant: "icon" as const,
    label: "Copy command",
  },
];

export function CopyChipDemo() {
  const [last, setLast] = React.useState("");

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        {ROWS.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center gap-2 rounded-3 border border-hairline bg-surface-1 p-2.5"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {row.caption}
              </span>
              <span className="truncate font-mono text-xs" title={row.value}>
                {row.value}
              </span>
            </div>
            <CopyChip
              value={row.value}
              label={row.label}
              variant={row.variant}
              onCopy={setLast}
            />
          </div>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] break-all text-muted-foreground uppercase"
      >
        Waylight ·{" "}
        {last ? (
          <>
            copied <span className="text-signal">{last}</span>
          </>
        ) : (
          "nothing copied yet"
        )}
      </p>
    </div>
  );
}
