"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Ban,
  Check,
  ChevronRight,
  CircleAlert,
  Clock,
  CreditCard,
  Download,
  Flag,
  LoaderCircle,
  Receipt,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type InvoiceDrilldownTableStyle = "ruled" | "striped" | "boxed";
export type InvoiceDrilldownAccentName = "cobalt" | "plum" | "mint" | "ink";
export type InvoiceDrilldownStatus = "ready" | "loading" | "empty" | "error";
export type DrilldownInvoiceStatus = "paid" | "due" | "overdue" | "void";

export type DrilldownInvoice = {
  id: string;
  /** As printed: "INV-0142". */
  number: string;
  /** The period billed, ms since the epoch; the end is the last day. */
  periodStart: number;
  periodEnd: number;
  issued: number;
  due: number;
  status: DrilldownInvoiceStatus;
  /** Tax on the invoice, as an amount. */
  tax: number;
  /** When it was paid, for a paid invoice. */
  paidOn?: number;
  /** Why a void invoice was voided. */
  note?: string;
};

export type DrilldownRecord = {
  id: string;
  /** What the usage was: a project, a bucket, a region. */
  label: string;
  /** How it was priced: "1,204 h × $0.18". */
  detail?: string;
  amount: number;
};

export type DrilldownLineItem = {
  id: string;
  /** The invoice this line belongs to. */
  invoiceId: string;
  label: string;
  /** Quantity or a short note: "2,291 h", "12 seats". */
  detail?: string;
  /** The line's total; negative for a credit. */
  amount: number;
  /** The usage records that made the line. A line with records opens. */
  records?: DrilldownRecord[];
};

type Async = void | Promise<unknown>;

export type InvoiceDrilldownProps = {
  /** The invoices, newest first. @default defaultDrilldownInvoices */
  invoices?: DrilldownInvoice[];
  /** Every line of every invoice, each tied to its invoice by id. @default defaultDrilldownLineItems */
  lineItems?: DrilldownLineItem[];
  /** Controlled selected invoice id. */
  value?: string;
  /** Initial invoice when uncontrolled. @default the first invoice */
  defaultValue?: string;
  /** Fires from the press or key that chose an invoice. */
  onValueChange?: (id: string) => void;
  /** Controlled open line ids. */
  expanded?: string[];
  /** Initial open lines when uncontrolled. @default [] */
  defaultExpanded?: string[];
  /** Fires with every open line id after a line opens or closes. */
  onExpandedChange?: (ids: string[]) => void;
  /** Download was pressed. Return a promise to show it working. */
  onDownload?: (invoice: DrilldownInvoice) => Async;
  /** Dispute was pressed for the invoice (line null) or for one line. */
  onDispute?: (
    invoice: DrilldownInvoice,
    line: DrilldownLineItem | null,
  ) => void;
  /** Pay was pressed. Return a promise to hold the button; a rejection is stated. */
  onPay?: (invoice: DrilldownInvoice) => Async;
  /** The moment due dates count from, in ms. @default Oct 17 2026 */
  now?: number;
  /** Whose invoices these are. @default "Fernworks · Studio plan" */
  account?: string;
  /** Whether the invoices have arrived. @default "ready" */
  status?: InvoiceDrilldownStatus;
  /** "Try again" was pressed after the invoices failed to load. */
  onRetry?: () => void;
  /** How the lines are set. @default "ruled" */
  tableStyle?: InvoiceDrilldownTableStyle;
  /** Height of a line in px; usage lines take four-fifths. @default 40 */
  rowHeight?: number;
  /** Selection, open lines and Pay: a named pigment or any CSS colour. @default "cobalt" */
  accent?: InvoiceDrilldownAccentName | (string & {});
  /** How money is written. @default Intl USD */
  formatMoney?: (amount: number) => string;
  /** Pay, Download and Dispute are unavailable; everything stays readable. @default false */
  disabled?: boolean;
  /** Classes for the viewer; it caps at 36rem tall and its panes scroll inside. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const D = (m: number, d: number) => Date.UTC(2026, m - 1, d);

export const defaultDrilldownInvoices: DrilldownInvoice[] = [
  {
    id: "inv-0142",
    number: "INV-0142",
    periodStart: D(9, 1),
    periodEnd: D(9, 30),
    issued: D(10, 1),
    due: D(10, 22),
    status: "due",
    tax: 97.37,
  },
  {
    id: "inv-0128",
    number: "INV-0128",
    periodStart: D(8, 1),
    periodEnd: D(8, 31),
    issued: D(9, 1),
    due: D(9, 30),
    status: "overdue",
    tax: 90.64,
  },
  {
    id: "inv-0115",
    number: "INV-0115",
    periodStart: D(7, 1),
    periodEnd: D(7, 31),
    issued: D(8, 1),
    due: D(8, 22),
    status: "paid",
    tax: 86.04,
    paidOn: D(8, 20),
  },
  {
    id: "inv-0109",
    number: "INV-0109",
    periodStart: D(7, 1),
    periodEnd: D(7, 31),
    issued: D(8, 1),
    due: D(8, 22),
    status: "void",
    tax: 86.04,
    note: "Issued twice; replaced by INV-0115",
  },
];

const compute = (
  invoiceId: string,
  rows: [string, number, number, number][],
): DrilldownRecord[] =>
  rows.map(([label, hours, rate, amount]) => ({
    id: `${invoiceId}-${label}`,
    label,
    detail: `${hours.toLocaleString("en-US")} h × $${rate.toFixed(2)}`,
    amount,
  }));

export const defaultDrilldownLineItems: DrilldownLineItem[] = [
  {
    id: "0142-plan",
    invoiceId: "inv-0142",
    label: "Studio plan",
    detail: "12 seats",
    amount: 545.53,
    records: [
      {
        id: "0142-plan-base",
        label: "10 seats, full month",
        detail: "10 × $49.00",
        amount: 490,
      },
      {
        id: "0142-plan-added",
        label: "2 seats from Sep 14",
        detail: "2 × $49.00 × 17/30 days",
        amount: 55.53,
      },
    ],
  },
  {
    id: "0142-compute",
    invoiceId: "inv-0142",
    label: "Compute hours",
    detail: "2,291 h",
    amount: 394.54,
    records: compute("0142", [
      ["atlas-ingest", 1204, 0.18, 216.72],
      ["render-farm", 864, 0.18, 155.52],
      ["staging", 223, 0.1, 22.3],
    ]),
  },
  {
    id: "0142-storage",
    invoiceId: "inv-0142",
    label: "Storage",
    detail: "4.6 TB-mo",
    amount: 105,
    records: [
      {
        id: "0142-hot",
        label: "Hot tier",
        detail: "1.2 TB-mo × $62.00",
        amount: 74.4,
      },
      {
        id: "0142-archive",
        label: "Archive tier",
        detail: "3.4 TB-mo × $9.00",
        amount: 30.6,
      },
    ],
  },
  {
    id: "0142-egress",
    invoiceId: "inv-0142",
    label: "Egress",
    detail: "1.8 TB",
    amount: 72,
    records: [
      {
        id: "0142-eu",
        label: "Europe",
        detail: "1.1 TB × $40.00",
        amount: 44,
      },
      {
        id: "0142-am",
        label: "Americas",
        detail: "0.7 TB × $40.00",
        amount: 28,
      },
    ],
  },
  {
    id: "0142-support",
    invoiceId: "inv-0142",
    label: "Priority support",
    detail: "Monthly",
    amount: 150,
  },
  {
    id: "0142-credit",
    invoiceId: "inv-0142",
    label: "Launch credit",
    detail: "Promotional",
    amount: -50,
  },
  {
    id: "0128-plan",
    invoiceId: "inv-0128",
    label: "Studio plan",
    detail: "10 seats",
    amount: 490,
  },
  {
    id: "0128-compute",
    invoiceId: "inv-0128",
    label: "Compute hours",
    detail: "1,988 h",
    amount: 343.12,
    records: compute("0128", [
      ["atlas-ingest", 1102, 0.18, 198.36],
      ["render-farm", 702, 0.18, 126.36],
      ["staging", 184, 0.1, 18.4],
    ]),
  },
  {
    id: "0128-storage",
    invoiceId: "inv-0128",
    label: "Storage",
    detail: "4.1 TB-mo",
    amount: 89.9,
    records: [
      {
        id: "0128-hot",
        label: "Hot tier",
        detail: "1.0 TB-mo × $62.00",
        amount: 62,
      },
      {
        id: "0128-archive",
        label: "Archive tier",
        detail: "3.1 TB-mo × $9.00",
        amount: 27.9,
      },
    ],
  },
  {
    id: "0128-egress",
    invoiceId: "inv-0128",
    label: "Egress",
    detail: "1.5 TB",
    amount: 60,
  },
  {
    id: "0128-support",
    invoiceId: "inv-0128",
    label: "Priority support",
    detail: "Monthly",
    amount: 150,
  },
  {
    id: "0115-plan",
    invoiceId: "inv-0115",
    label: "Studio plan",
    detail: "10 seats",
    amount: 490,
  },
  {
    id: "0115-compute",
    invoiceId: "inv-0115",
    label: "Compute hours",
    detail: "1,760 h",
    amount: 305.6,
    records: compute("0115", [
      ["atlas-ingest", 980, 0.18, 176.4],
      ["render-farm", 640, 0.18, 115.2],
      ["staging", 140, 0.1, 14],
    ]),
  },
  {
    id: "0115-storage",
    invoiceId: "inv-0115",
    label: "Storage",
    detail: "3.8 TB-mo",
    amount: 81.9,
  },
  {
    id: "0115-egress",
    invoiceId: "inv-0115",
    label: "Egress",
    detail: "1.2 TB",
    amount: 48,
  },
  {
    id: "0115-support",
    invoiceId: "inv-0115",
    label: "Priority support",
    detail: "Monthly",
    amount: 150,
  },
  {
    id: "0109-plan",
    invoiceId: "inv-0109",
    label: "Studio plan",
    detail: "10 seats",
    amount: 490,
  },
  {
    id: "0109-compute",
    invoiceId: "inv-0109",
    label: "Compute hours",
    detail: "1,760 h",
    amount: 305.6,
    records: compute("0109", [
      ["atlas-ingest", 980, 0.18, 176.4],
      ["render-farm", 640, 0.18, 115.2],
      ["staging", 140, 0.1, 14],
    ]),
  },
  {
    id: "0109-storage",
    invoiceId: "inv-0109",
    label: "Storage",
    detail: "3.8 TB-mo",
    amount: 81.9,
  },
  {
    id: "0109-egress",
    invoiceId: "inv-0109",
    label: "Egress",
    detail: "1.2 TB",
    amount: 48,
  },
  {
    id: "0109-support",
    invoiceId: "inv-0109",
    label: "Priority support",
    detail: "Monthly",
    amount: 150,
  },
];

const DEFAULT_NOW = Date.UTC(2026, 9, 17, 14);
const NO_LINES: string[] = [];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const defaultMoney = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
const cents = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** "Oct 22" on a fixed UTC calendar, so server and browser agree. */
const dayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};
const monthLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`;
};

/** A signed amount: credits print with a true minus, not a hyphen. */
const signed = (money: (n: number) => string, n: number) =>
  n < 0 ? `−${money(-n)}` : money(n);

/**
 * Accent as custom properties: the token for text and strokes, a pale wash
 * of it for the selected row and the traced total.
 */
const ACCENTS: Record<InvoiceDrilldownAccentName, Record<string, string>> = {
  cobalt: {
    "--id-ink": "var(--accent-bright)",
    "--id-fill": "var(--primary)",
    "--id-on": "var(--primary-foreground)",
  },
  plum: {
    "--id-ink": "oklch(from var(--accent-bright) l c 320)",
    "--id-fill": "oklch(from var(--accent-bright) 0.54 c 320)",
    "--id-on": "var(--primary-foreground)",
  },
  mint: {
    "--id-ink": "var(--success)",
    "--id-fill": "oklch(from var(--success) 0.68 c h)",
    "--id-on": "oklch(from var(--success) 0.22 0.04 h)",
  },
  ink: {
    "--id-ink": "var(--ink-2)",
    "--id-fill": "var(--foreground)",
    "--id-on": "var(--background)",
  },
};

const accentVars = (accent: string): React.CSSProperties => {
  const named = ACCENTS[accent as InvoiceDrilldownAccentName];
  const vars = named ?? {
    "--id-ink": accent,
    "--id-fill": accent,
    "--id-on": "var(--primary-foreground)",
  };
  return {
    ...vars,
    "--id-wash": "color-mix(in oklab, var(--id-ink) 12%, transparent)",
    "--id-trace": "color-mix(in oklab, var(--id-ink) 22%, transparent)",
  } as React.CSSProperties;
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const EYEBROW =
  "font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-3 uppercase";

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

const CHIP: Record<
  DrilldownInvoiceStatus,
  {
    label: string;
    className: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  paid: {
    label: "Paid",
    className:
      "bg-[color-mix(in_oklab,var(--success)_13%,transparent)] text-success",
    Icon: Check,
  },
  due: {
    label: "Due",
    className: "bg-[var(--id-wash)] text-[var(--id-ink)]",
    Icon: Clock,
  },
  overdue: {
    label: "Overdue",
    className:
      "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger",
    Icon: CircleAlert,
  },
  void: {
    label: "Void",
    className: "bg-surface-2 text-ink-3",
    Icon: Ban,
  },
};

/** Status in words with a glyph on the label's centreline — never colour alone. */
function StatusChip({
  status,
  motionSafe,
}: {
  status: DrilldownInvoiceStatus;
  motionSafe: boolean;
}) {
  const chip = CHIP[status];
  return (
    <span
      className={cn(
        "relative inline-flex h-5 shrink-0 items-center gap-1 overflow-hidden rounded-full pr-2 pl-1.5 text-[11px] leading-none font-medium transition-colors duration-300",
        chip.className,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={status}
          className="inline-flex items-center gap-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base }}
        >
          {status === "paid" ? (
            <svg
              aria-hidden
              viewBox="0 0 12 12"
              className="size-3 shrink-0"
              fill="none"
            >
              <motion.path
                d="M 2.5 6.4 L 5 8.8 L 9.5 3.6"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
          ) : (
            <chip.Icon aria-hidden className="size-3 shrink-0" />
          )}
          {chip.label}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Bar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block rounded-2 bg-surface-2 motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                 A line                                   */
/* ----------------------------------------------------------------------- */

type LineProps = {
  line: DrilldownLineItem;
  index: number;
  count: number;
  open: boolean;
  onToggle: (id: string, open: boolean) => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>, id: string) => void;
  register: (id: string, node: HTMLButtonElement | null) => void;
  tabbable: boolean;
  voided: boolean;
  tableStyle: InvoiceDrilldownTableStyle;
  rowHeight: number;
  motionSafe: boolean;
  money: (n: number) => string;
  onDispute: (() => void) | null;
  uid: string;
};

function Line({
  line,
  index,
  count,
  open,
  onToggle,
  onKey,
  register,
  tabbable,
  voided,
  tableStyle,
  rowHeight,
  motionSafe,
  money,
  onDispute,
  uid,
}: LineProps) {
  const records = line.records ?? [];
  const opens = records.length > 0;
  const regionId = `${uid}-${line.id.replace(/[^a-zA-Z0-9_-]/g, "")}-parts`;
  const bind = React.useCallback(
    (node: HTMLButtonElement | null) => register(line.id, node),
    [line.id, register],
  );
  const sum = cents(records.reduce((acc, r) => acc + r.amount, 0));
  const matches = Math.abs(sum - line.amount) < 0.005;
  const step = cascade(records.length + 1);
  const subHeight = Math.round(rowHeight * 0.8);
  // The trace lands after the last part: the parent's figure washes once.
  const [traced, setTraced] = React.useState(0);

  const cells = (
    <>
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 @min-[40rem]:col-start-auto @min-[40rem]:row-start-auto">
        {opens ? (
          <motion.span
            aria-hidden
            className="flex size-4 shrink-0 items-center justify-center text-ink-3"
            initial={false}
            animate={{ rotate: open ? 90 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <ChevronRight className="size-3.5" />
          </motion.span>
        ) : (
          <span aria-hidden className="size-4 shrink-0" />
        )}
        <span
          className={cn(
            "truncate text-[13px] leading-5",
            open ? "font-medium text-foreground" : "text-foreground",
          )}
          title={line.label}
        >
          {line.label}
        </span>
      </span>
      <span className="col-start-1 row-start-2 truncate pl-[1.375rem] text-[11px] leading-4 text-ink-3 @min-[40rem]:col-start-auto @min-[40rem]:row-start-auto @min-[40rem]:pl-0 @min-[40rem]:text-[12px] @min-[40rem]:leading-5 @min-[40rem]:text-ink-2">
        {line.detail}
        {opens ? (
          <span className="text-ink-3">
            {" "}
            · {plural(records.length, "part")}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative col-start-2 row-start-1 justify-self-end rounded-1 px-1 font-mono text-[13px] leading-5 tabular-nums @min-[40rem]:col-start-auto @min-[40rem]:row-start-auto",
          line.amount < 0 ? "text-success" : "text-foreground",
          voided && "text-ink-3 line-through",
        )}
      >
        {traced > 0 ? (
          <motion.span
            key={traced}
            aria-hidden
            className="absolute inset-0 rounded-1 bg-[var(--id-trace)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: durations.page,
              ease: easings.move,
              times: [0, 0.25, 1],
            }}
          />
        ) : null}
        <span className="relative">{signed(money, line.amount)}</span>
      </span>
    </>
  );

  const rowClass = cn(
    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-2 py-1.5 text-left",
    "@min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_6.5rem] @min-[40rem]:py-0",
  );

  return (
    <motion.li
      className={cn(
        "flex flex-col",
        tableStyle === "ruled" && "border-b border-hairline last:border-b-0",
        tableStyle === "striped" &&
          "rounded-2 odd:bg-[color-mix(in_oklab,var(--foreground)_3.5%,transparent)]",
        tableStyle === "boxed" && "rounded-3 border border-hairline bg-card",
      )}
      initial={motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              y: { ...springs.glide, delay: index * cascade(count) },
              opacity: {
                duration: durations.base,
                delay: index * cascade(count),
              },
            }
          : { duration: durations.fast }
      }
    >
      {opens ? (
        <button
          ref={bind}
          type="button"
          tabIndex={tabbable ? 0 : -1}
          aria-expanded={open}
          aria-controls={regionId}
          aria-label={`${line.label}, ${line.detail ? `${line.detail}, ` : ""}${signed(money, line.amount)}, ${plural(records.length, "part")}`}
          data-id-line=""
          onClick={() => onToggle(line.id, !open)}
          onKeyDown={(event) => onKey(event, line.id)}
          className={cn(
            rowClass,
            "rounded-2 transition-colors hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]",
            FOCUS,
            "focus-visible:-outline-offset-2",
          )}
          style={{ minHeight: rowHeight }}
        >
          {cells}
        </button>
      ) : (
        <div className={rowClass} style={{ minHeight: rowHeight }}>
          {cells}
        </div>
      )}

      {opens ? (
        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="parts"
              id={regionId}
              role="region"
              aria-label={`${line.label} breakdown`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: exitFor(durations.base),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
              className="overflow-hidden"
            >
              <div className="relative pt-0.5 pr-2 pb-2 pl-6">
                {/* The guide rule grows down from the line it explains. */}
                <motion.span
                  aria-hidden
                  className="absolute top-0 bottom-3 left-[17px] w-px bg-[var(--id-ink)] opacity-50"
                  style={{ originY: "0%" }}
                  initial={motionSafe ? { scaleY: 0 } : false}
                  animate={{ scaleY: 1 }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                />
                <ul role="list" className="flex flex-col">
                  {records.map((r, i) => (
                    <motion.li
                      key={r.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1 pl-1.5 @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_6.5rem] @min-[40rem]:py-0"
                      style={{ minHeight: subHeight }}
                      initial={
                        motionSafe
                          ? { opacity: 0, y: -distances.step }
                          : { opacity: 0 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={
                        motionSafe
                          ? {
                              y: { ...springs.glide, delay: i * step },
                              opacity: {
                                duration: durations.base,
                                delay: i * step,
                              },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <span className="flex min-w-0 flex-col @min-[40rem]:block">
                        <span className="truncate text-[12px] leading-4 text-ink-2">
                          {r.label}
                        </span>
                        {r.detail ? (
                          <span className="truncate font-mono text-[10px] leading-4 text-ink-3 tabular-nums @min-[40rem]:hidden">
                            {r.detail}
                          </span>
                        ) : null}
                      </span>
                      <span className="hidden truncate font-mono text-[11px] leading-4 text-ink-3 tabular-nums @min-[40rem]:block">
                        {r.detail}
                      </span>
                      <span
                        className={cn(
                          "justify-self-end px-1 font-mono text-[12px] leading-4 tabular-nums",
                          voided ? "text-ink-3 line-through" : "text-ink-2",
                        )}
                      >
                        {signed(money, r.amount)}
                      </span>
                    </motion.li>
                  ))}
                  <motion.li
                    className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-dashed border-hairline-strong pt-1.5 pl-1.5"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: -distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            y: {
                              ...springs.glide,
                              delay: records.length * step,
                            },
                            opacity: {
                              duration: durations.base,
                              delay: records.length * step,
                            },
                          }
                        : { duration: durations.fast }
                    }
                    onAnimationComplete={() => setTraced((t) => t + 1)}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 font-mono text-[11px] leading-4 tabular-nums",
                        matches ? "text-[var(--id-ink)]" : "text-warn",
                      )}
                    >
                      {matches ? (
                        <Check aria-hidden className="size-3 shrink-0" />
                      ) : (
                        <TriangleAlert
                          aria-hidden
                          className="size-3 shrink-0"
                        />
                      )}
                      = {signed(money, sum)}
                      <span className="text-ink-3">
                        {matches
                          ? "· matches the line"
                          : `· differs by ${money(Math.abs(cents(sum - line.amount)))}`}
                      </span>
                    </span>
                    {onDispute ? (
                      <button
                        type="button"
                        onClick={onDispute}
                        className={cn(
                          "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                          FOCUS,
                        )}
                      >
                        <Flag aria-hidden className="size-3" />
                        Question this charge
                      </button>
                    ) : null}
                  </motion.li>
                </ul>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Busy = { kind: "pay" | "download"; id: string } | null;

/**
 * An invoice viewer: the list of invoices on one side and the chosen one in
 * full on the other — its status, dates, actions, every line and the totals.
 * A line that was metered opens to show the usage records that made it, so
 * any figure on the invoice can be traced to its parts.
 *
 * The signature is the trace. Opening a line grows its region to the
 * measured height on `springs.glide` while its parts slide down from 8px a
 * `cascade()` apart on the same spring and a guide rule grows down the left
 * edge from the line it explains; the sum lands last — "= $394.54 · matches
 * the line", or what it differs by — and the line's own figure takes one
 * accent wash, so the eye runs from the total to its parts and back.
 * Closing leaves on the exit ease. The chevron turns on `springs.snap`, the
 * list's selection slides between invoices on snap, and a paid invoice's
 * tick draws on `springs.flick`.
 *
 * The invoice list is a listbox (arrows, Home, End). Each line that opens is
 * a native button: Enter or Space toggles it, Up and Down walk the lines,
 * Right opens and Left closes. Paid, due, overdue and void are chips with a
 * glyph and a word; void lines are struck. Pay and Download hold their
 * buttons while a promise runs. Loading shows ruled placeholder lines, and
 * at phone widths the list becomes a strip and the lines become cards.
 * Under reduced motion regions open in place and parts appear together.
 */
export function InvoiceDrilldown({
  invoices = defaultDrilldownInvoices,
  lineItems = defaultDrilldownLineItems,
  value: valueProp,
  defaultValue,
  onValueChange,
  expanded: expandedProp,
  defaultExpanded = NO_LINES,
  onExpandedChange,
  onDownload,
  onDispute,
  onPay,
  now = DEFAULT_NOW,
  account = "Fernworks · Studio plan",
  status = "ready",
  onRetry,
  tableStyle = "ruled",
  rowHeight = 40,
  accent = "cobalt",
  formatMoney = defaultMoney,
  disabled = false,
  className,
}: InvoiceDrilldownProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const rowH = Math.round(clamp(rowHeight, 28, 64));

  const [ownValue, setOwnValue] = React.useState(
    defaultValue ?? invoices[0]?.id ?? "",
  );
  const selectedId = valueProp ?? ownValue;
  const [ownExpanded, setOwnExpanded] = React.useState(defaultExpanded);
  const expanded = expandedProp ?? ownExpanded;
  // Outcomes the host has not caught up with yet: a payment that landed.
  const [paidHere, setPaidHere] = React.useState<Record<string, number>>({});
  const [busy, setBusy] = React.useState<Busy>(null);
  const [downloaded, setDownloaded] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<{
    id: string;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const attempt = React.useRef(0);

  const list = invoices.map((inv) =>
    paidHere[inv.id] !== undefined && inv.status !== "paid"
      ? { ...inv, status: "paid" as const, paidOn: paidHere[inv.id] }
      : inv,
  );
  const invoice = list.find((inv) => inv.id === selectedId) ?? list[0] ?? null;
  const lines = invoice
    ? lineItems.filter((l) => l.invoiceId === invoice.id)
    : [];
  const totals = (inv: DrilldownInvoice) => {
    const own = lineItems.filter((l) => l.invoiceId === inv.id);
    const charges = cents(
      own.reduce((acc, l) => acc + Math.max(0, l.amount), 0),
    );
    const credits = cents(
      own.reduce((acc, l) => acc + Math.min(0, l.amount), 0),
    );
    return {
      charges,
      credits,
      total: cents(charges + credits + inv.tax),
    };
  };

  /* ------------------------------- actions ------------------------------- */

  const choose = (id: string) => {
    if (id === selectedId) return;
    if (valueProp === undefined) setOwnValue(id);
    onValueChange?.(id);
    setFailure(null);
    const inv = list.find((x) => x.id === id);
    if (inv) {
      setAnnouncement(
        `${inv.number}, ${monthLabel(inv.periodStart)}, ${CHIP[inv.status].label}, ${formatMoney(totals(inv).total)}.`,
      );
    }
  };

  const toggle = (id: string, open: boolean) => {
    const next = open
      ? [...expanded.filter((x) => x !== id), id]
      : expanded.filter((x) => x !== id);
    if (expandedProp === undefined) setOwnExpanded(next);
    onExpandedChange?.(next);
    const line = lineItems.find((l) => l.id === id);
    if (line && open) {
      setAnnouncement(
        `${line.label} opened: ${plural(line.records?.length ?? 0, "part")}.`,
      );
    }
  };

  const runAsync = (
    kind: "pay" | "download",
    inv: DrilldownInvoice,
    call: ((invoice: DrilldownInvoice) => Async) | undefined,
  ) => {
    if (disabled || busy) return;
    const run = ++attempt.current;
    setFailure(null);
    setBusy({ kind, id: inv.id });
    setAnnouncement(
      kind === "pay"
        ? `Paying ${inv.number}.`
        : `Preparing ${inv.number} for download.`,
    );
    const land = () => {
      if (attempt.current !== run) return;
      setBusy(null);
      if (kind === "pay") {
        setPaidHere((p) => ({ ...p, [inv.id]: now }));
        setAnnouncement(
          `${inv.number} paid. ${formatMoney(totals(inv).total)}.`,
        );
      } else {
        setDownloaded(inv.id);
        setAnnouncement(`${inv.number} downloaded.`);
      }
    };
    const result = call?.(inv);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<unknown>).then(land, (reason: unknown) => {
        if (attempt.current !== run) return;
        const message =
          reason instanceof Error && reason.message
            ? reason.message
            : kind === "pay"
              ? "The payment didn't go through."
              : "The download didn't start.";
        setBusy(null);
        setFailure({ id: inv.id, message });
        setAnnouncement(message);
      });
    } else {
      land();
    }
  };

  // The download tick stays a moment, then the button reads Download again.
  React.useEffect(() => {
    if (!downloaded) return;
    const t = window.setTimeout(() => setDownloaded(null), 1600);
    return () => window.clearTimeout(t);
  }, [downloaded]);

  /* ------------------------------- keyboard ------------------------------ */

  const lineRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const register = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) lineRefs.current.set(id, node);
      else lineRefs.current.delete(id);
    },
    [],
  );
  const openable = lines.filter((l) => (l.records?.length ?? 0) > 0);
  const [activeLine, setActiveLine] = React.useState<string | null>(null);
  const roving =
    activeLine && openable.some((l) => l.id === activeLine)
      ? activeLine
      : (openable[0]?.id ?? null);

  const lineKeys = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const i = openable.findIndex((l) => l.id === id);
    const isOpen = expanded.includes(id);
    let next = -1;
    if (event.key === "ArrowDown") next = Math.min(openable.length - 1, i + 1);
    else if (event.key === "ArrowUp") next = Math.max(0, i - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = openable.length - 1;
    else if (event.key === "ArrowRight" && !isOpen) {
      event.preventDefault();
      toggle(id, true);
      return;
    } else if (event.key === "ArrowLeft" && isOpen) {
      event.preventDefault();
      toggle(id, false);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    const target = openable[next];
    if (!target) return;
    setActiveLine(target.id);
    lineRefs.current.get(target.id)?.focus();
  };

  const listKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const i = list.findIndex((inv) => inv.id === invoice?.id);
    let next = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight")
      next = Math.min(list.length - 1, i + 1);
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft")
      next = Math.max(0, i - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = list.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = list[next];
    if (!target) return;
    choose(target.id);
    event.currentTarget
      .querySelectorAll<HTMLElement>("[role=option]")
      [next]?.focus();
  };

  /* -------------------------------- render ------------------------------- */

  const dueLine = (inv: DrilldownInvoice) => {
    if (inv.status === "void") return inv.note ?? "Voided";
    if (inv.status === "paid") return `Paid ${dayLabel(inv.paidOn ?? inv.due)}`;
    // Calendar days from today, not hours: due on the 22nd is five days
    // away all through the 17th.
    const days = Math.round((inv.due - Math.floor(now / DAY) * DAY) / DAY);
    if (inv.status === "overdue" || days < 0)
      return `Was due ${dayLabel(inv.due)} · ${plural(Math.abs(days), "day")} overdue`;
    return days === 0
      ? `Due today`
      : `Due ${dayLabel(inv.due)} · in ${plural(days, "day")}`;
  };

  const listbox = (
    <div
      role="listbox"
      aria-label="Invoices"
      onKeyDown={listKeys}
      className={cn(
        "flex [scrollbar-width:none] gap-1.5 overflow-x-auto overscroll-contain px-4 pb-3",
        "[mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]",
        "@min-[40rem]:flex-col @min-[40rem]:overflow-x-visible @min-[40rem]:overflow-y-auto @min-[40rem]:[mask-image:none] @min-[40rem]:px-2 @min-[40rem]:py-2",
      )}
    >
      {list.map((inv) => {
        const selected = inv.id === invoice?.id;
        const t = totals(inv);
        return (
          <div
            key={inv.id}
            role="option"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => choose(inv.id)}
            className={cn(
              "relative flex w-44 shrink-0 cursor-pointer flex-col gap-1 rounded-3 px-3 py-2.5 text-left transition-colors @min-[40rem]:w-auto",
              FOCUS,
              selected
                ? "text-foreground"
                : "text-ink-2 hover:bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]",
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`${uid}-selected`}
                aria-hidden
                className="absolute inset-0 rounded-3 border border-hairline-strong bg-card"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              >
                <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full bg-[var(--id-ink)]" />
              </motion.span>
            ) : null}
            <span className="relative flex items-center justify-between gap-2">
              <span className="font-mono text-[12px] leading-5 font-medium whitespace-nowrap tabular-nums">
                {inv.number}
              </span>
              <StatusChip status={inv.status} motionSafe={motionSafe} />
            </span>
            <span className="relative flex items-baseline justify-between gap-2 text-[11px] leading-4">
              <span className="truncate text-ink-3">
                {monthLabel(inv.periodStart)}
              </span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  inv.status === "void" && "text-ink-3 line-through",
                )}
              >
                {formatMoney(t.total)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );

  const detail = (() => {
    if (!invoice) return null;
    const t = totals(invoice);
    const voided = invoice.status === "void";
    const payable = invoice.status === "due" || invoice.status === "overdue";
    const paying = busy?.kind === "pay" && busy.id === invoice.id;
    const loadingPdf = busy?.kind === "download" && busy.id === invoice.id;
    const failed = failure?.id === invoice.id ? failure.message : null;
    const action = cn(
      "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-[12px] whitespace-nowrap transition-[background-color,opacity,translate] active:translate-y-px",
      FOCUS,
    );
    return (
      <motion.div
        key={invoice.id}
        className="flex flex-col gap-4"
        initial={
          motionSafe ? { opacity: 0, y: distances.nudge } : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? { y: springs.glide, opacity: { duration: durations.base } }
            : { duration: durations.fast }
        }
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-[15px] leading-6 font-semibold tabular-nums">
                {invoice.number}
              </h3>
              <StatusChip status={invoice.status} motionSafe={motionSafe} />
            </div>
            <p className="text-[12px] leading-4 text-ink-3">
              {dayLabel(invoice.periodStart)} – {dayLabel(invoice.periodEnd)} ·
              issued {dayLabel(invoice.issued)}
            </p>
            <p
              className={cn(
                "text-[12px] leading-4",
                invoice.status === "overdue" ? "text-danger" : "text-ink-2",
              )}
            >
              {dueLine(invoice)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => runAsync("download", invoice, onDownload)}
              aria-disabled={disabled || undefined}
              aria-busy={loadingPdf || undefined}
              aria-label={`Download ${invoice.number}`}
              className={cn(
                action,
                "border border-hairline text-foreground hover:bg-surface-2",
                disabled && "opacity-50",
              )}
            >
              {loadingPdf ? (
                <LoaderCircle
                  aria-hidden
                  className="size-3.5 motion-safe:animate-spin"
                />
              ) : downloaded === invoice.id ? (
                <Check aria-hidden className="size-3.5 text-success" />
              ) : (
                <Download aria-hidden className="size-3.5" />
              )}
              PDF
            </button>
            {!voided ? (
              <button
                type="button"
                onClick={() => {
                  if (disabled) return;
                  onDispute?.(invoice, null);
                  setAnnouncement(`Dispute started for ${invoice.number}.`);
                }}
                aria-disabled={disabled || undefined}
                className={cn(
                  action,
                  "border border-hairline text-foreground hover:bg-surface-2",
                  disabled && "opacity-50",
                )}
              >
                <Flag aria-hidden className="size-3.5" />
                Dispute
              </button>
            ) : null}
            {payable ? (
              <button
                type="button"
                onClick={() => runAsync("pay", invoice, onPay)}
                aria-disabled={disabled || paying || undefined}
                aria-busy={paying || undefined}
                className={cn(
                  action,
                  "bg-[var(--id-fill)] font-medium text-[var(--id-on)] hover:opacity-90",
                  disabled && "opacity-50",
                )}
              >
                {paying ? (
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 motion-safe:animate-spin"
                  />
                ) : (
                  <CreditCard aria-hidden className="size-3.5" />
                )}
                <span className="tabular-nums">
                  {paying ? "Paying…" : `Pay ${formatMoney(t.total)}`}
                </span>
              </button>
            ) : null}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {failed ? (
            <motion.p
              key="failed"
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{
                opacity: 0,
                height: 0,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: 0 }
              }
              className="-mt-1 overflow-hidden"
            >
              <span className="flex items-start gap-2 rounded-2 bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] px-3 py-2 text-[12px] leading-4 text-danger">
                <TriangleAlert
                  aria-hidden
                  className="mt-px size-3.5 shrink-0"
                />
                {failed}
              </span>
            </motion.p>
          ) : null}
        </AnimatePresence>

        <div className="flex flex-col">
          <div
            aria-hidden
            className={cn(
              EYEBROW,
              "hidden gap-x-3 border-b border-hairline px-2 pb-1.5 @min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_6.5rem]",
            )}
          >
            <span className="pl-[1.375rem]">Item</span>
            <span>Usage</span>
            <span className="px-1 text-right">Amount</span>
          </div>
          <ul
            role="list"
            aria-label={`${invoice.number} lines`}
            className={cn(
              "flex flex-col",
              tableStyle === "boxed" && "gap-1.5 pt-2",
              tableStyle === "striped" && "pt-1",
            )}
          >
            {lines.map((line, i) => (
              <Line
                key={line.id}
                line={line}
                index={i}
                count={lines.length}
                open={expanded.includes(line.id)}
                onToggle={toggle}
                onKey={lineKeys}
                register={register}
                tabbable={roving === line.id}
                voided={voided}
                tableStyle={tableStyle}
                rowHeight={rowH}
                motionSafe={motionSafe}
                money={formatMoney}
                onDispute={
                  voided || disabled
                    ? null
                    : () => {
                        onDispute?.(invoice, line);
                        setAnnouncement(
                          `Question raised on ${line.label}, ${invoice.number}.`,
                        );
                      }
                }
                uid={uid}
              />
            ))}
          </ul>
        </div>

        <dl className="ml-auto flex w-full max-w-72 flex-col gap-1 border-t border-hairline pt-3 text-[12px] leading-5">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">Subtotal</dt>
            <dd className="font-mono tabular-nums">{formatMoney(t.charges)}</dd>
          </div>
          {t.credits < 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-3">Credits</dt>
              <dd className="font-mono text-success tabular-nums">
                {signed(formatMoney, t.credits)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">Tax</dt>
            <dd className="font-mono tabular-nums">
              {formatMoney(invoice.tax)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-hairline pt-1 text-[13px] font-medium">
            <dt>Total</dt>
            <dd
              className={cn(
                "font-mono tabular-nums",
                voided && "text-ink-3 line-through",
              )}
            >
              {formatMoney(t.total)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-3">
              {invoice.status === "paid"
                ? "Paid"
                : voided
                  ? "Nothing due"
                  : "Amount due"}
            </dt>
            <dd
              className={cn(
                "font-mono tabular-nums",
                invoice.status === "overdue" && "text-danger",
                invoice.status === "paid" && "text-success",
              )}
            >
              {voided ? formatMoney(0) : formatMoney(t.total)}
            </dd>
          </div>
        </dl>
      </motion.div>
    );
  })();

  const placeholder = (
    <div aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Loading invoices.</span>
      <div className="flex flex-col gap-2">
        <Bar className="h-5 w-32" />
        <Bar className="h-3.5 w-48" />
      </div>
      <div className="flex flex-col">
        {[62, 48, 55, 40, 50].map((w) => (
          <div
            key={w}
            aria-hidden
            className="flex items-center justify-between gap-6 border-b border-hairline px-2"
            style={{ height: rowH }}
          >
            <span
              className="block h-3 rounded-2 bg-surface-2 motion-safe:animate-pulse"
              style={{ width: `${w}%` }}
            />
            <Bar className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );

  const body =
    status === "error" ? (
      <div className="m-4 flex flex-col items-center gap-2 rounded-3 border border-hairline px-4 py-6 text-center">
        <TriangleAlert aria-hidden className="size-4 text-danger" />
        <p className="text-[13px] leading-5 text-foreground">
          The invoices didn&apos;t load.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : status === "empty" || (status === "ready" && list.length === 0) ? (
      <div className="m-4 flex flex-col items-center gap-1.5 rounded-3 border border-dashed border-hairline-strong px-4 py-8 text-center">
        <Receipt aria-hidden className="size-4 text-ink-3" />
        <p className="text-[13px] leading-5 text-foreground">
          No invoices yet.
        </p>
        <p className="text-[12px] leading-4 text-ink-3">
          The first one arrives at the end of your first period.
        </p>
      </div>
    ) : (
      <div className="flex flex-1 flex-col overflow-hidden @min-[40rem]:grid @min-[40rem]:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="shrink-0 @min-[40rem]:overflow-y-auto @min-[40rem]:border-r @min-[40rem]:border-hairline">
          {status === "loading" ? (
            <div
              aria-hidden
              className="flex gap-1.5 px-4 pb-3 @min-[40rem]:flex-col @min-[40rem]:px-2 @min-[40rem]:py-2"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-14 w-44 shrink-0 rounded-3 bg-surface-2 motion-safe:animate-pulse @min-[40rem]:w-auto"
                />
              ))}
            </div>
          ) : (
            listbox
          )}
        </div>
        <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain border-t border-hairline px-4 py-4 @min-[40rem]:border-t-0 @min-[40rem]:px-5">
          {status === "loading" ? (
            placeholder
          ) : (
            // The first invoice is drawn as it stands (no entrance on the
            // server's frame); a newly chosen one fades in with its lines.
            <AnimatePresence initial={false}>{detail}</AnimatePresence>
          )}
        </div>
      </div>
    );

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <header className="flex shrink-0 items-center gap-2.5 px-4 pt-4 pb-3 @min-[40rem]:border-b @min-[40rem]:border-hairline">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--id-wash)] text-[var(--id-ink)]"
        >
          <Receipt className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2
            id={titleId}
            className="truncate text-[15px] leading-5 font-semibold"
          >
            Invoices
          </h2>
          <p className="truncate text-[12px] leading-4 text-ink-3">{account}</p>
        </div>
      </header>
      {body}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
