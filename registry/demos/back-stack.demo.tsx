"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BackStack,
  defaultBackStackHistory,
  defaultBackStackPages,
  type BackStackVisit,
} from "@/registry/ui/back-stack";

export const tweaks = defineTweaks({
  stackStyle: {
    kind: "choice",
    label: "Stack",
    default: "list",
    options: ["list", "cards", "rail"],
    names: { list: "List", cards: "Cards", rail: "Rail" },
  },
  labelMode: {
    kind: "choice",
    label: "Label",
    default: "hover",
    options: ["hover", "always", "tip"],
    names: { hover: "Hover", always: "Always", tip: "Tip" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const titleOf = (id: string | undefined) =>
  defaultBackStackPages.find((p) => p.id === id)?.title ?? "none";

/**
 * A Waylight help centre session four pages deep, with one page ahead. The
 * gallery card drops the history once it has been seen, then folds it away.
 */
export function BackStackDemo({
  chrome = true,
  // The header is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [history, setHistory] = React.useState<BackStackVisit[]>(
    defaultBackStackHistory,
  );
  const [index, setIndex] = React.useState(3);
  const [open, setOpen] = React.useState(false);
  const [note, setNote] = React.useState("");
  const frame = React.useRef<HTMLDivElement | null>(null);
  const once = React.useRef(false);

  React.useEffect(() => {
    const node = frame.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    let timers: number[] = [];
    const io = new IntersectionObserver(([entry]) => {
      for (const t of timers) window.clearTimeout(t);
      timers = [];
      if (!entry?.isIntersecting || once.current) return;
      timers = [
        window.setTimeout(() => setOpen(true), 1100),
        window.setTimeout(() => {
          once.current = true;
          setOpen(false);
        }, 3500),
      ];
    });
    io.observe(node);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      io.disconnect();
    };
  }, [chrome]);

  const header = (
    <BackStack
      history={history}
      index={index}
      onNavigate={(to) => {
        setIndex(to);
        setNote("");
      }}
      onHistoryChange={(list, to) => {
        setHistory(list);
        setIndex(to);
      }}
      onClearHistory={() => setNote("history cleared")}
      stackOpen={open}
      onStackOpenChange={setOpen}
      onSearch={() => setNote("search opens here")}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={frame} className="w-full max-w-3xl">
        {header}
      </div>
    );
  }

  const current = history[index];
  const previous = index > 0 ? history[index - 1] : undefined;

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {header}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setHistory(defaultBackStackHistory);
            setIndex(3);
            setOpen(false);
            setNote("");
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
        <span className="text-xs text-ink-3">
          Hold Back for the history · Alt ← → move · Alt ↓ opens it
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{`${index + 1} of ${history.length}`}</span>
        {` · ${titleOf(current?.page)} · back: ${titleOf(previous?.page)}${note ? ` · ${note}` : ""}`}
      </p>
    </div>
  );
}
