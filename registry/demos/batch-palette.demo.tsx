"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  BatchPalette,
  type BatchAction,
  type BatchItem,
  type BatchPhase,
  type BatchRunResult,
} from "@/registry/ui/batch-palette";

export const tweaks = defineTweaks({
  chipStyle: {
    kind: "choice",
    label: "Chips",
    default: "pill",
    options: ["pill", "tag", "stub"],
    names: { pill: "Pill", tag: "Tag", stub: "Stub" },
  },
  fanSpread: {
    kind: "range",
    label: "Fan",
    default: 6,
    min: 0,
    max: 16,
    step: 2,
    unit: "deg",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const START = ["gw-1042", "gw-1048", "gw-1047"];
/** A ticket a release has locked: moving it to Done fails, the rest go through. */
const LOCKED = "gw-1047";

/**
 * The Gaugeworks support queue with three tickets already picked. When it
 * first comes into view it steps over to the actions for a moment so the
 * chips fan out, then back. Moving the pick to Done fails for the ticket a
 * release has locked, so the partial failure can be seen.
 */
export function BatchPaletteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The palette is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [run, setRun] = React.useState(0);
  const [selection, setSelection] = React.useState<string[]>(START);
  const [phase, setPhase] = React.useState<BatchPhase>("items");
  const [last, setLast] = React.useState<string | null>(null);
  const [inView, setInView] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [toured, setToured] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(Boolean(entry?.isIntersecting)),
      { threshold: 0.4 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
      timers.current = [];
    },
    [],
  );

  // Once, on arrival, and never after a visitor has touched it.
  React.useEffect(() => {
    if (!inView || touched || toured) return;
    const out = window.setTimeout(() => setPhase("actions"), 900);
    const back = window.setTimeout(() => {
      setPhase("items");
      setToured(true);
    }, 3200);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(back);
    };
  }, [inView, touched, toured]);

  const runAction = (
    action: BatchAction,
    items: BatchItem[],
  ): Promise<BatchRunResult> =>
    new Promise((resolve) => {
      timers.current.push(
        window.setTimeout(() => {
          const failed =
            action.id === "done" && items.some((item) => item.id === LOCKED)
              ? [{ id: LOCKED, reason: "is locked by release 4.3" }]
              : [];
          setLast(
            failed.length
              ? `${action.label.toLowerCase()} · 1 failed`
              : `${action.label.toLowerCase()} · ${items.length} done`,
          );
          resolve({ failed });
        }, 700),
      );
    });

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setSelection(START);
    setPhase("items");
    setLast(null);
    setRun((n) => n + 1);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDownCapture={() => setTouched(true)}
      onKeyDownCapture={() => setTouched(true)}
      className="flex w-full max-w-[38rem] flex-col gap-4"
    >
      <BatchPalette
        key={run}
        selection={selection}
        onSelectionChange={setSelection}
        phase={phase}
        onPhaseChange={setPhase}
        onRunAction={runAction}
        onClearSelection={() => setLast("cleared")}
        {...values}
      />
      {chrome ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={reset}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
                "hover:bg-surface-2 hover:text-foreground",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Reset
            </button>
          </div>
          <p
            role="status"
            className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
          >
            <span className="text-signal">{`${selection.length} picked`}</span>
            {` · ${phase === "actions" ? "choosing an action" : "picking tickets"}`}
            {last ? ` · ${last}` : ""}
          </p>
        </>
      ) : null}
    </div>
  );
}
