"use client";

import * as React from "react";

import {
  ForwardSlip,
  type SlipMessage,
  type SlipThread,
} from "@/registry/ui/forward-slip";

const UPDATE =
  "Seal's on. Both vans out by 08:50, Basinworks first, then the Coldbrook depot.";

/** Two Waylight threads as id|author|at|text; Ines is you. */
const parse = (lines: string[]): SlipMessage[] =>
  lines.map((line) => {
    const [id = "", author = "", at = "", text = ""] = line.split("|");
    return { id, author, at, text, mine: author === "Ines" };
  });

const DISPATCH = parse([
  "d1|Rui|08:36|Second van is loaded, waiting on the seal.",
  `d2|Marta|08:41|${UPDATE}`,
  "d3|Ines|08:43|Thanks, passing it on.",
]);

const RUI = parse([
  "r1|Rui|08:30|Any word on the vans? Basinworks are asking.",
  "r2|Ines|08:32|Checking dispatch now.",
]);

/** Marta's update, as it lands in the Rui thread once forwarded. */
const FORWARDED: SlipMessage = {
  id: "r3",
  author: "Ines",
  at: "08:44",
  text: UPDATE,
  mine: true,
  forwardedFrom: {
    threadId: "dispatch",
    threadName: "Coldbrook dispatch",
    messageId: "d2",
    author: "Marta",
    at: "08:41",
  },
};

const button =
  "flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50";

export function ForwardSlipDemo() {
  const [view, setView] = React.useState<"rui" | "dispatch">("rui");
  const [forwarded, setForwarded] = React.useState(false);
  const [arriveAt, setArriveAt] = React.useState<string | undefined>();

  const inRui = view === "rui";
  const thread: SlipThread = inRui
    ? {
        id: "rui",
        name: "Rui",
        messages: forwarded ? [...RUI, FORWARDED] : RUI,
      }
    : { id: "dispatch", name: "Coldbrook dispatch", messages: DISPATCH };

  const back = () => {
    setView("rui");
    setArriveAt(undefined);
  };
  const reset = () => {
    back();
    setForwarded(false);
  };

  const actions: [string, () => void, boolean][] = [
    ["Forward Marta's update", () => setForwarded(true), forwarded || !inRui],
    ["Back to Rui", back, inRui],
    ["Reset", reset, !forwarded && inRui],
  ];

  const line = !inRui
    ? ["Dispatch ·", "landed on Marta 08:41"]
    : forwarded
      ? ["Rui ·", "forwarded from dispatch"]
      : ["Rui ·", `${RUI.length} messages`];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ForwardSlip
        thread={thread}
        arriveAt={arriveAt}
        onJump={({ messageId }) => {
          setView("dispatch");
          setArriveAt(messageId);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        {actions.map(([copy, run, disabled]) => (
          <button
            key={copy}
            type="button"
            onClick={run}
            disabled={disabled}
            className={button}
          >
            {copy}
          </button>
        ))}
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {line[0]}{" "}
        <span className="text-[var(--signal,var(--primary))]">{line[1]}</span>
      </p>
    </div>
  );
}
