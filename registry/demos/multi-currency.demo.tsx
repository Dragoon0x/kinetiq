"use client";

import * as React from "react";

import {
  MultiCurrency,
  type CurrencyBalance,
} from "@/registry/ui/multi-currency";

const DISPLAY = "CBK";

const BALANCES: CurrencyBalance[] = [
  { code: "FRN", name: "Fernwork", amount: 4210 },
  { code: "BSN", name: "Basin", amount: 1880.4 },
  { code: "WAY", name: "Waylight", amount: 22640 },
  { code: "CBK", name: "Coldbrook", amount: 3120.75 },
];

/** Seeded tables — the demo never invents a rate at render time. */
const RATE_TABLES: Record<string, number>[] = [
  { FRN: 1.2843, BSN: 0.8412, WAY: 0.0714, CBK: 1 },
  { FRN: 1.2718, BSN: 0.8556, WAY: 0.0722, CBK: 1 },
  { FRN: 1.3011, BSN: 0.8377, WAY: 0.0709, CBK: 1 },
];

const BUTTON =
  "inline-flex h-8 items-center justify-center rounded-2 border border-input bg-surface-1 px-3 text-xs font-medium text-foreground outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";

export function MultiCurrencyDemo() {
  const [code, setCode] = React.useState("FRN");
  const [table, setTable] = React.useState(0);

  const rates = RATE_TABLES[table] ?? {};
  const lane = BALANCES.find((item) => item.code === code);
  const rate = lane ? (rates[lane.code] ?? 0) : 0;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <MultiCurrency
        label="Basinworks wallet"
        balances={BALANCES}
        rates={rates}
        display={DISPLAY}
        value={code}
        onValueChange={setCode}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() =>
            setTable((current) => (current + 1) % RATE_TABLES.length)
          }
        >
          Refresh rates
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={table === 0 && code === "FRN"}
          onClick={() => {
            setTable(0);
            setCode("FRN");
          }}
        >
          Reset
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Top lane <span className="text-signal">{code}</span> ·{" "}
        <span className="tabular-nums">
          {(lane?.amount ?? 0).toFixed(2)} {code} ={" "}
          {((lane?.amount ?? 0) * rate).toFixed(2)} {DISPLAY}
        </span>{" "}
        · rate <span className="tabular-nums">{rate.toFixed(4)}</span>
      </p>
    </div>
  );
}
