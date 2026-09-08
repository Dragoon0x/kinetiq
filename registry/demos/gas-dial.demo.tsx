"use client";

import * as React from "react";

import { GasDial, type GasStop } from "@/registry/ui/gas-dial";

const STOPS: [GasStop, GasStop, GasStop] = [
  { id: "slow", label: "Slow", fee: 0.42, seconds: 180, rate: 9 },
  { id: "normal", label: "Normal", fee: 1.84, seconds: 45, rate: 18 },
  { id: "fast", label: "Fast", fee: 4.2, seconds: 12, rate: 41 },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export function GasDialDemo() {
  const [id, setId] = React.useState("normal");
  const stop = STOPS.find((entry) => entry.id === id) ?? STOPS[1];

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <GasDial
        label="Network fee"
        stops={STOPS}
        value={id}
        onValueChange={setId}
      />

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Speed <span className="text-signal">{stop.label}</span> · Fee{" "}
        <span className="tabular-nums">{money.format(stop.fee)}</span> · Eta{" "}
        <span className="tabular-nums">{clock(stop.seconds)}</span>
      </p>
    </div>
  );
}
