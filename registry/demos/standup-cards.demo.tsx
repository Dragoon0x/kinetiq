"use client";

import * as React from "react";

import { RotateCcw, Shuffle } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultStandupAgents,
  defaultStandupItems,
  StandupCards,
  type StandupResolution,
} from "@/registry/ui/standup-cards";

export const tweaks = defineTweaks({
  dealStyle: {
    kind: "choice",
    label: "Deal",
    default: "deck",
    options: ["deck", "drop", "slide"],
    names: { deck: "Deck", drop: "Drop", slide: "Slide" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
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

const BLOCKERS = defaultStandupItems.filter((i) => i.kind === "blocked").length;
const nameOf = (id: string) =>
  defaultStandupAgents.find((a) => a.id === id)?.name ?? id;

type Said =
  | { kind: "answer"; agent: string }
  | { kind: "reassign"; owner: string }
  | { kind: "open"; text: string };

const button = cn(
  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
  "hover:bg-surface-2 hover:text-foreground",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
);

/**
 * Gaugeworks support's Thursday standup, the morning after the login
 * outage: four agents, three of them stuck on something.
 */
export function StandupCardsDemo({
  chrome = true,
  // The table is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [resolved, setResolved] = React.useState<StandupResolution[]>([]);
  const [said, setSaid] = React.useState<Said | null>(null);

  const surface = (
    <StandupCards
      key={round}
      resolved={resolved}
      onResolvedChange={setResolved}
      onAnswerBlocker={(item) => setSaid({ kind: "answer", agent: item.agent })}
      onReassign={(_, owner) =>
        setSaid({ kind: "reassign", owner: owner.name })
      }
      onOpenItem={(item) => setSaid({ kind: "open", text: item.text })}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const left = BLOCKERS - resolved.length;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRound((r) => r + 1)}
          className={button}
        >
          <Shuffle aria-hidden className="size-3.5" />
          Deal again
        </button>
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setResolved([]);
            setSaid(null);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {said?.kind === "answer" ? (
          <>
            <span className="text-signal">answered {nameOf(said.agent)}</span> ·{" "}
            {left === 0 ? "nothing blocked" : `${left} blocked`}
          </>
        ) : said?.kind === "reassign" ? (
          <>
            <span className="text-signal">reassigned to {said.owner}</span> ·{" "}
            {left} blocked
          </>
        ) : said?.kind === "open" ? (
          <>
            <span className="text-signal">opened</span> ·{" "}
            {said.text.replace(/[.?]$/, "")}
          </>
        ) : (
          <>
            <span className="text-signal">
              {left === 0 ? "nothing blocked" : `${left} blocked`}
            </span>{" "}
            · {defaultStandupAgents.length} agents
          </>
        )}
      </p>
    </div>
  );
}
