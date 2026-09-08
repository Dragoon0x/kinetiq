"use client";

import * as React from "react";

import {
  CandleBrush,
  type Candle,
  type CandleRange,
} from "@/registry/ui/candle-brush";

const BARS = 28;

/** Built once at module scope from a fixed seed in cents: the server and the
 *  client draw the same chart, and no Math.random is ever called. */
const SERIES: Candle[] = (() => {
  const out: Candle[] = [];
  let seed = 90210;
  let close = 2312;
  for (let index = 0; index < BARS; index += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const open = close;
    close = Math.max(1900, open + (((seed >> 9) % 17) - 7));
    out.push({
      id: `bar-${index}`,
      label: `Day ${index + 1}`,
      open: open / 100,
      high: (Math.max(open, close) + ((seed >> 15) % 9)) / 100,
      low: (Math.min(open, close) - ((seed >> 19) % 9)) / 100,
      close: close / 100,
    });
  }
  return out;
})();

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function CandleBrushDemo() {
  const [range, setRange] = React.useState<CandleRange | null>(null);
  const [cursor, setCursor] = React.useState<number | null>(null);

  const first = range ? SERIES[range.start] : undefined;
  const last = range ? SERIES[range.end] : undefined;
  const open = first?.open ?? 0;
  const close = last?.close ?? 0;
  const percent = open === 0 ? 0 : ((close - open) / open) * 100;
  const bar = cursor === null ? undefined : SERIES[cursor];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <CandleBrush
        candles={SERIES}
        symbol="BSN/USD"
        selection={range}
        onSelectionChange={setRange}
        onCursorChange={setCursor}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          disabled={!range}
          onClick={() => setRange(null)}
        >
          Clear range
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {range ? (
          <>
            Bars{" "}
            <span className="tabular-nums">
              {range.start + 1}–{range.end + 1}
            </span>{" "}
            · Open <span className="tabular-nums">{money.format(open)}</span> ·
            Close <span className="tabular-nums">{money.format(close)}</span> ·{" "}
            <span className="text-signal tabular-nums">
              {percent >= 0 ? "+" : "-"}
              {Math.abs(percent).toFixed(2)}%
            </span>
          </>
        ) : (
          <>
            No range ·{" "}
            {bar ? (
              <>
                Bar <span className="tabular-nums">{(cursor ?? 0) + 1}</span>{" "}
                close{" "}
                <span className="text-signal tabular-nums">
                  {money.format(bar.close)}
                </span>
              </>
            ) : (
              "drag to read a move"
            )}
          </>
        )}
      </p>
    </div>
  );
}
