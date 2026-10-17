"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  CountTakeover,
  defaultCountTakeoverActions,
  defaultCountTakeoverItems,
  type CountTakeoverItem,
} from "@/registry/ui/count-takeover";

export const tweaks = defineTweaks({
  swapStyle: {
    kind: "choice",
    label: "Swap",
    default: "rise",
    options: ["rise", "push", "fold"],
    names: { rise: "Rise", push: "Push", fold: "Fold" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const NONE: string[] = [];

/**
 * Basinworks' outbound shipments. The actions really act: delivered rows turn
 * delivered, reassigned rows swap carrier, cancelled rows leave, and New
 * shipment adds a draft. The gallery card picks two rows when it is seen,
 * then a third that is already delivered, then clears.
 */
export function CountTakeoverDemo({
  chrome = true,
  // The list is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [items, setItems] = React.useState<CountTakeoverItem[]>(
    defaultCountTakeoverItems,
  );
  const [selection, setSelection] = React.useState<string[]>(NONE);
  const [note, setNote] = React.useState("none yet");
  const [serial, setSerial] = React.useState(20431);
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
        window.setTimeout(() => setSelection(["s1", "s2"]), 1100),
        window.setTimeout(() => setSelection(["s1", "s2", "s3"]), 2100),
        window.setTimeout(() => {
          once.current = true;
          setSelection(NONE);
        }, 4600),
      ];
    });
    io.observe(node);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      io.disconnect();
    };
  }, [chrome]);

  const act = (id: string, ids: string[]) => {
    const n = ids.length;
    const rows = n === 1 ? "1 shipment" : `${n} shipments`;
    if (id === "deliver") {
      setItems((list) =>
        list.map((item) =>
          ids.includes(item.id) ? { ...item, state: "delivered" } : item,
        ),
      );
      setNote(`${rows} marked delivered`);
    } else if (id === "reassign") {
      setItems((list) =>
        list.map((item) =>
          ids.includes(item.id)
            ? {
                ...item,
                carrier:
                  item.carrier === "Fieldline Freight"
                    ? "Waylight Cargo"
                    : "Fieldline Freight",
              }
            : item,
        ),
      );
      setNote(`${rows} reassigned`);
    } else if (id === "labels") {
      setItems((list) =>
        list.map((item) =>
          ids.includes(item.id) && item.state === "draft"
            ? { ...item, state: "ready" }
            : item,
        ),
      );
      setNote(`labels printed for ${rows}`);
    } else if (id === "export") {
      setNote(`${rows} exported`);
    } else if (id === "cancel") {
      setItems((list) => list.filter((item) => !ids.includes(item.id)));
      setNote(`${rows} cancelled`);
    } else if (id === "new") {
      setItems((list) => [
        {
          id: `n${serial}`,
          ref: `BSN-${serial}`,
          destination: "Ogden, UT",
          customer: "Fernworks Studio",
          carrier: "Fieldline Freight",
          state: "draft",
          due: "Oct 24",
        },
        ...list,
      ]);
      setSerial((s) => s + 1);
      setNote(`draft BSN-${serial} added`);
    } else if (id === "filter") {
      setNote("filters open here");
    }
  };

  const list = (
    <CountTakeover
      items={items}
      selection={selection}
      onSelectionChange={setSelection}
      onAction={act}
      {...values}
    />
  );

  if (!chrome) {
    return (
      <div ref={frame} className="w-full max-w-3xl">
        {list}
      </div>
    );
  }

  const picked = items.filter((item) => selection.includes(item.id));
  const blocked = defaultCountTakeoverActions
    .map((a) => ({ a, why: a.reason?.(picked) ?? null }))
    .find((x) => picked.length > 0 && x.why);

  return (
    <div ref={frame} className="flex w-full max-w-3xl flex-col gap-4">
      {list}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setItems(defaultCountTakeoverItems);
            setSelection(NONE);
            setNote("none yet");
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
          Space picks a row · ⌘ or Ctrl+A selects all · Esc clears
        </span>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">
          {picked.length > 0 ? `${picked.length} selected` : "no selection"}
        </span>
        {picked.length > 0
          ? blocked
            ? ` · ${blocked.a.label} off`
            : " · every action open"
          : ` · last: ${note}`}
      </p>
    </div>
  );
}
