"use client";

import * as React from "react";

import { ReceiptPrint, type ReceiptLine } from "@/registry/ui/receipt-print";

const LINES: ReceiptLine[] = [
  { id: "flat-white", label: "Flat white", amount: 4.2 },
  { id: "oat-bun", label: "Oat bun", amount: 3.8 },
  { id: "filter", label: "Filter", amount: 3.4 },
  { id: "tax", label: "Tax", amount: 0.91 },
  { id: "total", label: "Total", amount: 12.31, kind: "total" },
  { id: "note", label: "Thank you", kind: "note" },
];

type Stage = "ready" | "printing" | "printed" | "torn";

export function ReceiptPrintDemo() {
  const [order, setOrder] = React.useState(1);
  const [stage, setStage] = React.useState<Stage>("ready");
  // Printing stays on after the tear so the printer reads "Torn off"; the
  // next order remounts it with printing already on, which is the off-then-on
  // flip that starts a fresh sheet.
  const printing = stage !== "ready";

  const print = () => {
    setOrder((previous) => previous + 1);
    setStage("printing");
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4">
      <ReceiptPrint
        key={order}
        header="Coldbrook Coffee"
        lines={LINES}
        printing={printing}
        onPrinted={() => setStage("printed")}
        onTear={() => setStage("torn")}
      />

      <div className="flex justify-end">
        <button
          type="button"
          disabled={stage === "printing" || stage === "printed"}
          onClick={print}
          className="flex h-8 items-center rounded-2 border border-hairline-strong px-3 text-xs font-medium transition-colors outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Print
        </button>
      </div>

      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        Coldbrook Coffee ·{" "}
        <span className="text-cobalt-bright">
          {stage === "ready"
            ? "ready"
            : stage === "printing"
              ? "printing"
              : stage === "printed"
                ? "printed · pull to tear"
                : "torn off"}
        </span>
      </p>
    </div>
  );
}
