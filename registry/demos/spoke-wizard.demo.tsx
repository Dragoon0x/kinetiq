"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultSpokeTasks,
  SpokeWizard,
  type SpokeAnswers,
} from "@/registry/ui/spoke-wizard";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Ring",
    default: "gapped",
    options: ["gapped", "solid", "ticks"],
    names: { gapped: "Gapped", solid: "Solid", ticks: "Ticks" },
  },
  spokeCount: {
    kind: "range",
    label: "Spokes",
    default: 5,
    min: 3,
    max: 6,
    step: 1,
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--success)",
      "oklch(from var(--accent-bright) l c 320)",
      "oklch(from var(--accent-bright) l c 200)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--success)": "Moss",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
      "oklch(from var(--accent-bright) l c 200)": "Teal",
    },
  },
});

const DONE = ["profile", "team"];
const ANSWERS: SpokeAnswers = {
  profile: { name: "Fernworks", zone: "Europe/Lisbon" },
  team: { invites: "ana@fernworks.example", role: "Member" },
};

/**
 * Setting up the Fernworks workspace: Profile and Team are done, three
 * spokes to go, in any order.
 */
export function SpokeWizardDemo({
  chrome = true,
  // The setup is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [done, setDone] = React.useState<string[]>(DONE);
  const [open, setOpen] = React.useState<{ id: string; q: number } | null>(
    null,
  );
  const [launched, setLaunched] = React.useState(false);

  const wizard = (
    <SpokeWizard
      key={round}
      defaultCompleted={DONE}
      defaultAnswers={ANSWERS}
      onCompletedChange={setDone}
      onOpenChange={(id, q) => setOpen(id ? { id, q } : null)}
      onLaunch={() => setLaunched(true)}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{wizard}</div>;

  const count = Math.round(values.spokeCount ?? 5);
  const onHub = defaultSpokeTasks.slice(0, count);
  const doneHere = onHub.filter((t) => done.includes(t.id)).length;
  const next = onHub.find((t) => !done.includes(t.id));
  const openTask = open
    ? defaultSpokeTasks.find((t) => t.id === open.id)
    : null;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {wizard}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setDone(DONE);
            setOpen(null);
            setLaunched(false);
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
        {openTask && open ? (
          <>
            <span className="text-signal">{openTask.title} open</span> ·
            question {open.q + 1} of {openTask.questions.length}
          </>
        ) : doneHere === onHub.length ? (
          <>
            <span className="text-signal">
              {launched ? "workspace opened" : "ready"}
            </span>{" "}
            · {doneHere} of {onHub.length}
          </>
        ) : (
          <>
            <span className="text-signal">
              {doneHere} of {onHub.length} done
            </span>
            {next ? ` · ${next.title} next` : ""}
          </>
        )}
      </p>
    </div>
  );
}
