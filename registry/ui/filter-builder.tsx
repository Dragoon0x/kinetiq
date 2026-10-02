"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ListPlus,
  Plus,
  RotateCcw,
  TriangleAlert,
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
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FilterFieldType = "text" | "number" | "enum" | "date" | "boolean";
export type FilterCombinator = "and" | "or";
export type FilterCount = "rows" | "share" | "off";
export type FilterStatus = "ready" | "loading" | "error";
export type FilterOperator =
  | "contains"
  | "not-contains"
  | "starts-with"
  | "is"
  | "is-not"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "neq"
  | "within"
  | "before"
  | "after";

export type FilterOption = { value: string; label: string };

export type FilterField = {
  id: string;
  /** Shown in the field menu, the chips and every spoken rule. */
  label: string;
  type: FilterFieldType;
  /** The choices of an enum field. */
  options?: FilterOption[];
  /** Printed before a number: "$". */
  prefix?: string;
  /** Printed after a number: "kg". */
  suffix?: string;
};

export type FilterRule = {
  id: string;
  kind: "rule";
  /** A field id. */
  field: string;
  operator: FilterOperator;
  /** As typed or chosen; "" while the rule still needs a value. */
  value: string;
};

export type FilterGroup = {
  id: string;
  kind: "group";
  combinator: FilterCombinator;
  children: FilterNode[];
};

export type FilterNode = FilterRule | FilterGroup;

/** One record: field id → value. Dates as YYYY-MM-DD or ms. */
export type FilterRow = Record<string, string | number | boolean | null>;

export type FilterBuilderProps = {
  /** How deep groups may nest: 0 is a flat list of rules, 3 is groups within groups within groups. @default 2 */
  nesting?: number;
  /** A strip of chips above the builder that summarises the query. @default true */
  chips?: boolean;
  /** The result readout: a rolling row count, the count with a share meter, or none. @default "rows" */
  count?: FilterCount;
  /** Controlled query: the root group. */
  value?: FilterGroup;
  /** Initial query when uncontrolled. @default defaultFilterQuery */
  defaultValue?: FilterGroup;
  /** Fires from the control that changed the query, with the whole new query. */
  onValueChange?: (query: FilterGroup) => void;
  /** What can be filtered on. @default defaultFilterFields */
  fields?: FilterField[];
  /** The records the count is taken over. @default defaultFilterRows (2,400 seeded transactions) */
  rows?: FilterRow[];
  /** A count from your server; overrides counting `rows`. */
  matches?: number;
  /** The total from your server. @default rows.length */
  total?: number;
  /** "In the last N days" counts back from here (Date or ms). @default defaultFilterNow */
  now?: number | Date;
  /** The footer's Show button; without it there is no Show button. */
  onApply?: (query: FilterGroup) => void;
  /** The Show button's verb. @default "Show" */
  applyLabel?: string;
  /** Rules allowed in the whole query. @default 12 */
  maxRules?: number;
  /** What a row is called in the count. @default { one: "row", other: "rows" } */
  noun?: { one: string; other: string };
  /** Counts as text. @default grouped digits, en-US */
  formatCount?: (n: number) => string;
  /** The preview's row on a desktop-wide builder. @default a generic row from the fields */
  renderRow?: (row: FilterRow) => React.ReactNode;
  /** Whether the count has arrived (for `matches` from a server). @default "ready" */
  status?: FilterStatus;
  /** "Try again" was pressed after the count failed. */
  onRetry?: () => void;
  /** The builder's heading. @default "Filters" */
  title?: string;
  /** The builder's accessible name. @default the title */
  label?: string;
  /** A click for each field, condition or match change, a pop for each rule added or removed. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: the query shows, nothing changes. @default false */
  disabled?: boolean;
  /** Classes for the root. It is at most 560px tall and its body scrolls; pass a max-height class to change that. */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const DAY_MS = 86_400_000;
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
const groupDigits = new Intl.NumberFormat("en-US");

const OPERATORS: Record<FilterFieldType, FilterOperator[]> = {
  text: ["contains", "not-contains", "is", "is-not", "starts-with"],
  number: ["gt", "gte", "lt", "lte", "eq", "neq"],
  enum: ["is", "is-not"],
  date: ["within", "after", "before"],
  boolean: ["is"],
};

/** What the condition menu says. */
const OP_LABEL: Record<FilterOperator, string> = {
  contains: "contains",
  "not-contains": "does not contain",
  "starts-with": "starts with",
  is: "is",
  "is-not": "is not",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  eq: "equals",
  neq: "does not equal",
  within: "in the last",
  before: "before",
  after: "after",
};

/** What a chip says: short, symbols where they read faster. */
const OP_SHORT: Record<FilterOperator, string> = {
  contains: "contains",
  "not-contains": "excludes",
  "starts-with": "starts with",
  is: "is",
  "is-not": "is not",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  eq: "=",
  neq: "≠",
  within: "last",
  before: "before",
  after: "after",
};

const r2 = (v: number) => Math.round(v * 100) / 100;

function mulberry32(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dateMs = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v) return null;
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
};

const shortDate = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCDate()}`;
};

const parseNumber = (text: string): number | null => {
  const clean = text.replace(/[,\s]/g, "");
  if (!clean || !/^-?\d*\.?\d+$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
};

/** A rule is complete when its value can be tested; incomplete rules are left out. */
function ruleState(
  rule: FilterRule,
  field: FilterField | undefined,
): "ok" | "empty" | "invalid" {
  if (!field) return "invalid";
  if (rule.value.trim() === "") return "empty";
  if (
    field.type === "number" ||
    (field.type === "date" && rule.operator === "within")
  ) {
    return parseNumber(rule.value) === null ? "invalid" : "ok";
  }
  if (field.type === "date")
    return dateMs(rule.value) === null ? "invalid" : "ok";
  return "ok";
}

function testRule(
  rule: FilterRule,
  field: FilterField,
  row: FilterRow,
  nowMs: number,
): boolean | null {
  if (ruleState(rule, field) !== "ok") return null;
  const raw = row[field.id];
  const want = rule.value.trim();
  switch (field.type) {
    case "text": {
      const have = String(raw ?? "").toLowerCase();
      const w = want.toLowerCase();
      if (rule.operator === "contains") return have.includes(w);
      if (rule.operator === "not-contains") return !have.includes(w);
      if (rule.operator === "starts-with") return have.startsWith(w);
      if (rule.operator === "is-not") return have !== w;
      return have === w;
    }
    case "number": {
      const have = typeof raw === "number" ? raw : Number(raw);
      const w = parseNumber(want);
      if (w === null || !Number.isFinite(have)) return false;
      if (rule.operator === "gt") return have > w;
      if (rule.operator === "gte") return have >= w;
      if (rule.operator === "lt") return have < w;
      if (rule.operator === "lte") return have <= w;
      if (rule.operator === "neq") return have !== w;
      return have === w;
    }
    case "enum":
      return rule.operator === "is-not"
        ? String(raw ?? "") !== want
        : String(raw ?? "") === want;
    case "boolean":
      return Boolean(raw) === (want === "true");
    case "date": {
      const have = dateMs(raw);
      if (have === null) return false;
      if (rule.operator === "within") {
        const days = parseNumber(want) ?? 0;
        const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
        return have > today - days * DAY_MS && have <= nowMs;
      }
      const at = dateMs(want) ?? 0;
      return rule.operator === "before" ? have < at : have > at;
    }
  }
}

function testNode(
  node: FilterNode,
  fields: Map<string, FilterField>,
  row: FilterRow,
  nowMs: number,
): boolean | null {
  if (node.kind === "rule") {
    const field = fields.get(node.field);
    return field ? testRule(node, field, row, nowMs) : null;
  }
  let seen = false;
  for (const child of node.children) {
    const r = testNode(child, fields, row, nowMs);
    if (r === null) continue;
    seen = true;
    if (node.combinator === "and" && !r) return false;
    if (node.combinator === "or" && r) return true;
  }
  if (!seen) return null;
  return node.combinator === "and";
}

/**
 * Whether a row passes a query. Rules without a usable value are left out,
 * and a group with nothing left in it lets every row through.
 */
export function matchFilter(
  query: FilterGroup,
  row: FilterRow,
  fields: FilterField[] = defaultFilterFields,
  now: number | Date = defaultFilterNow,
): boolean {
  const map = new Map(fields.map((f) => [f.id, f]));
  const nowMs = typeof now === "number" ? now : now.getTime();
  return testNode(query, map, row, nowMs) !== false;
}

const countRules = (node: FilterNode): number =>
  node.kind === "rule"
    ? 1
    : node.children.reduce((sum, c) => sum + countRules(c), 0);
const countGroups = (node: FilterGroup): number =>
  node.children.reduce(
    (sum, c) => sum + (c.kind === "group" ? 1 + countGroups(c) : 0),
    0,
  );

function mapNode(
  node: FilterNode,
  id: string,
  fn: (n: FilterNode) => FilterNode,
): FilterNode {
  if (node.id === id) return fn(node);
  if (node.kind === "rule") return node;
  let changed = false;
  const children = node.children.map((c) => {
    const next = mapNode(c, id, fn);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
}

function removeNode(node: FilterGroup, id: string): FilterGroup {
  const children = node.children
    .filter((c) => c.id !== id)
    .map((c) => (c.kind === "group" ? removeNode(c, id) : c));
  return { ...node, children };
}

/** Every node id under the root, mapped to the root child that holds it. */
function topOf(root: FilterGroup): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: FilterNode, top: string) => {
    out.set(node.id, top);
    if (node.kind === "group") for (const c of node.children) walk(c, top);
  };
  for (const c of root.children) walk(c, c.id);
  return out;
}

const holds = (node: FilterNode, id: string): boolean =>
  node.id === id ||
  (node.kind === "group" && node.children.some((c) => holds(c, id)));

const firstRule = (node: FilterNode): FilterRule | null => {
  if (node.kind === "rule") return node;
  for (const c of node.children) {
    const r = firstRule(c);
    if (r) return r;
  }
  return null;
};

/* ------------------------------ default data ------------------------------ */

/** 30 September 2026, noon UTC: "the last N days" count back from here. */
export const defaultFilterNow = Date.UTC(2026, 8, 30, 12, 0);

const CATEGORIES = [
  {
    value: "groceries",
    label: "Groceries",
    weight: 22,
    scale: 70,
    shops: ["Coldbrook Grocers", "Basin Market", "Fieldline Fresh"],
  },
  {
    value: "dining",
    label: "Dining",
    weight: 18,
    scale: 55,
    shops: ["Fern & Ember", "Coldbrook Noodle Bar", "The Waylight Table"],
  },
  {
    value: "travel",
    label: "Travel",
    weight: 9,
    scale: 640,
    shops: ["Waylight Air", "Fernworks Rail", "Gauge Valley Inn"],
  },
  {
    value: "software",
    label: "Software",
    weight: 14,
    scale: 120,
    shops: ["Gaugeworks Cloud", "Fieldline Apps", "Basinworks Studio"],
  },
  {
    value: "fuel",
    label: "Fuel",
    weight: 12,
    scale: 65,
    shops: ["Basin Fuel", "Gauge Stop"],
  },
  {
    value: "utilities",
    label: "Utilities",
    weight: 10,
    scale: 140,
    shops: ["Coldbrook Power", "Fieldline Water"],
  },
  {
    value: "transfers",
    label: "Transfers",
    weight: 15,
    scale: 900,
    shops: ["Waylight Pay transfer", "Savings sweep"],
  },
];
const STATUSES = [
  { value: "settled", label: "Settled", weight: 78 },
  { value: "pending", label: "Pending", weight: 10 },
  { value: "declined", label: "Declined", weight: 7 },
  { value: "refunded", label: "Refunded", weight: 5 },
];
const REGIONS = [
  { value: "basin", label: "Basin", weight: 30 },
  { value: "fernland", label: "Fernland", weight: 22 },
  { value: "coldbrook-isles", label: "Coldbrook Isles", weight: 18 },
  { value: "waylight-coast", label: "Waylight Coast", weight: 18 },
  { value: "gauge-valley", label: "Gauge Valley", weight: 12 },
];
const CARDS = [
  { value: "debit", label: "Debit", weight: 45 },
  { value: "credit", label: "Credit", weight: 40 },
  { value: "virtual", label: "Virtual", weight: 15 },
];

const pick = <T extends { weight: number }>(list: T[], r: number): T => {
  const total = list.reduce((s, x) => s + x.weight, 0);
  let at = r * total;
  for (const x of list) {
    at -= x.weight;
    if (at < 0) return x;
  }
  return list[list.length - 1] as T;
};
const optionsOf = (list: { value: string; label: string }[]): FilterOption[] =>
  list.map(({ value, label }) => ({ value, label }));

export const defaultFilterFields: FilterField[] = [
  { id: "status", label: "Status", type: "enum", options: optionsOf(STATUSES) },
  { id: "amount", label: "Amount", type: "number", prefix: "$" },
  {
    id: "category",
    label: "Category",
    type: "enum",
    options: optionsOf(CATEGORIES),
  },
  { id: "region", label: "Region", type: "enum", options: optionsOf(REGIONS) },
  { id: "card", label: "Card", type: "enum", options: optionsOf(CARDS) },
  { id: "merchant", label: "Merchant", type: "text" },
  { id: "date", label: "Date", type: "date" },
  { id: "flagged", label: "Flagged", type: "boolean" },
];

/**
 * 2,400 Coldbrook Bank card transactions over 120 days: mostly settled,
 * groceries and dining small and frequent, travel and transfers rare and
 * large, a few flagged — the declined ones most of all.
 */
export const defaultFilterRows: FilterRow[] = (() => {
  const rand = mulberry32(1315);
  const today = Math.floor(defaultFilterNow / DAY_MS);
  return Array.from({ length: 2400 }, (_, i) => {
    const cat = pick(CATEGORIES, rand());
    const status = pick(STATUSES, rand());
    const amount = r2(cat.scale * (0.25 + 1.6 * Math.pow(rand(), 1.6)));
    const day = today - Math.floor(Math.pow(rand(), 1.3) * 120);
    const shop = cat.shops[Math.floor(rand() * cat.shops.length)] ?? "";
    return {
      id: `t${String(i + 1).padStart(4, "0")}`,
      status: status.value,
      amount,
      category: cat.value,
      region: pick(REGIONS, rand()).value,
      card: pick(CARDS, rand()).value,
      merchant: shop,
      date: new Date(day * DAY_MS).toISOString().slice(0, 10),
      flagged: rand() < (status.value === "declined" ? 0.3 : 0.02),
    };
  });
})();

/** Settled payments over $250 that were travel, or virtual-card spend in Fernland. */
export const defaultFilterQuery: FilterGroup = {
  id: "root",
  kind: "group",
  combinator: "and",
  children: [
    {
      id: "r1",
      kind: "rule",
      field: "status",
      operator: "is",
      value: "settled",
    },
    { id: "r2", kind: "rule", field: "amount", operator: "gt", value: "250" },
    {
      id: "g1",
      kind: "group",
      combinator: "or",
      children: [
        {
          id: "r3",
          kind: "rule",
          field: "category",
          operator: "is",
          value: "travel",
        },
        {
          id: "g2",
          kind: "group",
          combinator: "and",
          children: [
            {
              id: "r4",
              kind: "rule",
              field: "region",
              operator: "is",
              value: "fernland",
            },
            {
              id: "r5",
              kind: "rule",
              field: "card",
              operator: "is",
              value: "virtual",
            },
          ],
        },
      ],
    },
  ],
};

/* --------------------------------- tokens --------------------------------- */

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** Rails are strokes, so they take the plain tokens: cobalt for all, signal for any. */
const RAIL: Record<FilterCombinator, string> = {
  and: "var(--accent-bright)",
  or: "var(--signal)",
};

const CONTROL =
  "h-8 w-full min-w-0 rounded-2 border bg-surface-0 text-[13px] text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/* ------------------------------ rolling digits ----------------------------- */

/** One digit as a column of 0–9 that rides to its place on `snap`. */
function Digit({ d, motionSafe }: { d: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-block h-[1em] w-[1ch] overflow-clip">
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-d * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="block h-[1em] text-center leading-none">
            {i}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * A figure whose digits roll. Columns are keyed from the right, so a count
 * that gains a digit grows one on the left and the rest keep rolling.
 */
function Roll({ text, motionSafe }: { text: string; motionSafe: boolean }) {
  const chars = text.split("");
  return (
    <span aria-hidden className="inline-flex leading-none tabular-nums">
      {chars.map((ch, i) => {
        const k = chars.length - 1 - i;
        return /\d/.test(ch) ? (
          <Digit key={`d${k}`} d={Number(ch)} motionSafe={motionSafe} />
        ) : (
          <span key={`s${k}`} className="inline-block h-[1em] leading-none">
            {ch}
          </span>
        );
      })}
    </span>
  );
}

/** "and" and "or" stacked in one cell; switching rolls one out and the other in. */
function Joiner({
  combinator,
  delay,
  motionSafe,
  className,
}: {
  combinator: FilterCombinator;
  delay: number;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid overflow-clip font-mono text-[10px] leading-none tracking-[0.06em] uppercase",
        className,
      )}
    >
      {(["and", "or"] as const).map((word) => (
        <motion.span
          key={word}
          className="col-start-1 row-start-1 text-center"
          initial={false}
          animate={{
            y: word === combinator ? "0%" : word === "and" ? "-110%" : "110%",
            opacity: word === combinator ? 1 : 0,
          }}
          transition={motionSafe ? { ...springs.snap, delay } : { duration: 0 }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

/* --------------------------------- context -------------------------------- */

type Ctx = {
  uid: string;
  fields: FilterField[];
  fieldById: Map<string, FilterField>;
  nesting: number;
  motionSafe: boolean;
  disabled: boolean;
  canAddRule: boolean;
  maxRules: number;
  hot: string | null;
  hintId: string;
  setHot: (id: string | null) => void;
  setCombinator: (groupId: string, c: FilterCombinator) => void;
  addRule: (groupId: string) => void;
  addGroup: (groupId: string) => void;
  remove: (node: FilterNode, siblings: FilterNode[]) => void;
  updateRule: (rule: FilterRule, patch: Partial<FilterRule>) => void;
  registerFocus: (id: string, el: HTMLElement | null) => void;
  registerAdd: (groupId: string, el: HTMLElement | null) => void;
  onEnter: () => void;
  spoken: (rule: FilterRule) => string;
};

/* -------------------------------- a segment -------------------------------- */

function MatchToggle({
  ctx,
  group,
  depth,
  labelId,
}: {
  ctx: Ctx;
  group: FilterGroup;
  depth: number;
  labelId: string;
}) {
  const refs = React.useRef(new Map<FilterCombinator, HTMLButtonElement>());
  const choices: FilterCombinator[] = ["and", "or"];
  const go = (c: FilterCombinator, focus: boolean) => {
    if (focus) refs.current.get(c)?.focus();
    ctx.setCombinator(group.id, c);
  };
  return (
    <span
      role="radiogroup"
      aria-label={depth === 0 ? "Match" : `Match, level ${depth + 1}`}
      aria-describedby={labelId}
      className="relative inline-flex h-7 shrink-0 items-center gap-0.5 rounded-2 bg-surface-2 p-0.5"
    >
      {choices.map((c) => {
        const on = group.combinator === c;
        return (
          <button
            key={c}
            ref={(node) => {
              if (node) refs.current.set(c, node);
              else refs.current.delete(c);
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={ctx.disabled}
            onClick={() => go(c, false)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                go(c === "and" ? "or" : "and", true);
              }
            }}
            className={cn(
              "relative inline-flex h-6 min-w-9 items-center justify-center rounded-[5px] px-2 text-[12px] transition-colors",
              on
                ? "text-foreground"
                : "text-ink-3 enabled:hover:text-foreground",
              "disabled:cursor-not-allowed",
              RING_IN,
            )}
          >
            {on ? (
              <motion.span
                layoutId={`${ctx.uid}-match-${group.id}`}
                aria-hidden
                className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                transition={ctx.motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{c === "and" ? "All" : "Any"}</span>
          </button>
        );
      })}
    </span>
  );
}

/* ---------------------------------- a rule --------------------------------- */

function Select({
  value,
  onChange,
  label,
  options,
  disabled,
  placeholder,
  register,
  className,
  dashed,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: FilterOption[];
  disabled: boolean;
  placeholder?: string;
  register?: (el: HTMLElement | null) => void;
  className?: string;
  dashed?: boolean;
}) {
  return (
    <span className={cn("relative block min-w-0", className)}>
      <select
        ref={register}
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={cn(
          CONTROL,
          "cursor-pointer appearance-none truncate pr-7 pl-2.5",
          dashed
            ? "border-dashed border-hairline-strong text-ink-3"
            : "border-hairline enabled:hover:border-hairline-strong",
          RING_IN,
        )}
      >
        {placeholder !== undefined ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-3"
      />
    </span>
  );
}

function RuleRow({
  ctx,
  rule,
  position,
  siblings,
  parentId,
}: {
  ctx: Ctx;
  rule: FilterRule;
  position: string;
  siblings: FilterNode[];
  /** The group it sits in, or null at the root: where the pointer goes back to. */
  parentId: string | null;
}) {
  const field = ctx.fieldById.get(rule.field);
  const state = ruleState(rule, field);
  const type = field?.type ?? "text";
  const ops = OPERATORS[type];
  const valueId = `${ctx.uid}-v-${rule.id}`;
  const errorId = `${ctx.uid}-e-${rule.id}`;
  const dateDays = type === "date" && rule.operator === "within";

  const setValue = (v: string) => ctx.updateRule(rule, { value: v });
  const inputClass = cn(
    CONTROL,
    "px-2.5 placeholder:text-ink-3",
    state === "invalid"
      ? "border-danger/70"
      : state === "empty"
        ? "border-dashed border-hairline-strong"
        : "border-hairline enabled:hover:border-hairline-strong",
    RING_IN,
  );
  const described =
    state === "invalid" ? errorId : state === "empty" ? ctx.hintId : undefined;

  let control: React.ReactNode;
  if (field && (type === "enum" || type === "boolean")) {
    control = (
      <Select
        label={`Value, ${position}`}
        value={rule.value}
        onChange={setValue}
        disabled={ctx.disabled}
        placeholder={type === "enum" ? "Choose…" : undefined}
        dashed={state === "empty"}
        options={
          type === "boolean"
            ? [
                { value: "true", label: "Yes" },
                { value: "false", label: "No" },
              ]
            : (field.options ?? [])
        }
      />
    );
  } else {
    const prefix = type === "number" ? field?.prefix : undefined;
    const suffix =
      type === "number" ? field?.suffix : dateDays ? "days" : undefined;
    control = (
      <span className="relative block min-w-0">
        {prefix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-ink-3"
          >
            {prefix}
          </span>
        ) : null}
        <input
          id={valueId}
          type={type === "date" && !dateDays ? "date" : "text"}
          inputMode={type === "number" || dateDays ? "decimal" : undefined}
          aria-label={`Value, ${position}`}
          aria-invalid={state === "invalid" || undefined}
          aria-describedby={described}
          placeholder={state === "empty" ? "Needs a value" : undefined}
          value={rule.value}
          disabled={ctx.disabled}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              ctx.onEnter();
            }
          }}
          className={cn(inputClass, prefix && "pl-6", suffix && "pr-11")}
        />
        {suffix ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px] text-ink-3"
          >
            {suffix}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1.5 @min-[40rem]:grid-cols-[9.5rem_8.5rem_minmax(0,1fr)_auto] @min-[40rem]:gap-2"
      onPointerEnter={() => ctx.setHot(rule.id)}
      onPointerLeave={() => ctx.setHot(parentId)}
    >
      <Select
        className="col-start-1 row-start-1"
        label={`Field, ${position}`}
        value={rule.field}
        disabled={ctx.disabled}
        register={(el) => ctx.registerFocus(rule.id, el)}
        onChange={(id) => {
          const next = ctx.fieldById.get(id);
          if (!next) return;
          const keep = next.type === type;
          const operator = OPERATORS[next.type].includes(rule.operator)
            ? rule.operator
            : (OPERATORS[next.type][0] ?? "is");
          ctx.updateRule(rule, {
            field: id,
            operator,
            value:
              next.type === "boolean"
                ? "true"
                : keep && next.type !== "enum"
                  ? rule.value
                  : "",
          });
        }}
        options={ctx.fields.map((f) => ({ value: f.id, label: f.label }))}
      />
      <Select
        className="col-start-2 row-start-1"
        label={`Condition, ${position}`}
        value={rule.operator}
        disabled={ctx.disabled || ops.length < 2}
        onChange={(op) =>
          ctx.updateRule(rule, {
            operator: op as FilterOperator,
            // A days count and a date are different values.
            value:
              type === "date" &&
              (op === "within") !== (rule.operator === "within")
                ? ""
                : rule.value,
          })
        }
        options={ops.map((op) => ({ value: op, label: OP_LABEL[op] }))}
      />
      <span className="col-span-2 col-start-1 row-start-2 min-w-0 @min-[40rem]:col-span-1 @min-[40rem]:col-start-3 @min-[40rem]:row-start-1">
        {control}
        {state === "invalid" ? (
          <span id={errorId} className="sr-only">
            {dateDays || type === "number"
              ? "Enter a number."
              : "Enter a date."}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        aria-label={`Remove rule: ${ctx.spoken(rule)}`}
        disabled={ctx.disabled}
        onClick={() => ctx.remove(rule, siblings)}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors",
          "col-start-3 row-start-1 enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:cursor-not-allowed @min-[40rem]:col-start-4",
          RING_IN,
        )}
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}

/* --------------------------------- a group --------------------------------- */

function GroupView({
  ctx,
  group,
  depth,
  siblings,
}: {
  ctx: Ctx;
  group: FilterGroup;
  depth: number;
  siblings: FilterNode[];
}) {
  const labelId = `${ctx.uid}-gl-${group.id}`;
  const step = cascade(Math.max(2, group.children.length));
  // Lit while the pointer or focus is anywhere inside it.
  const lit = ctx.hot !== null && holds(group, ctx.hot);
  const nested = depth > 0;
  const rules = group.children.filter((c) => c.kind === "rule").length;

  const add = (
    <span className="ml-auto flex shrink-0 items-center gap-0.5">
      <button
        ref={(el) => ctx.registerAdd(group.id, el)}
        type="button"
        disabled={ctx.disabled || !ctx.canAddRule}
        title={ctx.canAddRule ? undefined : `Up to ${ctx.maxRules} rules`}
        onClick={() => ctx.addRule(group.id)}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors",
          "enabled:hover:bg-cobalt-wash disabled:cursor-not-allowed disabled:opacity-50",
          RING_IN,
        )}
      >
        <Plus aria-hidden className="size-3.5" />
        <span className="@max-[26rem]:sr-only">Rule</span>
        <span className="sr-only">
          {" "}
          {nested ? "to this group" : "to the query"}
        </span>
      </button>
      {depth < ctx.nesting ? (
        <button
          type="button"
          disabled={ctx.disabled || !ctx.canAddRule}
          onClick={() => ctx.addGroup(group.id)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-[12px] text-cobalt-bright transition-colors",
            "enabled:hover:bg-cobalt-wash disabled:cursor-not-allowed disabled:opacity-50",
            RING_IN,
          )}
        >
          <ListPlus aria-hidden className="size-3.5" />
          <span className="@max-[26rem]:sr-only">Group</span>
          <span className="sr-only">
            {" "}
            {nested ? "inside this group" : "to the query"}
          </span>
        </button>
      ) : null}
      {nested ? (
        <button
          type="button"
          aria-label={`Remove group: ${group.combinator === "and" ? "all" : "any"} of ${group.children.length} ${group.children.length === 1 ? "item" : "items"}`}
          disabled={ctx.disabled}
          onClick={() => ctx.remove(group, siblings)}
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors",
            "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:cursor-not-allowed",
            RING_IN,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </span>
  );

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      onPointerEnter={nested ? () => ctx.setHot(group.id) : undefined}
      onPointerLeave={nested ? () => ctx.setHot(null) : undefined}
      onFocus={
        nested
          ? (event) => {
              event.stopPropagation();
              ctx.setHot(group.id);
            }
          : undefined
      }
      onBlur={
        nested
          ? (event) => {
              const to = event.relatedTarget;
              if (!(to instanceof Node) || !event.currentTarget.contains(to)) {
                ctx.setHot(null);
              }
            }
          : undefined
      }
      className={cn(
        "flex flex-col",
        nested &&
          "rounded-3 border bg-surface-1 px-2 pt-1.5 pb-2 transition-colors",
        nested && (lit ? "border-hairline-strong" : "border-hairline"),
      )}
    >
      <div className="flex h-8 items-center gap-2 pl-0.5">
        <MatchToggle ctx={ctx} group={group} depth={depth} labelId={labelId} />
        <span id={labelId} className="truncate text-[12px] text-ink-2">
          <span className="sr-only">
            {group.combinator === "and" ? "All" : "Any"}{" "}
          </span>
          of these
          <span className="sr-only">
            {depth > 0 ? `, level ${depth + 1}` : ""}, {rules}{" "}
            {rules === 1 ? "rule" : "rules"}
          </span>
        </span>
        {add}
      </div>

      <div className="relative mt-1">
        {group.children.length > 0 ? (
          <span
            aria-hidden
            className={cn(
              "absolute top-1 bottom-4 left-[10px] w-0.5 rounded-full transition-[background-color,opacity] duration-300",
              lit || !nested ? "opacity-90" : "opacity-55",
            )}
            style={{ background: RAIL[group.combinator] }}
          />
        ) : null}
        <AnimatePresence initial={false}>
          {group.children.map((child, i) => (
            <motion.div
              key={child.id}
              className="relative overflow-clip pl-6 @max-[26rem]:pl-5"
              initial={
                ctx.motionSafe
                  ? { height: 0, opacity: 0, x: -distances.step }
                  : { opacity: 0 }
              }
              animate={{ height: "auto", opacity: 1, x: 0 }}
              exit={{
                opacity: 0,
                height: ctx.motionSafe ? 0 : "auto",
                transition: {
                  opacity: exitFor(durations.fast),
                  // The gap closing is the siblings' layout, not the row's
                  // exit: it rides glide while the row itself fades out.
                  height: ctx.motionSafe ? springs.glide : { duration: 0 },
                },
              }}
              transition={{
                height: ctx.motionSafe ? springs.glide : { duration: 0 },
                x: ctx.motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.base, ease: easings.enter },
              }}
            >
              {i > 0 ? (
                <span className="flex h-3.5 items-center">
                  <Joiner
                    combinator={group.combinator}
                    delay={(i - 1) * step}
                    motionSafe={ctx.motionSafe}
                    className="absolute left-[11px] -translate-x-1/2 rounded-full bg-card px-0.5 text-[9px] text-ink-3"
                  />
                </span>
              ) : null}
              <div className="py-0.5">
                {child.kind === "rule" ? (
                  <RuleRow
                    ctx={ctx}
                    parentId={nested ? group.id : null}
                    rule={child}
                    position={`rule ${i + 1}${nested ? ` in level ${depth + 1}` : ""}`}
                    siblings={group.children}
                  />
                ) : (
                  <GroupView
                    ctx={ctx}
                    group={child}
                    depth={depth + 1}
                    siblings={group.children}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {group.children.length === 0 ? (
          <p className="py-2 pl-6 text-[12px] text-ink-3">
            No rules here yet; every row matches.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* --------------------------------- builder -------------------------------- */

const fallbackRow = (fields: FilterField[]) =>
  function DefaultRow(row: FilterRow) {
    const text = fields.find((f) => f.type === "text");
    const num = fields.find((f) => f.type === "number");
    const meta = fields
      .filter((f) => f !== text && f !== num && f.type !== "boolean")
      .slice(0, 3);
    const show = (f: FilterField) => {
      const v = row[f.id];
      if (v === null || v === undefined || v === "") return null;
      if (f.type === "enum")
        return f.options?.find((o) => o.value === v)?.label ?? String(v);
      if (f.type === "date") {
        const ms = dateMs(v);
        return ms === null ? null : shortDate(ms);
      }
      return String(v);
    };
    const amount = num ? row[num.id] : null;
    return (
      <span className="flex w-full items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-foreground">
            {text ? String(row[text.id] ?? "") : String(row.id ?? "")}
          </span>
          <span className="block truncate text-[11px] text-ink-3">
            {meta.map(show).filter(Boolean).join(" · ")}
          </span>
        </span>
        {num && typeof amount === "number" ? (
          <span className="shrink-0 font-mono text-[12px] text-foreground tabular-nums">
            {num.prefix ?? ""}
            {amount.toFixed(2)}
            {num.suffix ?? ""}
          </span>
        ) : null}
      </span>
    );
  };

/**
 * A query builder that shows its work. Rules are rows of field, condition
 * and value; groups nest them, each with a rail down its left edge and an
 * All / Any switch whose thumb slides on `snap`. Switching re-colours the
 * rail and rolls every "and" between its rows to "or" (or back) on `snap`,
 * top to bottom a `cascade` apart, so the change visibly runs down the
 * group. Rows arrive from zero height on `glide` a step from the left;
 * removed rows fade out while the gap they leave closes on `glide`.
 *
 * Every change re-runs the query over the rows and the count rolls to its
 * new figure a digit at a time on `snap`; chips above summarise the query
 * and lead back to their rows. On a desktop-wide builder a preview lists the
 * newest rows that match. All of it is native controls in groups and radio
 * groups, the count is announced once typing settles, and under reduced
 * motion rows and chips fade, digits swap and joiners swap — the count and
 * the meter still change, because they are the answer.
 */
export function FilterBuilder({
  nesting = 2,
  chips = true,
  count = "rows",
  value,
  defaultValue = defaultFilterQuery,
  onValueChange,
  fields = defaultFilterFields,
  rows = defaultFilterRows,
  matches,
  total,
  now = defaultFilterNow,
  onApply,
  applyLabel = "Show",
  maxRules = 12,
  noun = { one: "row", other: "rows" },
  formatCount = (n: number) => groupDigits.format(n),
  renderRow,
  status = "ready",
  onRetry,
  title = "Filters",
  label,
  sound = false,
  disabled = false,
  className,
}: FilterBuilderProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const depthLimit = Math.min(3, Math.max(0, Math.round(nesting)));

  const [own, setOwn] = React.useState(defaultValue);
  const query = value ?? own;
  const [hot, setHot] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const focusables = React.useRef(new Map<string, HTMLElement>());
  const addButtons = React.useRef(new Map<string, HTMLElement>());
  const pendingFocus = React.useRef<string | null>(null);
  const seq = React.useRef(0);
  const speakTimer = React.useRef<number | null>(null);

  const fieldById = React.useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields],
  );

  const countOf = React.useCallback(
    (q: FilterGroup) => {
      let n = 0;
      for (const row of rows) {
        if (testNode(q, fieldById, row, nowMs) !== false) n += 1;
      }
      return n;
    },
    [rows, fieldById, nowMs],
  );
  const counted = React.useMemo(() => countOf(query), [countOf, query]);
  const matched = matches ?? counted;
  const all = total ?? rows.length;
  const ruleCount = countRules(query);
  const groupCount = countGroups(query);
  const nounOf = (n: number) => (n === 1 ? noun.one : noun.other);

  React.useEffect(
    () => () => {
      if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    },
    [],
  );

  /* ------------------------------- changes -------------------------------- */

  const sentence = (q: FilterGroup) =>
    matches !== undefined
      ? ""
      : `${formatCount(countOf(q))} of ${formatCount(all)} ${nounOf(all)} match.`;

  /** Speaks the count once typing has settled; a new change starts the wait again. */
  const speakLater = (text: string) => {
    if (speakTimer.current !== null) window.clearTimeout(speakTimer.current);
    if (!text) return;
    speakTimer.current = window.setTimeout(() => {
      speakTimer.current = null;
      say(text);
    }, 500);
  };

  const commit = (next: FilterGroup) => {
    if (disabled) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const newId = (prefix: string) => {
    seq.current += 1;
    return `${prefix}-${uid.replace(/[^a-zA-Z0-9]/g, "")}-${seq.current}`;
  };

  const newRule = (): FilterRule => {
    const field = fields[0];
    const type = field?.type ?? "text";
    return {
      id: newId("rule"),
      kind: "rule",
      field: field?.id ?? "",
      operator: OPERATORS[type][0] ?? "is",
      value: type === "boolean" ? "true" : "",
    };
  };

  const insert = (groupId: string, node: FilterNode) => {
    const next = mapNode(query, groupId, (g) =>
      g.kind === "group" ? { ...g, children: [...g.children, node] } : g,
    ) as FilterGroup;
    const first = firstRule(node);
    pendingFocus.current = first?.id ?? null;
    audio.play("pop", { pitch: 1.1, gain: 0.5 });
    commit(next);
    say(node.kind === "rule" ? "Rule added." : "Group added.");
    speakLater(sentence(next));
  };

  const ctx: Ctx = {
    uid,
    fields,
    fieldById,
    nesting: depthLimit,
    motionSafe,
    disabled,
    canAddRule: ruleCount < maxRules,
    maxRules,
    hot,
    hintId,
    setHot,
    setCombinator: (groupId, c) => {
      const group = groupId === query.id ? query : findGroup(query, groupId);
      if (!group || group.combinator === c) return;
      const next = mapNode(query, groupId, (g) =>
        g.kind === "group" ? { ...g, combinator: c } : g,
      ) as FilterGroup;
      audio.play("click", { pitch: c === "or" ? 1.15 : 0.95, gain: 0.45 });
      commit(next);
      say(c === "and" ? "Match all." : "Match any.");
      speakLater(sentence(next));
    },
    addRule: (groupId) => {
      if (ruleCount >= maxRules) return;
      insert(groupId, newRule());
    },
    addGroup: (groupId) => {
      if (ruleCount >= maxRules) return;
      insert(groupId, {
        id: newId("group"),
        kind: "group",
        combinator: "or",
        children: [newRule()],
      });
    },
    remove: (node, siblings) => {
      const i = siblings.findIndex((s) => s.id === node.id);
      const neighbour = siblings[i + 1] ?? siblings[i - 1];
      const target = neighbour ? firstRule(neighbour) : null;
      // Focus moves before the row leaves, so it is never dropped on the page.
      const el =
        (target && focusables.current.get(target.id)) ||
        addButtons.current.get(parentOf(query, node.id)?.id ?? query.id);
      el?.focus();
      const next = removeNode(query, node.id);
      audio.play("pop", { pitch: 0.8, gain: 0.45 });
      commit(next);
      say(node.kind === "rule" ? "Rule removed." : "Group removed.");
      speakLater(sentence(next));
    },
    updateRule: (rule, patch) => {
      const next = mapNode(query, rule.id, (n) =>
        n.kind === "rule" ? { ...n, ...patch } : n,
      ) as FilterGroup;
      if (patch.field !== undefined || patch.operator !== undefined) {
        audio.play("click", { pitch: 1, gain: 0.4 });
      }
      commit(next);
      speakLater(sentence(next));
    },
    registerFocus: (id, el) => {
      if (!el) {
        focusables.current.delete(id);
        return;
      }
      focusables.current.set(id, el);
      // A new rule takes focus the moment its field arrives.
      if (pendingFocus.current === id) {
        pendingFocus.current = null;
        el.focus();
      }
    },
    registerAdd: (groupId, el) => {
      if (el) addButtons.current.set(groupId, el);
      else addButtons.current.delete(groupId);
    },
    onEnter: () => {
      if (onApply && status === "ready" && !disabled) onApply(query);
    },
    spoken: (rule) => spokenRule(rule, fieldById.get(rule.field)),
  };

  const clearAll = () => {
    if (!query.children.length) return;
    addButtons.current.get(query.id)?.focus();
    const next = { ...query, children: [] };
    audio.play("pop", { pitch: 0.7, gain: 0.45 });
    commit(next);
    say(`Filters cleared. ${sentence(next)}`);
  };

  /* -------------------------------- render -------------------------------- */

  const tops = topOf(query);
  const hotTop = hot ? tops.get(hot) : undefined;
  const preview = React.useMemo(() => {
    const dateField = fields.find((f) => f.type === "date");
    const hits: FilterRow[] = [];
    for (const row of rows) {
      if (testNode(query, fieldById, row, nowMs) !== false) hits.push(row);
    }
    if (dateField) {
      hits.sort(
        (a, b) =>
          (dateMs(b[dateField.id]) ?? 0) - (dateMs(a[dateField.id]) ?? 0),
      );
    }
    return hits.slice(0, 6);
  }, [rows, query, fieldById, nowMs, fields]);
  const drawRow = renderRow ?? fallbackRow(fields);

  const share = all > 0 ? matched / all : 0;
  const readout =
    count === "off" ? null : status === "loading" ? (
      <p className="flex h-[22px] items-center gap-2 text-[12px] text-ink-3">
        <span
          aria-hidden
          className={cn(
            "size-3 rounded-full border-2 border-ink-3/30 border-t-cobalt-bright",
            motionSafe && "animate-spin",
          )}
        />
        Counting…
      </p>
    ) : status === "error" ? (
      <p className="flex items-center gap-2 text-[12px] text-ink-2">
        <TriangleAlert aria-hidden className="size-3.5 text-danger" />
        Count unavailable
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-[12px] text-foreground hover:bg-surface-2",
              RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </p>
    ) : (
      <div className="flex items-center gap-3">
        {count === "share" ? (
          <span
            role="meter"
            aria-label="Share of rows matched"
            aria-valuemin={0}
            aria-valuemax={all}
            aria-valuenow={matched}
            aria-valuetext={`${Math.round(share * 100)}%`}
            className="relative block h-1.5 w-20 overflow-clip rounded-full bg-surface-2 @min-[40rem]:w-28"
          >
            <motion.span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: "oklch(from var(--accent-bright) 0.62 0.17 h)",
              }}
              initial={false}
              animate={{ width: `${r2(share * 100)}%` }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          </span>
        ) : null}
        <p className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-mono text-[22px] leading-none text-foreground">
            <Roll
              text={
                count === "share"
                  ? `${Math.round(share * 100)}%`
                  : formatCount(matched)
              }
              motionSafe={motionSafe}
            />
            <span className="sr-only">
              {count === "share"
                ? `${Math.round(share * 100)}%`
                : formatCount(matched)}
            </span>
          </span>
          <span className="text-[12px] text-ink-3">
            {count === "share"
              ? `${formatCount(matched)} of ${formatCount(all)}`
              : `of ${formatCount(all)} ${nounOf(all)}`}
          </span>
        </p>
      </div>
    );

  return (
    <div
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container flex max-h-[560px] w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="truncate text-[11px] text-ink-3">
            {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
            {groupCount
              ? ` · ${groupCount} ${groupCount === 1 ? "group" : "groups"}`
              : ""}
          </p>
        </div>
        {readout}
      </header>

      {chips && query.children.length > 0 ? (
        <ul
          role="list"
          aria-label="Summary"
          className="flex flex-wrap items-center gap-1.5 border-b border-hairline px-4 py-2.5"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {query.children.map((child, i) => {
              const text = chipText(child, fieldById);
              const incomplete =
                child.kind === "rule" &&
                ruleState(child, fieldById.get(child.field)) !== "ok";
              const lit = hotTop === child.id;
              return (
                <motion.li
                  key={child.id}
                  layout={motionSafe ? "position" : false}
                  className="flex items-center gap-1.5"
                  initial={
                    motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 0 }
                  }
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: motionSafe ? 0.92 : 1,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? { ...springs.snap, layout: springs.glide }
                      : { duration: durations.fast }
                  }
                >
                  {i > 0 ? (
                    <Joiner
                      combinator={query.combinator}
                      delay={(i - 1) * cascade(query.children.length)}
                      motionSafe={motionSafe}
                      className="text-ink-3"
                    />
                  ) : null}
                  <span
                    onPointerEnter={() => setHot(child.id)}
                    onPointerLeave={() => setHot(null)}
                    className={cn(
                      "inline-flex h-7 max-w-[16rem] items-center rounded-full border text-[12px] transition-colors",
                      incomplete
                        ? "border-dashed text-ink-3"
                        : "text-foreground",
                      lit
                        ? "border-hairline-strong bg-cobalt-wash"
                        : "border-hairline bg-surface-1",
                    )}
                  >
                    <button
                      type="button"
                      title={text}
                      onClick={() => {
                        const r = firstRule(child);
                        if (r) focusables.current.get(r.id)?.focus();
                      }}
                      className={cn(
                        "h-full min-w-0 truncate rounded-full pr-1 pl-2.5",
                        RING_IN,
                      )}
                    >
                      {text}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${text}`}
                      disabled={disabled}
                      onClick={() => ctx.remove(child, query.children)}
                      className={cn(
                        "mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors",
                        "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:cursor-not-allowed",
                        RING_IN,
                      )}
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      ) : null}

      <div className="grid flex-1 grid-rows-[minmax(0,1fr)] overflow-hidden @min-[68rem]:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="[scrollbar-width:thin] overflow-y-auto overscroll-contain p-3 @min-[40rem]:p-4">
          <p id={hintId} className="sr-only">
            Rules without a value are left out of the count.
          </p>
          <GroupView ctx={ctx} group={query} depth={0} siblings={[]} />
        </div>
        <section
          aria-label="Matching rows"
          className="hidden [scrollbar-width:thin] overflow-y-auto overscroll-contain border-l border-hairline bg-surface-1 p-4 @min-[68rem]:block"
        >
          <p className="mb-2 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-medium text-ink-2">Newest matches</span>
            <span className="text-[11px] text-ink-3">
              {Math.min(preview.length, 6)} of {formatCount(counted)}
            </span>
          </p>
          {preview.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ink-3">
              Nothing matches. Loosen a rule.
            </p>
          ) : (
            <ol role="list" className="flex flex-col">
              <AnimatePresence initial={false} mode="popLayout">
                {preview.map((row, i) => (
                  <motion.li
                    key={String(row.id ?? i)}
                    layout={motionSafe ? "position" : false}
                    className="flex items-center border-b border-hairline py-2 last:border-b-0"
                    initial={
                      motionSafe
                        ? { opacity: 0, y: distances.nudge }
                        : { opacity: 0 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.glide,
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    {drawRow(row)}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          )}
        </section>
      </div>

      <footer className="flex items-center gap-2 border-t border-hairline px-4 py-2.5">
        <button
          type="button"
          disabled={disabled || query.children.length === 0}
          onClick={clearAll}
          className={cn(
            "inline-flex h-8 items-center rounded-2 px-2.5 text-[13px] text-ink-2 transition-colors",
            "enabled:hover:bg-surface-2 enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            RING,
          )}
        >
          Clear all
        </button>
        {onApply ? (
          <button
            type="button"
            disabled={disabled || status !== "ready"}
            onClick={() => onApply(query)}
            className={cn(
              "ml-auto inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground transition-opacity",
              "enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
              RING,
            )}
          >
            {applyLabel}
            {count !== "off" && status === "ready" ? (
              <span className="font-mono tabular-nums">
                {formatCount(matched)}
              </span>
            ) : null}
          </button>
        ) : null}
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/* ------------------------------ text helpers ------------------------------ */

function findGroup(root: FilterGroup, id: string): FilterGroup | null {
  for (const c of root.children) {
    if (c.kind !== "group") continue;
    if (c.id === id) return c;
    const found = findGroup(c, id);
    if (found) return found;
  }
  return null;
}

function parentOf(root: FilterGroup, id: string): FilterGroup | null {
  for (const c of root.children) {
    if (c.id === id) return root;
    if (c.kind === "group") {
      const found = parentOf(c, id);
      if (found) return found;
    }
  }
  return null;
}

function valueText(rule: FilterRule, field: FilterField | undefined): string {
  if (!field) return rule.value;
  const v = rule.value.trim();
  if (!v) return "…";
  if (field.type === "enum")
    return field.options?.find((o) => o.value === v)?.label ?? v;
  if (field.type === "boolean") return v === "true" ? "yes" : "no";
  if (field.type === "number")
    return `${field.prefix ?? ""}${v}${field.suffix ?? ""}`;
  if (field.type === "date") {
    if (rule.operator === "within") return `${v} days`;
    const ms = dateMs(v);
    return ms === null ? v : shortDate(ms);
  }
  return `“${v}”`;
}

function spokenRule(rule: FilterRule, field: FilterField | undefined): string {
  const v = rule.value.trim();
  return `${field?.label ?? rule.field} ${OP_LABEL[rule.operator]} ${v ? valueText(rule, field) : "no value yet"}`;
}

function chipText(node: FilterNode, fields: Map<string, FilterField>): string {
  if (node.kind === "rule") {
    const field = fields.get(node.field);
    return `${field?.label ?? node.field} ${OP_SHORT[node.operator]} ${valueText(node, field)}`;
  }
  const first = node.children[0];
  if (!first) return "(empty group)";
  const rest = node.children.length - 1;
  const lead = first.kind === "rule" ? chipText(first, fields) : "(group)";
  return rest ? `(${lead} ${node.combinator} ${rest} more)` : `(${lead})`;
}
