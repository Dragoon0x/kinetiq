"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Inbox,
  RotateCcw,
  Sparkles,
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

export type HelpFieldKind = "text" | "money" | "number" | "date" | "select";

export type HelpLink = { label: string; href: string };

/** What the margin shows for a field. */
export type HelpNote = {
  /** One or two plain sentences: what goes in the field. */
  summary: string;
  /** A value "Use example" types into the field. */
  example?: string;
  /** The longer reason, folded under "Why we ask". */
  why?: string;
  /** Further reading, opened in a new tab. */
  links?: HelpLink[];
};

export type HelpOption = { value: string; label: string };

export type HelpField = {
  id: string;
  label: string;
  /** The input the field renders. @default "text" */
  kind?: HelpFieldKind;
  /** Which heading the field sits under; fields with the same section are grouped in order. */
  section?: string;
  placeholder?: string;
  /** Options for a select field. */
  options?: HelpOption[];
  required?: boolean;
  /** The help shown beside the field. Without it, the field has none. */
  help?: HelpNote;
};

/** Field id to its text. A select's text is its option's value. */
export type HelpValues = Record<string, string>;

export type HelpChange = {
  fieldId: string;
  from: string;
  to: string;
  /** Typed by the person, or entered by the help card's example. */
  source: "typed" | "example";
};

export type HelpSide = "right" | "left";
export type HelpCardStyle = "card" | "note" | "plain";
export type HelpDensity = "compact" | "cozy" | "roomy";
export type HelpStatus = "ready" | "loading" | "error";

export type MarginHelpProps = {
  /** The form's fields with their help, in order. @default defaultHelpFields */
  fields?: HelpField[];
  /** Controlled values by field id. */
  value?: HelpValues;
  /** Initial values when uncontrolled. @default defaultHelpValues */
  defaultValue?: HelpValues;
  /** Fires with every value after a keystroke or an example, with the change. */
  onChange?: (value: HelpValues, change: HelpChange) => void;
  /** Continue was pressed and every required field is filled. */
  onSubmit?: (value: HelpValues) => void;
  /** Which margin the help lives in. @default "right" */
  side?: HelpSide;
  /** How a help card is drawn: a raised card, a tinted note, or plain text off a rule. @default "card" */
  cardStyle?: HelpCardStyle;
  /** Field heights, gaps and type size. @default "cozy" */
  density?: HelpDensity;
  /** Whether the form and its help have arrived. @default "ready" */
  status?: HelpStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Tax return 2026" */
  title?: string;
  /** The submit button's text. @default "Continue" */
  submitLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed, entered or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Basinworks' individual return: who is filing, what came in, what went out. */
export const defaultHelpFields: HelpField[] = [
  {
    id: "reference",
    label: "Taxpayer reference",
    section: "About you",
    placeholder: "10 digits",
    required: true,
    help: {
      summary:
        "The ten-digit number printed at the top of every letter Basinworks has sent you. It never changes.",
      example: "4471039261",
      why: "The reference matches this return to your record, so the allowances and payments already on it are applied before anything is worked out.",
      links: [{ label: "Where to find your reference", href: "#" }],
    },
  },
  {
    id: "filing",
    label: "Filing status",
    section: "About you",
    kind: "select",
    required: true,
    options: [
      { value: "", label: "Choose one" },
      { value: "single", label: "Single" },
      { value: "joint", label: "Married, filing jointly" },
      { value: "separate", label: "Married, filing separately" },
      { value: "head", label: "Head of household" },
    ],
    help: {
      summary:
        "How you file sets which allowances and bands apply to the whole return.",
      example: "joint",
      why: "A joint return pools both incomes against one set of allowances, which is usually the lower bill; separate returns keep each person's liability apart.",
    },
  },
  {
    id: "birth",
    label: "Date of birth",
    section: "About you",
    kind: "date",
    placeholder: "DD/MM/YYYY",
    required: true,
    help: {
      summary: "Day, month and year, with the slashes.",
      example: "14/03/1981",
      why: "Some allowances depend on age at the end of the tax year, and a birth date is also how a duplicate return is told from a second person with the same name.",
    },
  },
  {
    id: "employment",
    label: "Employment income",
    section: "Income",
    kind: "money",
    placeholder: "0",
    required: true,
    help: {
      summary:
        "Your total pay before tax, added across every end-of-year statement your employers gave you.",
      example: "48,200",
      why: "Pay is taxed at source, so this figure and the tax already taken from it are compared to find whether you have paid too much or too little.",
      links: [
        { label: "What counts as pay", href: "#" },
        { label: "Reading an end-of-year statement", href: "#" },
      ],
    },
  },
  {
    id: "withheld",
    label: "Tax already paid",
    section: "Income",
    kind: "money",
    placeholder: "0",
    required: true,
    help: {
      summary:
        "The tax your employers took from your pay over the year, from the same statements.",
      example: "7,640",
    },
  },
  {
    id: "interest",
    label: "Savings interest",
    section: "Income",
    kind: "money",
    placeholder: "0",
    help: {
      summary:
        "Interest from every account you hold, before any tax, even where it was small.",
      example: "312",
      why: "The first part of your interest each year is free of tax, but the allowance is worked out across all of it, so every account has to be counted.",
    },
  },
  {
    id: "dividends",
    label: "Dividends",
    section: "Income",
    kind: "money",
    placeholder: "0",
    help: {
      summary:
        "Dividends paid to you from shares or funds held outside a tax-free account.",
      example: "1,150",
    },
  },
  {
    id: "pension",
    label: "Pension contributions",
    section: "Deductions",
    kind: "money",
    placeholder: "0",
    help: {
      summary:
        "What you paid into a personal pension this year, not counting what an employer added.",
      example: "2,400",
      why: "Personal contributions widen the band taxed at the basic rate, which can lower the bill on the rest of your income.",
      links: [{ label: "Which contributions count", href: "#" }],
    },
  },
  {
    id: "charity",
    label: "Gifts to charity",
    section: "Deductions",
    kind: "money",
    placeholder: "0",
    help: {
      summary: "Donations made with a gift declaration, before any top-up.",
      example: "250",
    },
  },
  {
    id: "notes",
    label: "Anything else we should know",
    section: "Deductions",
    placeholder: "Optional",
  },
];

export const defaultHelpValues: HelpValues = {
  reference: "4471039261",
  birth: "14/03/1981",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CARD_GAP = 6;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

type Metrics = {
  field: number;
  gap: number;
  text: number;
  label: number;
  pad: number;
};

const DENSITY: Record<HelpDensity, Metrics> = {
  compact: { field: 30, gap: 10, text: 12, label: 11, pad: 8 },
  cozy: { field: 36, gap: 14, text: 13, label: 12, pad: 10 },
  roomy: { field: 42, gap: 18, text: 14, label: 13, pad: 12 },
};

const isDone = (field: HelpField, values: HelpValues) =>
  (values[field.id] ?? "").trim().length > 0;

/** How many fields hold a value, for hosts that show progress elsewhere. */
export const countHelpDone = (fields: HelpField[], values: HelpValues) =>
  fields.filter((f) => isDone(f, values)).length;

const isHelpKey = (event: React.KeyboardEvent) =>
  event.altKey && (event.key === "/" || event.code === "Slash");

type FieldGeom = { top: number; height: number; left: number; width: number };

type Geom = {
  fields: Record<string, FieldGeom>;
  /** The margin column's place, or null when the container is too narrow for one. */
  margin: { left: number; width: number } | null;
  height: number;
};

type Section = { name: string | undefined; fields: HelpField[] };

const groupFields = (fields: HelpField[]): Section[] => {
  const out: Section[] = [];
  for (const field of fields) {
    const last = out[out.length - 1];
    if (last && last.name === field.section) last.fields.push(field);
    else out.push({ name: field.section, fields: [field] });
  }
  return out;
};

/* ----------------------------------------------------------------------- */
/*                               Progress rail                              */
/* ----------------------------------------------------------------------- */

function Rail({
  fields,
  values,
  motionSafe,
}: {
  fields: HelpField[];
  values: HelpValues;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className="flex h-1.5 w-full items-stretch gap-px overflow-hidden rounded-full"
    >
      {fields.map((field) => {
        const done = isDone(field, values);
        return (
          <span
            key={field.id}
            className="relative min-w-0 flex-1 overflow-hidden bg-surface-2"
          >
            <motion.span
              className="absolute inset-0 bg-cobalt-bright"
              style={{ originX: 0 }}
              initial={false}
              animate={{ scaleX: done ? 1 : 0, opacity: done ? 1 : 0 }}
              transition={
                motionSafe
                  ? done
                    ? { ...springs.recoil, opacity: { duration: 0 } }
                    : {
                        ...exitFor(durations.fast),
                        opacity: exitFor(durations.fast),
                      }
                  : {
                      scaleX: { duration: 0 },
                      opacity: { duration: durations.fast },
                    }
              }
            />
          </span>
        );
      })}
    </span>
  );
}

function Count({
  done,
  total,
  motionSafe,
}: {
  done: number;
  total: number;
  motionSafe: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1 text-[12px] whitespace-nowrap text-ink-2">
      <span className="sr-only">
        {done} of {total} fields done
      </span>
      <span
        aria-hidden
        className="relative inline-block h-[1.25em] w-[2ch] overflow-hidden text-right font-mono text-[13px] text-foreground tabular-nums"
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={done}
            className="absolute inset-0 text-right"
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: motionSafe ? -distances.nudge : 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            {done}
          </motion.span>
        </AnimatePresence>
      </span>
      <span aria-hidden>of {total}</span>
      <span aria-hidden className="hidden @min-[24rem]:inline">
        done
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Field                                  */
/* ----------------------------------------------------------------------- */

function DoneTick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 text-success">
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

type FieldRowProps = {
  field: HelpField;
  value: string;
  /** Text shown instead of the value while an example is typed in. */
  shown: string | null;
  metrics: Metrics;
  active: boolean;
  done: boolean;
  invalid: boolean;
  disabled: boolean;
  motionSafe: boolean;
  uid: string;
  wrapRef: (node: HTMLDivElement | null) => void;
  inputRef: (node: HTMLInputElement | HTMLSelectElement | null) => void;
  onInput: (text: string) => void;
  onFocus: () => void;
  onBlur: (event: React.FocusEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
};

function FieldRow({
  field,
  value,
  shown,
  metrics,
  active,
  done,
  invalid,
  disabled,
  motionSafe,
  uid,
  wrapRef,
  inputRef,
  onInput,
  onFocus,
  onBlur,
  onKeyDown,
}: FieldRowProps) {
  const inputId = `${uid}-f-${field.id}`;
  const descId = `${uid}-d-${field.id}`;
  const errId = `${uid}-e-${field.id}`;
  const kind = field.kind ?? "text";
  const described =
    [field.help ? descId : null, invalid ? errId : null]
      .filter(Boolean)
      .join(" ") || undefined;
  const text = shown ?? value;
  const boxClass = cn(
    "relative flex w-full items-center rounded-2 border bg-surface-0 transition-colors duration-200",
    invalid
      ? "border-danger"
      : active
        ? "border-cobalt-bright"
        : "border-hairline-strong hover:border-ink-3/50",
    disabled && "opacity-60",
  );
  const controlClass = cn(
    "size-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-ink-3",
    // The ring sits on the box's own edge: one line, not a border and a ring.
    "rounded-2 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring focus-visible:outline-solid",
    disabled && "cursor-not-allowed",
  );

  return (
    <div ref={wrapRef} data-field={field.id} className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            "min-w-0 truncate font-medium transition-colors duration-200",
            active ? "text-cobalt-bright" : "text-ink",
          )}
          style={{ fontSize: metrics.label }}
        >
          {field.label}
          {field.required ? (
            <span aria-hidden className="ml-1 text-ink-3">
              *
            </span>
          ) : null}
        </label>
        {field.help ? (
          <span
            aria-hidden
            className={cn(
              "flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-[0.08em] uppercase transition-colors duration-200",
              active ? "text-cobalt-bright" : "text-ink-3",
            )}
          >
            <CircleHelp className="size-3" />
            <span className="hidden @min-[30rem]:inline">Alt+/</span>
          </span>
        ) : null}
      </div>
      {field.help ? (
        <span id={descId} className="sr-only">
          {field.help.summary} Press Alt and slash for help.
        </span>
      ) : null}
      <div className={boxClass} style={{ height: metrics.field }}>
        {kind === "money" ? (
          <span
            aria-hidden
            className="shrink-0 font-mono text-ink-3 select-none"
            style={{ paddingLeft: metrics.pad, fontSize: metrics.text }}
          >
            $
          </span>
        ) : null}
        {kind === "select" ? (
          <select
            ref={inputRef}
            id={inputId}
            value={value}
            disabled={disabled}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={described}
            onChange={(event) => onInput(event.currentTarget.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            className={cn(controlClass, "appearance-none")}
            style={{
              paddingLeft: metrics.pad,
              paddingRight: metrics.pad + 22,
              fontSize: metrics.text,
            }}
          >
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={text}
            placeholder={field.placeholder}
            disabled={disabled}
            required={field.required}
            inputMode={
              kind === "money" || kind === "number"
                ? "decimal"
                : kind === "date"
                  ? "numeric"
                  : undefined
            }
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-describedby={described}
            onChange={(event) => onInput(event.currentTarget.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            className={cn(
              controlClass,
              (kind === "money" || kind === "number" || kind === "date") &&
                "font-mono tabular-nums",
            )}
            style={{
              paddingLeft: kind === "money" ? 4 : metrics.pad,
              paddingRight: metrics.pad + 20,
              fontSize: metrics.text,
            }}
          />
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center"
          style={{ paddingRight: metrics.pad }}
        >
          {kind === "select" ? (
            <ChevronDown className="size-3.5 text-ink-3" />
          ) : done && shown === null ? (
            <DoneTick motionSafe={motionSafe} />
          ) : null}
        </span>
      </div>
      <AnimatePresence initial={false}>
        {invalid ? (
          <motion.p
            key="err"
            id={errId}
            initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.snap, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            className="text-[11px] text-danger"
          >
            Needed before you continue.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Help card                                */
/* ----------------------------------------------------------------------- */

type CardBodyProps = {
  field: HelpField;
  help: HelpNote;
  value: string;
  whyOpen: boolean;
  onToggleWhy: () => void;
  onUseExample: () => void;
  disabled: boolean;
  typing: boolean;
  motionSafe: boolean;
  metrics: Metrics;
  plain: boolean;
};

function CardBody({
  field,
  help,
  value,
  whyOpen,
  onToggleWhy,
  onUseExample,
  disabled,
  typing,
  motionSafe,
  metrics,
  plain,
}: CardBodyProps) {
  const exampleLabel =
    field.kind === "select"
      ? (field.options?.find((o) => o.value === help.example)?.label ??
        help.example)
      : help.example;
  const used = help.example !== undefined && value === help.example;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {field.label}
      </p>
      <p
        className={cn("leading-snug", plain ? "text-ink-2" : "text-foreground")}
        style={{ fontSize: metrics.text }}
      >
        {help.summary}
      </p>

      {help.example !== undefined ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[11px] text-ink-3">e.g.</span>
            <span
              className={cn(
                "min-w-0 truncate font-mono text-[12px] tabular-nums",
                used ? "text-success" : "text-foreground",
              )}
            >
              {exampleLabel}
            </span>
          </span>
          <motion.button
            type="button"
            onClick={onUseExample}
            aria-disabled={disabled || typing || used || undefined}
            whileTap={!disabled && !typing && !used ? { scale: 0.96 } : {}}
            transition={springs.flick}
            className={cn(
              "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors",
              used
                ? "border-transparent bg-surface-2 text-ink-3"
                : disabled || typing
                  ? "border-hairline text-ink-3"
                  : "border-[color-mix(in_oklab,var(--accent-bright)_40%,transparent)] bg-cobalt-wash text-cobalt-bright hover:border-cobalt-bright",
              FOCUS_RING,
            )}
          >
            <Sparkles aria-hidden className="size-3" />
            {used ? "Used" : typing ? "Typing" : "Use example"}
          </motion.button>
        </div>
      ) : null}

      {help.why ? (
        <div className="flex flex-col">
          <button
            type="button"
            aria-expanded={whyOpen}
            onClick={onToggleWhy}
            className={cn(
              "-mx-1 inline-flex h-6 w-max items-center gap-1 rounded-2 px-1 text-[11px] font-medium text-ink-2 transition-colors hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <motion.span
              aria-hidden
              className="flex"
              initial={false}
              animate={{ rotate: whyOpen ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronDown className="size-3.5" />
            </motion.span>
            Why we ask
          </button>
          <motion.div
            initial={false}
            animate={{
              height: whyOpen ? "auto" : 0,
              opacity: whyOpen ? 1 : 0,
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.fast },
                  }
                : {
                    height: { duration: 0 },
                    opacity: { duration: durations.fast },
                  }
            }
            className="overflow-hidden"
            aria-hidden={!whyOpen}
          >
            <p
              className="pt-1 pb-0.5 leading-snug text-ink-2"
              style={{ fontSize: metrics.text - 1 }}
            >
              {help.why}
            </p>
          </motion.div>
        </div>
      ) : null}

      {help.links && help.links.length > 0 ? (
        <ul
          role="list"
          className="flex flex-col gap-1 border-t border-hairline pt-2"
        >
          {help.links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex items-center gap-1 rounded-1 text-[11px] text-cobalt-bright hover:underline",
                  FOCUS_RING,
                )}
              >
                {link.label}
                <ArrowUpRight aria-hidden className="size-3" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const cardClass = (style: HelpCardStyle, mode: "margin" | "below") => {
  if (mode === "below") {
    return cn(
      "rounded-3 border p-3.5 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]",
      style === "note"
        ? "border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,var(--popover))]"
        : "border-hairline-strong bg-popover",
    );
  }
  if (style === "note") {
    return "rounded-2 border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,var(--bg-1))] p-3.5";
  }
  if (style === "plain") return "py-1";
  return "rounded-3 border border-hairline-strong bg-popover p-3.5 shadow-[0_10px_28px_-16px_color-mix(in_oklab,black_40%,transparent)]";
};

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Typing = { id: string; text: string; timer: number };

/**
 * A form whose help lives in the margin. Focusing a field slides its help
 * card in beside it on `springs.glide`; move to the next field and the card
 * glides down the margin to sit level with it, its contents cross-fading as
 * it goes, and it slides back out when focus leaves the form. The card
 * carries an example value with a Use example button that types the value
 * into the field one character at a time, timed by `cascade` so the whole
 * value lands inside 600ms; the field's tick draws on `springs.flick` and the
 * progress rail's segment fills on `springs.recoil`. "Why we ask" unfolds on
 * `springs.glide` height, its chevron turning on `springs.snap`.
 *
 * Below a 40rem container there is no margin: the same card opens as a
 * popover beneath the field instead, and the form scrolls to keep it in
 * view. A form with no help at all is just the fields, one column.
 *
 * The form is native: Tab moves between fields, Alt+/ moves into the focused
 * field's help card, Escape returns to the field, and every example, fold
 * and send is announced. Under reduced motion nothing slides: the card
 * cross-fades into place, the example appears whole, and the fold swaps
 * without height.
 */
export function MarginHelp({
  fields = defaultHelpFields,
  value,
  defaultValue = defaultHelpValues,
  onChange,
  onSubmit,
  side = "right",
  cardStyle = "card",
  density = "cozy",
  status = "ready",
  onRetry,
  title = "Tax return 2026",
  submitLabel = "Continue",
  label,
  height = 540,
  disabled = false,
  className,
}: MarginHelpProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const cardId = `${uid}-card`;
  const metrics = DENSITY[density] ?? DENSITY.cozy;

  const [own, setOwn] = React.useState<HelpValues>(defaultValue);
  const current = value ?? own;
  // Handlers that fire from a timer read the latest values from here.
  const currentRef = React.useRef(current);
  React.useEffect(() => {
    currentRef.current = current;
  });
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [whyOpen, setWhyOpen] = React.useState<string | null>(null);
  const [shown, setShown] = React.useState<{ id: string; text: string } | null>(
    null,
  );
  const [submitted, setSubmitted] = React.useState(false);
  const [geom, setGeom] = React.useState<Geom | null>(null);
  const [cardH, setCardH] = React.useState(0);
  const [cardEl, setCardEl] = React.useState<HTMLDivElement | null>(null);
  const [focusCard, setFocusCard] = React.useState(0);
  const [announcement, setAnnouncement] = React.useState("");

  const gridRef = React.useRef<HTMLDivElement | null>(null);
  const marginRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const wrapNodes = React.useRef(new Map<string, HTMLDivElement>());
  const inputNodes = React.useRef(
    new Map<string, HTMLInputElement | HTMLSelectElement>(),
  );
  const typing = React.useRef<Typing | null>(null);

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(fields.map((f) => [f.id, f]));
  const hasHelp = fields.some((f) => f.help !== undefined);
  const done = countHelpDone(fields, current);
  const total = fields.length;
  const sections = groupFields(fields);
  const activeField = activeId ? byId.get(activeId) : undefined;
  const activeHelp = activeField?.help;

  /* ----------------------------- measuring ----------------------------- */

  React.useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next: Geom = {
        fields: {},
        margin: null,
        height: grid.clientHeight,
      };
      wrapNodes.current.forEach((node, id) => {
        next.fields[id] = {
          top: node.offsetTop,
          height: node.offsetHeight,
          left: node.offsetLeft,
          width: node.offsetWidth,
        };
      });
      const margin = marginRef.current;
      if (margin && margin.offsetWidth > 0) {
        next.margin = { left: margin.offsetLeft, width: margin.offsetWidth };
      }
      setGeom(next);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    return () => ro.disconnect();
    // Re-observes when the form's shape changes, so the measure runs again.
  }, [status, density, side, fields]);

  React.useEffect(() => {
    if (!cardEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCardH(cardEl.offsetHeight));
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [cardEl]);

  const fieldGeom = activeId && geom ? geom.fields[activeId] : undefined;
  const mode: "margin" | "below" = geom?.margin ? "margin" : "below";
  const pos =
    fieldGeom && geom
      ? geom.margin
        ? {
            top: clamp(fieldGeom.top, 0, Math.max(0, geom.height - cardH - 16)),
            left: geom.margin.left,
            width: geom.margin.width,
          }
        : {
            top: fieldGeom.top + fieldGeom.height + CARD_GAP,
            left: fieldGeom.left,
            width: fieldGeom.width,
          }
      : null;
  const cardOpen = Boolean(activeField && activeHelp && pos && ready);

  // A popover beneath a field near the bottom scrolls into view.
  const popTop = mode === "below" && cardOpen && pos ? pos.top : null;
  React.useEffect(() => {
    if (popTop === null || cardH === 0) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const bottom = popTop + cardH + 16;
    const visible = scroller.scrollTop + scroller.clientHeight;
    if (bottom > visible) {
      scroller.scrollTo({
        top: bottom - scroller.clientHeight,
        behavior: motionSafe ? "smooth" : "auto",
      });
    }
  }, [popTop, cardH, motionSafe]);

  // Alt+/ asked for the card: focus it once it is on the page.
  React.useLayoutEffect(() => {
    if (focusCard === 0 || !cardEl) return;
    cardEl.focus({ preventScroll: true });
  }, [focusCard, cardEl]);

  React.useEffect(
    () => () => {
      if (typing.current) window.clearTimeout(typing.current.timer);
    },
    [],
  );

  /* ------------------------------- changes ----------------------------- */

  const commit = (id: string, to: string, source: HelpChange["source"]) => {
    const base = currentRef.current;
    const from = base[id] ?? "";
    if (from === to) return;
    const next = { ...base, [id]: to };
    if (value === undefined) setOwn(next);
    currentRef.current = next;
    onChange?.(next, { fieldId: id, from, to, source });
    return next;
  };

  /** Lands an example that is still typing: a keystroke never waits for it. */
  const flushTyping = () => {
    const t = typing.current;
    if (!t) return;
    window.clearTimeout(t.timer);
    typing.current = null;
    setShown(null);
    commit(t.id, t.text, "example");
  };

  const announceExample = (
    field: HelpField,
    text: string,
    next: HelpValues,
  ) => {
    const shownText =
      field.kind === "select"
        ? (field.options?.find((o) => o.value === text)?.label ?? text)
        : text;
    const n = countHelpDone(fields, next);
    setAnnouncement(
      `Example used: ${shownText} entered in ${field.label}. ${n} of ${total} done.`,
    );
  };

  const enterExample = (field: HelpField) => {
    const text = field.help?.example;
    if (inert || text === undefined) return;
    flushTyping();
    const input = inputNodes.current.get(field.id);
    input?.focus({ preventScroll: true });
    if (field.kind === "select" || !motionSafe || text.length < 2) {
      const next = commit(field.id, text, "example") ?? currentRef.current;
      announceExample(field, text, next);
      return;
    }
    const step = Math.round(cascade(text.length) * 1000);
    let i = 0;
    const tick = () => {
      i += 1;
      if (i >= text.length) {
        typing.current = null;
        setShown(null);
        const next = commit(field.id, text, "example") ?? currentRef.current;
        announceExample(field, text, next);
        return;
      }
      setShown({ id: field.id, text: text.slice(0, i) });
      if (typing.current) typing.current.timer = window.setTimeout(tick, step);
    };
    setShown({ id: field.id, text: "" });
    typing.current = {
      id: field.id,
      text,
      timer: window.setTimeout(tick, step),
    };
  };

  const toggleWhy = (field: HelpField) => {
    const open = whyOpen !== field.id;
    setWhyOpen(open ? field.id : null);
    setAnnouncement(
      open
        ? `Why we ask, ${field.label}: ${field.help?.why ?? ""}`
        : `Why we ask folded, ${field.label}.`,
    );
  };

  /* ------------------------------- focus ------------------------------- */

  const isField = (node: EventTarget | null) => {
    if (!node) return false;
    for (const input of inputNodes.current.values()) {
      if (input === node) return true;
    }
    return false;
  };

  const leaveUnless = (next: EventTarget | null) => {
    if (cardEl && next instanceof Node && cardEl.contains(next)) return;
    if (isField(next)) return;
    setActiveId(null);
    setWhyOpen(null);
  };

  const onFieldKey = (event: React.KeyboardEvent, field: HelpField) => {
    if (isHelpKey(event)) {
      event.preventDefault();
      if (!field.help) {
        setAnnouncement(
          hasHelp
            ? `No help for ${field.label}.`
            : "No help is available for this form.",
        );
        return;
      }
      setActiveId(field.id);
      setFocusCard((n) => n + 1);
      setAnnouncement(`Help for ${field.label}. Escape returns to the field.`);
    }
  };

  const onCardKey = (event: React.KeyboardEvent) => {
    if (event.key !== "Escape" || !activeId) return;
    event.preventDefault();
    event.stopPropagation();
    inputNodes.current.get(activeId)?.focus({ preventScroll: true });
  };

  /* -------------------------------- submit ----------------------------- */

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (inert) return;
    flushTyping();
    setSubmitted(true);
    const missing = fields.filter(
      (f) => f.required && !isDone(f, currentRef.current),
    );
    const first = missing[0];
    if (first) {
      setAnnouncement(
        `${missing.length} required ${missing.length === 1 ? "field is" : "fields are"} empty. First: ${first.label}.`,
      );
      inputNodes.current.get(first.id)?.focus();
      return;
    }
    onSubmit?.(currentRef.current);
    setAnnouncement(
      `Sent with ${countHelpDone(fields, currentRef.current)} of ${total} fields filled.`,
    );
  };

  /* ------------------------------- render ------------------------------ */

  const enterX =
    mode === "margin" && motionSafe
      ? side === "right"
        ? distances.shift
        : -distances.shift
      : 0;
  const cardKey =
    mode === "margin" && motionSafe ? "card" : `${mode}-${activeId ?? ""}`;
  const plain = cardStyle === "plain" && mode === "margin";
  const step = cascade(Math.min(total, 10));

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
      <header className="flex shrink-0 flex-col gap-2 border-b border-hairline px-4 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {ready && total > 0 ? (
            <Count done={done} total={total} motionSafe={motionSafe} />
          ) : null}
        </div>
        {ready && total > 0 ? (
          <Rail fields={fields} values={current} motionSafe={motionSafe} />
        ) : (
          <span
            aria-hidden
            className="h-1.5 w-full rounded-full bg-surface-2"
          />
        )}
      </header>

      <div
        ref={scrollRef}
        className="relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The form didn&apos;t load.
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
          <div
            aria-hidden
            className="grid grid-cols-1 gap-x-6 px-4 py-4 @min-[40rem]:grid-cols-[minmax(0,1fr)_15rem]"
          >
            <div className="flex flex-col" style={{ gap: metrics.gap }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <span
                    className="h-3 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${34 + ((i * 29) % 40)}%`,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                  <span
                    className="w-full rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      height: metrics.field,
                      animationDelay: `${i * 90 + 40}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div
              className={cn(
                "hidden @min-[40rem]:block",
                side === "left" && "@min-[40rem]:order-first",
              )}
            >
              <span
                className="block h-28 rounded-3 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: "120ms" }}
              />
            </div>
          </div>
        ) : total === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">This form has no fields yet.</p>
          </div>
        ) : (
          <div
            ref={gridRef}
            className={cn(
              "relative grid grid-cols-1 gap-x-6 px-4 py-4",
              hasHelp && "@min-[40rem]:grid-cols-[minmax(0,1fr)_15rem]",
            )}
          >
            <form
              onSubmit={submit}
              noValidate
              className="flex min-w-0 flex-col"
              style={{ gap: metrics.gap }}
            >
              {sections.map((section, s) => (
                <React.Fragment key={`${s}-${section.name ?? ""}`}>
                  {section.name ? (
                    <p
                      className={cn(
                        "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                        s > 0 && "pt-1",
                      )}
                    >
                      {section.name}
                    </p>
                  ) : null}
                  {section.fields.map((field) => {
                    const i = fields.indexOf(field);
                    return (
                      <motion.div
                        key={field.id}
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.nudge : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          y: motionSafe
                            ? {
                                ...springs.glide,
                                delay: r3(Math.min(i, 10) * step),
                              }
                            : { duration: 0 },
                          opacity: {
                            duration: durations.base,
                            ease: easings.enter,
                            delay: motionSafe ? r3(Math.min(i, 10) * step) : 0,
                          },
                        }}
                      >
                        <FieldRow
                          field={field}
                          value={current[field.id] ?? ""}
                          shown={shown?.id === field.id ? shown.text : null}
                          metrics={metrics}
                          active={activeId === field.id}
                          done={isDone(field, current)}
                          invalid={
                            submitted &&
                            Boolean(field.required) &&
                            !isDone(field, current)
                          }
                          disabled={inert}
                          motionSafe={motionSafe}
                          uid={uid}
                          wrapRef={(node) => {
                            if (node) wrapNodes.current.set(field.id, node);
                            else wrapNodes.current.delete(field.id);
                          }}
                          inputRef={(node) => {
                            if (node) inputNodes.current.set(field.id, node);
                            else inputNodes.current.delete(field.id);
                          }}
                          onInput={(text) => {
                            if (typing.current?.id === field.id) {
                              window.clearTimeout(typing.current.timer);
                              typing.current = null;
                              setShown(null);
                            }
                            commit(field.id, text, "typed");
                          }}
                          onFocus={() => setActiveId(field.id)}
                          onBlur={(event) => leaveUnless(event.relatedTarget)}
                          onKeyDown={(event) => onFieldKey(event, field)}
                        />
                      </motion.div>
                    );
                  })}
                </React.Fragment>
              ))}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  {hasHelp ? "Alt+/ opens help" : "No help on this form"}
                </span>
                <motion.button
                  type="submit"
                  aria-disabled={inert || undefined}
                  whileTap={inert ? {} : { scale: 0.97 }}
                  transition={springs.flick}
                  className={cn(
                    "inline-flex h-8 items-center rounded-2 px-3.5 text-xs font-medium transition-colors",
                    inert
                      ? "cursor-not-allowed bg-surface-2 text-ink-3"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                    FOCUS_RING,
                  )}
                >
                  {submitLabel}
                </motion.button>
              </div>
            </form>

            {/* The margin: an empty column the card is laid over, measured
                so the card knows where the margin is and whether there is one. */}
            {hasHelp ? (
              <div
                ref={marginRef}
                aria-hidden
                className={cn(
                  "hidden min-w-0 @min-[40rem]:block",
                  side === "left" && "@min-[40rem]:order-first",
                )}
              />
            ) : null}

            <AnimatePresence initial={false}>
              {cardOpen && activeField && activeHelp && pos ? (
                <motion.div
                  key={cardKey}
                  ref={setCardEl}
                  id={cardId}
                  role="group"
                  aria-label={`Help for ${activeField.label}`}
                  tabIndex={-1}
                  onKeyDown={onCardKey}
                  onBlur={(event) => {
                    const next = event.relatedTarget as Node | null;
                    if (next && event.currentTarget.contains(next)) return;
                    leaveUnless(next);
                  }}
                  initial={{
                    opacity: 0,
                    x: enterX,
                    y:
                      pos.top +
                      (mode === "below" && motionSafe ? -distances.nudge : 0),
                  }}
                  animate={{ opacity: 1, x: 0, y: pos.top }}
                  exit={{
                    opacity: 0,
                    x: enterX,
                    transition: exitFor(durations.base),
                  }}
                  transition={
                    motionSafe
                      ? {
                          ...(mode === "margin" ? springs.glide : springs.snap),
                          opacity: { duration: durations.fast },
                        }
                      : {
                          x: { duration: 0 },
                          y: { duration: 0 },
                          opacity: { duration: durations.fast },
                        }
                  }
                  style={{ top: 0, left: pos.left, width: pos.width }}
                  className={cn(
                    "absolute z-20",
                    FOCUS_RING,
                    plain &&
                      cn(
                        "border-hairline-strong pl-3.5",
                        side === "right"
                          ? "border-l-2"
                          : "border-r-2 pr-3.5 pl-0",
                      ),
                    cardClass(cardStyle, mode),
                  )}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.div
                      key={activeField.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{
                        duration: durations.fast,
                        ease: easings.enter,
                      }}
                    >
                      <CardBody
                        field={activeField}
                        help={activeHelp}
                        value={current[activeField.id] ?? ""}
                        whyOpen={whyOpen === activeField.id}
                        onToggleWhy={() => toggleWhy(activeField)}
                        onUseExample={() => enterExample(activeField)}
                        disabled={inert}
                        typing={shown?.id === activeField.id}
                        motionSafe={motionSafe}
                        metrics={metrics}
                        plain={plain}
                      />
                    </motion.div>
                  </AnimatePresence>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
