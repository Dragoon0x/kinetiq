"use client";

import * as React from "react";

import { RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  defaultDrilldownInvoices,
  defaultDrilldownLineItems,
  InvoiceDrilldown,
} from "@/registry/ui/invoice-drilldown";

export const tweaks = defineTweaks({
  tableStyle: {
    kind: "choice",
    label: "Table",
    default: "ruled",
    options: ["ruled", "striped", "boxed"],
    names: { ruled: "Ruled", striped: "Striped", boxed: "Boxed" },
  },
  rowHeight: {
    kind: "range",
    label: "Rows",
    default: 40,
    min: 32,
    max: 52,
    step: 4,
    unit: "px",
  },
  accent: {
    kind: "choice",
    label: "Accent",
    default: "cobalt",
    options: ["cobalt", "plum", "mint", "ink"],
    names: { cobalt: "Cobalt", plum: "Plum", mint: "Mint", ink: "Ink" },
  },
});

const OPEN = ["0142-compute"];
const PAY_MS = 800;
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const totalOf = (id: string) => {
  const inv = defaultDrilldownInvoices.find((i) => i.id === id);
  const lines = defaultDrilldownLineItems.filter((l) => l.invoiceId === id);
  return (
    Math.round(
      (lines.reduce((a, l) => a + l.amount, 0) + (inv?.tax ?? 0)) * 100,
    ) / 100
  );
};

/**
 * Fernworks Studio's last four invoices: September due, August overdue,
 * July paid and a voided July duplicate. Compute hours on the September
 * invoice is open, traced to its three projects.
 */
export function InvoiceDrilldownDemo({
  chrome = true,
  // The viewer is silent: the stage's sound switch has nothing to play here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sound: _sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [selected, setSelected] = React.useState("inv-0142");
  const [note, setNote] = React.useState<string | null>(null);
  const [paid, setPaid] = React.useState<string[]>([]);
  const [failNext, setFailNext] = React.useState(false);
  const [round, setRound] = React.useState(0);
  const failRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      list.length = 0;
    };
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const surface = (
    <InvoiceDrilldown
      key={round}
      value={selected}
      onValueChange={(id) => {
        setSelected(id);
        setNote(null);
      }}
      defaultExpanded={OPEN}
      onExpandedChange={(ids) => {
        const last = defaultDrilldownLineItems.find(
          (l) => l.id === ids[ids.length - 1],
        );
        setNote(
          last
            ? `opened ${last.label.toLowerCase()} · ${last.records?.length ?? 0} parts`
            : "lines closed",
        );
      }}
      onDownload={(inv) =>
        new Promise<void>((resolve) => {
          later(() => {
            setNote(`downloaded ${inv.number}`);
            resolve();
          }, 600);
        })
      }
      onDispute={(inv, line) =>
        setNote(
          line
            ? `questioned ${line.label.toLowerCase()} · ${inv.number}`
            : `dispute opened · ${inv.number}`,
        )
      }
      onPay={(inv) =>
        new Promise<void>((resolve, reject) => {
          const fail = failRef.current;
          failRef.current = false;
          if (fail) setFailNext(false);
          later(() => {
            if (fail) {
              setNote("payment declined");
              reject(
                new Error(
                  "Card ending 4417 was declined. Nothing was charged.",
                ),
              );
              return;
            }
            setNote(`paid · ${inv.number}`);
            setPaid((p) => [...p, inv.id]);
            resolve();
          }, PAY_MS);
        })
      }
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{surface}</div>;

  const inv = defaultDrilldownInvoices.find((i) => i.id === selected);
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      {surface}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext((v) => !v);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next payment
        </button>
        <button
          type="button"
          onClick={() => {
            for (const t of timers.current) window.clearTimeout(t);
            timers.current = [];
            failRef.current = false;
            setFailNext(false);
            setSelected("inv-0142");
            setPaid([]);
            setNote(null);
            setRound((r) => r + 1);
          }}
          className={button}
        >
          <RotateCcw aria-hidden className="size-3.5" />
          Reset
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        <span className="text-signal">{note ?? inv?.number ?? "—"}</span>
        {inv
          ? ` · ${paid.includes(inv.id) ? "paid" : inv.status} · ${money(totalOf(inv.id))}`
          : null}
      </p>
    </div>
  );
}
