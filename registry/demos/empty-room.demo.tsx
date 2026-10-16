"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultEmptyRoomNow,
  defaultEmptyRoomSuggestions,
  EmptyRoom,
  type EmptyRoomStatus,
} from "@/registry/ui/empty-room";

export const tweaks = defineTweaks({
  seatCount: {
    kind: "range",
    label: "Seats",
    default: 8,
    min: 4,
    max: 10,
    step: 1,
  },
  seatShape: {
    kind: "choice",
    label: "Seat",
    default: "round",
    options: ["round", "square", "chair"],
    names: { round: "Round", square: "Square", chair: "Chair" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "var(--accent-bright)",
    options: [
      "var(--accent-bright)",
      "var(--signal)",
      "var(--warn)",
      "oklch(from var(--accent-bright) l c 320)",
    ],
    names: {
      "var(--accent-bright)": "Cobalt",
      "var(--signal)": "Mint",
      "var(--warn)": "Amber",
      "oklch(from var(--accent-bright) l c 320)": "Plum",
    },
  },
});

const INVITE_MS = 650;
const nameOf = (id: string) =>
  defaultEmptyRoomSuggestions.find((p) => p.id === id)?.name ?? id;

/**
 * Basinworks has just made a space for the dock operations crew. Invites are
 * faked with a short wait; "Fail next invite" refuses the next one once, and
 * "Reload suggestions" shows the blank seats while the directory answers.
 */
export function EmptyRoomDemo({
  chrome = true,
  // The room is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [invited, setInvited] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<EmptyRoomStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [note, setNote] = React.useState<string | null>(null);
  const failRef = React.useRef(failNext);
  React.useEffect(() => {
    failRef.current = failNext;
  });
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const seats = values.seatCount ?? 8;

  const room = (
    <EmptyRoom
      key={round}
      now={defaultEmptyRoomNow}
      createdAt={defaultEmptyRoomNow - 4 * 60_000}
      status={status}
      invited={invited}
      onInvitedChange={setInvited}
      onInvite={(person) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          if (fail) setFailNext(false);
          timers.current.push(
            window.setTimeout(() => {
              if (fail) {
                setNote(
                  `invite failed · ${person.name.toLowerCase()} kept as a ghost`,
                );
                reject(new Error("refused"));
              } else {
                setNote(`invited ${person.name.toLowerCase()}`);
                resolve();
              }
            }, INVITE_MS),
          );
        })
      }
      onCopyLink={() => setNote("link copied")}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{room}</div>;

  const reload = () => {
    setStatus("loading");
    setNote(null);
    timers.current.push(window.setTimeout(() => setStatus("ready"), 1200));
  };
  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setInvited([]);
    setStatus("ready");
    setFailNext(false);
    setNote(null);
    setRound((r) => r + 1);
  };
  const taken = defaultEmptyRoomSuggestions
    .slice(0, seats)
    .filter((p) => invited.includes(p.id)).length;
  const last = invited[invited.length - 1];
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {room}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => setFailNext((v) => !v)}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next invite
        </button>
        <button type="button" onClick={reload} className={button}>
          Reload suggestions
        </button>
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">finding people</span>
        ) : note ? (
          <>
            <span className="text-signal">{note}</span> · {taken} of {seats}{" "}
            seats
          </>
        ) : (
          <>
            <span className="text-signal">
              {taken} of {seats} seats
            </span>{" "}
            ·{" "}
            {last ? `last in ${nameOf(last).toLowerCase()}` : "link not copied"}
          </>
        )}
      </p>
    </div>
  );
}
