"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultMailClientThreads,
  MailClient,
} from "@/registry/ui/mail-client";
import type { MailThread } from "@/registry/ui/mail-inbox";

export const tweaks = defineTweaks({
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
  folders: {
    kind: "choice",
    label: "Folders",
    default: "pane",
    options: ["pane", "rail", "drawer"],
    names: { pane: "Pane", rail: "Rail", drawer: "Drawer" },
  },
});

const subjectOf = (threads: MailThread[], id: string | undefined) => {
  const s = threads.find((t) => t.id === id)?.subject.toLowerCase() ?? "";
  return s.length > 32 ? `${s.slice(0, 31)}…` : s;
};

/**
 * Noor Halvorsen's Fieldline mail on a Friday morning: freight from
 * Basinworks, a Waylight Pay payout, a Coldbrook Bank statement and a design
 * review to move.
 */
export function MailClientDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [run, setRun] = React.useState(0);
  const [threads, setThreads] = React.useState(defaultMailClientThreads);
  const [note, setNote] = React.useState<string | null>(null);

  const reset = () => {
    setRun((r) => r + 1);
    setThreads(defaultMailClientThreads);
    setNote(null);
  };

  const screen = (
    <MailClient
      key={run}
      onThreadsChange={setThreads}
      onOpenChange={(id) =>
        setNote(id ? `reading “${subjectOf(threads, id)}”` : null)
      }
      onArchive={(ids) =>
        setNote(
          ids.length === 1
            ? `archived “${subjectOf(threads, ids[0])}” · undo is on the toast`
            : `archived ${ids.length} threads`,
        )
      }
      onSnooze={(ids) =>
        setNote(
          `snoozed ${ids.length === 1 ? "1 thread" : `${ids.length} threads`} until tomorrow 08:00`,
        )
      }
      onDelete={(ids) =>
        setNote(
          `deleted ${ids.length === 1 ? "1 thread" : `${ids.length} threads`}`,
        )
      }
      onSend={(draft) =>
        setNote(
          draft.threadId ? `reply sent to ${draft.to}` : `sent to ${draft.to}`,
        )
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{screen}</div>;

  const unread = threads.filter((t) => t.folder === "inbox" && t.unread).length;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {screen}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">
                {unread ? `${unread} unread` : "inbox zero"}
              </span>{" "}
              · swipe a row to triage
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
