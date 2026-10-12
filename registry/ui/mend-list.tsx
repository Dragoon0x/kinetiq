"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  Inbox,
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

export type MendFieldKind = "text" | "email" | "tel" | "select" | "textarea";

export type MendOption = { value: string; label: string };

export type MendField = {
  id: string;
  label: string;
  /** What the field is: a text line, an email or phone line, a select or a textarea. @default "text" */
  kind?: MendFieldKind;
  placeholder?: string;
  /** A short line under the field. */
  hint?: string;
  /** Empty is a problem. @default false */
  required?: boolean;
  /** The choices of a select; the first empty value is its prompt. */
  options?: MendOption[];
  autoComplete?: string;
  /** Takes half a row from a 36rem container. @default false */
  half?: boolean;
};

export type MendSection = {
  id: string;
  title: string;
  description?: string;
  fields: MendField[];
};

/** Field id to its text. Selects carry their option's value. */
export type MendValue = Record<string, string>;

export type MendProblem = { fieldId: string; message: string };

/**
 * Runs on a non-empty value after the built-in checks (required, email
 * shape, phone digits) have passed. Returns the message, or null when fine.
 */
export type MendValidator = (
  value: string,
  field: MendField,
  all: MendValue,
) => string | null;

export type MendValidators = Record<string, MendValidator>;

export type MendSubmitResult = { reference?: string } | void;

export type MendStatus = "ready" | "loading" | "error";
export type MendSummaryPosition = "top" | "side";
export type MendDensity = "compact" | "cozy" | "roomy";
export type MendTone = "danger" | "warn";

export type MendListProps = {
  /** Where the summary raises: over the form, or in the rail's column beside it from a 40rem container. @default "top" */
  summaryPosition?: MendSummaryPosition;
  /** Field heights, type size and the space between rows. @default "cozy" */
  density?: MendDensity;
  /** The colour problems are drawn in: red or amber. @default "danger" */
  tone?: MendTone;
  /** The sections and their fields, in form order. @default defaultMendSections */
  sections?: MendSection[];
  /** Controlled values by field id. */
  value?: MendValue;
  /** Initial values when uncontrolled. @default defaultMendValue */
  defaultValue?: MendValue;
  /** Fires on every keystroke and choice with all values and the field that changed; null when the form was reset. */
  onChange?: (value: MendValue, fieldId: string | null) => void;
  /** Extra checks by field id, run on non-empty values after the built-in ones. @default defaultMendValidators */
  validators?: MendValidators;
  /** Submit was pressed with nothing left to mend. Resolve to reach the success state, with a reference to show. @default defaultMendSubmit */
  onSubmit?: (value: MendValue) => Promise<MendSubmitResult> | MendSubmitResult;
  /** Fires whenever the set of fields in error changes, in form order. */
  onProblemsChange?: (problems: MendProblem[]) => void;
  /** Whether the form has arrived. @default "ready" */
  status?: MendStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Merchant application" */
  title?: string;
  /** The submit button's text. @default "Submit application" */
  submitLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be typed or submitted. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** A Gaugeworks Pay merchant application: business, contact and payout. */
export const defaultMendSections: MendSection[] = [
  {
    id: "business",
    title: "Business",
    description: "The legal entity that will receive payouts.",
    fields: [
      {
        id: "legalName",
        label: "Legal name",
        required: true,
        placeholder: "Coldbrook Roasters Ltd",
        autoComplete: "organization",
      },
      {
        id: "tradingName",
        label: "Trading name",
        placeholder: "Coldbrook",
        hint: "What customers see on their statement.",
        half: true,
      },
      {
        id: "taxId",
        label: "Tax ID",
        required: true,
        placeholder: "12-3456789",
        hint: "Nine digits, as issued.",
        half: true,
      },
      {
        id: "website",
        label: "Website",
        placeholder: "coldbrook.coffee",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    description: "Who we write to about this account.",
    fields: [
      {
        id: "contactName",
        label: "Contact name",
        required: true,
        placeholder: "Mara Lind",
        autoComplete: "name",
      },
      {
        id: "email",
        label: "Email",
        kind: "email",
        required: true,
        placeholder: "mara@coldbrook.coffee",
        autoComplete: "email",
        half: true,
      },
      {
        id: "phone",
        label: "Phone",
        kind: "tel",
        required: true,
        placeholder: "+44 20 7946 0331",
        autoComplete: "tel",
        half: true,
      },
      {
        id: "country",
        label: "Country",
        kind: "select",
        required: true,
        options: [
          { value: "", label: "Choose a country" },
          { value: "gb", label: "United Kingdom" },
          { value: "ie", label: "Ireland" },
          { value: "nl", label: "Netherlands" },
          { value: "de", label: "Germany" },
          { value: "pt", label: "Portugal" },
        ],
      },
    ],
  },
  {
    id: "payout",
    title: "Payout",
    description: "The account settlements are paid into.",
    fields: [
      {
        id: "accountName",
        label: "Account name",
        required: true,
        placeholder: "Coldbrook Roasters Ltd",
      },
      {
        id: "accountNumber",
        label: "Account number",
        required: true,
        placeholder: "33104428",
        hint: "Eight digits.",
        half: true,
      },
      {
        id: "sortCode",
        label: "Sort code",
        required: true,
        placeholder: "20-41-73",
        half: true,
      },
      {
        id: "volume",
        label: "Expected monthly volume",
        kind: "select",
        required: true,
        options: [
          { value: "", label: "Choose a range" },
          { value: "lt10k", label: "Under 10,000" },
          { value: "10k", label: "10,000 to 50,000" },
          { value: "50k", label: "50,000 to 250,000" },
          { value: "250k", label: "Over 250,000" },
        ],
      },
      {
        id: "notes",
        label: "Notes for the reviewer",
        kind: "textarea",
        placeholder: "Anything that helps us review faster.",
      },
    ],
  },
];

/** Half filled, with six fields that will not pass. */
export const defaultMendValue: MendValue = {
  legalName: "Coldbrook Roasters Ltd",
  tradingName: "Coldbrook",
  taxId: "48-21",
  website: "coldbrook.coffee",
  contactName: "",
  email: "mara@coldbrook",
  phone: "+44 20 7946 0331",
  country: "gb",
  accountName: "Coldbrook Roasters Ltd",
  accountNumber: "3310",
  sortCode: "20-41-7",
  volume: "",
  notes: "",
};

export const defaultMendValidators: MendValidators = {
  taxId: (v) =>
    /^\d{2}-\d{7}$/.test(v.trim())
      ? null
      : "Tax ID is nine digits, written 12-3456789.",
  website: (v) =>
    /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(v.trim())
      ? null
      : "Website should look like coldbrook.coffee.",
  accountNumber: (v) =>
    /^\d{8}$/.test(v.replace(/\s/g, ""))
      ? null
      : "Account number is eight digits.",
  sortCode: (v) =>
    /^\d{2}-\d{2}-\d{2}$/.test(v.trim())
      ? null
      : "Sort code is six digits, written 20-41-73.",
};

const hashOf = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 90000;
};

/** Resolves after 900ms with a reference drawn from the values. */
export const defaultMendSubmit = (
  value: MendValue,
): Promise<MendSubmitResult> =>
  new Promise((resolve) => {
    window.setTimeout(
      () =>
        resolve({
          reference: `GP-${String(10000 + hashOf(JSON.stringify(value)))}`,
        }),
      900,
    );
  });

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const TONES: Record<MendTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
};

const DENSITY: Record<
  MendDensity,
  {
    control: string;
    area: string;
    label: string;
    rows: string;
    section: string;
    pad: string;
  }
> = {
  compact: {
    control: "h-8 px-2.5 text-[12px]",
    area: "min-h-16 px-2.5 py-1.5 text-[12px]",
    label: "text-[11px]",
    rows: "gap-x-3 gap-y-2.5",
    section: "gap-5",
    pad: "px-4 py-3",
  },
  cozy: {
    control: "h-9 px-3 text-[13px]",
    area: "min-h-20 px-3 py-2 text-[13px]",
    label: "text-[12px]",
    rows: "gap-x-3 gap-y-3.5",
    section: "gap-6",
    pad: "px-4 py-4",
  },
  roomy: {
    control: "h-10 px-3.5 text-[14px]",
    area: "min-h-24 px-3.5 py-2.5 text-[14px]",
    label: "text-[13px]",
    rows: "gap-x-4 gap-y-4",
    section: "gap-8",
    pad: "px-5 py-5",
  },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
/** How long a mended item stays struck through before it leaves. */
const MEND_MS = 420;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const plural = (n: number, one: string, other: string) =>
  n === 1 ? one : other;

/** The built-in checks, then the host's validator on what is left. */
export const validateMendField = (
  field: MendField,
  raw: string,
  all: MendValue,
  validators: MendValidators,
): string | null => {
  const v = raw.trim();
  if (!v) return field.required ? `${field.label} is required.` : null;
  if (field.kind === "email" && !EMAIL.test(v)) {
    return `${field.label} needs an address like name@company.com.`;
  }
  if (field.kind === "tel" && v.replace(/\D/g, "").length < 7) {
    return `${field.label} needs at least seven digits.`;
  }
  return validators[field.id]?.(raw, field, all) ?? null;
};

/** Every problem the form would raise now, in form order, for hosts. */
export const countMendProblems = (
  sections: MendSection[],
  value: MendValue,
  validators: MendValidators = defaultMendValidators,
): MendProblem[] => {
  const out: MendProblem[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      const message = validateMendField(
        field,
        value[field.id] ?? "",
        value,
        validators,
      );
      if (message) out.push({ fieldId: field.id, message });
    }
  }
  return out;
};

type SummaryItem = MendProblem & { mended: boolean };
type Phase = "form" | "submitting" | "done";

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
/*                                   Field                                  */
/* ----------------------------------------------------------------------- */

type FieldRowProps = {
  field: MendField;
  uid: string;
  value: string;
  error: string | undefined;
  density: MendDensity;
  inert: boolean;
  flashSeq: number | null;
  motionSafe: boolean;
  wrapRef: (node: HTMLDivElement | null) => void;
  inputRef: (
    node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null,
  ) => void;
  onChange: (next: string) => void;
  onCommit: () => void;
  onFocus: () => void;
  onFlashDone: (seq: number) => void;
};

function FieldRow({
  field,
  uid,
  value,
  error,
  density,
  inert,
  flashSeq,
  motionSafe,
  wrapRef,
  inputRef,
  onChange,
  onCommit,
  onFocus,
  onFlashDone,
}: FieldRowProps) {
  const id = `${uid}-f-${field.id}`;
  const msgId = `${id}-msg`;
  const hintId = `${id}-hint`;
  const kind = field.kind ?? "text";
  const d = DENSITY[density];
  const describedBy =
    [error ? msgId : null, field.hint ? hintId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  const controlClass = cn(
    "w-full rounded-2 border bg-surface-0 text-foreground transition-colors placeholder:text-ink-3",
    error
      ? "border-(--ml-err)"
      : "border-hairline-strong hover:border-ink-3 focus-visible:border-hairline-strong",
    inert && "cursor-not-allowed opacity-70",
    FOCUS_RING,
  );

  const shared = {
    id,
    name: field.id,
    value,
    disabled: inert,
    "data-field": field.id,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
    "aria-required": field.required || undefined,
    onFocus,
    onBlur: onCommit,
  };

  return (
    <div
      ref={wrapRef}
      data-field-wrap={field.id}
      className={cn(
        "relative flex min-w-0 flex-col gap-1.5",
        !field.half && "@min-[36rem]:col-span-2",
      )}
    >
      <AnimatePresence>
        {flashSeq !== null ? (
          <motion.span
            key={flashSeq}
            aria-hidden
            className="pointer-events-none absolute -inset-x-2 -inset-y-1.5 rounded-3 bg-cobalt-wash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: motionSafe ? durations.page : durations.slow,
              times: [0, 0.18, 1],
              ease: easings.exit,
            }}
            onAnimationComplete={() => onFlashDone(flashSeq)}
          />
        ) : null}
      </AnimatePresence>
      <label
        htmlFor={id}
        className={cn(
          "relative flex items-baseline justify-between gap-2 font-medium text-ink-2",
          d.label,
        )}
      >
        <span className="truncate">{field.label}</span>
        {!field.required ? (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            optional
          </span>
        ) : null}
      </label>
      <div className="relative">
        {kind === "select" ? (
          <>
            <select
              {...shared}
              ref={inputRef}
              onChange={(event) => onChange(event.target.value)}
              className={cn(controlClass, d.control, "appearance-none pr-8")}
            >
              {(field.options ?? []).map((o) => (
                <option key={o.value || "__empty"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3"
            />
          </>
        ) : kind === "textarea" ? (
          <textarea
            {...shared}
            ref={inputRef}
            rows={3}
            placeholder={field.placeholder}
            onChange={(event) => onChange(event.target.value)}
            className={cn(controlClass, d.area, "resize-none leading-snug")}
          />
        ) : (
          <input
            {...shared}
            ref={inputRef}
            type={kind}
            placeholder={field.placeholder}
            autoComplete={field.autoComplete}
            inputMode={kind === "tel" ? "tel" : undefined}
            onChange={(event) => onChange(event.target.value)}
            className={cn(controlClass, d.control)}
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="msg"
            id={msgId}
            initial={{
              opacity: 0,
              height: 0,
              y: motionSafe ? -distances.nudge : 0,
            }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{
              opacity: 0,
              height: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    y: springs.glide,
                    opacity: { duration: durations.fast, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            className="overflow-hidden text-[11px] leading-snug text-(--ml-err)"
          >
            {error}
          </motion.p>
        ) : field.hint ? (
          <p
            key="hint"
            id={hintId}
            className="text-[11px] leading-snug text-ink-3"
          >
            {field.hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A long form whose validation summary mends itself. Submit with problems
 * and the summary raises on `springs.glide` — one link per problem, in form
 * order — while each field in error takes a hairline in the tone and a
 * message slides in under it. Pressing a link scrolls the field into view
 * inside the surface, focuses it and washes it briefly.
 *
 * Fields validate on blur. Mending one strikes its item in the summary (a
 * line draws on `springs.flick` and a check pops in on `springs.snap`), then
 * the item leaves on the exit ease, the rest close up on `springs.glide` and
 * the count rolls. When the last is mended the panel collapses and the
 * Submit button settles on `springs.recoil` and enables. A rail beside the
 * form lists the sections with their problem counts and glides a pill to
 * the section in view. Submitting resolves `onSubmit` into a success card
 * that lands on recoil.
 *
 * Everything is native: real labels, inputs and selects, a list of links in
 * the summary, a Submit that re-announces what remains when pressed early.
 * Alt+Down and Alt+Up jump between the fields still in error, and the rail
 * is one tab stop with arrows. Under reduced motion the summary and the
 * messages cross-fade in place, nothing scrolls smoothly and the wash is a
 * plain fade, but every problem is still listed, struck and announced.
 */
export function MendList({
  summaryPosition = "top",
  density = "cozy",
  tone = "danger",
  sections = defaultMendSections,
  value,
  defaultValue = defaultMendValue,
  onChange,
  validators = defaultMendValidators,
  onSubmit = defaultMendSubmit,
  onProblemsChange,
  status = "ready",
  onRetry,
  title = "Merchant application",
  submitLabel = "Submit application",
  label,
  height = 540,
  disabled = false,
  className,
}: MendListProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const summaryId = `${uid}-summary`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<MendValue>(defaultValue);
  const current = value ?? own;
  const ready = status === "ready";

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [summary, setSummary] = React.useState<SummaryItem[]>([]);
  const [phase, setPhase] = React.useState<Phase>("form");
  const [reference, setReference] = React.useState<string | null>(null);
  const [raiseSeq, setRaiseSeq] = React.useState(0);
  const [settle, setSettle] = React.useState(0);
  const [flash, setFlash] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [focused, setFocused] = React.useState<string | null>(null);
  const [scrolled, setScrolled] = React.useState<string | null>(null);
  const [railActive, setRailActive] = React.useState<string | null>(null);
  const [wide, setWide] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const summaryHead = React.useRef<HTMLHeadingElement | null>(null);
  const topSummary = React.useRef<HTMLDivElement | null>(null);
  const wrapNodes = React.useRef(new Map<string, HTMLDivElement>());
  const inputNodes = React.useRef(
    new Map<
      string,
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(),
  );
  const sectionNodes = React.useRef(new Map<string, HTMLElement>());
  const railNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const mendTimers = React.useRef(new Map<string, number>());
  const mounted = React.useRef(true);
  const prevOpen = React.useRef(0);
  const flashSeq = React.useRef(0);

  const inert = disabled || !ready || phase !== "form";

  /* -------------------------------- data ------------------------------- */

  const fields = React.useMemo(
    () =>
      sections.flatMap((s) =>
        s.fields.map((field) => ({ field, sectionId: s.id })),
      ),
    [sections],
  );
  const fieldById = new Map(fields.map((f) => [f.field.id, f]));
  const order = new Map(fields.map((f, i) => [f.field.id, i]));
  const empty = fields.length === 0;

  const problemIds = fields
    .map((f) => f.field.id)
    .filter((id) => errors[id] !== undefined);
  const openCount = summary.filter((s) => !s.mended).length;
  const countsBySection = new Map<string, number>();
  for (const id of problemIds) {
    const sid = fieldById.get(id)?.sectionId;
    if (sid) countsBySection.set(sid, (countsBySection.get(sid) ?? 0) + 1);
  }
  const filled = fields.filter(
    (f) => (current[f.field.id] ?? "").trim() !== "",
  ).length;
  const activeSection =
    (focused ? fieldById.get(focused)?.sectionId : undefined) ??
    scrolled ??
    sections[0]?.id ??
    null;
  const railKey =
    railActive && sections.some((s) => s.id === railActive)
      ? railActive
      : (activeSection ?? null);
  const sideSummary = summaryPosition === "side" && wide;

  const validateOne = (field: MendField) =>
    validateMendField(field, current[field.id] ?? "", current, validators);

  /* ------------------------------ lifecycle ---------------------------- */

  React.useEffect(() => {
    mounted.current = true;
    const timers = mendTimers.current;
    return () => {
      mounted.current = false;
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  // Which column the side summary may use: measured once per resize.
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWide(w >= 640);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  // The Submit button settles when the summary empties after a raise.
  React.useEffect(() => {
    if (prevOpen.current > 0 && summary.length === 0) setSettle((s) => s + 1);
    prevOpen.current = summary.length;
  }, [summary.length]);

  // Focus lands on the summary's heading once it has raised.
  React.useLayoutEffect(() => {
    if (raiseSeq === 0) return;
    const c = scrollRef.current;
    if (c && !sideSummary) c.scrollTo({ top: 0 });
    summaryHead.current?.focus({ preventScroll: true });
  }, [raiseSeq, sideSummary]);

  /* ------------------------------- changes ----------------------------- */

  const announce = (text: string) => setAnnouncement(text);

  const setField = (id: string, next: string) => {
    if (inert) return;
    const nextValue = { ...current, [id]: next };
    if (value === undefined) setOwn(nextValue);
    onChange?.(nextValue, id);
  };

  const publish = (next: Record<string, string>) => {
    if (!onProblemsChange) return;
    onProblemsChange(
      fields
        .filter((f) => next[f.field.id] !== undefined)
        .map((f) => ({ fieldId: f.field.id, message: next[f.field.id] ?? "" })),
    );
  };

  const insertInOrder = (list: SummaryItem[], item: SummaryItem) => {
    const i = order.get(item.fieldId) ?? Number.MAX_SAFE_INTEGER;
    const out = [...list];
    const at = out.findIndex(
      (s) => (order.get(s.fieldId) ?? Number.MAX_SAFE_INTEGER) > i,
    );
    if (at === -1) out.push(item);
    else out.splice(at, 0, item);
    return out;
  };

  /** A field settled (blur or a committed choice): re-check it and mend. */
  const commit = (field: MendField) => {
    if (inert) return;
    const message = validateOne(field);
    const had = errors[field.id];
    if (message !== had) {
      const next = { ...errors };
      if (message) next[field.id] = message;
      else delete next[field.id];
      setErrors(next);
      publish(next);
    }
    const item = summary.find((s) => s.fieldId === field.id);
    if (message) {
      if (!item) {
        if (summary.length > 0) {
          setSummary((prev) =>
            insertInOrder(prev, { fieldId: field.id, message, mended: false }),
          );
          announce(`${message} ${openCount + 1} to mend.`);
        }
      } else if (!item.mended && item.message !== message) {
        setSummary((prev) =>
          prev.map((s) => (s.fieldId === field.id ? { ...s, message } : s)),
        );
      }
      return;
    }
    if (!item || item.mended) return;
    setSummary((prev) =>
      prev.map((s) => (s.fieldId === field.id ? { ...s, mended: true } : s)),
    );
    const remaining = openCount - 1;
    announce(
      remaining <= 0
        ? `${field.label} mended. Everything is mended; ready to submit.`
        : `${field.label} mended. ${remaining} ${plural(remaining, "remains", "remain")}.`,
    );
    const existing = mendTimers.current.get(field.id);
    if (existing !== undefined) window.clearTimeout(existing);
    const t = window.setTimeout(
      () => {
        mendTimers.current.delete(field.id);
        setSummary((prev) => prev.filter((s) => s.fieldId !== field.id));
      },
      motionSafe ? MEND_MS : durations.fast * 1000,
    );
    mendTimers.current.set(field.id, t);
  };

  const submit = () => {
    if (inert) return;
    if (summary.length > 0) {
      announce(
        `${openCount} ${plural(openCount, "problem remains", "problems remain")}. ${summary.find((s) => !s.mended)?.message ?? ""}`,
      );
      summaryHead.current?.focus({ preventScroll: true });
      return;
    }
    const found: SummaryItem[] = [];
    const next: Record<string, string> = {};
    for (const { field } of fields) {
      const message = validateOne(field);
      if (message) {
        found.push({ fieldId: field.id, message, mended: false });
        next[field.id] = message;
      }
    }
    setErrors(next);
    publish(next);
    if (found.length > 0) {
      setSummary(found);
      setRaiseSeq((s) => s + 1);
      announce(
        `${found.length} ${plural(found.length, "problem", "problems")} to mend. First: ${found[0]?.message ?? ""}`,
      );
      return;
    }
    setPhase("submitting");
    announce("Submitting.");
    Promise.resolve()
      .then(() => onSubmit(current))
      .then(
        (result) => {
          if (!mounted.current) return;
          const ref = result?.reference ?? null;
          setReference(ref);
          setPhase("done");
          announce(
            ref ? `Application submitted. Reference ${ref}.` : "Submitted.",
          );
        },
        () => {
          if (!mounted.current) return;
          setPhase("form");
          announce("Submitting failed. Try again.");
        },
      );
  };

  const reset = () => {
    for (const t of mendTimers.current.values()) window.clearTimeout(t);
    mendTimers.current.clear();
    setErrors({});
    setSummary([]);
    setPhase("form");
    setReference(null);
    setFocused(null);
    if (value === undefined) setOwn(defaultValue);
    onChange?.(defaultValue, null);
    onProblemsChange?.([]);
    announce("Form reset.");
  };

  /* ------------------------------ scrolling ---------------------------- */

  const scrollTo = (node: HTMLElement, offset: number) => {
    const c = scrollRef.current;
    if (!c) return;
    const top =
      node.getBoundingClientRect().top -
      c.getBoundingClientRect().top +
      c.scrollTop -
      offset;
    c.scrollTo({
      top: Math.max(0, top),
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  const stickyOffset = () =>
    (sideSummary ? 0 : (topSummary.current?.offsetHeight ?? 0)) + 12;

  const goToField = (id: string) => {
    const wrap = wrapNodes.current.get(id);
    const input = inputNodes.current.get(id);
    if (wrap) scrollTo(wrap, stickyOffset());
    input?.focus({ preventScroll: true });
    flashSeq.current += 1;
    setFlash({ id, seq: flashSeq.current });
  };

  const goToSection = (id: string) => {
    const node = sectionNodes.current.get(id);
    if (node) scrollTo(node, stickyOffset());
    const first = sections.find((s) => s.id === id)?.fields[0];
    if (first) {
      inputNodes.current.get(first.id)?.focus({ preventScroll: true });
    }
  };

  const onScroll = () => {
    const c = scrollRef.current;
    if (!c) return;
    const line = c.getBoundingClientRect().top + stickyOffset() + 24;
    let active = sections[0]?.id ?? null;
    for (const s of sections) {
      const node = sectionNodes.current.get(s.id);
      if (node && node.getBoundingClientRect().top <= line) active = s.id;
    }
    setScrolled((prev) => (prev === active ? prev : active));
  };

  /* ------------------------------ keyboard ----------------------------- */

  const jumpProblem = (dir: 1 | -1) => {
    if (problemIds.length === 0) return;
    const i = focused ? problemIds.indexOf(focused) : -1;
    const next =
      i === -1
        ? dir === 1
          ? 0
          : problemIds.length - 1
        : (i + dir + problemIds.length) % problemIds.length;
    const id = problemIds[next];
    if (id) goToField(id);
  };

  const onRootKeyDown = (event: React.KeyboardEvent) => {
    if (!event.altKey || inert) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      jumpProblem(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      jumpProblem(-1);
    }
  };

  const onRailKey = (event: React.KeyboardEvent, id: string) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(id);
    let to = -1;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") to = i + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = ids.length - 1;
    else return;
    event.preventDefault();
    const target = ids[clamp(to, 0, ids.length - 1)];
    if (target) railNodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const err = TONES[tone] ?? TONES.danger;
  const step = cascade(Math.min(summary.length, 8));

  const summaryPanel =
    summary.length > 0 ? (
      <motion.section
        key="summary"
        aria-labelledby={summaryId}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0, transition: exitFor(durations.base) }}
        transition={
          motionSafe
            ? {
                height: springs.glide,
                opacity: { duration: durations.base, ease: easings.enter },
              }
            : { duration: durations.fast }
        }
        className="overflow-hidden"
      >
        <div
          className={cn(
            "flex flex-col gap-2 rounded-3 border p-3",
            "border-[color-mix(in_oklab,var(--ml-err)_38%,transparent)] bg-[color-mix(in_oklab,var(--ml-err)_9%,var(--bg-1))]",
            sideSummary ? "mx-3 mb-3" : "mx-4 mt-3",
          )}
        >
          <h3
            ref={summaryHead}
            id={summaryId}
            tabIndex={-1}
            className={cn(
              "flex items-center gap-2 rounded-1 text-[13px] font-semibold text-foreground",
              FOCUS_RING,
            )}
          >
            <TriangleAlert aria-hidden className="size-4 text-(--ml-err)" />
            <span className="sr-only">
              {openCount} {plural(openCount, "problem", "problems")} to mend
            </span>
            <Roll
              value={openCount}
              motionSafe={motionSafe}
              className="font-mono text-[13px]"
            />
            <span aria-hidden>
              {plural(openCount, "problem", "problems")} to mend
            </span>
          </h3>
          <ul
            role="list"
            aria-label="Problems"
            className="relative flex max-h-40 flex-col gap-0.5 overflow-y-auto overscroll-contain"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {summary.map((item, i) => {
                const field = fieldById.get(item.fieldId)?.field;
                return (
                  <motion.li
                    key={item.fieldId}
                    layout={motionSafe ? "position" : false}
                    initial={
                      live
                        ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    exit={{
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }}
                    transition={{
                      layout: springs.glide,
                      y: motionSafe
                        ? { ...springs.glide, delay: r3(Math.min(i, 8) * step) }
                        : { duration: 0 },
                      opacity: {
                        duration: durations.base,
                        ease: easings.enter,
                      },
                    }}
                    className="flex min-w-0"
                  >
                    <a
                      href={`#${uid}-f-${item.fieldId}`}
                      aria-disabled={item.mended || undefined}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!item.mended) goToField(item.fieldId);
                      }}
                      className={cn(
                        "flex min-w-0 flex-1 items-start gap-2 rounded-2 px-1.5 py-1 text-left text-[12px] leading-snug transition-colors",
                        item.mended
                          ? "text-ink-3"
                          : "text-foreground hover:bg-[color-mix(in_oklab,var(--ml-err)_12%,transparent)]",
                        FOCUS_RING,
                      )}
                    >
                      <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center">
                        {item.mended ? (
                          <motion.span
                            className="flex text-success"
                            initial={motionSafe ? { scale: 0.4 } : false}
                            animate={{ scale: 1 }}
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          >
                            <Check aria-hidden className="size-3.5" />
                          </motion.span>
                        ) : (
                          <span
                            aria-hidden
                            className="size-1.5 rounded-full bg-(--ml-err)"
                          />
                        )}
                      </span>
                      <span className="relative min-w-0">
                        <span className="sr-only">
                          {item.mended ? "Mended: " : ""}
                        </span>
                        {field?.label ? (
                          <span className="font-medium">{field.label}: </span>
                        ) : null}
                        {item.message}
                        {item.mended ? (
                          <motion.span
                            aria-hidden
                            className="absolute inset-x-0 top-1/2 h-px bg-current"
                            style={{ originX: 0 }}
                            initial={motionSafe ? { scaleX: 0 } : false}
                            animate={{ scaleX: 1 }}
                            transition={
                              motionSafe ? springs.flick : { duration: 0 }
                            }
                          />
                        ) : null}
                      </span>
                    </a>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </div>
      </motion.section>
    ) : null;

  const rail = (
    <nav
      aria-label="Sections"
      className="flex shrink-0 gap-1 overflow-x-auto overscroll-x-contain px-3 py-2 @min-[40rem]:flex-col @min-[40rem]:overflow-visible @min-[40rem]:px-3 @min-[40rem]:py-3"
    >
      <LayoutGroup id={`${uid}-rail`}>
        {sections.map((s, i) => {
          const count = countsBySection.get(s.id) ?? 0;
          const active = s.id === activeSection;
          return (
            <button
              key={s.id}
              ref={(node) => {
                if (node) railNodes.current.set(s.id, node);
                else railNodes.current.delete(s.id);
              }}
              type="button"
              tabIndex={railKey === s.id ? 0 : -1}
              aria-current={active ? "true" : undefined}
              aria-label={`${s.title}${count > 0 ? `, ${count} ${plural(count, "problem", "problems")}` : ""}`}
              onFocus={() => setRailActive(s.id)}
              onClick={() => goToSection(s.id)}
              onKeyDown={(event) => onRailKey(event, s.id)}
              className={cn(
                "relative flex h-8 shrink-0 items-center gap-2 rounded-2 px-2.5 text-left text-[12px] transition-colors",
                active ? "text-foreground" : "text-ink-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              {active ? (
                <motion.span
                  aria-hidden
                  layoutId={`${uid}-rail-pill`}
                  className="absolute inset-0 rounded-2 bg-surface-2"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span className="relative font-mono text-[10px] text-ink-3 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="relative truncate">{s.title}</span>
              <span className="relative ml-auto flex h-4 min-w-4 items-center justify-center pl-1">
                <AnimatePresence initial={false} mode="popLayout">
                  {count > 0 ? (
                    <motion.span
                      key="count"
                      aria-hidden
                      initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      className="flex h-4 min-w-4 items-center justify-center rounded-full bg-(--ml-err) px-1 font-mono text-[10px] text-white"
                    >
                      <Roll
                        value={count}
                        motionSafe={motionSafe}
                        className="text-[10px]"
                      />
                    </motion.span>
                  ) : raiseSeq > 0 ? (
                    <motion.span
                      key="ok"
                      aria-hidden
                      initial={motionSafe ? { scale: 0.6, opacity: 0 } : false}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={motionSafe ? springs.snap : { duration: 0 }}
                      className="flex text-success"
                    >
                      <Check aria-hidden className="size-3.5" />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </button>
          );
        })}
      </LayoutGroup>
    </nav>
  );

  const form = (
    <form
      noValidate
      aria-describedby={hintId}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className={cn("flex flex-col", d.section, d.pad)}
    >
      {sections.map((s) => (
        <section
          key={s.id}
          ref={(node) => {
            if (node) sectionNodes.current.set(s.id, node);
            else sectionNodes.current.delete(s.id);
          }}
          aria-labelledby={`${uid}-s-${s.id}`}
          className="flex flex-col gap-3"
        >
          <header className="flex flex-col gap-0.5">
            <h3
              id={`${uid}-s-${s.id}`}
              className="text-[13px] font-semibold text-foreground"
            >
              {s.title}
            </h3>
            {s.description ? (
              <p className="text-[12px] text-ink-2">{s.description}</p>
            ) : null}
          </header>
          <div
            className={cn("grid grid-cols-1 @min-[36rem]:grid-cols-2", d.rows)}
          >
            {s.fields.map((field) => (
              <FieldRow
                key={field.id}
                field={field}
                uid={uid}
                value={current[field.id] ?? ""}
                error={errors[field.id]}
                density={density}
                inert={inert}
                flashSeq={flash?.id === field.id ? flash.seq : null}
                motionSafe={motionSafe}
                wrapRef={(node) => {
                  if (node) wrapNodes.current.set(field.id, node);
                  else wrapNodes.current.delete(field.id);
                }}
                inputRef={(node) => {
                  if (node) inputNodes.current.set(field.id, node);
                  else inputNodes.current.delete(field.id);
                }}
                onChange={(next) => setField(field.id, next)}
                onCommit={() => commit(field)}
                onFocus={() => setFocused(field.id)}
                onFlashDone={(seq) =>
                  setFlash((f) => (f && f.seq === seq ? null : f))
                }
              />
            ))}
          </div>
        </section>
      ))}
      {/* A submit control inside the form, so Enter in a field submits. */}
      <button type="submit" tabIndex={-1} aria-hidden className="hidden" />
    </form>
  );

  const success = (
    <motion.div
      key="done"
      initial={
        motionSafe
          ? { opacity: 0, scale: 0.96, y: distances.step }
          : { opacity: 0 }
      }
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={
        motionSafe
          ? {
              ...springs.recoil,
              opacity: { duration: durations.base, ease: easings.enter },
            }
          : { duration: durations.fast }
      }
      className="m-auto flex max-w-sm flex-col items-center gap-3 px-6 py-8 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success">
        <svg aria-hidden viewBox="0 0 24 24" className="size-6">
          <motion.path
            d="M5 12.5 9.8 17 19 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={motionSafe ? { pathLength: 0 } : false}
            animate={{ pathLength: 1 }}
            transition={
              motionSafe
                ? { ...springs.flick, delay: durations.fast }
                : { duration: 0 }
            }
          />
        </svg>
      </span>
      <p className="text-sm font-semibold text-foreground">
        Application submitted
      </p>
      <p className="text-[12px] leading-relaxed text-ink-2">
        {reference ? (
          <>
            Your reference is{" "}
            <span className="font-mono text-foreground">{reference}</span>.{" "}
          </>
        ) : null}
        We review most applications within two working days and write to the
        contact on file.
      </p>
      <button
        type="button"
        onClick={reset}
        className={cn(
          "mt-1 inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
          FOCUS_RING,
        )}
      >
        <RotateCcw aria-hidden className="size-3.5" />
        Start another
      </button>
    </motion.div>
  );

  const skeleton = (
    <div aria-hidden className={cn("flex flex-col gap-5", d.pad)}>
      {Array.from({ length: 2 }, (_, s) => (
        <div key={s} className="flex flex-col gap-3">
          <span
            className="h-3.5 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse"
            style={{ animationDelay: `${s * 160}ms` }}
          />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <span
                className="h-2.5 w-20 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${(s * 3 + i) * 90}ms` }}
              />
              <span
                className="h-9 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                style={{ animationDelay: `${(s * 3 + i) * 90 + 40}ms` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const footerText =
    phase === "submitting"
      ? "Submitting"
      : phase === "done"
        ? "Submitted"
        : summary.length > 0
          ? `${openCount} to mend`
          : `${filled} of ${fields.length} filled`;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--ml-err" as string]: err }}
    >
      <p id={hintId} className="sr-only">
        Alt and Down or Up moves between fields with problems.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </p>
        {ready && !empty ? (
          <p className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {footerText}
          </p>
        ) : null}
      </header>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            The application didn&apos;t load.
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
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[40rem]:grid-rows-1">
          <div
            aria-hidden
            className="flex gap-2 border-b border-hairline px-3 py-2 @min-[40rem]:flex-col @min-[40rem]:border-r @min-[40rem]:border-b-0 @min-[40rem]:py-3"
          >
            {Array.from({ length: 3 }, (_, i) => (
              <span
                key={i}
                className="h-8 w-24 rounded-2 bg-surface-2 motion-safe:animate-pulse @min-[40rem]:w-auto"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
          <div className="min-h-0 overflow-hidden">{skeleton}</div>
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <Inbox aria-hidden className="size-5 text-ink-3" />
          <p className="text-sm text-foreground">Nothing to fill in.</p>
          <p className="max-w-xs text-[12px] text-ink-2">
            This application has no fields yet. Give it sections and they appear
            here with their own rail.
          </p>
        </div>
      ) : phase === "done" ? (
        <div className="flex min-h-0 flex-1 overflow-y-auto">{success}</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[40rem]:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b border-hairline @min-[40rem]:border-r @min-[40rem]:border-b-0">
            {rail}
            {sideSummary ? (
              <div className="min-h-0 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {summaryPanel}
                </AnimatePresence>
              </div>
            ) : null}
          </div>
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="relative min-h-0 overflow-y-auto overscroll-contain"
          >
            {!sideSummary ? (
              <div
                ref={topSummary}
                className={cn(
                  "sticky top-0 z-10 bg-card",
                  summary.length > 0 && "border-b border-hairline pb-3",
                )}
              >
                <AnimatePresence initial={false}>
                  {summaryPanel}
                </AnimatePresence>
              </div>
            ) : null}
            {form}
          </div>
        </div>
      )}

      {ready && !empty && phase !== "done" ? (
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
          <p className="min-w-0 truncate text-[11px] text-ink-3">
            {summary.length > 0 ? (
              <>
                Fix a field and leave it; its line clears.{" "}
                <span className="hidden @min-[30rem]:inline">
                  Alt+Down jumps to the next.
                </span>
              </>
            ) : (
              "Fields check themselves when you leave them."
            )}
          </p>
          <motion.button
            key={settle}
            type="button"
            onClick={submit}
            aria-disabled={inert || summary.length > 0 || undefined}
            aria-describedby={summary.length > 0 ? summaryId : undefined}
            initial={motionSafe && settle > 0 ? { scale: 0.92 } : false}
            animate={{ scale: 1 }}
            transition={motionSafe ? springs.recoil : { duration: 0 }}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-3 text-xs font-medium transition-colors",
              inert || summary.length > 0
                ? "cursor-not-allowed bg-surface-2 text-ink-3"
                : "bg-primary text-primary-foreground hover:opacity-90",
              FOCUS_RING,
            )}
          >
            {phase === "submitting" ? (
              <span
                aria-hidden
                className="size-3 rounded-full border-[1.5px] border-current border-t-transparent motion-safe:animate-spin"
              />
            ) : null}
            {phase === "submitting" ? "Submitting" : submitLabel}
          </motion.button>
        </footer>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
