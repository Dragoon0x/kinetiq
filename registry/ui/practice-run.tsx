"use client";

import * as React from "react";

import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import {
  CircleAlert,
  FlaskConical,
  Inbox,
  RotateCcw,
  Send,
  Trash2,
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

export type PracticeFieldKind = "text" | "amount" | "select" | "textarea";

export type PracticeOption = {
  id: string;
  label: string;
  /** Mono aside shown after the label in the receipt, e.g. an account tail. */
  hint?: string;
};

/** One field of the payout form. */
export type PracticeField = {
  id: string;
  label: string;
  kind: PracticeFieldKind;
  placeholder?: string;
  /** The choices of a select. */
  options?: PracticeOption[];
  /** Empty is refused at validation. @default false */
  required?: boolean;
  /** Small text under the field. */
  hint?: string;
  /** Longer text is refused at validation. */
  maxLength?: number;
  /** Takes the whole row when the form has two columns. @default false */
  wide?: boolean;
};

/** Field id to its text; amounts are decimal strings. */
export type PracticeValues = Record<string, string>;

export type PracticeChange = { field: string; from: string; to: string };

/** One thing that would happen (or did), in order, at a moment in ms. */
export type PracticeStep = {
  id: string;
  label: string;
  at: number;
  detail?: string;
};

export type PracticeOutcome =
  | { ok: true; ref: string; summary: string; steps: PracticeStep[] }
  | { ok: false; field?: string; reason: string; lesson: string };

/** A practice send that was kept, with what it taught. */
export type PracticeAttempt = {
  id: string;
  /** When it was tried, in ms. */
  at: number;
  values: PracticeValues;
  ok: boolean;
  /** "$420.00 to Fernmoor Studio, tomorrow 09:00" or why it was refused. */
  summary: string;
  /** What a refused attempt teaches. */
  lesson?: string;
};

export type PracticeRibbon = "ribbon" | "banner" | "border";
export type PracticeDensity = "compact" | "cozy" | "roomy";
export type PracticeStatus = "ready" | "loading" | "error";

export type PracticeRunProps = {
  /** How practice mode is flagged: a corner ribbon, a banner under the header, or the hatched border alone. @default "ribbon" */
  ribbonStyle?: PracticeRibbon;
  /** How long the real Send must be held, in seconds. @default 1.2 */
  holdSeconds?: number;
  /** Field heights, type size and padding. @default "cozy" */
  density?: PracticeDensity;
  /** The form's fields, in order. @default defaultPracticeSchema */
  schema?: PracticeField[];
  /** Controlled field values. */
  value?: PracticeValues;
  /** Initial values when uncontrolled. @default defaultPracticeValues */
  defaultValue?: PracticeValues;
  /** Fires from every keystroke or pick with all values and the field that changed; field "*" when an attempt was reused. */
  onChange?: (value: PracticeValues, change: PracticeChange) => void;
  /** Controlled practice mode. */
  practice?: boolean;
  /** Initial practice mode when uncontrolled. @default true */
  defaultPractice?: boolean;
  /** The practice switch was flipped. */
  onPracticeChange?: (practice: boolean) => void;
  /** Called on every send with the practice flag. Return an outcome to replace the built-in simulator's. */
  onSubmit?: (
    values: PracticeValues,
    practice: boolean,
  ) => PracticeOutcome | void;
  /** What the built-in simulator lets a payout draw on, in dollars. @default 12400 */
  balance?: number;
  /** Controlled practice attempts, newest first. */
  attempts?: PracticeAttempt[];
  /** Initial attempts when uncontrolled. @default defaultPracticeAttempts */
  defaultAttempts?: PracticeAttempt[];
  /** An attempt was added or removed. */
  onAttemptsChange?: (attempts: PracticeAttempt[]) => void;
  /** The moment the receipt's times count from, in ms; never read from the clock. @default defaultPracticeNow */
  now?: number;
  /** Whether the form and attempts have arrived. @default "ready" */
  status?: PracticeStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Send a payout" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the form and the attempts scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, switched or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Friday 9 October 2026, 14:42 UTC. */
export const defaultPracticeNow = Date.UTC(2026, 9, 9, 14, 42);

export const defaultPracticeSchema: PracticeField[] = [
  {
    id: "recipient",
    label: "Recipient",
    kind: "select",
    required: true,
    placeholder: "Choose a payee",
    options: [
      { id: "fernmoor", label: "Fernmoor Studio", hint: "acct 4471" },
      { id: "coldbrook", label: "Coldbrook Plumbing", hint: "acct 0928" },
      { id: "basinworks", label: "Basinworks Ltd", hint: "acct 7715" },
      { id: "lind", label: "Mara Lind", hint: "acct 2203" },
    ],
  },
  {
    id: "amount",
    label: "Amount",
    kind: "amount",
    required: true,
    placeholder: "0.00",
  },
  {
    id: "schedule",
    label: "Send",
    kind: "select",
    required: true,
    options: [
      { id: "now", label: "Right away" },
      { id: "tomorrow", label: "Tomorrow, 09:00" },
      { id: "monday", label: "Next Monday, 09:00" },
    ],
  },
  {
    id: "memo",
    label: "Memo",
    kind: "textarea",
    placeholder: "Shown on the recipient's statement",
    maxLength: 64,
    wide: true,
  },
];

export const defaultPracticeValues: PracticeValues = {
  recipient: "fernmoor",
  amount: "420.00",
  schedule: "tomorrow",
  memo: "October retainer",
};

/** Two practice sends on Gaugeworks Pay: one that would have gone, one refused. */
export const defaultPracticeAttempts: PracticeAttempt[] = [
  {
    id: "att-2",
    at: defaultPracticeNow - 2 * MIN,
    values: {
      recipient: "basinworks",
      amount: "18000.00",
      schedule: "now",
      memo: "Q4 equipment",
    },
    ok: false,
    summary: "$18,000.00 to Basinworks Ltd refused: above the balance",
    lesson:
      "A payout above the available balance is refused at validation. Nothing is reserved and the recipient is never told.",
  },
  {
    id: "att-1",
    at: defaultPracticeNow - 6 * MIN,
    values: {
      recipient: "coldbrook",
      amount: "1250.00",
      schedule: "monday",
      memo: "Site 4 callout",
    },
    ok: true,
    summary: "$1,250.00 to Coldbrook Plumbing, Mon 09:00",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const FIELD =
  "w-full rounded-2 border border-hairline-strong bg-surface-0 text-foreground placeholder:text-ink-3 transition-colors hover:border-ink-3 focus-visible:border-cobalt-bright disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger";

const HATCH =
  "repeating-linear-gradient(45deg, color-mix(in oklab, var(--warn) 70%, transparent) 0 6px, transparent 6px 12px)";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const dayOf = (t: number) => Math.floor(t / DAY);
const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** "now", "+1 s", "+2 min", "17:42", "Tomorrow 09:00", "Mon 09:00". */
const when = (t: number, now: number) => {
  const diff = t - now;
  if (diff < SEC) return "now";
  if (diff < MIN) return `+${Math.round(diff / SEC)} s`;
  if (diff < HOUR) return `+${Math.round(diff / MIN)} min`;
  const days = dayOf(t) - dayOf(now);
  if (days === 0) return clock(t);
  if (days === 1) return `Tomorrow ${clock(t)}`;
  return `${DAYS[new Date(t).getUTCDay()] ?? ""} ${clock(t)}`;
};

const scheduleAt = (id: string, now: number) => {
  const start = dayOf(now) * DAY;
  if (id === "tomorrow") return start + DAY + 9 * HOUR;
  if (id === "monday") {
    const ahead = (8 - new Date(now).getUTCDay()) % 7 || 7;
    return start + ahead * DAY + 9 * HOUR;
  }
  return now + 2 * MIN;
};

const optionLabel = (field: PracticeField | undefined, id: string) =>
  field?.options?.find((o) => o.id === id)?.label ?? id;

const amountOf = (text: string | undefined) => {
  const n = Number((text ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The built-in simulator. Checks the schema's required and maxLength rules,
 * then the amount against the balance, and plans the send from `schedule`.
 */
export function simulatePayout(
  values: PracticeValues,
  options: {
    schema?: PracticeField[];
    balance?: number;
    now?: number;
    ref?: string;
  } = {},
): PracticeOutcome {
  const {
    schema = defaultPracticeSchema,
    balance = 12400,
    now = defaultPracticeNow,
    ref = "PO-7310",
  } = options;
  for (const field of schema) {
    const text = (values[field.id] ?? "").trim();
    if (field.required && text === "") {
      return {
        ok: false,
        field: field.id,
        reason: `${field.label} is required.`,
        lesson: `A payout is checked before any funds move: without ${field.label.toLowerCase()} it never leaves the form.`,
      };
    }
    if (field.maxLength !== undefined && text.length > field.maxLength) {
      return {
        ok: false,
        field: field.id,
        reason: `${field.label} is over ${field.maxLength} characters.`,
        lesson: `${field.label} travels on the recipient's statement, which holds ${field.maxLength} characters; longer text is refused rather than cut.`,
      };
    }
    if (field.kind === "amount" && text !== "") {
      const n = amountOf(text);
      if (!Number.isFinite(n) || n <= 0) {
        return {
          ok: false,
          field: field.id,
          reason: `${field.label} must be more than ${money.format(0)}.`,
          lesson:
            "Amounts are read as dollars and cents; anything that is not a positive number is refused.",
        };
      }
      if (n > balance) {
        return {
          ok: false,
          field: field.id,
          reason: `${field.label} is above the available balance of ${money.format(balance)}.`,
          lesson:
            "A payout above the available balance is refused at validation. Nothing is reserved and the recipient is never told.",
        };
      }
    }
  }
  const recipientField = schema.find((f) => f.id === "recipient");
  const scheduleField = schema.find((f) => f.id === "schedule");
  const amount = amountOf(values.amount);
  const recipient = optionLabel(recipientField, values.recipient ?? "");
  const tail = recipientField?.options?.find(
    (o) => o.id === values.recipient,
  )?.hint;
  const sentAt = scheduleAt(values.schedule ?? "now", now);
  const landsAt = sentAt + 3 * HOUR;
  const amountText = Number.isFinite(amount) ? money.format(amount) : "";
  const scheduleText = optionLabel(scheduleField, values.schedule ?? "now");
  return {
    ok: true,
    ref,
    summary: `${amountText} to ${recipient}, ${when(sentAt, now)}`.trim(),
    steps: [
      {
        id: "validated",
        label: "Validated",
        at: now,
        detail: `${amountText} within the balance`,
      },
      {
        id: "reserved",
        label: "Funds reserved",
        at: now + SEC,
        detail: "Held on the Gaugeworks Pay ledger",
      },
      {
        id: "sent",
        label: `Sent to ${recipient}`,
        at: sentAt,
        detail: tail ? `${scheduleText}, ${tail}` : scheduleText,
      },
      {
        id: "lands",
        label: "Lands with the recipient",
        at: landsAt,
        detail: "Via Coldbrook Clearing, same-day rail",
      },
    ],
  };
}

const DENSITY: Record<
  PracticeDensity,
  {
    pad: string;
    gap: string;
    field: string;
    area: string;
    text: string;
    row: string;
  }
> = {
  compact: {
    pad: "px-3 py-2.5",
    gap: "gap-2.5",
    field: "h-8 px-2.5 text-[12px]",
    area: "min-h-13 px-2.5 py-1.5 text-[12px]",
    text: "text-[12px]",
    row: "py-1.5",
  },
  cozy: {
    pad: "px-4 py-3",
    gap: "gap-3",
    field: "h-9 px-3 text-[13px]",
    area: "min-h-16 px-3 py-2 text-[13px]",
    text: "text-[13px]",
    row: "py-2",
  },
  roomy: {
    pad: "px-5 py-4",
    gap: "gap-4",
    field: "h-10 px-3.5 text-[14px]",
    area: "min-h-19 px-3.5 py-2.5 text-[14px]",
    text: "text-[14px]",
    row: "py-2.5",
  },
};

/* ----------------------------------------------------------------------- */
/*                              Small pieces                                */
/* ----------------------------------------------------------------------- */

function Tick({
  motionSafe,
  delay,
  className,
}: {
  motionSafe: boolean;
  delay: number;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className={cn("size-3", className)}>
      <motion.path
        d="M3 7.4 5.8 10 11 4.2"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={motionSafe ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={motionSafe ? { ...springs.flick, delay } : { duration: 0 }}
      />
    </svg>
  );
}

function Watermark({ id, text }: { id: string; text: string }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full text-warn"
    >
      <defs>
        <pattern
          id={id}
          width={170}
          height={84}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-18)"
        >
          <text
            x={0}
            y={42}
            fill="currentColor"
            fontFamily="ui-monospace, monospace"
            fontSize={22}
            fontWeight={700}
            letterSpacing={4}
          >
            {text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} opacity={0.11} />
    </svg>
  );
}

function PracticeSwitch({
  on,
  motionSafe,
  disabled,
  onToggle,
}: {
  on: boolean;
  motionSafe: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled || undefined}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-2 rounded-full pr-1 pl-2 text-xs transition-colors",
        disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-surface-2",
        on ? "text-foreground" : "text-ink-2",
        FOCUS_RING,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <FlaskConical
          aria-hidden
          className={cn("size-3.5", on ? "text-warn" : "text-ink-3")}
        />
        Practice
      </span>
      <span
        aria-hidden
        className={cn(
          "relative block h-5 w-9 rounded-full border transition-colors duration-200",
          on
            ? "border-transparent bg-warn"
            : "border-hairline-strong bg-surface-2",
        )}
      >
        <motion.span
          className="absolute top-0.5 left-0.5 block size-3.5 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]"
          initial={false}
          animate={{ x: on ? 16 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </span>
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Receipt                                  */
/* ----------------------------------------------------------------------- */

function Receipt({
  outcome,
  practice,
  now,
  motionSafe,
  uid,
  density,
  onNew,
  disabled,
}: {
  outcome: Extract<PracticeOutcome, { ok: true }>;
  practice: boolean;
  now: number;
  motionSafe: boolean;
  uid: string;
  density: PracticeDensity;
  onNew: () => void;
  disabled: boolean;
}) {
  const d = DENSITY[density];
  const step = cascade(outcome.steps.length);
  const headingId = `${uid}-receipt-title`;
  return (
    <motion.section
      aria-labelledby={headingId}
      initial={{
        opacity: 0,
        y: motionSafe ? distances.shift : 0,
        scale: motionSafe && !practice ? 0.97 : 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{
        y: motionSafe ? springs.glide : { duration: 0 },
        scale: motionSafe ? springs.recoil : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "relative overflow-hidden rounded-3 border",
        practice
          ? "border-dashed border-[color-mix(in_oklab,var(--warn)_55%,transparent)] bg-[color-mix(in_oklab,var(--warn)_6%,var(--bg-1))]"
          : "border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_7%,var(--bg-1))]",
      )}
    >
      {practice ? <Watermark id={`${uid}-wm`} text="NOT REAL" /> : null}
      <div className={cn("relative flex flex-col", d.pad, d.gap)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {practice ? "Practice receipt" : "Receipt"} · {outcome.ref}
            </p>
            <h3
              id={headingId}
              className={cn(
                "mt-0.5 flex items-center gap-1.5 font-semibold text-foreground",
                d.text,
              )}
            >
              {practice ? null : (
                <span className="flex size-4 items-center justify-center rounded-full bg-success text-background">
                  <Tick motionSafe={motionSafe} delay={0.1} />
                </span>
              )}
              {practice ? "Would have been sent" : "Sent"}
            </h3>
            <p className={cn("mt-0.5 text-ink-2", d.text)}>{outcome.summary}</p>
          </div>
          {practice ? (
            <motion.span
              aria-hidden
              initial={{
                opacity: 0,
                scale: motionSafe ? 1.35 : 1,
                rotate: -8,
              }}
              animate={{ opacity: 1, scale: 1, rotate: -8 }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      delay: 0.18,
                      opacity: { duration: durations.fast, delay: 0.18 },
                    }
                  : { duration: durations.fast }
              }
              className="shrink-0 rounded-1 border-2 border-warn px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em] text-warn uppercase"
            >
              Not real
            </motion.span>
          ) : null}
        </div>

        <ol
          aria-label={
            practice ? "What would have happened" : "What happens next"
          }
          className="flex flex-col"
        >
          {outcome.steps.map((s, i) => {
            const delay = r3(i * step);
            return (
              <motion.li
                key={s.id}
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  y: motionSafe ? { ...springs.flick, delay } : { duration: 0 },
                  opacity: {
                    duration: durations.base,
                    ease: easings.enter,
                    delay: motionSafe ? delay : 0,
                  },
                }}
                className={cn(
                  "relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-2.5",
                  d.row,
                )}
              >
                {i < outcome.steps.length - 1 ? (
                  <span
                    aria-hidden
                    className="absolute top-[calc(50%+0.5rem)] bottom-[-50%] left-[0.46rem] w-px bg-hairline-strong"
                  />
                ) : null}
                <span
                  className={cn(
                    "relative mt-px flex size-4 items-center justify-center rounded-full border",
                    practice
                      ? "border-warn text-warn"
                      : "border-success bg-success text-background",
                  )}
                >
                  <Tick motionSafe={motionSafe} delay={delay} />
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-foreground", d.text)}>
                    {s.label}
                  </span>
                  {s.detail ? (
                    <span className="block truncate text-[11px] text-ink-3">
                      {s.detail}
                    </span>
                  ) : null}
                </span>
                <span className="pt-px font-mono text-[11px] text-ink-2 tabular-nums">
                  {when(s.at, now)}
                </span>
              </motion.li>
            );
          })}
        </ol>

        {practice ? (
          <p className="text-[11px] text-ink-3">
            No funds moved and nobody was told. Switch Practice off to send for
            real.
          </p>
        ) : (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onNew}
              aria-disabled={disabled || undefined}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              New payout
            </button>
          </div>
        )}
      </div>
    </motion.section>
  );
}

function Refusal({
  outcome,
  practice,
  motionSafe,
  density,
}: {
  outcome: Extract<PracticeOutcome, { ok: false }>;
  practice: boolean;
  motionSafe: boolean;
  density: PracticeDensity;
}) {
  const d = DENSITY[density];
  return (
    <motion.section
      aria-label={practice ? "Refused in practice" : "Refused"}
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{
        y: motionSafe ? springs.snap : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      className={cn(
        "rounded-3 border",
        practice
          ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,var(--bg-1))]"
          : "border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,var(--bg-1))]",
        d.pad,
      )}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert
          aria-hidden
          className={cn(
            "mt-px size-4 shrink-0",
            practice ? "text-warn" : "text-danger",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {practice ? "Refused in practice" : "Refused"}
          </p>
          <p className={cn("mt-0.5 font-medium text-foreground", d.text)}>
            {outcome.reason}
          </p>
          {practice ? (
            <div className="mt-2 rounded-2 border border-hairline bg-card/60 px-2.5 py-2">
              <p className="font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
                Lesson
              </p>
              <p className="mt-0.5 text-[12px] text-ink-2">{outcome.lesson}</p>
            </div>
          ) : (
            <p className="mt-1 text-[12px] text-ink-2">
              Nothing was sent. Fix it and hold Send again.
            </p>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type Result = {
  key: number;
  practice: boolean;
  outcome: PracticeOutcome;
};

/**
 * A sandbox for an action that matters. A payout form sits under a Practice
 * switch; with it on, the surface wears a hatched border and a ribbon, and
 * Submit produces a pretend result: a receipt that rises on `springs.glide`
 * under a NOT REAL watermark and stamp, with a timeline of what would have
 * happened, each step ticking in on `springs.flick` in a cascade with its
 * time. A refused practice send comes back as a lesson instead. Every
 * practice send is kept in a side list with its outcome, so the lessons stay
 * in view.
 *
 * Switching Practice off clears the pretend results on an exit ease and drops
 * the ribbon; the real Send then needs a hold the length of `holdSeconds`, a
 * fill crossing the button while it is held, and a real receipt lands on
 * `springs.recoil`.
 *
 * The form is native, the switch is a switch, the hold is Space held (Escape
 * lets go) and the attempts are a listbox: Up/Down move, Enter reuses an
 * attempt's values, Delete forgets it. Every change is announced. Under
 * reduced motion nothing rises or lands: receipts cross-fade in place, the
 * ticks appear at once and the hold still fills.
 */
export function PracticeRun({
  ribbonStyle = "ribbon",
  holdSeconds = 1.2,
  density = "cozy",
  schema = defaultPracticeSchema,
  value,
  defaultValue = defaultPracticeValues,
  onChange,
  practice,
  defaultPractice = true,
  onPracticeChange,
  onSubmit,
  balance = 12400,
  attempts,
  defaultAttempts = defaultPracticeAttempts,
  onAttemptsChange,
  now = defaultPracticeNow,
  status = "ready",
  onRetry,
  title = "Send a payout",
  label,
  height = 540,
  disabled = false,
  className,
}: PracticeRunProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const listId = `${uid}-attempts`;
  const holdHintId = `${uid}-hold-hint`;
  const d = DENSITY[density];

  const [ownValue, setOwnValue] = React.useState<PracticeValues>(defaultValue);
  const current = value ?? ownValue;
  const [ownPractice, setOwnPractice] = React.useState(defaultPractice);
  const inPractice = practice ?? ownPractice;
  const [ownAttempts, setOwnAttempts] =
    React.useState<PracticeAttempt[]>(defaultAttempts);
  const list = attempts ?? ownAttempts;

  const ready = status === "ready";
  const inert = disabled || !ready;

  const [result, setResult] = React.useState<Result | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [holding, setHolding] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const seq = React.useRef(0);
  // The hold completes after a delay, so a send reads the values and the
  // list as they are then, not as they were when the hold began.
  const currentRef = React.useRef(current);
  const listRef = React.useRef(list);
  React.useEffect(() => {
    currentRef.current = current;
    listRef.current = list;
  });
  const resultRef = React.useRef<HTMLDivElement | null>(null);
  const sendRef = React.useRef<HTMLButtonElement | null>(null);
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const optionNodes = React.useRef(new Map<string, HTMLButtonElement>());

  const byId = new Map(schema.map((f) => [f.id, f]));
  const recipientField = byId.get("recipient");
  const failedField =
    result && !result.outcome.ok ? (result.outcome.field ?? null) : null;

  /* ------------------------------- values ------------------------------ */

  const setField = (field: string, to: string) => {
    if (inert) return;
    const from = current[field] ?? "";
    if (from === to) return;
    const next = { ...current, [field]: to };
    if (value === undefined) setOwnValue(next);
    onChange?.(next, { field, from, to });
    // A refusal is about what was typed; typing again clears it.
    if (result && !result.outcome.ok) setResult(null);
  };

  const replaceValues = (next: PracticeValues, why: string) => {
    if (value === undefined) setOwnValue(next);
    onChange?.(next, { field: "*", from: "", to: why });
    setResult(null);
  };

  const setAttempts = (next: PracticeAttempt[]) => {
    if (attempts === undefined) setOwnAttempts(next);
    onAttemptsChange?.(next);
  };

  /* -------------------------------- send ------------------------------- */

  const describe = (values: PracticeValues) => {
    const n = amountOf(values.amount);
    const amount = Number.isFinite(n) ? money.format(n) : "an amount";
    return `${amount} to ${optionLabel(recipientField, values.recipient ?? "") || "nobody"}`;
  };

  const outcomeFor = (values: PracticeValues, isPractice: boolean) => {
    const ref = `PO-${7310 + listRef.current.length}`;
    return (
      onSubmit?.(values, isPractice) ??
      simulatePayout(values, { schema, balance, now, ref })
    );
  };

  const sendPractice = () => {
    if (inert) return;
    const values = { ...currentRef.current };
    const outcome = outcomeFor(values, true);
    seq.current += 1;
    const attempt: PracticeAttempt = {
      id: `${uid}-a${seq.current}`,
      at: now,
      values,
      ok: outcome.ok,
      summary: outcome.ok
        ? outcome.summary
        : `${describe(values)} refused: ${outcome.reason.replace(/\.$/, "")}`,
      lesson: outcome.ok ? undefined : outcome.lesson,
    };
    setAttempts([attempt, ...listRef.current]);
    setSelected(attempt.id);
    setResult({ key: seq.current, practice: true, outcome });
    setAnnouncement(
      outcome.ok
        ? `Practice send. ${outcome.summary} would have been validated, reserved, sent and landed. Not real.`
        : `Practice send refused. ${outcome.reason} ${outcome.lesson}`,
    );
  };

  const sendReal = () => {
    if (inert) return;
    const values = { ...currentRef.current };
    const outcome = outcomeFor(values, false);
    seq.current += 1;
    setResult({ key: seq.current, practice: false, outcome });
    setAnnouncement(
      outcome.ok
        ? `Sent. ${outcome.summary}.`
        : `Refused. ${outcome.reason} Nothing was sent.`,
    );
  };

  /* -------------------------------- hold ------------------------------- */

  // The hold's progress is a motion value: the fill follows it without a
  // render per frame, and the send fires from its completion.
  const progress = useMotionValue(0);
  const holdAnim = React.useRef<ReturnType<typeof animate> | null>(null);
  const keyHeld = React.useRef(false);
  const pointerId = React.useRef<number | null>(null);

  const letGo = (cancelled: boolean) => {
    holdAnim.current?.stop();
    holdAnim.current = null;
    keyHeld.current = false;
    pointerId.current = null;
    setHolding(false);
    if (cancelled && progress.get() > 0) {
      holdAnim.current = animate(progress, 0, {
        duration: durations.fast,
        ease: easings.exit,
        onComplete: () => {
          holdAnim.current = null;
        },
      });
      setAnnouncement(`Let go early. Hold Send for ${holdSeconds} seconds.`);
    } else if (cancelled) {
      progress.set(0);
    }
  };

  const beginHold = () => {
    if (inert || holding) return;
    // A press during the let-go settle takes over from where the fill is.
    holdAnim.current?.stop();
    setHolding(true);
    setAnnouncement(`Holding. Keep holding for ${holdSeconds} seconds.`);
    holdAnim.current = animate(progress, 1, {
      // Progress is information, not flourish: it fills under reduced motion.
      duration: holdSeconds * (1 - progress.get()),
      ease: easings.linear,
      onComplete: () => {
        holdAnim.current = null;
        keyHeld.current = false;
        pointerId.current = null;
        progress.set(0);
        setHolding(false);
        sendReal();
      },
    });
  };

  const letGoRef = React.useRef(letGo);
  React.useEffect(() => {
    letGoRef.current = letGo;
  });

  // A hidden tab lets go of the hold; nothing runs out of sight.
  React.useEffect(() => {
    if (!holding) return;
    const onVisibility = () => {
      if (document.hidden) letGoRef.current(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [holding]);

  React.useEffect(() => () => holdAnim.current?.stop(), []);

  /* ------------------------------ practice ----------------------------- */

  const setPractice = (next: boolean) => {
    if (inert || next === inPractice) return;
    if (holding) letGo(true);
    if (practice === undefined) setOwnPractice(next);
    onPracticeChange?.(next);
    setResult(null);
    setAnnouncement(
      next
        ? "Practice on. Nothing you send is real."
        : `Practice off. Sends are real: hold Send for ${holdSeconds} seconds to confirm.`,
    );
  };

  React.useEffect(() => {
    if (!holding) return;
    if (inert) letGoRef.current(true);
  }, [inert, holding]);

  /* ------------------------------ results ------------------------------ */

  const resultKey = result?.key ?? null;
  React.useEffect(() => {
    if (resultKey === null) return;
    resultRef.current?.scrollIntoView({
      block: "nearest",
      behavior: motionSafe ? "smooth" : "auto",
    });
  }, [resultKey, motionSafe]);

  React.useEffect(() => {
    if (!failedField) return;
    fieldNodes.current.get(failedField)?.focus({ preventScroll: false });
  }, [failedField, resultKey]);

  /* ------------------------------ attempts ----------------------------- */

  const activeAttempt =
    selected && list.some((a) => a.id === selected)
      ? selected
      : (list[0]?.id ?? null);
  const shown = list.find((a) => a.id === activeAttempt) ?? null;

  const reuse = (attempt: PracticeAttempt) => {
    if (inert) return;
    replaceValues({ ...attempt.values }, attempt.id);
    setAnnouncement(
      `Loaded ${describe(attempt.values)} into the form${attempt.ok ? "" : ". It was refused last time"}.`,
    );
    const first = schema[0];
    if (first) fieldNodes.current.get(first.id)?.focus();
  };

  const forget = (attempt: PracticeAttempt) => {
    if (inert) return;
    const i = list.findIndex((a) => a.id === attempt.id);
    const next = list.filter((a) => a.id !== attempt.id);
    setAttempts(next);
    const neighbour = next[Math.min(i, next.length - 1)];
    setSelected(neighbour?.id ?? null);
    setAnnouncement(
      `Forgot ${describe(attempt.values)}. ${next.length} ${next.length === 1 ? "attempt" : "attempts"} kept.`,
    );
    if (neighbour) {
      // Focus lands on the neighbour once the row is gone.
      window.setTimeout(
        () => optionNodes.current.get(neighbour.id)?.focus(),
        0,
      );
    }
  };

  const onListKey = (event: React.KeyboardEvent, attempt: PracticeAttempt) => {
    const i = list.findIndex((a) => a.id === attempt.id);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = list.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      reuse(attempt);
      return;
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      forget(attempt);
      return;
    } else return;
    event.preventDefault();
    const target = list[clamp(to, 0, list.length - 1)];
    if (target) {
      setSelected(target.id);
      optionNodes.current.get(target.id)?.focus();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const flagged = ready && inPractice;
  const holdLabel = holding ? "Keep holding" : "Hold to send";
  const summaryText = describe(current);

  const renderField = (field: PracticeField) => {
    const id = `${uid}-f-${field.id}`;
    const hintId = `${uid}-h-${field.id}`;
    const errorId = `${uid}-e-${field.id}`;
    const invalid = failedField === field.id;
    const text = current[field.id] ?? "";
    const describedBy =
      [field.hint ? hintId : null, invalid ? errorId : null]
        .filter(Boolean)
        .join(" ") || undefined;
    const bind = (node: HTMLElement | null) => {
      if (node) fieldNodes.current.set(field.id, node);
      else fieldNodes.current.delete(field.id);
    };
    const common = {
      id,
      name: field.id,
      disabled: inert,
      "aria-invalid": invalid || undefined,
      "aria-describedby": describedBy,
      "aria-required": field.required || undefined,
    };
    const hint =
      field.kind === "amount" && !field.hint
        ? `Available ${money.format(balance)}`
        : field.hint;
    return (
      <div
        key={field.id}
        className={cn(
          "flex min-w-0 flex-col gap-1",
          field.wide && "@min-[28rem]:col-span-2",
        )}
      >
        <label
          htmlFor={id}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          {field.label}
          {field.required ? null : (
            <span className="ml-1 tracking-normal text-ink-3/70 normal-case">
              optional
            </span>
          )}
        </label>
        {field.kind === "select" ? (
          <select
            {...common}
            ref={bind}
            value={text}
            onChange={(event) => setField(field.id, event.target.value)}
            className={cn(FIELD, d.field, FOCUS_RING, "appearance-none pr-8")}
            style={{
              backgroundImage:
                "linear-gradient(45deg, transparent 50%, var(--ink-3) 50%), linear-gradient(135deg, var(--ink-3) 50%, transparent 50%)",
              backgroundPosition:
                "calc(100% - 16px) calc(50% - 1px), calc(100% - 11px) calc(50% - 1px)",
              backgroundSize: "5px 5px, 5px 5px",
              backgroundRepeat: "no-repeat",
            }}
          >
            {field.placeholder ? (
              <option value="">{field.placeholder}</option>
            ) : null}
            {(field.options ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
                {o.hint ? ` (${o.hint})` : ""}
              </option>
            ))}
          </select>
        ) : field.kind === "textarea" ? (
          <textarea
            {...common}
            ref={bind}
            value={text}
            rows={2}
            placeholder={field.placeholder}
            onChange={(event) => setField(field.id, event.target.value)}
            className={cn(FIELD, d.area, FOCUS_RING, "resize-none")}
          />
        ) : field.kind === "amount" ? (
          <div className="relative">
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-ink-3",
                d.text,
              )}
            >
              $
            </span>
            <input
              {...common}
              ref={bind}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={text}
              placeholder={field.placeholder}
              onChange={(event) => setField(field.id, event.target.value)}
              className={cn(
                FIELD,
                d.field,
                FOCUS_RING,
                "pl-7 font-mono tabular-nums",
              )}
            />
          </div>
        ) : (
          <input
            {...common}
            ref={bind}
            type="text"
            autoComplete="off"
            value={text}
            placeholder={field.placeholder}
            onChange={(event) => setField(field.id, event.target.value)}
            className={cn(FIELD, d.field, FOCUS_RING)}
          />
        )}
        {invalid && result && !result.outcome.ok ? (
          <p id={errorId} className="text-[11px] text-danger">
            {result.outcome.reason}
          </p>
        ) : hint ? (
          <p
            id={hintId}
            className="flex justify-between text-[11px] text-ink-3"
          >
            <span>{hint}</span>
            {field.maxLength !== undefined ? (
              <span
                className={cn(
                  "font-mono tabular-nums",
                  text.length > field.maxLength && "text-danger",
                )}
              >
                {text.length}/{field.maxLength}
              </span>
            ) : null}
          </p>
        ) : field.maxLength !== undefined ? (
          <p className="flex justify-end text-[11px] text-ink-3">
            <span
              className={cn(
                "font-mono tabular-nums",
                text.length > field.maxLength && "text-danger",
              )}
            >
              {text.length}/{field.maxLength}
            </span>
          </p>
        ) : null}
      </div>
    );
  };

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
      style={{ height }}
    >
      {/* The hatched frame: a large surface, so it fades rather than moves. */}
      <AnimatePresence initial={false}>
        {flagged ? (
          <motion.span
            key="frame"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.slow) }}
            transition={{ duration: durations.slow, ease: easings.enter }}
            className="pointer-events-none absolute inset-0 z-20 rounded-4"
            style={{
              background: HATCH,
              padding: 3,
              WebkitMask:
                "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              WebkitMaskComposite: "xor",
              mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
              maskComposite: "exclude",
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {flagged && ribbonStyle === "ribbon" ? (
          <motion.span
            key="ribbon"
            aria-hidden
            initial={{
              opacity: 0,
              y: motionSafe ? -distances.step : 0,
              rotate: 45,
            }}
            animate={{ opacity: 1, y: 0, rotate: 45 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: exitFor(durations.base),
            }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
            className="pointer-events-none absolute top-[18px] -right-[40px] z-30 w-[156px] bg-warn py-0.5 text-center font-mono text-[10px] font-bold tracking-[0.16em] text-background uppercase shadow-[0_2px_6px_color-mix(in_oklab,black_25%,transparent)]"
          >
            Practice
          </motion.span>
        ) : null}
      </AnimatePresence>

      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-2.5",
          ribbonStyle === "ribbon" && "pr-16",
        )}
      >
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Gaugeworks Pay
          </p>
        </div>
        <PracticeSwitch
          on={inPractice}
          motionSafe={motionSafe}
          disabled={inert}
          onToggle={() => setPractice(!inPractice)}
        />
      </header>

      <AnimatePresence initial={false}>
        {flagged && ribbonStyle === "banner" ? (
          <motion.div
            key="banner"
            role="note"
            initial={{ opacity: 0, y: motionSafe ? -distances.step : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
            className="flex shrink-0 items-center gap-2 border-b border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-4 py-1.5"
          >
            <FlaskConical aria-hidden className="size-3.5 shrink-0 text-warn" />
            <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-foreground uppercase">
              Practice mode
              <span className="ml-1.5 tracking-normal text-ink-2 normal-case">
                nothing here is real
              </span>
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The payout form didn&apos;t load.
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
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto overscroll-contain @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[40rem]:overflow-hidden">
          {/* ------------------------------ form ------------------------- */}
          <div
            className={cn(
              "flex min-w-0 flex-col @min-[40rem]:min-h-0 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain",
              d.pad,
              d.gap,
            )}
          >
            {status === "loading" ? (
              <div
                aria-hidden
                className="grid grid-cols-1 gap-3 @min-[28rem]:grid-cols-2"
              >
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex flex-col gap-1.5",
                      i === 3 && "@min-[28rem]:col-span-2",
                    )}
                  >
                    <span
                      className="h-2.5 w-16 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                    <span
                      className={cn(
                        "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                        i === 3 ? "h-16" : "h-9",
                      )}
                      style={{ animationDelay: `${i * 90}ms` }}
                    />
                  </div>
                ))}
                <span className="h-9 w-32 justify-self-end rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[28rem]:col-span-2" />
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (inert) return;
                  if (inPractice) sendPractice();
                  else {
                    setAnnouncement(
                      `Hold Send for ${holdSeconds} seconds to send for real.`,
                    );
                    sendRef.current?.focus();
                  }
                }}
                className={cn("flex flex-col", d.gap)}
              >
                <div
                  className={cn(
                    "grid grid-cols-1 @min-[28rem]:grid-cols-2",
                    d.gap,
                  )}
                >
                  {schema.map(renderField)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline pt-3">
                  <p className="min-w-0 flex-1 truncate text-[12px] text-ink-2">
                    <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                      {inPractice ? "Practice " : ""}send
                    </span>{" "}
                    {summaryText}
                  </p>
                  {inPractice ? (
                    <button
                      type="submit"
                      aria-disabled={inert || undefined}
                      className={cn(
                        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2 border border-dashed border-warn px-3.5 text-[13px] font-medium text-foreground transition-colors",
                        inert
                          ? "cursor-not-allowed"
                          : "hover:bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] active:scale-[0.98]",
                        FOCUS_RING,
                      )}
                    >
                      <FlaskConical aria-hidden className="size-4 text-warn" />
                      Practice send
                    </button>
                  ) : (
                    <>
                      <p id={holdHintId} className="sr-only">
                        Hold for {holdSeconds} seconds, with the pointer or the
                        Space key, to send. Escape lets go.
                      </p>
                      <button
                        ref={sendRef}
                        type="button"
                        aria-describedby={holdHintId}
                        aria-disabled={inert || undefined}
                        aria-pressed={holding}
                        onClick={(event) => event.preventDefault()}
                        onPointerDown={(event) => {
                          if (inert) return;
                          if (
                            event.pointerType === "mouse" &&
                            event.button !== 0
                          )
                            return;
                          try {
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          } catch {
                            // A synthetic pointer has no capture to give.
                          }
                          pointerId.current = event.pointerId;
                          beginHold();
                        }}
                        onPointerUp={(event) => {
                          if (pointerId.current === event.pointerId)
                            letGo(true);
                        }}
                        onPointerCancel={(event) => {
                          if (pointerId.current === event.pointerId)
                            letGo(true);
                        }}
                        onLostPointerCapture={() => {
                          if (pointerId.current !== null) letGo(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && holding) {
                            event.preventDefault();
                            letGo(true);
                            return;
                          }
                          if (event.key !== " " && event.key !== "Enter")
                            return;
                          // The browser clicks on Enter's keydown and Space's
                          // keyup; both are pre-empted so the hold decides.
                          event.preventDefault();
                          if (event.repeat || keyHeld.current) return;
                          keyHeld.current = true;
                          beginHold();
                        }}
                        onKeyUp={(event) => {
                          if (
                            (event.key === " " || event.key === "Enter") &&
                            keyHeld.current
                          ) {
                            letGo(true);
                          }
                        }}
                        onBlur={() => {
                          if (holding) letGo(true);
                        }}
                        className={cn(
                          "relative inline-flex h-9 shrink-0 touch-none items-center gap-1.5 overflow-hidden rounded-2 bg-primary px-3.5 text-[13px] font-medium text-primary-foreground select-none",
                          inert ? "cursor-not-allowed" : "cursor-pointer",
                          FOCUS_RING,
                        )}
                      >
                        <motion.span
                          aria-hidden
                          className="absolute inset-0 origin-left bg-[color-mix(in_oklab,var(--primary-foreground)_28%,transparent)]"
                          style={{ scaleX: progress }}
                        />
                        <Send aria-hidden className="relative size-4" />
                        <span className="relative">{holdLabel}</span>
                      </button>
                    </>
                  )}
                </div>
              </form>
            )}

            <div ref={resultRef} className="scroll-mb-3">
              <AnimatePresence mode="wait">
                {result && ready ? (
                  result.outcome.ok ? (
                    <Receipt
                      key={`r-${result.key}`}
                      outcome={result.outcome}
                      practice={result.practice}
                      now={now}
                      motionSafe={motionSafe}
                      uid={`${uid}-${result.key}`}
                      density={density}
                      disabled={inert}
                      onNew={() => {
                        if (inert) return;
                        replaceValues(
                          Object.fromEntries(schema.map((f) => [f.id, ""])),
                          "new",
                        );
                        setAnnouncement("New payout. The form is empty.");
                        const first = schema[0];
                        if (first) fieldNodes.current.get(first.id)?.focus();
                      }}
                    />
                  ) : (
                    <Refusal
                      key={`x-${result.key}`}
                      outcome={result.outcome}
                      practice={result.practice}
                      motionSafe={motionSafe}
                      density={density}
                    />
                  )
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* ---------------------------- attempts ----------------------- */}
          <aside
            aria-labelledby={`${uid}-attempts-title`}
            className="flex min-w-0 flex-col border-t border-hairline bg-surface-0/60 @min-[40rem]:min-h-0 @min-[40rem]:border-t-0 @min-[40rem]:border-l"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-2">
              <p
                id={`${uid}-attempts-title`}
                className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                Practice attempts
              </p>
              {ready ? (
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {list.length}
                </span>
              ) : null}
            </div>

            {status === "loading" ? (
              <div aria-hidden className="flex flex-col gap-1.5 px-3 pb-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <span
                    key={i}
                    className="h-11 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 110}ms` }}
                  />
                ))}
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-5 py-6 text-center">
                <Inbox aria-hidden className="size-5 text-ink-3" />
                <p className="text-[13px] text-ink-2">
                  No practice attempts yet.
                </p>
                <p className="text-[11px] text-ink-3">
                  {inPractice
                    ? "Fill the form and press Practice send; nothing is real."
                    : "Switch Practice on to try a send that is not real."}
                </p>
              </div>
            ) : (
              <>
                <ul
                  id={listId}
                  role="listbox"
                  aria-label="Practice attempts, newest first"
                  className="flex flex-col gap-1 px-2 @min-[40rem]:min-h-0 @min-[40rem]:flex-1 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {list.map((attempt) => {
                      const isActive = attempt.id === activeAttempt;
                      const n = amountOf(attempt.values.amount);
                      return (
                        <motion.li
                          key={attempt.id}
                          role="none"
                          layout={motionSafe ? "position" : false}
                          initial={{
                            opacity: 0,
                            y: motionSafe ? -distances.step : 0,
                          }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{
                            opacity: 0,
                            transition: exitFor(durations.fast),
                          }}
                          transition={{
                            layout: springs.glide,
                            y: motionSafe ? springs.glide : { duration: 0 },
                            opacity: {
                              duration: durations.base,
                              ease: easings.enter,
                            },
                          }}
                        >
                          <button
                            ref={(node) => {
                              if (node)
                                optionNodes.current.set(attempt.id, node);
                              else optionNodes.current.delete(attempt.id);
                            }}
                            id={`${uid}-opt-${attempt.id}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            aria-label={`${attempt.ok ? "Would have sent" : "Refused"}: ${attempt.summary}. ${attempt.at >= now ? "Just now" : clock(attempt.at)}. Enter reuses it, Delete forgets it.`}
                            tabIndex={isActive ? 0 : -1}
                            onFocus={() => setSelected(attempt.id)}
                            onClick={() => setSelected(attempt.id)}
                            onDoubleClick={() => reuse(attempt)}
                            onKeyDown={(event) => onListKey(event, attempt)}
                            className={cn(
                              "grid w-full grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-2 rounded-2 px-2 text-left transition-colors",
                              d.row,
                              isActive
                                ? "bg-surface-2"
                                : "hover:bg-surface-2/60",
                              FOCUS_RING,
                            )}
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "size-2 rounded-full",
                                attempt.ok ? "bg-success" : "bg-warn",
                              )}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] text-foreground">
                                <span className="font-mono tabular-nums">
                                  {Number.isFinite(n) ? money.format(n) : "--"}
                                </span>{" "}
                                <span className="text-ink-2">
                                  to{" "}
                                  {optionLabel(
                                    recipientField,
                                    attempt.values.recipient ?? "",
                                  ) || "nobody"}
                                </span>
                              </span>
                              <span
                                className={cn(
                                  "block truncate text-[11px]",
                                  attempt.ok ? "text-ink-3" : "text-warn",
                                )}
                              >
                                {attempt.ok
                                  ? "Would have gone"
                                  : "Refused: lesson"}
                              </span>
                            </span>
                            <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                              {attempt.at >= now
                                ? "just now"
                                : clock(attempt.at)}
                            </span>
                          </button>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>

                <div className="shrink-0 border-t border-hairline px-3 py-2.5">
                  <AnimatePresence mode="wait" initial={false}>
                    {shown ? (
                      <motion.div
                        key={shown.id}
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
                        className="flex flex-col gap-2"
                      >
                        {shown.ok ? (
                          <p className="text-[11px] text-ink-2">
                            {shown.summary}
                          </p>
                        ) : (
                          <div>
                            <p className="font-mono text-[10px] tracking-[0.08em] text-warn uppercase">
                              Lesson
                            </p>
                            <p className="mt-0.5 text-[11px] text-ink-2">
                              {shown.lesson}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label="Reuse this attempt's values"
                            aria-disabled={inert || undefined}
                            onClick={() => reuse(shown)}
                            className={cn(
                              "inline-flex h-6 items-center gap-1 rounded-2 border border-hairline px-2 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                              inert && "cursor-not-allowed",
                              FOCUS_RING,
                            )}
                          >
                            <RotateCcw aria-hidden className="size-3" />
                            Reuse
                          </button>
                          <button
                            type="button"
                            aria-label="Forget this attempt"
                            aria-disabled={inert || undefined}
                            onClick={() => forget(shown)}
                            className={cn(
                              "inline-flex h-6 items-center gap-1 rounded-2 px-2 text-[11px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
                              inert && "cursor-not-allowed",
                              FOCUS_RING,
                            )}
                          >
                            <Trash2 aria-hidden className="size-3" />
                            Forget
                          </button>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
