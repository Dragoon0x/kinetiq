"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import {
  defaultReceiptScan,
  ReceiptReader,
  type ReceiptChange,
  type ReceiptFile,
  type ReceiptScan,
  type ReceiptStatus,
} from "@/registry/ui/receipt-reader";

export const tweaks = defineTweaks({
  confidence: {
    kind: "choice",
    label: "Confidence",
    default: "tint",
    options: ["tint", "badge", "none"],
    names: { tint: "Tint", badge: "Badge", none: "Hidden" },
  },
  density: {
    kind: "choice",
    label: "Density",
    default: "cozy",
    options: ["compact", "cozy", "roomy"],
    names: { compact: "Compact", cozy: "Cozy", roomy: "Roomy" },
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "signal", "ink"],
    names: { cobalt: "Cobalt", signal: "Signal", ink: "Ink" },
  },
});

const CHANGE_WORD: Record<ReceiptChange["kind"], string> = {
  scan: "receipt read",
  edit: "field edited",
  confirm: "field confirmed",
  item: "item corrected",
  fix: "total fixed",
  clear: "cleared",
};

/**
 * A lunch receipt from Fernmoor Coffee House dropped into Basinworks
 * Expenses: the reader finds the merchant and the card, is unsure of the
 * date, and misreads a smudged total that the items then fail to match.
 */
export function ReceiptReaderDemo({
  chrome = true,
  // The reader is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [status, setStatus] = React.useState<ReceiptStatus>("ready");
  const [failNext, setFailNext] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const [last, setLast] = React.useState("waiting");
  const [submitted, setSubmitted] = React.useState(0);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const reload = () => {
    setStatus("loading");
    setLast("reloading");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setStatus("ready");
      setLast("loaded");
    }, 900);
  };

  const scan = (file: ReceiptFile): Promise<ReceiptScan> =>
    new Promise((resolve, reject) => {
      window.setTimeout(() => {
        if (failNext) {
          setFailNext(false);
          setLast(`scan of ${file.name} failed`);
          reject(new Error("blurred"));
        } else {
          resolve(defaultReceiptScan);
        }
      }, 820);
    });

  if (!chrome) {
    return (
      <div className="w-full">
        <ReceiptReader start="scan" height={540} {...values} />
      </div>
    );
  }

  const surface = (
    <ReceiptReader
      key={run}
      start="scan"
      height={540}
      status={status}
      onRetry={reload}
      onScan={scan}
      onChange={(_value, change) => setLast(CHANGE_WORD[change.kind])}
      onSubmit={() => {
        setSubmitted((n) => n + 1);
        setLast("submitted");
      }}
      {...values}
    />
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-3">
      {surface}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
        <p
          role="status"
          className="font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
        >
          <span className="text-signal">{last}</span> · {submitted} submitted
          {failNext ? " · next scan fails" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFailNext((f) => !f)}
            aria-pressed={failNext}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid aria-pressed:bg-surface-2 aria-pressed:text-foreground"
          >
            Fail next scan
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => {
              setRun((r) => r + 1);
              setLast("replaying");
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors outline-none hover:bg-surface-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Replay scan
          </button>
        </div>
      </div>
    </div>
  );
}
