"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  FileText,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  Upload,
  X,
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

export type GhostCellKind = "text" | "mono" | "money" | "date" | "status";
export type GhostTone = "success" | "warn" | "danger" | "accent" | "ink";

export type GhostColumn = {
  id: string;
  /** The header, e.g. "Customer". */
  label: string;
  /** How a cell is set: plain text, a mono reference, right-aligned money, a date, or a status with a dot. @default "text" */
  kind?: GhostCellKind;
  /** The column's grid track, e.g. "6rem" or "minmax(0,1.4fr)". @default by kind */
  width?: string;
  /** "wide" columns are hidden below a 40rem container. @default "always" */
  show?: "always" | "wide";
  /** For a status column: the dot's tone per value. */
  tones?: Record<string, GhostTone>;
  /** Values the editor offers in a select; free text otherwise. */
  options?: string[];
};

/** One row; `cells` maps a column id to the text it shows. */
export type GhostRow = { id: string; cells: Record<string, string> };

export type GhostChangeKind =
  "create" | "edit" | "delete" | "sample" | "import";

export type GhostChange = {
  kind: GhostChangeKind;
  /** The rows the change added, replaced or removed. */
  rows: GhostRow[];
};

export type GhostStyle = "ink" | "outline" | "dashed";
export type GhostDensity = "compact" | "cozy" | "roomy";
export type GhostStatus = "ready" | "loading" | "error";

export type GhostRowsProps = {
  /** The columns, in order. @default defaultGhostColumns */
  columns?: GhostColumn[];
  /** Controlled rows. */
  rows?: GhostRow[];
  /** Initial rows when uncontrolled. @default [] */
  defaultRows?: GhostRow[];
  /** Fires with every row after a create, edit, delete, sample load or import. */
  onChange?: (rows: GhostRow[], change: GhostChange) => void;
  /** The example rows drawn in ghost ink while the table is empty. @default defaultGhostRows */
  ghostRows?: GhostRow[];
  /** How many of them are drawn, 2 to 6. @default 3 */
  ghostCount?: number;
  /** How a ghost is drawn: in ghost ink alone, each value in a hairline box, or as a dashed row. @default "ink" */
  ghostStyle?: GhostStyle;
  /** Row height and type size. @default "cozy" */
  density?: GhostDensity;
  /** What "Load sample data" pours in. @default defaultSampleRows */
  sampleRows?: GhostRow[];
  /** Turns a dropped file into rows, reporting progress from 0 to 1 as it goes. Without it the file is read as a CSV whose header names the columns. */
  onImport?: (
    file: File,
    report: (fraction: number) => void,
  ) => Promise<GhostRow[]> | GhostRow[];
  /** Whether the rows have arrived. @default "ready" */
  status?: GhostStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Invoices" */
  title?: string;
  /** What one row is called. @default { one: "invoice", other: "invoices" } */
  noun?: { one: string; other: string };
  /** The line over the ghosts. @default "This is what your invoices will look like" */
  note?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the rows scroll inside it. @default 520 */
  height?: number;
  /** Read only: nothing can be added, edited or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const STATUS_TONES: Record<string, GhostTone> = {
  Draft: "ink",
  Sent: "accent",
  Paid: "success",
  Overdue: "danger",
  Void: "warn",
};

/** Coldbrook's invoice columns. */
export const defaultGhostColumns: GhostColumn[] = [
  { id: "number", label: "Invoice", kind: "mono", width: "5.5rem" },
  {
    id: "customer",
    label: "Customer",
    kind: "text",
    width: "minmax(0,1.6fr)",
  },
  { id: "issued", label: "Issued", kind: "date", width: "6rem", show: "wide" },
  { id: "due", label: "Due", kind: "date", width: "6rem" },
  { id: "amount", label: "Amount", kind: "money", width: "6rem" },
  {
    id: "status",
    label: "Status",
    kind: "status",
    width: "6rem",
    show: "wide",
    options: ["Draft", "Sent", "Paid", "Overdue", "Void"],
    tones: STATUS_TONES,
  },
];

const row = (
  id: string,
  number: string,
  customer: string,
  issued: string,
  due: string,
  amount: string,
  status: string,
): GhostRow => ({
  id,
  cells: { number, customer, issued, due, amount, status },
});

/** Six example invoices, written the way real ones would be. */
export const defaultGhostRows: GhostRow[] = [
  row(
    "g1",
    "INV-0001",
    "Fernmoor Dairy",
    "12 Oct 2026",
    "11 Nov 2026",
    "$1,240.00",
    "Draft",
  ),
  row(
    "g2",
    "INV-0002",
    "Basinworks Ltd",
    "12 Oct 2026",
    "26 Oct 2026",
    "$860.50",
    "Sent",
  ),
  row(
    "g3",
    "INV-0003",
    "Harrow & Vale",
    "13 Oct 2026",
    "12 Nov 2026",
    "$3,015.00",
    "Paid",
  ),
  row(
    "g4",
    "INV-0004",
    "Gaugeworks Pay",
    "14 Oct 2026",
    "28 Oct 2026",
    "$412.00",
    "Overdue",
  ),
  row(
    "g5",
    "INV-0005",
    "Ridgeline Books",
    "15 Oct 2026",
    "14 Nov 2026",
    "$2,180.00",
    "Sent",
  ),
  row(
    "g6",
    "INV-0006",
    "Lantern Street Cafe",
    "16 Oct 2026",
    "30 Oct 2026",
    "$96.00",
    "Paid",
  ),
];

/** Nine Coldbrook invoices from early October. */
export const defaultSampleRows: GhostRow[] = [
  row(
    "inv-2041",
    "INV-2041",
    "Fernmoor Dairy",
    "02 Oct 2026",
    "01 Nov 2026",
    "$1,980.00",
    "Sent",
  ),
  row(
    "inv-2042",
    "INV-2042",
    "Basinworks Ltd",
    "03 Oct 2026",
    "17 Oct 2026",
    "$4,250.00",
    "Paid",
  ),
  row(
    "inv-2043",
    "INV-2043",
    "Harrow & Vale",
    "03 Oct 2026",
    "02 Nov 2026",
    "$730.25",
    "Sent",
  ),
  row(
    "inv-2044",
    "INV-2044",
    "Saltmarsh Studio",
    "05 Oct 2026",
    "19 Oct 2026",
    "$1,115.00",
    "Overdue",
  ),
  row(
    "inv-2045",
    "INV-2045",
    "Ridgeline Books",
    "06 Oct 2026",
    "05 Nov 2026",
    "$2,640.00",
    "Draft",
  ),
  row(
    "inv-2046",
    "INV-2046",
    "Lantern Street Cafe",
    "07 Oct 2026",
    "21 Oct 2026",
    "$188.00",
    "Paid",
  ),
  row(
    "inv-2047",
    "INV-2047",
    "Northwick Rowing Club",
    "08 Oct 2026",
    "07 Nov 2026",
    "$560.00",
    "Sent",
  ),
  row(
    "inv-2048",
    "INV-2048",
    "Pellworth Garage",
    "09 Oct 2026",
    "23 Oct 2026",
    "$3,402.50",
    "Sent",
  ),
  row(
    "inv-2049",
    "INV-2049",
    "Mill Lane Florist",
    "10 Oct 2026",
    "09 Nov 2026",
    "$245.00",
    "Draft",
  ),
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const ROW_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const TONES: Record<GhostTone, string> = {
  success: "var(--success)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  accent: "var(--accent-bright)",
  ink: "var(--ink-3)",
};

const DENSITY: Record<
  GhostDensity,
  { row: string; text: string; cell: string; head: string }
> = {
  compact: {
    row: "min-h-8",
    text: "text-[12px]",
    cell: "px-2 py-1",
    head: "h-7",
  },
  cozy: {
    row: "min-h-10",
    text: "text-[13px]",
    cell: "px-2.5 py-1.5",
    head: "h-8",
  },
  roomy: {
    row: "min-h-12",
    text: "text-[13px]",
    cell: "px-3 py-2.5",
    head: "h-9",
  },
};

const ACTIONS_TRACK = "3.75rem";
const MAX_CASCADE = 14;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const slotKey = (i: number) => `slot-${i}`;
const slotIndex = (key: string) =>
  key.startsWith("slot-") ? Number(key.slice(5)) : null;

const trackOf = (col: GhostColumn) => {
  if (col.width) return col.width;
  if (col.kind === "money" || col.kind === "date" || col.kind === "status")
    return "6rem";
  if (col.kind === "mono") return "5.5rem";
  return "minmax(0,1fr)";
};

const plural = (n: number, noun: { one: string; other: string }) =>
  `${n} ${n === 1 ? noun.one : noun.other}`;

/** Splits CSV text into rows of fields, honouring quotes and doubled quotes. */
const splitCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? "";
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      fields.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      fields.push(field);
      rows.push(fields);
      fields = [];
      field = "";
    } else field += ch;
  }
  if (field.length > 0 || fields.length > 0) {
    fields.push(field);
    rows.push(fields);
  }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
};

/**
 * Reads CSV text as rows. A header that names the columns (by id or label,
 * any case) maps fields to them; without one, fields fall into column order.
 */
export const parseGhostCsv = (
  text: string,
  columns: GhostColumn[],
  idPrefix = "csv",
): GhostRow[] => {
  const lines = splitCsv(text);
  const head = lines[0];
  if (!head) return [];
  const norm = (s: string) => s.trim().toLowerCase();
  const mapped = head.map(
    (h) =>
      columns.find((c) => norm(c.id) === norm(h) || norm(c.label) === norm(h))
        ?.id ?? null,
  );
  const hasHeader = mapped.some((m) => m !== null);
  const body = hasHeader ? lines.slice(1) : lines;
  return body.map((fields, i) => {
    const cells: Record<string, string> = {};
    fields.forEach((value, j) => {
      const id = hasHeader ? mapped[j] : columns[j]?.id;
      if (id) cells[id] = value.trim();
    });
    return { id: `${idPrefix}-${i + 1}`, cells };
  });
};

type Landing = { kind: "solidify" | "recoil" | "rise"; delay: number };

/* ----------------------------------------------------------------------- */
/*                                   Cells                                  */
/* ----------------------------------------------------------------------- */

function CellText({
  column,
  value,
  ghost,
  ghostStyle,
}: {
  column: GhostColumn;
  value: string;
  ghost: boolean;
  ghostStyle: GhostStyle;
}) {
  const kind = column.kind ?? "text";
  const tone = kind === "status" ? column.tones?.[value] : undefined;
  const boxed = ghost && ghostStyle === "outline";
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1.5",
        (kind === "mono" || kind === "money" || kind === "date") &&
          "font-mono tabular-nums",
        kind === "money" && "justify-end",
        kind === "mono" && !ghost && "text-ink-2",
        kind === "date" && !ghost && "text-ink-2",
        boxed && "rounded-1 border border-hairline-strong px-1 leading-5",
        ghost ? "text-(--gr-ghost)" : "",
      )}
    >
      {kind === "status" ? (
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full"
          style={{
            background: ghost ? "var(--gr-ghost)" : TONES[tone ?? "ink"],
          }}
        />
      ) : null}
      <span className="truncate">{value || " "}</span>
    </span>
  );
}

function Cells({
  columns,
  source,
  ghost,
  ghostStyle,
  density,
  activeCol,
}: {
  columns: GhostColumn[];
  source: GhostRow;
  ghost: boolean;
  ghostStyle: GhostStyle;
  density: GhostDensity;
  activeCol: number | null;
}) {
  const d = DENSITY[density];
  return (
    <>
      {columns.map((col, j) => (
        <span
          key={col.id}
          role={ghost ? undefined : "gridcell"}
          aria-colindex={ghost ? undefined : j + 1}
          className={cn(
            "flex min-w-0 items-center",
            col.kind === "money" && "justify-end",
            col.show === "wide" ? "hidden @min-[40rem]:flex" : "flex",
            d.cell,
            d.text,
            activeCol === j && "rounded-1 bg-cobalt-wash",
          )}
        >
          <CellText
            column={col}
            value={source.cells[col.id] ?? ""}
            ghost={ghost}
            ghostStyle={ghostStyle}
          />
        </span>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

const GRID =
  "grid grid-cols-(--gr-cols-narrow) items-stretch @min-[40rem]:grid-cols-(--gr-cols)";

const layerVariants = {
  gone: (delay: number) => ({
    opacity: 0,
    transition: { ...exitFor(durations.base), delay },
  }),
};

type RowProps = {
  /** Forwarded so AnimatePresence can measure the row when it pops out. */
  ref?: React.Ref<HTMLDivElement>;
  item: { key: string; row: GhostRow | null; ghost: GhostRow | null };
  /** Position in the list, for the ghosts' own stagger. */
  index: number;
  /** The row's aria-rowindex. */
  rowIndex: number;
  columns: GhostColumn[];
  ghostStyle: GhostStyle;
  density: GhostDensity;
  motionSafe: boolean;
  live: boolean;
  landing: Landing | undefined;
  editing: boolean;
  active: boolean;
  focused: boolean;
  activeCol: number | null;
  inert: boolean;
  noun: { one: string; other: string };
  nodeRef: (node: HTMLDivElement | null) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
  renderEditor: () => React.ReactNode;
};

function Row({
  ref,
  item,
  index,
  rowIndex,
  columns,
  ghostStyle,
  density,
  motionSafe,
  live,
  landing,
  editing,
  active,
  focused,
  activeCol,
  inert,
  noun,
  nodeRef,
  onFocus,
  onBlur,
  onKeyDown,
  onEdit,
  onDelete,
  renderEditor,
}: RowProps) {
  const d = DENSITY[density];
  const real = item.row;
  const ghost = item.ghost;
  const inSlot = slotIndex(item.key) !== null;
  const recoils = landing?.kind === "recoil";
  // Ghosts returning after the last row went stagger on their own.
  const delay = motionSafe
    ? (landing?.delay ?? (real ? 0 : r3(index * cascade(4))))
    : 0;

  const layerTransition = motionSafe
    ? {
        opacity: { ...springs.glide, delay },
        y: { ...(recoils ? springs.recoil : springs.glide), delay },
      }
    : { duration: durations.fast };

  const first = columns[0];
  const name = real
    ? `${real.cells[first?.id ?? ""] || noun.one}, ${columns
        .slice(1)
        .map((c) => `${c.label} ${real.cells[c.id] || "blank"}`)
        .join(", ")}`
    : undefined;

  return (
    <motion.div
      ref={(node) => {
        nodeRef(node);
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      role={real ? "row" : "presentation"}
      aria-hidden={real ? undefined : true}
      aria-rowindex={real ? rowIndex : undefined}
      aria-selected={real ? active : undefined}
      aria-label={real && !editing ? name : undefined}
      tabIndex={real && !editing ? (active ? 0 : -1) : undefined}
      onFocus={real ? onFocus : undefined}
      onBlur={real ? onBlur : undefined}
      onKeyDown={real && !editing ? onKeyDown : undefined}
      layout={motionSafe ? "position" : false}
      initial={
        live && real && !inSlot
          ? { opacity: 0, y: motionSafe ? distances.step : 0 }
          : false
      }
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        layout: springs.glide,
        y: motionSafe ? { ...springs.glide, delay } : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter, delay },
      }}
      className={cn(
        "group relative w-full",
        real
          ? "border-b border-hairline transition-colors duration-300"
          : ghostStyle === "dashed"
            ? "my-0.5 rounded-2 border border-dashed border-hairline-strong"
            : "border-b border-dashed border-(--gr-ghost-line)",
        real && !editing && "hover:bg-surface-1",
        real && focused && "bg-surface-1",
        real && ROW_RING,
      )}
    >
      <AnimatePresence initial={false} mode="popLayout" custom={delay}>
        {real ? (
          editing ? (
            <motion.div
              key="editor"
              role="gridcell"
              aria-colspan={columns.length + 1}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
            >
              {renderEditor()}
            </motion.div>
          ) : (
            <motion.div
              key={`real-${real.id}`}
              className={cn(GRID, d.row)}
              initial={{
                opacity: 0,
                y: motionSafe && recoils ? -distances.step : 0,
              }}
              animate={{ opacity: 1, y: 0 }}
              variants={layerVariants}
              exit="gone"
              transition={layerTransition}
            >
              <Cells
                columns={columns}
                source={real}
                ghost={false}
                ghostStyle={ghostStyle}
                density={density}
                activeCol={focused ? activeCol : null}
              />
              <span
                role="gridcell"
                aria-colindex={columns.length + 1}
                className="flex items-center justify-end gap-0.5 pr-1.5"
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Edit ${real.cells[first?.id ?? ""] ?? noun.one}`}
                  aria-disabled={inert || undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit();
                  }}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                    inert && "cursor-not-allowed",
                    FOCUS_RING,
                  )}
                >
                  <Pencil aria-hidden className="size-3" />
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={`Delete ${real.cells[first?.id ?? ""] ?? noun.one}`}
                  aria-disabled={inert || undefined}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete();
                  }}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger",
                    inert && "cursor-not-allowed",
                    FOCUS_RING,
                  )}
                >
                  <Trash2 aria-hidden className="size-3" />
                </button>
              </span>
            </motion.div>
          )
        ) : ghost ? (
          <motion.div
            key="ghost"
            className={cn(GRID, d.row)}
            initial={live ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            variants={layerVariants}
            exit="gone"
            transition={{
              duration: durations.slow,
              ease: easings.enter,
              delay,
            }}
          >
            <Cells
              columns={columns}
              source={ghost}
              ghost
              ghostStyle={ghostStyle}
              density={density}
              activeCol={null}
            />
            <span aria-hidden />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Editor                                  */
/* ----------------------------------------------------------------------- */

type EditorProps = {
  columns: GhostColumn[];
  initial: Record<string, string>;
  placeholders: Record<string, string>;
  heading: string;
  noun: { one: string; other: string };
  density: GhostDensity;
  onSave: (cells: Record<string, string>) => void;
  onCancel: () => void;
};

function Editor({
  columns,
  initial,
  placeholders,
  heading,
  noun,
  density,
  onSave,
  onCancel,
}: EditorProps) {
  const uid = React.useId();
  const [cells, setCells] = React.useState<Record<string, string>>(initial);
  const [invalid, setInvalid] = React.useState(false);
  const firstRef = React.useRef<HTMLElement | null>(null);
  const first = columns[0];

  React.useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const lead = (cells[first?.id ?? ""] ?? "").trim();
    if (first && lead.length === 0) {
      setInvalid(true);
      firstRef.current?.focus();
      return;
    }
    const trimmed: Record<string, string> = {};
    for (const col of columns) trimmed[col.id] = (cells[col.id] ?? "").trim();
    onSave(trimmed);
  };

  const field =
    "h-8 w-full min-w-0 rounded-2 border border-hairline bg-surface-0 px-2 text-[13px] text-foreground placeholder:text-(--gr-ghost) " +
    FOCUS_RING;

  return (
    <form
      aria-label={heading}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      className={cn(
        "flex flex-col gap-2.5",
        density === "compact" ? "px-2 py-2" : "px-2.5 py-3",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {heading}
        </span>
        <span className="hidden text-[11px] text-ink-3 @min-[40rem]:inline">
          Enter saves · Esc cancels
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 @min-[40rem]:grid-cols-3">
        {columns.map((col, j) => {
          const id = `${uid}-${col.id}`;
          const value = cells[col.id] ?? "";
          const set = (v: string) => {
            setCells((c) => ({ ...c, [col.id]: v }));
            if (j === 0) setInvalid(false);
          };
          return (
            <label key={col.id} htmlFor={id} className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                {col.label}
              </span>
              {col.options ? (
                <select
                  id={id}
                  ref={(node) => {
                    if (j === 0) firstRef.current = node;
                  }}
                  value={value || (col.options[0] ?? "")}
                  onChange={(event) => set(event.target.value)}
                  className={field}
                >
                  {col.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
                  ref={(node) => {
                    if (j === 0) firstRef.current = node;
                  }}
                  type="text"
                  value={value}
                  placeholder={placeholders[col.id] ?? ""}
                  inputMode={col.kind === "money" ? "decimal" : undefined}
                  aria-invalid={j === 0 && invalid ? true : undefined}
                  aria-describedby={
                    j === 0 && invalid ? `${uid}-need` : undefined
                  }
                  onChange={(event) => set(event.target.value)}
                  className={cn(
                    field,
                    (col.kind === "mono" ||
                      col.kind === "money" ||
                      col.kind === "date") &&
                      "font-mono tabular-nums",
                    j === 0 && invalid && "border-danger",
                  )}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span
          id={`${uid}-need`}
          role="status"
          className="min-w-0 truncate text-[11px] text-danger"
        >
          {invalid && first
            ? `Every ${noun.one} needs a ${first.label.toLowerCase()}.`
            : ""}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Cancel
          </button>
          <button
            type="submit"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
              FOCUS_RING,
            )}
          >
            <Check aria-hidden className="size-3.5" />
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Drop zone                                 */
/* ----------------------------------------------------------------------- */

type Importing = { name: string; progress: number | null; done: boolean };

function DropZone({
  importing,
  error,
  noun,
  motionSafe,
  onFile,
  onCancel,
}: {
  importing: Importing | null;
  error: string | null;
  noun: { one: string; other: string };
  motionSafe: boolean;
  onFile: (file: File) => void;
  onCancel: () => void;
}) {
  const [over, setOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const chooseRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    chooseRef.current?.focus({ preventScroll: true });
  }, []);

  const busy = importing !== null;
  const fraction = importing
    ? importing.done
      ? 1
      : (importing.progress ?? 0.85)
    : 0;

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.preventDefault();
          onCancel();
        }
      }}
      onDragOver={(event) => {
        if (busy) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (busy) return;
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      className={cn(
        "flex flex-col gap-2.5 rounded-3 border border-dashed p-3 transition-colors",
        over
          ? "border-cobalt-bright bg-cobalt-wash"
          : "border-hairline-strong bg-surface-0",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      {importing ? (
        <div className="flex flex-col gap-2" aria-busy>
          <div className="flex items-center gap-2 text-[13px]">
            <FileText aria-hidden className="size-4 shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-2">
              {importing.name}
            </span>
            <span className="shrink-0 text-[11px] text-ink-3">
              {importing.done ? "Pouring in" : `Reading ${noun.other}`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`Reading ${importing.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="h-1 w-full overflow-hidden rounded-full bg-surface-2"
          >
            <motion.div
              className="h-full origin-left rounded-full bg-cobalt-bright"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: fraction }}
              transition={
                motionSafe
                  ? importing.done
                    ? springs.flick
                    : springs.drift
                  : { duration: durations.fast }
              }
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 @min-[40rem]:flex-row @min-[40rem]:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Upload aria-hidden className="size-4 shrink-0 text-ink-3" />
            <p className="min-w-0 text-[13px] text-ink-2">
              Drop a CSV here
              <span className="hidden @min-[40rem]:inline">
                {" "}
                with a header row naming the columns
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              ref={chooseRef}
              type="button"
              onClick={() => inputRef.current?.click()}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              Choose a file
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <X aria-hidden className="size-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-[11px] text-danger"
        >
          <TriangleAlert aria-hidden className="size-3" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Mode = "idle" | "new" | "import";

/**
 * An empty-state table that teaches by example. With no rows it draws a few
 * ghost rows under its live headers — realistic values written in ghost ink,
 * never a grey bar — with a note that this is what the real ones will look
 * like, and three ways in above them: create one, import a CSV, or load
 * sample data.
 *
 * Sample data pours in: each ghost solidifies in place, its ghost text
 * fading out as the real text fades in, in a cascade on `springs.glide`, and
 * the rows past the ghosts rise in after them. Create one opens an inline
 * editor at the top on `springs.glide` height; saving it turns the first
 * ghost solid on `springs.recoil` while the other ghosts fade. Import shows a
 * drop zone whose progress bar fills on `springs.drift` and lands on
 * `springs.flick` before the rows pour in the same way. Delete the last row
 * and the ghosts come back.
 *
 * The real rows are a grid with one roving tab stop: Up and Down move
 * between rows, Left and Right read along the cells, Enter edits a row in
 * place, Delete removes it. The ways in are buttons, the editor is a form
 * that Escape cancels. While loading the table shows a shimmering skeleton,
 * distinct from the ghosts because it is not legible. Under reduced motion
 * nothing travels: ghosts cross-fade to rows and rows appear in place, and
 * every change is announced.
 */
export function GhostRows({
  columns = defaultGhostColumns,
  rows,
  defaultRows,
  onChange,
  ghostRows = defaultGhostRows,
  ghostCount = 3,
  ghostStyle = "ink",
  density = "cozy",
  sampleRows = defaultSampleRows,
  onImport,
  status = "ready",
  onRetry,
  title = "Invoices",
  noun = { one: "invoice", other: "invoices" },
  note,
  label,
  height = 520,
  disabled = false,
  className,
}: GhostRowsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<GhostRow[]>(() => defaultRows ?? []);
  const current = rows ?? own;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [mode, setMode] = React.useState<Mode>("idle");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [importing, setImporting] = React.useState<Importing | null>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  // Which ghost slot a row took when it solidified, so the same element
  // carries it; and how each row element arrived.
  const [slotOf, setSlotOf] = React.useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [landings, setLandings] = React.useState<ReadonlyMap<string, Landing>>(
    () => new Map(),
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const [activeCol, setActiveCol] = React.useState<number | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    target: string;
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so rows already on the page
  // never animate in; true for anything that mounts later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rowNodes = React.useRef(new Map<string, HTMLDivElement>());
  const waysRef = React.useRef<HTMLButtonElement | null>(null);
  const newRef = React.useRef<HTMLButtonElement | null>(null);
  const counter = React.useRef(0);
  const importSeq = React.useRef(0);
  const pourTimer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      importSeq.current += 1;
      if (pourTimer.current !== null) window.clearTimeout(pourTimer.current);
    },
    [],
  );

  /* -------------------------------- data ------------------------------- */

  const count = clamp(Math.round(ghostCount), 2, 6);
  const ghosts = ghostRows.slice(0, count);
  const empty = current.length === 0;
  const first = columns[0];
  const nameOf = (r: GhostRow) => r.cells[first?.id ?? ""] || noun.one;
  const noteText = note ?? `This is what your ${noun.other} will look like`;

  const items = empty
    ? ghosts.map((g, i) => ({ key: slotKey(i), row: null, ghost: g }))
    : current.map((r) => {
        const key = slotOf.get(r.id) ?? `r-${r.id}`;
        const s = slotIndex(key);
        return { key, row: r, ghost: s === null ? null : (ghosts[s] ?? null) };
      });

  const activeRow =
    activeId && current.some((r) => r.id === activeId)
      ? activeId
      : (current[0]?.id ?? null);

  const narrowCols = columns.filter((c) => c.show !== "wide");
  const gridVars = {
    ["--gr-cols" as string]: `${columns.map(trackOf).join(" ")} ${ACTIONS_TRACK}`,
    ["--gr-cols-narrow" as string]: `${narrowCols.map(trackOf).join(" ")} ${ACTIONS_TRACK}`,
    ["--gr-ghost" as string]:
      "color-mix(in oklab, var(--ink-3) 62%, transparent)",
    ["--gr-ghost-line" as string]:
      "color-mix(in oklab, var(--hairline-strong) 70%, transparent)",
  };

  const placeholders: Record<string, string> = {};
  for (const col of columns)
    placeholders[col.id] = ghosts[0]?.cells[col.id] ?? "";

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: GhostRow[], change: GhostChange) => {
    if (rows === undefined) setOwn(next);
    onChange?.(next, change);
    if (next.length === 0) {
      setSlotOf(new Map());
      setLandings(new Map());
    }
  };

  const requestFocus = (target: string) =>
    setFocusReq((f) => ({ target, seq: (f?.seq ?? 0) + 1 }));

  /** Rows arriving at once: the ghosts solidify, the rest rise in after. */
  const pour = (incoming: GhostRow[], kind: "sample" | "import") => {
    if (incoming.length === 0) return;
    const step = cascade(Math.min(incoming.length, MAX_CASCADE));
    const slots = new Map(slotOf);
    const land = new Map(landings);
    incoming.forEach((r, i) => {
      const delay = r3(Math.min(i, MAX_CASCADE) * step);
      if (empty && i < ghosts.length) {
        slots.set(r.id, slotKey(i));
        land.set(slotKey(i), { kind: "solidify", delay });
      } else {
        land.set(`r-${r.id}`, { kind: "rise", delay });
      }
    });
    setSlotOf(slots);
    setLandings(land);
    commit([...current, ...incoming], { kind, rows: incoming });
    setMode("idle");
    setAnnouncement(
      `${kind === "sample" ? "Sample data loaded" : "Imported"}: ${plural(incoming.length, noun)}.`,
    );
    const head = incoming[0];
    if (head) {
      setActiveId(head.id);
      requestFocus(`row:${head.id}`);
    }
  };

  const create = (cells: Record<string, string>) => {
    counter.current += 1;
    const r: GhostRow = { id: `${uid}-n${counter.current}`, cells };
    const slots = new Map(slotOf);
    const land = new Map(landings);
    if (empty) {
      slots.set(r.id, slotKey(0));
      land.set(slotKey(0), { kind: "recoil", delay: 0 });
    } else {
      land.set(`r-${r.id}`, { kind: "rise", delay: 0 });
    }
    setSlotOf(slots);
    setLandings(land);
    commit([r, ...current], { kind: "create", rows: [r] });
    setMode("idle");
    setActiveId(r.id);
    requestFocus(`row:${r.id}`);
    setAnnouncement(`${nameOf(r)} added. ${plural(current.length + 1, noun)}.`);
  };

  const edit = (id: string, cells: Record<string, string>) => {
    const r = current.find((x) => x.id === id);
    if (!r) return;
    const next: GhostRow = { ...r, cells };
    commit(
      current.map((x) => (x.id === id ? next : x)),
      { kind: "edit", rows: [next] },
    );
    setEditingId(null);
    requestFocus(`row:${id}`);
    setAnnouncement(`${nameOf(next)} saved.`);
  };

  const remove = (id: string) => {
    if (inert) return;
    const i = current.findIndex((x) => x.id === id);
    const r = current[i];
    if (!r) return;
    const next = current.filter((x) => x.id !== id);
    commit(next, { kind: "delete", rows: [r] });
    if (editingId === id) setEditingId(null);
    const neighbour = next[Math.min(i, next.length - 1)];
    if (neighbour) {
      setActiveId(neighbour.id);
      requestFocus(`row:${neighbour.id}`);
      setAnnouncement(
        `${nameOf(r)} removed. ${plural(next.length, noun)} left.`,
      );
    } else {
      setActiveId(null);
      requestFocus("ways");
      setAnnouncement(
        `${nameOf(r)} removed. No ${noun.other} left; the example rows are back.`,
      );
    }
  };

  const openNew = () => {
    if (inert) return;
    setEditingId(null);
    setImportError(null);
    setMode("new");
  };

  const cancelNew = () => {
    setMode("idle");
    requestFocus(empty ? "ways" : "new");
  };

  const openImport = () => {
    if (inert) return;
    setEditingId(null);
    setImportError(null);
    setMode("import");
  };

  const cancelImport = () => {
    if (importing) return;
    setMode("idle");
    setImportError(null);
    requestFocus("ways");
  };

  const startImport = (file: File) => {
    importSeq.current += 1;
    const seq = importSeq.current;
    setImportError(null);
    setImporting({ name: file.name, progress: null, done: false });
    const report = (fraction: number) => {
      if (importSeq.current !== seq) return;
      setImporting((s) => (s ? { ...s, progress: clamp(fraction, 0, 1) } : s));
    };
    const run = async (): Promise<GhostRow[]> => {
      if (onImport) return onImport(file, report);
      const text = await file.text();
      report(0.9);
      return parseGhostCsv(text, columns, `${uid}-i${seq}`);
    };
    run().then(
      (result) => {
        if (importSeq.current !== seq) return;
        if (result.length === 0) {
          setImporting(null);
          setImportError(`No ${noun.other} found in ${file.name}.`);
          return;
        }
        setImporting((s) => (s ? { ...s, progress: 1, done: true } : s));
        pourTimer.current = window.setTimeout(() => {
          pourTimer.current = null;
          if (importSeq.current !== seq) return;
          setImporting(null);
          pour(result, "import");
        }, durations.slow * 1000);
      },
      (error: unknown) => {
        if (importSeq.current !== seq) return;
        setImporting(null);
        setImportError(
          error instanceof Error && error.message
            ? error.message
            : `${file.name} could not be read.`,
        );
      },
    );
  };

  /* -------------------------------- focus ------------------------------ */

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const { target } = focusReq;
    const node = target.startsWith("row:")
      ? rowNodes.current.get(target.slice(4))
      : target === "ways"
        ? waysRef.current
        : newRef.current;
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------ keyboard ----------------------------- */

  const visibleCols = columns;

  const onRowKey = (event: React.KeyboardEvent<HTMLDivElement>, id: string) => {
    const i = current.findIndex((x) => x.id === id);
    if (i < 0) return;
    const go = (to: number) => {
      event.preventDefault();
      const target = current[clamp(to, 0, current.length - 1)];
      if (target)
        rowNodes.current.get(target.id)?.focus({ preventScroll: true });
    };
    switch (event.key) {
      case "ArrowDown":
        go(i + 1);
        return;
      case "ArrowUp":
        go(i - 1);
        return;
      case "Home":
        go(0);
        return;
      case "End":
        go(current.length - 1);
        return;
      case "ArrowRight":
      case "ArrowLeft": {
        event.preventDefault();
        const dir = event.key === "ArrowRight" ? 1 : -1;
        const j = clamp(
          (activeCol ?? (dir > 0 ? -1 : visibleCols.length)) + dir,
          0,
          visibleCols.length - 1,
        );
        setActiveCol(j);
        const col = visibleCols[j];
        const r = current[i];
        if (col && r)
          setAnnouncement(`${col.label}: ${r.cells[col.id] || "blank"}.`);
        return;
      }
      case "Enter":
        if (inert) return;
        event.preventDefault();
        setMode("idle");
        setEditingId(id);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        remove(id);
        return;
      default:
        return;
    }
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const topRow: "ways" | "new" | "import" | null =
    !ready || disabled
      ? null
      : mode === "new"
        ? "new"
        : mode === "import"
          ? "import"
          : empty
            ? "ways"
            : null;

  const button = (primary: boolean) =>
    cn(
      "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-xs transition-colors",
      primary
        ? "bg-primary font-medium text-primary-foreground hover:opacity-90"
        : "border border-hairline bg-card text-foreground hover:bg-surface-2",
      FOCUS_RING,
    );

  const headerRow = (
    <div
      role="row"
      aria-rowindex={1}
      className="sticky top-0 z-10 grid grid-cols-(--gr-cols-narrow) border-b border-hairline-strong bg-card @min-[40rem]:grid-cols-(--gr-cols)"
    >
      {columns.map((col, j) => (
        <span
          key={col.id}
          role="columnheader"
          aria-colindex={j + 1}
          className={cn(
            "items-center font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
            col.show === "wide" ? "hidden @min-[40rem]:flex" : "flex",
            col.kind === "money" && "justify-end",
            d.head,
            d.cell,
          )}
        >
          <span className="truncate">{col.label}</span>
        </span>
      ))}
      <span role="columnheader" aria-colindex={columns.length + 1}>
        <span className="sr-only">Actions</span>
      </span>
    </div>
  );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ...gridVars }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between {noun.other}, Left and Right read along a row,
        Enter edits, Delete removes.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready ? (
            <p className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
              {plural(current.length, noun)}
            </p>
          ) : null}
        </div>
        <AnimatePresence initial={false}>
          {ready && !empty && !disabled ? (
            <motion.button
              key="new"
              ref={newRef}
              type="button"
              onClick={openNew}
              aria-expanded={mode === "new"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className={button(false)}
            >
              <Plus aria-hidden className="size-3.5" />
              New
            </motion.button>
          ) : null}
        </AnimatePresence>
      </header>

      <div className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The {noun.other} didn&apos;t load.
            </p>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Try again
              </button>
            ) : null}
          </div>
        ) : status === "loading" ? (
          <div aria-busy aria-label={`Loading ${noun.other}`} role="status">
            <div
              aria-hidden
              className="grid grid-cols-(--gr-cols-narrow) border-b border-hairline-strong @min-[40rem]:grid-cols-(--gr-cols)"
            >
              {columns.map((col) => (
                <span
                  key={col.id}
                  className={cn(
                    "items-center",
                    col.show === "wide" ? "hidden @min-[40rem]:flex" : "flex",
                    d.head,
                    d.cell,
                  )}
                >
                  <span className="h-2 w-10 rounded-full bg-surface-2" />
                </span>
              ))}
              <span />
            </div>
            <div aria-hidden className="flex flex-col">
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  className={cn(
                    "grid grid-cols-(--gr-cols-narrow) border-b border-hairline @min-[40rem]:grid-cols-(--gr-cols)",
                    d.row,
                  )}
                >
                  {columns.map((col, j) => (
                    <span
                      key={col.id}
                      className={cn(
                        "items-center",
                        col.show === "wide"
                          ? "hidden @min-[40rem]:flex"
                          : "flex",
                        col.kind === "money" && "justify-end",
                        d.cell,
                      )}
                    >
                      <span
                        className="h-2.5 rounded-full bg-[linear-gradient(90deg,var(--bg-1),var(--bg-2),var(--bg-1))] motion-safe:animate-pulse"
                        style={{
                          width: `${44 + ((i * 17 + j * 29) % 40)}%`,
                          animationDelay: `${i * 90 + j * 40}ms`,
                        }}
                      />
                    </span>
                  ))}
                  <span />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div
            role="grid"
            aria-label={title}
            aria-describedby={hintId}
            aria-rowcount={current.length + (topRow ? 2 : 1)}
            aria-colcount={columns.length + 1}
            aria-readonly={disabled || undefined}
            className="flex min-h-full flex-col"
          >
            {headerRow}

            <AnimatePresence initial={false}>
              {topRow ? (
                <motion.div
                  key={topRow}
                  role="row"
                  aria-rowindex={2}
                  className="overflow-hidden border-b border-hairline"
                  initial={
                    live
                      ? { height: motionSafe ? 0 : "auto", opacity: 0 }
                      : false
                  }
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{
                    height: motionSafe ? 0 : "auto",
                    opacity: 0,
                    transition: exitFor(durations.base),
                  }}
                  transition={{
                    height: motionSafe ? springs.glide : { duration: 0 },
                    opacity: { duration: durations.base, ease: easings.enter },
                  }}
                >
                  <div
                    role="gridcell"
                    aria-colspan={columns.length + 1}
                    className={cn(
                      topRow === "new" ? "bg-surface-0" : "px-3 py-3",
                    )}
                  >
                    {topRow === "new" ? (
                      <Editor
                        columns={columns}
                        initial={{}}
                        placeholders={placeholders}
                        heading={`New ${noun.one}`}
                        noun={noun}
                        density={density}
                        onSave={create}
                        onCancel={cancelNew}
                      />
                    ) : topRow === "import" ? (
                      <DropZone
                        importing={importing}
                        error={importError}
                        noun={noun}
                        motionSafe={motionSafe}
                        onFile={startImport}
                        onCancel={cancelImport}
                      />
                    ) : (
                      <div
                        role="group"
                        aria-label={`Ways to add ${noun.other}`}
                        className="flex flex-col gap-2.5 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between"
                      >
                        <p className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
                          <Sparkles
                            aria-hidden
                            className="size-3.5 shrink-0 text-ink-3"
                          />
                          <span className="min-w-0">{noteText}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            ref={waysRef}
                            type="button"
                            onClick={openNew}
                            className={button(true)}
                          >
                            <Plus aria-hidden className="size-3.5" />
                            Create one
                          </button>
                          <button
                            type="button"
                            onClick={openImport}
                            className={button(false)}
                          >
                            <Upload aria-hidden className="size-3.5" />
                            Import a CSV
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!inert) pour(sampleRows, "sample");
                            }}
                            className={button(false)}
                          >
                            <Sparkles aria-hidden className="size-3.5" />
                            Load sample data
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item, i) => {
                const id = item.row?.id ?? null;
                return (
                  <Row
                    key={item.key}
                    item={item}
                    index={i}
                    rowIndex={i + (topRow ? 3 : 2)}
                    columns={columns}
                    ghostStyle={ghostStyle}
                    density={density}
                    motionSafe={motionSafe}
                    live={live}
                    landing={landings.get(item.key)}
                    editing={id !== null && editingId === id}
                    active={id !== null && id === activeRow}
                    focused={id !== null && id === focusedId}
                    activeCol={activeCol}
                    inert={inert}
                    noun={noun}
                    nodeRef={(node) => {
                      if (!id) return;
                      if (node) rowNodes.current.set(id, node);
                      else rowNodes.current.delete(id);
                    }}
                    onFocus={() => {
                      if (!id) return;
                      setActiveId(id);
                      setFocusedId(id);
                    }}
                    onBlur={() => setFocusedId((f) => (f === id ? null : f))}
                    onKeyDown={(event) => {
                      if (id) onRowKey(event, id);
                    }}
                    onEdit={() => {
                      if (!inert && id) {
                        setMode("idle");
                        setEditingId(id);
                      }
                    }}
                    onDelete={() => {
                      if (id) remove(id);
                    }}
                    renderEditor={() =>
                      item.row ? (
                        <Editor
                          columns={columns}
                          initial={item.row.cells}
                          placeholders={placeholders}
                          heading={`Edit ${nameOf(item.row)}`}
                          noun={noun}
                          density={density}
                          onSave={(cells) => {
                            if (id) edit(id, cells);
                          }}
                          onCancel={() => {
                            setEditingId(null);
                            if (id) requestFocus(`row:${id}`);
                          }}
                        />
                      ) : null
                    }
                  />
                );
              })}
            </AnimatePresence>

            {empty ? (
              <p className="sr-only">
                No {noun.other} yet. The example rows show the shape of one:{" "}
                {columns.map((c) => c.label.toLowerCase()).join(", ")}.
              </p>
            ) : null}
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
