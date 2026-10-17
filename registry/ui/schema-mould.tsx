"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Braces,
  Check,
  ChevronRight,
  Copy,
  CornerDownRight,
  LoaderCircle,
  Pencil,
  Play,
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

export type SchemaMouldStyle = "inset" | "outline" | "cast";
export type SchemaMouldDensity = "compact" | "cozy" | "roomy";
export type SchemaMouldAccentName = "cobalt" | "plum" | "mint" | "ink";
export type SchemaMouldStatus =
  "pending" | "rejected" | "running" | "completed" | "error";
export type SchemaFieldType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "enum"
  | "date"
  | "object"
  | "array";

/** One field the tool expects. */
export type SchemaField = {
  name: string;
  type: SchemaFieldType;
  required?: boolean;
  description?: string;
  /** The allowed values of an enum. */
  options?: string[];
  /** A string's format: an email must hold an @. */
  format?: "email";
  /** An object's own fields. */
  fields?: SchemaField[];
  /** What every item of an array must be (its name is ignored). */
  items?: SchemaField;
};

export type SchemaMouldProps = {
  /** The tool being called, in mono. @default "create_invoice" */
  tool?: string;
  /** Who serves the tool. @default "Coldbrook Billing" */
  server?: string;
  /** The fields the tool expects. @default defaultMouldSchema */
  schema?: SchemaField[];
  /** Controlled arguments the agent sent. */
  args?: Record<string, unknown>;
  /** Initial arguments when uncontrolled. @default defaultMouldArgs */
  defaultArgs?: Record<string, unknown>;
  /** A path's reason it does not fit, or null when it fits: overrides the built-in type check for that path. */
  validation?: Record<string, string | null>;
  /** The call's state. @default "rejected" while anything is outside the mould, else "pending" */
  status?: SchemaMouldStatus;
  /** The tool's reply once the call completed (or the error it gave). */
  result?: string;
  /** A rejected value was fixed in its editor, with its path and the parsed value. */
  onFixArgument?: (path: string, value: unknown) => void;
  /** Run was pressed with every argument in the mould. */
  onRun?: (args: Record<string, unknown>) => void;
  /** Copy was pressed; the arguments as JSON (also written to the clipboard when it allows). */
  onCopy?: (json: string) => void;
  /** When the pieces pour into the mould: on first sight, or as soon as it mounts. @default "inView" */
  trigger?: "inView" | "mount";
  /** How the mould is drawn: debossed cavities, dashed blueprint outlines, or a tinted cast. @default "inset" */
  mouldStyle?: SchemaMouldStyle;
  /** Row height and piece size. @default "cozy" */
  density?: SchemaMouldDensity;
  /** Fitted keys, Run and focus: a named pigment or any CSS colour. @default "cobalt" */
  accent?: SchemaMouldAccentName | (string & {});
  /** How a value is written on its piece. @default JSON, strings in quotes */
  formatValue?: (value: unknown, field: SchemaField) => string;
  /** Read only: nothing can be fixed or run. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

/** Coldbrook Billing's create_invoice tool. */
export const defaultMouldSchema: SchemaField[] = [
  {
    name: "customer",
    type: "object",
    required: true,
    fields: [
      { name: "id", type: "string", required: true },
      { name: "email", type: "string", format: "email" },
    ],
  },
  {
    name: "currency",
    type: "enum",
    required: true,
    options: ["USD", "EUR", "GBP"],
  },
  { name: "amount_due", type: "number", required: true },
  { name: "due_date", type: "date", required: true },
  {
    name: "line_items",
    type: "array",
    required: true,
    items: {
      name: "item",
      type: "object",
      fields: [
        { name: "description", type: "string", required: true },
        { name: "quantity", type: "integer", required: true },
        { name: "unit_price", type: "number", required: true },
      ],
    },
  },
  { name: "send_email", type: "boolean" },
  { name: "po_number", type: "string", required: true },
  { name: "memo", type: "string" },
];

/**
 * What the agent sent for Basinworks' October invoice: the amount as text,
 * one quantity spelled out, and no purchase order number.
 */
export const defaultMouldArgs: Record<string, unknown> = {
  customer: { id: "cus_8841", email: "accounts@basinworks.example" },
  currency: "USD",
  amount_due: "1,240.00",
  due_date: "2026-11-14",
  line_items: [
    { description: "Cold storage, October", quantity: 3, unit_price: 380 },
    { description: "Courier pickups", quantity: "two", unit_price: 50 },
  ],
  send_email: true,
};

/* ----------------------------------------------------------------------- */
/*                                Validation                                */
/* ----------------------------------------------------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** What a value actually is, in the words a reason uses. */
const kindOf = (v: unknown): string => {
  if (typeof v === "string") return "text";
  if (typeof v === "number")
    return Number.isInteger(v) ? "a whole number" : "a number";
  if (typeof v === "boolean") return "true or false";
  if (Array.isArray(v)) return "a list";
  if (v === null) return "null";
  return "an object";
};

const quote = (v: unknown) =>
  typeof v === "string" ? `“${v}”` : JSON.stringify(v);

const EXPECT: Record<SchemaFieldType, string> = {
  string: "text",
  number: "a number",
  integer: "a whole number",
  boolean: "true or false",
  enum: "one of the listed values",
  date: "a date like 2026-11-14",
  object: "an object",
  array: "a list",
};

/** The reason a value does not fit its field, or null when it fits. */
function misfit(field: SchemaField, v: unknown): string | null {
  const got = `got ${kindOf(v)} ${quote(v)}`;
  switch (field.type) {
    case "string":
      if (typeof v !== "string") return `Expected text, ${got}.`;
      if (field.format === "email" && !/^[^@\s]+@[^@\s]+$/.test(v))
        return "Expected an email address.";
      return null;
    case "number":
      return typeof v === "number" && Number.isFinite(v)
        ? null
        : `Expected a number, ${got}.`;
    case "integer":
      return typeof v === "number" && Number.isInteger(v)
        ? null
        : `Expected a whole number, ${got}.`;
    case "boolean":
      return typeof v === "boolean" ? null : `Expected true or false, ${got}.`;
    case "enum":
      return typeof v === "string" && (field.options ?? []).includes(v)
        ? null
        : `Not one of ${(field.options ?? []).join(", ")}.`;
    case "date":
      return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
        ? null
        : `Expected ${EXPECT.date}, ${got}.`;
    case "object":
      return isObject(v) ? null : `Expected an object, ${got}.`;
    case "array":
      return Array.isArray(v) ? null : `Expected a list, ${got}.`;
    default:
      return null;
  }
}

/** The editor's text read as the field's type; a string says why not. */
function parseAs(
  field: SchemaField,
  text: string,
): { value: unknown } | string {
  const t = text.trim();
  switch (field.type) {
    case "number": {
      const n = Number(t.replace(/,/g, ""));
      return t !== "" && Number.isFinite(n) ? { value: n } : "Enter a number.";
    }
    case "integer": {
      const n = Number(t.replace(/,/g, ""));
      return t !== "" && Number.isInteger(n)
        ? { value: n }
        : "Enter a whole number.";
    }
    case "boolean":
      if (/^(true|yes|on)$/i.test(t)) return { value: true };
      if (/^(false|no|off)$/i.test(t)) return { value: false };
      return "Enter true or false.";
    case "enum": {
      const hit = (field.options ?? []).find(
        (o) => o.toLowerCase() === t.toLowerCase(),
      );
      return hit
        ? { value: hit }
        : `Enter one of ${(field.options ?? []).join(", ")}.`;
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(t)
        ? { value: t }
        : "Enter a date like 2026-11-14.";
    case "string":
      if (field.required && t === "") return "Enter a value.";
      if (field.format === "email" && !/^[^@\s]+@[^@\s]+$/.test(t))
        return "Enter an email address.";
      return { value: t };
    default:
      return "This field is edited as a whole.";
  }
}

/** A copy of `root` with `path` ("a.b[1].c") set to `value`. */
function setPath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const keys = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  const write = (node: unknown, i: number): unknown => {
    const key = keys[i];
    if (key === undefined) return value;
    if (Array.isArray(node)) {
      const copy = [...node];
      copy[Number(key)] = write(copy[Number(key)], i + 1);
      return copy;
    }
    const base = isObject(node) ? node : {};
    return { ...base, [key]: write(base[key], i + 1) };
  };
  return write(root, 0) as Record<string, unknown>;
}

type Fit = "fit" | "misfit" | "missing" | "empty";

type Row = {
  path: string;
  label: string;
  depth: number;
  field: SchemaField;
  /** The group rows this row sits inside, outermost first. */
  groups: string[];
  group: boolean;
  value: unknown;
  fit: Fit;
  reason: string | null;
};

function flatten(
  fields: SchemaField[],
  args: Record<string, unknown>,
  validation: Record<string, string | null> | undefined,
): Row[] {
  const out: Row[] = [];
  const visit = (
    field: SchemaField,
    value: unknown,
    present: boolean,
    path: string,
    label: string,
    depth: number,
    groups: string[],
  ) => {
    const override = validation?.[path];
    const base = present ? misfit(field, value) : null;
    const reason =
      override !== undefined
        ? override
        : !present
          ? field.required
            ? "Required, not sent."
            : null
          : base;
    const fit: Fit = !present
      ? field.required
        ? "missing"
        : "empty"
      : reason
        ? "misfit"
        : "fit";
    const nested =
      present &&
      fit === "fit" &&
      ((field.type === "object" && (field.fields?.length ?? 0) > 0) ||
        (field.type === "array" && !!field.items));
    out.push({
      path,
      label,
      depth,
      field,
      groups,
      group: nested,
      value,
      fit,
      reason,
    });
    if (!nested) return;
    const inner = [...groups, path];
    if (field.type === "object" && isObject(value)) {
      for (const child of field.fields ?? []) {
        visit(
          child,
          value[child.name],
          child.name in value && value[child.name] !== undefined,
          `${path}.${child.name}`,
          child.name,
          depth + 1,
          inner,
        );
      }
    }
    if (field.type === "array" && Array.isArray(value) && field.items) {
      value.forEach((item, i) =>
        visit(
          { ...field.items!, name: `[${i}]`, required: true },
          item,
          true,
          `${path}[${i}]`,
          `[${i}]`,
          depth + 1,
          inner,
        ),
      );
    }
  };
  for (const field of fields) {
    visit(
      field,
      args[field.name],
      field.name in args && args[field.name] !== undefined,
      field.name,
      field.name,
      0,
      [],
    );
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                                  Look                                    */
/* ----------------------------------------------------------------------- */

/** Every type has a key: the notch cut in its cavity and the tab on its piece. */
type Key = "circle" | "square" | "half" | "triangle" | "diamond" | "bar";

const KEY_OF: Record<SchemaFieldType, Key> = {
  string: "circle",
  number: "square",
  integer: "square",
  boolean: "half",
  enum: "triangle",
  date: "diamond",
  object: "bar",
  array: "bar",
};

const keyOfValue = (v: unknown): Key => {
  if (typeof v === "string")
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? "diamond" : "circle";
  if (typeof v === "number") return "square";
  if (typeof v === "boolean") return "half";
  return "bar";
};

/** Text is round, numbers square, the rest in between. */
const RADIUS: Record<Key, string> = {
  circle: "rounded-full",
  square: "rounded-[3px]",
  half: "rounded-full",
  triangle: "rounded-[7px]",
  diamond: "rounded-[7px]",
  bar: "rounded-2",
};

function KeyGlyph({ shape, className }: { shape: Key; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 10 10"
      className={cn("size-2.5 shrink-0", className)}
    >
      {shape === "circle" ? (
        <circle cx={5} cy={5} r={4} />
      ) : shape === "square" ? (
        <rect x={1} y={1} width={8} height={8} rx={1} />
      ) : shape === "half" ? (
        <path d="M 1 9 A 4 4 0 0 1 9 9 Z" transform="translate(0 -2)" />
      ) : shape === "triangle" ? (
        <path d="M 1 9 L 5 1 L 9 9 Z" />
      ) : shape === "diamond" ? (
        <path d="M 5 0.5 L 9.5 5 L 5 9.5 L 0.5 5 Z" />
      ) : (
        <rect x={0.5} y={3} width={9} height={4} rx={1} />
      )}
    </svg>
  );
}

const DENSITY: Record<
  SchemaMouldDensity,
  { row: string; cavity: string; piece: string; text: string }
> = {
  compact: {
    row: "py-1",
    cavity: "h-7",
    piece: "h-[22px] px-2",
    text: "text-[11px]",
  },
  cozy: {
    row: "py-1.5",
    cavity: "h-8",
    piece: "h-[26px] px-2.5",
    text: "text-[12px]",
  },
  roomy: {
    row: "py-2.5",
    cavity: "h-10",
    piece: "h-[32px] px-3",
    text: "text-[12px]",
  },
};

const ACCENTS: Record<SchemaMouldAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--sm-ink": ACCENTS[accent as SchemaMouldAccentName] ?? accent,
    "--sm-wash": "color-mix(in oklab, var(--sm-ink) 11%, transparent)",
    "--sm-soft": "color-mix(in oklab, var(--sm-ink) 32%, transparent)",
    "--sm-shade": "color-mix(in oklab, var(--foreground) 14%, transparent)",
  }) as React.CSSProperties;

const TRAY: Record<SchemaMouldStyle, string> = {
  inset:
    "bg-surface-2 shadow-[inset_0_1px_3px_var(--sm-shade)] border border-hairline",
  outline: "border border-dashed border-hairline-strong",
  cast: "bg-[var(--sm-wash)] border border-[var(--sm-soft)]",
};

const CAVITY: Record<SchemaMouldStyle, string> = {
  inset:
    "bg-background shadow-[inset_0_1px_2px_var(--sm-shade),inset_0_0_0_1px_var(--hairline-strong)]",
  outline: "border border-dashed border-ink-3/60",
  cast: "bg-[color-mix(in_oklab,var(--sm-ink)_16%,var(--background))] shadow-[inset_0_1px_2px_var(--sm-shade)]",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Pieces sit in their cavity, or outside it: one grid cell or the next. */
const PLACE =
  "[grid-row:var(--sm-r)] [grid-column:1] @min-[30rem]:[grid-row:1] @min-[30rem]:[grid-column:var(--sm-c)]";

const defaultFormat = (v: unknown) =>
  typeof v === "string" ? `"${v}"` : (JSON.stringify(v) ?? String(v));

const EJECT_MS = 240;

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A tool call checked against its schema. The schema is drawn as a mould —
 * a tray with one cavity per field, each cavity keyed by its type (text
 * round with a circle notch, numbers square with a square notch, enums with
 * a triangle, dates with a diamond) — and the agent's arguments are pieces
 * keyed by the type of the value they actually hold.
 *
 * When the mould comes into view the pieces pour in, a `cascade()` apart:
 * each falls from 16 px on `snap` and the cavity rim brightens on `flick`
 * as it lands. A piece of the wrong type drops toward its cavity, hits the
 * rim and is thrown out beside the mould on `recoil` — two visible bounces —
 * where it stays with a short reason; a missing required field leaves its
 * cavity hollow and a ghost tag outside. Enter on a rejected field opens an
 * editor; a fixed value drops back in on `snap`.
 *
 * Every field is a tab stop. Below a 30rem container the rows stack and
 * nested objects fold into rows you open. Under reduced motion every piece
 * appears where it ends up, in or out, with a fade.
 */
export function SchemaMould({
  tool = "create_invoice",
  server = "Coldbrook Billing",
  schema = defaultMouldSchema,
  args,
  defaultArgs = defaultMouldArgs,
  validation,
  status,
  result,
  onFixArgument,
  onRun,
  onCopy,
  trigger = "inView",
  mouldStyle = "inset",
  density = "cozy",
  accent = "cobalt",
  formatValue,
  disabled = false,
  className,
}: SchemaMouldProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [ownArgs, setOwnArgs] = React.useState(defaultArgs);
  const current = args ?? ownArgs;
  const rows = React.useMemo(
    () => flatten(schema, current, validation),
    [schema, current, validation],
  );
  const leaves = rows.filter((r) => !r.group);
  const outside = leaves.filter(
    (r) => r.fit === "misfit" || r.fit === "missing",
  );
  const sent = leaves.filter((r) => r.fit !== "empty");
  const fitting = sent.length - outside.length;
  const state: SchemaMouldStatus =
    status ?? (outside.length > 0 ? "rejected" : "pending");
  const busy = state === "running";

  const [started, setStarted] = React.useState(false);
  const [poured, setPoured] = React.useState(false);
  const [ejected, setEjected] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [openGroups, setOpenGroups] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [root, setRoot] = React.useState<HTMLElement | null>(null);
  /** When the pour began, so a rescheduled throw keeps its place in it. */
  const pourStart = React.useRef<number | null>(null);

  // The pour waits for the mould to be seen, then the observer goes.
  React.useEffect(() => {
    if (!root) return;
    const begin = () => {
      pourStart.current ??= performance.now();
      setStarted(true);
    };
    if (trigger === "mount" || typeof IntersectionObserver === "undefined") {
      const t = window.setTimeout(begin, 0);
      return () => window.clearTimeout(t);
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          begin();
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(root);
    return () => io.disconnect();
  }, [root, trigger]);

  const step = cascade(leaves.length);
  const pourIndex = new Map(leaves.map((r, i) => [r.path, i]));

  // Once the first pour has landed, later pieces drop without the cascade.
  React.useEffect(() => {
    if (!started || poured) return;
    const t = window.setTimeout(
      () => setPoured(true),
      Math.round((leaves.length * step + 0.5) * 1000),
    );
    return () => window.clearTimeout(t);
  }, [started, poured, leaves.length, step]);

  // A misfit lands, then is thrown out: each value is thrown out once.
  const valueKey = (r: Row) => JSON.stringify(r.value) ?? "undefined";
  const pending = leaves.filter(
    (r) => r.fit === "misfit" && ejected[r.path] !== valueKey(r),
  );
  const pendingSig = pending.map((r) => `${r.path}=${valueKey(r)}`).join("|");
  React.useEffect(() => {
    if (!started || !pendingSig) return;
    const timers = pendingSig.split("|").map((entry) => {
      const cut = entry.indexOf("=");
      const path = entry.slice(0, cut);
      const key = entry.slice(cut + 1);
      // During the first pour each throw keeps its slot in the cascade,
      // even when another throw re-runs this effect.
      const due =
        poured || pourStart.current === null
          ? EJECT_MS
          : pourStart.current +
            (pourIndex.get(path) ?? 0) * step * 1000 +
            EJECT_MS -
            performance.now();
      return window.setTimeout(
        () => setEjected((e) => ({ ...e, [path]: key })),
        Math.max(0, Math.round(due)),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pourIndex and step follow pendingSig and poured.
  }, [started, pendingSig, poured]);

  React.useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  /* ---------------------------- interactions ---------------------------- */

  const startEdit = (r: Row) => {
    if (disabled || busy || (r.fit !== "misfit" && r.fit !== "missing")) return;
    if (r.field.type === "object" || r.field.type === "array") return;
    setEditing(r.path);
    setDraft(
      r.fit === "missing"
        ? ""
        : typeof r.value === "string"
          ? r.value
          : (JSON.stringify(r.value) ?? ""),
    );
    setError(null);
  };

  const focusRow = (path: string) => {
    root
      ?.querySelector<HTMLElement>(`[data-sm-row="${CSS.escape(path)}"]`)
      ?.focus();
  };

  const save = (r: Row) => {
    const parsed = parseAs(r.field, draft);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    const next = setPath(current, r.path, parsed.value);
    if (args === undefined) setOwnArgs(next);
    onFixArgument?.(r.path, parsed.value);
    setEditing(null);
    setError(null);
    const left = flatten(schema, next, validation).filter(
      (x) => !x.group && (x.fit === "misfit" || x.fit === "missing"),
    ).length;
    setAnnouncement(
      `${r.path} fixed. ${left === 0 ? "Every argument fits." : `${left} still outside the mould.`}`,
    );
    window.setTimeout(() => focusRow(r.path), 0);
  };

  const cancel = (path: string) => {
    setEditing(null);
    setError(null);
    window.setTimeout(() => focusRow(path), 0);
  };

  const copy = () => {
    const json = JSON.stringify(current, null, 2);
    try {
      void navigator.clipboard?.writeText(json).catch(() => {});
    } catch {
      // A page without clipboard access still reports the copy.
    }
    onCopy?.(json);
    setCopied(true);
    setAnnouncement("Arguments copied as JSON.");
  };

  const run = () => {
    if (disabled || busy || outside.length > 0) return;
    onRun?.(current);
  };

  const toggleGroup = (path: string) =>
    setOpenGroups((g) =>
      g.includes(path) ? g.filter((p) => p !== path) : [...g, path],
    );

  /* -------------------------------- parts ------------------------------- */

  const fmt = (r: Row) =>
    formatValue ? formatValue(r.value, r.field) : defaultFormat(r.value);
  const typeLabel = (f: SchemaField) =>
    f.type === "enum"
      ? `enum · ${(f.options ?? []).join(" | ")}`
      : f.type === "array" && f.items
        ? `list of ${f.items.type}`
        : f.format
          ? `${f.type} · ${f.format}`
          : f.type;

  const groupSummary = (path: string) => {
    const inside = leaves.filter((r) => r.groups.includes(path));
    const out = inside.filter(
      (r) => r.fit === "misfit" || r.fit === "missing",
    ).length;
    return { count: inside.length, out };
  };

  const rowNodes = rows.map((r) => {
    // A row inside a closed group hides on a phone; from 30rem every row shows.
    const folded = r.groups.some((g) => !openGroups.includes(g));
    const indent = { paddingLeft: r.depth * 14 } as React.CSSProperties;

    if (r.group) {
      const { count, out } = groupSummary(r.path);
      const isOpen = openGroups.includes(r.path);
      const summary = `${plural(count, "field")}${out ? ` · ${out} outside` : " · all fit"}`;
      return (
        <div
          key={r.path}
          className={cn(
            folded ? "hidden @min-[30rem]:block" : "block",
            "relative px-3",
            d.row,
          )}
        >
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => toggleGroup(r.path)}
            className={cn(
              "flex w-full items-center gap-2 rounded-2 py-1 text-left @min-[30rem]:hidden",
              FOCUS,
            )}
            style={indent}
          >
            <motion.span
              aria-hidden
              className="inline-flex"
              initial={false}
              animate={{ rotate: isOpen ? 90 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronRight className="size-3.5 text-ink-3" />
            </motion.span>
            <span className="font-mono text-[12px] text-foreground">
              {r.label}
            </span>
            <span className="truncate text-[11px] text-ink-3">
              {typeLabel(r.field)}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-[10px]",
                out ? "text-danger" : "text-ink-3",
              )}
            >
              {summary}
            </span>
          </button>
          <div
            className="hidden items-center gap-2 py-0.5 @min-[30rem]:flex"
            style={indent}
          >
            <KeyGlyph shape="bar" className="fill-ink-3" />
            <span className="font-mono text-[12px] text-foreground">
              {r.label}
            </span>
            <span className="truncate text-[11px] text-ink-3">
              {typeLabel(r.field)}
            </span>
            <span
              className={cn(
                "ml-auto shrink-0 pr-1 font-mono text-[10px]",
                out ? "text-danger" : "text-ink-3",
              )}
            >
              {summary}
            </span>
          </div>
        </div>
      );
    }

    const shape = KEY_OF[r.field.type];
    // A piece that fits wears its cavity's key; a misfit wears the key of
    // what it actually is, so the mismatch shows.
    const pieceShape = r.fit === "fit" ? shape : keyOfValue(r.value);
    const fitsHere = r.fit === "fit";
    const vk = valueKey(r);
    const thrown =
      r.fit === "misfit" && (!motionSafe || ejected[r.path] === vk);
    const out = r.fit === "misfit" || r.fit === "missing";
    const show = started || !motionSafe;
    const delay =
      poured || !motionSafe ? 0 : (pourIndex.get(r.path) ?? 0) * step;
    const isEditing = editing === r.path;
    const reasonId = `${uid}-why-${r.path}`;
    const stateText =
      r.fit === "fit"
        ? `fits: ${fmt(r)}`
        : r.fit === "empty"
          ? "optional, not sent"
          : r.fit === "missing"
            ? "missing, required. Press Enter to add it"
            : `outside the mould: ${r.reason ?? ""} Press Enter to fix it`;
    const name = `${r.path}, ${typeLabel(r.field)}${r.field.required ? ", required" : ""}: ${stateText}`;

    return (
      <div
        key={r.path}
        data-sm-row={r.path}
        role="group"
        aria-label={name}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" && out && !isEditing) {
            e.preventDefault();
            startEdit(r);
          }
        }}
        className={cn(
          folded ? "hidden @min-[30rem]:grid" : "grid",
          "relative grid-cols-1 items-center gap-x-3 gap-y-1.5 rounded-2 px-3 @min-[30rem]:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1fr)]",
          d.row,
          FOCUS_IN,
        )}
      >
        {/* Label: the name over its type, so neither is cut short. */}
        <div
          className="[grid-column:1] [grid-row:1] flex min-w-0 items-start gap-1.5"
          style={indent}
        >
          {r.depth > 0 ? (
            <CornerDownRight
              aria-hidden
              className="mt-0.5 size-3 shrink-0 text-ink-3"
            />
          ) : null}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="truncate font-mono text-[12px] leading-4 text-foreground"
                title={r.path}
              >
                {r.label}
              </span>
              {r.field.required ? (
                <span
                  aria-hidden
                  title="required"
                  className="size-1 shrink-0 rounded-full bg-[var(--sm-ink)]"
                />
              ) : null}
            </span>
            <span
              className="truncate text-[11px] leading-4 text-ink-3"
              title={typeLabel(r.field)}
            >
              {typeLabel(r.field)}
            </span>
          </span>
        </div>

        {/* Cavity */}
        <div
          aria-hidden
          className={cn(
            "relative [grid-column:1] [grid-row:2] flex items-center pl-2 @min-[30rem]:[grid-column:2] @min-[30rem]:[grid-row:1]",
            d.cavity,
            RADIUS[shape],
            CAVITY[mouldStyle],
            r.fit === "missing" && "border border-dashed border-danger/50",
          )}
        >
          {/* The rim brightens as its piece lands. */}
          <motion.span
            className={cn(
              "pointer-events-none absolute inset-0 border-[1.5px] border-[var(--sm-soft)]",
              RADIUS[shape],
            )}
            initial={false}
            animate={{ opacity: fitsHere && show ? 1 : 0 }}
            transition={{
              duration: fitsHere ? durations.fast : durations.blink,
              ease: easings.enter,
              delay: fitsHere ? delay + 0.14 : 0,
            }}
          />
          <KeyGlyph
            shape={shape}
            className={cn(
              "fill-none stroke-ink-3 [stroke-width:1.2]",
              r.fit === "missing" && "stroke-danger",
            )}
          />
          {r.fit === "empty" ? (
            <span className="ml-2 truncate text-[11px] text-ink-3 italic">
              optional · not sent
            </span>
          ) : null}
        </div>

        {/* Piece */}
        {r.fit !== "missing" && r.fit !== "empty" && show ? (
          <motion.span
            key={vk}
            aria-hidden
            layout={motionSafe ? "position" : false}
            initial={
              motionSafe ? { opacity: 0, y: -distances.shift } : { opacity: 0 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={{
              y: motionSafe ? { ...springs.snap, delay } : { duration: 0 },
              opacity: { duration: durations.fast, delay },
              layout: springs.recoil,
            }}
            className={cn(
              PLACE,
              "relative z-[1] ml-[3px] flex max-w-[calc(100%-6px)] items-center gap-1.5 justify-self-start border bg-card font-mono shadow-sm",
              d.piece,
              d.text,
              RADIUS[pieceShape],
              out
                ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] text-foreground"
                : "border-hairline-strong text-foreground",
            )}
            style={
              {
                "--sm-r": thrown ? 3 : 2,
                "--sm-c": thrown ? 3 : 2,
              } as React.CSSProperties
            }
          >
            <KeyGlyph
              shape={pieceShape}
              className={out ? "fill-danger" : "fill-[var(--sm-ink)]"}
            />
            <span className="truncate">{fmt(r)}</span>
          </motion.span>
        ) : null}

        {/* Outside the mould: the reason, the ghost of a missing value, or the editor. */}
        {out && (thrown || r.fit === "missing") && show ? (
          <motion.div
            className={cn(
              "[grid-column:1] [grid-row:4] flex min-w-0 flex-col gap-1 @min-[30rem]:[grid-column:3] @min-[30rem]:[grid-row:2]",
            )}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: durations.base,
              ease: easings.enter,
              delay: r.fit === "missing" ? delay + 0.1 : 0.18,
            }}
          >
            {isEditing ? (
              <form
                className="flex flex-col gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(r);
                }}
              >
                <div className="flex items-center gap-1.5">
                  <input
                    ref={(node) => node?.focus({ preventScroll: true })}
                    aria-label={`New value for ${r.path}`}
                    aria-invalid={!!error || undefined}
                    aria-describedby={error ? `${reasonId}-err` : undefined}
                    value={draft}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setDraft(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        e.stopPropagation();
                        cancel(r.path);
                      }
                    }}
                    className={cn(
                      "h-8 min-w-0 flex-1 rounded-2 border bg-background px-2 font-mono text-[12px] text-foreground",
                      error ? "border-danger/60" : "border-input",
                      FOCUS,
                    )}
                  />
                  <button
                    type="submit"
                    className={cn(
                      "inline-flex h-8 shrink-0 items-center rounded-2 bg-[var(--sm-ink)] px-2.5 text-[12px] font-medium text-background",
                      FOCUS,
                    )}
                  >
                    Save
                  </button>
                </div>
                {error ? (
                  <p
                    id={`${reasonId}-err`}
                    className="text-[11px] leading-4 text-danger"
                  >
                    {error}
                  </p>
                ) : (
                  <p className="text-[11px] leading-4 text-ink-3">
                    Enter saves, Escape cancels.
                  </p>
                )}
              </form>
            ) : (
              <p
                id={reasonId}
                className="flex items-start gap-1.5 text-[11px] leading-4 text-danger"
              >
                <span className="min-w-0">{r.reason}</span>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={() => startEdit(r)}
                  className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-1 text-ink-3 hover:text-foreground"
                >
                  <Pencil className="size-3" />
                  <span className="text-[11px]">Fix</span>
                </button>
              </p>
            )}
          </motion.div>
        ) : null}
        {r.fit === "missing" && show && !isEditing ? (
          <motion.span
            aria-hidden
            className="pointer-events-none [grid-column:1] [grid-row:3] flex items-center gap-1.5 justify-self-start rounded-full border border-dashed border-danger/50 px-2 py-0.5 font-mono text-[11px] text-danger @min-[30rem]:[grid-column:3] @min-[30rem]:[grid-row:1]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.base, delay: delay + 0.1 }}
          >
            <KeyGlyph
              shape={shape}
              className="fill-none stroke-danger [stroke-width:1.2]"
            />
            missing
          </motion.span>
        ) : null}
      </div>
    );
  });

  const STATUS_CHIP: Record<
    SchemaMouldStatus,
    { label: string; className: string }
  > = {
    pending: {
      label: "Ready",
      className: "border-[var(--sm-soft)] text-[var(--sm-ink)]",
    },
    rejected: {
      label: "Rejected",
      className:
        "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] text-danger",
    },
    running: {
      label: "Running",
      className: "border-[var(--sm-soft)] text-[var(--sm-ink)]",
    },
    completed: {
      label: "Completed",
      className:
        "border-[color-mix(in_oklab,var(--success)_40%,transparent)] text-success",
    },
    error: {
      label: "Failed",
      className:
        "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] text-danger",
    },
  };
  const chip = STATUS_CHIP[state];
  const blocked = outside.length > 0;

  return (
    <section
      ref={setRoot}
      aria-labelledby={titleId}
      className={cn(
        "@container flex max-h-[36rem] w-full flex-col overflow-hidden rounded-4 border border-hairline bg-background text-foreground",
        className,
      )}
      style={accentVars(accent)}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-3">
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
          <span
            aria-hidden
            className="hidden size-8 shrink-0 items-center justify-center rounded-2 bg-[var(--sm-wash)] text-[var(--sm-ink)] @min-[20rem]:flex"
          >
            <Braces className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                id={titleId}
                className="truncate font-mono text-[14px] leading-5 font-semibold"
              >
                {tool}
              </h2>
              <span
                className={cn(
                  "inline-flex h-5 shrink-0 items-center rounded-full border px-1.5 font-mono text-[9px] font-normal tracking-[0.08em] uppercase",
                  chip.className,
                )}
              >
                {chip.label}
              </span>
            </div>
            <p className="truncate text-[12px] leading-4 text-ink-3">
              {`${server} · tool call`}
            </p>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={copy}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            {copied ? (
              <Check aria-hidden className="size-3.5 text-success" />
            ) : (
              <Copy aria-hidden className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            onClick={run}
            aria-disabled={disabled || busy || blocked || undefined}
            aria-describedby={blocked ? `${uid}-blocked` : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors",
              blocked || disabled
                ? "cursor-not-allowed border border-hairline text-ink-3"
                : "bg-[var(--sm-ink)] text-background hover:opacity-90",
              FOCUS,
            )}
          >
            {busy ? (
              <LoaderCircle aria-hidden className="size-3.5" />
            ) : (
              <Play aria-hidden className="size-3.5" />
            )}
            {busy ? "Running" : "Run"}
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-y border-hairline px-4 py-2 text-[12px]">
        {blocked ? (
          <TriangleAlert
            aria-hidden
            className="size-3.5 shrink-0 text-danger"
          />
        ) : (
          <Check aria-hidden className="size-3.5 shrink-0 text-success" />
        )}
        <span id={`${uid}-blocked`} className="min-w-0 truncate text-ink-2">
          {blocked
            ? `${fitting} of ${sent.length} fit · ${plural(outside.length, "argument")} outside the mould`
            : `All ${plural(sent.length, "argument")} fit · ready to run`}
        </span>
      </div>

      <div className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 py-3 @min-[30rem]:px-3">
        <div className="relative flex flex-col gap-1 @min-[30rem]:gap-0">
          {/* The tray: the label and cavity columns, so "outside" is outside it. */}
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 hidden w-[calc(9.5rem+1.5rem+(100%-9.5rem-3rem)/2+0.375rem)] rounded-3 @min-[30rem]:block",
              TRAY[mouldStyle],
            )}
          />
          {rowNodes}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(state === "completed" || state === "error") && result ? (
          <motion.div
            key={state}
            initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              y: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base },
            }}
            className={cn(
              "flex shrink-0 items-start gap-2 border-t px-4 py-3 text-[12px] leading-4",
              state === "completed"
                ? "border-[color-mix(in_oklab,var(--success)_30%,transparent)] bg-[color-mix(in_oklab,var(--success)_7%,transparent)]"
                : "border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,transparent)]",
            )}
          >
            {state === "completed" ? (
              <Check
                aria-hidden
                className="mt-px size-3.5 shrink-0 text-success"
              />
            ) : (
              <TriangleAlert
                aria-hidden
                className="mt-px size-3.5 shrink-0 text-danger"
              />
            )}
            <span className="min-w-0 font-mono text-foreground">{result}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

function plural(n: number, one: string, other = `${one}s`) {
  return `${n} ${n === 1 ? one : other}`;
}
