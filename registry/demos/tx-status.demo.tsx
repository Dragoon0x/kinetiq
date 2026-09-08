"use client";

import * as React from "react";

import { TxStatus, type TxStatusBlock } from "@/registry/ui/tx-status";

const START_HEIGHT = 812441;
const THRESHOLD = 6;
const LAND_MS = 1400;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

/** One height for every control in the row, so the buttons line up. */
const Btn = (props: React.ComponentProps<"button">) => (
  <button type="button" {...props} className={BUTTON} />
);

/** Seeded from the index, so a block is identical on the server and the client. */
function makeBlock(index: number): TxStatusBlock {
  return {
    id: `blk-${index}`,
    height: START_HEIGHT + index,
    txCount: 940 + ((index * 271) % 1300),
  };
}

export function TxStatusDemo() {
  const [blocks, setBlocks] = React.useState<TxStatusBlock[]>([]);
  const [running, setRunning] = React.useState(false);
  const [dropped, setDropped] = React.useState(false);
  const [picked, setPicked] = React.useState<TxStatusBlock | null>(null);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const settled = dropped || blocks.length >= THRESHOLD;

  React.useEffect(() => {
    if (!running || settled || !visible) return;
    const timer = window.setInterval(() => {
      setBlocks((current) =>
        current.length >= THRESHOLD
          ? current
          : [...current, makeBlock(current.length)],
      );
    }, LAND_MS);
    return () => window.clearInterval(timer);
  }, [running, settled, visible]);

  const reset = () => {
    setBlocks([]);
    setDropped(false);
    setPicked(null);
    setRunning(false);
  };

  const phase = dropped
    ? "dropped"
    : blocks.length >= THRESHOLD
      ? "final"
      : blocks.length > 0
        ? `${blocks.length} of ${THRESHOLD} confirmations`
        : "pending";
  const head = picked ?? blocks[blocks.length - 1] ?? null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TxStatus
        hash="bsn1q8f4h2rk9vte0xm3swz7pd21c"
        amount={0.482}
        asset="BSN"
        label="Waylight payout"
        blocks={dropped ? [] : blocks}
        threshold={THRESHOLD}
        dropped={dropped}
        onBlockSelect={setPicked}
      />

      <div className="flex flex-wrap gap-2">
        <Btn disabled={settled} onClick={() => setRunning((was) => !was)}>
          {running ? "Hold blocks" : "Land blocks"}
        </Btn>
        <Btn
          disabled={settled}
          onClick={() => {
            setRunning(false);
            setDropped(true);
          }}
        >
          Drop
        </Btn>
        <Btn
          disabled={blocks.length === 0 && !dropped && !running}
          onClick={reset}
        >
          Reset
        </Btn>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Transfer <span className="text-signal">{phase}</span> · block{" "}
        <span className="text-signal tabular-nums">
          {head ? head.height : "—"}
        </span>
      </p>
    </div>
  );
}
