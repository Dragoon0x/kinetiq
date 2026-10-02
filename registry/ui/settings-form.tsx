"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Transition,
} from "motion/react";
import { Check, ChevronDown, RotateCcw, TriangleAlert } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SettingsValue = string | number | boolean;
export type SettingsValues = Record<string, SettingsValue>;
export type SettingsBar = "dock" | "float" | "inline";
export type SettingsRewind = "sequence" | "together" | "instant";
export type SettingsStatus = "ready" | "loading" | "error";

type FieldBase = {
  /** The key of this field's value. */
  id: string;
  label: string;
  /** One line of help under the label. */
  description?: string;
  disabled?: boolean;
};

export type SettingsOption = { value: string; label: string };

export type SettingsTextField = FieldBase & {
  kind: "text";
  defaultValue?: string;
  placeholder?: string;
  /** Fixed text before the value, inside the box: "fieldline.app/". */
  prefix?: string;
  maxLength?: number;
  /** A message when the value cannot be saved, or null. */
  validate?: (value: string) => string | null;
};

export type SettingsTextareaField = FieldBase & {
  kind: "textarea";
  defaultValue?: string;
  placeholder?: string;
  /** @default 3 */
  rows?: number;
  maxLength?: number;
  validate?: (value: string) => string | null;
};

export type SettingsSwitchField = FieldBase & {
  kind: "switch";
  defaultValue?: boolean;
};

export type SettingsChoiceField = FieldBase & {
  kind: "choice";
  options: SettingsOption[];
  defaultValue?: string;
};

export type SettingsSelectField = FieldBase & {
  kind: "select";
  options: SettingsOption[];
  defaultValue?: string;
};

export type SettingsRangeField = FieldBase & {
  kind: "range";
  min: number;
  max: number;
  step: number;
  defaultValue?: number;
  /** How a value reads. @default the number */
  format?: (value: number) => string;
};

export type SettingsField =
  | SettingsTextField
  | SettingsTextareaField
  | SettingsSwitchField
  | SettingsChoiceField
  | SettingsSelectField
  | SettingsRangeField;

export type SettingsSection = {
  id: string;
  title: string;
  description?: string;
  fields: SettingsField[];
};

export type SettingsChange = {
  id: string;
  label: string;
  from: SettingsValue;
  to: SettingsValue;
};

/** What a save may resolve with: nothing, or the fields it could not take. */
export type SettingsSaveResult = void | {
  errors?: Record<string, string>;
};

export type SettingsFormProps = {
  /** The form's sections and fields. @default defaultSettingsSections */
  sections?: SettingsSection[];
  /** Controlled saved values, by field id. Fields it leaves out use their own defaultValue. */
  value?: SettingsValues;
  /** Initial saved values when uncontrolled. @default each field's defaultValue */
  defaultValue?: SettingsValues;
  /** Edits to start from, over the saved values — a draft restored from an earlier visit. They count as changes. */
  defaultDraft?: SettingsValues;
  /** Fires when a save lands, with every saved value. */
  onValueChange?: (values: SettingsValues) => void;
  /** Fires on every edit, with the draft and the ids that differ from what is saved. */
  onDraftChange?: (draft: SettingsValues, dirty: string[]) => void;
  /** Save was pressed (or Ctrl/⌘+S). Return a promise to hold the bar in "Saving"; resolve with `{ errors }` to keep some fields back. */
  onSave?: (
    changes: SettingsChange[],
    draft: SettingsValues,
  ) => SettingsSaveResult | Promise<SettingsSaveResult>;
  /** Discard was pressed, with the changes being undone. */
  onDiscard?: (changes: SettingsChange[]) => void;
  /** How far and how bright a changed field's edge glows into its row, 0 to 1. 0 keeps only the edge bar. @default 0.6 */
  glow?: number;
  /** Where the save bar lives: docked to the panel's bottom, floating above it, or in the flow at the form's end. @default "dock" */
  bar?: SettingsBar;
  /** How Discard undoes: newest edit first, every field at once, or all values at once with no replay. @default "sequence" */
  rewind?: SettingsRewind;
  /** The longest one field's rewind may take, in ms. @default 520 */
  rewindDuration?: number;
  /** Time between fields confirming after a save, in ms. @default 110 */
  confirmStagger?: number;
  /** How long "All changes saved" stays before the bar leaves, in ms. @default 1400 */
  savedHold?: number;
  /** The panel's heading. @default "Settings" */
  title?: string;
  /** A line under the heading. */
  description?: string;
  /** The panel's accessible name. @default the title */
  label?: string;
  /** @default "Save" */
  saveLabel?: string;
  /** @default "Discard" */
  discardLabel?: string;
  /** Whether the saved values have arrived. @default "ready" */
  status?: SettingsStatus;
  /** Try again was pressed after the values failed to load. */
  onRetry?: () => void;
  /** Clicks for Save, Discard and Revert, a falling click per rewound field, a pop per field a save confirms. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* -------------------------------- defaults -------------------------------- */

const hours = (v: number) => {
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
};

export const defaultSettingsSections: SettingsSection[] = [
  {
    id: "workspace",
    title: "Workspace",
    description: "How Fieldline Labs appears to the team and on invoices.",
    fields: [
      {
        id: "name",
        kind: "text",
        label: "Workspace name",
        description: "Shown in the sidebar and on every invoice.",
        defaultValue: "Fieldline Labs",
        maxLength: 40,
        validate: (v) => (v.trim() ? null : "Give the workspace a name."),
      },
      {
        id: "slug",
        kind: "text",
        label: "Workspace URL",
        description: "Old links keep working for 30 days after a change.",
        prefix: "fieldline.app/",
        defaultValue: "fieldline-labs",
        maxLength: 32,
        validate: (v) =>
          /^[a-z0-9-]{3,32}$/.test(v)
            ? null
            : "Use 3 to 32 lowercase letters, numbers and dashes.",
      },
      {
        id: "about",
        kind: "textarea",
        label: "Description",
        description: "One line for the team directory.",
        defaultValue: "Route planning for the northern depots.",
        rows: 2,
        maxLength: 120,
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "What reaches your inbox and your phone.",
    fields: [
      {
        id: "digest",
        kind: "choice",
        label: "Email digest",
        description: "A summary of what changed in your projects.",
        options: [
          { value: "off", label: "Off" },
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
        ],
        defaultValue: "weekly",
      },
      {
        id: "mentions",
        kind: "switch",
        label: "Mentions",
        description: "Email me when someone mentions me.",
        defaultValue: true,
      },
      {
        id: "incidents",
        kind: "switch",
        label: "Incident alerts",
        description: "Text the on-call phone when a route fails.",
        defaultValue: false,
      },
    ],
  },
  {
    id: "regional",
    title: "Regional and security",
    fields: [
      {
        id: "timezone",
        kind: "select",
        label: "Time zone",
        description: "Schedules and digests use this clock.",
        options: [
          { value: "utc", label: "UTC" },
          { value: "utc-8", label: "UTC−08:00 · Pacific" },
          { value: "utc-5", label: "UTC−05:00 · Eastern" },
          { value: "utc+1", label: "UTC+01:00 · Central Europe" },
          { value: "utc+5.5", label: "UTC+05:30 · India" },
          { value: "utc+9", label: "UTC+09:00 · Japan" },
        ],
        defaultValue: "utc+1",
      },
      {
        id: "timeout",
        kind: "range",
        label: "Session timeout",
        description: "Sign out after this long without activity.",
        min: 15,
        max: 240,
        step: 15,
        defaultValue: 60,
        format: hours,
      },
    ],
  },
];

/* --------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_RING_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid";

const fallbackOf = (f: SettingsField): SettingsValue => {
  switch (f.kind) {
    case "text":
    case "textarea":
      return f.defaultValue ?? "";
    case "switch":
      return f.defaultValue ?? false;
    case "choice":
    case "select":
      return f.defaultValue ?? f.options[0]?.value ?? "";
    case "range":
      return f.defaultValue ?? f.min;
  }
};

/** Every field's own default, by id: the values a fresh form starts from. */
export function settingsValuesOf(sections: SettingsSection[]): SettingsValues {
  const out: SettingsValues = {};
  for (const s of sections) for (const f of s.fields) out[f.id] = fallbackOf(f);
  return out;
}

export const defaultSettingsValues = settingsValuesOf(defaultSettingsSections);

/** How a value reads in a sentence or the changes list. */
function readValue(f: SettingsField, v: SettingsValue): string {
  switch (f.kind) {
    case "switch":
      return v ? "On" : "Off";
    case "choice":
    case "select":
      return f.options.find((o) => o.value === v)?.label ?? String(v);
    case "range":
      return f.format ? f.format(Number(v)) : String(v);
    default: {
      const text = String(v);
      if (!text) return "empty";
      return text.length > 28 ? `“${text.slice(0, 27)}…”` : `“${text}”`;
    }
  }
}

/** A copy of a record without one key. */
function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const out = { ...record };
  delete out[key];
  return out;
}

/** A list in words: "A", "A and B", "A, B and C". */
const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** One digit as a column of 0–9 that rolls to its value on the snap spring. */
function Digit({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  return (
    <span className="relative inline-block h-[1.2em] overflow-clip">
      <span className="invisible">0</span>
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        initial={false}
        animate={{ y: `${-value * 10}%` }}
        transition={motionSafe ? springs.snap : { duration: 0 }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="block h-[1.2em] leading-[1.2em]">
            {n}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

function Count({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const chars = [...String(Math.max(0, value))];
  return (
    <span aria-hidden className="inline-flex leading-[1.2em] tabular-nums">
      {chars.map((ch, i) => (
        <Digit
          key={`d${chars.length - i}`}
          value={Number(ch)}
          motionSafe={motionSafe}
        />
      ))}
    </span>
  );
}

/* --------------------------------- controls -------------------------------- */

type Ticket = { n: number; delay: number; duration: number };

type ControlProps = {
  inputId: string;
  labelId: string;
  describedBy: string;
  invalid: boolean;
  disabled: boolean;
  readOnly: boolean;
  motionSafe: boolean;
  /** Changing back: a rolling label rolls the other way. */
  reverse: boolean;
};

/**
 * A text field whose rewind is drawn over it: the draft deletes back to what
 * it shares with the saved value and the rest types in, in an overlay laid
 * exactly over the real text, which is hidden for those few frames.
 */
function TextControl({
  field,
  value,
  saved,
  rewind,
  onChange,
  onRewound,
  onEscape,
  ...c
}: ControlProps & {
  field: SettingsTextField | SettingsTextareaField;
  value: string;
  saved: string;
  rewind?: Ticket;
  onChange: (v: string) => void;
  onRewound: () => void;
  onEscape: () => boolean;
}) {
  const mask = useMotionValue(0);
  const shown = useMotionValue("");
  const live = React.useRef({ value, saved, onRewound });
  React.useEffect(() => {
    live.current = { value, saved, onRewound };
  });

  React.useEffect(() => {
    if (!rewind) return;
    let anim: AnimationPlaybackControls | null = null;
    const timer = window.setTimeout(() => {
      const from = live.current.value;
      const to = live.current.saved;
      if (!c.motionSafe || rewind.duration <= 0) {
        live.current.onRewound();
        return;
      }
      let common = 0;
      while (
        common < from.length &&
        common < to.length &&
        from[common] === to[common]
      ) {
        common += 1;
      }
      const cut = from.length - common;
      const total = cut + (to.length - common);
      shown.set(from);
      mask.set(1);
      anim = animate(0, total, {
        duration: Math.min(rewind.duration, Math.max(180, total * 22)) / 1000,
        ease: easings.move,
        onUpdate: (k) => {
          const at = Math.floor(k);
          shown.set(
            at <= cut
              ? from.slice(0, from.length - at)
              : to.slice(0, common + at - cut),
          );
        },
        onComplete: () => {
          mask.set(0);
          live.current.onRewound();
        },
      });
    }, rewind.delay);
    return () => {
      window.clearTimeout(timer);
      anim?.stop();
      mask.set(0);
    };
  }, [rewind, c.motionSafe, mask, shown]);

  const textColor = useTransform(mask, (m) => (m > 0.5 ? "transparent" : ""));
  const overlayOpacity = useTransform(mask, (m) => (m > 0.5 ? 1 : 0));
  const multiline = field.kind === "textarea";
  const common = {
    id: c.inputId,
    value,
    placeholder: field.placeholder,
    maxLength: field.maxLength,
    disabled: c.disabled,
    readOnly: c.readOnly,
    "aria-describedby": c.describedBy,
    "aria-invalid": c.invalid || undefined,
    spellCheck: false,
    onKeyDown: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      // Escape in a changed field takes that field back. With nothing to
      // take back it is not ours, and the page may use it.
      if (event.key === "Escape" && onEscape()) event.preventDefault();
    },
  };

  return (
    <div
      className={cn(
        "flex w-full max-w-md items-stretch overflow-clip rounded-2 border bg-background text-[13px] transition-colors",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring focus-within:outline-solid",
        c.invalid ? "border-danger/60" : "border-hairline-strong",
        c.disabled && "opacity-60",
      )}
    >
      {field.kind === "text" && field.prefix ? (
        <span className="flex shrink-0 items-center border-r border-hairline bg-surface-2 pr-2 pl-3 font-mono text-[12px] text-ink-3">
          {field.prefix}
        </span>
      ) : null}
      <span className="relative grid min-w-0 flex-1">
        {multiline ? (
          <motion.textarea
            {...common}
            rows={field.rows ?? 3}
            onChange={(event) => onChange(event.currentTarget.value)}
            style={{ color: textColor, caretColor: textColor }}
            className="col-start-1 row-start-1 min-w-0 resize-none bg-transparent px-3 py-2 leading-5 outline-none placeholder:text-ink-3"
          />
        ) : (
          <motion.input
            {...common}
            type="text"
            autoComplete="off"
            onChange={(event) => onChange(event.currentTarget.value)}
            style={{ color: textColor, caretColor: textColor }}
            className="col-start-1 row-start-1 h-9 min-w-0 bg-transparent px-3 outline-none placeholder:text-ink-3"
          />
        )}
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none col-start-1 row-start-1 overflow-clip px-3 text-foreground",
            multiline
              ? "py-2 leading-5 break-words whitespace-pre-wrap"
              : "flex h-9 items-center whitespace-pre",
          )}
          style={{ opacity: overlayOpacity }}
        >
          <motion.span>{shown}</motion.span>
          <span className="ml-px inline-block h-4 w-px bg-cobalt-bright align-middle" />
        </motion.span>
      </span>
    </div>
  );
}

function SwitchControl({
  value,
  onChange,
  ...c
}: ControlProps & { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      id={c.inputId}
      type="button"
      role="switch"
      aria-checked={value}
      aria-labelledby={c.labelId}
      aria-describedby={c.describedBy}
      aria-disabled={c.readOnly || undefined}
      disabled={c.disabled}
      onClick={() => {
        if (!c.readOnly) onChange(!value);
      }}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        value ? "bg-cobalt-bright" : "bg-ink-3/35",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="block size-5 rounded-full bg-white shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
        initial={false}
        animate={{ x: value ? 16 : 0 }}
        transition={c.motionSafe ? springs.snap : { duration: 0 }}
      />
    </button>
  );
}

function ChoiceControl({
  field,
  value,
  onChange,
  layoutKey,
  ...c
}: ControlProps & {
  field: SettingsChoiceField;
  value: string;
  onChange: (v: string) => void;
  layoutKey: string;
}) {
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const options = field.options;
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
    if (c.readOnly) return;
    onChange(next.value);
    nodes.current.get(next.value)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-labelledby={c.labelId}
      aria-describedby={c.describedBy}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-0.5 rounded-2 bg-surface-2 p-0.5",
        c.disabled && "opacity-50",
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(node) => {
              if (node) nodes.current.set(o.value, node);
              else nodes.current.delete(o.value);
            }}
            type="button"
            id={on ? c.inputId : undefined}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={c.disabled}
            onClick={() => {
              if (!c.readOnly && !on) onChange(o.value);
            }}
            onKeyDown={(event) => move(event, i)}
            className={cn(
              "relative inline-flex h-7 min-w-0 items-center rounded-[5px] px-3 text-[12px] transition-colors disabled:cursor-not-allowed",
              on ? "text-foreground" : "text-ink-3 hover:text-foreground",
              FOCUS_RING_IN,
            )}
          >
            {on ? (
              <motion.span
                layoutId={layoutKey}
                aria-hidden
                className="absolute inset-0 rounded-[5px] bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                transition={c.motionSafe ? springs.snap : { duration: 0 }}
              />
            ) : null}
            <span className="relative truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const rollVariants = {
  enter: (dir: number) => ({ y: `${dir * 100}%`, opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  leave: (dir: number) => ({ y: `${-dir * 100}%`, opacity: 0 }),
};

/**
 * A native select (its own list, its own keys) whose shown label rolls: up as
 * a new value comes in, down as a rewind takes it back.
 */
function SelectControl({
  field,
  value,
  onChange,
  ...c
}: ControlProps & {
  field: SettingsSelectField;
  value: string;
  onChange: (v: string) => void;
}) {
  const dir = c.reverse ? -1 : 1;
  const shown = field.options.find((o) => o.value === value)?.label ?? value;
  return (
    <div className="relative w-full max-w-md">
      <select
        id={c.inputId}
        value={value}
        disabled={c.disabled}
        aria-describedby={c.describedBy}
        onChange={(event) => {
          // Busy, the value holds: focus stays where it is, and the
          // controlled select snaps back.
          if (!c.readOnly) onChange(event.currentTarget.value);
        }}
        className={cn(
          "h-9 w-full cursor-pointer appearance-none rounded-2 border border-hairline-strong bg-background pr-9 pl-3 text-[13px] text-transparent disabled:cursor-not-allowed disabled:opacity-60",
          "[&>option]:bg-popover [&>option]:text-foreground",
          FOCUS_RING,
        )}
      >
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-9 left-3 grid items-center overflow-clip text-[13px] text-foreground"
      >
        <AnimatePresence initial={false} custom={dir}>
          <motion.span
            key={value}
            custom={dir}
            variants={rollVariants}
            initial={c.motionSafe ? "enter" : false}
            animate="center"
            exit={c.motionSafe ? "leave" : { opacity: 0 }}
            transition={
              c.motionSafe
                ? { y: springs.snap, opacity: { duration: durations.fast } }
                : { duration: 0 }
            }
            className="col-start-1 row-start-1 truncate"
          >
            {shown}
          </motion.span>
        </AnimatePresence>
      </span>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}

/**
 * A slider that follows the finger 1:1, rubber-bands past its ends and lands
 * on its step on snap with the throw's velocity; a value that changes from
 * outside (a rewind) glides there instead.
 */
function RangeControl({
  field,
  value,
  onChange,
  ...c
}: ControlProps & {
  field: SettingsRangeField;
  value: number;
  onChange: (v: number) => void;
}) {
  const { min, max } = field;
  const step = Math.max(1e-6, field.step);
  const span = Math.max(1e-6, max - min);
  const pos = useMotionValue(value);
  const aimed = React.useRef(value);
  const reported = React.useRef(value);
  const dragging = React.useRef<{ base: number; width: number } | null>(null);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const say = field.format ?? ((v: number) => String(v));

  const quantize = (v: number) =>
    clamp(
      Number((min + Math.round((v - min) / step) * step).toFixed(6)),
      min,
      max,
    );
  const pct = (v: number) => r2(((clamp(v, min, max) - min) / span) * 100);

  const send = (q: number, velocity = 0, spring: Transition = springs.snap) => {
    aimed.current = q;
    anim.current?.stop();
    if (!c.motionSafe) {
      pos.set(q);
      return;
    }
    anim.current = animate(pos, q, { ...spring, velocity });
  };
  const report = (q: number) => {
    if (q === reported.current) return;
    reported.current = q;
    onChange(q);
  };

  // A value from outside — a rewind, a reset — glides home. No cleanup stops
  // it, so StrictMode's second run lets the first glide finish.
  React.useEffect(() => {
    reported.current = value;
    if (dragging.current || aimed.current === value) return;
    aimed.current = value;
    anim.current?.stop();
    if (!c.motionSafe) {
      pos.set(value);
      return;
    }
    anim.current = animate(pos, value, springs.glide);
  }, [value, c.motionSafe, pos]);

  React.useEffect(() => () => anim.current?.stop(), []);

  const locked = c.disabled || c.readOnly;
  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: locked,
    onStart: ({ point, offset }) => {
      const rect = trackRef.current?.getBoundingClientRect();
      const width = rect && rect.width > 0 ? rect.width : 1;
      const startX = point.x - offset.x;
      const thumbX = rect ? rect.left + (pct(pos.get()) / 100) * width : 0;
      anim.current?.stop();
      dragging.current = {
        base:
          Math.abs(startX - thumbX) <= 14
            ? pos.get()
            : min + ((startX - (rect?.left ?? 0)) / width) * span,
        width,
      };
    },
    onMove: ({ offset }) => {
      const d = dragging.current;
      if (!d) return;
      const raw = d.base + (offset.x / d.width) * span;
      const v = c.motionSafe
        ? raw < min
          ? min + rubberband(raw - min, span * 0.15)
          : raw > max
            ? max + rubberband(raw - max, span * 0.15)
            : raw
        : clamp(raw, min, max);
      pos.set(r2(v));
      report(quantize(v));
    },
    onEnd: ({ velocity }) => {
      const d = dragging.current;
      dragging.current = null;
      if (!d) return;
      const perSecond = (velocity.x / d.width) * span;
      const q = quantize(project(pos.get(), perSecond, 0.98));
      report(q);
      send(q, perSecond);
    },
    onCancel: () => {
      dragging.current = null;
      send(reported.current);
    },
    onTap: (event) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const q = quantize(
        min + ((event.clientX - rect.left) / rect.width) * span,
      );
      report(q);
      send(q, 0, springs.glide);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const big = Math.max(step, Math.round(span / step / 4) * step);
    const at = reported.current;
    const to =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? at + step
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? at - step
          : event.key === "PageUp"
            ? at + big
            : event.key === "PageDown"
              ? at - big
              : event.key === "Home"
                ? min
                : event.key === "End"
                  ? max
                  : null;
    if (to === null) return;
    event.preventDefault();
    if (locked) return;
    const q = quantize(to);
    report(q);
    send(q);
  };

  const fill = useTransform(pos, (v) => `${pct(v)}%`);

  return (
    <div className="flex w-full max-w-md items-center gap-3">
      <div
        ref={trackRef}
        {...drag}
        className={cn(
          "relative h-6 min-w-0 flex-1 touch-pan-y select-none",
          locked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        )}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-clip rounded-full bg-surface-2">
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 bg-cobalt-bright"
            style={{ width: fill }}
          />
        </div>
        <motion.div
          id={c.inputId}
          role="slider"
          tabIndex={c.disabled ? -1 : 0}
          aria-labelledby={c.labelId}
          aria-describedby={c.describedBy}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={say(value)}
          aria-disabled={locked || undefined}
          onKeyDown={onKeyDown}
          whileHover={c.motionSafe && !locked ? { scale: 1.12 } : undefined}
          transition={springs.snap}
          className={cn(
            "absolute top-1/2 size-4.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cobalt-bright bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_22%,transparent)]",
            FOCUS_RING,
          )}
          style={{ left: fill }}
        />
      </div>
      <span className="w-20 shrink-0 text-right font-mono text-[12px] text-foreground tabular-nums">
        {say(value)}
      </span>
    </div>
  );
}

/* ---------------------------------- field ---------------------------------- */

type Edge = "idle" | "dirty" | "saved" | "error";

type FieldRowProps = {
  field: SettingsField;
  uid: string;
  value: SettingsValue;
  saved: SettingsValue;
  edge: Edge;
  dirty: boolean;
  confirmed?: number;
  message?: string;
  flare?: number;
  shake?: number;
  rewind?: Ticket;
  busy: boolean;
  disabled: boolean;
  glow: number;
  motionSafe: boolean;
  reverse: boolean;
  onChange: (id: string, v: SettingsValue) => void;
  onRevert: (id: string, el: Element | null) => void;
  onRewound: (id: string) => void;
};

/**
 * One field: its label and help, its control, and the edge that says it has
 * changed. The edge is a bar that grows from the row's middle on snap, with
 * a bloom washing in from it as far and as bright as `glow`; it turns
 * success as a save confirms the field and danger when the save refuses it.
 */
function FieldRow({
  field,
  uid,
  value,
  saved,
  edge,
  dirty,
  confirmed,
  message,
  flare,
  shake,
  rewind,
  busy,
  disabled,
  glow,
  motionSafe,
  reverse,
  onChange,
  onRevert,
  onRewound,
}: FieldRowProps) {
  const base = `${uid}-${field.id}`;
  const inputId = `${base}-input`;
  const labelId = `${base}-label`;
  const helpId = `${base}-help`;
  const changedId = `${base}-changed`;
  const messageId = `${base}-message`;
  const describedBy = [
    field.description ? helpId : null,
    dirty ? changedId : null,
    message ? messageId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const off = disabled || !!field.disabled;
  const control: ControlProps = {
    inputId,
    labelId,
    describedBy,
    invalid: !!message && edge !== "saved",
    disabled: off,
    readOnly: busy,
    motionSafe,
    reverse,
  };
  const set = (v: SettingsValue) => onChange(field.id, v);
  const lit = edge === "dirty" || edge === "error";
  // A confirmed field flashes success, then lets the glow go while it is
  // still green, so the edge never fades out in the accent.
  const settling = edge === "saved";
  const settle = {
    duration: 1.1,
    times: [0, 0.4, 1],
    ease: "easeOut" as const,
  };
  const tone =
    edge === "saved"
      ? "[--settings-glow:var(--success)]"
      : edge === "error"
        ? "[--settings-glow:var(--danger)]"
        : "[--settings-glow:var(--accent-bright)]";
  const reach = Math.round(18 + clamp(glow, 0, 1) * 62);
  const strength = Math.round(6 + clamp(glow, 0, 1) * 22);
  const bloom = `linear-gradient(90deg, color-mix(in oklab, var(--settings-glow) ${strength}%, transparent), transparent)`;
  const flareBloom = `linear-gradient(90deg, color-mix(in oklab, var(--settings-glow) ${Math.min(40, strength * 2 + 6)}%, transparent), transparent)`;

  let body: React.ReactNode = null;
  switch (field.kind) {
    case "text":
    case "textarea":
      body = (
        <TextControl
          {...control}
          field={field}
          value={String(value)}
          saved={String(saved)}
          rewind={rewind}
          onChange={set}
          onRewound={() => onRewound(field.id)}
          onEscape={() => {
            if (!dirty || busy) return false;
            onRevert(field.id, null);
            return true;
          }}
        />
      );
      break;
    case "switch":
      body = <SwitchControl {...control} value={!!value} onChange={set} />;
      break;
    case "choice":
      body = (
        <ChoiceControl
          {...control}
          field={field}
          value={String(value)}
          onChange={set}
          layoutKey={`${base}-pill`}
        />
      );
      break;
    case "select":
      body = (
        <SelectControl
          {...control}
          field={field}
          value={String(value)}
          onChange={set}
        />
      );
      break;
    case "range":
      body = (
        <RangeControl
          {...control}
          field={field}
          value={Number(value)}
          onChange={set}
        />
      );
      break;
  }

  // A refused field shakes in place — a tween, no bounce — without
  // remounting its control, so focus inside it stays put.
  const shakeX = useMotionValue(0);
  React.useEffect(() => {
    if (!shake || !motionSafe) return;
    const run = animate(shakeX, [0, -6, 6, -4, 4, -2, 0], {
      duration: 0.42,
      ease: "easeInOut",
    });
    return () => {
      run.stop();
      shakeX.jump(0);
    };
  }, [shake, motionSafe, shakeX]);

  // The rewind of a control without its own replay is the value going back,
  // at its turn in the sequence; the control animates the change itself.
  const latest = React.useRef(onRewound);
  React.useEffect(() => {
    latest.current = onRewound;
  });
  const replays = field.kind === "text" || field.kind === "textarea";
  React.useEffect(() => {
    if (!rewind || replays) return;
    const timer = window.setTimeout(
      () => latest.current(field.id),
      rewind.delay,
    );
    return () => window.clearTimeout(timer);
  }, [rewind, replays, field.id]);

  return (
    <div
      className={cn(
        "relative isolate grid gap-x-6 gap-y-2 px-4 py-3.5 @min-[40rem]:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] @min-[40rem]:px-5",
        tone,
      )}
    >
      {glow > 0 ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 -z-10"
          style={{ width: `${reach}%`, background: bloom }}
          initial={false}
          animate={settling ? { opacity: [1, 1, 0] } : { opacity: lit ? 1 : 0 }}
          transition={
            settling
              ? settle
              : {
                  duration: lit ? durations.base : durations.slow,
                  ease: lit ? easings.enter : easings.exit,
                }
          }
        />
      ) : null}
      {flare && motionSafe && glow > 0 ? (
        <motion.span
          key={flare}
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 -z-10"
          style={{
            width: `${Math.min(100, reach + 12)}%`,
            background: flareBloom,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, times: [0, 0.22, 1], ease: "easeOut" }}
        />
      ) : null}
      <motion.span
        aria-hidden
        className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-[var(--settings-glow)] transition-colors"
        style={{ originY: 0.5 }}
        initial={false}
        animate={
          settling
            ? { scaleY: 1, opacity: [1, 1, 0] }
            : { scaleY: lit ? 1 : 0, opacity: lit ? 1 : 0 }
        }
        transition={
          settling
            ? settle
            : !motionSafe
              ? {
                  scaleY: { duration: 0 },
                  opacity: { duration: durations.fast },
                }
              : lit
                ? {
                    scaleY: springs.snap,
                    opacity: { duration: durations.fast },
                  }
                : { duration: durations.base, ease: easings.exit }
        }
      />

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {field.kind === "switch" ||
          field.kind === "choice" ||
          field.kind === "range" ? (
            <span
              id={labelId}
              className="truncate text-[13px] font-medium text-foreground"
            >
              {field.label}
            </span>
          ) : (
            <label
              id={labelId}
              htmlFor={inputId}
              className="truncate text-[13px] font-medium text-foreground"
            >
              {field.label}
            </label>
          )}
          <AnimatePresence initial={false}>
            {confirmed ? (
              <motion.svg
                key={confirmed}
                aria-hidden
                viewBox="0 0 16 16"
                className="size-4 shrink-0 text-success"
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: durations.base } }}
              >
                <motion.path
                  d="M3.5 8.5 6.6 11.5 12.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: motionSafe ? 0 : 1 }}
                  animate={{ pathLength: 1 }}
                  transition={motionSafe ? springs.flick : { duration: 0 }}
                />
              </motion.svg>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            aria-label={`Revert ${field.label}`}
            title={`Back to ${readValue(field, saved)}`}
            disabled={!dirty || busy || off}
            onClick={(event) => onRevert(field.id, event.currentTarget)}
            className={cn(
              "ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-[opacity,color] hover:text-foreground",
              dirty && !busy ? "opacity-100" : "pointer-events-none opacity-0",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
          </button>
        </div>
        {field.description ? (
          <p id={helpId} className="mt-0.5 text-[12px] leading-4 text-ink-3">
            {field.description}
          </p>
        ) : null}
        {dirty ? (
          <span id={changedId} className="sr-only">
            Changed from {readValue(field, saved)}.
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col items-start gap-1.5 @min-[40rem]:justify-center">
        <motion.div className="flex w-full" style={{ x: shakeX }}>
          {body}
        </motion.div>
        {message ? (
          <p
            id={messageId}
            className={cn(
              "flex items-center gap-1.5 text-[12px]",
              edge === "saved" ? "text-ink-3" : "text-danger",
            )}
          >
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------- form ----------------------------------- */

type Phase =
  "idle" | "saving" | "confirming" | "saved" | "rewinding" | "failed";

type Said = { n: number; text: string };

/**
 * A settings form that knows what you changed. A field whose draft differs
 * from what is saved glows at its edge — a bar that grows on snap and a bloom
 * of accent washing into the row — and a save bar slides up counting the
 * changes, its digit rolling on snap as fields change and come back.
 *
 * Discard plays every change backwards: text deletes back to what it shares
 * with the saved value and types the rest, a switch's knob slides home, a
 * choice's indicator slides back, a select's label rolls back down, a range's
 * thumb glides home — newest edit first (`rewind="sequence"`), all together,
 * or all at once with no replay. Save waits on `onSave`'s promise, then
 * confirms field by field: the edge turns success, a check draws on flick,
 * and the bar counts down to "All changes saved". Fields a save refuses
 * shake (a tween, no bounce), say why and stay changed.
 *
 * It is a real form: Enter in a text field saves, Ctrl/⌘+S saves, Escape in
 * a changed text field takes it back, every field has its Revert, and a
 * polite status says what changed, saved or was discarded. Under reduced
 * motion nothing travels: values swap, the glow fades in and out, the bar
 * fades in place, and the count and confirmations still change.
 */
export function SettingsForm({
  sections = defaultSettingsSections,
  value,
  defaultValue,
  defaultDraft,
  onValueChange,
  onDraftChange,
  onSave,
  onDiscard,
  glow = 0.6,
  bar = "dock",
  rewind = "sequence",
  rewindDuration = 520,
  confirmStagger = 110,
  savedHold = 1400,
  title = "Settings",
  description,
  label,
  saveLabel = "Save",
  discardLabel = "Discard",
  status = "ready",
  onRetry,
  sound = false,
  disabled = false,
  className,
}: SettingsFormProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const titleId = `${uid}-title`;

  const fields = React.useMemo(
    () => sections.flatMap((s) => s.fields),
    [sections],
  );
  const byId = React.useMemo(
    () => new Map(fields.map((f) => [f.id, f])),
    [fields],
  );
  const fallback = React.useMemo(() => settingsValuesOf(sections), [sections]);

  const [ownSaved, setOwnSaved] = React.useState<SettingsValues>(
    () => defaultValue ?? {},
  );
  const saved: SettingsValues = { ...fallback, ...(value ?? ownSaved) };
  const savedKey = JSON.stringify(saved);

  const [draft, setDraft] = React.useState<SettingsValues>(() => ({
    ...saved,
    ...defaultDraft,
  }));
  // Saved values that change underneath (a save landing, a host update) carry
  // along every field that was not being edited; edits in progress stay.
  const [seenKey, setSeenKey] = React.useState(savedKey);
  const [seenSaved, setSeenSaved] = React.useState(saved);
  if (seenKey !== savedKey) {
    setSeenKey(savedKey);
    setSeenSaved(saved);
    setDraft((d) => {
      const next = { ...d };
      for (const f of fields) {
        if (next[f.id] === undefined || next[f.id] === seenSaved[f.id]) {
          next[f.id] = saved[f.id] ?? fallbackOf(f);
        }
      }
      return next;
    });
  }

  // Every write goes through this ref first, so writes from timers that land
  // before React renders chain onto each other instead of onto a stale draft.
  // It catches up with each commit before any timer can run.
  const draftRef = React.useRef(draft);
  React.useLayoutEffect(() => {
    draftRef.current = draft;
  });

  const valueOf = (id: string) => draft[id] ?? saved[id] ?? "";
  const dirtyIds = fields
    .filter((f) => valueOf(f.id) !== saved[f.id])
    .map((f) => f.id);
  const isDirty = (id: string) => dirtyIds.includes(id);

  // A restored draft's edits count as made in field order.
  const [order, setOrder] = React.useState<string[]>(() =>
    fields
      .filter(
        (f) =>
          defaultDraft?.[f.id] !== undefined &&
          defaultDraft[f.id] !== saved[f.id],
      )
      .map((f) => f.id),
  );
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [pending, setPending] = React.useState<string[]>([]);
  const [confirmed, setConfirmed] = React.useState<Record<string, number>>({});
  const [refused, setRefused] = React.useState<Record<string, string>>({});
  const [shakes, setShakes] = React.useState<Record<string, number>>({});
  const [flares, setFlares] = React.useState<Record<string, number>>({});
  const [tickets, setTickets] = React.useState<Record<string, Ticket>>({});
  const [tried, setTried] = React.useState(false);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const [active, setActive] = React.useState(sections[0]?.id ?? "");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const sectionNodes = React.useRef(new Map<string, HTMLElement>());
  const timers = React.useRef(new Set<number>());
  const counter = React.useRef(0);
  const armed = React.useRef(false);
  const alive = React.useRef(true);
  const ticketsLeft = React.useRef(0);
  /** A field Revert moved focus into, to follow once its value lands. */
  const refocus = React.useRef<{ id: string; node: Element | null } | null>(
    null,
  );

  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  const next = () => {
    counter.current += 1;
    return counter.current;
  };
  const click = (pitch: number, gain: number, el?: Element | null) => {
    const rect = el?.getBoundingClientRect();
    audio.play("click", {
      pitch,
      gain,
      pan: rect ? panFrom(rect.left + rect.width / 2, null) : 0,
    });
  };

  const validation = (id: string, v: SettingsValue): string | null => {
    const f = byId.get(id);
    if (!f || (f.kind !== "text" && f.kind !== "textarea") || !f.validate) {
      return null;
    }
    return f.validate(String(v));
  };

  const busy =
    phase === "saving" || phase === "confirming" || phase === "rewinding";
  // Fields a save has taken but not yet ticked still count, once each.
  const count = new Set([...dirtyIds, ...pending]).size;
  const showBar =
    !disabled && status === "ready" && (count > 0 || phase !== "idle");

  const changesFor = (ids: string[]): SettingsChange[] =>
    ids.flatMap((id) => {
      const f = byId.get(id);
      if (!f) return [];
      return [{ id, label: f.label, from: saved[id] ?? "", to: valueOf(id) }];
    });

  /** Focus leaving with the bar goes to the heading, never to the page. */
  const rescueFocus = () => {
    const at = document.activeElement;
    if (at && barRef.current?.contains(at)) {
      headingRef.current?.focus({ preventScroll: true });
    }
  };

  /* -------------------------------- editing -------------------------------- */

  const dirtyOf = (d: SettingsValues) =>
    fields
      .filter((f) => (d[f.id] ?? saved[f.id]) !== saved[f.id])
      .map((f) => f.id);

  /** Writes the draft and tells the host, from whatever caused the change. */
  const writeDraft = (patch: SettingsValues) => {
    const nextDraft = { ...draftRef.current, ...patch };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    const dirtyNow = dirtyOf(nextDraft);
    onDraftChange?.(nextDraft, dirtyNow);
    return dirtyNow;
  };

  const change = (id: string, v: SettingsValue) => {
    if (busy || disabled) return;
    const was = isDirty(id);
    const now = v !== saved[id];
    const dirtyNow = writeDraft({ [id]: v });
    setOrder((o) => [...o.filter((x) => x !== id), ...(now ? [id] : [])]);
    if (refused[id]) {
      setRefused((r) => omit(r, id));
    }
    if (phase === "failed") setPhase("idle");
    if (!was && now) setFlares((f) => ({ ...f, [id]: next() }));
    if (was !== now) {
      say(
        dirtyNow.length === 0
          ? "No unsaved changes."
          : `${plural(dirtyNow.length, "unsaved change", "unsaved changes")}.`,
      );
    }
  };

  /* ------------------------------- rewinding ------------------------------- */

  const startRewind = (ids: string[], style: SettingsRewind) => {
    if (ids.length === 0) return;
    setPhase("rewinding");
    if (style === "instant" || !motionSafe) {
      const back: SettingsValues = {};
      for (const id of ids) back[id] = saved[id] ?? "";
      writeDraft(back);
      setOrder((o) => o.filter((x) => !ids.includes(x)));
      for (const id of ids) follow(id);
      armed.current = false;
      later(durations.slow * 1000, () => {
        rescueFocus();
        setPhase("idle");
      });
      return;
    }
    const n = ids.length;
    const gap =
      style === "sequence" && n > 1 ? Math.min(140, 520 / (n - 1)) : 0;
    const issued: Record<string, Ticket> = {};
    ids.forEach((id, i) => {
      issued[id] = {
        n: next(),
        delay: Math.round(i * gap),
        duration: Math.max(160, rewindDuration),
      };
    });
    ticketsLeft.current = n;
    setTickets(issued);
  };

  /** Once a reverted value lands, focus follows it (a choice's checked radio moves). */
  const follow = (id: string) => {
    const r = refocus.current;
    if (!r || r.id !== id) return;
    refocus.current = null;
    requestAnimationFrame(() => {
      if (document.activeElement !== r.node) return;
      document.getElementById(`${uid}-${id}-input`)?.focus();
    });
  };

  const rewound = (id: string) => {
    if (!alive.current) return;
    writeDraft({ [id]: saved[id] ?? "" });
    follow(id);
    setOrder((o) => o.filter((x) => x !== id));
    setTickets((t) => omit(t, id));
    if (armed.current) {
      const left = Math.max(0, ticketsLeft.current - 1);
      click(0.7 + left * 0.06, 0.28);
    }
    ticketsLeft.current = Math.max(0, ticketsLeft.current - 1);
    if (ticketsLeft.current === 0) {
      armed.current = false;
      later(durations.base * 1000, () => {
        rescueFocus();
        setPhase((p) => (p === "rewinding" ? "idle" : p));
      });
    }
  };

  const discard = (el?: Element | null) => {
    if (busy || disabled || dirtyIds.length === 0) return;
    armed.current = true;
    click(0.85, 0.5, el);
    const newestFirst = [
      ...[...order].reverse().filter((id) => dirtyIds.includes(id)),
      ...dirtyIds.filter((id) => !order.includes(id)),
    ];
    const ids =
      rewind === "sequence"
        ? newestFirst
        : fields.map((f) => f.id).filter((id) => dirtyIds.includes(id));
    onDiscard?.(changesFor(ids));
    setRefused({});
    setTried(false);
    say(`Discarded ${plural(ids.length, "change", "changes")}.`);
    startRewind(ids, rewind);
  };

  const revert = (id: string, el: Element | null) => {
    if (busy || disabled || !isDirty(id)) return;
    armed.current = true;
    click(0.9, 0.42, el);
    // A Revert button goes away with the change it reverts: focus moves on
    // to the field itself rather than falling to the page.
    if (el) {
      const node = document.getElementById(`${uid}-${id}-input`);
      node?.focus();
      refocus.current = { id, node };
    }
    setRefused((r) => omit(r, id));
    say(`${byId.get(id)?.label ?? "Field"} reverted.`);
    startRewind([id], rewind === "instant" ? "instant" : "together");
  };

  /* -------------------------------- saving --------------------------------- */

  const confirmInTurn = (ids: string[], refusedNow: Record<string, string>) => {
    setPhase("confirming");
    setPending(ids);
    ids.forEach((id, i) => {
      later(i * Math.max(0, confirmStagger), () => {
        setPending((p) => p.filter((x) => x !== id));
        const key = next();
        setConfirmed((c) => ({ ...c, [id]: key }));
        later(1300, () =>
          setConfirmed((c) => (c[id] === key ? omit(c, id) : c)),
        );
        if (armed.current) {
          audio.play("pop", {
            pitch: 1 + i * 0.07,
            gain: 0.45,
            pan: panAt(id),
          });
        }
      });
    });
    const after = ids.length * Math.max(0, confirmStagger) + 120;
    const refusedIds = Object.keys(refusedNow);
    later(after, () => {
      armed.current = false;
      if (refusedIds.length > 0) {
        setPhase("idle");
        return;
      }
      setPhase("saved");
      later(Math.max(0, savedHold), () => {
        rescueFocus();
        setPhase((p) => (p === "saved" ? "idle" : p));
      });
    });
  };

  const panAt = (id: string) => {
    const node = document.getElementById(`${uid}-${id}-input`);
    const rect = node?.getBoundingClientRect();
    return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
  };

  const save = (el?: Element | null) => {
    if (busy || disabled) return;
    if (dirtyIds.length === 0) return;
    const invalid = dirtyIds.filter(
      (id) => validation(id, valueOf(id)) !== null,
    );
    setTried(true);
    if (invalid.length > 0) {
      click(0.75, 0.45, el);
      setShakes((s) => {
        const out = { ...s };
        for (const id of invalid) out[id] = next();
        return out;
      });
      const first = invalid[0] ?? "";
      say(
        `Fix ${plural(invalid.length, "field", "fields")} first. ${byId.get(first)?.label ?? ""}: ${validation(first, valueOf(first)) ?? ""}`,
      );
      document.getElementById(`${uid}-${first}-input`)?.focus();
      return;
    }
    armed.current = true;
    click(1.15, 0.55, el);
    const ids = fields.map((f) => f.id).filter((id) => dirtyIds.includes(id));
    const changes = changesFor(ids);
    const snapshot = { ...draft };
    setPhase("saving");
    setRefused({});
    say(`Saving ${plural(ids.length, "change", "changes")}.`);

    const land = (result: SettingsSaveResult) => {
      if (!alive.current) return;
      const refusedNow: Record<string, string> = {};
      for (const [id, message] of Object.entries(result?.errors ?? {})) {
        if (ids.includes(id)) refusedNow[id] = message;
      }
      const accepted = ids.filter((id) => !(id in refusedNow));
      const nextSaved: SettingsValues = { ...saved };
      for (const id of accepted) nextSaved[id] = snapshot[id] ?? "";
      if (accepted.length > 0) {
        if (value === undefined) setOwnSaved(nextSaved);
        onValueChange?.(nextSaved);
      }
      setRefused(refusedNow);
      if (Object.keys(refusedNow).length > 0) {
        setShakes((s) => {
          const out = { ...s };
          for (const id of Object.keys(refusedNow)) out[id] = next();
          return out;
        });
      }
      const names = accepted.map((id) => byId.get(id)?.label ?? id);
      const problems = Object.entries(refusedNow).map(
        ([id, m]) => `${byId.get(id)?.label ?? id}: ${m}`,
      );
      say(
        [accepted.length > 0 ? `Saved ${listed(names)}.` : "", ...problems]
          .filter(Boolean)
          .join(" "),
      );
      confirmInTurn(accepted, refusedNow);
    };
    const fail = () => {
      if (!alive.current) return;
      armed.current = false;
      setPhase("failed");
      say("Could not save. Your changes are still here.");
    };

    let result: SettingsSaveResult | Promise<SettingsSaveResult>;
    try {
      result = onSave?.(changes, snapshot);
    } catch {
      fail();
      return;
    }
    if (result && typeof (result as Promise<unknown>).then === "function") {
      (result as Promise<SettingsSaveResult>).then(land, fail);
    } else {
      land(result as SettingsSaveResult);
    }
  };

  /* -------------------------------- effects -------------------------------- */

  React.useEffect(() => {
    alive.current = true;
    const running = timers.current;
    return () => {
      alive.current = false;
      for (const t of running) window.clearTimeout(t);
      running.clear();
    };
  }, []);

  // The section in view lights its entry in the side nav (wide layout only).
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const spy = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = root.scrollTop + 48;
        let current = sections[0]?.id ?? "";
        for (const s of sections) {
          const node = sectionNodes.current.get(s.id);
          if (node && node.offsetTop <= top) current = s.id;
        }
        const atEnd =
          root.scrollTop + root.clientHeight >= root.scrollHeight - 2;
        const last = sections[sections.length - 1]?.id;
        setActive(atEnd && last ? last : current);
      });
    };
    root.addEventListener("scroll", spy, { passive: true });
    return () => {
      root.removeEventListener("scroll", spy);
      cancelAnimationFrame(frame);
    };
  }, [sections]);

  const jump = (id: string) => {
    const root = rootRef.current;
    const node = sectionNodes.current.get(id);
    if (!root || !node) return;
    setActive(id);
    root.scrollTo({
      top: Math.max(0, node.offsetTop - 8),
      behavior: motionSafe ? "smooth" : "auto",
    });
  };

  /* --------------------------------- render -------------------------------- */

  const edgeOf = (id: string): Edge => {
    if (refused[id] && isDirty(id)) return "error";
    if (confirmed[id]) return "saved";
    if (isDirty(id) || pending.includes(id)) return "dirty";
    return "idle";
  };
  const messageOf = (id: string): string | undefined => {
    if (refused[id] && isDirty(id)) return refused[id];
    const v = valueOf(id);
    const problem = isDirty(id) ? validation(id, v) : null;
    if (problem && (tried || String(v).length > 0)) return problem;
    return undefined;
  };

  const refusedCount = dirtyIds.filter((id) => refused[id]).length;
  const barState:
    | "dirty"
    | "saving"
    | "confirming"
    | "saved"
    | "rewinding"
    | "failed"
    | "refused" =
    phase === "idle"
      ? refusedCount > 0
        ? "refused"
        : "dirty"
      : phase === "failed"
        ? "failed"
        : phase;
  const barText = {
    dirty: count === 1 ? "unsaved change" : "unsaved changes",
    saving: "saving…",
    confirming: "saving…",
    saved: "All changes saved",
    rewinding: "discarding…",
    failed: "Could not save · try again",
    refused: refusedCount === 1 ? "needs attention" : "need attention",
  }[barState];
  const shownCount = barState === "refused" ? refusedCount : count;
  const lockBar = busy || barState === "saved";

  const barBody = (
    <>
      <p className="flex min-w-0 items-center gap-2 text-[13px]">
        {barState === "saved" ? (
          <Check aria-hidden className="size-4 shrink-0 text-success" />
        ) : barState === "failed" ? (
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-danger" />
        ) : (
          <span
            className={cn(
              "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-[11px] font-medium",
              barState === "refused"
                ? "bg-danger/12 text-danger"
                : "bg-cobalt-wash text-cobalt-bright",
            )}
          >
            <Count value={shownCount} motionSafe={motionSafe} />
            <span className="sr-only">{shownCount}</span>
          </span>
        )}
        <span
          className={cn(
            "truncate",
            barState === "failed" ? "text-danger" : "text-foreground",
          )}
        >
          {barText}
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          aria-disabled={lockBar || dirtyIds.length === 0 || undefined}
          onClick={(event) => discard(event.currentTarget)}
          className={cn(
            "inline-flex h-8 items-center rounded-2 px-3 text-xs text-ink-2 transition-colors",
            lockBar || dirtyIds.length === 0
              ? "cursor-default opacity-50"
              : "hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          {discardLabel}
        </button>
        <button
          type="button"
          aria-disabled={lockBar || dirtyIds.length === 0 || undefined}
          onClick={(event) => save(event.currentTarget)}
          className={cn(
            "relative inline-flex h-8 items-center justify-center rounded-2 bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors",
            lockBar || dirtyIds.length === 0
              ? "cursor-default opacity-60"
              : "hover:bg-primary/90",
            FOCUS_RING,
          )}
        >
          <span className={cn(phase === "saving" && "invisible")}>
            {saveLabel}
          </span>
          {phase === "saving" ? (
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className={cn("absolute size-4", motionSafe && "animate-spin")}
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.3"
                strokeWidth="1.8"
              />
              <path
                d="M8 2a6 6 0 0 1 6 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          ) : null}
        </button>
      </div>
    </>
  );

  const barTransition = motionSafe
    ? springs.snap
    : { duration: durations.fast };
  const barExit = motionSafe
    ? { duration: durations.base * 0.6, ease: easings.exit }
    : { duration: durations.fast };

  const stickyBar = (
    <AnimatePresence initial={false}>
      {showBar && bar !== "inline" ? (
        <motion.div
          key="bar"
          ref={barRef}
          role="group"
          aria-label="Unsaved changes"
          className={cn(
            "sticky z-20 flex items-center justify-between gap-3",
            bar === "dock"
              ? "bottom-0 border-t border-hairline bg-popover px-4 py-2.5 @min-[40rem]:px-5"
              : "bottom-3 mx-auto mb-3 w-fit max-w-[calc(100%-1.5rem)] rounded-full border border-hairline-strong bg-popover py-1.5 pr-1.5 pl-3 shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]",
          )}
          initial={
            motionSafe
              ? bar === "dock"
                ? { y: "100%" }
                : { y: 16, opacity: 0 }
              : { opacity: 0 }
          }
          animate={{ y: 0, opacity: 1 }}
          exit={
            motionSafe
              ? bar === "dock"
                ? { y: "100%", transition: barExit }
                : { y: 16, opacity: 0, transition: barExit }
              : { opacity: 0, transition: barExit }
          }
          transition={barTransition}
        >
          {barBody}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const inlineBar = (
    <AnimatePresence initial={false}>
      {showBar && bar === "inline" ? (
        <motion.div
          key="inline-bar"
          className="overflow-clip"
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0, transition: barExit }}
          transition={motionSafe ? springs.glide : { duration: durations.fast }}
        >
          <motion.div
            ref={barRef}
            role="group"
            aria-label="Unsaved changes"
            className="mx-4 mt-1 mb-4 flex items-center justify-between gap-3 rounded-3 border border-hairline bg-surface-1 py-2 pr-2 pl-3 @min-[40rem]:mx-5"
            initial={motionSafe ? { y: 8, opacity: 0 } : { opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={barTransition}
          >
            {barBody}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const changeList = fields
    .filter((f) => isDirty(f.id))
    .map((f) => ({ f, from: saved[f.id] ?? "", to: valueOf(f.id) }));

  const nav = (
    <nav
      aria-label="Sections"
      className="sticky top-0 hidden self-start pt-4 @min-[68rem]:block"
    >
      <ul role="list" className="flex flex-col gap-0.5">
        {sections.map((s) => {
          const n = s.fields.filter((f) => isDirty(f.id)).length;
          const on = active === s.id;
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-current={on ? "true" : undefined}
                onClick={() => jump(s.id)}
                className={cn(
                  "relative flex h-8 w-full items-center justify-between gap-2 rounded-2 px-2.5 text-left text-[13px] transition-colors",
                  on ? "text-foreground" : "text-ink-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                {on ? (
                  <motion.span
                    layoutId={`${uid}-nav`}
                    aria-hidden
                    className="absolute inset-0 rounded-2 bg-surface-2"
                    transition={motionSafe ? springs.snap : { duration: 0 }}
                  />
                ) : null}
                <span className="relative truncate">{s.title}</span>
                {n > 0 ? (
                  <span className="relative inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-cobalt-wash px-1 font-mono text-[10px] text-cobalt-bright">
                    {n}
                    <span className="sr-only"> changed</span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const aside = (
    <aside
      aria-labelledby={`${uid}-changes`}
      className="sticky top-0 hidden self-start pt-4 pb-4 @min-[68rem]:block"
    >
      <div className="rounded-3 border border-hairline bg-surface-1 p-3">
        <h3
          id={`${uid}-changes`}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Changes
        </h3>
        {changeList.length === 0 ? (
          <p className="mt-2 text-[12px] text-ink-3">
            {phase === "saved" || phase === "confirming"
              ? "Everything is saved."
              : "No unsaved changes."}
          </p>
        ) : (
          <ul role="list" className="mt-2 flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {changeList.map(({ f, from, to }) => (
                <motion.li
                  key={f.id}
                  layout={motionSafe ? "position" : false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: barExit }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                  className="flex items-center gap-2 rounded-2 py-1"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      refused[f.id] ? "bg-danger" : "bg-cobalt-bright",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-foreground">
                      {f.label}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-ink-3">
                      {readValue(f, from)} → {readValue(f, to)}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Revert ${f.label}`}
                    disabled={busy}
                    onClick={(event) => revert(f.id, event.currentTarget)}
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40",
                      FOCUS_RING,
                    )}
                  >
                    <RotateCcw aria-hidden className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </aside>
  );

  const form = (
    <form
      noValidate
      aria-labelledby={titleId}
      onSubmit={(event) => {
        event.preventDefault();
        save(null);
      }}
      className="min-w-0"
    >
      {sections.map((s) => (
        <section
          key={s.id}
          ref={(node) => {
            if (node) sectionNodes.current.set(s.id, node);
            else sectionNodes.current.delete(s.id);
          }}
          aria-labelledby={`${uid}-s-${s.id}`}
          className="border-b border-hairline last:border-b-0"
        >
          <div className="px-4 pt-4 pb-1 @min-[40rem]:px-5">
            <h3
              id={`${uid}-s-${s.id}`}
              className="text-[13px] font-semibold text-foreground"
            >
              {s.title}
            </h3>
            {s.description ? (
              <p className="mt-0.5 text-[12px] text-ink-3">{s.description}</p>
            ) : null}
          </div>
          <div className="divide-y divide-hairline">
            {s.fields.map((f) => (
              <FieldRow
                key={f.id}
                field={f}
                uid={uid}
                value={valueOf(f.id)}
                saved={saved[f.id] ?? ""}
                edge={edgeOf(f.id)}
                dirty={isDirty(f.id)}
                confirmed={confirmed[f.id]}
                message={messageOf(f.id)}
                flare={flares[f.id]}
                shake={shakes[f.id]}
                rewind={tickets[f.id]}
                busy={busy}
                disabled={disabled}
                glow={glow}
                motionSafe={motionSafe}
                reverse={phase === "rewinding"}
                onChange={change}
                onRevert={revert}
                onRewound={rewound}
              />
            ))}
          </div>
        </section>
      ))}
      {/* A hidden submit lets Enter in a text field save, as forms do. */}
      <button type="submit" tabIndex={-1} aria-hidden className="sr-only">
        {saveLabel}
      </button>
      {inlineBar}
    </form>
  );

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-3 p-4">
          <p className="sr-only">Loading settings.</p>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="h-3 w-32 rounded-1 bg-surface-2" />
              <div className="h-9 rounded-2 bg-surface-2" />
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">Settings did not load.</p>
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
      );
    }
    return (
      <div className="@min-[68rem]:grid @min-[68rem]:grid-cols-[11rem_minmax(0,1fr)_16rem] @min-[68rem]:gap-6 @min-[68rem]:px-5">
        {nav}
        {form}
        {aside}
      </div>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onKeyDown={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === "s"
        ) {
          event.preventDefault();
          save(null);
        }
      }}
      className={cn(
        "@container relative h-[560px] w-full [scrollbar-width:thin] overflow-y-auto overscroll-contain rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3 @min-[40rem]:px-5">
        <div className="min-w-0">
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className={cn(
              "truncate rounded-1 text-sm font-semibold",
              FOCUS_RING,
            )}
          >
            {title}
          </h2>
          {description ? (
            <p className="truncate text-[11px] text-ink-3">{description}</p>
          ) : null}
        </div>
        <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:inline">
          {count > 0
            ? `${plural(count, "change", "changes")} pending`
            : "All saved"}
        </span>
      </header>
      {body()}
      {stickyBar}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
