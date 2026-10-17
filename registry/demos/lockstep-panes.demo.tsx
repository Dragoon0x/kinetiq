"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultLockstepAnchors,
  defaultLockstepDocuments,
  LockstepPanes,
  type LockstepPair,
} from "@/registry/ui/lockstep-panes";

export const tweaks = defineTweaks({
  bandOpacity: {
    kind: "range",
    label: "Bands",
    default: 0.35,
    min: 0.1,
    max: 0.8,
    step: 0.05,
  },
  gutter: {
    kind: "range",
    label: "Gutter",
    default: 48,
    min: 24,
    max: 96,
    step: 8,
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

const labelOf = (id: string) =>
  (defaultLockstepAnchors.find((a) => a.id === id)?.label ?? id).toLowerCase();

/**
 * Fieldline’s services agreement with Basinworks Logistics: the signed v2
 * beside the v3 draft that changes fees, service levels and liability, adds
 * subprocessors and drops exclusivity.
 */
export function LockstepPanesDemo({
  chrome = true,
  // The comparison is silent: the stage's sound switch has nothing to play.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [documents, setDocuments] = React.useState<LockstepPair>(
    defaultLockstepDocuments,
  );
  const [locked, setLocked] = React.useState(true);
  const [section, setSection] = React.useState("scope");
  const [event, setEvent] = React.useState<string | null>(null);
  const [closed, setClosed] = React.useState<string | null>(null);
  const together = locked && !closed && documents[0] && documents[1];

  const surface = (
    <LockstepPanes
      key={round}
      documents={documents}
      defaultLocked
      onLockChange={(next) => {
        setLocked(next);
        setEvent(null);
      }}
      onSectionChange={setSection}
      onSwap={(order) =>
        setEvent(
          `swapped · ${order[0]?.version ?? "empty"} left, ${order[1]?.version ?? "empty"} right`,
        )
      }
      onClosePane={(_side, doc) => {
        setClosed(doc.id);
        setEvent(`${doc.version} closed`);
      }}
      onReopenPane={() => {
        setClosed(null);
        setEvent(null);
      }}
      onPickDocument={() => {
        setDocuments(defaultLockstepDocuments);
        setEvent(null);
      }}
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
            setDocuments([null, defaultLockstepDocuments[1]]);
            setClosed(null);
            setEvent("v2 missing");
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          Without v2
        </button>
        <button
          type="button"
          onClick={() => {
            setDocuments(defaultLockstepDocuments);
            setLocked(true);
            setSection("scope");
            setClosed(null);
            setEvent(null);
            setRound((r) => r + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{together ? "locked" : "unlocked"}</span>
        {` · ${event ?? `reading ${labelOf(section)}`}`}
      </p>
    </div>
  );
}
