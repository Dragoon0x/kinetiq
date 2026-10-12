"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  FileImage,
  Inbox,
  RotateCcw,
  ScanLine,
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

export type ReceiptField =
  "merchant" | "date" | "total" | "tax" | "category" | "paymentMethod" | "note";

export type ReceiptConfidence = "high" | "medium" | "low";
export type ReceiptConfidenceMode = "tint" | "badge" | "none";
export type ReceiptDensity = "compact" | "cozy" | "roomy";
export type ReceiptAccent = "cobalt" | "signal" | "ink";
export type ReceiptStart = "empty" | "scan" | "scanned";
export type ReceiptStatus = "ready" | "loading" | "error";

/** What is printed on the receipt; the preview is drawn from it. */
export type ReceiptPaper = {
  merchant: string;
  address: string;
  /** A line under the address, e.g. "Table 6 - served by Mara". */
  served: string;
  /** The date and time as printed. */
  dateLine: string;
  /** The receipt's own number, e.g. "#0418". */
  ref: string;
  lines: { id: string; label: string; amount: number }[];
  subtotal: number;
  taxLabel: string;
  tax: number;
  total: number;
  /** The tender line, e.g. "VISA **** 4421". */
  paid: string;
  footer: string;
};

/** A printed region the reader can point at. */
export type ReceiptRegion =
  "merchant" | "date" | "total" | "tax" | "paid" | `line:${string}`;

export type ReceiptDetection = {
  field: ReceiptField;
  /** The value as read; it fills the field. */
  value: string;
  /** How sure the reader is, 0 to 1. */
  score: number;
  /** Where on the receipt it was read from; an inferred field has none. */
  region?: ReceiptRegion;
};

export type ReceiptItemDetection = {
  /** Matches a printed line's id when the item was read from one. */
  id: string;
  label: string;
  amount: number;
  /** How sure the reader is, 0 to 1. */
  score: number;
};

/** The receipt's printed content and what the reader found on it. */
export type ReceiptScan = {
  paper: ReceiptPaper;
  fields: ReceiptDetection[];
  items: ReceiptItemDetection[];
};

export type ReceiptItem = { id: string; label: string; amount: string };

export type ReceiptValue = {
  merchant: string;
  date: string;
  total: string;
  tax: string;
  category: string;
  paymentMethod: string;
  note: string;
  items: ReceiptItem[];
  /** Fields the user corrected or confirmed; their flags are cleared. */
  confirmed: ReceiptField[];
  /** Items the user corrected. */
  confirmedItems: string[];
};

export type ReceiptChange =
  | { kind: "scan" }
  | { kind: "edit"; field: ReceiptField }
  | { kind: "confirm"; field: ReceiptField }
  | { kind: "item"; itemId: string }
  | { kind: "fix" }
  | { kind: "clear" };

/** What the reader knows about a dropped or chosen file. */
export type ReceiptFile = { name: string; size: number; type: string };

export type ReceiptReaderProps = {
  /** How a field's confidence shows: a tint on the field, a small percentage badge, or not at all. Low fields ask to be confirmed in every mode. @default "tint" */
  confidence?: ReceiptConfidenceMode;
  /** Row heights, type size and spacing. @default "cozy" */
  density?: ReceiptDensity;
  /** The colour of the scan line, the linked box and field, and the submitted stamp. @default "cobalt" */
  accent?: ReceiptAccent;
  /** The receipt's printed content and what the reader found on it. @default defaultReceiptScan */
  receipt?: ReceiptScan;
  /** The categories the Category field offers. @default defaultReceiptCategories */
  categories?: string[];
  /** Controlled form value. */
  value?: ReceiptValue;
  /** Initial form value when uncontrolled. @default filled from the receipt when start is "scanned", empty otherwise */
  defaultValue?: ReceiptValue;
  /** Fires after every edit, confirmation, fix, scan and clear, with the whole form. */
  onChange?: (value: ReceiptValue, change: ReceiptChange) => void;
  /** Reads a dropped or chosen file. The default waits a moment and returns `receipt`; reject to show the failed state. */
  onScan?: (file: ReceiptFile) => Promise<ReceiptScan>;
  /** Submit was pressed with every flagged field confirmed and the items adding up. */
  onSubmit?: (value: ReceiptValue, scan: ReceiptScan) => void;
  /** Where the reader begins: at the drop zone, reading the seeded file as soon as it is on screen, or with the receipt already read. @default "scanned" */
  start?: ReceiptStart;
  /** The file the reader starts with when `start` is not "empty". @default defaultReceiptFile */
  file?: ReceiptFile;
  /** Printed beside the amounts. @default "USD" */
  currency?: string;
  /** Whether the reader has loaded. @default "ready" */
  status?: ReceiptStatus;
  /** Try again was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "New expense" */
  title?: string;
  /** The product named over the heading. @default "Basinworks Expenses" */
  workspace?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the reader in px; the receipt and the form scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be dropped, edited or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** A Friday lunch at Fernmoor Coffee House, paid by card. */
export const defaultReceiptPaper: ReceiptPaper = {
  merchant: "Fernmoor Coffee House",
  address: "14 Quay Lane, Coldbrook",
  served: "Table 6 - served by Mara",
  dateLine: "09/10/2026 12:41",
  ref: "#0418",
  lines: [
    { id: "flat-white", label: "Flat white x2", amount: 7.8 },
    { id: "bun", label: "Cardamom bun", amount: 4.2 },
    { id: "shakshuka", label: "Shakshuka", amount: 12.6 },
    { id: "water", label: "Sparkling water", amount: 3.4 },
  ],
  subtotal: 28,
  taxLabel: "Service 10%",
  tax: 2.8,
  total: 30.8,
  paid: "VISA **** 4421",
  footer: "Thank you, come again",
};

/**
 * What the reader found: the merchant and tender read cleanly, the day and
 * month could be either way round, and the total is smudged and misread.
 */
export const defaultReceiptScan: ReceiptScan = {
  paper: defaultReceiptPaper,
  fields: [
    {
      field: "merchant",
      value: "Fernmoor Coffee House",
      score: 0.97,
      region: "merchant",
    },
    { field: "date", value: "2026-10-09", score: 0.71, region: "date" },
    { field: "total", value: "36.80", score: 0.42, region: "total" },
    { field: "tax", value: "2.80", score: 0.92, region: "tax" },
    { field: "category", value: "Meals", score: 0.68 },
    { field: "paymentMethod", value: "Visa 4421", score: 0.95, region: "paid" },
  ],
  items: [
    { id: "flat-white", label: "Flat white x2", amount: 7.8, score: 0.9 },
    { id: "bun", label: "Cardamom bun", amount: 4.2, score: 0.94 },
    { id: "shakshuka", label: "Shakshuka", amount: 12.6, score: 0.88 },
    { id: "water", label: "Sparkling water", amount: 3.4, score: 0.63 },
  ],
};

export const defaultReceiptCategories = [
  "Meals",
  "Travel",
  "Lodging",
  "Supplies",
  "Software",
  "Other",
];

export const defaultReceiptFile: ReceiptFile = {
  name: "IMG_2041.jpg",
  size: 1_284_310,
  type: "image/jpeg",
};

export const emptyReceiptValue: ReceiptValue = {
  merchant: "",
  date: "",
  total: "",
  tax: "",
  category: "",
  paymentMethod: "",
  note: "",
  items: [],
  confirmed: [],
  confirmedItems: [],
};

const money = (n: number) => n.toFixed(2);

/** The form a scan fills: every detected field and item, nothing confirmed. */
export const valueFromReceipt = (scan: ReceiptScan): ReceiptValue => {
  const next: ReceiptValue = {
    ...emptyReceiptValue,
    items: scan.items.map((it) => ({
      id: it.id,
      label: it.label,
      amount: money(it.amount),
    })),
  };
  for (const d of scan.fields) next[d.field] = d.value;
  return next;
};

export const defaultReceiptValue: ReceiptValue =
  valueFromReceipt(defaultReceiptScan);

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<ReceiptAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink-2)",
};

const LEVEL_COLOR: Record<ReceiptConfidence, string> = {
  high: "var(--rr-accent)",
  medium: "var(--warn)",
  low: "var(--danger)",
};

const LEVEL_WORD: Record<ReceiptConfidence, string> = {
  high: "read clearly",
  medium: "read with some doubt",
  low: "needs checking",
};

type FieldKind = "text" | "money" | "date" | "select" | "note";

type FieldDef = {
  key: ReceiptField;
  label: string;
  placeholder: string;
  kind: FieldKind;
  wide: boolean;
};

const FIELD_DEFS: FieldDef[] = [
  {
    key: "merchant",
    label: "Merchant",
    placeholder: "Where it was",
    kind: "text",
    wide: true,
  },
  {
    key: "date",
    label: "Date",
    placeholder: "YYYY-MM-DD",
    kind: "date",
    wide: false,
  },
  {
    key: "total",
    label: "Total",
    placeholder: "0.00",
    kind: "money",
    wide: false,
  },
  { key: "tax", label: "Tax", placeholder: "0.00", kind: "money", wide: false },
  {
    key: "category",
    label: "Category",
    placeholder: "Choose one",
    kind: "select",
    wide: false,
  },
  {
    key: "paymentMethod",
    label: "Paid with",
    placeholder: "Card or cash",
    kind: "text",
    wide: false,
  },
  {
    key: "note",
    label: "Note",
    placeholder: "Who it was with, what it was for",
    kind: "note",
    wide: true,
  },
];

const FIELD_LABEL: Record<ReceiptField, string> = Object.fromEntries(
  FIELD_DEFS.map((d) => [d.key, d.label]),
) as Record<ReceiptField, string>;

const DENSITY: Record<
  ReceiptDensity,
  {
    control: string;
    text: string;
    grid: string;
    pad: string;
    cell: string;
    labelGap: string;
  }
> = {
  compact: {
    control: "h-7",
    text: "text-[12px]",
    grid: "gap-x-3 gap-y-2",
    pad: "px-3 py-2.5",
    cell: "py-0.5",
    labelGap: "mb-0.5",
  },
  cozy: {
    control: "h-8",
    text: "text-[13px]",
    grid: "gap-x-3 gap-y-3",
    pad: "px-4 py-3",
    cell: "py-1",
    labelGap: "mb-1",
  },
  roomy: {
    control: "h-9",
    text: "text-sm",
    grid: "gap-x-4 gap-y-4",
    pad: "px-5 py-4",
    cell: "py-1.5",
    labelGap: "mb-1.5",
  },
};

/** Sweep length: springs.glide settles in about this long. */
const SWEEP_MS = 560;
/** The default simulator's read time. */
const SIM_MS = 760;
/** The fields begin filling this long after the boxes start drawing, in s. */
const FIELD_LEAD = 0.14;
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.2;

const r3 = (v: number) => Number(v.toFixed(3));
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Buckets a score: 0.85 and up is high, 0.6 and up medium, the rest low. */
export const confidenceOf = (score: number): ReceiptConfidence =>
  score >= 0.85 ? "high" : score >= 0.6 ? "medium" : "low";

const parseMoney = (text: string): number | null => {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const fileSize = (bytes: number) =>
  bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1000))} KB`;

/** Items plus tax against the form's total. Nothing to compare returns null. */
export const receiptSums = (value: ReceiptValue) => {
  let items = 0;
  let ok = value.items.length > 0;
  for (const it of value.items) {
    const n = parseMoney(it.amount);
    if (n === null) ok = false;
    else items += n;
  }
  const tax = value.tax.trim() ? parseMoney(value.tax) : 0;
  const total = parseMoney(value.total);
  if (!ok || tax === null || total === null) {
    return { items: round2(items), expected: null, diff: null };
  }
  const expected = round2(items + tax);
  return { items: round2(items), expected, diff: round2(total - expected) };
};

/* ----------------------------------------------------------------------- */
/*                               Paper layout                               */
/* ----------------------------------------------------------------------- */

type Box = { x: number; y: number; w: number; h: number };
type Tone = "ink" | "ink-2" | "ink-3";
type PaperText = {
  key: string;
  x: number;
  y: number;
  text: string;
  size: number;
  anchor: "start" | "middle" | "end";
  weight?: number;
  tone: Tone;
};
type PaperLayout = {
  height: number;
  texts: PaperText[];
  rules: number[];
  bars: { x: number; w: number }[];
  barsY: number;
  boxes: Partial<Record<string, Box>>;
  logo: { cx: number; cy: number; r: number; initials: string };
};

/** The paper is 200 units wide; everything else is laid out from that. */
const PW = 200;
const PAD = 14;
/** A mono glyph's advance, in em. */
const CH = 0.6;
const textW = (s: string, size: number) => s.length * size * CH;
const boxAround = (x: number, base: number, w: number, size: number): Box => ({
  x: x - 3,
  y: base - size - 1.5,
  w: w + 6,
  h: size + 5,
});

const TONE_FILL: Record<Tone, string> = {
  ink: "var(--ink)",
  "ink-2": "var(--ink-2)",
  "ink-3": "var(--ink-3)",
};

/** Lays the printed receipt out once; the boxes come from the same rows. */
export function layoutPaper(paper: ReceiptPaper): PaperLayout {
  const texts: PaperText[] = [];
  const rules: number[] = [];
  const boxes: Partial<Record<string, Box>> = {};
  const initials = paper.merchant
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const logo = { cx: 100, cy: 20, r: 8, initials };

  let y = 42;
  const nameW = textW(paper.merchant, 9);
  texts.push({
    key: "merchant",
    x: 100,
    y,
    text: paper.merchant,
    size: 9,
    anchor: "middle",
    weight: 600,
    tone: "ink",
  });
  boxes.merchant = boxAround(100 - nameW / 2, y, nameW, 9);

  y += 10;
  texts.push({
    key: "address",
    x: 100,
    y,
    text: paper.address,
    size: 5.5,
    anchor: "middle",
    tone: "ink-3",
  });
  y += 8;
  texts.push({
    key: "served",
    x: 100,
    y,
    text: paper.served,
    size: 5.5,
    anchor: "middle",
    tone: "ink-3",
  });

  y += 13;
  texts.push({
    key: "date",
    x: PAD,
    y,
    text: paper.dateLine,
    size: 5.5,
    anchor: "start",
    tone: "ink-2",
  });
  texts.push({
    key: "ref",
    x: PW - PAD,
    y,
    text: paper.ref,
    size: 5.5,
    anchor: "end",
    tone: "ink-3",
  });
  boxes.date = boxAround(PAD, y, textW(paper.dateLine, 5.5), 5.5);

  y += 7;
  rules.push(y);
  y += 12;
  for (const line of paper.lines) {
    texts.push({
      key: `line:${line.id}:label`,
      x: PAD,
      y,
      text: line.label,
      size: 6.5,
      anchor: "start",
      tone: "ink",
    });
    texts.push({
      key: `line:${line.id}:amount`,
      x: PW - PAD,
      y,
      text: money(line.amount),
      size: 6.5,
      anchor: "end",
      tone: "ink",
    });
    boxes[`line:${line.id}`] = boxAround(PAD, y, PW - PAD * 2, 6.5);
    y += 12;
  }
  y -= 5;
  rules.push(y);

  y += 11;
  texts.push({
    key: "subtotal",
    x: PAD,
    y,
    text: "Subtotal",
    size: 6.5,
    anchor: "start",
    tone: "ink-2",
  });
  texts.push({
    key: "subtotal:amount",
    x: PW - PAD,
    y,
    text: money(paper.subtotal),
    size: 6.5,
    anchor: "end",
    tone: "ink-2",
  });
  y += 11;
  texts.push({
    key: "tax",
    x: PAD,
    y,
    text: paper.taxLabel,
    size: 6.5,
    anchor: "start",
    tone: "ink-2",
  });
  const taxText = money(paper.tax);
  texts.push({
    key: "tax:amount",
    x: PW - PAD,
    y,
    text: taxText,
    size: 6.5,
    anchor: "end",
    tone: "ink-2",
  });
  boxes.tax = boxAround(
    PW - PAD - textW(taxText, 6.5),
    y,
    textW(taxText, 6.5),
    6.5,
  );
  y += 7;
  rules.push(y);

  y += 12;
  texts.push({
    key: "total",
    x: PAD,
    y,
    text: "TOTAL",
    size: 8,
    anchor: "start",
    weight: 600,
    tone: "ink",
  });
  const totalText = money(paper.total);
  texts.push({
    key: "total:amount",
    x: PW - PAD,
    y,
    text: totalText,
    size: 8,
    anchor: "end",
    weight: 600,
    tone: "ink",
  });
  boxes.total = boxAround(
    PW - PAD - textW(totalText, 8),
    y,
    textW(totalText, 8),
    8,
  );

  y += 15;
  texts.push({
    key: "paid",
    x: PAD,
    y,
    text: paper.paid,
    size: 6,
    anchor: "start",
    tone: "ink-2",
  });
  texts.push({
    key: "approved",
    x: PW - PAD,
    y,
    text: "APPROVED",
    size: 5.5,
    anchor: "end",
    tone: "ink-3",
  });
  boxes.paid = boxAround(PAD, y, textW(paper.paid, 6), 6);

  y += 15;
  texts.push({
    key: "footer",
    x: 100,
    y,
    text: paper.footer,
    size: 5.5,
    anchor: "middle",
    tone: "ink-3",
  });

  y += 8;
  const barsY = y;
  const seedText = `${paper.ref}${paper.merchant}${paper.dateLine}`;
  const bars: { x: number; w: number }[] = [];
  let bx = 34;
  for (let i = 0; bx < PW - 34; i += 1) {
    const code = seedText.charCodeAt(i % seedText.length);
    const w = ((code * 7 + i * 3) % 3) * 0.7 + 0.8;
    bars.push({ x: bx, w });
    bx += w + 1.6 + ((code + i) % 2) * 0.9;
  }
  y += 12;

  y += 12;
  return { height: y, texts, rules, bars, barsY, boxes, logo };
}

const tornEdge = (height: number) => {
  const pts: string[] = ["0,0", `${PW},0`];
  const depth = 3;
  const tooth = 8;
  let x = PW;
  let up = false;
  while (x > 0) {
    x = Math.max(0, x - tooth / 2);
    pts.push(`${x},${height - (up ? depth : 0)}`);
    up = !up;
  }
  return pts.join(" ");
};

const rectPath = (w: number, h: number) => `M 0 0 H ${w} V ${h} H 0 Z`;

/* ----------------------------------------------------------------------- */
/*                              Small pieces                                */
/* ----------------------------------------------------------------------- */

/** An amount whose digits roll on springs.snap; the point and sign stay put. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        const key = chars.length - 1 - i;
        if (!DIGITS.includes(c)) {
          return (
            <span key={`s${key}`} className="inline-block">
              {c}
            </span>
          );
        }
        return (
          <span
            key={key}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/** A check that draws itself on springs.flick. */
function DrawnCheck({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3.5", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      />
    </svg>
  );
}

function Paper({ layout, smudges }: { layout: PaperLayout; smudges: Box[] }) {
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${PW} ${layout.height}`}
      className="block h-auto w-full select-none"
      style={{
        filter:
          "drop-shadow(0 8px 18px color-mix(in oklab, black 22%, transparent))",
      }}
    >
      <polygon
        points={tornEdge(layout.height)}
        fill="var(--bg-2)"
        stroke="var(--hairline)"
        strokeWidth={0.5}
      />
      <circle
        cx={layout.logo.cx}
        cy={layout.logo.cy}
        r={layout.logo.r}
        fill="none"
        stroke="var(--ink-2)"
        strokeWidth={0.8}
      />
      <text
        x={layout.logo.cx}
        y={layout.logo.cy + 2.4}
        fontSize={6.5}
        fontWeight={600}
        textAnchor="middle"
        className="font-mono"
        fill="var(--ink-2)"
      >
        {layout.logo.initials}
      </text>
      {layout.texts.map((t) => (
        <text
          key={t.key}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          fontWeight={t.weight}
          textAnchor={t.anchor}
          className="font-mono"
          fill={TONE_FILL[t.tone]}
        >
          {t.text}
        </text>
      ))}
      {layout.rules.map((y) => (
        <line
          key={y}
          x1={PAD}
          x2={PW - PAD}
          y1={y}
          y2={y}
          stroke="var(--hairline-strong)"
          strokeWidth={0.6}
          strokeDasharray="2 2"
        />
      ))}
      {layout.bars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={layout.barsY}
          width={b.w}
          height={12}
          fill="var(--ink-2)"
        />
      ))}
      {smudges.map((b, i) => (
        <ellipse
          key={i}
          cx={b.x + b.w * 0.55}
          cy={b.y + b.h * 0.5}
          rx={b.w * 0.5}
          ry={b.h * 0.8}
          fill="color-mix(in oklab, var(--ink) 14%, transparent)"
        />
      ))}
    </svg>
  );
}

type Region = {
  key: HotKey;
  box: Box;
  level: ReceiptConfidence;
  name: string;
  value: string;
};

type HotKey = `f:${ReceiptField}` | `i:${string}`;

function RegionButton({
  region,
  height,
  hot,
  draw,
  delay,
  tintBoxes,
  motionSafe,
  tabIndex,
  inert,
  nodeRef,
  onHot,
  onPress,
  onFocus,
  onNav,
}: {
  region: Region;
  height: number;
  hot: boolean;
  /** Draw in on mount, as a fresh scan does; false places it at once. */
  draw: boolean;
  delay: number;
  tintBoxes: boolean;
  motionSafe: boolean;
  tabIndex: number;
  inert: boolean;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onHot: (hot: boolean) => void;
  onPress: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
}) {
  const { box } = region;
  const color = tintBoxes ? LEVEL_COLOR[region.level] : "var(--rr-accent)";
  return (
    <motion.button
      ref={nodeRef}
      type="button"
      tabIndex={tabIndex}
      aria-label={`${region.name}: ${region.value}, ${LEVEL_WORD[region.level]}. Press to edit the field.`}
      aria-disabled={inert || undefined}
      onPointerEnter={() => onHot(true)}
      onPointerLeave={() => onHot(false)}
      onFocus={() => {
        onFocus();
        onHot(true);
      }}
      onBlur={() => onHot(false)}
      onClick={onPress}
      onKeyDown={onNav}
      initial={draw ? { opacity: 0 } : false}
      animate={{ opacity: 1, scale: hot && motionSafe ? 1.04 : 1 }}
      transition={{
        opacity: { duration: durations.fast, delay: motionSafe ? delay : 0 },
        scale: motionSafe ? springs.snap : { duration: 0 },
      }}
      style={{
        left: `${(box.x / PW) * 100}%`,
        top: `${(box.y / height) * 100}%`,
        width: `${(box.w / PW) * 100}%`,
        height: `${(box.h / height) * 100}%`,
        ["--rr-box" as string]: color,
      }}
      className={cn(
        "absolute block rounded-[2px] focus-visible:outline-offset-1",
        inert ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-[2px] bg-(--rr-box)"
        initial={false}
        animate={{ opacity: hot ? 0.18 : 0.06 }}
        transition={{ duration: durations.fast }}
      />
      <svg
        aria-hidden
        viewBox={`0 0 ${box.w} ${box.h}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <motion.path
          d={rectPath(box.w, box.h)}
          fill="none"
          stroke="var(--rr-box)"
          strokeWidth={hot ? 2 : 1.25}
          vectorEffect="non-scaling-stroke"
          initial={draw && motionSafe ? { pathLength: 0 } : false}
          animate={{ pathLength: 1 }}
          transition={
            motionSafe ? { ...springs.flick, delay } : { duration: 0 }
          }
        />
      </svg>
    </motion.button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Fields                                  */
/* ----------------------------------------------------------------------- */

type FieldRowProps = {
  def: FieldDef;
  id: string;
  text: string;
  detection: ReceiptDetection | undefined;
  confirmed: boolean;
  mode: ReceiptConfidenceMode;
  density: ReceiptDensity;
  categories: string[];
  hot: boolean;
  motionSafe: boolean;
  inert: boolean;
  /** Changes when a scan lands, so the row plays its fill again. */
  seq: number;
  delay: number;
  nodeRef: (node: HTMLInputElement | HTMLSelectElement | null) => void;
  onText: (text: string) => void;
  onConfirm: () => void;
  onHot: (hot: boolean) => void;
};

function FieldRow({
  def,
  id,
  text,
  detection,
  confirmed,
  mode,
  density,
  categories,
  hot,
  motionSafe,
  inert,
  seq,
  delay,
  nodeRef,
  onText,
  onConfirm,
  onHot,
}: FieldRowProps) {
  const d = DENSITY[density];
  const [focused, setFocused] = React.useState(false);
  const level = detection ? confidenceOf(detection.score) : null;
  const flagged = level !== null && level !== "high" && !confirmed;
  const needsCheck = level === "low" && !confirmed;
  const tinted = mode === "tint" && flagged;
  const tintColor = level ? LEVEL_COLOR[level] : "transparent";
  const helpId = `${id}-help`;
  const control = cn(
    "w-full min-w-0 bg-transparent px-2.5 text-foreground placeholder:text-ink-3",
    d.control,
    d.text,
    FOCUS_RING,
    def.kind === "money" && "font-mono tabular-nums",
    inert && "cursor-default",
  );
  const options =
    text && !categories.includes(text) ? [text, ...categories] : categories;

  return (
    <motion.div
      key={seq}
      initial={
        seq > 0 ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              delay,
              opacity: { duration: durations.base, ease: easings.enter, delay },
            }
          : { duration: durations.fast }
      }
      className={cn("flex min-w-0 flex-col", def.wide && "col-span-full")}
    >
      <div
        className={cn("flex items-center justify-between gap-2", d.labelGap)}
      >
        <label
          htmlFor={id}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {def.label}
        </label>
        <span className="flex h-4 items-center gap-1.5">
          {mode === "badge" && level && !confirmed ? (
            <span
              className="font-mono text-[10px] tabular-nums"
              style={{ color: LEVEL_COLOR[level] }}
              aria-label={`${Math.round((detection?.score ?? 0) * 100)} percent sure`}
            >
              {Math.round((detection?.score ?? 0) * 100)}%
            </span>
          ) : null}
          {confirmed && level && level !== "high" ? (
            <span className="flex items-center gap-1 text-success">
              <DrawnCheck motionSafe={motionSafe} className="size-3" />
              <span className="sr-only">confirmed</span>
            </span>
          ) : null}
          {needsCheck ? (
            <button
              type="button"
              onClick={onConfirm}
              aria-disabled={inert || undefined}
              aria-describedby={helpId}
              className={cn(
                "inline-flex h-5 items-center gap-1 rounded-1 border px-1.5 font-mono text-[10px] tracking-[0.04em] text-foreground transition-colors",
                inert ? "cursor-default" : "hover:bg-surface-2",
                FOCUS_RING,
              )}
              style={{
                borderColor:
                  "color-mix(in oklab, var(--danger) 45%, transparent)",
              }}
            >
              <Check aria-hidden className="size-3" />
              Confirm
            </button>
          ) : null}
        </span>
      </div>

      <div
        className="relative rounded-2 border border-input bg-surface-0"
        onPointerEnter={() => onHot(true)}
        onPointerLeave={() => {
          // A focused field keeps its box lit until focus leaves it.
          if (!focused) onHot(false);
        }}
      >
        {def.kind === "select" ? (
          <select
            ref={nodeRef}
            id={id}
            value={text}
            disabled={inert}
            aria-invalid={needsCheck || undefined}
            aria-describedby={needsCheck ? helpId : undefined}
            onChange={(event) => onText(event.target.value)}
            onFocus={() => {
              setFocused(true);
              onHot(true);
            }}
            onBlur={() => {
              setFocused(false);
              onHot(false);
            }}
            className={cn(control, "appearance-none rounded-2 pr-7")}
          >
            <option value="">{def.placeholder}</option>
            {options.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={nodeRef}
            id={id}
            type="text"
            value={text}
            placeholder={def.placeholder}
            inputMode={def.kind === "money" ? "decimal" : undefined}
            autoComplete="off"
            readOnly={inert}
            aria-invalid={needsCheck || undefined}
            aria-describedby={needsCheck ? helpId : undefined}
            onChange={(event) => onText(event.target.value)}
            onFocus={() => {
              setFocused(true);
              onHot(true);
            }}
            onBlur={() => {
              setFocused(false);
              onHot(false);
            }}
            className={cn(control, "rounded-2")}
          />
        )}
        {def.kind === "select" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[10px] text-ink-3"
          >
            v
          </span>
        ) : null}
        {/* The confidence tint: a coloured hairline and wash that clears on
            flick once the field is corrected or confirmed. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2 border"
          style={{
            borderColor: `color-mix(in oklab, ${tintColor} ${level === "low" ? 70 : 55}%, transparent)`,
            background: `color-mix(in oklab, ${tintColor} ${level === "low" ? 9 : 5}%, transparent)`,
          }}
          initial={false}
          animate={{ opacity: tinted ? 1 : 0 }}
          transition={motionSafe ? springs.flick : { duration: durations.fast }}
        />
        {/* The link to the receipt: shown while its box is hovered or
            focused, not while the field itself holds focus. */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2 border"
          style={{
            borderColor: "var(--rr-accent)",
            boxShadow:
              "0 0 0 3px color-mix(in oklab, var(--rr-accent) 18%, transparent)",
          }}
          initial={false}
          animate={{ opacity: hot && !focused ? 1 : 0 }}
          transition={{ duration: durations.fast }}
        />
      </div>
      <AnimatePresence initial={false}>
        {needsCheck && mode !== "none" ? (
          <motion.p
            key="help"
            id={helpId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{
              opacity: 0,
              height: 0,
              transition: exitFor(durations.fast),
            }}
            transition={{ duration: durations.fast }}
            className="overflow-hidden text-[11px] text-danger"
          >
            <span className="block pt-1">Check this against the receipt.</span>
          </motion.p>
        ) : needsCheck ? (
          <span key="sr" id={helpId} className="sr-only">
            Check this against the receipt.
          </span>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Phase = "empty" | "scanning" | "failed" | "scanned";

/**
 * An expense form filled from a receipt. On the left a drop zone takes a
 * file and becomes the receipt itself, drawn from what is printed on it; a
 * scan line sweeps it once on `springs.glide`, and as it lands a box draws
 * around every region the reader found on `springs.flick`, in a cascade. On
 * the right the form's fields fill in the same cascade, each carrying its
 * confidence: a clear field was read cleanly, an amber hairline means some
 * doubt, a red wash means check this and asks to be confirmed. Hovering or
 * focusing a field lights its box on the receipt, and each box is a button
 * that lights and focuses its field.
 *
 * Correcting or confirming a field clears its tint on flick and draws a
 * check. Under the form the items the reader found must add up, with tax,
 * to the total; when they do not, the difference rolls on `springs.snap`
 * and a Fix button sets the total to the sum. Submit waits until every
 * flagged field is confirmed and the items add up, then a stamp lands on
 * `springs.recoil`.
 *
 * Everything is native: Tab moves through the fields, the items and the
 * buttons; the receipt's boxes are one toolbar (arrows, Home/End) and Enter
 * or Space on a box focuses its field. Under reduced motion nothing sweeps,
 * draws or travels: boxes, fields and tints appear in place, and every
 * state is still announced.
 */
export function ReceiptReader({
  confidence = "tint",
  density = "cozy",
  accent = "cobalt",
  receipt = defaultReceiptScan,
  categories = defaultReceiptCategories,
  value,
  defaultValue,
  onChange,
  onScan,
  onSubmit,
  start = "scanned",
  file = defaultReceiptFile,
  currency = "USD",
  status = "ready",
  onRetry,
  title = "New expense",
  workspace = "Basinworks Expenses",
  label,
  height = 540,
  disabled = false,
  className,
}: ReceiptReaderProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const fileInputId = `${uid}-file`;
  const d = DENSITY[density];

  const [own, setOwn] = React.useState<ReceiptValue>(
    () =>
      defaultValue ??
      (start === "scanned" ? valueFromReceipt(receipt) : emptyReceiptValue),
  );
  const current = value ?? own;
  const [scan, setScan] = React.useState<ReceiptScan | null>(
    start === "scanned" ? receipt : null,
  );
  const [phase, setPhase] = React.useState<Phase>(
    start === "scanned" ? "scanned" : "empty",
  );
  const [fileInfo, setFileInfo] = React.useState<ReceiptFile | null>(
    start === "empty" ? null : file,
  );
  // Counts the scans that landed on this page; 0 means the receipt was
  // there from the first render and nothing should draw in.
  const [scanSeq, setScanSeq] = React.useState(0);
  const [submitted, setSubmitted] = React.useState<string | null>(null);
  const [hot, setHot] = React.useState<HotKey | null>(null);
  const [activeBox, setActiveBox] = React.useState<HotKey | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [paneEl, setPaneEl] = React.useState<HTMLDivElement | null>(null);
  const [paneSize, setPaneSize] = React.useState<{
    w: number;
    h: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const dropButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const fieldNodes = React.useRef(
    new Map<string, HTMLInputElement | HTMLSelectElement>(),
  );
  const boxNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const seqRef = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  const mounted = React.useRef(true);
  const autoRan = React.useRef(false);
  const prevMismatch = React.useRef<boolean | null>(null);

  const ready = status === "ready";
  const inert = disabled || !ready;

  /* ------------------------------- derived ----------------------------- */

  // The file "uploaded" is the seeded receipt, so the paper can be drawn and
  // swept before the reader has said what is on it.
  const paperModel = scan?.paper ?? receipt.paper;
  const layout = React.useMemo(() => layoutPaper(paperModel), [paperModel]);
  const detections = React.useMemo(() => {
    const map = new Map<ReceiptField, ReceiptDetection>();
    for (const det of scan?.fields ?? []) map.set(det.field, det);
    return map;
  }, [scan]);
  const itemDetections = React.useMemo(() => {
    const map = new Map<string, ReceiptItemDetection>();
    for (const it of scan?.items ?? []) map.set(it.id, it);
    return map;
  }, [scan]);

  const regions: Region[] = React.useMemo(() => {
    if (!scan) return [];
    const out: Region[] = [];
    for (const det of scan.fields) {
      const box = det.region ? layout.boxes[det.region] : undefined;
      if (!box) continue;
      out.push({
        key: `f:${det.field}`,
        box,
        level: confidenceOf(det.score),
        name: FIELD_LABEL[det.field],
        value: det.value,
      });
    }
    for (const it of scan.items) {
      const box = layout.boxes[`line:${it.id}`];
      if (!box) continue;
      out.push({
        key: `i:${it.id}`,
        box,
        level: confidenceOf(it.score),
        name: it.label,
        value: money(it.amount),
      });
    }
    return out.sort((a, b) => a.box.y - b.box.y);
  }, [scan, layout]);

  const smudges = regions.filter((r) => r.level === "low").map((r) => r.box);
  const nothingRead =
    phase === "scanned" &&
    scan !== null &&
    scan.fields.length === 0 &&
    scan.items.length === 0;

  const needs = (scan?.fields ?? [])
    .filter(
      (det) =>
        confidenceOf(det.score) === "low" &&
        !current.confirmed.includes(det.field),
    )
    .map((det) => det.field);
  const sums = receiptSums(current);
  const mismatch = sums.diff !== null && Math.abs(sums.diff) >= 0.005;
  const canSubmit =
    !inert &&
    phase === "scanned" &&
    scan !== null &&
    !nothingRead &&
    needs.length === 0 &&
    !mismatch &&
    submitted === null;

  const receiptW =
    paneSize && layout
      ? Math.max(0, Math.min(paneSize.w, (paneSize.h * PW) / layout.height))
      : null;
  const receiptH =
    receiptW !== null && layout ? (receiptW * layout.height) / PW : 0;

  /* ------------------------------ lifecycle ---------------------------- */

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  React.useEffect(() => {
    if (!paneEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const next = { w: Math.floor(rect.width), h: Math.floor(rect.height) };
      setPaneSize((prev) =>
        prev && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    });
    ro.observe(paneEl);
    return () => ro.disconnect();
  }, [paneEl]);

  // Announces when the sums start or stop matching, not on every keystroke.
  React.useEffect(() => {
    if (phase !== "scanned" || sums.diff === null) {
      prevMismatch.current = null;
      return;
    }
    if (prevMismatch.current !== null && prevMismatch.current !== mismatch) {
      setAnnouncement(
        mismatch
          ? `Items and tax come to ${money(sums.expected ?? 0)}, ${money(Math.abs(sums.diff))} off the total.`
          : "The items add up.",
      );
    }
    prevMismatch.current = mismatch;
  }, [mismatch, phase, sums.diff, sums.expected]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: ReceiptValue, change: ReceiptChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const setField = (field: ReceiptField, text: string) => {
    if (inert) return;
    const next: ReceiptValue = { ...current };
    next[field] = text;
    if (!next.confirmed.includes(field)) {
      next.confirmed = [...next.confirmed, field];
    }
    commit(next, { kind: "edit", field });
  };

  const confirmField = (field: ReceiptField) => {
    if (inert || current.confirmed.includes(field)) return;
    commit(
      { ...current, confirmed: [...current.confirmed, field] },
      { kind: "confirm", field },
    );
    const left = needs.filter((f) => f !== field).length;
    setAnnouncement(
      `${FIELD_LABEL[field]} confirmed.${left ? ` ${left} still to check.` : " Nothing left to check."}`,
    );
  };

  const setItem = (itemId: string, amount: string) => {
    if (inert) return;
    commit(
      {
        ...current,
        items: current.items.map((it) =>
          it.id === itemId ? { ...it, amount } : it,
        ),
        confirmedItems: current.confirmedItems.includes(itemId)
          ? current.confirmedItems
          : [...current.confirmedItems, itemId],
      },
      { kind: "item", itemId },
    );
  };

  const fixTotal = () => {
    if (inert || sums.expected === null) return;
    const total = money(sums.expected);
    commit(
      {
        ...current,
        total,
        confirmed: current.confirmed.includes("total")
          ? current.confirmed
          : [...current.confirmed, "total"],
      },
      { kind: "fix" },
    );
    prevMismatch.current = false;
    setAnnouncement(`Total set to ${total}. The items add up.`);
  };

  const clearAll = (announce = true) => {
    seqRef.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setScan(null);
    setPhase("empty");
    setFileInfo(null);
    setSubmitted(null);
    setHot(null);
    setActiveBox(null);
    commit(emptyReceiptValue, { kind: "clear" });
    if (announce) setAnnouncement("Cleared. No receipt yet.");
  };

  /* -------------------------------- scan ------------------------------- */

  const land = (result: ReceiptScan) => {
    const next = valueFromReceipt(result);
    setScan(result);
    setPhase("scanned");
    setScanSeq((s) => s + 1);
    setActiveBox(null);
    commit(next, { kind: "scan" });
    const low = result.fields.filter(
      (det) => confidenceOf(det.score) === "low",
    ).length;
    setAnnouncement(
      result.fields.length === 0 && result.items.length === 0
        ? "Nothing readable on this receipt."
        : `Receipt read: ${result.fields.length} fields and ${result.items.length} items. ${
            low ? `${low} to check.` : "Nothing to check."
          }`,
    );
  };
  const landRef = React.useRef(land);
  React.useEffect(() => {
    landRef.current = land;
  });

  const simulate = (): Promise<ReceiptScan> =>
    new Promise((resolve) => {
      window.setTimeout(() => resolve(receipt), SIM_MS);
    });

  const runScan = (f: ReceiptFile) => {
    if (inert) return;
    seqRef.current += 1;
    const seq = seqRef.current;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setFileInfo(f);
    setPhase("scanning");
    setSubmitted(null);
    setHot(null);
    setAnnouncement(`Reading ${f.name}.`);
    const started = Date.now();
    const minWait = motionSafe ? SWEEP_MS : 0;
    Promise.resolve()
      .then(() => (onScan ?? simulate)(f))
      .then(
        (result) => {
          if (!mounted.current || seq !== seqRef.current) return;
          const wait = Math.max(0, minWait - (Date.now() - started));
          timer.current = window.setTimeout(() => {
            timer.current = null;
            if (!mounted.current || seq !== seqRef.current) return;
            landRef.current(result);
          }, wait);
        },
        () => {
          if (!mounted.current || seq !== seqRef.current) return;
          setPhase("failed");
          setAnnouncement("The scan failed. Try again or use another file.");
        },
      );
  };
  const runScanRef = React.useRef(runScan);
  React.useEffect(() => {
    runScanRef.current = runScan;
  });

  // start="scan": read the seeded file once, when the reader is on screen.
  React.useEffect(() => {
    if (start !== "scan" || !ready || disabled || autoRan.current) return;
    const root = rootRef.current;
    if (!root) return;
    if (typeof IntersectionObserver === "undefined") {
      autoRan.current = true;
      runScanRef.current(file);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        autoRan.current = true;
        io.disconnect();
        runScanRef.current(file);
      },
      { threshold: 0.25 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [start, ready, disabled, file]);

  const takeFile = (f: File | undefined) => {
    if (!f) return;
    runScan({ name: f.name, size: f.size, type: f.type });
  };

  /* ------------------------------- submit ------------------------------ */

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (inert || !scan || phase !== "scanned") return;
    if (!canSubmit) {
      const first = needs[0];
      if (first) {
        fieldNodes.current.get(first)?.focus();
        setAnnouncement(
          `Confirm ${needs.map((f) => FIELD_LABEL[f].toLowerCase()).join(" and ")} first.`,
        );
      } else if (mismatch) {
        fieldNodes.current.get("total")?.focus();
        setAnnouncement("The items do not add up to the total. Fix it first.");
      }
      return;
    }
    const ref = `EXP-${4471 + scanSeq}`;
    setSubmitted(ref);
    onSubmit?.(current, scan);
    setAnnouncement(
      `Expense ${ref} submitted: ${current.merchant || "receipt"}, ${current.total} ${currency}.`,
    );
  };

  /* ------------------------------ keyboard ----------------------------- */

  const boxKeys = regions.map((r) => r.key);
  const activeBoxKey =
    activeBox && boxKeys.includes(activeBox) ? activeBox : (boxKeys[0] ?? null);

  const onBoxNav = (event: React.KeyboardEvent, key: HotKey) => {
    const i = boxKeys.indexOf(key);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = boxKeys.length - 1;
    else return;
    event.preventDefault();
    const target = boxKeys[clamp(to, 0, boxKeys.length - 1)];
    if (target) boxNodes.current.get(target)?.focus();
  };

  const focusFor = (key: HotKey) => {
    const node = fieldNodes.current.get(key.slice(2));
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  };

  /* ------------------------------- render ------------------------------ */

  const fieldStep = cascade(FIELD_DEFS.length);
  const boxStep = cascade(Math.max(regions.length, 1));
  const needsCount = needs.length;

  const pill = (() => {
    if (!ready) return null;
    if (submitted) return { text: "Submitted", tone: "text-success" };
    if (phase === "empty")
      return { text: "No receipt yet", tone: "text-ink-3" };
    if (phase === "scanning")
      return { text: "Reading", tone: "text-(--rr-accent)" };
    if (phase === "failed") return { text: "Scan failed", tone: "text-danger" };
    if (nothingRead) return { text: "Nothing read", tone: "text-ink-3" };
    if (needsCount > 0) {
      return {
        text: `${needsCount} to check`,
        tone: "text-danger",
      };
    }
    if (mismatch) return { text: "Does not add up", tone: "text-warn" };
    return { text: "Ready to submit", tone: "text-success" };
  })();

  const dropZone = (
    <motion.div
      key="drop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{ duration: durations.base, ease: easings.enter }}
      role="group"
      aria-label="Receipt"
      onDragOver={(event) => {
        if (inert) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (inert) return;
        takeFile(event.dataTransfer.files[0]);
      }}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-3 border border-dashed px-4 text-center transition-colors",
        dragOver
          ? "border-(--rr-accent) bg-[color-mix(in_oklab,var(--rr-accent)_8%,transparent)]"
          : "border-hairline-strong",
      )}
    >
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-ink-2"
      >
        <Upload className="size-4" />
      </span>
      <p className="text-[13px] text-foreground">
        {phase === "failed" ? "The scan failed." : "Drop a receipt here"}
      </p>
      <p className="text-[11px] text-ink-3">
        {phase === "failed"
          ? "The photo could not be read."
          : "A photo or PDF; the fields fill themselves."}
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
        {phase === "failed" && fileInfo ? (
          <button
            type="button"
            onClick={() => runScan(fileInfo)}
            aria-disabled={inert || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
        <label
          htmlFor={fileInputId}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-solid",
            inert && "cursor-default opacity-60",
          )}
        >
          <input
            id={fileInputId}
            type="file"
            accept="image/*,application/pdf"
            disabled={inert}
            className="sr-only"
            onChange={(event) => {
              takeFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          Choose a file
        </label>
        <button
          ref={dropButtonRef}
          type="button"
          onClick={() => runScan(file)}
          aria-disabled={inert || undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs text-(--rr-accent) transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          Use the sample
        </button>
      </div>
    </motion.div>
  );

  const paper = (
    <motion.div
      key="paper"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={
        motionSafe
          ? {
              ...springs.glide,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className="relative mx-auto"
      style={{
        width: receiptW !== null ? receiptW : "100%",
        aspectRatio: `${PW} / ${layout.height}`,
      }}
    >
      <p className="sr-only">
        Receipt from {paperModel.merchant}, {paperModel.dateLine}, total{" "}
        {money(paperModel.total)} {currency}.
      </p>
      <Paper layout={layout} smudges={smudges} />
      {phase === "scanned" ? (
        <div
          role="toolbar"
          aria-label="Regions the reader found"
          aria-orientation="vertical"
          className="absolute inset-0"
        >
          {regions.map((region, i) => (
            <RegionButton
              key={`${scanSeq}-${region.key}`}
              region={region}
              height={layout.height}
              hot={hot === region.key}
              draw={scanSeq > 0}
              delay={r3(i * boxStep)}
              tintBoxes={confidence !== "none"}
              motionSafe={motionSafe}
              tabIndex={activeBoxKey === region.key ? 0 : -1}
              inert={inert}
              nodeRef={(node) => {
                if (node) boxNodes.current.set(region.key, node);
                else boxNodes.current.delete(region.key);
              }}
              onHot={(on) =>
                setHot((h) => (on ? region.key : h === region.key ? null : h))
              }
              onPress={() => {
                if (!inert) focusFor(region.key);
              }}
              onFocus={() => setActiveBox(region.key)}
              onNav={(event) => onBoxNav(event, region.key)}
            />
          ))}
        </div>
      ) : null}
      <AnimatePresence>
        {phase === "scanning" && motionSafe ? (
          <motion.div
            key="sweep"
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0"
            initial={{ y: 0, opacity: 0 }}
            animate={{ y: Math.max(0, receiptH - 2), opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: springs.glide,
              opacity: { duration: durations.fast },
            }}
          >
            <span
              className="block h-7"
              style={{
                background:
                  "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--rr-accent) 28%, transparent))",
              }}
            />
            <span
              className="block h-0.5"
              style={{
                background: "var(--rr-accent)",
                boxShadow:
                  "0 0 10px 1px color-mix(in oklab, var(--rr-accent) 55%, transparent)",
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );

  const itemsTable =
    scan && current.items.length > 0 ? (
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Items
          </h3>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {currency}
          </span>
        </div>
        <table className={cn("w-full border-collapse", d.text)}>
          <caption className="sr-only">
            Items read from the receipt, with their amounts.
          </caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Amount</th>
              <th scope="col">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {current.items.map((it, i) => {
              const det = itemDetections.get(it.id);
              const level = det ? confidenceOf(det.score) : null;
              const confirmedItem = current.confirmedItems.includes(it.id);
              const flagged =
                level !== null && level !== "high" && !confirmedItem;
              const tinted = confidence === "tint" && flagged;
              const key: HotKey = `i:${it.id}`;
              const isHot = hot === key;
              const inputId = `${uid}-item-${it.id}`;
              return (
                <motion.tr
                  key={`${scanSeq}-${it.id}`}
                  initial={
                    scanSeq > 0
                      ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                      : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.glide,
                          delay: r3(
                            FIELD_LEAD + (FIELD_DEFS.length + i) * fieldStep,
                          ),
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: r3(
                              FIELD_LEAD + (FIELD_DEFS.length + i) * fieldStep,
                            ),
                          },
                        }
                      : { duration: durations.fast }
                  }
                  onPointerEnter={() => setHot(key)}
                  onPointerLeave={() => setHot((h) => (h === key ? null : h))}
                  className="border-b border-hairline last:border-b-0"
                >
                  <td className={cn("pr-2", d.cell)}>
                    <label htmlFor={inputId} className="block truncate">
                      {it.label}
                    </label>
                  </td>
                  <td className={cn("w-24 text-right", d.cell)}>
                    <span className="relative block">
                      <input
                        ref={(node) => {
                          if (node) fieldNodes.current.set(it.id, node);
                          else fieldNodes.current.delete(it.id);
                        }}
                        id={inputId}
                        type="text"
                        inputMode="decimal"
                        value={it.amount}
                        readOnly={inert}
                        autoComplete="off"
                        onChange={(event) => setItem(it.id, event.target.value)}
                        onFocus={() => setHot(key)}
                        onBlur={() => setHot((h) => (h === key ? null : h))}
                        className={cn(
                          "w-full rounded-2 border border-input bg-surface-0 px-2 text-right font-mono text-foreground tabular-nums",
                          density === "compact"
                            ? "h-6"
                            : density === "roomy"
                              ? "h-8"
                              : "h-7",
                          FOCUS_RING,
                        )}
                      />
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 rounded-2 border"
                        style={{
                          borderColor: `color-mix(in oklab, ${level ? LEVEL_COLOR[level] : "transparent"} 60%, transparent)`,
                          background: `color-mix(in oklab, ${level ? LEVEL_COLOR[level] : "transparent"} 7%, transparent)`,
                        }}
                        initial={false}
                        animate={{ opacity: tinted ? 1 : 0 }}
                        transition={
                          motionSafe
                            ? springs.flick
                            : { duration: durations.fast }
                        }
                      />
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute -inset-px rounded-2 border"
                        style={{ borderColor: "var(--rr-accent)" }}
                        initial={false}
                        animate={{ opacity: isHot ? 1 : 0 }}
                        transition={{ duration: durations.fast }}
                      />
                    </span>
                  </td>
                  <td className={cn("w-10 pl-2 text-right", d.cell)}>
                    {confirmedItem && level && level !== "high" ? (
                      <span className="inline-flex text-success">
                        <DrawnCheck
                          motionSafe={motionSafe}
                          className="size-3"
                        />
                        <span className="sr-only">corrected</span>
                      </span>
                    ) : confidence === "badge" && level ? (
                      <span
                        className="font-mono text-[10px] tabular-nums"
                        style={{ color: LEVEL_COLOR[level] }}
                      >
                        {Math.round((det?.score ?? 0) * 100)}%
                      </span>
                    ) : level && level !== "high" && confidence === "tint" ? (
                      <span className="sr-only">{LEVEL_WORD[level]}</span>
                    ) : null}
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-hairline-strong">
              <td className={cn("pt-1.5 text-ink-2", d.cell)}>Items</td>
              <td
                className={cn(
                  "pt-1.5 text-right font-mono text-ink-2 tabular-nums",
                  d.cell,
                )}
              >
                {money(sums.items)}
              </td>
              <td />
            </tr>
            <tr>
              <td className={cn("text-ink-2", d.cell)}>Tax</td>
              <td
                className={cn(
                  "text-right font-mono text-ink-2 tabular-nums",
                  d.cell,
                )}
              >
                {current.tax.trim() ? current.tax : "0.00"}
              </td>
              <td />
            </tr>
            <tr>
              <td className={cn("font-medium", d.cell)}>Items and tax</td>
              <td
                className={cn(
                  "text-right font-mono font-medium tabular-nums",
                  d.cell,
                )}
              >
                {sums.expected !== null ? money(sums.expected) : "--"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>

        <AnimatePresence initial={false} mode="wait">
          {mismatch && sums.diff !== null ? (
            <motion.div
              key="off"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-2 border px-2.5 py-2"
              style={{
                borderColor:
                  "color-mix(in oklab, var(--warn) 50%, transparent)",
                background: "color-mix(in oklab, var(--warn) 8%, transparent)",
              }}
            >
              <p className="flex min-w-0 items-baseline gap-1 text-[12px] text-foreground">
                <TriangleAlert
                  aria-hidden
                  className="size-3.5 shrink-0 self-center text-warn"
                />
                <span className="sr-only">
                  The total is {money(Math.abs(sums.diff))}{" "}
                  {sums.diff > 0 ? "over" : "under"} the items and tax.
                </span>
                <span aria-hidden>Total is</span>
                <Roll
                  text={money(Math.abs(sums.diff))}
                  motionSafe={motionSafe}
                  className="font-mono text-[13px] font-semibold"
                />
                <span aria-hidden>{sums.diff > 0 ? "over" : "under"}</span>
              </p>
              <button
                type="button"
                onClick={fixTotal}
                aria-disabled={inert || undefined}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-2 border border-hairline-strong bg-card px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                Fix total
                <span className="font-mono text-ink-3 tabular-nums">
                  {sums.expected !== null ? money(sums.expected) : ""}
                </span>
              </button>
            </motion.div>
          ) : sums.diff !== null ? (
            <motion.p
              key="ok"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
              className="flex items-center gap-1.5 text-[11px] text-success"
            >
              <DrawnCheck motionSafe={motionSafe} className="size-3" />
              The items add up to the total.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    ) : null;

  const form = (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Expense"
      className={cn("relative flex min-h-full flex-col gap-4", d.pad)}
    >
      {phase === "empty" || phase === "scanning" || phase === "failed" ? (
        <p className="flex items-center gap-2 rounded-2 bg-surface-1 px-2.5 py-2 text-[11px] text-ink-2">
          <ScanLine aria-hidden className="size-3.5 shrink-0 text-ink-3" />
          {phase === "scanning"
            ? "Reading the receipt. The fields fill themselves."
            : "The fields fill once a receipt is read; you can also type them."}
        </p>
      ) : null}
      {nothingRead ? (
        <div className="flex flex-col items-center gap-2 rounded-2 border border-dashed border-hairline-strong px-4 py-5 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">
            Nothing readable on this receipt.
          </p>
          <p className="text-[11px] text-ink-3">
            Try a sharper photo, or fill the fields by hand.
          </p>
        </div>
      ) : null}
      <div className={cn("grid grid-cols-1 @min-[64rem]:grid-cols-2", d.grid)}>
        {FIELD_DEFS.map((def, i) => (
          <FieldRow
            key={def.key}
            def={def}
            id={`${uid}-${def.key}`}
            text={current[def.key]}
            detection={detections.get(def.key)}
            confirmed={current.confirmed.includes(def.key)}
            mode={confidence}
            density={density}
            categories={categories}
            hot={hot === `f:${def.key}`}
            motionSafe={motionSafe}
            inert={inert}
            seq={scanSeq}
            delay={r3(FIELD_LEAD + i * fieldStep)}
            nodeRef={(node) => {
              if (node) fieldNodes.current.set(def.key, node);
              else fieldNodes.current.delete(def.key);
            }}
            onText={(text) => setField(def.key, text)}
            onConfirm={() => confirmField(def.key)}
            onHot={(on) =>
              setHot((h) =>
                on ? `f:${def.key}` : h === `f:${def.key}` ? null : h,
              )
            }
          />
        ))}
      </div>

      {itemsTable}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <p className="min-w-0 text-[11px] text-ink-3">
          {submitted
            ? `Submitted as ${submitted}.`
            : needsCount > 0
              ? `${needsCount} ${needsCount === 1 ? "field needs" : "fields need"} confirming.`
              : mismatch
                ? "The items must add up to the total."
                : phase === "scanned" && !nothingRead
                  ? "Everything checks out."
                  : "Waiting for a receipt."}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => clearAll()}
            aria-disabled={inert || phase === "empty" || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-2 px-2.5 text-xs transition-colors",
              !inert && phase !== "empty"
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
            Clear
          </button>
          <button
            type="submit"
            aria-disabled={!canSubmit || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-[opacity,background-color]",
              canSubmit
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "cursor-default bg-surface-2 text-ink-3",
              FOCUS_RING,
            )}
          >
            <Check aria-hidden className="size-3.5" />
            Submit expense
          </button>
        </div>
      </div>

      <AnimatePresence>
        {submitted ? (
          <motion.div
            key="stamp"
            role="status"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 px-6 text-center"
            style={{
              background: "color-mix(in oklab, var(--bg-1) 92%, transparent)",
            }}
          >
            <motion.span
              aria-hidden
              initial={motionSafe ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="flex size-12 items-center justify-center rounded-full border-2 text-(--rr-accent)"
              style={{
                borderColor: "var(--rr-accent)",
                background:
                  "color-mix(in oklab, var(--rr-accent) 12%, transparent)",
              }}
            >
              <DrawnCheck motionSafe={motionSafe} className="size-6" />
            </motion.span>
            <p className="text-sm font-semibold text-foreground">Submitted</p>
            <p className="font-mono text-[11px] text-ink-2">
              {submitted} · {current.merchant || "Receipt"} · {current.total}{" "}
              {currency}
            </p>
            <button
              type="button"
              onClick={() => {
                clearAll(false);
                setAnnouncement("Ready for the next receipt.");
                window.setTimeout(() => dropButtonRef.current?.focus(), 0);
              }}
              className={cn(
                "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <FileImage aria-hidden className="size-3.5" />
              New receipt
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      aria-busy={phase === "scanning" || status === "loading" || undefined}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--rr-accent" as string]: ACCENTS[accent] }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {workspace}
          </p>
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
        </div>
        {pill ? (
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              key={pill.text}
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] whitespace-nowrap uppercase",
                pill.tone,
              )}
            >
              {phase === "scanning" && !submitted ? (
                <ScanLine aria-hidden className="size-3" />
              ) : (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-current"
                />
              )}
              {pill.text}
            </motion.p>
          </AnimatePresence>
        ) : null}
      </header>

      {status === "loading" ? (
        <div
          aria-hidden
          className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row"
        >
          <div className="flex h-[240px] shrink-0 items-center justify-center border-b border-hairline p-4 @min-[40rem]:h-auto @min-[40rem]:w-[42%] @min-[40rem]:border-r @min-[40rem]:border-b-0">
            <span className="h-full max-h-[320px] w-3/5 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
          </div>
          <div className={cn("flex flex-1 flex-col gap-3", d.pad)}>
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="flex flex-col gap-1">
                <span className="h-2 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                <span
                  className={cn(
                    "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                    d.control,
                  )}
                  style={{ animationDelay: `${i * 90}ms` }}
                />
              </span>
            ))}
          </div>
        </div>
      ) : status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The reader didn&apos;t load.
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
      ) : (
        <div className="flex min-h-0 flex-1 flex-col @min-[40rem]:flex-row">
          <section
            aria-label="Receipt"
            className="relative flex h-[240px] shrink-0 flex-col border-b border-hairline bg-surface-1 @min-[40rem]:h-auto @min-[40rem]:w-[42%] @min-[40rem]:border-r @min-[40rem]:border-b-0"
          >
            <div ref={setPaneEl} className="relative min-h-0 flex-1 p-3">
              <div className="flex h-full w-full items-start justify-center">
                <AnimatePresence initial={false} mode="wait">
                  {phase === "scanning" || phase === "scanned"
                    ? paper
                    : dropZone}
                </AnimatePresence>
              </div>
            </div>
            {fileInfo && phase !== "empty" && phase !== "failed" ? (
              <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline px-3 py-1.5">
                <p className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] text-ink-3">
                  <FileImage aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{fileInfo.name}</span>
                  <span className="shrink-0">· {fileSize(fileInfo.size)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => runScan(fileInfo)}
                  aria-disabled={inert || phase === "scanning" || undefined}
                  className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 font-mono text-[10px] tracking-[0.04em] text-ink-2 uppercase transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <RotateCcw aria-hidden className="size-3" />
                  Rescan
                </button>
              </div>
            ) : null}
          </section>
          <section
            aria-label="Expense form"
            className="relative min-h-0 flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain"
          >
            {form}
          </section>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
