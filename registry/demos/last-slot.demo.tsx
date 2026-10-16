"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import { LastSlot, type LastSlotRole } from "@/registry/ui/last-slot";

export const tweaks = defineTweaks({
  slotStyle: {
    kind: "choice",
    label: "Slot",
    default: "dashed",
    options: ["dashed", "frosted", "grid"],
    names: { dashed: "Dashed", frosted: "Frosted", grid: "Grid" },
  },
  lockStyle: {
    kind: "choice",
    label: "Lock",
    default: "shackle",
    options: ["shackle", "bolt", "dial"],
    names: { shackle: "Shackle", bolt: "Bolt", dial: "Dial" },
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

const START: Note = { lead: "5 of 5 projects", rest: "starter plan" };

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/**
 * A Fieldline workspace on the Starter plan with all five of its projects in
 * use. The sixth cell shows what the next plan costs, for an admin or for a
 * member who has to ask.
 */
export function LastSlotDemo({
  chrome = true,
  // The grid is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [role, setRole] = React.useState<LastSlotRole>("admin");
  const [note, setNote] = React.useState<Note>(START);

  if (!chrome) {
    return (
      <div className="w-full">
        <LastSlot className="h-[548px]" {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <LastSlot
        key={round}
        viewerRole={role}
        onUpgrade={(offer) =>
          setNote({ lead: "upgrade", rest: `${offer.name} · $12 a seat` })
        }
        onAskAdmin={(offer) =>
          setNote({ lead: "asked mara", rest: `${offer.name} plan` })
        }
        onCompare={() =>
          setNote({
            lead: "comparing plans",
            rest: "starter · team · business",
          })
        }
        onDismiss={() =>
          setNote({ lead: "set aside", rest: "limit chip in the header" })
        }
        onDismissedChange={(gone) => {
          if (!gone) setNote({ lead: "shown again", rest: "team plan" });
        }}
        onOpenProject={(p) => setNote({ lead: "opened", rest: p.name })}
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="View as"
          className="inline-flex h-8 items-center gap-0.5 rounded-2 border border-hairline p-0.5"
        >
          {(["admin", "member"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => {
                setRole(r);
                setNote({
                  lead:
                    r === "admin" ? "viewing as admin" : "viewing as member",
                  rest: r === "admin" ? "can upgrade" : "asks mara",
                });
              }}
              className={cn(
                "inline-flex h-6.5 items-center rounded-[5px] px-2.5 text-xs transition-colors",
                role === r
                  ? "bg-surface-2 text-foreground"
                  : "text-ink-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {r === "admin" ? "Admin" : "Member"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setNote(START);
            setRound((n) => n + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
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
