"use client";

import * as React from "react";

import { MempoolQueue, type MempoolEntry } from "@/registry/ui/mempool-queue";

const ARRIVE_MS = 1500;
const SLOTS = 3;

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

/** One height for every control in the row, so the buttons line up. */
const Btn = (props: React.ComponentProps<"button">) => (
  <button type="button" {...props} className={BUTTON} />
);

/** Seeded from the sequence number, so an arrival is the same on both renders.
 *  Integer maths only: no trigonometry to disagree about in the last digit. */
function arrival(n: number): MempoolEntry {
  const tail = "kmqrtvwxz2489".slice(n % 8, (n % 8) + 5);
  const fee = 9 + ((((n * 1103515245 + 12345) >>> 16) % 1000) / 1000) * 22;
  return {
    id: `tx-${n}`,
    address: `bsn1q${tail}…${String(1000 + ((n * 313) % 8999)).slice(0, 4)}`,
    fee: Number(fee.toFixed(1)),
  };
}

const SEED: MempoolEntry[] = [
  arrival(0),
  arrival(1),
  { id: "tx-mine", address: "bsn1q8f4…hd21c", fee: 12, mine: true },
  arrival(2),
  arrival(3),
];

/** Trims the oldest arrival, never your own row: a queue that quietly dropped
 *  the transaction you are bumping would be lying. */
function admit(current: MempoolEntry[], next: MempoolEntry): MempoolEntry[] {
  const grown = [...current, next];
  if (grown.length <= 14) return grown;
  const oldest = grown.findIndex((entry) => !entry.mine);
  return grown.filter((_, index) => index !== oldest);
}

export function MempoolQueueDemo() {
  const [queue, setQueue] = React.useState<MempoolEntry[]>(SEED);
  const [running, setRunning] = React.useState(false);
  const [visible, setVisible] = React.useState(true);
  const seq = React.useRef(4);

  React.useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!running || !visible) return;
    const timer = window.setInterval(() => {
      const next = arrival(seq.current);
      seq.current += 1;
      setQueue((current) => admit(current, next));
    }, ARRIVE_MS);
    return () => window.clearInterval(timer);
  }, [running, visible]);

  const bump = (id: string, fee: number) =>
    setQueue((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, fee } : entry)),
    );

  const mineBlock = () =>
    setQueue((current) => {
      const cut = [...current].sort((a, b) => b.fee - a.fee).slice(0, SLOTS);
      return current.filter((entry) => !cut.includes(entry));
    });

  const ordered = [...queue].sort((a, b) => b.fee - a.fee);
  const rank = ordered.findIndex((entry) => entry.mine) + 1;
  const mine = ordered[rank - 1] ?? null;
  const verdict =
    rank === 0
      ? "mined"
      : rank <= SLOTS
        ? "in next block"
        : `${rank - SLOTS} short`;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <MempoolQueue
        entries={queue}
        blockSlots={SLOTS}
        capacity={7}
        step={3}
        label="Basin pending queue"
        onBump={bump}
      />

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setRunning((was) => !was)}>
          {running ? "Pause arrivals" : "Start arrivals"}
        </Btn>
        <Btn disabled={queue.length === 0} onClick={mineBlock}>
          Mine block
        </Btn>
        <Btn
          onClick={() => {
            setQueue(SEED);
            seq.current = 4;
          }}
        >
          Reset
        </Btn>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Yours{" "}
        <span className="text-signal tabular-nums">
          {rank === 0 ? "—" : `#${rank} of ${ordered.length}`}
        </span>{" "}
        · <span className="text-signal">{verdict}</span> · fee{" "}
        <span className="tabular-nums">{mine ? mine.fee.toFixed(1) : "—"}</span>{" "}
        gu
      </p>
    </div>
  );
}
