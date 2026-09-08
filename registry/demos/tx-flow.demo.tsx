"use client";

import * as React from "react";

import { TxFlow, type TxLeg } from "@/registry/ui/tx-flow";

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

/** One height for every control in the row, so the buttons line up. */
const Btn = (props: React.ComponentProps<"button">) => (
  <button type="button" {...props} className={BUTTON} />
);

const INPUTS: TxLeg[] = [
  { id: "in-1", address: "bsn1q8f4…hd21c", amount: 0.82 },
  { id: "in-2", address: "bsn1qk3r…7vte0", amount: 0.42 },
];

const BASE_OUTPUTS: TxLeg[] = [
  { id: "out-1", address: "bsn1qm9w…zp4ka", amount: 0.93 },
  { id: "out-2", address: "bsn1qr7d…c1nf8", amount: 0.306 },
  { id: "out-fee", address: "Basin relay", amount: 0.004, kind: "fee" },
];

/** Splitting the first payment keeps the transaction balanced as it grows. */
const SPLIT_OUTPUTS: TxLeg[] = [
  { id: "out-1", address: "bsn1qm9w…zp4ka", amount: 0.58 },
  { id: "out-3", address: "bsn1qv2t…s6hb9", amount: 0.35 },
  { id: "out-2", address: "bsn1qr7d…c1nf8", amount: 0.306 },
  { id: "out-fee", address: "Basin relay", amount: 0.004, kind: "fee" },
];

export function TxFlowDemo() {
  const [split, setSplit] = React.useState(false);
  const [flowing, setFlowing] = React.useState(true);
  const [hover, setHover] = React.useState<string | null>(null);
  const [pin, setPin] = React.useState<string | null>(null);

  const outputs = split ? SPLIT_OUTPUTS : BASE_OUTPUTS;
  const lit = pin ?? hover;
  const leg = [...INPUTS, ...outputs].find((entry) => entry.id === lit) ?? null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <TxFlow
        inputs={INPUTS}
        outputs={outputs}
        asset="BSN"
        label="Basinworks payout"
        flowing={flowing}
        onHoverChange={setHover}
        onValueChange={setPin}
      />

      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => setFlowing((was) => !was)}>
          {flowing ? "Stop flow" : "Start flow"}
        </Btn>
        <Btn onClick={() => setSplit((was) => !was)}>
          {split ? "Merge output" : "Split output"}
        </Btn>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {leg ? (
          <>
            Leg <span className="text-signal">{leg.address}</span> ·{" "}
            <span className="tabular-nums">{leg.amount.toFixed(4)}</span> BSN
          </>
        ) : (
          <>
            Legs{" "}
            <span className="text-signal tabular-nums">
              {INPUTS.length + outputs.length}
            </span>{" "}
            ·{" "}
            <span className="text-signal">{flowing ? "flowing" : "held"}</span>
          </>
        )}
      </p>
    </div>
  );
}
