"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultNameClashConflicts,
  NameClash,
  type NameClashAction,
  type NameClashResult,
} from "@/registry/ui/name-clash";

export const tweaks = defineTweaks({
  cardLayout: {
    kind: "choice",
    label: "Cards",
    default: "pair",
    options: ["pair", "stacked", "tilted"],
    names: { pair: "Pair", stacked: "Stacked", tilted: "Tilted" },
  },
  thumbSize: {
    kind: "range",
    label: "Thumbnail",
    default: 80,
    min: 48,
    max: 112,
    step: 16,
    unit: "px",
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

const WORDS: Record<NameClashAction, string> = {
  replace: "replace",
  keep: "keep both",
  skip: "skip",
};

/**
 * Ines uploading fourteen brand exports to Coldbrook's shared folder; six of
 * them already exist. In the gallery the queue deals itself again a moment
 * after the last clash is settled.
 */
export function NameClashDemo({
  chrome = true,
  // The panel is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [action, setAction] = React.useState<NameClashAction>("keep");
  const [settled, setSettled] = React.useState<NameClashResult[]>([]);
  const [last, setLast] = React.useState<string | null>(null);
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const reset = () => {
    if (timer.current) window.clearTimeout(timer.current);
    setAction("keep");
    setSettled([]);
    setLast(null);
    setRound((r) => r + 1);
  };

  const surface = (
    <NameClash
      key={round}
      conflicts={defaultNameClashConflicts}
      action={action}
      onActionChange={(a) => {
        setAction(a);
        setLast(null);
      }}
      onResolve={(conflict, a, name) => {
        setSettled((s) => [...s, { id: conflict.id, action: a, name }]);
        setLast(
          a === "keep"
            ? `kept both · ${name}`
            : a === "replace"
              ? `replaced ${conflict.incoming.name}`
              : `skipped ${conflict.incoming.name}`,
        );
      }}
      onDone={() => {
        if (!chrome) timer.current = window.setTimeout(reset, 2600);
      }}
      onCancel={() => {
        setLast("upload cancelled");
        if (!chrome) timer.current = window.setTimeout(reset, 2600);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const total = defaultNameClashConflicts.length;
  const left = total - settled.length;
  const next = defaultNameClashConflicts.find(
    (c) => !settled.some((s) => s.id === c.id),
  );
  const tally = (a: NameClashAction) =>
    settled.filter((s) => s.action === a).length;
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reset} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {left === 0 ? (
          <>
            <span className="text-signal">all settled</span> ·{" "}
            {tally("replace")} replaced, {tally("keep")} kept, {tally("skip")}{" "}
            skipped
          </>
        ) : last ? (
          <>
            <span className="text-signal">{last}</span> · {left} of {total} left
          </>
        ) : (
          <>
            <span className="text-signal">
              {left} of {total} left
            </span>{" "}
            · {WORDS[action]} · {next?.incoming.name}
          </>
        )}
      </p>
    </div>
  );
}
