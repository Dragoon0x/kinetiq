"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultReceiptSample,
  ReceiptReader,
  type ReceiptClaim,
} from "@/registry/ui/receipt-reader";

export const tweaks = defineTweaks({
  outlineStyle: {
    kind: "choice",
    label: "Outline",
    default: "box",
    options: ["box", "corners", "marker"],
    names: { box: "Box", corners: "Corners", marker: "Marker" },
  },
  layout: {
    kind: "choice",
    label: "Layout",
    default: "side",
    options: ["side", "stack", "flip"],
    names: { side: "Side", stack: "Stacked", flip: "Flipped" },
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

/** The sample, already read: what the demo opens on. */
const READ: Partial<ReceiptClaim> = {
  merchant: "Coldbrook Canteen",
  date: "2026-10-09",
  amount: "18.40",
  category: "Meals",
};

/**
 * A Gaugeworks travel claim, opening on the sample already read. The × over
 * the receipt returns to the drop zone, where Use sample reads it again in
 * 1.4s with one guess to check. This demo has no real reader, so any image
 * you drop is shown and then falls back to a blank claim — the honest path
 * for a failure.
 */
export function ReceiptReaderDemo({
  chrome = true,
  // The form is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [round, setRound] = React.useState(0);
  const [last, setLast] = React.useState<string | null>(null);
  const timers = React.useRef<number[]>([]);
  React.useEffect(
    () => () => {
      for (const t of timers.current) window.clearTimeout(t);
    },
    [],
  );

  const reset = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setLast(null);
    setRound((r) => r + 1);
  };

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      timers.current.push(window.setTimeout(resolve, ms));
    });

  const form = (
    <ReceiptReader
      key={round}
      defaultReceipt={defaultReceiptSample}
      defaultValues={READ}
      parse={async () => {
        setLast("reading your receipt…");
        await wait(900);
        setLast("read failed · fill it in");
        throw new Error("This demo has no reader");
      }}
      onReceiptChange={(doc) => {
        if (!doc) setLast("waiting for a receipt");
        else if (!doc.src && Object.keys(doc.fields).length === 0) {
          setLast("reading coldbrook canteen…");
        }
      }}
      onParse={(doc) => {
        const n = Object.keys(doc.fields).length;
        const unsure = Object.values(doc.fields).filter(
          (f) => (f?.confidence ?? 1) < 0.8,
        ).length;
        setLast(`read ${n} fields${unsure ? ` · ${unsure} to check` : ""}`);
      }}
      onChange={(field, value) =>
        setLast(`${field} · ${value.trim() ? "edited" : "cleared"}`)
      }
      onSubmit={async (claim) => {
        setLast("sending");
        await wait(1200);
        setLast(`claim sent · ${claim.amount ? `€${claim.amount}` : ""}`);
      }}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{form}</div>;

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {form}
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
        <span className="text-signal">
          {last ?? "4 fields read · 1 to check"}
        </span>
        {" · "}gaugeworks travel
      </p>
    </div>
  );
}
