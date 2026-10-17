"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultInsertItems,
  SortedInsert,
  type InsertItem,
  type SortedInsertHandle,
} from "@/registry/ui/sorted-insert";

export const tweaks = defineTweaks({
  sortBy: {
    kind: "choice",
    label: "Sort",
    default: "name",
    options: ["name", "recent", "size"],
    names: { name: "A–Z", recent: "Newest", size: "Largest" },
  },
  highlight: {
    kind: "choice",
    label: "Highlight",
    default: "wash",
    options: ["wash", "bar", "ring"],
    names: { wash: "Wash", bar: "Bar", ring: "Ring" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const NAME = "Orchard Row";
const START_MS = 900;
const KEY_MS = 70;

/**
 * A Fernworks studio's clients and prospects. The gallery card opens the
 * Clients field once it is seen, types a new client's name and presses
 * Enter, so the row flies to its place in the list; the stage adds Replay.
 * Saving takes a moment, so the new row shows as adding while it lands.
 */
export function SortedInsertDemo({
  chrome = true,
  // The sidebar is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const api = React.useRef<SortedInsertHandle | null>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef<number[]>([]);
  const once = React.useRef(false);
  const [run, setRun] = React.useState(0);
  const [items, setItems] = React.useState<InsertItem[]>(defaultInsertItems);
  const [note, setNote] = React.useState<string | null>(null);

  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  React.useEffect(() => clear, []);

  /** Opens the field, types the name a key at a time, presses Enter. */
  const play = React.useCallback((delay: number) => {
    clear();
    const at = (ms: number, fn: () => void) =>
      timers.current.push(window.setTimeout(fn, ms));
    at(delay, () => api.current?.startCreate("clients"));
    for (let i = 1; i <= NAME.length; i++) {
      at(delay + 260 + i * KEY_MS, () =>
        api.current?.typeDraft(NAME.slice(0, i)),
      );
    }
    at(delay + 260 + NAME.length * KEY_MS + 380, () =>
      api.current?.submitDraft(),
    );
  }, []);

  React.useEffect(() => {
    const node = ref.current;
    if (chrome || !node || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !once.current) {
        once.current = true;
        play(START_MS);
      }
    });
    io.observe(node);
    return () => io.disconnect();
  }, [chrome, play]);

  // A new highlight style only shows on a landing, so changing it lands one.
  const style = values.highlight ?? "wash";
  const shownStyle = React.useRef(style);
  React.useEffect(() => {
    if (shownStyle.current === style) return;
    shownStyle.current = style;
    const t = window.setTimeout(() => {
      setItems(defaultInsertItems);
      setRun((r) => r + 1);
      play(400);
    }, 0);
    return () => window.clearTimeout(t);
  }, [style, play]);

  const frame = (
    <SortedInsert
      key={run}
      ref={api}
      onItemsChange={setItems}
      onCreate={(name) => {
        setNote(`added ${name}`);
        return new Promise((resolve) => window.setTimeout(resolve, 650));
      }}
      onRename={(_, name) => setNote(`renamed to ${name}`)}
      onCancel={() => setNote("cancelled")}
      frameHeight={520}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={ref} className="w-full max-w-2xl">
        {frame}
      </div>
    );
  }

  const clients = items.filter((i) => i.section === "clients").length;
  const prospects = items.filter((i) => i.section === "prospects").length;

  return (
    <div ref={ref} className="flex w-full max-w-2xl flex-col gap-4">
      {frame}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setItems(defaultInsertItems);
            setNote(null);
            setRun((r) => r + 1);
            play(500);
          }}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
            "hover:bg-surface-2 hover:text-foreground",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Replay
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {`${clients} clients · ${prospects} prospects`}
        </span>
        {note ? ` · ${note}` : " · press n in the list"}
      </p>
    </div>
  );
}
