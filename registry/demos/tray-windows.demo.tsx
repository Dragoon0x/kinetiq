"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultTrayRecords, TrayWindows } from "@/registry/ui/tray-windows";

export const tweaks = defineTweaks({
  chipSize: {
    kind: "choice",
    label: "Chips",
    default: "md",
    options: ["sm", "md", "lg"],
    names: { sm: "Small", md: "Medium", lg: "Large" },
  },
  trayPosition: {
    kind: "choice",
    label: "Tray",
    default: "bottom",
    options: ["bottom", "floating", "side"],
    names: { bottom: "Bottom", floating: "Floating", side: "Side" },
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

const BUTTON = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
  "hover:bg-surface-2 hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
);

const titleOf = (id: string) =>
  defaultTrayRecords.find((r) => r.id === id)?.title.toLowerCase() ?? id;

/**
 * A Fernworks support shift: two reply drafts and three tickets, two of
 * them parked, and one draft with changes not yet saved.
 */
export function TrayWindowsDemo({
  chrome = true,
  // The desk is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [tray, setTray] = React.useState(["t-2210", "t-2219"]);
  const [unsaved, setUnsaved] = React.useState(["d-3195"]);
  const [closed, setClosed] = React.useState<string[]>([]);
  const [event, setEvent] = React.useState<string | null>(null);
  const open = defaultTrayRecords.filter(
    (r) => !tray.includes(r.id) && !closed.includes(r.id),
  ).length;

  const surface = (
    <TrayWindows
      key={round}
      tray={tray}
      onTrayChange={setTray}
      unsaved={unsaved}
      onUnsavedChange={setUnsaved}
      onMinimise={(id) => setEvent(`parked ${titleOf(id)}`)}
      onRestore={(id) => setEvent(`restored ${titleOf(id)}`)}
      onCloseItem={(id) => {
        setClosed((c) => [...c, id]);
        setEvent(`closed ${titleOf(id)}`);
      }}
      onSave={(id) => setEvent(`saved ${titleOf(id)}`)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTray(["t-2210", "t-2219"]);
            setUnsaved(["d-3195"]);
            setClosed([]);
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={BUTTON}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {`${open} open · ${tray.length} parked`}
        </span>
        {` · ${event ?? `${unsaved.length} unsaved`}`}
      </p>
    </div>
  );
}
