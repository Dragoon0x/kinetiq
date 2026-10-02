"use client";

import * as React from "react";

import { BellRing, CircleCheck, RotateCcw } from "lucide-react";

import { defineTweaks, type TactileDemoProps } from "@/registry/lib/tweaks";
import { cn } from "@/registry/lib/utils";
import {
  DataGrid,
  defaultDataGridColumns,
  defaultDataGridRows,
  type DataGridRow,
  type DataGridSort,
  type DataGridStatus,
} from "@/registry/ui/data-grid";

export const tweaks = defineTweaks({
  density: {
    kind: "choice",
    label: "Density",
    default: "regular",
    options: ["compact", "regular", "roomy"],
    names: { compact: "Compact", regular: "Regular", roomy: "Roomy" },
  },
  cascade: {
    kind: "choice",
    label: "Cascade",
    default: "rows",
    options: ["rows", "wave", "none"],
    names: { rows: "Rows", wave: "Wave", none: "Fade" },
  },
  stripes: { kind: "toggle", label: "Stripes", default: false },
});

const PAGE_SIZE = 8;
const LOAD_MS = 900;
const SAVE_MS = 450;

const ACTIONS = [
  {
    id: "paid",
    label: "Mark paid",
    icon: <CircleCheck className="size-3.5" />,
  },
  { id: "remind", label: "Remind", icon: <BellRing className="size-3.5" /> },
];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const sortLine = (sort: DataGridSort | null) => {
  if (!sort) return "invoice order";
  const column = defaultDataGridColumns.find((c) => c.id === sort.columnId);
  const name = (column?.header ?? sort.columnId).toLowerCase();
  if (column?.kind === "money") {
    return `${name}, ${sort.direction === "asc" ? "low to high" : "high to low"}`;
  }
  if (column?.kind === "date") {
    return `${name}, ${sort.direction === "asc" ? "earliest first" : "latest first"}`;
  }
  return `${name}, ${sort.direction === "asc" ? "a to z" : "z to a"}`;
};

/**
 * Waylight Pay receivables for a small merchant: forty-two invoices across
 * six pages. The rows load for a moment first, so the arrival is the first
 * thing seen; amounts and owners can be edited, and saves take a beat.
 */
export function DataGridDemo({
  chrome = true,
  sound,
  ...values
}: TactileDemoProps<typeof tweaks> & { chrome?: boolean }) {
  const [rows, setRows] = React.useState<DataGridRow[]>(defaultDataGridRows);
  const [status, setStatus] = React.useState<DataGridStatus>("loading");
  const [load, setLoad] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState<DataGridSort | null>(null);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [failNext, setFailNext] = React.useState(false);
  const [event, setEvent] = React.useState<string | null>(null);
  const failRef = React.useRef(false);

  // The rows arrive after a beat — on first show, on Reload, and when the
  // cascade changes, so the new arrival is what you see.
  const [seenCascade, setSeenCascade] = React.useState(values.cascade);
  if (seenCascade !== values.cascade) {
    setSeenCascade(values.cascade);
    setStatus("loading");
    setLoad((n) => n + 1);
  }
  React.useEffect(() => {
    const t = window.setTimeout(() => setStatus("ready"), LOAD_MS);
    return () => window.clearTimeout(t);
  }, [load]);

  const reload = () => {
    setStatus("loading");
    setLoad((n) => n + 1);
    setEvent(null);
  };

  const grid = (
    <DataGrid
      title="Receivables"
      itemLabel={{ one: "invoice", other: "invoices" }}
      pageSize={PAGE_SIZE}
      status={status}
      rows={rows}
      onRowsChange={setRows}
      sort={sort}
      onSortChange={setSort}
      page={page}
      onPageChange={setPage}
      selected={selected}
      onSelectedChange={setSelected}
      actions={ACTIONS}
      onAction={(action, ids) => {
        if (action === "paid") {
          setRows((list) =>
            list.map((r) =>
              ids.includes(r.id) && r.status !== "Paid"
                ? { ...r, status: "Paid" }
                : r,
            ),
          );
          setEvent(`marked ${ids.length} paid`);
        } else {
          setEvent(
            `reminders queued for ${ids.length} ${ids.length === 1 ? "customer" : "customers"}`,
          );
        }
      }}
      onCellEdit={(edit) => {
        const row = rows.find((r) => r.id === edit.rowId);
        const who = String(row?.customer ?? "").toLowerCase();
        const what =
          typeof edit.value === "number"
            ? money.format(edit.value)
            : String(edit.value ?? "");
        const fail = failRef.current;
        failRef.current = false;
        setFailNext(false);
        setEvent(`saving ${edit.columnId} · ${who}`);
        return new Promise<void>((resolve, reject) => {
          window.setTimeout(() => {
            if (fail) {
              setEvent(`save refused · ${who} · put back`);
              reject(new Error("refused"));
            } else {
              setEvent(`saved ${edit.columnId} · ${who} · ${what}`);
              resolve();
            }
          }, SAVE_MS);
        });
      }}
      sound={sound}
      {...values}
    />
  );

  if (!chrome) return <div className="w-full">{grid}</div>;

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const button = cn(
    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors outline-none",
    "hover:bg-surface-2 hover:text-foreground",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
  );

  return (
    <div className="flex w-full max-w-5xl flex-col gap-4">
      {grid}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={reload} className={button}>
          <RotateCcw aria-hidden className="size-3.5" />
          Reload
        </button>
        <button
          type="button"
          aria-pressed={failNext}
          onClick={() => {
            failRef.current = !failNext;
            setFailNext(!failNext);
          }}
          className={cn(
            button,
            failNext && "border-danger/50 text-danger hover:text-danger",
          )}
        >
          Fail next save
        </button>
      </div>
      <p
        role="status"
        className="border-t border-border pt-3 font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase"
      >
        {status === "loading" ? (
          <span className="text-signal">loading {rows.length} invoices</span>
        ) : (
          <>
            <span className="text-signal">
              {event ?? `page ${page + 1} of ${pages}`}
            </span>
            {event ? ` · page ${page + 1} of ${pages}` : ""} · {sortLine(sort)}
            {selected.length > 0 ? ` · ${selected.length} selected` : ""}
          </>
        )}
      </p>
    </div>
  );
}
