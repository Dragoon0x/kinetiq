"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultTrialNow,
  defaultTrialPlans,
  defaultTrialUsage,
  TrialRecap,
} from "@/registry/ui/trial-recap";

export const tweaks = defineTweaks({
  ringStyle: {
    kind: "choice",
    label: "Ring",
    default: "solid",
    options: ["solid", "days", "ticks"],
    names: { solid: "Solid", days: "Days", ticks: "Ticks" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  tone: {
    kind: "choice",
    label: "Tone",
    default: "calm",
    options: ["calm", "urgent", "quiet"],
    names: { calm: "Calm", urgent: "Urgent", quiet: "Quiet" },
  },
});

type Note = { lead: string; rest: string };

const DAY = 86_400_000;
const SEATS = defaultTrialUsage.seats;
const START: Note = { lead: "7 days left", rest: `team fits ${SEATS} seats` };
const ENDED: Note = { lead: "trial ended", rest: "2 days ago · copy changes" };

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const monthly = (id: string) => {
  const plan = defaultTrialPlans.find((p) => p.id === id);
  return plan ? `$${plan.price * SEATS}/mo` : "";
};

/**
 * A Fieldline workspace on day seven of a fourteen-day trial: 14 seats, 23
 * projects, and three plans, one of which fits.
 */
export function TrialRecapDemo({
  chrome = true,
  // The screen is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [ended, setEnded] = React.useState(false);
  const [note, setNote] = React.useState<Note>(START);

  if (!chrome) {
    return (
      <div className="w-full">
        <TrialRecap className="h-[548px]" {...values} />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <TrialRecap
        key={round}
        endsAt={defaultTrialNow + (ended ? -2 : 7) * DAY}
        onValueChange={(id) =>
          setNote({ lead: `${id} chosen`, rest: monthly(id) })
        }
        onChoosePlan={(plan, total) =>
          setNote({ lead: `continue with ${plan.name}`, rest: `$${total}/mo` })
        }
        onExtend={() =>
          setNote({ lead: "extension asked", rest: "7 more days" })
        }
        onTalk={() => setNote({ lead: "talk to us", rest: "a call is booked" })}
        {...values}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={ended}
          onClick={() => {
            setEnded((v) => !v);
            setNote(ended ? START : ENDED);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs transition-colors hover:bg-surface-2 hover:text-foreground",
            ended ? "bg-surface-2 text-foreground" : "text-ink-2",
            FOCUS_RING,
          )}
        >
          Trial ended
        </button>
        <button
          type="button"
          onClick={() => {
            setNote(ended ? ENDED : START);
            setRound((n) => n + 1);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
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
