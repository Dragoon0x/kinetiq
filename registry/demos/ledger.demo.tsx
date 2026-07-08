"use client";

import * as React from "react";

import { cn } from "@/registry/lib/utils";
import {
  Ledger,
  type LedgerColumn,
  type LedgerVisibleRange,
} from "@/registry/ui/ledger";

type TxnStatus = "QUEUED" | "CLEARED" | "FLAGGED";

type Txn = {
  id: string;
  time: string;
  amount: number;
  status: TxnStatus;
};

const TOTAL = 10_000;
const HEIGHT = 320;
const ROW_HEIGHT = 40;

/** djb2 — deterministic per id, so SSR and client generate identical data. */
function djb2(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const STATUSES = ["QUEUED", "CLEARED", "FLAGGED"] as const;

/** Fixed epoch (never Date.now()) keeps the dataset identical every render. */
const BASE_UTC = Date.UTC(2026, 5, 1);
const THIRTY_DAYS_MINUTES = 30 * 24 * 60;

function makeRows(): Txn[] {
  const rows: Txn[] = [];
  for (let n = 1; n <= TOTAL; n += 1) {
    const id = `TXN-${String(n).padStart(5, "0")}`;
    const stamp = new Date(
      BASE_UTC + (djb2(`${id}|t`) % THIRTY_DAYS_MINUTES) * 60_000,
    );
    const month = MONTHS[stamp.getUTCMonth()] ?? "JAN";
    const day = String(stamp.getUTCDate()).padStart(2, "0");
    const hours = String(stamp.getUTCHours()).padStart(2, "0");
    const minutes = String(stamp.getUTCMinutes()).padStart(2, "0");
    rows.push({
      id,
      time: `${month} ${day} · ${hours}:${minutes}`,
      // -500.00 .. +2500.00, always two decimals of precision.
      amount: (djb2(`${id}|a`) % 300_001) / 100 - 500,
      status: STATUSES[djb2(`${id}|s`) % 3] ?? "QUEUED",
    });
  }
  return rows;
}

const ROWS = makeRows();

const rowId = (txn: Txn) => txn.id;

function StatusChip({ status }: { status: TxnStatus }) {
  const tone =
    status === "CLEARED"
      ? "var(--success, var(--primary))"
      : status === "FLAGGED"
        ? "var(--warn, var(--destructive))"
        : null;
  return (
    <span
      className={cn(
        "rounded-1 px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase",
        !tone && "bg-muted text-muted-foreground",
      )}
      style={
        tone
          ? {
              // Bias the label toward --foreground so it clears AA contrast on
              // its own wash in both themes, while keeping the semantic hue.
              color: `color-mix(in oklab, ${tone} 78%, var(--foreground))`,
              backgroundColor: `color-mix(in oklab, ${tone} 14%, transparent)`,
            }
          : undefined
      }
    >
      {status}
    </span>
  );
}

const COLUMNS: LedgerColumn<Txn>[] = [
  {
    key: "id",
    header: "ID",
    width: 110,
    cell: (txn) => <span className="font-mono text-xs">{txn.id}</span>,
  },
  {
    key: "time",
    header: "Time",
    width: "1fr",
    cell: (txn) => (
      <span className="text-muted-foreground font-mono text-xs">
        {txn.time}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    width: 120,
    align: "right",
    sortable: true,
    sortFn: (a, b) => a.amount - b.amount,
    cell: (txn) => (
      <span className={txn.amount < 0 ? "text-muted-foreground" : undefined}>
        {txn.amount >= 0 ? "+" : ""}
        {txn.amount.toFixed(2)}
      </span>
    ),
  },
  {
    key: "status",
    header: "Status",
    width: 100,
    sortable: true,
    cell: (txn) => <StatusChip status={txn.status} />,
  },
];

const formatCount = (value: number) => value.toLocaleString("en-US");

export function LedgerDemo() {
  const [range, setRange] = React.useState<LedgerVisibleRange>({
    from: 1,
    to: Math.min(TOTAL, Math.ceil(HEIGHT / ROW_HEIGHT)),
  });

  return (
    <div className="flex w-full max-w-xl flex-col gap-2">
      <p className="text-muted-foreground font-mono text-[11px] tracking-[0.08em] uppercase">
        10,000 ROWS · VIRTUALIZED
      </p>
      <Ledger
        columns={COLUMNS}
        rows={ROWS}
        rowId={rowId}
        rowHeight={ROW_HEIGHT}
        height={HEIGHT}
        defaultSort={{ key: "amount", direction: "desc" }}
        selectable
        label="Transactions"
        onVisibleRangeChange={setRange}
      />
      <p className="text-muted-foreground font-mono text-[11px] tracking-[0.08em] tabular-nums uppercase">
        VISIBLE {formatCount(range.from)}–{formatCount(range.to)} OF 10,000
      </p>
    </div>
  );
}
