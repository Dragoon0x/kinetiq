"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  CircleCheck,
  FileText,
  Pencil,
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
import { cn } from "@/registry/lib/utils";

export type CheckInputKind =
  "text" | "textarea" | "email" | "number" | "date" | "select" | "radio";

export type CheckOption = { id: string; label: string };

/** One question and the input it was answered with. */
export type CheckRow = {
  id: string;
  /** The question, e.g. "Start date". */
  label: string;
  kind: CheckInputKind;
  /** An empty answer is flagged as missing. @default true */
  required?: boolean;
  /** Shown under the input while it is open. */
  hint?: string;
  /** The choices of a select or radio; the answer holds an option id. */
  options?: CheckOption[];
  /** Bounds for a number. */
  min?: number;
  max?: number;
  /** Printed after a number, e.g. "days". */
  unit?: string;
  placeholder?: string;
};

export type CheckSection = { id: string; title: string; rows: CheckRow[] };

/** Row id to its answer; a select or radio holds the option id. */
export type CheckValue = Record<string, string>;

export type CheckChange = { rowId: string; from: string; to: string };
export type CheckIssueKind = "missing" | "invalid";
export type CheckIssue = {
  rowId: string;
  kind: CheckIssueKind;
  message: string;
};
export type CheckLayout = "table" | "cards";
export type CheckDensity = "compact" | "cozy" | "roomy";
export type CheckAccent = "cobalt" | "signal" | "ink";
export type CheckStatus = "ready" | "loading" | "error";

export type CheckAnswersProps = {
  /** Rows as a two-column summary under each section, or one card per answer. @default "table" */
  layout?: CheckLayout;
  /** Row padding and type size. @default "cozy" */
  density?: CheckDensity;
  /** The colour of Change, the changed badge and the declaration switch. @default "cobalt" */
  accent?: CheckAccent;
  /** The sections and their rows, in page order. @default defaultCheckSections */
  sections?: CheckSection[];
  /** Controlled answers by row id. */
  value?: CheckValue;
  /** Initial answers when uncontrolled. @default defaultCheckAnswers */
  defaultValue?: CheckValue;
  /** Fires from Save with every answer and the one that changed. */
  onChange?: (value: CheckValue, change: CheckChange) => void;
  /** Submit was pressed with no issues left and the declaration on; the reference is the one shown. */
  onSubmit?: (value: CheckValue, reference: string) => void;
  /** The reference shown after submitting. @default derived from the answers */
  reference?: string;
  /** The sentence the declaration switch confirms. @default "The details are correct and I am authorised to apply." */
  declaration?: string;
  /** The submit button's text. @default "Submit application" */
  submitLabel?: string;
  /** Whether the answers have arrived. @default "ready" */
  status?: CheckStatus;
  /** Try again was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Check your answers" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the sections scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be changed, confirmed or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** A Fieldline street-works permit: applicant, the works, safety. */
export const defaultCheckSections: CheckSection[] = [
  {
    id: "applicant",
    title: "Applicant",
    rows: [
      {
        id: "name",
        label: "Full name",
        kind: "text",
        placeholder: "As it appears on the licence",
      },
      { id: "org", label: "Organisation", kind: "text" },
      {
        id: "email",
        label: "Email",
        kind: "email",
        hint: "Permit notices are sent here.",
      },
      { id: "phone", label: "Site phone", kind: "text" },
    ],
  },
  {
    id: "works",
    title: "The works",
    rows: [
      { id: "site", label: "Site address", kind: "textarea" },
      {
        id: "type",
        label: "Type of works",
        kind: "select",
        options: [
          { id: "excavation", label: "Excavation" },
          { id: "scaffold", label: "Scaffold" },
          { id: "skip", label: "Skip" },
          { id: "crane", label: "Crane lift" },
          { id: "plant", label: "Mobile plant" },
        ],
      },
      {
        id: "start",
        label: "Start date",
        kind: "date",
        hint: "At least five working days from today.",
        placeholder: "YYYY-MM-DD",
      },
      {
        id: "days",
        label: "Duration",
        kind: "number",
        min: 1,
        max: 30,
        unit: "days",
        hint: "Up to 30 days on one permit.",
      },
      {
        id: "traffic",
        label: "Traffic management",
        kind: "radio",
        options: [
          { id: "none", label: "None" },
          { id: "give", label: "Give and take" },
          { id: "signals", label: "Two-way signals" },
          { id: "closure", label: "Road closure" },
        ],
      },
    ],
  },
  {
    id: "safety",
    title: "Safety",
    rows: [
      {
        id: "risk",
        label: "Risk assessment attached",
        kind: "radio",
        options: [
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ],
      },
      { id: "contact", label: "Emergency contact", kind: "text" },
      {
        id: "previous",
        label: "Previous permit",
        kind: "text",
        required: false,
        hint: "If these works continue an earlier permit.",
        placeholder: "FL-0000-0000",
      },
    ],
  },
];

/** Coldbrook Civils' excavation on Harrow Lane, two answers short of ready. */
export const defaultCheckAnswers: CheckValue = {
  name: "Mara Lind",
  org: "Coldbrook Civils",
  email: "m.lind@coldbrook",
  phone: "0161 496 0118",
  site: "14 Harrow Lane\nBasinworks BW2 4QT",
  type: "excavation",
  start: "2026-10-19",
  days: "",
  traffic: "signals",
  risk: "yes",
  contact: "Tomas Reyes, 0161 496 0342",
  previous: "",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<CheckAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--ink)",
};

const DENSITY: Record<
  CheckDensity,
  { row: string; card: string; text: string; label: string }
> = {
  compact: {
    row: "py-1.5",
    card: "p-2.5",
    text: "text-[12px]",
    label: "text-[11px]",
  },
  cozy: {
    row: "py-2.5",
    card: "p-3",
    text: "text-[13px]",
    label: "text-[12px]",
  },
  roomy: {
    row: "py-3.5",
    card: "p-4",
    text: "text-[14px]",
    label: "text-[13px]",
  },
};

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
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
/** How long the struck old answer stays before it fades away, in ms. */
const STRIKE_MS = 1500;
const STRIKE_HOLD = 0.8;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parseDate = (text: string): Date | null => {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
    ? date
    : null;
};

/** The issue one answer carries, or null when it is fine. */
export const checkIssue = (
  row: CheckRow,
  raw: string | undefined,
): CheckIssue | null => {
  const v = (raw ?? "").trim();
  const invalid = (message: string): CheckIssue => ({
    rowId: row.id,
    kind: "invalid",
    message,
  });
  if (v === "") {
    return row.required === false
      ? null
      : { rowId: row.id, kind: "missing", message: "Not answered yet" };
  }
  switch (row.kind) {
    case "email":
      return EMAIL_RE.test(v)
        ? null
        : invalid("Enter an address with a domain, like name@example.org");
    case "number": {
      const n = Number(v);
      if (!Number.isFinite(n)) return invalid("Enter a number");
      if (row.min !== undefined && row.max !== undefined) {
        return n >= row.min && n <= row.max
          ? null
          : invalid(`Enter a number from ${row.min} to ${row.max}`);
      }
      if (row.min !== undefined && n < row.min)
        return invalid(`Enter ${row.min} or more`);
      if (row.max !== undefined && n > row.max)
        return invalid(`Enter ${row.max} or less`);
      return null;
    }
    case "date":
      return parseDate(v) ? null : invalid("Enter a date as YYYY-MM-DD");
    case "select":
    case "radio":
      return row.options?.some((o) => o.id === v)
        ? null
        : invalid("Choose one of the options");
    default:
      return null;
  }
};

/** Every issue on the page, in row order, for hosts that gate elsewhere. */
export const checkIssues = (
  sections: CheckSection[],
  value: CheckValue,
): CheckIssue[] =>
  sections.flatMap((s) =>
    s.rows.flatMap((row) => {
      const issue = checkIssue(row, value[row.id]);
      return issue ? [issue] : [];
    }),
  );

/** The answer as it is read back: option labels, units, long dates. */
export const displayAnswer = (row: CheckRow, raw: string | undefined) => {
  const v = (raw ?? "").trim();
  if (v === "") return "";
  if (row.kind === "select" || row.kind === "radio") {
    return row.options?.find((o) => o.id === v)?.label ?? v;
  }
  if (row.kind === "number") {
    return row.unit ? `${v} ${row.unit}` : v;
  }
  if (row.kind === "date") {
    const d = parseDate(v);
    return d
      ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()}`
      : v;
  }
  return v;
};

/** A stable reference from the answers, so the same form submits the same number. */
export const makeCheckReference = (value: CheckValue) => {
  const text = Object.keys(value)
    .sort()
    .map((k) => `${k}=${value[k] ?? ""}`)
    .join("&");
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const a = 1000 + (h % 9000);
  const b = 1000 + (Math.floor(h / 9000) % 9000);
  return `FL-${a}-${b}`;
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Editor                                  */
/* ----------------------------------------------------------------------- */

const INPUT =
  "w-full rounded-2 border border-hairline-strong bg-background px-3 text-[13px] text-foreground placeholder:text-ink-3";

type EditorProps = {
  row: CheckRow;
  draft: string;
  labelId: string;
  inputId: string;
  motionSafe: boolean;
  onDraft: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function Editor({
  row,
  draft,
  labelId,
  inputId,
  motionSafe,
  onDraft,
  onSave,
  onCancel,
}: EditorProps) {
  const hintId = `${inputId}-hint`;
  const liveIssue = checkIssue(row, draft);
  const radios = React.useRef(new Map<string, HTMLButtonElement>());
  const describedBy =
    [row.hint ? hintId : null, liveIssue ? `${inputId}-issue` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  let control: React.ReactNode;
  if (row.kind === "textarea") {
    control = (
      <textarea
        id={inputId}
        value={draft}
        rows={3}
        placeholder={row.placeholder}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        onChange={(event) => onDraft(event.currentTarget.value)}
        className={cn(INPUT, "resize-none py-2 leading-5", FOCUS_RING)}
      />
    );
  } else if (row.kind === "select") {
    const options = row.options ?? [];
    control = (
      <span className="relative block">
        <select
          id={inputId}
          value={options.some((o) => o.id === draft) ? draft : ""}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onChange={(event) => onDraft(event.currentTarget.value)}
          className={cn(
            INPUT,
            "h-9 cursor-pointer appearance-none pr-9 [&>option]:bg-popover [&>option]:text-foreground",
            FOCUS_RING,
          )}
        >
          <option value="" disabled>
            Choose one
          </option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
        />
      </span>
    );
  } else if (row.kind === "radio") {
    const options = row.options ?? [];
    const checkedIndex = options.findIndex((o) => o.id === draft);
    const move = (event: React.KeyboardEvent, i: number) => {
      const n = options.length;
      const to =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? (i + 1) % n
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? (i - 1 + n) % n
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? n - 1
                : -1;
      const next = options[to];
      if (!next) return;
      event.preventDefault();
      onDraft(next.id);
      radios.current.get(next.id)?.focus();
    };
    control = (
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        className="flex max-w-full flex-wrap gap-0.5 rounded-2 bg-surface-2 p-0.5"
      >
        {options.map((o, i) => {
          const on = o.id === draft;
          const stop = checkedIndex === -1 ? i === 0 : on;
          return (
            <button
              key={o.id}
              ref={(node) => {
                if (node) radios.current.set(o.id, node);
                else radios.current.delete(o.id);
              }}
              type="button"
              id={stop ? inputId : undefined}
              role="radio"
              aria-checked={on}
              tabIndex={stop ? 0 : -1}
              onClick={() => onDraft(o.id)}
              onKeyDown={(event) => move(event, i)}
              className={cn(
                "relative inline-flex h-7 min-w-0 items-center rounded-[5px] px-2.5 text-[12px] transition-colors",
                on ? "text-foreground" : "text-ink-3 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${inputId}-pill`}
                  aria-hidden
                  className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    );
  } else {
    control = (
      <span className="relative block">
        <input
          id={inputId}
          type={row.kind === "email" ? "email" : "text"}
          inputMode={
            row.kind === "number"
              ? "decimal"
              : row.kind === "date"
                ? "numeric"
                : row.kind === "email"
                  ? "email"
                  : undefined
          }
          value={draft}
          placeholder={row.placeholder}
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          onChange={(event) => onDraft(event.currentTarget.value)}
          className={cn(
            INPUT,
            "h-9",
            row.kind === "number" && "font-mono tabular-nums",
            row.kind === "number" && row.unit && "pr-14",
            FOCUS_RING,
          )}
        />
        {row.kind === "number" && row.unit ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            {row.unit}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div
      className="flex flex-col gap-2"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
          return;
        }
        if (event.key !== "Enter") return;
        const target = event.target as HTMLElement;
        const tag = target.tagName;
        if (tag === "TEXTAREA") {
          if (event.metaKey || event.ctrlKey) {
            event.preventDefault();
            onSave();
          }
          return;
        }
        if (tag === "INPUT" || tag === "SELECT") {
          event.preventDefault();
          onSave();
        }
      }}
    >
      {control}
      {row.hint ? (
        <p id={hintId} className="text-[11px] text-ink-3">
          {row.hint}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {liveIssue ? (
          <motion.p
            key={liveIssue.kind}
            id={`${inputId}-issue`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast, ease: easings.enter }}
            className="flex items-center gap-1 text-[11px] text-warn"
          >
            <TriangleAlert aria-hidden className="size-3 shrink-0" />
            {liveIssue.message}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onSave}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-2 bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
            FOCUS_RING,
          )}
        >
          <Check aria-hidden className="size-3.5" />
          Save
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
        <span className="ml-auto hidden font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:inline">
          {row.kind === "textarea" ? "Ctrl+Enter saves" : "Enter saves"} · Esc
          cancels
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type Struck = { old: string; seq: number };

type AnswerRowProps = {
  row: CheckRow;
  value: string;
  issue: CheckIssue | null;
  changed: boolean;
  struck: Struck | null;
  /** The value line lands on recoil: it was just saved. */
  landing: boolean;
  editing: boolean;
  draft: string;
  dim: boolean;
  layout: CheckLayout;
  density: CheckDensity;
  motionSafe: boolean;
  /** Fades and nudges in when it mounts after hydration. */
  enter: boolean;
  delay: number;
  tabIndex: number;
  inert: boolean;
  submitted: boolean;
  hintId: string;
  uid: string;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onOpen: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
  onDraft: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function AnswerRow({
  row,
  value,
  issue,
  changed,
  struck,
  landing,
  editing,
  draft,
  dim,
  layout,
  density,
  motionSafe,
  enter,
  delay,
  tabIndex,
  inert,
  submitted,
  hintId,
  uid,
  nodeRef,
  onOpen,
  onFocus,
  onNav,
  onDraft,
  onSave,
  onCancel,
}: AnswerRowProps) {
  const d = DENSITY[density];
  const labelId = `${uid}-${row.id}-label`;
  const inputId = `${uid}-${row.id}-input`;
  const shown = displayAnswer(row, value);
  const empty = shown === "";
  const cards = layout === "cards";
  // The cascade delay belongs to the entrance only; once the row has
  // arrived, dimming and undimming must not lag behind the other rows.
  const [entered, setEntered] = React.useState(!enter);

  return (
    <motion.li
      initial={
        enter ? { opacity: 0, y: motionSafe ? distances.nudge : 0 } : false
      }
      animate={{ opacity: dim ? 0.45 : 1, y: 0 }}
      transition={{
        opacity: entered
          ? { duration: durations.base, ease: easings.move }
          : { duration: durations.base, ease: easings.enter, delay },
        y: motionSafe
          ? { ...springs.glide, delay: entered ? 0 : delay }
          : { duration: 0 },
      }}
      onAnimationComplete={() => {
        if (!entered) setEntered(true);
      }}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1",
        cards
          ? cn(
              "rounded-3 border bg-surface-0",
              d.card,
              editing ? "border-hairline-strong" : "border-hairline",
            )
          : cn(
              "px-3 @min-[40rem]:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] @min-[40rem]:gap-x-4",
              d.row,
            ),
      )}
    >
      <div
        className={cn(
          "order-1 flex min-w-0 items-start gap-1.5",
          cards ? "pt-0.5" : "@min-[40rem]:pt-0.5",
        )}
      >
        <span
          id={labelId}
          className={cn(
            "min-w-0 break-words",
            cards
              ? "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              : cn(d.label, "text-ink-2"),
          )}
        >
          {row.label}
        </span>
        <AnimatePresence initial={false}>
          {issue && !editing ? (
            <motion.span
              key="flag"
              initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="inline-flex shrink-0 text-warn"
              title={issue.kind === "missing" ? "Missing" : "Invalid"}
            >
              <TriangleAlert aria-hidden className="size-3.5" />
              <span className="sr-only">
                {issue.kind === "missing" ? "Missing" : "Invalid"}
              </span>
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        className={cn(
          "relative order-3 col-span-2 min-w-0",
          !cards && "@min-[40rem]:order-2 @min-[40rem]:col-span-1",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {editing ? (
            <motion.div
              key="editor"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.enter },
              }}
              className="overflow-hidden"
            >
              <div className={cn("pt-1", !cards && "@min-[40rem]:pt-0")}>
                <Editor
                  row={row}
                  draft={draft}
                  labelId={labelId}
                  inputId={inputId}
                  motionSafe={motionSafe}
                  onDraft={onDraft}
                  onSave={onSave}
                  onCancel={onCancel}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="value"
              initial={{
                height: 0,
                opacity: 0,
                y: landing && motionSafe ? -distances.step : 0,
              }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                height: motionSafe ? springs.glide : { duration: 0 },
                y: motionSafe ? springs.recoil : { duration: 0 },
                opacity: { duration: durations.fast, ease: easings.enter },
              }}
              className="overflow-hidden"
            >
              <div className={cn("flex flex-col gap-0.5", d.text)}>
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span
                    className={cn(
                      "min-w-0 break-words whitespace-pre-line",
                      empty ? "text-ink-3 italic" : "text-foreground",
                      row.kind === "number" && !empty && "tabular-nums",
                    )}
                  >
                    {empty ? "Not answered" : shown}
                  </span>
                  {struck ? (
                    <motion.span
                      key={struck.seq}
                      aria-hidden
                      className="relative min-w-0 break-words text-ink-3"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{
                        delay: STRIKE_HOLD,
                        duration: durations.slow,
                        ease: easings.exit,
                      }}
                    >
                      {struck.old}
                      <motion.span
                        className="absolute inset-x-[-1px] top-[55%] h-px bg-current"
                        style={{ originX: 0 }}
                        initial={motionSafe ? { scaleX: 0 } : false}
                        animate={{ scaleX: 1 }}
                        transition={
                          motionSafe ? springs.flick : { duration: 0 }
                        }
                      />
                    </motion.span>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {changed ? (
                      <motion.span
                        key="changed"
                        initial={{ opacity: 0, scale: motionSafe ? 0.7 : 1 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.recoil,
                                opacity: { duration: durations.fast },
                              }
                            : { duration: durations.fast }
                        }
                        className="inline-flex h-4 shrink-0 items-center rounded-full bg-(--ca-wash) px-1.5 font-mono text-[9px] tracking-[0.08em] text-(--ca-accent) uppercase"
                      >
                        Changed
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
                <AnimatePresence initial={false}>
                  {issue ? (
                    <motion.p
                      key={issue.kind}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        duration: durations.fast,
                        ease: easings.enter,
                      }}
                      className="text-[11px] text-warn"
                    >
                      {issue.message}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div
        className={cn(
          "order-2 flex shrink-0 items-start justify-end",
          !cards && "@min-[40rem]:order-3",
        )}
      >
        <button
          ref={nodeRef}
          type="button"
          tabIndex={tabIndex}
          aria-disabled={inert || editing || undefined}
          aria-describedby={hintId}
          aria-label={`Change ${row.label}, currently ${empty ? "not answered" : shown}${issue ? `, ${issue.kind}` : ""}`}
          onFocus={onFocus}
          onClick={onOpen}
          onKeyDown={onNav}
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[12px] transition-colors",
            inert || editing
              ? "cursor-default text-ink-3"
              : "text-(--ca-accent) hover:bg-surface-2",
            submitted && "invisible",
            FOCUS_RING,
          )}
        >
          <Pencil aria-hidden className="size-3" />
          <span className={cn(editing && "sr-only")}>Change</span>
        </button>
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A multi-step form's last page: every answer read back under its section in
 * a two-column summary, each with a Change link. Pressing Change opens that
 * one row into the input it was answered with — the row grows on
 * `springs.glide` while the rest of the page dims a little — and Save writes
 * the new answer back: the old one is struck through on `springs.flick`, holds
 * a beat and fades, a Changed badge pops in on `springs.recoil`, and the value
 * line lands on the same spring. Rows that are missing or invalid carry an
 * amber flag and a message, and the count in the header rolls on
 * `springs.snap` as they are fixed. A declaration switch and a Submit button
 * sit in the footer; Submit enables only when no issues remain and the
 * declaration is on, and pressing it lands a reference number on
 * `springs.recoil`.
 *
 * The Change links are one list with a single tab stop: Up and Down move,
 * Home and End jump, Enter or Space opens the row, Enter in the input saves
 * (Ctrl+Enter in a textarea) and Escape cancels, with focus returning to the
 * link. Under reduced motion nothing travels: a row opens and closes at once,
 * the strike appears whole and fades, badges and the reference fade in, the
 * switch knob jumps, and every count and announcement still changes.
 */
export function CheckAnswers({
  layout = "table",
  density = "cozy",
  accent = "cobalt",
  sections = defaultCheckSections,
  value,
  defaultValue = defaultCheckAnswers,
  onChange,
  onSubmit,
  reference,
  declaration = "The details are correct and I am authorised to apply.",
  submitLabel = "Submit application",
  status = "ready",
  onRetry,
  title = "Check your answers",
  label,
  height = 540,
  disabled = false,
  className,
}: CheckAnswersProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const declId = `${uid}-decl`;

  const [own, setOwn] = React.useState<CheckValue>(defaultValue);
  const current = value ?? own;
  // The answers as they arrived: a row whose answer differs wears Changed.
  const [baseline] = React.useState<CheckValue>(() => value ?? defaultValue);
  const ready = status === "ready";

  const [editing, setEditing] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [struck, setStruck] = React.useState<Record<string, Struck>>({});
  const [landed, setLanded] = React.useState<string | null>(null);
  const [declared, setDeclared] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [started, setStarted] = React.useState(false);
  const [activeRow, setActiveRow] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so rows already on the page
  // never fade in; true for rows that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const changeNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const timers = React.useRef(new Map<string, number>());
  const seq = React.useRef(0);

  const inert = disabled || !ready || done !== null;

  /* -------------------------------- data ------------------------------- */

  const rows = sections.flatMap((s) => s.rows);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const issues = checkIssues(sections, current);
  const issueOf = new Map(issues.map((i) => [i.rowId, i]));
  const answered = rows.filter(
    (r) => (current[r.id] ?? "").trim() !== "",
  ).length;
  const changedCount = rows.filter(
    (r) => (current[r.id] ?? "") !== (baseline[r.id] ?? ""),
  ).length;
  const empty = rows.length === 0 || (answered === 0 && !started);
  const canSubmit = !inert && issues.length === 0 && declared;
  const order = rows.map((r) => r.id);
  const indexOf = new Map(order.map((id, i) => [id, i]));
  const activeId =
    activeRow && order.includes(activeRow) ? activeRow : (order[0] ?? null);

  /* ------------------------------- effects ----------------------------- */

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) window.clearTimeout(t);
      map.clear();
    };
  }, []);

  // The row opened: focus goes into its input once it is in the DOM.
  React.useLayoutEffect(() => {
    if (!editing) return;
    const node = editorRef.current?.querySelector<HTMLElement>(
      `[id="${uid}-${editing}-input"]`,
    );
    node?.focus({ preventScroll: true });
  }, [editing, uid]);

  // Focus returns to a Change link after its row closed.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    changeNodes.current.get(focusReq.id)?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- changes ----------------------------- */

  const requestFocus = (id: string) =>
    setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));

  const openRow = (id: string) => {
    if (inert) return;
    const row = byId.get(id);
    if (!row) return;
    setLanded(null);
    setEditing(id);
    setDraft(current[id] ?? "");
    setActiveRow(id);
    setAnnouncement(`Editing ${row.label}.`);
  };

  const cancelEdit = () => {
    const id = editing;
    setEditing(null);
    if (id) {
      requestFocus(id);
      setAnnouncement("Edit cancelled.");
    }
  };

  const saveEdit = () => {
    const id = editing;
    if (!id) return;
    const row = byId.get(id);
    setEditing(null);
    requestFocus(id);
    if (!row) return;
    const from = current[id] ?? "";
    const to = draft.trim();
    if (from === to) {
      setAnnouncement(`${row.label} unchanged.`);
      return;
    }
    const next: CheckValue = { ...current, [id]: to };
    if (value === undefined) setOwn(next);
    onChange?.(next, { rowId: id, from, to });
    const oldShown = displayAnswer(row, from);
    if (oldShown !== "") {
      seq.current += 1;
      const n = seq.current;
      setStruck((s) => ({ ...s, [id]: { old: oldShown, seq: n } }));
      const prior = timers.current.get(id);
      if (prior !== undefined) window.clearTimeout(prior);
      timers.current.set(
        id,
        window.setTimeout(() => {
          timers.current.delete(id);
          setStruck((s) => {
            if (s[id]?.seq !== n) return s;
            const rest = { ...s };
            delete rest[id];
            return rest;
          });
        }, STRIKE_MS),
      );
    }
    setLanded(id);
    const left = checkIssues(sections, next).length;
    const newShown = displayAnswer(row, to);
    setAnnouncement(
      `${row.label} changed to ${newShown === "" ? "not answered" : newShown}. ${
        left === 0
          ? "No issues left."
          : `${plural(left, "issue", "issues")} left.`
      }`,
    );
  };

  const toggleDeclared = () => {
    if (inert) return;
    const next = !declared;
    setDeclared(next);
    setAnnouncement(next ? "Declaration confirmed." : "Declaration withdrawn.");
  };

  const submit = () => {
    if (!canSubmit) return;
    if (editing) setEditing(null);
    const ref = reference ?? makeCheckReference(current);
    setDone(ref);
    onSubmit?.(current, ref);
    setAnnouncement(`Application submitted. Reference ${ref}.`);
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onNav = (event: React.KeyboardEvent, id: string) => {
    const i = order.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = order.length - 1;
    else return;
    event.preventDefault();
    const target = order[clamp(to, 0, order.length - 1)];
    if (target) changeNodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const accentColor = ACCENTS[accent] ?? ACCENTS.cobalt;
  const step = cascade(Math.min(rows.length, 12));
  const cards = layout === "cards";
  const firstRow = rows[0];
  const emailRow = rows.find((r) => r.kind === "email");
  const emailShown = emailRow
    ? displayAnswer(emailRow, current[emailRow.id])
    : "";

  const blocked: string[] = [];
  if (issues.length > 0)
    blocked.push(`${plural(issues.length, "issue", "issues")} to fix`);
  if (!declared) blocked.push("declaration unconfirmed");

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
      style={{
        height,
        ["--ca-accent" as string]: accentColor,
        ["--ca-wash" as string]: `color-mix(in oklab, ${accentColor} 12%, transparent)`,
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move between answers. Enter opens one to change it, Escape
        cancels.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready && !empty ? (
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {answered} of {rows.length} answered
              <span className="hidden @min-[30rem]:inline">
                {changedCount > 0 ? ` · ${changedCount} changed` : ""}
              </span>
            </p>
          ) : null}
        </div>
        {ready && !empty ? (
          <p
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-[12px]",
              done
                ? "text-success"
                : issues.length > 0
                  ? "text-warn"
                  : "text-success",
            )}
          >
            <span className="sr-only">
              {done
                ? `Submitted, reference ${done}`
                : plural(issues.length, "issue", "issues")}
            </span>
            {done ? (
              <>
                <CircleCheck aria-hidden className="size-3.5" />
                <span aria-hidden>Submitted</span>
              </>
            ) : (
              <>
                {issues.length > 0 ? (
                  <TriangleAlert aria-hidden className="size-3.5" />
                ) : (
                  <CircleCheck aria-hidden className="size-3.5" />
                )}
                <Roll
                  value={issues.length}
                  motionSafe={motionSafe}
                  className="font-mono text-[13px]"
                />
                <span aria-hidden>
                  {issues.length === 1 ? "issue" : "issues"}
                </span>
              </>
            )}
          </p>
        ) : null}
      </header>

      <div
        ref={editorRef}
        className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {status === "loading" ? (
          <div aria-hidden className="flex flex-col gap-4 px-4 py-4">
            {Array.from({ length: 2 }, (_, s) => (
              <div
                key={s}
                className="flex flex-col gap-2 rounded-3 border border-hairline p-3"
              >
                <span
                  className="h-3 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${s * 120}ms` }}
                />
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span
                      className="h-3 w-[28%] rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${s * 120 + i * 70}ms` }}
                    />
                    <span
                      className="h-3 flex-1 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${s * 120 + i * 70 + 40}ms` }}
                    />
                    <span
                      className="h-3 w-12 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${s * 120 + i * 70 + 80}ms` }}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              Your answers didn&apos;t load.
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
        ) : empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-1">
              <FileText aria-hidden className="size-5 text-ink-3" />
            </span>
            <div className="flex flex-col gap-1">
              <p className="text-sm text-foreground">
                {rows.length === 0
                  ? "Nothing to check yet."
                  : "Nothing answered yet."}
              </p>
              <p className="max-w-[28ch] text-[12px] text-ink-3">
                {rows.length === 0
                  ? "The form has no questions on it."
                  : "Work through the form and every answer gathers here to be read back."}
              </p>
            </div>
            {firstRow && !inert ? (
              <button
                type="button"
                onClick={() => {
                  setStarted(true);
                  openRow(firstRow.id);
                }}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90",
                  FOCUS_RING,
                )}
              >
                <Pencil aria-hidden className="size-3.5" />
                Start with {firstRow.label.toLowerCase()}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4">
            {sections.map((section) => (
              <section
                key={section.id}
                aria-labelledby={`${uid}-${section.id}`}
                className={cn(
                  "flex flex-col",
                  !cards && "overflow-hidden rounded-3 border border-hairline",
                )}
              >
                <motion.h3
                  id={`${uid}-${section.id}`}
                  initial={false}
                  animate={{ opacity: editing ? 0.45 : 1 }}
                  transition={{ duration: durations.base, ease: easings.move }}
                  className={cn(
                    "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                    cards
                      ? "mb-2"
                      : "border-b border-hairline bg-surface-1 px-3 py-1.5",
                  )}
                >
                  {section.title}
                </motion.h3>
                <ul
                  role="list"
                  aria-label={`${section.title} answers`}
                  className={cn(
                    cards
                      ? "grid grid-cols-1 gap-2 @min-[40rem]:grid-cols-2"
                      : "flex flex-col divide-y divide-hairline",
                  )}
                >
                  {section.rows.map((row) => {
                    const answer = current[row.id] ?? "";
                    const index = indexOf.get(row.id) ?? 0;
                    return (
                      <AnswerRow
                        key={row.id}
                        row={row}
                        value={answer}
                        issue={issueOf.get(row.id) ?? null}
                        changed={answer !== (baseline[row.id] ?? "")}
                        struck={struck[row.id] ?? null}
                        landing={landed === row.id}
                        editing={editing === row.id}
                        draft={draft}
                        dim={editing !== null && editing !== row.id}
                        layout={layout}
                        density={density}
                        motionSafe={motionSafe}
                        enter={live}
                        delay={r3(Math.min(index, 12) * step)}
                        tabIndex={activeId === row.id ? 0 : -1}
                        inert={inert}
                        submitted={done !== null}
                        hintId={hintId}
                        uid={uid}
                        nodeRef={(node) => {
                          if (node) changeNodes.current.set(row.id, node);
                          else changeNodes.current.delete(row.id);
                        }}
                        onOpen={() => {
                          if (editing === row.id) return;
                          openRow(row.id);
                        }}
                        onFocus={() => setActiveRow(row.id)}
                        onNav={(event) => onNav(event, row.id)}
                        onDraft={setDraft}
                        onSave={saveEdit}
                        onCancel={cancelEdit}
                      />
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {ready && !empty ? (
        <motion.footer
          initial={false}
          animate={{ opacity: editing ? 0.45 : 1 }}
          transition={{ duration: durations.base, ease: easings.move }}
          className="relative shrink-0 border-t border-hairline bg-surface-0 px-4 py-3"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {done ? (
              <motion.div
                key="done"
                initial={{
                  opacity: 0,
                  y: motionSafe ? distances.step : 0,
                  scale: motionSafe ? 0.96 : 1,
                }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.base }
                }
                className="flex flex-wrap items-center gap-x-4 gap-y-2"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-success">
                  <CircleCheck aria-hidden className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="text-[13px] font-medium text-foreground">
                    Application submitted
                  </p>
                  <p className="text-[11px] text-ink-3">
                    {emailShown
                      ? `Keep the reference; notices go to ${emailShown}.`
                      : "Keep the reference for your records."}
                  </p>
                </div>
                <motion.p
                  initial={{ opacity: 0, scale: motionSafe ? 0.8 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.recoil,
                          delay: durations.fast,
                          opacity: {
                            duration: durations.fast,
                            delay: durations.fast,
                          },
                        }
                      : { duration: durations.base }
                  }
                  className="rounded-2 border border-hairline-strong bg-card px-2.5 py-1 font-mono text-[13px] tracking-[0.04em] text-foreground tabular-nums"
                >
                  {done}
                </motion.p>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={{ duration: durations.fast, ease: easings.enter }}
                className="flex flex-col gap-3 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:justify-between"
              >
                <div className="flex min-w-0 items-start gap-2.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={declared}
                    aria-labelledby={declId}
                    aria-disabled={inert || undefined}
                    onClick={toggleDeclared}
                    className={cn(
                      "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
                      declared ? "bg-(--ca-accent)" : "bg-ink-3/35",
                      inert ? "cursor-not-allowed" : "cursor-pointer",
                      FOCUS_RING,
                    )}
                  >
                    <motion.span
                      aria-hidden
                      className="block size-4 rounded-full bg-white shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
                      initial={false}
                      animate={{ x: declared ? 16 : 0 }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                    />
                  </button>
                  <span
                    id={declId}
                    className="min-w-0 text-[12px] leading-5 text-ink-2"
                  >
                    {declaration}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-stretch gap-1 @min-[40rem]:items-end">
                  <button
                    type="button"
                    aria-disabled={!canSubmit || undefined}
                    aria-describedby={blocked.length ? `${uid}-why` : undefined}
                    onClick={submit}
                    className={cn(
                      "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 px-3.5 text-xs font-medium transition-colors",
                      canSubmit
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "cursor-not-allowed bg-surface-2 text-ink-3",
                      FOCUS_RING,
                    )}
                  >
                    {submitLabel}
                  </button>
                  <AnimatePresence initial={false}>
                    {blocked.length > 0 ? (
                      <motion.p
                        key={blocked.join("|")}
                        id={`${uid}-why`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={{
                          duration: durations.fast,
                          ease: easings.enter,
                        }}
                        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      >
                        {blocked.join(" · ")}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.footer>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
