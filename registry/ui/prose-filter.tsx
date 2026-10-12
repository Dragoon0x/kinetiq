"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  CornerDownLeft,
  RotateCcw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  easings,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type ProseEnumOption = {
  /** Stored value, matched against the row field. */
  value: string;
  /** How the chip names it. */
  label: string;
  /** Words (or short phrases) that mean this option: ["open", "unpaid"]. */
  words: string[];
};

export type ProseField =
  | {
      id: string;
      label: string;
      kind: "enum";
      options: ProseEnumOption[];
      /** Optional words that may come before an option: ["from", "for"]. */
      leads?: string[];
    }
  | { id: string; label: string; kind: "money" }
  | {
      id: string;
      label: string;
      kind: "date";
      /** Words that pick this date field: ["due"]. */
      leads?: string[];
      /** Relative phrases with no lead ("last month") read as this field. */
      primary?: boolean;
    }
  | { id: string; label: string; kind: "code"; prefix?: string };

export type ProseSchema = {
  /** The thing being searched, and the words for it. */
  noun: { one: string; other: string; words: string[] };
  fields: ProseField[];
};

export type ProseOp =
  "is" | "gt" | "gte" | "lt" | "lte" | "eq" | "between" | "during";

export type ProseClause = {
  field: string;
  op: ProseOp;
  value: string | number | [number, number];
  /** The chip's three parts: field, operator and value in words. */
  words: { field: string; op: string; value: string };
};

export type ProseQuery = {
  /** The noun, once the sentence has named it. */
  noun: string | null;
  clauses: ProseClause[];
  /** Words still in the line that were not read. */
  text: string;
  /** Words in the line with more than one reading, waiting for a choice. */
  unsure: string[];
};

export type ProseRow = { id: string; [field: string]: string | number };

export type ProseStatus = "ready" | "loading" | "error";
export type ProseChipStyle = "segment" | "soft" | "outline";
export type ProseUnderlineStyle = "dotted" | "dashed" | "wavy";

export type ProseFilterProps = {
  /** What the line can read: the noun and the fields. @default defaultProseSchema */
  schema?: ProseSchema;
  /** The records the chips filter. @default defaultProseRows (40 invoices) */
  rows?: ProseRow[];
  /** A sentence read and docked on first render. @default "" */
  defaultValue?: string;
  /** The empty line's hint. @default "Try: overdue invoices over 500 from Coldbrook" */
  placeholder?: string;
  /** Fires with the structured query whenever a chip docks, leaves or is pulled back. */
  onQueryChange?: (query: ProseQuery) => void;
  /** Fires from Enter or the apply button with the structured query. */
  onApply?: (query: ProseQuery) => void;
  /** Whether the results have arrived. @default "ready" */
  status?: ProseStatus;
  /** "Try again" was pressed after the results failed to load. */
  onRetry?: () => void;
  /** Chip look: three tinted segments, one soft wash, or a hairline outline. @default "segment" */
  chipStyle?: ProseChipStyle;
  /** The underline under words with more than one meaning. @default "dotted" */
  underlineStyle?: ProseUnderlineStyle;
  /** Chips, underlines and the live count, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Today, ms, for "last month" and due dates. @default defaultProseNow */
  now?: number;
  /** Formats amounts in chips and rows. @default whole US dollars */
  formatAmount?: (amount: number) => string;
  /** The most rows the table lists; it scrolls inside its box. @default 40 */
  maxRows?: number;
  /** The heading when the sentence has not named its noun. @default "Invoices" */
  title?: string;
  /** Height of the surface, px. @default 520 */
  height?: number;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** Today in the seeded ledger: Sunday 11 October 2026. */
export const defaultProseNow = Date.UTC(2026, 9, 11, 10);

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS = [
  "Coldbrook",
  "Fernworks",
  "Basinworks",
  "Gaugeworks",
  "Fieldline",
];

export const defaultProseSchema: ProseSchema = {
  noun: {
    one: "invoice",
    other: "invoices",
    words: ["invoice", "invoices", "bill", "bills"],
  },
  fields: [
    {
      id: "status",
      label: "Status",
      kind: "enum",
      options: [
        {
          value: "open",
          label: "Open",
          words: ["open", "unpaid", "outstanding"],
        },
        { value: "overdue", label: "Overdue", words: ["overdue", "late"] },
        { value: "paid", label: "Paid", words: ["paid", "settled"] },
        {
          value: "draft",
          label: "Draft",
          words: ["draft", "drafts", "unsent"],
        },
      ],
    },
    {
      id: "customer",
      label: "Customer",
      kind: "enum",
      leads: ["from", "for", "by", "to", "at"],
      options: CUSTOMERS.map((c) => ({
        value: c,
        label: c,
        words: [c.toLowerCase()],
      })),
    },
    { id: "amount", label: "Amount", kind: "money" },
    {
      id: "issued",
      label: "Issued",
      kind: "date",
      leads: ["issued", "sent", "dated", "raised"],
      primary: true,
    },
    { id: "due", label: "Due", kind: "date", leads: ["due"] },
    { id: "number", label: "Invoice", kind: "code", prefix: "#" },
  ],
};

function makeRows(): ProseRow[] {
  const rand = mulberry32(1635);
  const rows: ProseRow[] = [];
  for (let i = 0; i < 40; i += 1) {
    const age = Math.floor(rand() * 80);
    const issued = defaultProseNow - age * DAY_MS;
    const due = issued + (rand() < 0.5 ? 30 : 45) * DAY_MS;
    const paid = rand() < (age > 45 ? 0.72 : 0.22);
    const status =
      age < 5 && rand() < 0.5
        ? "draft"
        : paid
          ? "paid"
          : due < defaultProseNow
            ? "overdue"
            : "open";
    const amount =
      Math.round(
        (rand() < 0.3 ? 2000 + rand() * 7800 : 120 + rand() * 1600) / 10,
      ) * 10;
    rows.push({
      id: `inv-${i}`,
      number: 1040 + i * 3 + (i % 2),
      customer: CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)] ?? "Coldbrook",
      status,
      amount,
      issued,
      due,
    });
  }
  return rows.sort((a, b) => Number(b.issued) - Number(a.issued));
}

/** Forty invoices from the last four months, newest first. */
export const defaultProseRows: ProseRow[] = makeRows();

/* ----------------------------------------------------------------------- */
/*                                  Reading                                */
/* ----------------------------------------------------------------------- */

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_SHORT = [
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
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Tok = { norm: string; start: number; end: number };

function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push({
      norm: m[0].toLowerCase().replace(/[.,;:!?]+$/, ""),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

function amountOf(norm: string | undefined): number | null {
  if (!norm) return null;
  const m = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(k)?$/.exec(norm);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(/,/g, "") + (m[2] ?? ""));
  return m[3] ? n * 1000 : n;
}

const COMPARATORS: { words: string[]; op: ProseOp; say: string }[] = [
  { words: ["more", "than"], op: "gt", say: "over" },
  { words: ["greater", "than"], op: "gt", say: "over" },
  { words: ["over"], op: "gt", say: "over" },
  { words: ["above"], op: "gt", say: "over" },
  { words: [">"], op: "gt", say: "over" },
  { words: ["at", "least"], op: "gte", say: "at least" },
  { words: ["less", "than"], op: "lt", say: "under" },
  { words: ["under"], op: "lt", say: "under" },
  { words: ["below"], op: "lt", say: "under" },
  { words: ["<"], op: "lt", say: "under" },
  { words: ["at", "most"], op: "lte", say: "at most" },
  { words: ["exactly"], op: "eq", say: "exactly" },
];

const startOfDay = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/** A named span of days against `now`, in UTC so server and browser agree. */
function spanOf(
  phrase: string,
  now: number,
  n = 0,
): { range: [number, number]; say: string; op: string } | null {
  const today = startOfDay(now);
  const d = new Date(today);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dow = (d.getUTCDay() + 6) % 7;
  switch (phrase) {
    case "today":
      return { range: [today, today + DAY_MS], say: "today", op: "on" };
    case "yesterday":
      return { range: [today - DAY_MS, today], say: "yesterday", op: "on" };
    case "this week":
      return {
        range: [today - dow * DAY_MS, today - dow * DAY_MS + 7 * DAY_MS],
        say: "this week",
        op: "in",
      };
    case "last week":
      return {
        range: [today - (dow + 7) * DAY_MS, today - dow * DAY_MS],
        say: "last week",
        op: "in",
      };
    case "this month":
      return {
        range: [Date.UTC(y, mo, 1), Date.UTC(y, mo + 1, 1)],
        say: "this month",
        op: "in",
      };
    case "last month":
      return {
        range: [Date.UTC(y, mo - 1, 1), Date.UTC(y, mo, 1)],
        say: "last month",
        op: "in",
      };
    case "this year":
      return {
        range: [Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1)],
        say: "this year",
        op: "in",
      };
    case "days":
      return {
        range: [today - (n - 1) * DAY_MS, today + DAY_MS],
        say: `the last ${n} days`,
        op: "in",
      };
    default: {
      const m = MONTHS.indexOf(phrase);
      if (m < 0) return null;
      // The most recent one: a month still ahead this year means last year's.
      const year = m > mo ? y - 1 : y;
      return {
        range: [Date.UTC(year, m, 1), Date.UTC(year, m + 1, 1)],
        say: cap(phrase),
        op: "in",
      };
    }
  }
}

/** A recognised stretch of the line, by character range. */
export type ProsePhrase = {
  start: number;
  end: number;
  kind: "clause" | "noun" | "doubtful";
  clause?: ProseClause;
  /** For doubtful words: the readings to choose from. */
  meanings?: ProseClause[];
};

type Reader = {
  schema: ProseSchema;
  now: number;
  money: (n: number) => string;
};

function moneyClause(
  field: ProseField,
  op: ProseOp,
  value: number | [number, number],
  say: string,
  money: (n: number) => string,
): ProseClause {
  return {
    field: field.id,
    op,
    value,
    words: {
      field: field.label,
      op: say,
      value: Array.isArray(value)
        ? `${money(value[0])}–${money(value[1])}`
        : money(value),
    },
  };
}

function dateClause(
  field: ProseField,
  span: { range: [number, number]; say: string; op: string },
): ProseClause {
  return {
    field: field.id,
    op: "during",
    value: span.range,
    words: { field: field.label, op: span.op, value: span.say },
  };
}

/** Reads one phrase at token `i`, longest first. */
function readAt(
  toks: Tok[],
  i: number,
  r: Reader,
): { len: number; phrase: Omit<ProsePhrase, "start" | "end"> } | null {
  const w = (k: number) => toks[i + k]?.norm;
  const { schema, now, money } = r;
  const fields = schema.fields;
  const moneyField = fields.find((f) => f.kind === "money");
  const dateFields = fields.filter((f) => f.kind === "date");
  const primaryDate =
    dateFields.find((f) => f.kind === "date" && f.primary) ?? dateFields[0];
  const codeField = fields.find((f) => f.kind === "code");

  // The noun.
  if (schema.noun.words.includes(w(0) ?? "")) {
    return { len: 1, phrase: { kind: "noun" } };
  }

  // Amounts: comparator + number, or between N and M.
  if (moneyField) {
    if (w(0) === "between") {
      const a = amountOf(w(1));
      const b = amountOf(w(3));
      if (a !== null && w(2) === "and" && b !== null) {
        return {
          len: 4,
          phrase: {
            kind: "clause",
            clause: moneyClause(
              moneyField,
              "between",
              [Math.min(a, b), Math.max(a, b)],
              "between",
              money,
            ),
          },
        };
      }
    }
    for (const c of COMPARATORS) {
      if (c.words.every((word, k) => w(k) === word)) {
        const n = amountOf(w(c.words.length));
        if (n !== null) {
          return {
            len: c.words.length + 1,
            phrase: {
              kind: "clause",
              clause: moneyClause(moneyField, c.op, n, c.say, money),
            },
          };
        }
      }
    }
  }

  // Dates, with an optional lead word that names the field.
  if (primaryDate) {
    let lead: ProseField | null = null;
    let k = 0;
    for (const f of dateFields) {
      if (f.kind === "date" && f.leads?.includes(w(0) ?? "")) {
        lead = f;
        k = 1;
      }
    }
    const readSpan = (): {
      len: number;
      span: ReturnType<typeof spanOf>;
    } | null => {
      const a = w(k);
      const b = w(k + 1);
      const c = w(k + 2);
      if (a === "today" || a === "yesterday")
        return { len: 1, span: spanOf(a, now) };
      if (
        (a === "this" || a === "last") &&
        (b === "week" || b === "month" || (b === "year" && a === "this"))
      ) {
        return { len: 2, span: spanOf(`${a} ${b}`, now) };
      }
      if (
        (a === "last" || a === "past") &&
        b &&
        /^\d+$/.test(b) &&
        (c === "days" || c === "day")
      ) {
        const n = Math.max(1, Math.min(365, Number(b)));
        return { len: 3, span: spanOf("days", now, n) };
      }
      if (a === "in" && b && MONTHS.includes(b))
        return { len: 2, span: spanOf(b, now) };
      if (a && MONTHS.includes(a)) return { len: 1, span: spanOf(a, now) };
      return null;
    };
    const got = readSpan();
    if (got?.span) {
      const monthOnly = /^[A-Z]/.test(got.span.say);
      if (lead) {
        return {
          len: k + got.len,
          phrase: { kind: "clause", clause: dateClause(lead, got.span) },
        };
      }
      if (monthOnly && dateFields.length > 1) {
        const span = got.span;
        return {
          len: got.len,
          phrase: {
            kind: "doubtful",
            meanings: dateFields.map((f) => dateClause(f, span)),
          },
        };
      }
      return {
        len: got.len,
        phrase: { kind: "clause", clause: dateClause(primaryDate, got.span) },
      };
    }
  }

  // Enumerations, with optional lead words.
  for (const f of fields) {
    if (f.kind !== "enum") continue;
    const k = f.leads?.includes(w(0) ?? "") ? 1 : 0;
    for (const option of f.options) {
      for (const phrase of option.words) {
        const parts = phrase.split(" ");
        if (parts.every((p, j) => w(k + j) === p)) {
          return {
            len: k + parts.length,
            phrase: {
              kind: "clause",
              clause: {
                field: f.id,
                op: "is",
                value: option.value,
                words: { field: f.label, op: "is", value: option.label },
              },
            },
          };
        }
      }
    }
  }

  // Invoice numbers written as #1042.
  if (codeField && codeField.kind === "code") {
    const m = /^#(\d+)$/.exec(w(0) ?? "");
    if (m) {
      const n = Number(m[1]);
      return {
        len: 1,
        phrase: {
          kind: "clause",
          clause: {
            field: codeField.id,
            op: "eq",
            value: n,
            words: {
              field: codeField.label,
              op: "is",
              value: `${codeField.prefix ?? ""}${n}`,
            },
          },
        },
      };
    }
  }

  // Words with more than one reading.
  const n = amountOf(w(0));
  if (n !== null && moneyField) {
    const meanings = [
      moneyClause(moneyField, "gt", n, "over", money),
      moneyClause(moneyField, "lt", n, "under", money),
      moneyClause(moneyField, "eq", n, "exactly", money),
    ];
    if (codeField && Number.isInteger(n) && n < 100_000) {
      meanings.push({
        field: codeField.id,
        op: "eq",
        value: n,
        words: {
          field: codeField.label,
          op: "is",
          value: `${codeField.kind === "code" ? (codeField.prefix ?? "") : ""}${n}`,
        },
      });
    }
    return { len: 1, phrase: { kind: "doubtful", meanings } };
  }
  if ((w(0) === "recent" || w(0) === "recently") && primaryDate) {
    return {
      len: 1,
      phrase: {
        kind: "doubtful",
        meanings: [7, 30].map((days) => {
          const span = spanOf("days", now, days);
          return dateClause(
            primaryDate,
            span ?? { range: [0, 0], say: "", op: "in" },
          );
        }),
      },
    };
  }
  if ((w(0) === "big" || w(0) === "large") && moneyField) {
    return {
      len: 1,
      phrase: {
        kind: "doubtful",
        meanings: [1000, 5000].map((v) =>
          moneyClause(moneyField, "gt", v, "over", money),
        ),
      },
    };
  }
  return null;
}

/** Reads a whole line into phrases, left to right, longest match first. */
export function readProse(
  text: string,
  schema: ProseSchema,
  now: number,
  money: (n: number) => string = defaultMoney,
): ProsePhrase[] {
  const toks = tokenize(text);
  const out: ProsePhrase[] = [];
  const reader = { schema, now, money };
  for (let i = 0; i < toks.length;) {
    const got = readAt(toks, i, reader);
    if (!got) {
      i += 1;
      continue;
    }
    const first = toks[i];
    const last = toks[i + got.len - 1];
    if (first && last) {
      out.push({ ...got.phrase, start: first.start, end: last.end });
    }
    i += got.len;
  }
  return out;
}

/** Whether a row meets every clause: the filter the table applies. */
export function proseMatches(row: ProseRow, clauses: ProseClause[]): boolean {
  return clauses.every((c) => passes(row, c));
}

function passes(row: ProseRow, c: ProseClause): boolean {
  const v = row[c.field];
  if (v === undefined) return false;
  switch (c.op) {
    case "is":
      return v === c.value;
    case "eq":
      return Number(v) === Number(c.value);
    case "gt":
      return Number(v) > Number(c.value);
    case "gte":
      return Number(v) >= Number(c.value);
    case "lt":
      return Number(v) < Number(c.value);
    case "lte":
      return Number(v) <= Number(c.value);
    case "between":
    case "during": {
      if (!Array.isArray(c.value)) return false;
      const [a, b] = c.value;
      return c.op === "between"
        ? Number(v) >= a && Number(v) <= b
        : Number(v) >= a && Number(v) < b;
    }
    default:
      return true;
  }
}

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
function defaultMoney(n: number) {
  return USD.format(n);
}

const exitTransition = { duration: durations.fast, ease: easings.exit };

const dateText = (ms: number) => {
  const d = new Date(ms);
  return `${MONTH_SHORT[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const chipText = (c: ProseClause) =>
  `${c.words.field} ${c.words.op} ${c.words.value}`;

const STATUS_TONE: Record<string, string> = {
  open: "bg-cobalt-wash text-cobalt-bright",
  overdue: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-danger",
  paid: "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success",
  draft: "bg-surface-2 text-ink-2",
};

const UNDERLINE: Record<ProseUnderlineStyle, string> = {
  dotted: "decoration-dotted",
  dashed: "decoration-dashed",
  wavy: "decoration-wavy",
};

type Rect = { x: number; y: number; w: number; h: number };

type Chip = { id: string; clause: ProseClause; source: string; from?: Rect };
type Ghost = { id: string; text: string; rect: Rect };

/** Two clauses that cannot both hold: the newer one replaces the older. */
const clashes = (a: ProseClause, b: ProseClause) =>
  a.field === b.field &&
  (a.op === b.op || a.op === "is" || a.op === "during" || a.op === "eq");

function relRect(node: Element, root: Element): Rect {
  const r = node.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return {
    x: Math.round(r.left - o.left),
    y: Math.round(r.top - o.top),
    w: Math.round(r.width),
    h: Math.round(r.height),
  };
}

/* ----------------------------------------------------------------------- */
/*                                Docked chip                              */
/* ----------------------------------------------------------------------- */

/**
 * A chip that, when it has somewhere to come from, starts there — over the
 * words it was read from, scaled to their width — and flies to its slot on
 * `snap`: one crisp overshoot as it lands. The flight is a FLIP on its own
 * transform, measured after it is laid out, so the dock's wrapping decides
 * where it lands and nothing is guessed.
 */
function DockChip({
  chip,
  rootRef,
  chipStyle,
  motionSafe,
  disabled,
  onRemove,
}: {
  chip: Chip;
  rootRef: React.RefObject<HTMLDivElement | null>;
  chipStyle: ProseChipStyle;
  motionSafe: boolean;
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const scale = useMotionValue(1);
  const ref = React.useRef<HTMLButtonElement | null>(null);
  const from = chip.from;

  React.useLayoutEffect(() => {
    const node = ref.current;
    const root = rootRef.current;
    if (!from || !node || !root || !motionSafe) return;
    const to = relRect(node, root);
    const s = Math.min(1.3, Math.max(0.7, from.w / Math.max(1, to.w)));
    x.jump(Math.round(from.x + from.w / 2 - (to.x + to.w / 2)));
    y.jump(Math.round(from.y + from.h / 2 - (to.y + to.h / 2)));
    scale.jump(Number(s.toFixed(3)));
    const runs: AnimationPlaybackControls[] = [
      animate(x, 0, springs.snap),
      animate(y, 0, springs.snap),
      animate(scale, 1, springs.snap),
    ];
    // A re-run (StrictMode's rehearsal) starts the flight again from the
    // words; an unmount mid-flight leaves the chip at rest.
    return () => {
      for (const r of runs) r.stop();
      x.jump(0);
      y.jump(0);
      scale.jump(1);
    };
  }, [from, motionSafe, rootRef, scale, x, y]);

  const { words } = chip.clause;
  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={() => onRemove(chip.id)}
      aria-label={`Remove ${chipText(chip.clause)}`}
      style={{ x, y, scale }}
      className={cn(
        "relative inline-flex h-7 max-w-full shrink-0 items-center overflow-hidden text-[12px] whitespace-nowrap transition-colors",
        chipStyle === "segment" &&
          "rounded-2 border border-[color-mix(in_oklab,var(--pf-accent)_35%,transparent)] bg-card",
        chipStyle === "soft" &&
          "gap-1 rounded-full bg-[color-mix(in_oklab,var(--pf-accent)_13%,transparent)] pr-1.5 pl-2.5 enabled:hover:bg-[color-mix(in_oklab,var(--pf-accent)_20%,transparent)]",
        chipStyle === "outline" &&
          "gap-1 rounded-full border border-hairline-strong bg-card pr-1.5 pl-2.5 enabled:hover:border-[color-mix(in_oklab,var(--pf-accent)_60%,transparent)]",
        FOCUS_RING,
      )}
    >
      {chipStyle === "segment" ? (
        <>
          <span className="flex h-full items-center bg-surface-2 px-2 text-ink-2">
            {words.field}
          </span>
          <span className="flex h-full items-center px-1.5 font-mono text-[10.5px] text-ink-3">
            {words.op}
          </span>
          <span className="flex h-full items-center bg-[color-mix(in_oklab,var(--pf-accent)_12%,transparent)] px-2 font-medium text-foreground">
            {words.value}
          </span>
          <span className="flex h-full items-center px-1 text-ink-3">
            <X aria-hidden className="size-3" />
          </span>
        </>
      ) : (
        <>
          <span className="text-ink-3">{words.field}</span>
          <span className="text-ink-3">{words.op}</span>
          <span className="font-medium text-foreground">{words.value}</span>
          <X aria-hidden className="ml-0.5 size-3 text-ink-3" />
        </>
      )}
    </motion.button>
  );
}

/** A count that runs to its new figure on a base tween, rendered as text. */
function Rolling({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  React.useEffect(() => {
    if (!motionSafe) {
      mv.jump(value);
      return;
    }
    const controls = animate(mv, value, {
      duration: durations.base,
      ease: easings.enter,
    });
    return () => controls.stop();
  }, [motionSafe, mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/* ----------------------------------------------------------------------- */
/*                                Component                                */
/* ----------------------------------------------------------------------- */

/** Reads `text` and docks every complete phrase into chips, for a first render. */
function initialDock(
  text: string,
  schema: ProseSchema,
  now: number,
  money: (n: number) => string,
): { text: string; chips: Chip[]; noun: boolean } {
  const phrases = readProse(text, schema, now, money).filter(
    (p) => p.kind !== "doubtful",
  );
  let chips: Chip[] = [];
  let noun = false;
  phrases.forEach((p, i) => {
    if (p.kind === "noun") noun = true;
    else if (p.clause) {
      const clause = p.clause;
      chips = [
        ...chips.filter((c) => !clashes(c.clause, clause)),
        { id: `i${i}`, clause, source: text.slice(p.start, p.end) },
      ];
    }
  });
  return { text: cut(text, phrases), chips, noun };
}

/** The line with these phrases (and one space after each) taken out. */
function cut(text: string, phrases: { start: number; end: number }[]): string {
  let out = text;
  for (const p of [...phrases].sort((a, b) => b.start - a.start)) {
    const end = /\s/.test(out.charAt(p.end)) ? p.end + 1 : p.end;
    out = out.slice(0, p.start) + out.slice(end);
  }
  return out.replace(/^\s+/, "");
}

/**
 * One search line that reads a sentence against a typed schema and turns it
 * into field, operator and value chips docked above it. A phrase docks when
 * you type the space after it (or press Enter, or paste): its words lift out
 * of the line — a ghost of them rises a step and fades where they stood —
 * while the chip starts over them and flies to its slot on `snap`. Words with
 * more than one reading keep a dotted underline; Tab walks them, opening a
 * small list of meanings under the word, and the chosen meaning docks the
 * same way. Backspace at the start of the line pulls the last chip back into
 * editable text.
 *
 * The line is a real input (typing, selection, IME and undo stay native)
 * with a painted mirror behind it for the underlines; the meanings list is a
 * listbox driven by aria-activedescendant.
 */
export function ProseFilter({
  schema = defaultProseSchema,
  rows = defaultProseRows,
  defaultValue = "",
  placeholder = "Try: overdue invoices over 500 from Coldbrook",
  onQueryChange,
  onApply,
  status = "ready",
  onRetry,
  chipStyle = "segment",
  underlineStyle = "dotted",
  accent = "var(--accent-bright)",
  now = defaultProseNow,
  formatAmount = defaultMoney,
  maxRows = 40,
  title = "Invoices",
  height = 520,
  disabled = false,
  className,
}: ProseFilterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const listId = `${uid}-meanings`;
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [initial] = React.useState(() =>
    initialDock(defaultValue, schema, now, formatAmount),
  );
  const [text, setText] = React.useState(initial.text);
  const [chips, setChips] = React.useState<Chip[]>(initial.chips);
  const [noun, setNoun] = React.useState(initial.noun);
  const [nounPulse, setNounPulse] = React.useState(0);
  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [menu, setMenu] = React.useState<{
    at: number;
    active: number;
    x: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const mirrorRef = React.useRef<HTMLDivElement | null>(null);
  const fieldRef = React.useRef<HTMLDivElement | null>(null);
  const lineRef = React.useRef<HTMLDivElement | null>(null);
  const caret = React.useRef<number | null>(null);
  const serial = React.useRef(0);
  const scrollX = useMotionValue(0);
  const mirrorX = useTransform(scrollX, (v) => -Math.round(v));

  const phrases = React.useMemo(
    () => readProse(text, schema, now, formatAmount),
    [formatAmount, now, schema, text],
  );
  const doubtful = phrases.filter((p) => p.kind === "doubtful");
  const open = menu ? doubtful[menu.at] : undefined;
  const meanings = open?.meanings ?? [];

  const results = React.useMemo(
    () => rows.filter((row) => chips.every((c) => passes(row, c.clause))),
    [chips, rows],
  );
  const shown = results.slice(0, Math.max(0, maxRows));

  const nounOther = noun ? cap(schema.noun.other) : title;
  const queryOf = (list: Chip[], line: string, n: boolean): ProseQuery => ({
    noun: n ? schema.noun.other : null,
    clauses: list.map((c) => c.clause),
    text: line.trim(),
    unsure: readProse(line, schema, now, formatAmount)
      .filter((x) => x.kind === "doubtful")
      .map((x) => line.slice(x.start, x.end)),
  });

  // The query is state: the host hears the one the first render read from
  // `defaultValue` too, not only later changes. (StrictMode's second run
  // repeats the same query, which a host can take twice.)
  const report = React.useRef(onQueryChange);
  React.useEffect(() => {
    report.current = onQueryChange;
  });
  React.useEffect(() => {
    report.current?.({
      noun: initial.noun ? schema.noun.other : null,
      clauses: initial.chips.map((c) => c.clause),
      text: initial.text.trim(),
      unsure: readProse(initial.text, schema, now, formatAmount)
        .filter((x) => x.kind === "doubtful")
        .map((x) => initial.text.slice(x.start, x.end)),
    });
    // Mount only: later queries are reported by the keys that make them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The caret goes back where the person was typing once docking has
  // rewritten the line.
  React.useLayoutEffect(() => {
    const at = caret.current;
    const input = inputRef.current;
    if (at === null || !input) return;
    caret.current = null;
    input.setSelectionRange(at, at);
    scrollX.set(input.scrollLeft);
  });

  // Ghosts are words already gone from the line; clear them once faded.
  React.useEffect(() => {
    if (ghosts.length === 0) return;
    const t = window.setTimeout(() => setGhosts([]), 700);
    return () => window.clearTimeout(t);
  }, [ghosts]);

  const syncScroll = () => {
    const input = inputRef.current;
    if (input) scrollX.set(input.scrollLeft);
  };

  /** Where a phrase is drawn in the line right now, relative to the surface. */
  const rectOf = (start: number): Rect | undefined => {
    const root = rootRef.current;
    const span = mirrorRef.current?.querySelector(`[data-at="${start}"]`);
    const field = fieldRef.current;
    if (!root || !span || !field) return undefined;
    const r = relRect(span, root);
    const f = relRect(field, root);
    // Words scrolled out of the field fly from its nearest edge.
    const x = Math.max(f.x, Math.min(f.x + f.w - Math.min(r.w, f.w), r.x));
    return { ...r, x, w: Math.min(r.w, f.w) };
  };

  /**
   * Docks these phrases out of `line`: chips for clauses (flying from where
   * the words were drawn, when they were), the noun into the heading, ghosts
   * where the words stood, and the caret kept in place.
   */
  const dock = (
    line: string,
    picked: { phrase: ProsePhrase; clause?: ProseClause }[],
    at: number,
    measured: boolean,
  ): { chips: Chip[]; noun: boolean; text: string } | null => {
    if (picked.length === 0) return null;
    let nextChips = chips;
    let nextNoun = noun;
    const nextGhosts: Ghost[] = [];
    const said: string[] = [];
    for (const { phrase, clause } of picked) {
      const rect = measured ? rectOf(phrase.start) : undefined;
      const source = line.slice(phrase.start, phrase.end);
      serial.current += 1;
      const id = `c${serial.current}`;
      if (rect) nextGhosts.push({ id: `g${id}`, text: source, rect });
      if (phrase.kind === "noun") {
        nextNoun = true;
        continue;
      }
      const c = clause ?? phrase.clause;
      if (!c) continue;
      nextChips = [
        ...nextChips.filter((x) => !clashes(x.clause, c)),
        { id, clause: c, source, from: rect },
      ];
      said.push(chipText(c));
    }
    const ranges = picked.map((p) => p.phrase);
    const nextText = cut(line, ranges);
    // The caret keeps its place among the words that stay.
    caret.current = Math.min(
      nextText.length,
      cut(
        line.slice(0, at),
        ranges.filter((p) => p.end <= at),
      ).length,
    );
    setText(nextText);
    setChips(nextChips);
    if (nextNoun !== noun) {
      setNoun(true);
      setNounPulse((n) => n + 1);
    }
    if (nextGhosts.length) setGhosts((g) => [...g, ...nextGhosts]);
    setMenu(null);
    if (nextChips !== chips || nextNoun !== noun) {
      onQueryChange?.(queryOf(nextChips, nextText, nextNoun));
    }
    if (said.length) {
      const n = rows.filter((row) =>
        nextChips.every((c) => passes(row, c.clause)),
      ).length;
      setAnnouncement(
        `Docked ${said.join(", ")}. ${n} ${n === 1 ? schema.noun.one : schema.noun.other}.`,
      );
    }
    return { chips: nextChips, noun: nextNoun, text: nextText };
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    const at = event.currentTarget.selectionStart ?? value.length;
    const prev = text;
    let p = 0;
    while (p < prev.length && p < value.length && prev[p] === value[p]) p += 1;
    let s = 0;
    while (
      s < prev.length - p &&
      s < value.length - p &&
      prev[prev.length - 1 - s] === value[value.length - 1 - s]
    ) {
      s += 1;
    }
    const inserted = value.slice(p, value.length - s);
    const read = readProse(value, schema, now, formatAmount).filter(
      (x) => x.kind !== "doubtful",
    );
    if (inserted.length === 1 && /\s/.test(inserted)) {
      // The space after a phrase is what docks it — and only that phrase,
      // so a phrase pulled back for editing stays until it is finished.
      const done = read.filter((x) => x.end === p);
      if (
        dock(
          value,
          done.map((phrase) => ({ phrase })),
          at,
          true,
        )
      )
        return;
    } else if (inserted.length > 1 && /\s/.test(inserted)) {
      // A paste docks every complete phrase in it.
      const done = read.filter(
        (x) => x.end === value.length || /\s/.test(value.charAt(x.end)),
      );
      if (
        dock(
          value,
          done.map((phrase) => ({ phrase })),
          at,
          false,
        )
      )
        return;
    }
    setText(value);
    if (menu) setMenu(null);
    onQueryChange?.(queryOf(chips, value, noun));
  };

  /** Where the meanings list sits: under its word, kept inside the line. */
  const anchorOf = (k: number) => {
    const d = doubtful[k];
    const line = lineRef.current;
    const span = d
      ? mirrorRef.current?.querySelector(`[data-at="${d.start}"]`)
      : null;
    if (!span || !line) return 0;
    const sx =
      span.getBoundingClientRect().left - line.getBoundingClientRect().left;
    return Math.max(0, Math.min(line.clientWidth - 256, Math.round(sx - 10)));
  };
  const openMenu = (k: number) => setMenu({ at: k, active: 0, x: anchorOf(k) });

  const pick = (index: number) => {
    const phrase = open;
    const clause = meanings[index];
    if (!phrase || !clause) return;
    const at = inputRef.current?.selectionStart ?? text.length;
    dock(text, [{ phrase, clause }], at, true);
    inputRef.current?.focus();
  };

  const apply = () => {
    if (disabled) return;
    // Enter docks what is finished, then applies the query it makes.
    const read = phrases.filter((x) => x.kind !== "doubtful");
    const at = inputRef.current?.selectionStart ?? text.length;
    const after = dock(
      text,
      read.map((phrase) => ({ phrase })),
      at,
      true,
    ) ?? {
      chips,
      noun,
      text,
    };
    onApply?.(queryOf(after.chips, after.text, after.noun));
    const n = rows.filter((row) =>
      after.chips.every((c) => passes(row, c.clause)),
    ).length;
    setAnnouncement(
      `Applied. ${n} ${n === 1 ? schema.noun.one : schema.noun.other}.`,
    );
  };

  const remove = (id: string) => {
    if (disabled) return;
    const gone = chips.find((c) => c.id === id);
    const next = chips.filter((c) => c.id !== id);
    setChips(next);
    onQueryChange?.(queryOf(next, text, noun));
    if (gone) setAnnouncement(`Removed ${chipText(gone.clause)}.`);
    inputRef.current?.focus();
  };

  const pullBack = () => {
    const last = chips[chips.length - 1];
    if (!last) return false;
    const next = chips.slice(0, -1);
    const source = last.source || chipText(last.clause).toLowerCase();
    const line = text.length ? `${source} ${text}` : source;
    caret.current = source.length;
    setChips(next);
    setText(line);
    onQueryChange?.(queryOf(next, line, noun));
    setAnnouncement(`Pulled back ${chipText(last.clause)} to edit.`);
    return true;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    if (menu && open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const by = event.key === "ArrowDown" ? 1 : -1;
        setMenu({
          ...menu,
          active: (menu.active + by + meanings.length) % meanings.length,
        });
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        pick(menu.active);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(null);
        return;
      }
    }
    if (event.key === "Tab" && doubtful.length > 0 && !event.altKey) {
      // Tab walks the doubtful words once each, then lets focus move on.
      const at = menu
        ? menu.at + (event.shiftKey ? -1 : 1)
        : event.shiftKey
          ? -1
          : 0;
      if (at >= 0 && at < doubtful.length) {
        event.preventDefault();
        openMenu(at);
        return;
      }
      if (menu) setMenu(null);
      return;
    }
    if (event.key === "ArrowDown" && !menu) {
      const caretAt = input.selectionStart ?? 0;
      const k = doubtful.findIndex(
        (d) => caretAt >= d.start && caretAt <= d.end,
      );
      if (k >= 0) {
        event.preventDefault();
        openMenu(k);
        return;
      }
    }
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
      return;
    }
    if (
      event.key === "Backspace" &&
      input.selectionStart === 0 &&
      input.selectionEnd === 0
    ) {
      if (pullBack()) event.preventDefault();
    }
  };

  const onPointerUp = () => {
    const input = inputRef.current;
    if (!input) return;
    syncScroll();
    const caretAt = input.selectionStart ?? 0;
    if (input.selectionEnd !== caretAt) return;
    const k = doubtful.findIndex((d) => caretAt > d.start && caretAt < d.end);
    if (k >= 0) openMenu(k);
    else setMenu(null);
  };

  /* ------------------------------ mirror -------------------------------- */

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  phrases.forEach((p) => {
    if (p.start > cursor) segments.push(text.slice(cursor, p.start));
    segments.push(
      <span
        key={p.start}
        data-at={p.start}
        className={cn(
          p.kind === "doubtful" &&
            cn(
              "underline decoration-[1.5px] underline-offset-[5px]",
              UNDERLINE[underlineStyle],
              "decoration-(--pf-accent)",
            ),
          p.kind !== "doubtful" &&
            "rounded-1 bg-[color-mix(in_oklab,var(--pf-accent)_12%,transparent)]",
          open === p &&
            "bg-[color-mix(in_oklab,var(--pf-accent)_18%,transparent)]",
        )}
      >
        {text.slice(p.start, p.end)}
      </span>,
    );
    cursor = p.end;
  });
  if (cursor < text.length) segments.push(text.slice(cursor));

  /* ------------------------------ table --------------------------------- */

  const loosen = React.useMemo(() => {
    if (results.length > 0 || chips.length === 0) return null;
    let best: { chip: Chip; gain: number } | null = null;
    for (const chip of chips) {
      const gain = rows.filter((row) =>
        chips.every((c) => c.id === chip.id || passes(row, c.clause)),
      ).length;
      if (!best || gain > best.gain) best = { chip, gain };
    }
    return best;
  }, [chips, results.length, rows]);

  const step = cascade(Math.min(shown.length, 10));
  const noun1 = schema.noun;

  const table = () => {
    if (status === "loading") {
      return Array.from({ length: 6 }, (_, i) => (
        <tr key={`sk-${i}`} aria-hidden className="border-b border-hairline">
          {[0, 1, 2, 3, 4].map((ci) => (
            <td
              key={ci}
              className={cn(
                "px-3 py-2.5 first:pl-4 last:pr-4",
                ci === 2 && "hidden @min-[30rem]:table-cell",
                ci === 3 && "hidden @min-[40rem]:table-cell",
              )}
            >
              <span
                className="block h-2.5 rounded-full bg-surface-2 motion-safe:animate-pulse"
                style={{ width: `${40 + ((i * 29 + ci * 13) % 50)}%` }}
              />
            </td>
          ))}
        </tr>
      ));
    }
    if (status === "error") {
      return (
        <tr>
          <td colSpan={6} className="px-4 py-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The {noun1.other} did not load.
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
          </td>
        </tr>
      );
    }
    if (shown.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="px-4 py-10">
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="max-w-xs text-sm text-ink-2">
                {loosen && loosen.gain > 0
                  ? `No ${noun1.other} match. Loosen ${chipText(loosen.chip.clause)} to see ${loosen.gain}.`
                  : `No ${noun1.other} match.`}
              </p>
              {loosen && loosen.gain > 0 ? (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(loosen.chip.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                  Remove {chipText(loosen.chip.clause)}
                </button>
              ) : null}
            </div>
          </td>
        </tr>
      );
    }
    return (
      <AnimatePresence initial={false}>
        {shown.map((row, index) => {
          const st = String(row.status ?? "");
          return (
            <motion.tr
              key={row.id}
              layout={motionSafe ? "position" : false}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitTransition }}
              transition={{
                layout: motionSafe ? springs.glide : { duration: 0 },
                y: motionSafe
                  ? { ...springs.glide, delay: Math.min(index, 10) * step }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: motionSafe ? Math.min(index, 10) * step : 0,
                },
              }}
              className="border-b border-hairline bg-card"
            >
              <td className="py-2.5 pr-3 pl-4 align-middle">
                <span className="font-mono text-[11.5px] text-ink-3 tabular-nums">
                  #{String(row.number ?? "")}
                </span>
              </td>
              <td className="px-3 align-middle">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-foreground">
                    {String(row.customer ?? "")}
                  </span>
                  <span className="truncate text-[11px] text-ink-3 @min-[30rem]:hidden">
                    {cap(st)} · {dateText(Number(row.issued))}
                  </span>
                </span>
              </td>
              <td className="hidden px-3 align-middle @min-[30rem]:table-cell">
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full px-2 text-[11px]",
                    STATUS_TONE[st] ?? "bg-surface-2 text-ink-2",
                  )}
                >
                  {cap(st)}
                </span>
              </td>
              <td className="hidden px-3 align-middle font-mono text-[11.5px] text-ink-2 tabular-nums @min-[40rem]:table-cell">
                {dateText(Number(row.issued))}
              </td>
              <td className="hidden px-3 align-middle font-mono text-[11.5px] text-ink-2 tabular-nums @min-[56rem]:table-cell">
                {dateText(Number(row.due))}
              </td>
              <td className="py-2.5 pr-4 pl-3 text-right align-middle font-mono text-[12.5px] text-foreground tabular-nums">
                {formatAmount(Number(row.amount))}
              </td>
            </motion.tr>
          );
        })}
      </AnimatePresence>
    );
  };

  const activeId = open && menu ? `${listId}-${menu.active}` : undefined;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative isolate flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--pf-accent" as string]: accent }}
    >
      <div className="flex flex-col gap-3 border-b border-hairline px-4 pt-4 pb-3">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
          <motion.p
            key={nounPulse}
            id={titleId}
            className="flex h-7 shrink-0 items-center text-sm font-semibold"
            initial={
              nounPulse ? { scale: motionSafe ? 1.08 : 1, opacity: 0.6 } : false
            }
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              scale: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.base },
            }}
          >
            {nounOther}
          </motion.p>
          <div className="relative order-last min-w-0 basis-full @min-[30rem]:order-none @min-[30rem]:flex-1 @min-[30rem]:basis-auto">
            <ul
              role="list"
              aria-label="Filters"
              className="flex flex-wrap items-center gap-1.5"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {chips.map((chip) => (
                  <motion.li
                    key={chip.id}
                    layout={motionSafe ? "position" : false}
                    className="flex max-w-full"
                    initial={{
                      opacity: 0,
                      y: chip.from || !motionSafe ? 0 : -distances.step,
                    }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitTransition }}
                    transition={{
                      layout: motionSafe ? springs.glide : { duration: 0 },
                      y: motionSafe ? springs.snap : { duration: 0 },
                      opacity: {
                        duration: chip.from ? durations.blink : durations.base,
                      },
                    }}
                  >
                    <DockChip
                      chip={chip}
                      rootRef={rootRef}
                      chipStyle={chipStyle}
                      motionSafe={motionSafe}
                      disabled={disabled}
                      onRemove={remove}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            {chips.length === 0 ? (
              <p className="py-1 text-xs leading-5 text-ink-3">
                Type a sentence; finished phrases turn into filters.
              </p>
            ) : null}
          </div>
          <span className="ml-auto flex h-7 shrink-0 items-center gap-1 text-[11px] text-ink-3">
            {status === "loading" ? (
              "Searching"
            ) : (
              <>
                <Rolling
                  value={results.length}
                  motionSafe={motionSafe}
                  className="font-mono text-[13px] text-(--pf-accent) tabular-nums"
                />
                {results.length === 1 ? noun1.one : noun1.other}
              </>
            )}
          </span>
        </div>

        <div ref={lineRef} className="relative">
          <div className="flex h-10 items-center gap-2 rounded-3 border border-hairline-strong bg-surface-1 pr-1 pl-3 transition-colors focus-within:border-[color-mix(in_oklab,var(--pf-accent)_60%,transparent)]">
            <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
            <div
              ref={fieldRef}
              className="relative h-full min-w-0 flex-1 overflow-hidden"
            >
              <motion.div
                ref={mirrorRef}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[14px] whitespace-pre text-transparent"
                style={{ x: mirrorX }}
              >
                {segments}
              </motion.div>
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={Boolean(open)}
                aria-controls={open ? listId : undefined}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                aria-describedby={hintId}
                aria-label={`Describe the ${noun1.other} you want`}
                autoComplete="off"
                spellCheck={false}
                disabled={disabled}
                value={text}
                placeholder={
                  chips.length === 0 && !noun ? placeholder : "Add more…"
                }
                onChange={onChange}
                onKeyDown={onKeyDown}
                onScroll={syncScroll}
                onSelect={syncScroll}
                onPointerUp={onPointerUp}
                onBlur={() => setMenu(null)}
                className="relative h-full w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-ink-3"
              />
            </div>
            <button
              type="button"
              onClick={apply}
              disabled={disabled}
              aria-label="Apply"
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-2.5 text-xs text-ink-2 transition-colors enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:opacity-50",
                FOCUS_RING,
              )}
            >
              <CornerDownLeft aria-hidden className="size-3.5" />
              <span className="hidden @min-[30rem]:inline">Apply</span>
            </button>
          </div>

          <AnimatePresence>
            {open ? (
              <motion.ul
                key={open.start}
                id={listId}
                role="listbox"
                aria-label="Meanings"
                style={{ left: menu?.x ?? 0 }}
                className="absolute top-full z-10 mt-1.5 flex w-64 max-w-full flex-col rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_color-mix(in_oklab,black_16%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitTransition }}
                transition={{
                  y: motionSafe ? springs.snap : { duration: 0 },
                  opacity: { duration: durations.fast },
                }}
              >
                <li
                  role="presentation"
                  className="px-2 pt-1 pb-1.5 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                >
                  “{text.slice(open.start, open.end)}” could mean
                </li>
                {meanings.map((m, i) => (
                  <li
                    key={i}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={menu?.active === i}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => pick(i)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-1.5 rounded-2 px-2 text-[13px]",
                      menu?.active === i
                        ? "bg-[color-mix(in_oklab,var(--pf-accent)_14%,transparent)] text-foreground"
                        : "text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <span className="text-ink-3">{m.words.field}</span>
                    <span className="text-ink-3">{m.words.op}</span>
                    <span className="font-medium">{m.words.value}</span>
                  </li>
                ))}
              </motion.ul>
            ) : null}
          </AnimatePresence>
        </div>
        <p id={hintId} className="sr-only">
          Finished phrases become filters when you type a space. Tab walks words
          with more than one meaning, arrows choose a meaning and Enter sets it.
          Backspace at the start pulls the last filter back to edit. Enter
          applies.
        </p>
      </div>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        <table className="w-full table-fixed border-collapse text-[12.5px]">
          <caption className="sr-only">
            {results.length} {results.length === 1 ? noun1.one : noun1.other}
          </caption>
          <thead className="sticky top-0 z-[2] bg-card">
            <tr className="border-b border-hairline">
              {[
                ["No.", "w-16 pl-4"],
                ["Customer", ""],
                ["Status", "hidden w-24 @min-[30rem]:table-cell"],
                ["Issued", "hidden w-20 @min-[40rem]:table-cell"],
                ["Due", "hidden w-20 @min-[56rem]:table-cell"],
                ["Amount", "w-24 pr-4 text-right"],
              ].map(([label, cls]) => (
                <th
                  key={label}
                  scope="col"
                  className={cn(
                    "h-8 px-3 text-left font-mono text-[10px] font-normal tracking-[0.08em] text-ink-3 uppercase",
                    cls,
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={status === "loading" || undefined}>{table()}</tbody>
        </table>
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
        <AnimatePresence>
          {ghosts.map((g) => (
            <motion.span
              key={g.id}
              className="absolute flex items-center text-[14px] whitespace-pre text-foreground"
              style={{ left: g.rect.x, top: g.rect.y, height: g.rect.h }}
              initial={{ opacity: 0.9, y: 0 }}
              animate={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
              transition={{ duration: durations.slow, ease: easings.enter }}
            >
              {g.text}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
