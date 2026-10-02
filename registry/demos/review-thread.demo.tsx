"use client";

import * as React from "react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultReviewPeople,
  defaultReviewThreads,
  ReviewThread,
  type ReviewThreadData,
} from "@/registry/ui/review-thread";

export const tweaks = defineTweaks({
  leaders: {
    kind: "choice",
    label: "Leaders",
    default: "curve",
    options: ["curve", "elbow", "off"],
    names: { curve: "Curve", elbow: "Elbow", off: "Off" },
  },
  resolve: {
    kind: "choice",
    label: "Resolve",
    default: "fold",
    options: ["fold", "tuck", "off"],
    names: { fold: "Fold in place", tuck: "Tuck away", off: "Off" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
});

const quoteOf = (threads: ReviewThreadData[], id: string) =>
  threads.find((t) => t.id === id)?.anchor.quote ?? "";

/**
 * Waylight Pay's checkout copy, third draft, in review: five people, four
 * discussions pinned to the passages they are about, one already resolved.
 */
export function ReviewThreadDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [threads, setThreads] =
    React.useState<ReviewThreadData[]>(defaultReviewThreads);
  const [active, setActive] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const surface = (
    <ReviewThread
      threads={threads}
      onThreadsChange={setThreads}
      active={active}
      onActiveChange={(id) => {
        setActive(id);
        if (id) {
          const t = threads.find((x) => x.id === id);
          const n = t?.comments.length ?? 0;
          setNote(
            `open · “${t?.anchor.quote ?? ""}” · ${n} ${n === 1 ? "comment" : "comments"}`,
          );
        } else {
          setNote(null);
        }
      }}
      onReply={(id) => setNote(`replied on “${quoteOf(threads, id)}”`)}
      onResolve={(id, resolved) =>
        setNote(
          `${resolved ? "resolved" : "reopened"} “${quoteOf(threads, id)}”`,
        )
      }
      onMention={(personId) =>
        setNote(
          `mentioned ${defaultReviewPeople.find((p) => p.id === personId)?.name ?? "someone"}`,
        )
      }
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const open = threads.filter((t) => !t.resolved).length;
  const resolved = threads.length - open;

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4">
      {surface}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <p
          role="status"
          className="min-w-0 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          {note ? (
            <span className="text-signal">{note}</span>
          ) : (
            <>
              <span className="text-signal">{open} open</span> · {resolved}{" "}
              resolved · hover a passage
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setThreads(defaultReviewThreads);
            setActive(null);
            setNote(null);
          }}
          className="inline-flex h-8 shrink-0 items-center rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
