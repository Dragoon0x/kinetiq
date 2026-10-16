"use client";

import * as React from "react";

import { useInView } from "motion/react";
import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AssumptionPins,
  composeFernworksAnswer,
  defaultAssumptions,
  fernworksConflicts,
  type AssumptionValues,
} from "@/registry/ui/assumption-pins";

export const tweaks = defineTweaks({
  pinStyle: {
    kind: "choice",
    label: "Pins",
    default: "tack",
    options: ["tack", "tag", "rule"],
    names: { tack: "Tack", tag: "Tag", rule: "Rule" },
  },
  highlight: {
    kind: "choice",
    label: "Highlight",
    default: "wash",
    options: ["wash", "line", "focus"],
    names: { wash: "Wash", line: "Line", focus: "Focus" },
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

const START: AssumptionValues = Object.fromEntries(
  defaultAssumptions.map((a) => [a.id, a.value]),
);

const labelOf = (id: string) =>
  (defaultAssumptions.find((a) => a.id === id)?.label ?? id).toLowerCase();

/** How many sentences two sets of values write differently. */
const rewritten = (from: AssumptionValues, to: AssumptionValues) => {
  const before = composeFernworksAnswer(from).flatMap((p) => p.sentences);
  const after = composeFernworksAnswer(to).flatMap((p) => p.sentences);
  return {
    changed: after.filter((s, i) => before[i]?.text !== s.text).length,
    total: after.length,
  };
};

/**
 * Fernworks finance asks what the new platform team will cost this year.
 * The gallery card changes the team size once it is seen: four sentences
 * rewrite in place, four hold still, and the cap conflict lights.
 */
export function AssumptionPinsDemo({
  chrome = true,
  // The surface is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [state, setState] = React.useState<AssumptionValues>(START);
  const [note, setNote] = React.useState<string | null>(null);
  const [round, setRound] = React.useState(0);
  const frame = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(frame, { amount: 0.35 });

  const change = (next: AssumptionValues, id: string) => {
    const { changed, total } = rewritten(state, next);
    setState(next);
    const clash = fernworksConflicts(next)[0];
    setNote(
      clash
        ? `conflict · ${labelOf(clash.pins[0])} × ${labelOf(clash.pins[1])}`
        : `rewrote ${changed} of ${total} sentences · ${labelOf(id)}`,
    );
  };

  // The gallery card makes one edit once it has been seen.
  const played = React.useRef(false);
  const stateRef = React.useRef(state);
  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);
  React.useEffect(() => {
    if (chrome || !inView || played.current) return;
    const t = window.setTimeout(() => {
      played.current = true;
      setState({ ...stateRef.current, size: 5 });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [chrome, inView]);

  const surface = (
    <AssumptionPins
      key={round}
      values={state}
      onValuesChange={setState}
      onEditAssumption={(id, value) => change({ ...state, [id]: value }, id)}
      onRevert={(id) => setNote(`reverted · ${labelOf(id)}`)}
      onAcceptAnswer={(_, v) => {
        const total = composeFernworksAnswer(v)
          .flatMap((p) => p.sentences)
          .find((s) => s.id === "s5")
          ?.text.match(/€\d+k/)?.[0];
        setNote(`accepted · ${total ?? "answer saved"}`);
      }}
      {...values}
    />
  );

  if (!chrome)
    return (
      <div ref={frame} className="w-full">
        {surface}
      </div>
    );

  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => change({ ...state, size: 5 }, "size")}
          className={button}
        >
          Make it five
        </button>
        <button
          type="button"
          onClick={() => change({ ...state, start: "June" }, "start")}
          className={button}
        >
          Push to June
        </button>
        <button
          type="button"
          onClick={() => {
            setState(START);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {note ?? "5 assumptions · 8 sentences"}
        </span>
        {" · fernworks hiring budget"}
      </p>
    </div>
  );
}
