"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { ShortcutDrills } from "@/registry/ui/shortcut-drills";

export const tweaks = defineTweaks({
  keyboardLayout: {
    kind: "choice",
    label: "Layout",
    default: "command",
    options: ["command", "control", "split"],
    names: { command: "Command", control: "Control", split: "Split" },
  },
  keycapStyle: {
    kind: "choice",
    label: "Keycaps",
    default: "sculpted",
    options: ["sculpted", "flat", "outline"],
    names: { sculpted: "Sculpted", flat: "Flat", outline: "Outline" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "amber", "graphite"],
    names: {
      cobalt: "Cobalt",
      signal: "Signal",
      amber: "Amber",
      graphite: "Graphite",
    },
  },
});

type Note = { lead: string; rest: string };

const START: Note = { lead: "6 shortcuts", rest: "about a minute" };

/**
 * Fieldline's first-run checklist: six shortcuts a new member uses in the
 * first hour, practised on the keys before the real workspace opens.
 */
export function ShortcutDrillsDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [note, setNote] = React.useState<Note>(START);

  if (!chrome) {
    return (
      <div className="w-full">
        <ShortcutDrills className="h-[548px]" sound={sound} {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <ShortcutDrills
        key={round}
        sound={sound}
        onAttempt={({ drill, correct }) =>
          setNote(
            correct
              ? { lead: "correct", rest: drill.action.toLowerCase() }
              : { lead: "not quite", rest: "the right keys are showing" },
          )
        }
        onSkip={(drill) =>
          setNote({ lead: "skipped", rest: drill.action.toLowerCase() })
        }
        onComplete={(s) =>
          setNote({
            lead: "set done",
            rest: `${s.clean} first try · ${s.hinted} hinted · ${s.skipped} skipped`,
          })
        }
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setNote(START);
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
        <span className="text-signal">{note.lead}</span> · {note.rest}
      </p>
    </div>
  );
}
