"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
} from "motion/react";
import {
  Check,
  Download,
  FileDown,
  Mail,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

/** How the glyph draws a format's insides. */
export type ExportLayout = "csv" | "sheet" | "json" | "columnar";

export type ExportFormat = {
  id: string;
  /** "CSV", "Spreadsheet". */
  label: string;
  /** The file extension, without the dot. */
  ext: string;
  /** One short line under the label. */
  note: string;
  /** The glyph's layout for this format. */
  layout: ExportLayout;
  /** Size against plain comma-separated text: 1 for CSV, under 1 for packed formats. */
  factor: number;
  /** Rows repeat their keys (JSON): each field also costs its key. */
  keyed?: boolean;
  /** What gzip leaves of the file; leave it out where gzip does not apply. */
  gzipFactor?: number;
  /** A header row makes sense for this format. */
  header?: boolean;
  /** Most rows one sheet holds; larger exports split into sheets. */
  maxRows?: number;
};

export type ExportColumn = {
  id: string;
  label: string;
  /** Average characters a value takes as text. */
  bytes: number;
  /** Always exported; its box is checked and locked. */
  required?: boolean;
};

export type ExportRange = { id: string; label: string; rows: number };

export type ExportDelivery = "download" | "email";

export type ExportRecipe = {
  format: string;
  range: string;
  columns: string[];
  header: boolean;
  gzip: boolean;
  delivery: ExportDelivery;
  /** Rows in the range. */
  rows: number;
  /** The estimate, in bytes. */
  bytes: number;
  /** The file name the export will have. */
  fileName: string;
};

export type ExportFile = {
  name: string;
  bytes: number;
  /** Where the host put it, if anywhere. */
  url?: string;
};

export type ExportStage = "query" | "write" | "compress";

export type ExportRecipeStatus = "ready" | "loading" | "error";
export type ExportGlyphStyle = "paper" | "outline" | "solid";
export type ExportDensity = "compact" | "cozy" | "roomy";

export type ExportRecipeProps = {
  /** The formats offered. @default defaultExportFormats (CSV, Spreadsheet, JSON, Columnar) */
  formats?: ExportFormat[];
  /** The table's columns. @default defaultExportColumns (eight Gaugeworks reading fields) */
  columns?: ExportColumn[];
  /** The ranges offered, with their row counts. @default defaultExportRanges */
  ranges?: ExportRange[];
  /** Controlled format id. */
  format?: string;
  /** Initial format when uncontrolled. @default "csv" */
  defaultFormat?: string;
  /** Fires from the radio that changed the format. */
  onFormatChange?: (format: string) => void;
  /** Controlled column ids. */
  selectedColumns?: string[];
  /** Initial columns when uncontrolled. @default every column */
  defaultColumns?: string[];
  /** Fires from the checkbox that changed the columns. */
  onColumnsChange?: (columns: string[]) => void;
  /** Controlled range id. */
  range?: string;
  /** Initial range when uncontrolled. @default "7d" */
  defaultRange?: string;
  /** Fires from the radio that changed the range. */
  onRangeChange?: (range: string) => void;
  /** Estimates over this many bytes offer delivery by email, and choose it. @default 200_000_000 */
  emailThreshold?: number;
  /** Where an emailed export goes. @default "ops@gaugeworks.example" */
  email?: string;
  /** Runs the export: call `report(0–1, stage?)` as it goes; resolve with the file, reject with the reason. The signal aborts on Cancel. @default a simulation paced by the estimate */
  onExport?: (
    recipe: ExportRecipe,
    report: (progress: number, stage?: ExportStage) => void,
    signal: AbortSignal,
  ) => Promise<ExportFile | void>;
  /** Cancel was pressed: on the recipe (close the dialog) or during an export (it stops and the recipe comes back). */
  onCancel?: (during: "recipe" | "export") => void;
  /** Download was pressed on the ready file. */
  onDownload?: (file: ExportFile) => void;
  /** Done was pressed after an emailed export. */
  onClose?: () => void;
  /** The file glyph: a paper sheet with ink marks, line drawing only, or a solid block with the marks knocked out. @default "paper" */
  glyphStyle?: ExportGlyphStyle;
  /** Option heights and spacing. @default "cozy" */
  density?: ExportDensity;
  /** Chosen cards and chips, the glyph's header marks and the progress fill. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The dialog's heading. @default "Export readings" */
  title?: string;
  /** The table being exported, under the heading. @default "Gaugeworks readings · Harbour line, 60 sensors" */
  tableName?: string;
  /** Whether the table's size is known. @default "ready" */
  status?: ExportRecipeStatus;
  /** Try again was pressed after the table failed to load. */
  onReload?: () => void;
  /** Trap Tab inside the dialog and mark it modal. @default false */
  modal?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultExportFormats: ExportFormat[] = [
  {
    id: "csv",
    label: "CSV",
    ext: "csv",
    note: "Opens anywhere",
    layout: "csv",
    factor: 1,
    gzipFactor: 0.21,
    header: true,
  },
  {
    id: "xlsx",
    label: "Spreadsheet",
    ext: "xlsx",
    note: "Typed cells, many sheets",
    layout: "sheet",
    factor: 0.44,
    header: true,
    maxRows: 1_048_576,
  },
  {
    id: "json",
    label: "JSON",
    ext: "json",
    note: "For scripts and APIs",
    layout: "json",
    factor: 1,
    keyed: true,
    gzipFactor: 0.12,
  },
  {
    id: "columnar",
    label: "Columnar",
    ext: "gcol",
    note: "Packed by column, smallest",
    layout: "columnar",
    factor: 0.13,
  },
];

export const defaultExportColumns: ExportColumn[] = [
  { id: "recorded_at", label: "Timestamp", bytes: 24, required: true },
  { id: "sensor_id", label: "Sensor", bytes: 9, required: true },
  { id: "site", label: "Site", bytes: 14 },
  { id: "reading", label: "Reading", bytes: 8, required: true },
  { id: "unit", label: "Unit", bytes: 4 },
  { id: "quality", label: "Quality flag", bytes: 6 },
  { id: "battery", label: "Battery", bytes: 3 },
  { id: "firmware", label: "Firmware", bytes: 7 },
];

/** Sixty sensors on the Harbour line, one reading a minute each. */
const PER_DAY = 60 * 1440;
export const defaultExportRanges: ExportRange[] = [
  { id: "24h", label: "24 hours", rows: PER_DAY },
  { id: "7d", label: "7 days", rows: PER_DAY * 7 },
  { id: "30d", label: "30 days", rows: PER_DAY * 30 },
  { id: "q3", label: "Quarter", rows: PER_DAY * 92 },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
/** Radio cards and checkboxes keep the input hidden and ring the label. */
const HAS_FOCUS =
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2";

const DENSITY: Record<
  ExportDensity,
  { card: string; gap: string; chip: string; row: string; section: string }
> = {
  compact: {
    card: "px-2.5 py-1.5",
    gap: "gap-1.5",
    chip: "h-7",
    row: "h-7",
    section: "gap-3",
  },
  cozy: {
    card: "px-3 py-2",
    gap: "gap-2",
    chip: "h-8",
    row: "h-8",
    section: "gap-4",
  },
  roomy: {
    card: "px-3.5 py-3",
    gap: "gap-2.5",
    chip: "h-9",
    row: "h-9",
    section: "gap-5",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Thousands with commas, by hand, so the server and the browser agree. */
const grouped = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "2.6M", "604K": a compact count, formatted by hand. */
const compactCount = (n: number) =>
  n >= 1_000_000
    ? `${(Math.round(n / 100_000) / 10).toFixed(1)}M`
    : n >= 10_000
      ? `${Math.round(n / 1000)}K`
      : grouped(n);

/** Bytes as a number and a unit, decimal, one place under 100. */
function sizeParts(bytes: number): { value: string; unit: string } {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = Math.max(0, bytes);
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  const value = i === 0 || v >= 100 ? String(Math.round(v)) : v.toFixed(1);
  return { value, unit: units[i] ?? "B" };
}

const sizeText = (bytes: number) => {
  const p = sizeParts(bytes);
  return `${p.value} ${p.unit}`;
};

const reasonOf = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : typeof error === "string" && error
      ? error
      : "The export did not finish";

/**
 * The size an export will have, in bytes: rows times the row's text, packed
 * by the format and by gzip. Exported so a host can estimate on its server.
 */
export function estimateExport(
  format: ExportFormat | undefined,
  columns: ExportColumn[],
  rows: number,
  gzip: boolean,
): number {
  if (!format || columns.length === 0) return 0;
  const row = format.keyed
    ? columns.reduce((t, c) => t + c.bytes + c.id.length + 6, 2)
    : columns.reduce((t, c) => t + c.bytes, columns.length);
  const packed = gzip && format.gzipFactor ? format.gzipFactor : 1;
  return Math.round(rows * row * format.factor * packed);
}

/* ----------------------------------------------------------------------- */
/*                                The glyph                                 */
/* ----------------------------------------------------------------------- */

type Mark = {
  x: number;
  y: number;
  w: number;
  h: number;
  lead?: boolean;
  col: number;
};

const m = (
  x: number,
  y: number,
  w: number,
  h: number,
  col: number,
  lead = false,
): Mark => ({ x, y, w, h, col, lead });

/**
 * Twelve marks per format, so any layout can travel into any other: comma
 * rows, a grid of cells, indented key lines, column stripes.
 */
const LAYOUTS: Record<ExportLayout, Mark[]> = {
  csv: [
    m(14, 27, 10, 3.5, 0, true),
    m(27, 27, 14, 3.5, 1, true),
    m(44, 27, 12, 3.5, 2, true),
    m(14, 37, 12, 3.5, 0),
    m(29, 37, 10, 3.5, 1),
    m(42, 37, 14, 3.5, 2),
    m(14, 47, 9, 3.5, 0),
    m(26, 47, 15, 3.5, 1),
    m(44, 47, 11, 3.5, 2),
    m(14, 57, 13, 3.5, 0),
    m(30, 57, 11, 3.5, 1),
    m(44, 57, 9, 3.5, 2),
  ],
  sheet: [
    m(14, 25, 13, 8, 0, true),
    m(29, 25, 13, 8, 1, true),
    m(44, 25, 13, 8, 2, true),
    m(14, 35, 13, 8, 0),
    m(29, 35, 13, 8, 1),
    m(44, 35, 13, 8, 2),
    m(14, 45, 13, 8, 0),
    m(29, 45, 13, 8, 1),
    m(44, 45, 13, 8, 2),
    m(14, 55, 13, 8, 0),
    m(29, 55, 13, 8, 1),
    m(44, 55, 13, 8, 2),
  ],
  json: [
    m(14, 25, 4, 3.5, 0, true),
    m(19, 32, 12, 3.5, 0),
    m(33, 32, 14, 3.5, 1),
    m(19, 39, 10, 3.5, 0),
    m(31, 39, 18, 3.5, 1),
    m(19, 46, 14, 3.5, 1),
    m(35, 46, 4, 3.5, 1, true),
    m(24, 53, 10, 3.5, 2),
    m(36, 53, 12, 3.5, 2),
    m(24, 60, 12, 3.5, 2),
    m(38, 60, 10, 3.5, 2),
    m(14, 67, 4, 3.5, 0, true),
  ],
  columnar: [
    m(15, 25, 12, 11, 0, true),
    m(15, 38, 12, 11, 0, true),
    m(15, 51, 12, 11, 0, true),
    m(15, 64, 12, 7, 0, true),
    m(30, 25, 12, 11, 1),
    m(30, 38, 12, 11, 1),
    m(30, 51, 12, 11, 1),
    m(30, 64, 12, 7, 1),
    m(45, 25, 12, 11, 2),
    m(45, 38, 12, 11, 2),
    m(45, 51, 12, 11, 2),
    m(45, 64, 12, 7, 2),
  ],
};

/** One mark: its box travels on glide whenever its target changes. */
function GlyphMark({
  mark,
  delay,
  on,
  glyph,
  motionSafe,
}: {
  mark: Mark;
  delay: number;
  on: boolean;
  glyph: ExportGlyphStyle;
  motionSafe: boolean;
}) {
  const x = useMotionValue(mark.x);
  const y = useMotionValue(mark.y);
  const w = useMotionValue(mark.w);
  const h = useMotionValue(mark.h);
  const rx = useTransform(x, r2);
  const ry = useTransform(y, r2);
  const rw = useTransform(w, r2);
  const rh = useTransform(h, r2);
  React.useEffect(() => {
    if (!motionSafe) {
      x.jump(mark.x);
      y.jump(mark.y);
      w.jump(mark.w);
      h.jump(mark.h);
      return;
    }
    const t = { ...springs.glide, delay };
    const runs = [
      animate(x, mark.x, t),
      animate(y, mark.y, t),
      animate(w, mark.w, t),
      animate(h, mark.h, t),
    ];
    return () => {
      for (const r of runs) r.stop();
    };
  }, [mark.x, mark.y, mark.w, mark.h, delay, motionSafe, x, y, w, h]);
  return (
    <motion.rect
      x={rx}
      y={ry}
      width={rw}
      height={rh}
      rx={1.2}
      className={cn(
        "transition-[fill,stroke,opacity] duration-300",
        glyph === "outline"
          ? cn("fill-none", mark.lead ? "stroke-(--er-accent)" : "stroke-ink-3")
          : glyph === "solid"
            ? mark.lead
              ? "fill-card"
              : "fill-[color-mix(in_oklab,var(--card)_72%,transparent)]"
            : mark.lead
              ? "fill-(--er-accent)"
              : "fill-[color-mix(in_oklab,var(--ink-3)_55%,transparent)]",
      )}
      strokeWidth={glyph === "outline" ? 1 : 0}
      style={{ opacity: on ? 1 : 0.22 }}
    />
  );
}

/** Letters that roll in place, each in its own fixed slot. */
function RollingText({
  text,
  dir,
  motionSafe,
  className,
}: {
  text: string;
  dir: number;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span className={cn("inline-flex", className)} aria-hidden>
      {chars.map((ch, i) => {
        // Slots count from the right, so a value that gains a digit keeps its
        // units in place and the new digit arrives on the left.
        const slot = chars.length - i;
        return (
          <span
            key={`s${slot}`}
            className="relative inline-flex justify-center overflow-clip"
            style={{
              width: ch === "," || ch === "." || ch === " " ? "0.4ch" : "1ch",
              height: "1.2em",
              lineHeight: "1.2em",
            }}
          >
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.span
                key={ch}
                custom={dir}
                className="inline-block"
                variants={{
                  enter: (d: number) => ({
                    opacity: 0,
                    y: motionSafe ? `${d * 80}%` : 0,
                  }),
                  shown: { opacity: 1, y: "0%" },
                  leave: (d: number) => ({
                    opacity: 0,
                    y: motionSafe ? `${-d * 80}%` : 0,
                    transition: exitFor(durations.fast),
                  }),
                }}
                initial="enter"
                animate="shown"
                exit="leave"
                transition={
                  motionSafe
                    ? {
                        y: { ...springs.snap, delay: i * 0.012 },
                        opacity: { duration: durations.fast, delay: i * 0.012 },
                      }
                    : { duration: durations.fast }
                }
              >
                {ch === " " ? " " : ch}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

type GlyphState = "idle" | "running" | "ready" | "failed";

/**
 * The document the export will become. Its marks morph between formats, its
 * tab rolls the extension, it fills from the bottom as the export runs, and a
 * badge lands on its corner when the file is ready.
 */
function FileGlyph({
  layout,
  ext,
  fraction,
  glyph,
  state,
  progress,
  size,
  motionSafe,
}: {
  layout: ExportLayout;
  ext: string;
  fraction: number;
  glyph: ExportGlyphStyle;
  state: GlyphState;
  progress: number;
  size: "lg" | "sm";
  motionSafe: boolean;
}) {
  const raw = React.useId();
  const clip = `er${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const marks = LAYOUTS[layout] ?? LAYOUTS.csv;
  const fill = useMotionValue(clamp01(progress));
  React.useEffect(() => {
    if (!motionSafe) {
      fill.jump(clamp01(progress));
      return;
    }
    const c = animate(fill, clamp01(progress), springs.glide);
    return () => c.stop();
  }, [progress, motionSafe, fill]);
  const fillY = useTransform(fill, (p) => r2(84 - p * 80));
  const fillH = useTransform(fill, (p) => r2(p * 80));
  const page =
    "M14 4 H46 L62 20 V78 Q62 84 56 84 H16 Q10 84 10 78 V8 Q10 4 14 4 Z";
  const [prevExt, setPrevExt] = React.useState(ext);
  const [dir, setDir] = React.useState(1);
  if (prevExt !== ext) {
    setPrevExt(ext);
    setDir((d) => -d);
  }
  return (
    <div
      className={cn(
        "relative shrink-0",
        size === "lg" ? "h-[8.5rem] w-[7rem]" : "h-12 w-10",
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 72 88"
        className="absolute inset-0 size-full overflow-visible"
      >
        <defs>
          <clipPath id={clip}>
            <path d={page} />
          </clipPath>
        </defs>
        <path
          d={page}
          className={cn(
            "transition-[fill,stroke] duration-300",
            glyph === "solid"
              ? "fill-(--er-fill) stroke-none"
              : glyph === "outline"
                ? "fill-none stroke-ink-2"
                : "fill-card stroke-hairline-strong",
          )}
          strokeWidth={glyph === "outline" ? 1.5 : 1}
        />
        <g clipPath={`url(#${clip})`}>
          <motion.rect
            x={0}
            width={72}
            y={fillY}
            height={fillH}
            className={cn(
              "transition-[fill] duration-300",
              state === "failed"
                ? "fill-[color-mix(in_oklab,var(--danger)_28%,transparent)]"
                : glyph === "solid"
                  ? "fill-[color-mix(in_oklab,var(--card)_26%,transparent)]"
                  : "fill-[color-mix(in_oklab,var(--er-accent)_20%,transparent)]",
            )}
          />
        </g>
        <path
          d="M46 4 V16 Q46 20 50 20 H62"
          className={cn(
            "fill-none transition-[stroke] duration-300",
            glyph === "solid"
              ? "stroke-[color-mix(in_oklab,var(--card)_60%,transparent)]"
              : glyph === "outline"
                ? "stroke-ink-2"
                : "stroke-hairline-strong",
          )}
          strokeWidth={glyph === "outline" ? 1.5 : 1}
        />
        {marks.map((mk, i) => (
          <GlyphMark
            key={i}
            mark={mk}
            delay={i * 0.012}
            on={mk.col === 0 || (mk.col + 1) / 3 <= fraction + 0.02}
            glyph={glyph}
            motionSafe={motionSafe}
          />
        ))}
      </svg>
      <span
        aria-hidden
        className={cn(
          "absolute left-0 inline-flex items-center font-mono font-semibold tracking-[0.04em] text-white uppercase shadow-[0_2px_6px_color-mix(in_oklab,black_18%,transparent)] transition-colors duration-300",
          size === "lg"
            ? "bottom-[14%] h-5 rounded-[5px] px-1.5 text-[10px]"
            : "bottom-[10%] -left-1 h-3.5 rounded-[3px] px-0.5 text-[7px]",
          state === "failed" ? "bg-(--er-danger)" : "bg-(--er-fill)",
        )}
      >
        <RollingText text={ext} dir={dir} motionSafe={motionSafe} />
      </span>
      <AnimatePresence initial={false}>
        {state === "ready" || state === "failed" ? (
          <motion.span
            key={state}
            aria-hidden
            className={cn(
              "absolute -top-1.5 -right-1.5 inline-flex items-center justify-center rounded-full text-white shadow-[0_3px_8px_color-mix(in_oklab,black_22%,transparent)] ring-2 ring-popover",
              size === "lg" ? "size-7" : "size-4",
              state === "ready" ? "bg-(--er-ok)" : "bg-(--er-danger)",
            )}
            initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe && state === "ready"
                ? {
                    scale: springs.recoil,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            {state === "ready" ? (
              <Check
                className={size === "lg" ? "size-4" : "size-2.5"}
                strokeWidth={3}
              />
            ) : (
              <TriangleAlert
                className={size === "lg" ? "size-3.5" : "size-2.5"}
              />
            )}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** A box whose height follows its content on glide, measured. */
function Measured({
  glide,
  children,
  className,
}: {
  glide: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      initial={false}
      animate={{ height: glide && height !== null ? height : "auto" }}
      transition={glide ? springs.glide : { duration: 0 }}
      style={{ overflow: "clip", overflowClipMargin: 8 }}
      className={className}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The dialog                                */
/* ----------------------------------------------------------------------- */

type Phase = "recipe" | "running" | "ready" | "sent" | "failed";

const STAGES: { id: ExportStage; label: string }[] = [
  { id: "query", label: "Query the readings" },
  { id: "write", label: "Write rows" },
  { id: "compress", label: "Compress" },
];

const stageAt = (p: number, gzip: boolean): ExportStage =>
  p < 0.14 ? "query" : !gzip || p < 0.86 ? "write" : "compress";

/**
 * An export dialog that shows the file before it exists. The recipe — format
 * cards, range chips, column checkboxes, header and gzip — sits beside a large
 * document glyph whose twelve marks morph from one format's layout to the
 * next on glide (comma rows, a grid, indented keys, column stripes) while its
 * tab rolls the extension letter by letter on snap; the size estimate and the
 * row count roll their digits toward each new value. Estimates past
 * `emailThreshold` glide open a delivery choice and pick email.
 *
 * Exporting folds the recipe away: the glyph fills from the bottom as the host
 * reports progress, three stages tick on flick and the rows written roll; a
 * ready file lands a check on the glyph's corner on recoil with Download,
 * and a failure stops the fill in danger, keeps every choice and offers Try
 * again. Format, range and delivery are native radio groups and the columns
 * native checkboxes that also follow the arrow keys. Under reduced motion the
 * marks cross-fade, digits swap, and every value still changes.
 */
export function ExportRecipe({
  formats = defaultExportFormats,
  columns = defaultExportColumns,
  ranges = defaultExportRanges,
  format,
  defaultFormat = "csv",
  onFormatChange,
  selectedColumns,
  defaultColumns,
  onColumnsChange,
  range,
  defaultRange = "7d",
  onRangeChange,
  emailThreshold = 200_000_000,
  email = "ops@gaugeworks.example",
  onExport,
  onCancel,
  onDownload,
  onClose,
  glyphStyle = "paper",
  density = "cozy",
  accent = "var(--accent-bright)",
  title = "Export readings",
  tableName = "Gaugeworks readings · Harbour line, 60 sensors",
  status = "ready",
  onReload,
  modal = false,
  disabled = false,
  className,
}: ExportRecipeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const estimateId = `${uid}-estimate`;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const ready = status === "ready";

  /* ------------------------------- recipe ------------------------------- */

  const [ownFormat, setOwnFormat] = React.useState(defaultFormat);
  const formatId = format ?? ownFormat;
  const fmt = formats.find((f) => f.id === formatId) ?? formats[0];
  const [ownRange, setOwnRange] = React.useState(defaultRange);
  const rangeId = range ?? ownRange;
  const rng = ranges.find((r) => r.id === rangeId) ?? ranges[0];
  const [ownColumns, setOwnColumns] = React.useState<string[]>(
    () => defaultColumns ?? columns.map((c) => c.id),
  );
  const required = columns.filter((c) => c.required).map((c) => c.id);
  const colIds = Array.from(
    new Set([...(selectedColumns ?? ownColumns), ...required]),
  ).filter((id) => columns.some((c) => c.id === id));
  const chosenCols = columns.filter((c) => colIds.includes(c.id));
  const [header, setHeader] = React.useState(true);
  const [gzip, setGzip] = React.useState(false);
  const [deliveryChoice, setDeliveryChoice] =
    React.useState<ExportDelivery | null>(null);

  const rows = rng?.rows ?? 0;
  const useGzip = gzip && fmt?.gzipFactor !== undefined;
  const useHeader = header && fmt?.header === true;
  const bytes = ready ? estimateExport(fmt, chosenCols, rows, useGzip) : 0;
  const large = bytes > emailThreshold;
  const delivery: ExportDelivery = large
    ? (deliveryChoice ?? "email")
    : "download";
  // The file is named after the table: the part of its name before a "·".
  const stem =
    (tableName.split("·")[0] ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "export";
  const fileName = `${stem}-${rng?.id ?? "all"}.${fmt?.ext ?? "csv"}${useGzip ? ".gz" : ""}`;
  const sheets =
    fmt?.maxRows && rows > fmt.maxRows ? Math.ceil(rows / fmt.maxRows) : 1;
  const fraction = columns.length > 0 ? chosenCols.length / columns.length : 1;

  const recipe: ExportRecipe = {
    format: fmt?.id ?? "",
    range: rng?.id ?? "",
    columns: chosenCols.map((c) => c.id),
    header: useHeader,
    gzip: useGzip,
    delivery,
    rows,
    bytes,
    fileName,
  };

  // Each figure rolls toward the direction it moved.
  const [seen, setSeen] = React.useState({ bytes, rows });
  const [dirs, setDirs] = React.useState({ bytes: 1, rows: 1 });
  if (seen.bytes !== bytes || seen.rows !== rows) {
    setDirs({
      bytes: bytes === seen.bytes ? dirs.bytes : bytes > seen.bytes ? 1 : -1,
      rows: rows === seen.rows ? dirs.rows : rows > seen.rows ? 1 : -1,
    });
    setSeen({ bytes, rows });
  }

  // Spoken when it settles, not per digit.
  const spoken = `${fmt?.label ?? ""}, ${grouped(rows)} rows, about ${sizeText(bytes)}${large ? ", large enough to email" : ""}.`;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );
  const announceTimer = React.useRef(0);
  React.useEffect(() => {
    if (!ready) return;
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => {
      setSaid((s) => ({ n: s.n + 1, text: spoken }));
    }, 700);
    return () => window.clearTimeout(announceTimer.current);
  }, [spoken, ready]);

  const pickFormat = (id: string) => {
    if (disabled) return;
    if (format === undefined) setOwnFormat(id);
    onFormatChange?.(id);
  };
  const pickRange = (id: string) => {
    if (disabled) return;
    if (range === undefined) setOwnRange(id);
    onRangeChange?.(id);
  };
  const setCols = (ids: string[]) => {
    if (disabled) return;
    const next = Array.from(new Set([...ids, ...required]));
    const ordered = columns.map((c) => c.id).filter((id) => next.includes(id));
    if (selectedColumns === undefined) setOwnColumns(ordered);
    onColumnsChange?.(ordered);
  };

  /* -------------------------------- run --------------------------------- */

  const [phase, setPhase] = React.useState<Phase>("recipe");
  const [progress, setProgress] = React.useState(0);
  const [stage, setStage] = React.useState<ExportStage>("query");
  const [file, setFile] = React.useState<ExportFile | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const job = React.useRef<{ token: number; abort: AbortController } | null>(
    null,
  );
  const tokens = React.useRef(0);
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => {
    const t = timers.current;
    return () => {
      job.current?.abort.abort();
      job.current = null;
      for (const id of t) window.clearTimeout(id);
      t.clear();
    };
  }, []);

  const simulate = (
    r: ExportRecipe,
    report: (p: number, s?: ExportStage) => void,
    signal: AbortSignal,
  ) =>
    new Promise<ExportFile>((resolve, reject) => {
      const total = Math.min(4200, Math.max(1500, 1200 + r.bytes / 120_000));
      const started = { t: 0 };
      const tick = () => {
        if (signal.aborted) return;
        started.t += 90;
        const p = clamp01(started.t / total);
        report(p);
        if (p >= 1) {
          resolve({ name: r.fileName, bytes: Math.round(r.bytes * 1.013) });
          return;
        }
        const id = window.setTimeout(() => {
          timers.current.delete(id);
          tick();
        }, 90);
        timers.current.add(id);
      };
      signal.addEventListener("abort", () => reject(new Error("Cancelled")));
      tick();
    });

  const run = () => {
    if (disabled || !ready || chosenCols.length === 0) return;
    job.current?.abort.abort();
    tokens.current += 1;
    const token = tokens.current;
    const abort = new AbortController();
    job.current = { token, abort };
    const r = recipe;
    setPhase("running");
    setProgress(0);
    setStage("query");
    setFailure(null);
    setFile(null);
    say(`Exporting ${grouped(r.rows)} rows as ${fmt?.label ?? "a file"}.`);
    let lastStage: ExportStage = "query";
    const report = (p: number, s?: ExportStage) => {
      if (job.current?.token !== token) return;
      const v = clamp01(Number(p) || 0);
      const next = s ?? stageAt(v, r.gzip);
      setProgress(v);
      setStage(next);
      if (next !== lastStage) {
        lastStage = next;
        say(
          next === "write"
            ? "Writing rows."
            : next === "compress"
              ? "Compressing."
              : "Querying.",
        );
      }
    };
    let work: Promise<ExportFile | void>;
    try {
      work = onExport
        ? Promise.resolve(onExport(r, report, abort.signal))
        : simulate(r, report, abort.signal);
    } catch (error) {
      work = Promise.reject(error);
    }
    work.then(
      (result) => {
        if (job.current?.token !== token) return;
        job.current = null;
        const f: ExportFile = result ?? { name: r.fileName, bytes: r.bytes };
        setProgress(1);
        setFile(f);
        if (r.delivery === "email") {
          setPhase("sent");
          say(`Export ready. A link is on its way to ${email}.`);
        } else {
          setPhase("ready");
          say(`Export ready: ${f.name}, ${sizeText(f.bytes)}.`);
        }
      },
      (error: unknown) => {
        if (job.current?.token !== token) return;
        job.current = null;
        const why = reasonOf(error);
        setFailure(why);
        setPhase("failed");
        say(`The export stopped: ${why}. Your choices are kept.`);
      },
    );
  };

  const cancel = () => {
    if (phase === "running") {
      job.current?.abort.abort();
      job.current = null;
      setPhase("recipe");
      setProgress(0);
      say("Export cancelled. Your choices are kept.");
      onCancel?.("export");
      return;
    }
    onCancel?.("recipe");
  };

  const back = () => {
    setPhase("recipe");
    setProgress(0);
    setFailure(null);
  };

  /* ------------------------------ keyboard ------------------------------ */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (phase === "running" || phase === "recipe") cancel();
      else back();
      return;
    }
    if (modal && event.key === "Tab" && root) {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
        ),
      ).filter((el) => el.offsetParent !== null || el.closest("label"));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  /** Checkboxes follow the arrow keys too, like the radio groups beside them. */
  const onChecksKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = [
      "ArrowDown",
      "ArrowUp",
      "ArrowRight",
      "ArrowLeft",
      "Home",
      "End",
    ];
    if (!keys.includes(event.key)) return;
    const boxes = Array.from(
      event.currentTarget.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      ),
    );
    const at = boxes.indexOf(event.target as HTMLInputElement);
    if (at < 0) return;
    event.preventDefault();
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? boxes.length - 1
          : at +
            (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1);
    boxes[(to + boxes.length) % boxes.length]?.focus();
  };

  const allRef = React.useRef<HTMLInputElement | null>(null);
  const allState: boolean | "mixed" =
    chosenCols.length === columns.length
      ? true
      : chosenCols.length === required.length
        ? false
        : "mixed";
  React.useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = allState === "mixed";
  }, [allState]);

  /* -------------------------------- parts ------------------------------- */

  const glyphState: GlyphState =
    phase === "running"
      ? "running"
      : phase === "ready" || phase === "sent"
        ? "ready"
        : phase === "failed"
          ? "failed"
          : "idle";
  const size = sizeParts(bytes);
  const tween = { duration: durations.base, ease: easings.enter };
  const sectionLabel =
    "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

  const box = (on: boolean, locked?: boolean) =>
    cn(
      "flex size-4 shrink-0 items-center justify-center rounded-1 border transition-colors",
      on
        ? locked
          ? "border-[color-mix(in_oklab,var(--er-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--er-accent)_45%,transparent)] text-white"
          : "border-(--er-fill) bg-(--er-fill) text-white"
        : "border-hairline-strong bg-card text-transparent",
    );

  const formatCards = (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className={cn(sectionLabel, "mb-2")}>Format</legend>
      <div
        className={cn(
          "grid grid-cols-1 @min-[22rem]/export-recipe:grid-cols-2",
          d.gap,
        )}
      >
        {formats.map((f) => {
          const on = f.id === fmt?.id;
          return (
            <label
              key={f.id}
              className={cn(
                "relative flex cursor-pointer items-start gap-2.5 rounded-3 border transition-colors",
                d.card,
                on
                  ? "border-(--er-accent) bg-[color-mix(in_oklab,var(--er-accent)_8%,transparent)]"
                  : "border-hairline hover:bg-surface-2",
                HAS_FOCUS,
              )}
            >
              <input
                type="radio"
                name={`${uid}-format`}
                value={f.id}
                checked={on}
                onChange={() => pickFormat(f.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                  on ? "border-(--er-accent)" : "border-hairline-strong",
                )}
              >
                <motion.span
                  className="size-2 rounded-full bg-(--er-accent)"
                  initial={false}
                  animate={{ scale: on ? 1 : 0 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] leading-5 font-medium text-foreground">
                  {f.label}
                  <span className="ml-1.5 font-mono text-[10px] text-ink-3 uppercase">
                    .{f.ext}
                  </span>
                </span>
                <span className="text-[12px] leading-4 text-ink-3">
                  {f.note}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const rangeChips = (
    <fieldset className="flex flex-col" disabled={disabled}>
      <legend className={cn(sectionLabel, "mb-2")}>Range</legend>
      <div className="flex flex-wrap gap-1.5">
        {ranges.map((r) => {
          const on = r.id === rng?.id;
          return (
            <label
              key={r.id}
              className={cn(
                "relative inline-flex cursor-pointer items-center rounded-full border px-3 text-[12px] transition-colors",
                d.chip,
                on
                  ? "border-(--er-accent) bg-[color-mix(in_oklab,var(--er-accent)_10%,transparent)] font-medium text-foreground"
                  : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                HAS_FOCUS,
              )}
            >
              <input
                type="radio"
                name={`${uid}-range`}
                value={r.id}
                checked={on}
                onChange={() => pickRange(r.id)}
                className="sr-only"
              />
              {r.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );

  const columnChecks = (
    <fieldset className="flex flex-col" disabled={disabled}>
      <legend className={cn(sectionLabel, "mb-1.5")}>Columns</legend>
      <div onKeyDown={onChecksKeyDown} className="flex flex-col">
        <label
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-2 px-1 text-[13px] font-medium text-foreground",
            d.row,
            HAS_FOCUS,
          )}
        >
          <input
            ref={allRef}
            type="checkbox"
            checked={allState === true}
            onChange={() =>
              setCols(allState === true ? [] : columns.map((c) => c.id))
            }
            className="sr-only"
          />
          <span aria-hidden className={box(allState !== false)}>
            <svg viewBox="0 0 16 16" className="size-3">
              <path
                d={
                  allState === "mixed"
                    ? "M4 8 H12"
                    : "M3.5 8.5 L6.5 11.5 L12.5 4.5"
                }
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          All columns
          <span className="ml-auto font-mono text-[11px] font-normal text-ink-3 tabular-nums">
            {chosenCols.length}/{columns.length}
          </span>
        </label>
        <div className="grid grid-cols-1 gap-x-3 @min-[22rem]/export-recipe:grid-cols-2">
          {columns.map((c) => {
            const on = colIds.includes(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "flex items-center gap-2 rounded-2 px-1 text-[13px]",
                  d.row,
                  c.required
                    ? "cursor-default text-ink-2"
                    : "cursor-pointer text-foreground",
                  HAS_FOCUS,
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  aria-disabled={c.required || undefined}
                  onChange={() => {
                    if (c.required) return;
                    setCols(
                      on
                        ? colIds.filter((id) => id !== c.id)
                        : [...colIds, c.id],
                    );
                  }}
                  className="sr-only"
                />
                <span aria-hidden className={box(on, c.required)}>
                  <svg viewBox="0 0 16 16" className="size-3">
                    <motion.path
                      d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={false}
                      animate={{ pathLength: on ? 1 : 0 }}
                      transition={motionSafe ? springs.flick : { duration: 0 }}
                    />
                  </svg>
                </span>
                <span className="min-w-0 truncate">{c.label}</span>
                {c.required ? (
                  <span className="ml-auto shrink-0 text-[11px] text-ink-3">
                    always
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
  );

  const optionChecks = (
    <fieldset className="flex flex-col" disabled={disabled}>
      <legend className={cn(sectionLabel, "mb-1.5")}>Options</legend>
      <div onKeyDown={onChecksKeyDown} className="flex flex-col">
        {[
          {
            id: "header",
            label: "Header row",
            on: useHeader,
            off: !fmt?.header,
            note: fmt?.header
              ? null
              : `${fmt?.label ?? "This format"} names its fields itself`,
            set: () => setHeader((h) => !h),
          },
          {
            id: "gzip",
            label: "Compress to .gz",
            on: useGzip,
            off: fmt?.gzipFactor === undefined,
            note:
              fmt?.gzipFactor === undefined
                ? `${fmt?.label ?? "This format"} is packed already`
                : null,
            set: () => setGzip((g) => !g),
          },
        ].map((o) => (
          <label
            key={o.id}
            className={cn(
              "flex items-center gap-2 rounded-2 px-1 text-[13px]",
              d.row,
              o.off
                ? "cursor-default text-ink-3"
                : "cursor-pointer text-foreground",
              HAS_FOCUS,
            )}
          >
            <input
              type="checkbox"
              checked={o.on}
              aria-disabled={o.off || undefined}
              onChange={() => {
                if (!o.off) o.set();
              }}
              className="sr-only"
            />
            <span aria-hidden className={cn(box(o.on), o.off && "opacity-50")}>
              <svg viewBox="0 0 16 16" className="size-3">
                <motion.path
                  d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: o.on ? 1 : 0 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </svg>
            </span>
            <span className="min-w-0 truncate">{o.label}</span>
            {o.note ? (
              <span className="ml-auto hidden shrink-0 text-[11px] text-ink-3 @min-[26rem]/export-recipe:inline">
                {o.note}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );

  const deliveryBlock =
    large && phase === "recipe" ? (
      <motion.fieldset
        className="flex flex-col gap-2 rounded-3 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_7%,transparent)] p-3"
        disabled={disabled}
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={tween}
      >
        <legend className="sr-only">Delivery</legend>
        <p className="text-[12px] leading-4 text-foreground">
          This is a large file. It can wait in this tab, or we can email a link
          when it is ready.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "email", label: `Email ${email}`, icon: Mail },
              { id: "download", label: "Download here", icon: Download },
            ] as const
          ).map((o) => {
            const on = delivery === o.id;
            const Icon = o.icon;
            return (
              <label
                key={o.id}
                className={cn(
                  "relative inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors",
                  d.chip,
                  on
                    ? "border-(--er-accent) bg-card font-medium text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2",
                  HAS_FOCUS,
                )}
              >
                <input
                  type="radio"
                  name={`${uid}-delivery`}
                  value={o.id}
                  checked={on}
                  onChange={() => setDeliveryChoice(o.id)}
                  className="sr-only"
                />
                <Icon aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{o.label}</span>
              </label>
            );
          })}
        </div>
      </motion.fieldset>
    ) : null;

  const figures = (big: boolean) => (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        big ? "items-center text-center" : "",
      )}
    >
      <p
        id={big ? estimateId : undefined}
        className={cn(
          "inline-flex items-baseline gap-1 font-semibold text-foreground tabular-nums",
          big ? "text-[22px] leading-7" : "text-[15px] leading-5",
        )}
      >
        <span className="sr-only">{`About ${sizeText(bytes)}, ${grouped(rows)} rows`}</span>
        <span aria-hidden className="text-ink-3">
          ≈
        </span>
        <RollingText
          text={size.value}
          dir={dirs.bytes}
          motionSafe={motionSafe}
        />
        <span
          aria-hidden
          className="relative inline-grid text-[0.62em] font-medium text-ink-2"
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={size.unit}
              className="[grid-area:1/1]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={tween}
            >
              {size.unit}
            </motion.span>
          </AnimatePresence>
        </span>
      </p>
      <p className="inline-flex items-baseline gap-1 text-[12px] text-ink-3 tabular-nums">
        <RollingText
          text={grouped(rows)}
          dir={dirs.rows}
          motionSafe={motionSafe}
          className="font-mono text-[11px]"
        />
        <span aria-hidden>rows · {chosenCols.length} columns</span>
      </p>
    </div>
  );

  const filePanel = (
    <div className="hidden flex-col items-center gap-4 rounded-3 border border-hairline bg-surface-1 px-4 py-5 @min-[36rem]/export-recipe:flex">
      <FileGlyph
        layout={fmt?.layout ?? "csv"}
        ext={fmt?.ext ?? "csv"}
        fraction={fraction}
        glyph={glyphStyle}
        state={glyphState}
        progress={0}
        size="lg"
        motionSafe={motionSafe}
      />
      {figures(true)}
      <p
        className="max-w-full truncate font-mono text-[11px] text-ink-2"
        title={fileName}
      >
        {fileName}
      </p>
      {sheets > 1 ? (
        <p className="text-center text-[11px] leading-4 text-ink-3">
          One sheet holds {grouped(fmt?.maxRows ?? 0)} rows; this splits into{" "}
          {sheets} sheets.
        </p>
      ) : null}
    </div>
  );

  const compactFile = (
    <div className="flex items-center gap-3 rounded-3 border border-hairline bg-surface-1 px-3 py-2.5 @min-[36rem]/export-recipe:hidden">
      <FileGlyph
        layout={fmt?.layout ?? "csv"}
        ext={fmt?.ext ?? "csv"}
        fraction={fraction}
        glyph={glyphStyle}
        state={glyphState}
        progress={0}
        size="sm"
        motionSafe={motionSafe}
      />
      <div className="min-w-0 flex-1">
        {figures(false)}
        <p
          className="truncate font-mono text-[10px] text-ink-3"
          title={fileName}
        >
          {fileName}
          {sheets > 1 ? ` · ${sheets} sheets` : ""}
        </p>
      </div>
    </div>
  );

  const recipeView = (
    <div className="grid grid-cols-1 gap-4 @min-[36rem]/export-recipe:grid-cols-[minmax(0,1fr)_13.5rem] @min-[36rem]/export-recipe:gap-5">
      <div className={cn("flex min-w-0 flex-col", d.section)}>
        {compactFile}
        {formatCards}
        {rangeChips}
        {columnChecks}
        <div>
          {optionChecks}
          <Measured glide={motionSafe}>
            {deliveryBlock ? <div className="pt-4">{deliveryBlock}</div> : null}
          </Measured>
        </div>
      </div>
      <div className="hidden @min-[36rem]/export-recipe:block">
        <div className="sticky top-0">{filePanel}</div>
      </div>
    </div>
  );

  const stageIndex = STAGES.findIndex((s) => s.id === stage);
  const stagesShown = STAGES.filter((s) => s.id !== "compress" || recipe.gzip);
  const written = Math.round(
    clamp01((progress - 0.14) / (recipe.gzip ? 0.72 : 0.86)) * rows,
  );

  const progressView = (
    <div className="flex flex-col items-center gap-5 py-4 @min-[36rem]/export-recipe:flex-row @min-[36rem]/export-recipe:items-center @min-[36rem]/export-recipe:gap-8 @min-[36rem]/export-recipe:px-4">
      <FileGlyph
        layout={fmt?.layout ?? "csv"}
        ext={fmt?.ext ?? "csv"}
        fraction={fraction}
        glyph={glyphStyle}
        state={glyphState}
        progress={
          phase === "running" ? progress : phase === "failed" ? progress : 1
        }
        size="lg"
        motionSafe={motionSafe}
      />
      <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
        {phase === "running" ? (
          <>
            <div
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-valuetext={`${Math.round(progress * 100)} percent, ${STAGES[stageIndex]?.label.toLowerCase() ?? ""}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="text-[13px] font-medium text-foreground">
                {STAGES[stageIndex]?.label}
              </span>
              <span className="font-mono text-[12px] text-ink-2 tabular-nums">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <ol className="flex flex-col gap-1.5">
              {stagesShown.map((s) => {
                const at = STAGES.findIndex((x) => x.id === s.id);
                const doneStage = at < stageIndex;
                const now = at === stageIndex;
                return (
                  <li
                    key={s.id}
                    className="flex h-6 items-center gap-2 text-[13px]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        doneStage
                          ? "border-(--er-fill) bg-(--er-fill) text-white"
                          : now
                            ? "border-(--er-accent)"
                            : "border-hairline-strong",
                      )}
                    >
                      {doneStage ? (
                        <svg viewBox="0 0 16 16" className="size-2.5">
                          <motion.path
                            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            initial={{ pathLength: motionSafe ? 0 : 1 }}
                            animate={{ pathLength: 1 }}
                            transition={
                              motionSafe ? springs.flick : { duration: 0 }
                            }
                          />
                        </svg>
                      ) : now ? (
                        <span className="size-1.5 rounded-full bg-(--er-accent)" />
                      ) : null}
                    </span>
                    <span
                      className={
                        doneStage || now ? "text-foreground" : "text-ink-3"
                      }
                    >
                      {s.label}
                    </span>
                    {s.id === "write" && (now || doneStage) ? (
                      <span className="ml-auto font-mono text-[11px] text-ink-3 tabular-nums">
                        {grouped(doneStage ? rows : written)} /{" "}
                        {compactCount(rows)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        ) : phase === "failed" ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[14px] font-medium text-foreground">
              The export stopped at {Math.round(progress * 100)}%
            </p>
            <p className="text-[13px] leading-5 text-danger">{failure}</p>
            <p className="text-[12px] text-ink-3">
              Your choices are kept: {fmt?.label}, {rng?.label},{" "}
              {chosenCols.length} columns.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <p className="text-[14px] font-medium text-foreground">
              {phase === "sent" ? "On its way" : "Your file is ready"}
            </p>
            <p
              className="truncate font-mono text-[12px] text-ink-2"
              title={file?.name}
            >
              {file?.name ?? fileName}
            </p>
            <p className="text-[12px] text-ink-3 tabular-nums">
              {grouped(rows)} rows · {chosenCols.length} columns ·{" "}
              {sizeText(file?.bytes ?? bytes)}
              {file && Math.abs(file.bytes - bytes) > bytes * 0.005
                ? ` (estimated ${sizeText(bytes)})`
                : ""}
            </p>
            {phase === "sent" ? (
              <p className="text-[12px] leading-4 text-ink-2">
                A download link goes to {email}. It works for seven days.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  const body =
    status === "loading" ? (
      <div aria-busy="true" className="flex flex-col gap-3 py-2">
        <span className="sr-only">Counting rows.</span>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            aria-hidden
            className="h-10 rounded-3 bg-surface-2 motion-safe:animate-pulse"
            style={{ width: `${92 - i * 14}%` }}
          />
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">
          The readings table did not load.
        </p>
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div className="grid [grid-template-areas:'view']">
        <AnimatePresence initial={false}>
          <motion.div
            key={phase === "recipe" ? "recipe" : "progress"}
            className="min-w-0 [grid-area:view]"
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              opacity: tween,
              y: motionSafe ? springs.glide : { duration: 0 },
            }}
          >
            {phase === "recipe" ? recipeView : progressView}
          </motion.div>
        </AnimatePresence>
      </div>
    );

  const primaryLabel =
    phase === "recipe"
      ? delivery === "email"
        ? `Export and email ${compactCount(rows)} rows`
        : `Export ${compactCount(rows)} rows`
      : phase === "running"
        ? `Exporting ${Math.round(progress * 100)}%`
        : phase === "ready"
          ? "Download"
          : phase === "sent"
            ? "Done"
            : "Try again";
  const secondaryLabel =
    phase === "recipe" || phase === "running"
      ? "Cancel"
      : phase === "failed"
        ? "Change options"
        : "New export";
  const primaryHeld =
    disabled ||
    !ready ||
    phase === "running" ||
    (phase === "recipe" && chosenCols.length === 0);

  const onPrimary = () => {
    if (primaryHeld) return;
    if (phase === "recipe" || phase === "failed") run();
    else if (phase === "ready") {
      if (file) onDownload?.(file);
      say(`Downloading ${file?.name ?? "the file"}.`);
    } else if (phase === "sent") onClose?.();
  };
  const onSecondary = () => {
    if (phase === "recipe" || phase === "running") cancel();
    else back();
  };

  const button =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[13px] font-medium transition-[background-color,color,opacity]";

  return (
    <div
      ref={setRoot}
      role="dialog"
      aria-modal={modal || undefined}
      aria-labelledby={titleId}
      aria-describedby={estimateId}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container/export-recipe relative flex max-h-[35rem] w-full flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_16%,transparent)]",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          "--er-accent": accent,
          "--er-fill": `oklch(from ${accent} 0.6 0.15 h)`,
          "--er-ok": "oklch(from var(--success) 0.62 0.15 h)",
          "--er-danger": "oklch(from var(--danger) 0.6 0.19 h)",
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-hairline px-4 py-3.5 @min-[30rem]/export-recipe:px-5">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-3 bg-[color-mix(in_oklab,var(--er-accent)_13%,transparent)] text-(--er-accent)"
        >
          <FileDown className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
            {title}
          </h2>
          <p
            className="truncate text-[12px] leading-5 text-ink-3"
            title={tableName}
          >
            {tableName}
          </p>
        </div>
      </header>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <Measured glide={motionSafe}>
          <div className="px-4 py-4 @min-[30rem]/export-recipe:px-5">
            {body}
          </div>
        </Measured>
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline bg-surface-1 px-4 py-3 @min-[30rem]/export-recipe:px-5">
        {phase === "recipe" && ready ? (
          <p className="mr-auto hidden min-w-0 truncate text-[12px] text-ink-3 @min-[30rem]/export-recipe:block">
            {chosenCols.length === 0
              ? "Choose at least one column"
              : delivery === "email"
                ? `Emailed to ${email}`
                : `Saves as ${fileName}`}
          </p>
        ) : null}
        <button
          key="secondary"
          type="button"
          onClick={onSecondary}
          aria-disabled={disabled || undefined}
          className={cn(
            button,
            "border border-hairline bg-card text-foreground hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          {secondaryLabel}
        </button>
        <button
          key="primary"
          type="button"
          onClick={onPrimary}
          aria-disabled={primaryHeld || undefined}
          aria-busy={phase === "running" || undefined}
          className={cn(
            button,
            "min-w-36 bg-primary text-primary-foreground hover:opacity-90 aria-disabled:opacity-60",
            FOCUS_RING,
          )}
        >
          {phase === "ready" ? (
            <Download aria-hidden className="size-3.5" />
          ) : phase === "failed" ? (
            <RotateCcw aria-hidden className="size-3.5" />
          ) : null}
          <span className="tabular-nums">{primaryLabel}</span>
        </button>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
