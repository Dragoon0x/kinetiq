"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultDestinationFolders,
  DestinationPicker,
  type DestinationFolder,
} from "@/registry/ui/destination-picker";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chip",
    default: "pill",
    options: ["pill", "tag", "icon"],
    names: { pill: "Pill", tag: "Tag", icon: "Icon" },
  },
  arcHeight: {
    kind: "range",
    label: "Arc",
    default: 20,
    min: 0,
    max: 48,
    step: 4,
    unit: "px",
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
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const LAZY: Record<string, DestinationFolder[]> = {
  "rs-commissioning": [
    { id: "rs-tests", name: "Test sheets", count: 12 },
    { id: "rs-witness", name: "Witness records", count: 5 },
  ],
  "weir-sonar": [
    { id: "sonar-north", name: "North bank", count: 18 },
    { id: "sonar-south", name: "South bank", count: 21 },
  ],
};

const nameOf = (id: string, list: DestinationFolder[]): string | null => {
  for (const f of list) {
    if (f.id === id) return f.name;
    const inner = nameOf(id, [...(f.children ?? []), ...(LAZY[f.id] ?? [])]);
    if (inner) return inner;
  }
  return null;
};

const wait = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * A Fernworks engineer filing a pump curve out of the Inbox. Commissioning
 * and the sonar passes load when opened; the curve library is read only and
 * the 2025 archive is closed, so the chip has two places to be refused.
 */
export function DestinationPickerDemo({
  chrome = true,
  // The dialog is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [over, setOver] = React.useState<string | null>(null);
  const [moved, setMoved] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(true);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const reset = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setOver(null);
    setMoved(null);
    setOpen(true);
    setRound((r) => r + 1);
  };

  const surface = (
    <DestinationPicker
      key={round}
      onValueChange={(id) => {
        setOver(id);
        setMoved(null);
      }}
      onOpenChange={setOpen}
      onLoadChildren={async (folder) => {
        await wait(900);
        return LAZY[folder.id] ?? [];
      }}
      onCreateFolder={(parent, name) => ({
        id: `${parent.id}/${name.toLowerCase().replace(/\s+/g, "-")}`,
        name,
        count: 0,
      })}
      onMove={async (_folder, path) => {
        await wait(400);
        setMoved(path.join(" / "));
        if (!chrome) timer.current = window.setTimeout(reset, 2600);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {moved ? (
          <>
            <span className="text-signal">moved</span> · {moved}
          </>
        ) : !open ? (
          <>
            <span className="text-signal">closed</span> · move… to reopen
          </>
        ) : over ? (
          <>
            <span className="text-signal">
              over {nameOf(over, defaultDestinationFolders) ?? over}
            </span>{" "}
            · enter to move
          </>
        ) : (
          <>
            <span className="text-signal">moving pump curve – rev c.pdf</span> ·
            arrow onto a folder
          </>
        )}
      </p>
    </div>
  );
}
