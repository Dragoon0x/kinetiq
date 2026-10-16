"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultCritiquePins,
  defaultCritiqueThreads,
  PinCritique,
  type CritiquePin,
  type CritiqueThread,
} from "@/registry/ui/pin-critique";

export const tweaks = defineTweaks({
  pinStyle: {
    kind: "choice",
    label: "Pin",
    default: "drop",
    options: ["drop", "disc", "tab"],
    names: { drop: "Drop", disc: "Disc", tab: "Tab" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
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

/**
 * A design review of the Waylight booking screen, version 4: five pins from
 * four reviewers, one already resolved. Click the screen (or press P) to add
 * a sixth and say what you see.
 */
export function PinCritiqueDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [pins, setPins] = React.useState<CritiquePin[]>(defaultCritiquePins);
  const [threads, setThreads] = React.useState<CritiqueThread[]>(
    defaultCritiqueThreads,
  );
  const [selected, setSelected] = React.useState<string | null>(null);
  const [event, setEvent] = React.useState<string | null>(null);

  const numberOf = (pinId: string) => pins.findIndex((p) => p.id === pinId) + 1;

  const reset = () => {
    setPins(defaultCritiquePins);
    setThreads(defaultCritiqueThreads);
    setSelected(null);
    setEvent(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <PinCritique
      key={round}
      pins={pins}
      onPinsChange={setPins}
      threads={threads}
      onThreadsChange={setThreads}
      selected={selected}
      onSelectedChange={setSelected}
      onPin={() => setEvent(`pin ${pins.length + 1} posted`)}
      onReply={(threadId) => {
        const t = threads.find((x) => x.id === threadId);
        setEvent(`reply on pin ${t ? numberOf(t.pinId) : "?"}`);
      }}
      onResolve={(threadId, resolved) => {
        const t = threads.find((x) => x.id === threadId);
        setEvent(
          `pin ${t ? numberOf(t.pinId) : "?"} ${resolved ? "resolved" : "reopened"}`,
        );
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const open = threads.filter(
    (t) => !t.resolved && pins.some((p) => p.id === t.pinId),
  ).length;
  const sel = threads.find((t) => t.id === selected);
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
        <span className="text-signal">
          {event ??
            (sel ? `pin ${numberOf(sel.pinId)} open` : `${pins.length} pins`)}
        </span>{" "}
        · {open} open · {pins.length - open} resolved
      </p>
    </div>
  );
}
