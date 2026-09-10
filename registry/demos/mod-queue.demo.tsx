"use client";

import * as React from "react";

import { ModQueue, type ModVerdict } from "@/registry/ui/mod-queue";

const TOTAL = 4;

const PAST: Record<ModVerdict, string> = {
  keep: "kept",
  hide: "hid",
  timeout: "timed out",
};

const chip =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ModQueueDemo() {
  const [index, setIndex] = React.useState(0);
  const [last, setLast] = React.useState<{
    verdict: ModVerdict;
    who: string;
  } | null>(null);

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ModQueue
        label="Reported in Coldbrook"
        index={index}
        onIndexChange={setIndex}
        onAct={(verdict, item) =>
          setLast({ verdict, who: item.author.split(" ")[0] ?? item.author })
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setIndex(0);
            setLast(null);
          }}
          disabled={index === 0}
          className={chip}
        >
          Refill queue
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Coldbrook · {TOTAL - index} waiting ·{" "}
        <span className="text-signal">
          {last
            ? `${PAST[last.verdict]} ${last.who}'s message`
            : "nothing acted on"}
        </span>
      </p>
    </div>
  );
}
