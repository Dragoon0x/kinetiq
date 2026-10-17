"use client";

import * as React from "react";

import { Clock3, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultWidgetNow,
  WidgetThread,
  type WidgetChoices,
} from "@/registry/ui/widget-thread";

export const tweaks = defineTweaks({
  widgetChrome: {
    kind: "choice",
    label: "Widgets",
    default: "card",
    options: ["card", "tinted", "plain"],
    names: { card: "Card", tinted: "Tinted", plain: "Plain" },
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

/** Eight people already chosen; the room comparison is open. */
const START: WidgetChoices = { people: { value: "8", label: "8 people" } };
const WIDGETS = 4;

type Event =
  | { kind: "chose"; id: string; label: string; count: number }
  | { kind: "booked"; room: string; time: string }
  | { kind: "expired" }
  | { kind: "refreshed"; id: string }
  | { kind: "sent" };

/**
 * Booking a Coldbrook meeting room for the Gaugeworks review: the number of
 * people is in, the rooms are being compared.
 */
export function WidgetThreadDemo({
  chrome = true,
  // The booking is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [now, setNow] = React.useState(defaultWidgetNow);
  const [event, setEvent] = React.useState<Event | null>(null);

  const surface = (
    <WidgetThread
      key={round}
      defaultValue={START}
      now={now}
      onWidgetSubmit={(id, choice, all) =>
        setEvent(
          id === "confirm" && choice.value === "yes"
            ? {
                kind: "booked",
                room: all.room?.label ?? "",
                time: all.time?.label ?? "",
              }
            : {
                kind: "chose",
                id,
                label: choice.label,
                count: Math.min(WIDGETS, Object.keys(all).length),
              },
        )
      }
      onRetry={(id) => setEvent({ kind: "refreshed", id: id ?? "thread" })}
      onSend={() => setEvent({ kind: "sent" })}
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
    <div className="flex w-full max-w-xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setRound((r) => r + 1);
            setNow(defaultWidgetNow);
            setEvent(null);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <button
          type="button"
          onClick={() => {
            setNow((n) => n + 10 * 60_000);
            setEvent({ kind: "expired" });
          }}
          className={button}
        >
          <Clock3 aria-hidden className="size-3.5" />
          Wait 10 min
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {event?.kind === "chose" ? (
          <>
            <span className="text-signal">
              {event.id} · {event.label}
            </span>{" "}
            · {event.count} of {WIDGETS} chosen
          </>
        ) : event?.kind === "booked" ? (
          <>
            <span className="text-signal">booked</span> · {event.room} thursday{" "}
            {event.time}
          </>
        ) : event?.kind === "expired" ? (
          <>
            <span className="text-signal">ten minutes later</span> · open holds
            expire
          </>
        ) : event?.kind === "refreshed" ? (
          <>
            <span className="text-signal">refreshed {event.id}</span> · posted
            again
          </>
        ) : event?.kind === "sent" ? (
          <>
            <span className="text-signal">message sent</span> · from the
            composer
          </>
        ) : (
          <>
            <span className="text-signal">1 of {WIDGETS} chosen</span> ·
            comparing rooms
          </>
        )}
      </p>
    </div>
  );
}
