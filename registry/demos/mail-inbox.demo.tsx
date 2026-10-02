"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultMailThreads,
  MailInbox,
  type MailThread,
} from "@/registry/ui/mail-inbox";

export const tweaks = defineTweaks({
  swipe: {
    kind: "choice",
    label: "Swipe",
    default: "full",
    options: ["full", "reveal", "off"],
    names: { full: "Full", reveal: "Reveal", off: "Off" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  preview: {
    kind: "range",
    label: "Preview lines",
    default: 1,
    min: 0,
    max: 2,
    step: 1,
  },
});

const unreadIn = (threads: MailThread[]) =>
  threads.filter((t) => t.folder === "inbox" && t.unread).length;

const subjectOf = (threads: MailThread[], id: string | undefined) =>
  threads.find((t) => t.id === id)?.subject.toLowerCase() ?? "";

/**
 * Fieldline's operations inbox for Noor Halvorsen, read on a Friday
 * morning: freight, payouts, a statement, a design review to move.
 */
export function MailInboxDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [threads, setThreads] = React.useState(defaultMailThreads);
  const [note, setNote] = React.useState<string | null>(null);

  const reset = () => {
    setRun((r) => r + 1);
    setThreads(defaultMailThreads);
    setNote(null);
  };

  const inbox = (
    <MailInbox
      key={run}
      onThreadsChange={setThreads}
      onArchive={(ids) =>
        setNote(
          ids.length === 1
            ? `archived “${subjectOf(threads, ids[0])}” · z undoes`
            : `archived ${ids.length} threads · z undoes`,
        )
      }
      onSnooze={(ids) =>
        setNote(
          ids.length === 1
            ? `snoozed “${subjectOf(threads, ids[0])}” until tomorrow 08:00`
            : `snoozed ${ids.length} threads until tomorrow 08:00`,
        )
      }
      onRestore={(ids) =>
        setNote(
          `moved ${ids.length === 1 ? "1 thread" : `${ids.length} threads`} back to the inbox`,
        )
      }
      onUndo={() => setNote("undone · the threads are back")}
      onSelectedChange={(ids) =>
        setNote(ids.length ? `${ids.length} selected` : null)
      }
      onOpenChange={(id) =>
        setNote(id ? `opened “${subjectOf(threads, id)}”` : null)
      }
      onReply={(id) => setNote(`replying to “${subjectOf(threads, id)}”`)}
      onCompose={() => setNote("compose · a new message")}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{inbox}</div>;

  const unread = unreadIn(threads);
  const how =
    values.swipe === "off"
      ? "swipe off · e archives, b snoozes"
      : values.swipe === "reveal"
        ? "a short swipe rests open on its action"
        : "swipe right to archive, left to snooze";

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {inbox}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {unread ? `${unread} unread` : "inbox zero"}
              </span>{" "}
              · {how}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
