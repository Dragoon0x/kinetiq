"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import { Check, RotateCcw, Send, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type FiledStepsValues = Record<string, string>;

export type FiledStepsField = {
  id: string;
  label: string;
  /** @default "text" */
  kind?: "text" | "email" | "tel" | "textarea" | "choice";
  options?: { value: string; label: string }[];
  placeholder?: string;
  required?: boolean;
  /** Return a sentence saying what is wrong, or null. */
  validate?: (value: string, values: FiledStepsValues) => string | null;
};

export type FiledStepsStep = {
  id: string;
  /** The card's heading. */
  title: string;
  /** The tab's name. @default the title */
  short?: string;
  /** One line under the heading. */
  description?: string;
  fields: FiledStepsField[];
  /** What the tab says once filed. @default the field values, joined */
  summary?: (values: FiledStepsValues) => string;
  /** Offer "Skip for now", filing the card unfinished. @default true */
  skippable?: boolean;
};

/** How a step was filed: finished, or put away unfinished. */
export type FiledStepsMark = "done" | "incomplete";

export type FiledStepsTabStyle = "folder" | "index" | "pill";
export type FiledStepsDensity = "compact" | "regular" | "roomy";
export type FiledStepsStatus = "ready" | "loading" | "error";

export type FiledStepsProps = {
  /** The steps, in order; each is a card. @default defaultFiledStepsSteps */
  steps?: FiledStepsStep[];
  /** Controlled field values. */
  value?: FiledStepsValues;
  /** Initial values when uncontrolled. @default defaultFiledStepsValues */
  defaultValue?: FiledStepsValues;
  /** Fires from the field that changed, with every value. */
  onValueChange?: (values: FiledStepsValues) => void;
  /** Steps already filed when the wizard opens. @default defaultFiledStepsFiled */
  defaultFiled?: Record<string, FiledStepsMark>;
  /** Fires when a card is filed — finished (true) or skipped for now (false). */
  onStepComplete?: (
    stepId: string,
    values: FiledStepsValues,
    complete: boolean,
  ) => void;
  /** Fires when a tab lifts its card back up for editing. */
  onReopen?: (stepId: string) => void;
  /** Fires from Send once every step is finished. */
  onFinish?: (values: FiledStepsValues) => void;
  /** Folder tabs on a drawer, overlapping index strips, or rounded pills. @default "folder" */
  tabStyle?: FiledStepsTabStyle;
  /** How many of the next cards peek above the current one, 0 to 3. @default 2 */
  stackDepth?: number;
  /** The front card's edge, tab numbers and primary buttons — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Card padding, field height and type size. @default "regular" */
  density?: FiledStepsDensity;
  /** The wizard's heading. @default "Book a site survey" */
  title?: string;
  /** One line under the heading. @default "Fieldline · Survey desk" */
  subtitle?: string;
  /** The last card's button. @default "Send request" */
  finishLabel?: string;
  /** Whether the steps have arrived. @default "ready" */
  status?: FiledStepsStatus;
  /** "Try again" was pressed after the steps failed to load. */
  onRetry?: () => void;
  /** Height of the surface in px. @default 540 */
  height?: number;
  /** Read only: nothing can be filed, reopened or sent. @default false */
  disabled?: boolean;
  /** Classes for the surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Booking a Fieldline site survey: who, where, what, when and access. */
export const defaultFiledStepsSteps: FiledStepsStep[] = [
  {
    id: "contact",
    title: "Who should we contact?",
    short: "Contact",
    fields: [
      {
        id: "name",
        label: "Full name",
        required: true,
        placeholder: "Your name",
      },
      {
        id: "email",
        label: "Email",
        kind: "email",
        required: true,
        placeholder: "you@company.example",
        validate: (v) =>
          EMAIL.test(v.trim())
            ? null
            : "Enter an email like ada@fernworks.example.",
      },
    ],
    summary: (v) => v.name?.trim() || "No name yet",
  },
  {
    id: "site",
    title: "Where is the site?",
    short: "Site",
    description: "The surveyor meets you at this address.",
    fields: [
      {
        id: "address",
        label: "Address",
        required: true,
        placeholder: "Street and number",
      },
      {
        id: "postcode",
        label: "Postcode",
        required: true,
        placeholder: "e.g. CB4 1YD",
        validate: (v) =>
          /^[A-Za-z0-9 ]{5,8}$/.test(v.trim())
            ? null
            : "Enter the postcode, 5 to 8 letters and numbers.",
      },
    ],
    summary: (v) =>
      [v.address?.trim(), v.postcode?.trim()].filter(Boolean).join(", ") ||
      "No address yet",
  },
  {
    id: "survey",
    title: "What kind of survey?",
    short: "Survey",
    description: "You can add another type after the first visit.",
    fields: [
      {
        id: "type",
        label: "Survey type",
        kind: "choice",
        required: true,
        options: [
          { value: "topo", label: "Topographic" },
          { value: "drainage", label: "Drainage CCTV" },
          { value: "utilities", label: "Utility trace" },
        ],
      },
    ],
  },
  {
    id: "timing",
    title: "When suits you?",
    short: "Timing",
    fields: [
      {
        id: "window",
        label: "Visit window",
        kind: "choice",
        required: true,
        options: [
          { value: "next", label: "Next week" },
          { value: "fortnight", label: "Within a fortnight" },
          { value: "flexible", label: "Flexible" },
        ],
      },
    ],
  },
  {
    id: "access",
    title: "Anything about access?",
    short: "Access",
    description: "Gates, parking, dogs, a key safe.",
    fields: [
      {
        id: "notes",
        label: "Access notes",
        kind: "textarea",
        placeholder: "Optional",
      },
    ],
    summary: (v) => v.notes?.trim() || "No notes",
  },
];

export const defaultFiledStepsValues: FiledStepsValues = {
  name: "Ada Mensah",
  email: "ada@fernworks.example",
  address: "Unit 4, Coldbrook Yard",
  postcode: "",
};

/** Contact filed; the site put away without its postcode. */
export const defaultFiledStepsFiled: Record<string, FiledStepsMark> = {
  contact: "done",
  site: "incomplete",
};

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FIELD_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1";

const DENSITY: Record<
  FiledStepsDensity,
  { card: string; gap: string; field: string; text: string }
> = {
  compact: {
    card: "p-3",
    gap: "gap-2.5",
    field: "h-8",
    text: "text-[12px] leading-[18px]",
  },
  regular: {
    card: "p-4",
    gap: "gap-3",
    field: "h-9",
    text: "text-[13px] leading-5",
  },
  roomy: {
    card: "p-5",
    gap: "gap-4",
    field: "h-10",
    text: "text-sm leading-6",
  },
};

type Rect = { x: number; y: number; w: number; h: number };

const r1 = (v: number) => Math.round(v * 10) / 10;

function rectIn(el: Element, root: Element): Rect {
  const a = el.getBoundingClientRect();
  const b = root.getBoundingClientRect();
  return {
    x: r1(a.left - b.left),
    y: r1(a.top - b.top),
    w: r1(a.width),
    h: r1(a.height),
  };
}

function fieldError(
  f: FiledStepsField,
  values: FiledStepsValues,
): string | null {
  const v = values[f.id] ?? "";
  if (!v.trim()) return f.required ? `${f.label} is needed.` : null;
  return f.validate?.(v, values) ?? null;
}

const stepErrors = (s: FiledStepsStep, values: FiledStepsValues) =>
  s.fields.flatMap((f) => {
    const e = fieldError(f, values);
    return e ? [{ field: f.id, text: e }] : [];
  });

function summaryOf(s: FiledStepsStep, values: FiledStepsValues): string {
  if (s.summary) return s.summary(values);
  const parts = s.fields
    .map((f) => {
      const v = values[f.id]?.trim();
      if (!v) return "";
      return f.kind === "choice"
        ? (f.options?.find((o) => o.value === v)?.label ?? v)
        : v;
    })
    .filter(Boolean);
  return parts.join(", ") || "Nothing yet";
}

/** True from the frame after the first commit: what arrives later animates in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

/* ----------------------------------------------------------------------- */
/*                                  Fields                                  */
/* ----------------------------------------------------------------------- */

function ChoiceField({
  field,
  value,
  invalid,
  describedBy,
  labelId,
  disabled,
  motionSafe,
  uid,
  onChange,
}: {
  field: FiledStepsField;
  value: string;
  invalid: boolean;
  describedBy?: string;
  labelId: string;
  disabled: boolean;
  motionSafe: boolean;
  uid: string;
  onChange: (v: string) => void;
}) {
  const options = field.options ?? [];
  const refs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const tabbable = options.some((o) => o.value === value)
    ? value
    : options[0]?.value;
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const n = options.length;
    const map: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: n - 1,
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const o = options[((to % n) + n) % n];
    if (!o) return;
    refs.current.get(o.value)?.focus();
    if (!disabled) onChange(o.value);
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      data-fs-field={field.id}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((o, i) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current.set(o.value, el);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={disabled || undefined}
            tabIndex={o.value === tabbable ? 0 : -1}
            onClick={() => {
              if (!disabled) onChange(o.value);
            }}
            onKeyDown={(event) => onKeyDown(event, i)}
            className={cn(
              "relative inline-flex h-8 items-center rounded-full border px-3 text-[12px] transition-colors",
              FOCUS,
              checked
                ? "border-transparent text-foreground"
                : invalid
                  ? "border-danger/60 text-ink-2 hover:bg-surface-2"
                  : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
            )}
          >
            {checked ? (
              <motion.span
                layoutId={`${uid}-${field.id}-pill`}
                aria-hidden
                className="absolute inset-0 rounded-full border border-(--fs-accent) bg-(--fs-wash)"
                transition={motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The tabs                                 */
/* ----------------------------------------------------------------------- */

function tabShape(style: FiledStepsTabStyle) {
  if (style === "pill")
    return "rounded-full border border-hairline-strong bg-card px-3";
  if (style === "index")
    return "-ml-2 rounded-t-1 rounded-b-1 border border-t-2 border-hairline-strong border-t-(--fs-accent) bg-card px-3 shadow-[0_1px_0_color-mix(in_oklab,var(--foreground)_6%,transparent)] first:ml-0";
  return "rounded-t-3 border border-b-0 border-hairline-strong bg-card px-3.5 [clip-path:polygon(7px_0,calc(100%-7px)_0,100%_100%,0_100%)]";
}

type CardLook = {
  uid: string;
  d: (typeof DENSITY)[FiledStepsDensity];
  disabled: boolean;
  motionSafe: boolean;
};

/** One step's card: its fields, and Continue, Skip for now, or Save and Cancel. */
function StepCard({
  step,
  number,
  count,
  values,
  showErrors,
  isReopened,
  interactive,
  hidden,
  cardRef,
  look,
  onField,
  onSubmit,
  onSkip,
  onCancel,
}: {
  step: FiledStepsStep;
  number: number;
  count: number;
  values: FiledStepsValues;
  showErrors: boolean;
  isReopened: boolean;
  interactive: boolean;
  hidden: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
  look: CardLook;
  onField: (id: string, value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const { uid, d, disabled, motionSafe } = look;
  const headingId = `${uid}-h-${step.id}`;
  return (
    <div
      ref={interactive ? cardRef : undefined}
      data-fs-card={interactive ? "" : undefined}
      role="group"
      aria-labelledby={headingId}
      onKeyDown={(event) => {
        if (event.key === "Escape" && isReopened) {
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        }
      }}
      className={cn(
        "relative flex max-h-full flex-col overflow-hidden rounded-3 border border-hairline-strong bg-card shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_6%,transparent),0_12px_28px_-12px_color-mix(in_oklab,var(--foreground)_22%,transparent)]",
        hidden && "opacity-0",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-(--fs-accent)"
      />
      <div
        className={cn(
          "flex [scrollbar-width:thin] flex-col overflow-y-auto",
          d.card,
          d.gap,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3
              id={headingId}
              data-fs-heading={interactive ? "" : undefined}
              tabIndex={-1}
              className="rounded-1 text-[14px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            >
              {step.title}
            </h3>
            {step.description ? (
              <p className="text-[12px] leading-4 text-ink-3">
                {step.description}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
            {isReopened ? "Editing · " : ""}
            {number} / {count}
          </span>
        </div>
        {step.fields.map((f) => {
          const err = showErrors ? fieldError(f, values) : null;
          const fieldId = `${uid}-f-${f.id}`;
          const labelId = `${uid}-l-${f.id}`;
          const errId = `${uid}-e-${f.id}`;
          const v = values[f.id] ?? "";
          return (
            <div key={f.id} className="flex flex-col gap-1">
              <label
                id={labelId}
                htmlFor={f.kind === "choice" ? undefined : fieldId}
                className="text-[12px] font-medium text-ink-2"
              >
                {f.label}
                {!f.required ? (
                  <span className="font-normal text-ink-3"> · optional</span>
                ) : null}
              </label>
              {f.kind === "choice" ? (
                <ChoiceField
                  field={f}
                  value={v}
                  invalid={Boolean(err)}
                  describedBy={err ? errId : undefined}
                  labelId={labelId}
                  disabled={disabled}
                  motionSafe={motionSafe}
                  uid={uid}
                  onChange={(next) => onField(f.id, next)}
                />
              ) : f.kind === "textarea" ? (
                <textarea
                  id={fieldId}
                  data-fs-field={f.id}
                  value={v}
                  rows={3}
                  readOnly={disabled}
                  placeholder={f.placeholder}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? errId : undefined}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    onField(f.id, text);
                  }}
                  className={cn(
                    "w-full resize-none rounded-2 border bg-surface-0 px-3 py-2 text-foreground placeholder:text-ink-3",
                    d.text,
                    FIELD_RING,
                    err ? "border-danger" : "border-input",
                  )}
                />
              ) : (
                <input
                  id={fieldId}
                  data-fs-field={f.id}
                  type={
                    f.kind === "email"
                      ? "email"
                      : f.kind === "tel"
                        ? "tel"
                        : "text"
                  }
                  value={v}
                  readOnly={disabled}
                  placeholder={f.placeholder}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? errId : undefined}
                  onChange={(event) => {
                    const text = event.currentTarget.value;
                    onField(f.id, text);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onSubmit();
                    }
                  }}
                  className={cn(
                    "w-full rounded-2 border bg-surface-0 px-3 text-foreground placeholder:text-ink-3",
                    d.field,
                    d.text,
                    FIELD_RING,
                    err ? "border-danger" : "border-input",
                  )}
                />
              )}
              {err ? (
                <p
                  id={errId}
                  className="flex items-center gap-1 text-[11px] leading-4 text-danger"
                >
                  <TriangleAlert aria-hidden className="size-3 shrink-0" />
                  {err}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        className={cn(
          "flex flex-wrap items-center justify-end gap-2 border-t border-hairline px-4 py-2.5",
        )}
      >
        {isReopened ? (
          <button
            type="button"
            onClick={() => onCancel()}
            className={cn(BUTTON, QUIET, FOCUS)}
          >
            Cancel
          </button>
        ) : step.skippable !== false ? (
          <button
            type="button"
            onClick={() => onSkip()}
            aria-disabled={disabled || undefined}
            className={cn(BUTTON, QUIET, FOCUS)}
          >
            Skip for now
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onSubmit()}
          aria-disabled={disabled || undefined}
          className={cn(BUTTON, PRIMARY, FOCUS)}
        >
          {isReopened ? "Save" : "Continue"}
        </button>
      </div>
    </div>
  );
}

/** The last card: every step's summary, what still needs finishing, and Send. */
function FinishCard({
  steps,
  values,
  blocked,
  sent,
  finishLabel,
  interactive,
  cardRef,
  look,
  onFinish,
}: {
  steps: FiledStepsStep[];
  values: FiledStepsValues;
  blocked: string[];
  sent: boolean;
  finishLabel: string;
  interactive: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
  look: CardLook;
  onFinish: () => void;
}) {
  const { uid, disabled, motionSafe } = look;
  return (
    <div
      ref={interactive ? cardRef : undefined}
      data-fs-card={interactive ? "" : undefined}
      role="group"
      aria-labelledby={`${uid}-h-finish`}
      className="relative flex flex-col gap-3 overflow-hidden rounded-3 border border-hairline-strong bg-card p-4 shadow-[0_12px_28px_-12px_color-mix(in_oklab,var(--foreground)_22%,transparent)]"
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5 bg-(--fs-accent)"
      />
      <h3
        id={`${uid}-h-finish`}
        data-fs-heading={interactive ? "" : undefined}
        tabIndex={-1}
        className="rounded-1 text-[14px] font-semibold text-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      >
        {sent ? "Request sent" : "Ready to send"}
      </h3>
      <ul className="flex flex-col gap-1">
        {steps.map((s) => {
          const ok = stepErrors(s, values).length === 0;
          return (
            <li key={s.id} className="flex items-center gap-2 text-[12px]">
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center rounded-full",
                  ok
                    ? "bg-(--fs-wash) text-(--fs-accent)"
                    : "bg-warn/15 text-warn",
                )}
              >
                {ok ? (
                  <Check className="size-2.5" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className="w-16 shrink-0 text-ink-3">
                {s.short ?? s.title}
              </span>
              <span className="min-w-0 truncate text-foreground">
                {summaryOf(s, values)}
              </span>
              <span className="sr-only">
                {ok ? ", finished" : ", unfinished"}
              </span>
            </li>
          );
        })}
      </ul>
      {blocked.length ? (
        <p className="flex items-start gap-1.5 text-[12px] leading-4 text-warn">
          <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
          {blocked
            .map((id) => steps.find((s) => s.id === id)?.short ?? id)
            .join(" and ")}{" "}
          {blocked.length === 1 ? "needs" : "need"} finishing. Reopen from the
          tab below.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {sent ? (
          <p className="mr-auto flex items-center gap-1.5 text-[12px] text-ink-2">
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="size-3.5 text-success"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={motionSafe ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              />
            </svg>
            We reply within a working day.
          </p>
        ) : null}
        <button
          type="button"
          onClick={onFinish}
          aria-disabled={disabled || sent || undefined}
          className={cn(BUTTON, PRIMARY, FOCUS)}
        >
          <Send aria-hidden className="size-3.5" />
          {sent ? "Sent" : finishLabel}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Flight = {
  id: string;
  kind: "file" | "lift";
  n: number;
  title: string;
  summary: string;
};

const BUTTON =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3 text-[12px] font-medium transition-colors";
const PRIMARY =
  "bg-(--fs-solid) text-primary-foreground hover:bg-(--fs-solid)/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-(--fs-solid)";
const QUIET =
  "text-ink-2 hover:bg-surface-2 hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50";

/**
 * A wizard of stacked cards. The current step is the front card, with the
 * next `stackDepth` cards peeking above it; finishing it files it away: a
 * sheet the size of the card flies down to its place in the pile at the
 * foot on `springs.glide` — position and size, never scale, so no text
 * stretches — while the card's face fades and its summary arrives, and the
 * pile takes the weight with a `recoil` press. The card behind steps
 * forward. Clicking a tab lifts its card back up the same way while the
 * current card and its stack step aside; Save files it again with the new
 * summary, Cancel or Escape files it back unchanged.
 *
 * "Skip for now" files a card unfinished and its tab carries a mark; Send
 * names the unfinished steps and takes focus to the first tab that needs
 * attention. Tabs are a row of buttons with roving focus that scrolls
 * sideways in a narrow container. Under reduced motion nothing flies: the
 * card fades out, the tab fades in, and the stack re-orders by cross-fade.
 */
export function FiledSteps({
  steps = defaultFiledStepsSteps,
  value,
  defaultValue = defaultFiledStepsValues,
  onValueChange,
  defaultFiled = defaultFiledStepsFiled,
  onStepComplete,
  onReopen,
  onFinish,
  tabStyle = "folder",
  stackDepth = 2,
  accent = "var(--accent-bright)",
  density = "regular",
  title = "Book a site survey",
  subtitle = "Fieldline · Survey desk",
  finishLabel = "Send request",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: FiledStepsProps) {
  const motionSafe = useMotionSafe();
  const armed = useCommitted();
  const uid = React.useId();
  const d = DENSITY[density] ?? DENSITY.regular;
  const depth = Math.max(0, Math.min(3, Math.round(stackDepth)));

  const [own, setOwn] = React.useState<FiledStepsValues>(defaultValue);
  const values = value ?? own;
  const [filed, setFiled] =
    React.useState<Record<string, FiledStepsMark>>(defaultFiled);
  const [reopened, setReopened] = React.useState<string | null>(null);
  const [snapshot, setSnapshot] = React.useState<FiledStepsValues | null>(null);
  const [attempted, setAttempted] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const [blocked, setBlocked] = React.useState<string[]>([]);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [tabStop, setTabStop] = React.useState<string | null>(null);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const cardRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const wantFocus = React.useRef<"card" | "field" | { tab: string } | null>(
    null,
  );

  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const gw = useMotionValue(0);
  const gh = useMotionValue(0);
  const mix = useMotionValue(0);
  const pileY = useMotionValue(0);
  const cardFace = useTransform(mix, (m) =>
    Number(Math.max(0, 1 - m * 2.2).toFixed(3)),
  );
  const tabFace = useTransform(mix, (m) =>
    Number(Math.max(0, m * 2 - 1).toFixed(3)),
  );
  const flightCtl = React.useRef<AnimationPlaybackControls | null>(null);
  const pileCtl = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(
    () => () => {
      flightCtl.current?.stop();
      pileCtl.current?.stop();
    },
    [],
  );

  const current = steps.find((s) => !filed[s.id]) ?? null;
  const front = reopened
    ? (steps.find((s) => s.id === reopened) ?? null)
    : current;
  const peeks = current
    ? steps.filter((s) => !filed[s.id] && s.id !== current.id).slice(0, depth)
    : [];
  const filedCount = steps.filter((s) => filed[s.id]).length;
  const unfinished = steps.filter((s) => stepErrors(s, values).length > 0);

  const say = (text: string) => setAnnouncement(text);

  /* ------------------------------ the flight ---------------------------- */

  // The sheet flies once both ends exist: the start was measured in the
  // handler, the end is measured here, after the commit that rendered it.
  React.useEffect(() => {
    if (!flight) return;
    const root = rootRef.current;
    const target =
      flight.kind === "file" ? tabRefs.current.get(flight.id) : cardRef.current;
    if (!root || !target) {
      const id = window.requestAnimationFrame(() => setFlight(null));
      return () => window.cancelAnimationFrame(id);
    }
    const scroller = scrollerRef.current;
    if (flight.kind === "file" && scroller && target instanceof HTMLElement) {
      const left = target.offsetLeft - 12;
      const right =
        target.offsetLeft + target.offsetWidth + 12 - scroller.clientWidth;
      if (left < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left);
      else if (right > scroller.scrollLeft) scroller.scrollLeft = right;
    }
    const to = rectIn(target, root);
    const from = { x: gx.get(), y: gy.get(), w: gw.get(), h: gh.get() };
    mix.jump(flight.kind === "file" ? 0 : 1);
    const lerp = (a: number, b: number, t: number) =>
      Number((a + (b - a) * t).toFixed(2));
    flightCtl.current?.stop();
    // A plain number drives the flight and is written into the values, so it
    // runs even though the sheet mounted in this very commit.
    flightCtl.current = animate(0, 1, {
      ...springs.glide,
      onUpdate: (t) => {
        gx.set(lerp(from.x, to.x, t));
        gy.set(lerp(from.y, to.y, t));
        gw.set(lerp(from.w, to.w, t));
        gh.set(lerp(from.h, to.h, t));
        mix.set(Number((flight.kind === "file" ? t : 1 - t).toFixed(3)));
      },
      onComplete: () => {
        setFlight(null);
        if (flight.kind === "file") {
          pileCtl.current?.stop();
          pileY.jump(3);
          pileCtl.current = animate(pileY, 0, springs.recoil);
        }
      },
    });
    return () => flightCtl.current?.stop();
  }, [flight, gx, gy, gw, gh, mix, pileY]);

  // Focus moves once the arriving card or tab exists.
  const front_id = front?.id ?? "finish";
  React.useEffect(() => {
    const want = wantFocus.current;
    if (!want || flight) return;
    wantFocus.current = null;
    if (want === "card") {
      rootRef.current
        ?.querySelector<HTMLElement>("[data-fs-heading]")
        ?.focus({ preventScroll: true });
    } else if (want === "field") {
      rootRef.current
        ?.querySelector<HTMLElement>(
          "[data-fs-card] input, [data-fs-card] textarea, [data-fs-card] [role=radio][tabindex='0']",
        )
        ?.focus({ preventScroll: true });
    } else {
      tabRefs.current.get(want.tab)?.focus({ preventScroll: true });
    }
  }, [front_id, flight, reopened]);

  const startFlight = (
    kind: Flight["kind"],
    id: string,
    from: Element | null,
  ) => {
    const root = rootRef.current;
    const step = steps.find((s) => s.id === id);
    if (!motionSafe || !root || !from || !step) return;
    const r = rectIn(from, root);
    gx.jump(r.x);
    gy.jump(r.y);
    gw.jump(r.w);
    gh.jump(r.h);
    mix.jump(kind === "file" ? 0 : 1);
    setFlight({
      id,
      kind,
      n: (flight?.n ?? 0) + 1,
      title: step.title,
      summary: summaryOf(step, values),
    });
  };

  /* ------------------------------ handlers ------------------------------ */

  const setField = (id: string, v: string) => {
    if (disabled) return;
    const next = { ...values, [id]: v };
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    if (sent) setSent(false);
  };

  const fileCard = (step: FiledStepsStep, complete: boolean) => {
    startFlight("file", step.id, cardRef.current);
    setFiled((f) => ({ ...f, [step.id]: complete ? "done" : "incomplete" }));
    setAttempted(null);
    setBlocked([]);
    const wasReopened = reopened === step.id;
    setReopened(null);
    setSnapshot(null);
    wantFocus.current = wasReopened ? { tab: step.id } : "card";
    say(
      `${step.short ?? step.title} ${complete ? "filed" : "filed as unfinished"}.`,
    );
    onStepComplete?.(step.id, values, complete);
  };

  const submit = (step: FiledStepsStep) => {
    if (disabled) return;
    const errs = stepErrors(step, values);
    if (errs.length) {
      setAttempted(step.id);
      say(errs.map((e) => e.text).join(" "));
      const first = errs[0];
      if (first) {
        rootRef.current
          ?.querySelector<HTMLElement>(
            `[data-fs-field="${first.field}"]:is(input,textarea), [data-fs-field="${first.field}"] [tabindex='0']`,
          )
          ?.focus();
      }
      return;
    }
    fileCard(step, true);
  };

  const skip = (step: FiledStepsStep) => {
    if (disabled) return;
    fileCard(step, stepErrors(step, values).length === 0);
  };

  const reopen = (id: string) => {
    if (disabled || flight) return;
    if (reopened === id) return;
    const step = steps.find((s) => s.id === id);
    if (!step) return;
    // One card out at a time: an open one goes back as it was.
    const base = reopened && snapshot ? snapshot : values;
    if (reopened && snapshot) {
      if (value === undefined) setOwn(snapshot);
      onValueChange?.(snapshot);
    }
    startFlight("lift", id, tabRefs.current.get(id) ?? null);
    setReopened(id);
    setSnapshot(base);
    setAttempted(null);
    setSent(false);
    wantFocus.current = "field";
    say(`${step.short ?? step.title} reopened for editing.`);
    onReopen?.(id);
  };

  const cancel = (step: FiledStepsStep) => {
    if (snapshot) {
      if (value === undefined) setOwn(snapshot);
      onValueChange?.(snapshot);
    }
    startFlight("file", step.id, cardRef.current);
    setReopened(null);
    setSnapshot(null);
    setAttempted(null);
    wantFocus.current = { tab: step.id };
    say(`${step.short ?? step.title} put back unchanged.`);
  };

  const finish = () => {
    if (disabled || sent) return;
    if (unfinished.length) {
      setBlocked(unfinished.map((s) => s.id));
      const first = unfinished[0];
      say(
        `${unfinished.map((s) => s.short ?? s.title).join(" and ")} ${unfinished.length === 1 ? "needs" : "need"} finishing. Reopen ${first?.short ?? "it"} from its tab.`,
      );
      if (first) tabRefs.current.get(first.id)?.focus();
      return;
    }
    setSent(true);
    say("Request sent.");
    onFinish?.(values);
  };

  const tabKeys = (event: React.KeyboardEvent, id: string) => {
    const list = steps
      .filter((s) => filed[s.id] || s.id === reopened)
      .map((s) => s.id);
    const at = list.indexOf(id);
    const map: Record<string, number> = {
      ArrowRight: at + 1,
      ArrowLeft: at - 1,
      Home: 0,
      End: list.length - 1,
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    const next = list[Math.min(list.length - 1, Math.max(0, to))];
    if (next) tabRefs.current.get(next)?.focus();
  };

  /* ------------------------------ the cards ----------------------------- */

  const look: CardLook = { uid, d, disabled, motionSafe };
  const stepNumber = (s: FiledStepsStep) =>
    steps.findIndex((x) => x.id === s.id) + 1;

  /* ------------------------------ the desk ------------------------------ */

  const stackOffset = 8;
  const desk =
    status === "loading" ? (
      <div
        aria-busy="true"
        className="mx-auto flex w-full max-w-[30rem] flex-col gap-2 pt-4"
      >
        <p className="sr-only">Loading the steps.</p>
        <span aria-hidden className="h-48 rounded-3 bg-surface-2" />
      </div>
    ) : status === "error" ? (
      <div className="flex h-full flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-sm text-foreground">The steps did not load.</p>
        <p className="max-w-xs text-[12px] text-ink-3">
          What you filed is kept. Try again in a moment.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              BUTTON,
              "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div
        className="mx-auto grid h-full w-full max-w-[30rem] grid-rows-[minmax(0,1fr)]"
        style={{ paddingTop: depth * stackOffset + 4 }}
      >
        {/* The current card and the stack behind it; they step aside while a filed card is out. */}
        <motion.div
          className="relative isolate max-h-full self-center [grid-area:1/1]"
          style={{ originX: 0.5, originY: 0 }}
          initial={false}
          animate={
            reopened
              ? {
                  x: motionSafe ? 28 : 0,
                  scale: motionSafe ? 0.94 : 1,
                  opacity: 0.35,
                }
              : { x: 0, scale: 1, opacity: 1 }
          }
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
          aria-hidden={reopened ? true : undefined}
          inert={reopened ? true : undefined}
        >
          {peeks.map((s, k) => (
            <motion.div
              key={s.id}
              aria-hidden
              className="absolute inset-x-0 top-0 h-16 rounded-3 border border-[color-mix(in_oklab,var(--foreground)_20%,transparent)] bg-surface-2"
              style={{ zIndex: -1 - k, originX: 0.5, originY: 0 }}
              initial={false}
              animate={{
                y: -(k + 1) * stackOffset,
                scale: Number((1 - (k + 1) * 0.04).toFixed(3)),
                opacity: Number((0.9 - k * 0.22).toFixed(2)),
              }}
              transition={motionSafe ? springs.glide : { duration: 0 }}
            />
          ))}
          <motion.div
            key={current?.id ?? "finish"}
            initial={
              armed && motionSafe
                ? { y: -stackOffset * 2, scale: 0.96, opacity: 0.4 }
                : false
            }
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={
              motionSafe
                ? {
                    y: springs.glide,
                    scale: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                  }
                : { duration: durations.fast }
            }
            style={{ originX: 0.5, originY: 0 }}
          >
            {current ? (
              <StepCard
                step={current}
                number={stepNumber(current)}
                count={steps.length}
                values={values}
                showErrors={attempted === current.id}
                isReopened={false}
                interactive={!reopened}
                hidden={false}
                cardRef={cardRef}
                look={look}
                onField={setField}
                onSubmit={() => submit(current)}
                onSkip={() => skip(current)}
                onCancel={() => cancel(current)}
              />
            ) : (
              <FinishCard
                steps={steps}
                values={values}
                blocked={blocked}
                sent={sent}
                finishLabel={finishLabel}
                interactive={!reopened}
                cardRef={cardRef}
                look={look}
                onFinish={finish}
              />
            )}
          </motion.div>
        </motion.div>
        {reopened && front ? (
          <motion.div
            key={`open-${front.id}`}
            className="relative z-10 max-h-full self-center [grid-area:1/1]"
            initial={motionSafe ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast }}
          >
            <StepCard
              step={front}
              number={stepNumber(front)}
              count={steps.length}
              values={values}
              showErrors={attempted === front.id}
              isReopened
              interactive
              hidden={flight?.id === front.id}
              cardRef={cardRef}
              look={look}
              onField={setField}
              onSubmit={() => submit(front)}
              onSkip={() => skip(front)}
              onCancel={() => cancel(front)}
            />
          </motion.div>
        ) : null}
      </div>
    );

  /* ------------------------------ the pile ------------------------------ */

  const pileSteps = steps.filter((s) => filed[s.id] || s.id === reopened);
  const pile = (
    <div className="relative shrink-0 border-t border-hairline bg-surface-1">
      <div
        ref={scrollerRef}
        className="relative [scrollbar-width:none] overflow-x-auto overscroll-x-contain [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)]"
      >
        <motion.ol
          aria-label="Filed steps"
          className={cn(
            "flex w-max items-end px-4 pt-3",
            tabStyle === "folder"
              ? "gap-1"
              : tabStyle === "index"
                ? "gap-0"
                : "gap-1.5 pb-3",
          )}
          style={{ y: pileY }}
        >
          {pileSteps.length === 0 ? (
            <li className="pb-3 text-[12px] text-ink-3">
              Finished steps file here, still in reach.
            </li>
          ) : null}
          {pileSteps.map((s, i) => {
            const mark = filed[s.id];
            const isOpen = s.id === reopened;
            const unfinishedTab =
              mark === "incomplete" || blocked.includes(s.id);
            const summary = summaryOf(s, values);
            const flying = flight?.id === s.id;
            return (
              <li
                key={s.id}
                className="relative"
                style={{
                  zIndex:
                    tabStyle === "index" ? pileSteps.length - i : undefined,
                }}
              >
                <button
                  ref={(el) => {
                    tabRefs.current.set(s.id, el);
                  }}
                  type="button"
                  tabIndex={
                    s.id ===
                    (pileSteps.some((x) => x.id === tabStop)
                      ? tabStop
                      : pileSteps[0]?.id)
                      ? 0
                      : -1
                  }
                  onFocus={() => setTabStop(s.id)}
                  aria-disabled={disabled || isOpen || undefined}
                  aria-label={`Reopen ${s.short ?? s.title}${unfinishedTab ? ", unfinished" : ""}: ${summary}`}
                  aria-current={isOpen ? "step" : undefined}
                  onClick={() => reopen(s.id)}
                  onKeyDown={(event) => tabKeys(event, s.id)}
                  className={cn(
                    "relative flex h-11 w-[11.5rem] max-w-[60cqw] flex-col justify-center gap-0.5 text-left transition-[background-color,opacity] duration-200",
                    tabShape(tabStyle),
                    FOCUS,
                    "hover:bg-surface-2",
                    isOpen && "border-dashed bg-transparent opacity-60",
                    flying && "opacity-0",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.08em] uppercase">
                    <span className="text-(--fs-accent)">{stepNumber(s)}</span>
                    <span className="truncate text-ink-3">
                      {s.short ?? s.title}
                    </span>
                    {unfinishedTab ? (
                      <motion.span
                        key={
                          blocked.includes(s.id) ? `b-${blocked.join()}` : "m"
                        }
                        aria-hidden
                        className="ml-auto size-1.5 shrink-0 rounded-full bg-warn"
                        initial={armed && motionSafe ? { scale: 2.4 } : false}
                        animate={{ scale: 1 }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : (
                      <Check
                        aria-hidden
                        className="ml-auto size-3 shrink-0 text-(--fs-accent) opacity-70"
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      "truncate text-[12px] leading-4",
                      isOpen ? "text-ink-3 italic" : "text-foreground",
                    )}
                  >
                    {isOpen ? "Out for editing" : summary}
                  </span>
                </button>
              </li>
            );
          })}
        </motion.ol>
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label={title}
      className={cn(
        "@container/filed-steps relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        d.text,
        className,
      )}
      style={
        {
          height,
          "--fs-accent": accent,
          "--fs-wash": `color-mix(in oklab, ${accent} 12%, transparent)`,
          "--fs-solid": `oklch(from ${accent} 0.52 c h)`,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          <p className="truncate text-[11px] text-ink-3">{subtitle}</p>
        </div>
        <p className="shrink-0 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase tabular-nums">
          <span className="text-foreground">{filedCount}</span> of{" "}
          {steps.length} filed
        </p>
      </header>

      <div className="relative flex-1 overflow-hidden bg-[radial-gradient(color-mix(in_oklab,var(--foreground)_7%,transparent)_1px,transparent_1px)] bg-[size:14px_14px] px-4 pb-4">
        {desk}
      </div>

      {status === "ready" ? pile : null}

      {flight ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-30 overflow-hidden rounded-3 border border-hairline-strong bg-card shadow-[0_10px_24px_-10px_color-mix(in_oklab,var(--foreground)_35%,transparent)]"
          style={{ x: gx, y: gy, width: gw, height: gh }}
        >
          <motion.div
            className="flex flex-col gap-2 p-4"
            style={{ opacity: cardFace }}
          >
            <span className="truncate text-[14px] font-semibold text-foreground">
              {flight.title}
            </span>
            <span className="h-2 w-2/3 rounded-full bg-surface-2" />
            <span className="h-2 w-1/2 rounded-full bg-surface-2" />
          </motion.div>
          <motion.div
            className="absolute inset-0 flex flex-col justify-center gap-0.5 px-3"
            style={{ opacity: tabFace }}
          >
            <span className="truncate font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
              {steps.find((s) => s.id === flight.id)?.short ?? ""}
            </span>
            <span className="truncate text-[12px] leading-4 text-foreground">
              {flight.summary}
            </span>
          </motion.div>
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
