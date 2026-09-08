"use client";

import * as React from "react";

import { TradeConfirm } from "@/registry/ui/trade-confirm";

const SIZE = 40;
const FEE = 0.35;
/** A seeded quote sequence; consecutive quotes always differ. */
const QUOTES = [18.42, 18.47, 18.39, 18.51, 18.44];

const TICKET: [string, string][] = [
  ["Instrument", "CBK"],
  ["Venue", "Basinworks Exchange"],
  ["Side", "Buy"],
  ["Size", `${SIZE} units`],
];

export function TradeConfirmDemo() {
  const [open, setOpen] = React.useState(false);
  const [quote, setQuote] = React.useState(0);
  const [placed, setPlaced] = React.useState<number | null>(null);
  const [expired, setExpired] = React.useState(false);

  const price = QUOTES[quote % QUOTES.length] ?? 18.42;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <div className="relative h-[284px] w-full overflow-hidden rounded-3 border border-border bg-surface-1">
        <div className="flex h-10 items-center justify-between border-b border-hairline px-3 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          <span>Order ticket</span>
          <span className="tabular-nums">CBK</span>
        </div>

        <dl className="flex flex-col p-3">
          {TICKET.map(([term, value]) => (
            <div
              key={term}
              className="flex h-9 items-center justify-between gap-3 border-b border-hairline last:border-b-0"
            >
              <dt className="text-xs text-ink-3">{term}</dt>
              <dd className="min-w-0 truncate font-mono text-xs tabular-nums">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              setPlaced(null);
              setExpired(false);
              setOpen(true);
            }}
            className="flex h-9 w-full items-center justify-center rounded-2 bg-primary text-xs font-medium text-primary-foreground transition-opacity outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Review order
          </button>
        </div>

        <TradeConfirm
          open={open}
          onOpenChange={setOpen}
          side="buy"
          symbol="CBK"
          size={SIZE}
          price={price}
          fee={FEE}
          holdMs={8000}
          onExpire={() => setExpired(true)}
          onRefresh={() => {
            setExpired(false);
            setQuote((index) => index + 1);
          }}
          onConfirm={(at) => setPlaced(at)}
        />
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        CBK buy {SIZE} ·{" "}
        {placed !== null ? (
          <>
            placed at{" "}
            <span className="text-signal tabular-nums">
              {placed.toFixed(2)}
            </span>
          </>
        ) : (
          <>
            quote <span className="tabular-nums">{price.toFixed(2)}</span> ·{" "}
            <span className={expired ? "text-danger" : "text-signal"}>
              {expired ? "expired" : open ? "holding" : "idle"}
            </span>
          </>
        )}
      </p>
    </div>
  );
}
