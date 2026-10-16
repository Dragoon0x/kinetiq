"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { defaultFiledStepsSteps, FiledSteps } from "@/registry/ui/filed-steps";

export const tweaks = defineTweaks({
  tabStyle: {
    kind: "choice",
    label: "Tabs",
    default: "folder",
    options: ["folder", "index", "pill"],
    names: { folder: "Folder", index: "Index", pill: "Pill" },
  },
  stackDepth: {
    kind: "range",
    label: "Stack",
    default: 2,
    min: 0,
    max: 3,
    step: 1,
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
  defaultFiledStepsSteps.find((s) => s.id === id)?.short ?? id;

type Event =
  | { kind: "start" }
  | { kind: "filed"; id: string; complete: boolean }
  | { kind: "reopened"; id: string }
  | { kind: "sent" };

/**
 * Ada Mensah booking a Fieldline drainage survey for Coldbrook Yard: her
 * contact is filed, the site went away without its postcode, and the survey
 * type is on top.
 */
export function FiledStepsDemo({
  chrome = true,
  // The wizard is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [event, setEvent] = React.useState<Event>({ kind: "start" });

  const surface = (
    <FiledSteps
      key={round}
      onStepComplete={(id, _values, complete) =>
        setEvent({ kind: "filed", id, complete })
      }
      onReopen={(id) => setEvent({ kind: "reopened", id })}
      onFinish={() => setEvent({ kind: "sent" })}
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
            setEvent({ kind: "start" });
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
        {event.kind === "start" ? (
          <>
            <span className="text-signal">2 filed</span> · site unfinished ·
            survey type on top
          </>
        ) : event.kind === "filed" ? (
          <>
            <span className="text-signal">
              {shortOf(event.id)}{" "}
              {event.complete ? "filed" : "filed unfinished"}
            </span>{" "}
            · still in reach
          </>
        ) : event.kind === "reopened" ? (
          <>
            <span className="text-signal">reopened {shortOf(event.id)}</span> ·
            the stack steps aside
          </>
        ) : (
          <>
            <span className="text-signal">request sent</span> ·{" "}
            {defaultFiledStepsSteps.length} steps
          </>
        )}
      </p>
    </div>
  );
}
