"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  AnchoredPalette,
  defaultAnchoredActions,
  defaultAnchoredDoc,
  type AnchoredAction,
  type AnchoredSelection,
} from "@/registry/ui/anchored-palette";

export const tweaks = defineTweaks({
  anchorGap: {
    kind: "range",
    label: "Gap",
    default: 8,
    min: 4,
    max: 24,
    step: 2,
    unit: "px",
  },
  quoteStyle: {
    kind: "choice",
    label: "Quote",
    default: "bar",
    options: ["bar", "marks", "chip"],
    names: { bar: "Bar", marks: "Marks", chip: "Chip" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const PHRASE = "retries every 30 seconds";
const RETRY = defaultAnchoredDoc.blocks.find((b) => b.id === "retry");
const RETRY_TEXT = RETRY && RETRY.type === "paragraph" ? RETRY.text : "";
const AT = Math.max(0, RETRY_TEXT.indexOf(PHRASE));
const START: AnchoredSelection = {
  kind: "text",
  block: "retry",
  start: AT,
  end: AT + PHRASE.length,
};

const describe = (selection: AnchoredSelection | null) => {
  if (!selection) return "nothing selected";
  if (selection.kind === "items") {
    return `${selection.ids.length} ${selection.ids.length === 1 ? "task" : "tasks"}`;
  }
  const block = defaultAnchoredDoc.blocks.find((b) => b.id === selection.block);
  const text =
    block && block.type !== "tasks"
      ? block.text.slice(selection.start, selection.end)
      : "";
  const n = text.trim().split(/\s+/).filter(Boolean).length;
  return `text · ${n} ${n === 1 ? "word" : "words"}`;
};

/**
 * A Waylight spec with a phrase already selected. When it first comes into
 * view the palette grows out of the selection by itself (without taking
 * focus). Translating fails the first time — the network is down — and works
 * on the retry.
 */
export function AnchoredPaletteDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  // The palette is silent: the stage's sound switch has nothing to play here.
  void sound;
  const [run, setRun] = React.useState(0);
  const [selection, setSelection] = React.useState<AnchoredSelection | null>(
    START,
  );
  const [open, setOpen] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);
  const [inView, setInView] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const attempts = React.useRef(0);
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

  // Grown once on arrival, and never after a visitor has touched it.
  React.useEffect(() => {
    if (!inView || touched || shown) return;
    const id = window.setTimeout(() => {
      setOpen(true);
      setShown(true);
    }, 800);
    return () => window.clearTimeout(id);
  }, [inView, touched, shown]);

  const onAction = (action: AnchoredAction) =>
    new Promise<void>((resolve, reject) => {
      const failNow = action.id === "translate" && attempts.current === 0;
      if (action.id === "translate") attempts.current += 1;
      timers.current.push(
        window.setTimeout(() => {
          if (failNow) {
            setLast(`${action.label.toLowerCase()} failed`);
            reject(new Error("offline"));
          } else {
            setLast(`ran ${action.label.toLowerCase().replace(/…$/, "")}`);
            resolve();
          }
        }, 500),
      );
    });

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    attempts.current = 0;
    setSelection(START);
    setOpen(false);
    setLast(null);
    setRun((n) => n + 1);
  };

  const kind = selection ? selection.kind : "none";
  const fits = defaultAnchoredActions[kind].length;

  return (
    <div
      ref={wrapRef}
      onPointerDownCapture={() => setTouched(true)}
      onKeyDownCapture={() => setTouched(true)}
      className="flex w-full max-w-[52rem] flex-col gap-4"
    >
      <AnchoredPalette
        key={run}
        selection={selection}
        onSelectionChange={setSelection}
        open={open}
        onOpenChange={setOpen}
        onAction={onAction}
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
            <span className="text-signal">{last ?? describe(selection)}</span>
            {` · ${open ? `${fits} actions open` : "palette closed"}`}
          </p>
        </>
      ) : null}
    </div>
  );
}
