"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  ReplanDiff,
  defaultReplanAfter,
  defaultReplanBefore,
} from "@/registry/ui/replan-diff";

export const tweaks = defineTweaks({
  diffStyle: {
    kind: "choice",
    label: "Diff",
    default: "tint",
    options: ["tint", "gutter", "ledger"],
    names: { tint: "Tint", gutter: "Gutter", ledger: "Ledger" },
  },
  reasonPlacement: {
    kind: "choice",
    label: "Reasons",
    default: "below",
    options: ["below", "side", "toggle"],
    names: { below: "Below", side: "Side", toggle: "On open" },
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

const titleOf = (id: string) =>
  [...defaultReplanBefore, ...defaultReplanAfter]
    .find((s) => s.id === id)
    ?.title.toLowerCase() ?? id;

/**
 * Gaugeworks, the vendor table cleanup: mid-merge, the agent realised merges
 * can't be undone and rewrote the rest of its plan.
 */
export function ReplanDiffDemo({
  chrome = true,
  // The diff is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [reviewing, setReviewing] = React.useState(true);
  const [reverted, setReverted] = React.useState<string[]>([]);
  const [said, setSaid] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);

  const surface = (
    <ReplanDiff
      key={round}
      reviewing={reviewing}
      reverted={reverted}
      onRevertStep={(id, on) => {
        setReverted((list) =>
          on ? [...list, id] : list.filter((r) => r !== id),
        );
        setSaid(`${on ? "reverted" : "restored"} · ${titleOf(id)}`);
      }}
      onAskWhy={(id) => setSaid(`asked why · ${titleOf(id)}`)}
      onAcceptReplan={(plan) => {
        setReviewing(false);
        setSaid(`accepted · ${plan.length} steps · revision 2 running`);
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
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <div className="w-full self-center">{surface}</div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setReviewing(true);
            setReverted([]);
            setSaid(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className={reviewing ? "text-warn" : "text-signal"}>
          {said ?? "paused for review · 3 changes"}
        </span>{" "}
        · gaugeworks cleanup
      </p>
    </div>
  );
}
