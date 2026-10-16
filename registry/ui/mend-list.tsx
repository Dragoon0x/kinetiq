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
  ArrowDown,
  Check,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Save,
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

export type MendFieldKind =
  | "text"
  | "email"
  | "url"
  | "tel"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox";

export type MendValue = string | boolean;
export type MendValues = Record<string, MendValue>;

export type MendField = {
  /** Unique across the whole form. */
  id: string;
  label: string;
  kind: MendFieldKind;
  required?: boolean;
  /** Text fields: the shortest answer that passes, in characters. */
  minLength?: number;
  /** Text fields: the answer must match. Email and url kinds check their own shape first. */
  pattern?: RegExp;
  /** The fix shown when the shape or pattern is wrong. */
  patternFix?: string;
  /** The fix shown when a required field is empty. */
  requiredFix?: string;
  /** Choices for select and radio kinds. */
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** A quiet line under the field. Checkbox fields show it as their sentence. */
  hint?: string;
  autoComplete?: string;
  /** Span both columns on wide layouts (textareas, radios and checkboxes always do). */
  wide?: boolean;
  /** Your own rule: return the fix, or null when the value is fine. */
  validate?: (value: MendValue, values: MendValues) => string | null;
};

export type MendSection = {
  id: string;
  title: string;
  description?: string;
  fields: MendField[];
};

/** What `onSubmit` may resolve with: field errors from the server join the mend list. */
export type MendSubmitResult = { fieldErrors?: Record<string, string> };

export type MendListStyle = "panel" | "chips" | "numbered";
export type MendDensity = "compact" | "cozy" | "roomy";

export type MendListProps = {
  /** The form, as sections of fields. @default defaultMendSections (a Fernworks residency application) */
  sections?: MendSection[];
  /** Controlled answers, keyed by field id. */
  values?: MendValues;
  /** Initial answers when uncontrolled. @default defaultMendValues with the default sections, else {} */
  defaultValues?: MendValues;
  /** Fires from the edit that changed the answers, with all of them. */
  onValuesChange?: (values: MendValues) => void;
  /** Fires from each edit with the field, its new value and every answer. */
  onFieldChange?: (id: string, value: MendValue, values: MendValues) => void;
  /** A submit that passed every check. Return a promise to show progress; reject to keep everything and say so; resolve with `{ fieldErrors }` to list the server's problems. */
  onSubmit?: (
    values: MendValues,
  ) => void | MendSubmitResult | Promise<void | MendSubmitResult>;
  /** A submit that found problems, with the ids still to mend, in form order. */
  onInvalid?: (ids: string[]) => void;
  /** Save draft was pressed. Return a promise to show it saving. */
  onSaveDraft?: (values: MendValues) => void | Promise<void>;
  /** An item in the mend list was chosen, with its field id. */
  onMend?: (id: string) => void;
  /** How the mend list is drawn: a bordered panel, a run of chips, or a numbered checklist with progress. @default "panel" */
  listStyle?: MendListStyle;
  /** Field height and the room between fields and sections. @default "cozy" */
  density?: MendDensity;
  /** The list's checks, the pulse ring, the strike line and the button's progress, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Run the submit check on mount, so the mend list shows from the first frame. @default false */
  checkOnMount?: boolean;
  /** The form's heading and accessible name. @default "Studio residency application" */
  title?: string;
  /** A quiet line under the heading. @default "Fernworks · Spring 2027 intake" */
  subtitle?: string;
  /** @default "Submit application" */
  submitLabel?: string;
  /** Panel height in px; the form scrolls inside it. @default 520 */
  height?: number;
  /** Loading draws placeholder fields. @default "ready" */
  status?: "ready" | "loading";
  /** Nothing can be edited or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- data --------------------------------- */

/** Fernworks Studio's spring residency: four sections, twelve answers. */
export const defaultMendSections: MendSection[] = [
  {
    id: "you",
    title: "About you",
    fields: [
      {
        id: "name",
        label: "Full name",
        kind: "text",
        required: true,
        autoComplete: "name",
        requiredFix: "Add the name you work under",
      },
      {
        id: "email",
        label: "Email",
        kind: "email",
        required: true,
        autoComplete: "email",
        placeholder: "you@yourstudio.net",
        patternFix: "Add the part after the @, like ana@fernworks.studio",
      },
      {
        id: "phone",
        label: "Phone",
        kind: "tel",
        autoComplete: "tel",
        hint: "Only used if your travel plans change.",
        pattern: /^[+\d][\d\s()-]{6,}$/,
        patternFix: "Use digits, spaces and an optional +",
      },
      {
        id: "city",
        label: "Based in",
        kind: "text",
        required: true,
        autoComplete: "address-level2",
        requiredFix: "Add the town or city you work from",
      },
    ],
  },
  {
    id: "practice",
    title: "Your practice",
    description: "Tell the panel what you make and where to see it.",
    fields: [
      {
        id: "discipline",
        label: "Discipline",
        kind: "select",
        required: true,
        options: [
          { value: "glass", label: "Glass" },
          { value: "print", label: "Print" },
          { value: "ceramics", label: "Ceramics" },
          { value: "textiles", label: "Textiles" },
          { value: "other", label: "Something else" },
        ],
      },
      {
        id: "portfolio",
        label: "Portfolio link",
        kind: "url",
        required: true,
        placeholder: "https://",
        patternFix: "Start the link with https://",
      },
      {
        id: "statement",
        label: "Artist statement",
        kind: "textarea",
        required: true,
        minLength: 120,
        hint: "Two or three sentences on what you would make here.",
      },
    ],
  },
  {
    id: "stay",
    title: "The residency",
    fields: [
      {
        id: "season",
        label: "Preferred season",
        kind: "radio",
        required: true,
        requiredFix: "Pick early, late or either",
        options: [
          { value: "early", label: "Early spring" },
          { value: "late", label: "Late spring" },
          { value: "either", label: "Either" },
        ],
      },
      {
        id: "length",
        label: "Length of stay",
        kind: "select",
        required: true,
        options: [
          { value: "2w", label: "Two weeks" },
          { value: "4w", label: "Four weeks" },
          { value: "6w", label: "Six weeks" },
        ],
      },
      {
        id: "needs",
        label: "Studio needs",
        kind: "textarea",
        hint: "Kiln time, press bed size, ventilation, anything else.",
      },
    ],
  },
  {
    id: "terms",
    title: "Agreements",
    fields: [
      {
        id: "code",
        label: "Code of practice",
        kind: "checkbox",
        required: true,
        hint: "I have read the Fernworks studio code of practice.",
        requiredFix: "Tick to confirm you have read it",
      },
      {
        id: "photos",
        label: "Photographs",
        kind: "checkbox",
        hint: "Fernworks may photograph my work in progress.",
      },
    ],
  },
];

/** Half filled, with the mistakes people really make. */
export const defaultMendValues: MendValues = {
  name: "Ana Ruiz",
  email: "ana.ruiz@",
  phone: "",
  city: "Coldbrook",
  discipline: "glass",
  portfolio: "anaruiz.studio/glass",
  statement:
    "I blow and cast glass vessels that hold light the way water does.",
  season: "",
  length: "4w",
  needs: "",
  code: false,
  photos: true,
};

/* ------------------------------ validation ------------------------------ */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_SHAPE = /^https?:\/\/[^\s/.]+\.[^\s]{2,}$/;

const isAnswered = (value: MendValue | undefined) =>
  typeof value === "boolean" ? value : (value ?? "").trim().length > 0;

/** The fix a field needs, or null when its value passes. */
export function checkMendField(
  field: MendField,
  value: MendValue | undefined,
  values: MendValues,
): string | null {
  if (field.kind === "checkbox") {
    if (field.required && value !== true) {
      return field.requiredFix ?? "Tick this to go on";
    }
    return field.validate?.(value ?? false, values) ?? null;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    if (!field.required) return null;
    return (
      field.requiredFix ??
      (field.kind === "select"
        ? "Choose one"
        : field.kind === "radio"
          ? "Pick one"
          : "Fill this in")
    );
  }
  if (field.kind === "email") {
    if (!text.includes("@")) return "An address needs an @ and a domain";
    if (!EMAIL.test(text))
      return field.patternFix ?? "Add the part after the @";
  }
  if (field.kind === "url" && !URL_SHAPE.test(text)) {
    return field.patternFix ?? "Start the link with https://";
  }
  if (field.minLength && text.length < field.minLength) {
    const left = field.minLength - text.length;
    return `Write at least ${field.minLength} characters · ${left} to go`;
  }
  if (field.pattern && !field.pattern.test(text)) {
    return field.patternFix ?? "Check the format";
  }
  return field.validate?.(value ?? "", values) ?? null;
}

/** Every field that would stop a submit, in form order, with its fix. */
export function findMendProblems(
  sections: MendSection[],
  values: MendValues,
): { id: string; label: string; fix: string }[] {
  const out: { id: string; label: string; fix: string }[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      const fix = checkMendField(field, values[field.id], values);
      if (fix) out.push({ id: field.id, label: field.label, fix });
    }
  }
  return out;
}

/* ------------------------------- styling -------------------------------- */

type Density = {
  control: string;
  text: string;
  fields: string;
  sections: string;
  area: string;
  rows: number;
};

const DENSITY: Record<MendDensity, Density> = {
  compact: {
    control: "h-8",
    text: "text-[13px]",
    fields: "gap-y-3",
    sections: "gap-6",
    area: "py-1.5",
    rows: 3,
  },
  cozy: {
    control: "h-9",
    text: "text-[13px]",
    fields: "gap-y-4",
    sections: "gap-8",
    area: "py-2",
    rows: 3,
  },
  roomy: {
    control: "h-10",
    text: "text-sm",
    fields: "gap-y-5",
    sections: "gap-10",
    area: "py-2.5",
    rows: 4,
  },
};

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const CONTROL_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Below 30rem the list folds to its heading line unless opened; CSS decides the default. */
const SHOW = {
  grid: { auto: "hidden @min-[30rem]:grid", open: "grid", shut: "hidden" },
  flex: { auto: "hidden @min-[30rem]:flex", open: "flex", shut: "hidden" },
} as const;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/* ------------------------------ small parts ----------------------------- */

/** A count that rolls a step when it changes: down for fewer, up for more. */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  // The previous value is state adjusted during render, so the direction is
  // known in the same render that shows the new number.
  const [prev, setPrev] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (prev !== value) {
    setPrev(value);
    setDir(value < prev ? 1 : -1);
  }
  return (
    <span
      aria-hidden
      className="relative inline-flex overflow-hidden align-bottom tabular-nums"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="inline-block"
          initial={{ y: motionSafe ? `${-dir * 100}%` : 0, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{
            y: motionSafe ? `${dir * 100}%` : 0,
            opacity: 0,
            transition: exitFor(durations.fast),
          }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * The once-only pulse a field gives when the mend list brings you to it: an
 * accent ring that swells out of the border and fades. One motion value drives
 * the whole shadow so nothing derived can go stale between StrictMode's two
 * mounts; under reduced motion the ring holds still and only fades.
 */
function PulseRing({ motionSafe }: { motionSafe: boolean }) {
  const t = useMotionValue(0);
  const shadow = useTransform(t, (p) => {
    const spread = motionSafe ? r2(1 + p * 8) : 2;
    const alpha = Math.round((1 - p) * 70);
    return `0 0 0 ${spread}px color-mix(in oklab, var(--ml-accent) ${alpha}%, transparent)`;
  });
  React.useEffect(() => {
    t.jump(0);
    const run = animate(t, 1, {
      duration: motionSafe ? 0.52 : 0.6,
      ease: motionSafe ? easings.enter : easings.linear,
    });
    return () => run.stop();
  }, [motionSafe, t]);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] rounded-2"
      style={{ boxShadow: shadow }}
    />
  );
}

/** The danger edge an invalid control carries, growing from the top. */
function ErrorEdge({ on, motionSafe }: { on: boolean; motionSafe: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-1.5 bottom-1.5 left-0 z-[1] w-0.5 rounded-full bg-danger"
      style={{ originY: 0 }}
      initial={false}
      animate={{ scaleY: on ? 1 : 0, opacity: on ? 1 : 0 }}
      transition={
        motionSafe
          ? { scaleY: springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    />
  );
}

/* --------------------------------- field -------------------------------- */

type FieldProps = {
  field: MendField;
  value: MendValue | undefined;
  error: string | null;
  showError: boolean;
  uid: string;
  density: Density;
  disabled: boolean;
  motionSafe: boolean;
  pulse: number | null;
  onChange: (value: MendValue) => void;
  bindWrap: (node: HTMLDivElement | null) => void;
};

function Field({
  field,
  value,
  error,
  showError,
  uid,
  density,
  disabled,
  motionSafe,
  pulse,
  onChange,
  bindWrap,
}: FieldProps) {
  const base = `${uid}-${field.id}`;
  const labelId = `${base}-label`;
  const hintId = `${base}-hint`;
  const errId = `${base}-error`;
  const invalid = showError && error !== null;
  const describedBy =
    [
      field.hint && field.kind !== "checkbox" ? hintId : null,
      invalid ? errId : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const wide =
    field.wide ||
    field.kind === "textarea" ||
    field.kind === "radio" ||
    field.kind === "checkbox";
  const text = typeof value === "string" ? value : "";

  const boxClass = cn(
    "w-full rounded-2 border bg-background px-3 text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
    CONTROL_RING,
    density.text,
    invalid
      ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
      : "border-input hover:border-hairline-strong",
  );

  const common = {
    id: base,
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    "aria-errormessage": invalid ? errId : undefined,
    "aria-required": field.required || undefined,
    disabled,
    "data-mend-control": "",
  };

  let control: React.ReactNode;
  if (field.kind === "textarea") {
    control = (
      <textarea
        {...common}
        value={text}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.currentTarget.value)}
        rows={density.rows}
        className={cn(boxClass, density.area, "block resize-y leading-5")}
      />
    );
  } else if (field.kind === "select") {
    control = (
      <span className="relative block">
        <select
          {...common}
          value={text}
          onChange={(e) => onChange(e.currentTarget.value)}
          className={cn(boxClass, density.control, "appearance-none pr-8")}
        >
          <option value="">Choose…</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
        />
      </span>
    );
  } else if (field.kind === "radio") {
    control = (
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-errormessage={invalid ? errId : undefined}
        aria-required={field.required || undefined}
        className="grid grid-cols-1 gap-1.5 @min-[30rem]:grid-cols-3"
      >
        {(field.options ?? []).map((o) => {
          const on = text === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "relative flex cursor-pointer items-center gap-2.5 rounded-2 border bg-background px-3 transition-colors",
                density.control,
                density.text,
                on
                  ? "border-[color-mix(in_oklab,var(--ml-accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--ml-accent)_7%,var(--background))]"
                  : invalid
                    ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
                    : "border-input hover:border-hairline-strong",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={base}
                value={o.value}
                checked={on}
                disabled={disabled}
                data-mend-control=""
                onChange={() => onChange(o.value)}
                className={cn(
                  "peer size-4 shrink-0 cursor-pointer appearance-none rounded-full border border-hairline-strong bg-background transition-colors checked:border-(--ml-accent) disabled:cursor-not-allowed",
                  CONTROL_RING,
                )}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-[calc(0.75rem+4px)] size-2 -translate-y-1/2 scale-0 rounded-full bg-(--ml-accent) transition-transform peer-checked:scale-100"
              />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    );
  } else if (field.kind === "checkbox") {
    const on = value === true;
    control = (
      <label
        className={cn(
          "relative flex cursor-pointer items-start gap-2.5 rounded-2 border bg-background px-3 py-2.5 transition-colors",
          density.text,
          invalid
            ? "border-[color-mix(in_oklab,var(--danger)_45%,transparent)]"
            : "border-input hover:border-hairline-strong",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="relative mt-0.5 inline-flex size-4 shrink-0">
          <input
            {...common}
            type="checkbox"
            checked={on}
            onChange={(e) => onChange(e.currentTarget.checked)}
            className={cn(
              "peer size-4 cursor-pointer appearance-none rounded-1 border border-hairline-strong bg-background transition-colors checked:border-(--ml-accent) checked:bg-(--ml-accent) disabled:cursor-not-allowed",
              CONTROL_RING,
            )}
          />
          <Check
            aria-hidden
            strokeWidth={3}
            className="pointer-events-none absolute inset-0.5 size-3 text-background opacity-0 peer-checked:opacity-100"
          />
        </span>
        <span className="leading-5 text-ink-2">
          {field.hint ?? field.label}
        </span>
      </label>
    );
  } else {
    control = (
      <input
        {...common}
        type={
          field.kind === "email"
            ? "email"
            : field.kind === "url"
              ? "url"
              : field.kind === "tel"
                ? "tel"
                : "text"
        }
        inputMode={
          field.kind === "email"
            ? "email"
            : field.kind === "url"
              ? "url"
              : field.kind === "tel"
                ? "tel"
                : undefined
        }
        value={text}
        placeholder={field.placeholder}
        autoComplete={field.autoComplete}
        spellCheck={field.kind === "text" || undefined}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={cn(boxClass, density.control)}
      />
    );
  }

  const counter =
    field.kind === "textarea" && field.minLength ? (
      <span
        className={cn(
          "shrink-0 font-mono text-[10.5px] whitespace-nowrap tabular-nums",
          text.trim().length >= field.minLength ? "text-success" : "text-ink-3",
        )}
      >
        {text.trim().length} / {field.minLength}
      </span>
    ) : null;

  return (
    <div
      ref={bindWrap}
      className={cn(
        "flex min-w-0 flex-col gap-1.5",
        wide && "@min-[36rem]:col-span-2",
      )}
    >
      {field.kind === "radio" ? (
        <span
          id={labelId}
          className="text-[12.5px] font-medium text-foreground"
        >
          {field.label}
          {field.required ? null : (
            <span className="ml-1.5 font-normal text-ink-3">optional</span>
          )}
        </span>
      ) : field.kind === "checkbox" ? (
        <span
          id={labelId}
          className="text-[12.5px] font-medium text-foreground"
        >
          {field.label}
          {field.required ? null : (
            <span className="ml-1.5 font-normal text-ink-3">optional</span>
          )}
        </span>
      ) : (
        <label
          id={labelId}
          htmlFor={base}
          className="text-[12.5px] font-medium text-foreground"
        >
          {field.label}
          {field.required ? null : (
            <span className="ml-1.5 font-normal text-ink-3">optional</span>
          )}
        </label>
      )}
      <div className="relative">
        {control}
        <ErrorEdge on={invalid} motionSafe={motionSafe} />
        {pulse !== null ? (
          <PulseRing key={pulse} motionSafe={motionSafe} />
        ) : null}
      </div>
      {(field.hint && field.kind !== "checkbox") || counter ? (
        <div className="flex items-start justify-between gap-3">
          {field.hint && field.kind !== "checkbox" ? (
            <span id={hintId} className="text-[11.5px] leading-4 text-ink-3">
              {field.hint}
            </span>
          ) : (
            <span />
          )}
          {counter}
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {invalid ? (
          <motion.p
            key="error"
            id={errId}
            className="flex items-start gap-1.5 overflow-hidden text-[11.5px] leading-4 text-danger"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{
              opacity: 0,
              height: 0,
              transition: exitFor(durations.fast),
            }}
            transition={
              motionSafe
                ? {
                    height: springs.glide,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.fast }
            }
          >
            <CircleAlert aria-hidden className="mt-px size-3 shrink-0" />
            <span>{error}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------- the form ------------------------------- */

type Listed = { id: string; fix: string };
type Phase = "idle" | "sending" | "sent" | "failed";

/**
 * A long application form that, when a submit finds problems, gathers every
 * one of them into a mend list dropped in above the form and pinned to the top
 * of its scrolling body. The list's height opens on `springs.glide` while its
 * items fall in from 8px above on `springs.snap` in a `cascade()`; each item
 * names the field and the fix. Choosing one scrolls the body to the field on
 * glide — offset by the pinned list, so the field never lands under it — then
 * the field pulses once (an accent ring swelling out of its border) and takes
 * focus. From then on checking is live: the moment a listed field passes, its
 * item strikes itself through on `springs.flick` and the count rolls down on
 * snap.
 *
 * Errors are linked to their fields (`aria-describedby`,
 * `aria-errormessage`, `aria-invalid`), the list is a labelled `nav` whose
 * heading takes focus when it appears, and every mend is announced politely.
 * A rejected `onSubmit` keeps every answer and says so; a resolved
 * `{ fieldErrors }` puts the server's words into the same list. Below 30rem
 * the list folds to one pinned line with Next and Show all. Under reduced
 * motion nothing slides or swells: the list cross-fades in, the scroll jumps,
 * the ring holds still and fades, and the strike appears whole.
 */
export function MendList({
  sections = defaultMendSections,
  values,
  defaultValues,
  onValuesChange,
  onFieldChange,
  onSubmit,
  onInvalid,
  onSaveDraft,
  onMend,
  listStyle = "panel",
  density = "cozy",
  accent = "var(--accent-bright)",
  checkOnMount = false,
  title = "Studio residency application",
  subtitle = "Fernworks · Spring 2027 intake",
  submitLabel = "Submit application",
  height = 520,
  status = "ready",
  disabled = false,
  className,
}: MendListProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const headId = `${uid}-mend`;
  const itemsId = `${uid}-mend-items`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const fields = React.useMemo(
    () => sections.flatMap((s) => s.fields),
    [sections],
  );
  const fieldById = React.useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields],
  );

  const [own, setOwn] = React.useState<MendValues>(
    () =>
      defaultValues ??
      (sections === defaultMendSections ? defaultMendValues : {}),
  );
  const current = values ?? own;

  const [serverErrors, setServerErrors] = React.useState<
    Record<string, { message: string; value: MendValue | undefined }>
  >({});

  const errorOf = React.useCallback(
    (id: string, vals: MendValues): string | null => {
      const field = fieldById.get(id);
      if (!field) return null;
      const local = checkMendField(field, vals[id], vals);
      if (local) return local;
      const server = serverErrors[id];
      return server && server.value === vals[id] ? server.message : null;
    },
    [fieldById, serverErrors],
  );

  const problemsOf = React.useCallback(
    (vals: MendValues): Listed[] =>
      fields.flatMap((f) => {
        const fix = errorOf(f.id, vals);
        return fix ? [{ id: f.id, fix }] : [];
      }),
    [errorOf, fields],
  );

  const [attempted, setAttempted] = React.useState(checkOnMount);
  const [listed, setListed] = React.useState<Listed[]>(() =>
    checkOnMount
      ? findMendProblems(sections, current).map(({ id, fix }) => ({ id, fix }))
      : [],
  );
  const [round, setRound] = React.useState(0);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [draft, setDraft] = React.useState<"idle" | "saving" | "saved">("idle");
  const [pulse, setPulse] = React.useState<{ id: string; n: number } | null>(
    null,
  );
  const [expanded, setExpanded] = React.useState<boolean | null>(null);
  const [narrow, setNarrow] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");

  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const submitRef = React.useRef<HTMLButtonElement | null>(null);
  const stickyRef = React.useRef<HTMLDivElement | null>(null);
  const wraps = React.useRef(new Map<string, HTMLDivElement>());
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);
  const focusList = React.useRef(false);
  const lastChosen = React.useRef(-1);
  const draftTimer = React.useRef<number | null>(null);
  const alive = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      scrollRun.current?.stop();
      if (draftTimer.current) window.clearTimeout(draftTimer.current);
    };
  }, []);

  /* The pinned list's measured height, bound to its content when it arrives. */
  const [listNode, setListNode] = React.useState<HTMLDivElement | null>(null);
  const [listH, setListH] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!listNode) return;
    const read = () => setListH(Math.round(listNode.offsetHeight));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(listNode);
    return () => ro.disconnect();
  }, [listNode]);

  /* Width decides only what the Show all toggle reports; CSS does the hiding. */
  const [panelNode, setPanelNode] = React.useState<HTMLDivElement | null>(null);
  React.useEffect(() => {
    if (!panelNode) return;
    const read = () => setNarrow(panelNode.clientWidth < 480);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(panelNode);
    return () => ro.disconnect();
  }, [panelNode]);

  // The heading of a freshly dropped list takes focus, so a screen reader
  // lands on "4 things to mend" rather than on a Submit that did nothing.
  React.useEffect(() => {
    if (!focusList.current) return;
    focusList.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [round]);

  const open = listed.length > 0;
  const left = listed.filter((item) => errorOf(item.id, current)).length;
  const allMended = open && left === 0;
  const answered = fields.filter((f) => isAnswered(current[f.id])).length;
  const showOpen = expanded ?? !narrow;

  const setValue = (id: string, value: MendValue) => {
    const next = { ...current, [id]: value };
    if (values === undefined) setOwn(next);
    onValuesChange?.(next);
    onFieldChange?.(id, value, next);
    if (phase === "sent" || phase === "failed") setPhase("idle");
    const field = fieldById.get(id);
    if (!field || !listed.some((item) => item.id === id)) return;
    // Spoken from the new value, in the edit that caused it.
    const was = errorOf(id, current);
    const now = errorOf(id, next);
    if (was && !now) {
      const remaining = listed.filter((item) => errorOf(item.id, next)).length;
      setAnnouncement(
        remaining === 0
          ? `${field.label} mended. Everything is mended; submit again.`
          : `${field.label} mended. ${remaining} left.`,
      );
    } else if (!was && now) {
      setAnnouncement(`${field.label} needs mending again: ${now}.`);
    }
  };

  const focusControl = (id: string) => {
    const wrap = wraps.current.get(id);
    const target =
      wrap?.querySelector<HTMLElement>("input[data-mend-control]:checked") ??
      wrap?.querySelector<HTMLElement>("[data-mend-control]");
    target?.focus({ preventScroll: true });
  };

  const goTo = (id: string) => {
    const body = bodyRef.current;
    const wrap = wraps.current.get(id);
    if (!body || !wrap) return;
    onMend?.(id);
    lastChosen.current = listed.findIndex((item) => item.id === id);
    scrollRun.current?.stop();
    if (narrow) setExpanded(false);
    // Where the field should sit: just under the pinned list. Re-read on
    // every frame, because the page is still moving while the scroll runs —
    // a list dropping in, a narrow list folding to its one line, error lines
    // opening above the field — and the list sits in flow above the form, so
    // its own change moves the field by the same amount and cancels out.
    const target = () => {
      const pinned = stickyRef.current?.offsetHeight ?? 0;
      const y =
        body.scrollTop +
        wrap.getBoundingClientRect().top -
        body.getBoundingClientRect().top -
        pinned -
        12;
      const max = body.scrollHeight - body.clientHeight;
      return Math.round(Math.min(Math.max(0, y), Math.max(0, max)));
    };
    const arrive = () => {
      setPulse((p) => ({ id, n: (p?.n ?? 0) + 1 }));
      focusControl(id);
    };
    const from = body.scrollTop;
    if (!motionSafe || Math.abs(target() - from) < 2) {
      body.scrollTop = target();
      arrive();
      return;
    }
    scrollRun.current = animate(0, 1, {
      ...springs.glide,
      onUpdate: (p) => {
        body.scrollTop = from + (target() - from) * p;
      },
      onComplete: () => {
        body.scrollTop = target();
        arrive();
      },
    });
  };

  const next = () => {
    if (!open) return;
    const order = listed.map((item) => item.id);
    for (let step = 1; step <= order.length; step++) {
      const i = (lastChosen.current + step) % order.length;
      const id = order[i];
      if (id && errorOf(id, current)) {
        goTo(id);
        return;
      }
    }
    submitRef.current?.focus();
  };

  const drop = (problems: Listed[]) => {
    setListed(problems);
    setRound((r) => r + 1);
    setExpanded(null);
    lastChosen.current = -1;
    focusList.current = true;
    const first = fieldById.get(problems[0]?.id ?? "");
    setAnnouncement(
      `${plural(problems.length, "thing", "things")} to mend before this can be sent.${
        first ? ` First: ${first.label}.` : ""
      }`,
    );
  };

  const send = () => {
    const snapshot = current;
    setPhase("sending");
    setAnnouncement("Sending your application.");
    let result: ReturnType<NonNullable<MendListProps["onSubmit"]>> = undefined;
    try {
      result = onSubmit?.(snapshot);
    } catch {
      setPhase("failed");
      setAnnouncement(
        "Couldn't send your application. Every answer is still here.",
      );
      return;
    }
    Promise.resolve(result).then(
      (r) => {
        if (!alive.current) return;
        const answer = r as MendSubmitResult | undefined;
        const raw =
          answer && typeof answer === "object" ? answer.fieldErrors : undefined;
        const entries = Object.entries(raw ?? {}).filter(([id]) =>
          fieldById.has(id),
        );
        if (entries.length > 0) {
          const next: Record<
            string,
            { message: string; value: MendValue | undefined }
          > = {};
          for (const [id, message] of entries) {
            next[id] = { message, value: snapshot[id] };
          }
          setServerErrors(next);
          setPhase("idle");
          const order = fields
            .filter((f) => next[f.id])
            .map((f) => ({ id: f.id, fix: next[f.id]?.message ?? "" }));
          onInvalid?.(order.map((item) => item.id));
          drop(order);
          return;
        }
        setPhase("sent");
        setAnnouncement("Application submitted.");
      },
      () => {
        if (!alive.current) return;
        setPhase("failed");
        setAnnouncement(
          "Couldn't send your application. Every answer is still here.",
        );
      },
    );
  };

  const submit = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (disabled || phase === "sending" || status === "loading") return;
    setAttempted(true);
    const problems = problemsOf(current);
    if (problems.length > 0) {
      if (phase !== "idle") setPhase("idle");
      onInvalid?.(problems.map((p) => p.id));
      drop(problems);
      return;
    }
    setListed([]);
    send();
  };

  const saveDraft = () => {
    if (disabled || draft === "saving") return;
    if (draftTimer.current) window.clearTimeout(draftTimer.current);
    setDraft("saving");
    let result: void | Promise<void> = undefined;
    try {
      result = onSaveDraft?.(current);
    } catch {
      setDraft("idle");
      setAnnouncement("Couldn't save the draft.");
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (!alive.current) return;
        setDraft("saved");
        setAnnouncement("Draft saved.");
        draftTimer.current = window.setTimeout(() => setDraft("idle"), 1600);
      },
      () => {
        if (!alive.current) return;
        setDraft("idle");
        setAnnouncement("Couldn't save the draft.");
      },
    );
  };

  /* The submit button's progress: a slow creep while waiting, a quick finish. */
  const fill = useMotionValue(0);
  React.useEffect(() => {
    if (phase === "sending") {
      fill.jump(0);
      const run = animate(fill, 0.85, {
        duration: motionSafe ? 3.2 : 1.6,
        ease: [0.12, 0.7, 0.3, 1],
      });
      return () => run.stop();
    }
    const run =
      phase === "sent"
        ? animate(fill, 1, { duration: durations.base, ease: easings.enter })
        : animate(fill, 0, exitFor(durations.slow));
    return () => run.stop();
  }, [fill, motionSafe, phase]);

  const step = cascade(listed.length);

  /* ------------------------------ the list ------------------------------ */

  const marker = (index: number, mended: boolean) => {
    if (listStyle === "numbered") {
      return (
        <span
          aria-hidden
          className={cn(
            "relative inline-flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] tabular-nums transition-colors",
            mended
              ? "border-transparent bg-(--ml-accent) text-background"
              : "border-hairline-strong text-ink-2",
          )}
        >
          {mended ? <Check strokeWidth={3} className="size-3" /> : index + 1}
        </span>
      );
    }
    if (listStyle === "chips") {
      return (
        <span
          aria-hidden
          className="relative inline-flex size-3.5 shrink-0 items-center justify-center"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {mended ? (
              <motion.span
                key="ok"
                className="inline-flex text-(--ml-accent)"
                initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
              >
                <Check strokeWidth={3} className="size-3.5" />
              </motion.span>
            ) : (
              <motion.span
                key="dot"
                className="size-1.5 rounded-full bg-danger"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              />
            )}
          </AnimatePresence>
        </span>
      );
    }
    return (
      <span
        aria-hidden
        className={cn(
          "relative mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          mended
            ? "border-transparent bg-(--ml-accent) text-background"
            : "border-[color-mix(in_oklab,var(--danger)_60%,transparent)] text-danger",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {mended ? (
            <motion.span
              key="ok"
              className="inline-flex"
              initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe ? springs.flick : { duration: durations.fast }
              }
            >
              <Check strokeWidth={3} className="size-2.5" />
            </motion.span>
          ) : (
            <motion.span
              key="bang"
              className="font-mono text-[9px] leading-none font-semibold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            >
              !
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    );
  };

  const strike = (mended: boolean) => (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-0 left-0 h-px bg-(--ml-accent)"
      style={{ originX: 0 }}
      initial={false}
      animate={{ scaleX: mended ? 1 : 0 }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
    />
  );

  const items = listed.map((item, index) => {
    const field = fieldById.get(item.id);
    if (!field) return null;
    const err = errorOf(item.id, current);
    const mended = err === null;
    const fix = err ?? item.fix;
    // A mended item keeps its place and says so; the fix it needed would only
    // be stale ("55 to go") once the field passes.
    const fixLine = (
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={mended ? "mended" : "fix"}
          className={cn(
            "inline-block max-w-full truncate align-top",
            mended && "text-(--ml-accent)",
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          {mended ? "Mended" : fix}
        </motion.span>
      </AnimatePresence>
    );
    const label = (
      <span className="relative inline-block max-w-full truncate align-top font-medium text-foreground">
        {field.label}
        {strike(mended)}
      </span>
    );
    const button =
      listStyle === "chips" ? (
        <button
          type="button"
          onClick={() => goTo(item.id)}
          aria-label={`${field.label}: ${mended ? "mended" : fix}`}
          aria-controls={`${uid}-${field.id}`}
          title={`${field.label} · ${fix}`}
          className={cn(
            "inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 text-[12px] transition-colors hover:bg-surface-2",
            mended
              ? "border-hairline"
              : "border-[color-mix(in_oklab,var(--danger)_30%,var(--hairline))]",
            RING,
          )}
        >
          {marker(index, mended)}
          {label}
          <span
            className={cn(
              "min-w-0 truncate text-ink-3 transition-opacity",
              mended && "opacity-80",
            )}
          >
            {fixLine}
          </span>
        </button>
      ) : listStyle === "numbered" ? (
        <button
          type="button"
          onClick={() => goTo(item.id)}
          aria-label={`${index + 1}. ${field.label}: ${mended ? "mended" : fix}`}
          aria-controls={`${uid}-${field.id}`}
          className={cn(
            "flex w-full min-w-0 items-center gap-2.5 rounded-2 px-2 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-2",
            RING,
          )}
        >
          {marker(index, mended)}
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="max-w-[45%] shrink-0">{label}</span>
            <span
              className={cn(
                "min-w-0 truncate text-[11.5px] text-ink-3 transition-opacity",
                mended && "opacity-80",
              )}
            >
              {fixLine}
            </span>
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => goTo(item.id)}
          aria-label={`${field.label}: ${mended ? "mended" : fix}`}
          aria-controls={`${uid}-${field.id}`}
          className={cn(
            "flex w-full min-w-0 items-start gap-2.5 rounded-2 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2",
            RING,
          )}
        >
          {marker(index, mended)}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[12.5px] leading-5">{label}</span>
            <span
              className={cn(
                "truncate text-[11.5px] leading-4 text-ink-3 transition-opacity",
                mended && "opacity-80",
              )}
            >
              {fixLine}
            </span>
          </span>
        </button>
      );
    return (
      <motion.li
        key={item.id}
        className={cn("min-w-0", listStyle === "chips" && "max-w-full")}
        initial={
          round === 0
            ? false
            : motionSafe
              ? { opacity: 0, y: -distances.step }
              : { opacity: 0 }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={
          motionSafe
            ? {
                y: { ...springs.snap, delay: index * step },
                opacity: { duration: durations.base, delay: index * step },
              }
            : { duration: durations.fast }
        }
      >
        {button}
      </motion.li>
    );
  });

  const nextField = listed.find((item) => errorOf(item.id, current));
  const nextLabel = nextField ? fieldById.get(nextField.id)?.label : undefined;

  const list = (
    <nav
      aria-labelledby={headId}
      className={cn(
        "flex flex-col gap-1.5 bg-surface-0",
        listStyle === "panel" &&
          "rounded-3 border border-hairline-strong p-1.5",
        listStyle === "chips" &&
          "rounded-3 border border-hairline px-2.5 pt-1.5 pb-2.5",
        listStyle === "numbered" &&
          "rounded-r-3 border-l-[3px] border-(--ml-accent) py-1.5 pr-1.5 pl-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-0.5 pl-1">
        <span
          aria-hidden
          className="inline-flex size-4 shrink-0 items-center justify-center"
        >
          {allMended ? (
            <Check strokeWidth={2.5} className="size-4 text-(--ml-accent)" />
          ) : (
            <CircleAlert className="size-4 text-danger" />
          )}
        </span>
        <h3
          id={headId}
          ref={headingRef}
          tabIndex={-1}
          className={cn(
            "min-w-0 flex-1 rounded-1 text-[13px] font-semibold text-foreground",
            RING,
          )}
        >
          {allMended ? (
            "All mended · Submit again"
          ) : (
            <>
              <span className="sr-only">
                {plural(left, "thing", "things")} to mend
              </span>
              <span aria-hidden>
                <Roll value={left} motionSafe={motionSafe} />
                <span className="hidden @min-[24rem]:inline">
                  {left === 1 ? " thing" : " things"}
                </span>{" "}
                to mend
              </span>
            </>
          )}
        </h3>
        {!allMended ? (
          <button
            type="button"
            onClick={next}
            aria-label={
              nextLabel ? `Next to mend: ${nextLabel}` : "Next to mend"
            }
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-[12px] font-medium text-(--ml-accent) transition-colors hover:bg-surface-2",
              RING,
            )}
          >
            Next
            <ArrowDown aria-hidden className="size-3.5" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setExpanded(!showOpen)}
          aria-expanded={showOpen}
          aria-controls={itemsId}
          aria-label={
            showOpen ? "Hide the mend list" : "Show the whole mend list"
          }
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground",
            RING,
          )}
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform",
              expanded === null
                ? "@min-[30rem]:rotate-180"
                : expanded
                  ? "rotate-180"
                  : "",
            )}
          />
        </button>
      </div>
      {listStyle === "numbered" ? (
        <div
          aria-hidden
          className="mx-1 h-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ml-accent)_14%,transparent)]"
        >
          <motion.div
            className="h-full w-full rounded-full bg-(--ml-accent)"
            style={{ originX: 0 }}
            initial={false}
            animate={{
              scaleX: listed.length
                ? r2((listed.length - left) / listed.length)
                : 0,
            }}
            transition={
              motionSafe ? springs.glide : { duration: durations.fast }
            }
          />
        </div>
      ) : null}
      <ol
        key={round}
        id={itemsId}
        className={cn(
          SHOW[listStyle === "chips" ? "flex" : "grid"][
            expanded === null ? "auto" : expanded ? "open" : "shut"
          ],
          listStyle === "panel" &&
            "grid-cols-1 gap-0.5 @min-[36rem]:grid-cols-2",
          listStyle === "chips" && "flex-wrap gap-1.5",
          listStyle === "numbered" && "grid-cols-1 gap-0",
        )}
      >
        {items}
      </ol>
    </nav>
  );

  /* ------------------------------- render ------------------------------- */

  return (
    <div className={cn("@container w-full", className)}>
      <div
        ref={setPanelNode}
        className="relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
        style={
          {
            height,
            "--ml-accent": accent,
          } as React.CSSProperties
        }
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] leading-5 font-semibold">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-[12px] leading-4 text-ink-3">{subtitle}</p>
            ) : null}
          </div>
          {status === "ready" ? (
            <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-surface-0 px-2 font-mono text-[10.5px] text-ink-2 tabular-nums">
              <span className="relative h-1 w-8 overflow-hidden rounded-full bg-surface-2">
                <motion.span
                  className="absolute inset-0 rounded-full bg-(--ml-accent)"
                  style={{ originX: 0 }}
                  initial={false}
                  animate={{
                    scaleX: fields.length ? r2(answered / fields.length) : 0,
                  }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                />
              </span>
              {answered} of {fields.length} answered
            </span>
          ) : null}
        </header>

        <form
          noValidate
          aria-labelledby={titleId}
          onSubmit={submit}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <div
            ref={bodyRef}
            onWheel={() => scrollRun.current?.stop()}
            onTouchStart={() => scrollRun.current?.stop()}
            className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6"
            style={{ scrollPaddingTop: (open ? (listH ?? 0) : 0) + 12 }}
          >
            <div
              ref={stickyRef}
              className="sticky top-0 z-10 -mx-4 bg-card px-4"
            >
              <AnimatePresence initial={false}>
                {open ? (
                  <motion.div
                    key="mend"
                    className="overflow-hidden"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: listH ?? "auto", opacity: 1 }}
                    exit={{
                      height: 0,
                      opacity: 0,
                      transition: exitFor(durations.slow),
                    }}
                    transition={
                      motionSafe
                        ? {
                            height: springs.glide,
                            opacity: { duration: durations.base },
                          }
                        : { duration: durations.fast }
                    }
                  >
                    <div ref={setListNode} className="pt-3 pb-2">
                      {list}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {open ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-full h-3 bg-linear-to-b from-card to-transparent"
                />
              ) : null}
            </div>

            <AnimatePresence initial={false}>
              {phase === "failed" || phase === "sent" ? (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                  transition={
                    motionSafe
                      ? {
                          y: springs.snap,
                          opacity: { duration: durations.base },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-3 border px-3 py-2.5 text-[12.5px]",
                    phase === "failed"
                      ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))]"
                      : "border-[color-mix(in_oklab,var(--ml-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--ml-accent)_7%,var(--card))]",
                  )}
                >
                  {phase === "failed" ? (
                    <>
                      <CircleAlert
                        aria-hidden
                        className="size-4 shrink-0 text-danger"
                      />
                      <span className="min-w-0 flex-1">
                        Couldn&apos;t send your application. Every answer is
                        still here.
                      </span>
                      <button
                        type="button"
                        onClick={() => submit()}
                        className={cn(
                          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline-strong bg-card px-2.5 text-[12px] font-medium transition-colors hover:bg-surface-2",
                          RING,
                        )}
                      >
                        <RotateCcw aria-hidden className="size-3.5" />
                        Try again
                      </button>
                    </>
                  ) : (
                    <>
                      <Check
                        aria-hidden
                        strokeWidth={2.5}
                        className="size-4 shrink-0 text-(--ml-accent)"
                      />
                      <span className="min-w-0 flex-1">
                        Submitted. The panel replies by 30 November.
                      </span>
                    </>
                  )}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {status === "loading" ? (
              <div aria-hidden className={cn("mt-4 flex flex-col", d.sections)}>
                {[0, 1, 2].map((s) => (
                  <div key={s} className="flex flex-col gap-3">
                    <span className="h-3.5 w-28 rounded-1 bg-surface-2" />
                    <div className="grid grid-cols-1 gap-3 @min-[36rem]:grid-cols-2">
                      {[0, 1].map((f) => (
                        <div key={f} className="flex flex-col gap-1.5">
                          <span className="h-3 w-20 rounded-1 bg-surface-2" />
                          <span
                            className={cn("rounded-2 bg-surface-2", d.control)}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className={cn("mt-4 flex flex-col", d.sections)}
                aria-busy={phase === "sending" || undefined}
              >
                {sections.map((section) => (
                  <fieldset key={section.id} className="min-w-0">
                    <legend className="text-[13px] font-semibold text-foreground">
                      {section.title}
                    </legend>
                    {section.description ? (
                      <p className="mt-0.5 text-[12px] leading-4 text-ink-3">
                        {section.description}
                      </p>
                    ) : null}
                    <div
                      className={cn(
                        "mt-3 grid grid-cols-1 gap-x-4 @min-[36rem]:grid-cols-2",
                        d.fields,
                      )}
                    >
                      {section.fields.map((field) => {
                        const error = errorOf(field.id, current);
                        return (
                          <Field
                            key={field.id}
                            field={field}
                            value={current[field.id]}
                            error={error}
                            showError={attempted}
                            uid={uid}
                            density={d}
                            disabled={disabled}
                            motionSafe={motionSafe}
                            pulse={pulse?.id === field.id ? pulse.n : null}
                            onChange={(v) => setValue(field.id, v)}
                            bindWrap={(node) => {
                              if (node) wraps.current.set(field.id, node);
                              else wraps.current.delete(field.id);
                            }}
                          />
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-3">
            <button
              type="button"
              onClick={saveDraft}
              title={draft === "saved" ? "Draft saved" : "Save draft"}
              disabled={disabled || status === "loading"}
              aria-busy={draft === "saving" || undefined}
              className={cn(
                "mr-auto inline-flex h-9 items-center justify-center gap-1.5 rounded-2 border border-hairline-strong px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 @min-[24rem]:px-3",
                RING,
              )}
            >
              <span className="relative inline-flex size-3.5 items-center justify-center">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={draft}
                    className="inline-flex"
                    initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={
                      motionSafe ? springs.flick : { duration: durations.fast }
                    }
                  >
                    {draft === "saving" ? (
                      <LoaderCircle
                        aria-hidden
                        className={cn("size-3.5", motionSafe && "animate-spin")}
                      />
                    ) : draft === "saved" ? (
                      <Check
                        aria-hidden
                        strokeWidth={2.5}
                        className="size-3.5 text-(--ml-accent)"
                      />
                    ) : (
                      <Save aria-hidden className="size-3.5" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              <span className="sr-only @min-[24rem]:not-sr-only">
                {draft === "saved" ? "Draft saved" : "Save draft"}
              </span>
            </button>
            <button
              ref={submitRef}
              type="submit"
              disabled={disabled || status === "loading"}
              aria-disabled={phase === "sending" || undefined}
              aria-busy={phase === "sending" || undefined}
              className={cn(
                "relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-2 bg-foreground px-4 text-[13px] font-medium text-background transition-shadow disabled:cursor-not-allowed disabled:opacity-50",
                RING,
                allMended &&
                  "shadow-[0_0_0_3px_color-mix(in_oklab,var(--ml-accent)_35%,transparent)]",
                phase === "sending" && "cursor-progress",
              )}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 bg-[color-mix(in_oklab,var(--ml-accent)_70%,transparent)]"
                style={{ scaleX: fill, originX: 0 }}
              />
              <span className="relative inline-flex items-center gap-1.5">
                {phase === "sending" ? (
                  <LoaderCircle
                    aria-hidden
                    className={cn("size-3.5", motionSafe && "animate-spin")}
                  />
                ) : phase === "sent" ? (
                  <Check aria-hidden strokeWidth={2.5} className="size-3.5" />
                ) : null}
                {phase === "sending"
                  ? "Submitting…"
                  : phase === "sent"
                    ? "Submitted"
                    : submitLabel}
              </span>
            </button>
          </footer>
        </form>

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </div>
    </div>
  );
}
