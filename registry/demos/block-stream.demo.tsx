"use client";

import * as React from "react";

import { BlockStream, type StreamBlock } from "@/registry/ui/block-stream";

const START_HEIGHT = 812441;
const MINE_MS = 1600;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

/** One height for every control in the row, so the buttons line up. */
const Btn = (props: React.ComponentProps<"button">) => (
  <button type="button" {...props} className={BUTTON} />
);

/** Seeded from the sequence number, so a block is the same on both renders. */
function mine(n: number): StreamBlock {
  return {
    id: `blk-${n}`,
    height: START_HEIGHT + n,
    txCount: 640 + ((n * 397) % 1780),
  };
}

const SEED: StreamBlock[] = [mine(0), mine(1), mine(2)];

export function BlockStreamDemo() {
  const [blocks, setBlocks] = React.useState<StreamBlock[]>(SEED);
  const [running, setRunning] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const seq = React.useRef(SEED.length);

  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || held || !visible) return;
    const timer = window.setInterval(() => {
      const next = mine(seq.current);
      seq.current += 1;
      setBlocks((current) => [...current, next].slice(-12));
    }, MINE_MS);
    return () => window.clearInterval(timer);
  }, [running, held, visible]);

  const head = blocks[blocks.length - 1] ?? null;
  const state = !running ? "stopped" : held ? "held" : "streaming";

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <BlockStream
        blocks={blocks}
        max={5}
        capacity={2400}
        label="Basin ledger"
        onPauseChange={setHeld}
      />

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setRunning((was) => !was)}>
          {running ? "Pause stream" : "Start stream"}
        </Btn>
        <Btn disabled={blocks.length === 0} onClick={() => setBlocks([])}>
          Clear
        </Btn>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Head{" "}
        <span className="text-signal tabular-nums">
          {head ? head.height : "—"}
        </span>{" "}
        · <span className="text-signal">{state}</span> ·{" "}
        <span className="tabular-nums">{head ? head.txCount : 0}</span> tx
      </p>
    </div>
  );
}
