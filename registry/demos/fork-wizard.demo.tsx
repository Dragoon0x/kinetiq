"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultForkWizardAnswers,
  defaultForkWizardGraph,
  ForkWizard,
} from "@/registry/ui/fork-wizard";

export const tweaks = defineTweaks({
  mapPosition: {
    kind: "choice",
    label: "Map",
    default: "corner",
    options: ["corner", "top", "side"],
    names: { corner: "Corner", top: "Top", side: "Side" },
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

const shortOf = (id: string) =>
  defaultForkWizardGraph.steps.find((s) => s.id === id)?.short ?? id;
const optionOf = (id: string, value: string) =>
  defaultForkWizardGraph.steps
    .find((s) => s.id === id)
    ?.options?.find((o) => o.value === value);

type Event =
  | { kind: "step"; id: string }
  | { kind: "chose"; id: string; value: string }
  | { kind: "back"; to: string }
  | { kind: "finished"; steps: number; power: string };

/**
 * Adding a wet-well level sensor at Gaugeworks pump house 3: it runs on
 * mains, and the connection is the next fork.
 */
export function ForkWizardDemo({
  chrome = true,
  // The wizard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<Event>({ kind: "step", id: "link" });

  const surface = (
    <ForkWizard
      key={round}
      defaultValue={defaultForkWizardAnswers}
      onStepChange={(id) => setEvent({ kind: "step", id })}
      onChoose={(id, value) => setEvent({ kind: "chose", id, value })}
      onBack={(_from, to) => setEvent({ kind: "back", to })}
      onFinish={(answers, path) =>
        setEvent({
          kind: "finished",
          steps: path.length,
          power: answers.power ?? "",
        })
      }
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
            setRound((r) => r + 1);
            setEvent({ kind: "step", id: "link" });
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
        {event.kind === "step" ? (
          <>
            <span className="text-signal">on {shortOf(event.id)}</span> · mains
            path
          </>
        ) : event.kind === "chose" ? (
          <>
            <span className="text-signal">
              {shortOf(event.id)}: {optionOf(event.id, event.value)?.label}
            </span>{" "}
            · leads to {shortOf(optionOf(event.id, event.value)?.next ?? "")}
          </>
        ) : event.kind === "back" ? (
          <>
            <span className="text-signal">back to {shortOf(event.to)}</span> ·
            answers kept
          </>
        ) : (
          <>
            <span className="text-signal">sensor added</span> · {event.power}{" "}
            path · {event.steps} steps
          </>
        )}
      </p>
    </div>
  );
}
