"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { CommandCenter, type CommandItem } from "@/registry/ui/command-center";

export const tweaks = defineTweaks({
  nesting: {
    kind: "choice",
    label: "Nesting",
    default: "slide",
    options: ["slide", "stack", "flat"],
    names: { slide: "Slide", stack: "Stack", flat: "Flat" },
  },
  preview: { kind: "toggle", label: "Preview pane", default: true },
  fuzzy: { kind: "toggle", label: "Fuzzy match", default: true },
});

const strip = (label: string) => label.replace(/…$/, "").toLowerCase();

/** What each run did in Basinworks Billing, for the status line. */
const OUTCOME: Record<string, string> = {
  "status-draft": "inv-2041 back to draft",
  "status-sent": "inv-2041 marked sent",
  "status-paid": "inv-2041 marked paid",
  "status-overdue": "inv-2041 flagged overdue",
  "copy-link": "pay link copied",
  "download-pdf": "inv-2041.pdf saved",
  archive: "inv-2041 archived",
  "theme-light": "theme set to light",
  "theme-dark": "theme set to dark",
  "theme-system": "theme follows the system",
};

/**
 * Basinworks Billing's invoices screen with its command palette open over it:
 * a finance team's every action, one keystroke away.
 */
export function CommandCenterDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [open, setOpen] = React.useState(true);
  const [ran, setRan] = React.useState<string | null>(null);

  const center = (
    <CommandCenter
      defaultOpen
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRan(null);
      }}
      onRun={(command: CommandItem, path: CommandItem[]) => {
        const trail = [...path, command].map((c) => strip(c.label)).join(" › ");
        setRan(`${trail}|${OUTCOME[command.id] ?? "done"}`);
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{center}</div>;

  const [trail, outcome] = ran ? ran.split("|") : [null, null];

  return (
    <div className="flex w-full max-w-4xl flex-col gap-4">
      {center}
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {trail ? (
          <>
            <span className="text-signal">ran {trail}</span> · {outcome}
          </>
        ) : open ? (
          <>
            <span className="text-signal">palette open</span> · type to search ·
            esc clears, goes back, then closes
          </>
        ) : (
          <>
            <span className="text-signal">palette closed</span> · ⌘K or ctrl+K
            reopens it
          </>
        )}
      </p>
    </div>
  );
}
