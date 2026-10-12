"use client";

import * as React from "react";

import { AnimatePresence, motion, useInView } from "motion/react";
import {
  Check,
  FileClock,
  History,
  Inbox,
  RotateCcw,
  TriangleAlert,
  Undo2,
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

export type KeeperFieldKind = "text" | "textarea" | "number" | "select";

export type KeeperField = {
  id: string;
  /** The field's label, e.g. "Project title". */
  label: string;
  kind: KeeperFieldKind;
  /** Which section heading it sits under. */
  section: string;
  placeholder?: string;
  /** A line under the field. */
  hint?: string;
  /** Choices for a select. */
  options?: { id: string; label: string }[];
  /** Takes the whole row from a 40rem container; textareas always do. @default false */
  wide?: boolean;
};

/** Field id to its text; a select holds an option id, a number its digits. */
export type KeeperValues = Record<string, string>;

export type KeeperDraft = {
  id: string;
  /** When it was kept, in ms. */
  savedAt: number;
  values: KeeperValues;
  /** Ids of the fields that differed from the draft before it. */
  changed: string[];
  /** Characters added (or, negative, removed) since the draft before it. */
  delta: number;
};

export type KeeperChange = { fieldId: string; from: string; to: string };
export type KeeperLeaveOutcome = "saved" | "discarded" | "stayed" | "clean";
export type KeeperSaveReason = "auto" | "now" | "retry" | "leave";
export type KeeperChipStyle = "ring" | "bar" | "dot";
export type KeeperDensity = "compact" | "cozy" | "roomy";
export type KeeperStatus = "ready" | "loading" | "error";

export type DraftKeeperProps = {
  /** How the keeper chip counts down: a ring that drains, a bar that shortens, or a dot that shrinks. @default "ring" */
  chipStyle?: KeeperChipStyle;
  /** Field heights, type size and section spacing. @default "cozy" */
  density?: KeeperDensity;
  /** Seconds of quiet after the last keystroke before the keeper saves. @default 4 */
  autosaveSeconds?: number;
  /** The form's fields, in order, grouped by their section. @default defaultKeeperFields */
  fields?: KeeperField[];
  /** Controlled values. */
  value?: KeeperValues;
  /** Initial values when uncontrolled. @default defaultKeeperValues */
  defaultValue?: KeeperValues;
  /** Fires from every keystroke, pick, restore or discard that changed a value, with all of them. */
  onChange?: (values: KeeperValues, change: KeeperChange) => void;
  /** Controlled drafts, oldest first. */
  drafts?: KeeperDraft[];
  /** Initial drafts when uncontrolled. @default defaultKeeperDrafts */
  defaultDrafts?: KeeperDraft[];
  /** Fires after a save kept a new draft, with all of them. */
  onDraftsChange?: (drafts: KeeperDraft[]) => void;
  /** Persists a save; resolve to keep the draft, reject to fail it. @default a simulator that waits `saveDelay` and fails while `saveFails` */
  onSave?: (values: KeeperValues, changed: string[]) => Promise<void>;
  /** The built-in simulator rejects while this is true. @default false */
  saveFails?: boolean;
  /** How long the built-in simulator takes, in ms. @default 700 */
  saveDelay?: number;
  /** A draft was kept. It is already in the drafts. */
  onSaved?: (draft: KeeperDraft, reason: KeeperSaveReason) => void;
  /** A save was rejected; the chip shows Retry. */
  onSaveError?: (error: unknown, reason: KeeperSaveReason) => void;
  /** A draft's values were restored into the form. */
  onRestore?: (draft: KeeperDraft) => void;
  /** Asks to leave: a guard opens over unsaved changes; with nothing unsaved, `onLeave` fires at once with "clean". Clear it in `onLeave`. @default false */
  leaving?: boolean;
  /** The guard's outcome: saved and gone, discarded and gone, stayed, or nothing was unsaved. */
  onLeave?: (outcome: KeeperLeaveOutcome) => void;
  /** Whether the form and its drafts have arrived. @default "ready" */
  status?: KeeperStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** Prints a draft's time in the drawer. @default UTC "HH:MM" */
  formatTime?: (at: number) => string;
  /** The heading. @default "Grant application" */
  title?: string;
  /** A line under the heading, hidden below a 30rem container. @default "Coldbrook Community Fund" */
  subtitle?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the form scrolls inside it. @default 560 */
  height?: number;
  /** Read only: nothing can be typed, saved or restored. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Monday 12 October 2026, 14:08 UTC: six minutes after the last draft. */
export const defaultKeeperNow = Date.UTC(2026, 9, 12, 14, 8);

/** Coldbrook Community Fund: the application form in three sections. */
export const defaultKeeperFields: KeeperField[] = [
  {
    id: "org",
    label: "Organisation",
    kind: "text",
    section: "Applicant",
    placeholder: "Registered name",
  },
  {
    id: "contact",
    label: "Contact name",
    kind: "text",
    section: "Applicant",
  },
  {
    id: "email",
    label: "Email",
    kind: "text",
    section: "Applicant",
    placeholder: "name@example.org",
    hint: "Where the decision is sent.",
  },
  {
    id: "phone",
    label: "Phone",
    kind: "text",
    section: "Applicant",
    placeholder: "Optional",
  },
  {
    id: "title",
    label: "Project title",
    kind: "text",
    section: "Project",
    wide: true,
  },
  {
    id: "summary",
    label: "Summary",
    kind: "textarea",
    section: "Project",
    placeholder: "What the project does and who it is for, in a paragraph.",
    hint: "Up to 150 words.",
  },
  {
    id: "strand",
    label: "Funding strand",
    kind: "select",
    section: "Project",
    options: [
      { id: "community", label: "Community spaces" },
      { id: "heritage", label: "Heritage and archives" },
      { id: "access", label: "Access and inclusion" },
      { id: "research", label: "Small research" },
    ],
  },
  {
    id: "start",
    label: "Start month",
    kind: "text",
    section: "Project",
    placeholder: "YYYY-MM",
  },
  {
    id: "requested",
    label: "Amount requested",
    kind: "number",
    section: "Budget",
    placeholder: "0",
    hint: "Whole pounds, up to 25,000.",
  },
  {
    id: "match",
    label: "Match funding",
    kind: "number",
    section: "Budget",
    placeholder: "0",
  },
  {
    id: "notes",
    label: "Budget notes",
    kind: "textarea",
    section: "Budget",
    placeholder: "What the money buys, line by line.",
  },
];

const DRAFT_1: KeeperValues = {
  org: "Fernmoor Allotment Society",
  contact: "Hana Okafor",
  email: "hana@fernmoor-allotments.org",
  title: "Shared tool library",
};

const DRAFT_2: KeeperValues = {
  ...DRAFT_1,
  summary:
    "A lending library of garden tools for the 140 plot holders, run from the old pump house.",
  strand: "community",
};

const DRAFT_3: KeeperValues = {
  ...DRAFT_2,
  summary:
    "A lending library of garden tools for the 140 plot holders, run from the old pump house by volunteers two mornings a week. Members borrow for a fortnight; the society keeps and repairs the stock.",
  start: "2027-03",
  requested: "6400",
  match: "1200",
};

const sizeOf = (
  fields: KeeperField[],
  before: KeeperValues,
  after: KeeperValues,
) => {
  const changed: string[] = [];
  let delta = 0;
  for (const field of fields) {
    const a = before[field.id] ?? "";
    const b = after[field.id] ?? "";
    if (a !== b) {
      changed.push(field.id);
      delta += b.length - a.length;
    }
  }
  return { changed, delta };
};

/** Three drafts kept over the last forty minutes; the form holds the third. */
export const defaultKeeperDrafts: KeeperDraft[] = [
  {
    id: "k-1",
    savedAt: defaultKeeperNow - 38 * MIN,
    values: DRAFT_1,
    ...sizeOf(defaultKeeperFields, {}, DRAFT_1),
  },
  {
    id: "k-2",
    savedAt: defaultKeeperNow - 21 * MIN,
    values: DRAFT_2,
    ...sizeOf(defaultKeeperFields, DRAFT_1, DRAFT_2),
  },
  {
    id: "k-3",
    savedAt: defaultKeeperNow - 6 * MIN,
    values: DRAFT_3,
    ...sizeOf(defaultKeeperFields, DRAFT_2, DRAFT_3),
  },
];

export const defaultKeeperValues: KeeperValues = DRAFT_3;

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const LABEL = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";

const INPUT =
  "w-full rounded-2 border border-hairline-strong bg-surface-0 text-foreground placeholder:text-ink-3 transition-colors hover:border-border disabled:cursor-not-allowed disabled:opacity-60";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));
const pad2 = (n: number) => String(n).padStart(2, "0");

const defaultFormatTime = (at: number) => {
  const d = new Date(at);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};

/** How long ago, in words: "just now" until ten seconds, then seconds, then minutes. */
const ageWords = (ms: number) => {
  if (ms < 10_000) return "just now";
  if (ms < MIN) return `${Math.floor(ms / 1000)} s ago`;
  const m = Math.floor(ms / MIN);
  if (m === 1) return "a minute ago";
  if (m < 60) return `${m} min ago`;
  return "over an hour ago";
};

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `${n}` : "0");

/** The wall clock, read only from handlers, timers and effects — never render. */
const clock = () => Date.now();

/** Fields whose value differs from the last kept draft (or the initial values). */
export const countKeeperUnsaved = (
  fields: KeeperField[],
  values: KeeperValues,
  baseline: KeeperValues,
) =>
  fields.filter((f) => (values[f.id] ?? "") !== (baseline[f.id] ?? "")).length;

const noopSubscribe = () => () => {};

const subscribeVisibility = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};

/** True while the tab is visible; true on the server and for hydration. */
const usePageVisible = () =>
  React.useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );

const DENSITY: Record<
  KeeperDensity,
  {
    field: string;
    area: string;
    text: string;
    gap: string;
    section: string;
    pad: string;
  }
> = {
  compact: {
    field: "h-8 px-2.5",
    area: "min-h-[64px] px-2.5 py-1.5",
    text: "text-[12px]",
    gap: "gap-x-3 gap-y-2.5",
    section: "gap-2 pt-3 pb-4",
    pad: "px-3",
  },
  cozy: {
    field: "h-9 px-3",
    area: "min-h-[80px] px-3 py-2",
    text: "text-[13px]",
    gap: "gap-x-4 gap-y-3",
    section: "gap-2.5 pt-4 pb-5",
    pad: "px-4",
  },
  roomy: {
    field: "h-10 px-3.5",
    area: "min-h-[96px] px-3.5 py-2.5",
    text: "text-[14px]",
    gap: "gap-x-5 gap-y-4",
    section: "gap-3 pt-5 pb-6",
    pad: "px-5",
  },
};

type Phase = "clean" | "counting" | "saving" | "failed";

/* ----------------------------------------------------------------------- */
/*                               Countdown marks                            */
/* ----------------------------------------------------------------------- */

type MarkProps = {
  style: KeeperChipStyle;
  /** Re-keys the drain so it starts over on each keystroke. */
  round: number;
  seconds: number;
  /** 0..1 of the countdown left, for the stepped reduced-motion mark. */
  left: number;
  motionSafe: boolean;
  running: boolean;
};

/** The chip's countdown: a ring, a bar or a dot that drains over the quiet. */
function Mark({ style, round, seconds, left, motionSafe, running }: MarkProps) {
  const live = motionSafe && running;
  // Under reduced motion the mark holds a whole second and steps, so nothing
  // travels; `round` re-keys the drain so a keystroke starts it over.
  const steps = Math.max(1, Math.round(seconds));
  const held = live ? 0 : Math.ceil(left * steps) / steps;
  // A tween the length of the quiet itself: this is a clock, not a spring.
  const transition = live
    ? { duration: seconds, ease: easings.linear }
    : { duration: 0 };
  if (style === "bar") {
    return (
      <span
        aria-hidden
        className="relative block h-[3px] w-7 shrink-0 overflow-hidden rounded-full bg-[color-mix(in_oklab,currentColor_22%,transparent)]"
      >
        <motion.span
          key={round}
          className="absolute inset-y-0 left-0 w-full rounded-full bg-current"
          style={{ originX: 0 }}
          initial={live ? { scaleX: 1 } : false}
          animate={{ scaleX: live ? 0 : held }}
          transition={transition}
        />
      </span>
    );
  }
  if (style === "dot") {
    return (
      <span
        aria-hidden
        className="flex size-3.5 shrink-0 items-center justify-center"
      >
        <motion.span
          key={round}
          className="block size-2.5 rounded-full bg-current"
          initial={live ? { scale: 1 } : false}
          animate={{ scale: live ? 0.2 : 0.2 + 0.8 * held }}
          transition={transition}
        />
      </span>
    );
  }
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5 shrink-0 -rotate-90"
    >
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="opacity-25"
      />
      <motion.circle
        key={round}
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        initial={live ? { pathLength: 1 } : false}
        animate={{ pathLength: live ? 0 : held }}
        transition={transition}
      />
    </svg>
  );
}

/** The check that draws when a save lands. */
function Tick({ motionSafe }: { motionSafe: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 shrink-0">
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

/* ----------------------------------------------------------------------- */
/*                                   Field                                  */
/* ----------------------------------------------------------------------- */

type FieldBoxProps = {
  field: KeeperField;
  value: string;
  density: KeeperDensity;
  /** Bumps when a restore lands a value here; 0 is never. */
  landSeq: number;
  motionSafe: boolean;
  disabled: boolean;
  uid: string;
  nodeRef: (node: HTMLElement | null) => void;
  onChange: (next: string) => void;
};

function FieldBox({
  field,
  value,
  density,
  landSeq,
  motionSafe,
  disabled,
  uid,
  nodeRef,
  onChange,
}: FieldBoxProps) {
  const d = DENSITY[density];
  const id = `${uid}-f-${field.id}`;
  const hintId = field.hint ? `${id}-hint` : undefined;
  const wide = field.wide || field.kind === "textarea";
  const control =
    field.kind === "textarea" ? (
      <textarea
        ref={nodeRef}
        id={id}
        value={value}
        placeholder={field.placeholder}
        aria-describedby={hintId}
        disabled={disabled}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          INPUT,
          d.area,
          d.text,
          "resize-y leading-snug",
          FOCUS_RING,
        )}
      />
    ) : field.kind === "select" ? (
      <select
        ref={nodeRef}
        id={id}
        value={value}
        aria-describedby={hintId}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          INPUT,
          d.field,
          d.text,
          "appearance-none pr-8",
          value === "" && "text-ink-3",
          FOCUS_RING,
        )}
      >
        <option value="">Choose one</option>
        {(field.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    ) : (
      <input
        ref={nodeRef}
        id={id}
        type="text"
        inputMode={field.kind === "number" ? "numeric" : undefined}
        value={value}
        placeholder={field.placeholder}
        aria-describedby={hintId}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            field.kind === "number"
              ? event.target.value.replace(/[^\d]/g, "")
              : event.target.value,
          )
        }
        className={cn(
          INPUT,
          d.field,
          d.text,
          field.kind === "number" && "font-mono tabular-nums",
          FOCUS_RING,
        )}
      />
    );

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        wide && "@min-[40rem]:col-span-2",
      )}
    >
      <label htmlFor={id} className="text-[12px] font-medium text-ink-2">
        {field.label}
      </label>
      <div className="relative">
        {control}
        {field.kind === "select" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3"
          >
            <svg viewBox="0 0 12 12" className="size-3">
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ) : null}
        <AnimatePresence>
          {landSeq > 0 ? (
            // A restored value lands: a wash slides in on recoil, then fades.
            <motion.span
              key={landSeq}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2 bg-cobalt-wash ring-1 ring-cobalt-bright/40 ring-inset"
              initial={{ opacity: 0.9, x: motionSafe ? -distances.step : 0 }}
              animate={{ opacity: 0, x: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{
                x: motionSafe ? springs.recoil : { duration: 0 },
                opacity: { ...exitFor(durations.page), delay: durations.slow },
              }}
            />
          ) : null}
        </AnimatePresence>
      </div>
      {field.hint ? (
        <p id={hintId} className="text-[11px] text-ink-3">
          {field.hint}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Diff and drawer                            */
/* ----------------------------------------------------------------------- */

const optionLabel = (field: KeeperField, value: string) =>
  field.kind === "select"
    ? (field.options?.find((o) => o.id === value)?.label ?? value)
    : value;

function Value({
  text,
  struck,
  motionSafe,
  className,
}: {
  text: string;
  struck: boolean;
  motionSafe: boolean;
  className?: string;
}) {
  const empty = text === "";
  return (
    <span className={cn("relative block", className)}>
      <span
        className={cn(
          "line-clamp-2 break-words",
          empty && "text-ink-3 italic",
          struck && !motionSafe && "line-through",
        )}
      >
        {empty ? "empty" : text}
      </span>
      {struck && motionSafe ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-current"
          style={{ originX: 0 }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ ...springs.flick, delay: durations.blink }}
        />
      ) : null}
    </span>
  );
}

type DrawerProps = {
  id: string;
  drafts: KeeperDraft[];
  fields: KeeperField[];
  current: KeeperValues;
  pickedId: string | null;
  density: KeeperDensity;
  motionSafe: boolean;
  disabled: boolean;
  formatTime: (at: number) => string;
  autosaveSeconds: number;
  onPick: (draft: KeeperDraft) => void;
  onRestore: (draft: KeeperDraft) => void;
  onClose: () => void;
};

function Drawer({
  id,
  drafts,
  fields,
  current,
  pickedId,
  density,
  motionSafe,
  disabled,
  formatTime,
  autosaveSeconds,
  onPick,
  onRestore,
  onClose,
}: DrawerProps) {
  const listRef = React.useRef<HTMLDivElement | null>(null);
  // Newest first: the draft just kept sits at the top.
  const listed = React.useMemo(() => [...drafts].reverse(), [drafts]);
  const [active, setActive] = React.useState(0);
  const current0 = listed[clamp(active, 0, Math.max(0, listed.length - 1))];
  const picked = pickedId ? drafts.find((d) => d.id === pickedId) : undefined;
  const number = (draft: KeeperDraft) => drafts.indexOf(draft) + 1;

  React.useEffect(() => {
    listRef.current?.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(
      `[data-draft="${current0?.id ?? ""}"]`,
    );
    node?.scrollIntoView?.({ block: "nearest" });
  }, [current0?.id]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (listed.length === 0) return;
    let to: number | null = null;
    if (event.key === "ArrowDown") to = active + 1;
    else if (event.key === "ArrowUp") to = active - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = listed.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (current0) onPick(current0);
      return;
    }
    if (to === null) return;
    event.preventDefault();
    setActive(clamp(to, 0, listed.length - 1));
  };

  const diff = picked
    ? fields.filter(
        (f) => (picked.values[f.id] ?? "") !== (current[f.id] ?? ""),
      )
    : [];
  const step = cascade(Math.min(diff.length, 10));

  return (
    <motion.aside
      id={id}
      aria-label="Drafts"
      className="absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-hairline bg-popover shadow-[-12px_0_32px_-20px_color-mix(in_oklab,black_50%,transparent)] @min-[40rem]:w-[320px]"
      initial={motionSafe ? { x: "100%" } : { opacity: 0 }}
      animate={motionSafe ? { x: 0 } : { opacity: 1 }}
      exit={
        motionSafe
          ? { x: "100%", transition: exitFor(durations.slow) }
          : { opacity: 0, transition: exitFor(durations.base) }
      }
      transition={motionSafe ? springs.glide : { duration: durations.fast }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <p className="flex items-baseline gap-1.5 text-[13px] font-semibold">
          Drafts
          <span className="font-mono text-[11px] font-normal text-ink-3 tabular-nums">
            {drafts.length}
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close drafts"
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>

      <div
        ref={listRef}
        role="listbox"
        aria-label="Kept drafts, newest first"
        aria-activedescendant={current0 ? `${id}-${current0.id}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          "flex max-h-[46%] shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5",
          FOCUS_RING,
        )}
      >
        {listed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-[13px] text-ink-2">No drafts yet.</p>
            <p className="text-[11px] text-ink-3">
              The keeper saves the first one {autosaveSeconds} s after you stop
              typing.
            </p>
          </div>
        ) : (
          listed.map((draft, i) => {
            const isActive = current0?.id === draft.id;
            const isPicked = pickedId === draft.id;
            return (
              <div
                key={draft.id}
                id={`${id}-${draft.id}`}
                data-draft={draft.id}
                role="option"
                aria-selected={isPicked}
                aria-label={`Draft ${number(draft)}, ${formatTime(draft.savedAt)}, ${draft.changed.length} ${draft.changed.length === 1 ? "field" : "fields"}, ${signed(draft.delta)} characters`}
                onPointerMove={() => {
                  if (!isActive) setActive(i);
                }}
                onClick={() => onPick(draft)}
                className={cn(
                  "grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-2 px-2 py-1.5 transition-colors",
                  isActive ? "bg-surface-2 text-foreground" : "text-ink-2",
                  isPicked && "ring-1 ring-cobalt-bright/50 ring-inset",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-2 font-mono text-[11px] tabular-nums",
                    isPicked
                      ? "bg-cobalt-wash text-cobalt-bright"
                      : "bg-surface-1 text-ink-2",
                  )}
                >
                  {number(draft)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px]">
                    {i === 0 ? "Latest" : `Draft ${number(draft)}`}
                    <span className="text-ink-3">
                      {" "}
                      · {formatTime(draft.savedAt)}
                    </span>
                  </span>
                  <span className="truncate text-[11px] text-ink-3">
                    {draft.changed.length}{" "}
                    {draft.changed.length === 1 ? "field" : "fields"} changed
                  </span>
                </span>
                <span
                  className={cn(
                    "font-mono text-[11px] tabular-nums",
                    draft.delta > 0
                      ? "text-success"
                      : draft.delta < 0
                        ? "text-danger"
                        : "text-ink-3",
                  )}
                >
                  {signed(draft.delta)}
                </span>
              </div>
            );
          })
        )}
      </div>
      <p className={cn("shrink-0 border-b border-hairline px-3 pb-2", LABEL)}>
        Arrows move · Enter compares · Esc closes
      </p>

      <div className="flex min-h-0 flex-1 flex-col">
        {!picked ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6 text-center">
            <FileClock aria-hidden className="size-5 text-ink-3" />
            <p className="text-[12px] text-ink-3">
              {listed.length === 0
                ? "Kept drafts can be compared and restored here."
                : "Pick a draft to compare it with the form."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
              <p className="min-w-0 truncate text-[12px] text-ink-2">
                Draft {number(picked)} against the form
                <span className="text-ink-3">
                  {" "}
                  · {diff.length} {diff.length === 1 ? "field" : "fields"}{" "}
                  differ
                </span>
              </p>
              <button
                type="button"
                onClick={() => onRestore(picked)}
                aria-disabled={disabled || diff.length === 0 || undefined}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-xs font-medium transition-colors",
                  !disabled && diff.length > 0
                    ? "bg-primary text-primary-foreground hover:opacity-90"
                    : "cursor-default bg-surface-2 text-ink-3",
                  FOCUS_RING,
                )}
              >
                <Undo2 aria-hidden className="size-3.5" />
                Restore
              </button>
            </div>
            <ul
              role="list"
              aria-label={`Fields that differ in draft ${number(picked)}`}
              className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-2"
            >
              {diff.length === 0 ? (
                <li className="px-2 py-4 text-center text-[12px] text-ink-3">
                  This draft matches the form.
                </li>
              ) : (
                diff.map((field, i) => (
                  <li
                    key={`${picked.id}-${field.id}`}
                    className={cn(
                      "rounded-2 px-2 py-1.5",
                      i % 2 === 1 && "bg-surface-1",
                    )}
                  >
                    <p className={cn(LABEL, "mb-0.5")}>{field.label}</p>
                    <motion.p
                      className="text-[12px] text-ink-3"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: durations.base,
                        ease: easings.enter,
                      }}
                    >
                      <Value
                        text={optionLabel(field, current[field.id] ?? "")}
                        struck
                        motionSafe={motionSafe}
                      />
                    </motion.p>
                    <motion.p
                      className={cn("text-foreground", DENSITY[density].text)}
                      initial={{
                        opacity: 0,
                        x: motionSafe ? distances.shift : 0,
                      }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        x: motionSafe
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
                      <Value
                        text={optionLabel(field, picked.values[field.id] ?? "")}
                        struck={false}
                        motionSafe={motionSafe}
                      />
                    </motion.p>
                  </li>
                ))
              )}
            </ul>
          </>
        )}
      </div>
    </motion.aside>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Leave guard                               */
/* ----------------------------------------------------------------------- */

type GuardProps = {
  id: string;
  unsaved: number;
  saving: boolean;
  failed: boolean;
  motionSafe: boolean;
  onSaveGo: () => void;
  onDiscard: () => void;
  onStay: () => void;
};

function Guard({
  id,
  unsaved,
  saving,
  failed,
  motionSafe,
  onSaveGo,
  onDiscard,
  onStay,
}: GuardProps) {
  const firstRef = React.useRef<HTMLButtonElement | null>(null);
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  React.useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onStay();
      return;
    }
    if (event.key !== "Tab") return;
    const list = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not([disabled])",
      ),
    );
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.shiftKey
      ? i <= 0
        ? list.length - 1
        : i - 1
      : i >= list.length - 1
        ? 0
        : i + 1;
    event.preventDefault();
    list[next]?.focus();
  };

  const button =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <motion.div
      className="absolute inset-0 z-30 flex items-end justify-center p-3 @min-[40rem]:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-[color-mix(in_oklab,var(--bg-0)_70%,transparent)] backdrop-blur-[2px]"
        onClick={onStay}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        className="relative flex w-full max-w-sm flex-col gap-3 rounded-3 border border-hairline-strong bg-popover p-4 shadow-[0_18px_40px_-18px_color-mix(in_oklab,black_55%,transparent)]"
        initial={
          motionSafe ? { y: distances.shift, scale: 0.97 } : { opacity: 0 }
        }
        animate={motionSafe ? { y: 0, scale: 1 } : { opacity: 1 }}
        exit={
          motionSafe
            ? {
                y: distances.step,
                scale: 0.98,
                transition: exitFor(durations.base),
              }
            : { opacity: 0, transition: exitFor(durations.base) }
        }
        transition={motionSafe ? springs.snap : { duration: durations.fast }}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-2",
              failed
                ? "bg-warn/15 text-warn"
                : "bg-cobalt-wash text-cobalt-bright",
            )}
          >
            <TriangleAlert aria-hidden className="size-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <p id={titleId} className="text-[14px] font-semibold">
              {failed ? "The save failed" : "Leave with unsaved changes?"}
            </p>
            <p id={descId} className="text-[12px] text-ink-2">
              {unsaved} {unsaved === 1 ? "field has" : "fields have"} changed
              since the last draft.{" "}
              {failed
                ? "Try the save again, discard the changes, or stay."
                : "Save a draft and go, discard them, or stay and keep editing."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onStay}
            disabled={saving}
            className={cn(
              button,
              "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            Stay
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={saving}
            className={cn(
              button,
              "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
              FOCUS_RING,
            )}
          >
            Discard
          </button>
          <button
            ref={firstRef}
            type="button"
            onClick={onSaveGo}
            disabled={saving}
            className={cn(
              button,
              "border-transparent bg-primary text-primary-foreground hover:opacity-90",
              FOCUS_RING,
            )}
          >
            {saving ? "Saving..." : failed ? "Retry and go" : "Save and go"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A long form that keeps its own drafts. A keeper chip in the header watches
 * the fields: the first change starts a countdown — a ring (or bar, or dot)
 * that drains over `autosaveSeconds` on a linear tween the length of the
 * quiet, starting over on every keystroke — and when it runs out the keeper
 * saves. The chip ticks on `springs.flick` as a check draws in and reads
 * "Saved just now", the words ticking up with the minutes. A save that fails
 * turns the chip amber with Retry and keeps the unsaved count. Ctrl/Cmd+S
 * saves now; so does pressing the chip.
 *
 * Drafts opens a drawer that glides in on `springs.glide`: a listbox of the
 * kept versions, newest first, each with how many fields changed and by how
 * many characters. Choosing one shows a field-by-field diff — the form's
 * value struck through on `springs.flick`, the draft's gliding into place in
 * a cascade — and Restore sends those values back into the form, where each
 * one lands under a wash on `springs.recoil` that fades. A restore counts as
 * a change, so the keeper saves it as a new draft.
 *
 * Setting `leaving` while fields are unsaved raises a guard — a dialog on
 * `springs.snap` with Save and go, Discard and Stay — and `onLeave` reports
 * what was chosen. The form is native: Tab moves between fields. The drawer
 * is a listbox (arrows, Home/End, Enter compares, Escape closes) and the
 * guard traps Tab until it is answered. Under reduced motion the ring steps
 * once a second instead of draining, the drawer and guard cross-fade, struck
 * values are struck at once and restored values appear in place.
 */
export function DraftKeeper({
  chipStyle = "ring",
  density = "cozy",
  autosaveSeconds = 4,
  fields = defaultKeeperFields,
  value,
  defaultValue = defaultKeeperValues,
  onChange,
  drafts,
  defaultDrafts = defaultKeeperDrafts,
  onDraftsChange,
  onSave,
  saveFails = false,
  saveDelay = 700,
  onSaved,
  onSaveError,
  onRestore,
  leaving = false,
  onLeave,
  status = "ready",
  onRetry,
  formatTime = defaultFormatTime,
  title = "Grant application",
  subtitle = "Coldbrook Community Fund",
  label,
  height = 560,
  disabled = false,
  className,
}: DraftKeeperProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const drawerId = `${uid}-drawer`;
  const guardId = `${uid}-guard`;

  const [ownValues, setOwnValues] = React.useState<KeeperValues>(defaultValue);
  const current = value ?? ownValues;
  const [ownDrafts, setOwnDrafts] =
    React.useState<KeeperDraft[]>(defaultDrafts);
  const kept = drafts ?? ownDrafts;
  // What the form held before any draft existed: the baseline until one does.
  const [initialValues] = React.useState<KeeperValues>(current);

  const ready = status === "ready";
  const inert = disabled || !ready;

  const [deadline, setDeadline] = React.useState<number | null>(null);
  const [round, setRound] = React.useState(0);
  const [tick, setTick] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [tickSeq, setTickSeq] = React.useState(0);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState<Record<string, number>>({});
  const [announcement, setAnnouncement] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const draftsBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const latestValues = React.useRef(current);
  const latestDrafts = React.useRef(kept);
  const saveSeq = React.useRef(0);
  const simTimer = React.useRef<number | null>(null);
  const landTimer = React.useRef<number | null>(null);
  const mounted = React.useRef(false);
  const leaveHandled = React.useRef(false);
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const visible = usePageVisible();
  const inView = useInView(rootRef, { amount: 0 });

  /* -------------------------------- data ------------------------------- */

  const latest = kept[kept.length - 1];
  const baseline = latest ? latest.values : initialValues;
  const changedIds = fields
    .filter((f) => (current[f.id] ?? "") !== (baseline[f.id] ?? ""))
    .map((f) => f.id);
  const unsaved = changedIds.length;

  const phase: Phase = saving
    ? "saving"
    : failed && unsaved > 0
      ? "failed"
      : unsaved > 0 && deadline !== null
        ? "counting"
        : "clean";

  const msLeft = deadline !== null ? Math.max(0, deadline - tick) : 0;
  const secondsLeft = Math.ceil(msLeft / 1000);
  const fraction =
    autosaveSeconds > 0 ? clamp(msLeft / (autosaveSeconds * 1000), 0, 1) : 0;
  const age = savedAt !== null ? Math.max(0, tick - savedAt) : null;
  const settled = age !== null && age >= 60 * MIN;

  const sections = React.useMemo(() => {
    const out: { name: string; fields: KeeperField[] }[] = [];
    for (const field of fields) {
      const last = out[out.length - 1];
      if (last && last.name === field.section) last.fields.push(field);
      else out.push({ name: field.section, fields: [field] });
    }
    return out;
  }, [fields]);

  /* ------------------------------ lifecycle ---------------------------- */

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (simTimer.current !== null) window.clearTimeout(simTimer.current);
      if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    };
  }, []);

  React.useEffect(() => {
    latestValues.current = current;
    latestDrafts.current = kept;
  });

  // One clock for the chip. It runs fast while a countdown is on, once a
  // second while "just now" ages into seconds, every half minute into
  // minutes, and not at all once the tab is hidden, the surface is off
  // screen, the save is an hour old or there is nothing to count.
  const counting = phase === "counting";
  const aging = phase === "clean" && savedAt !== null && !settled;
  const coarse = age !== null && age >= MIN;
  React.useEffect(() => {
    if (!visible || !inView) return;
    const every = counting ? 200 : aging ? (coarse ? 30_000 : 1000) : 0;
    if (every === 0) return;
    // Catches up at once on resume, then keeps time at the cadence.
    const first = window.setTimeout(() => setTick(clock()), 0);
    const id = window.setInterval(() => setTick(clock()), every);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [visible, inView, counting, aging, coarse]);

  const say = (text: string) => setAnnouncement(text);

  /* ------------------------------- values ------------------------------ */

  const commitValues = (next: KeeperValues, change: KeeperChange) => {
    latestValues.current = next;
    if (value === undefined) setOwnValues(next);
    onChange?.(next, change);
  };

  const commitDrafts = (next: KeeperDraft[]) => {
    latestDrafts.current = next;
    if (drafts === undefined) setOwnDrafts(next);
    onDraftsChange?.(next);
  };

  const edit = (fieldId: string, to: string) => {
    if (inert) return;
    const from = current[fieldId] ?? "";
    if (from === to) return;
    commitValues({ ...current, [fieldId]: to }, { fieldId, from, to });
    // Every keystroke starts the quiet over; a failed save is forgiven by
    // typing again, and the next quiet saves everything still unsaved.
    setFailed(false);
    const at = clock();
    setTick(at);
    setDeadline(at + autosaveSeconds * 1000);
    setRound((r) => r + 1);
    if (phase === "clean" || phase === "failed") {
      say(`Editing. Saves ${autosaveSeconds} seconds after the last change.`);
    }
  };

  /* -------------------------------- saving ----------------------------- */

  const simulate = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (simTimer.current !== null) window.clearTimeout(simTimer.current);
      simTimer.current = window.setTimeout(() => {
        simTimer.current = null;
        if (saveFails)
          reject(new Error("The keeper could not reach Coldbrook."));
        else resolve();
      }, saveDelay);
    });

  const save = async (reason: KeeperSaveReason): Promise<boolean> => {
    if (inert || saving) return false;
    const snapshot = latestValues.current;
    const before = latestDrafts.current;
    const base = before[before.length - 1]?.values ?? initialValues;
    const size = sizeOf(fields, base, snapshot);
    if (size.changed.length === 0) return true;
    const seq = (saveSeq.current += 1);
    setSaving(true);
    setDeadline(null);
    setFailed(false);
    say("Saving.");
    try {
      await (onSave ?? simulate)(snapshot, size.changed);
    } catch (error) {
      if (!mounted.current || seq !== saveSeq.current) return false;
      setSaving(false);
      setFailed(true);
      say(
        `Save failed. ${size.changed.length} ${size.changed.length === 1 ? "field" : "fields"} unsaved. Retry is in the keeper.`,
      );
      onSaveError?.(error, reason);
      return false;
    }
    if (!mounted.current || seq !== saveSeq.current) return false;
    const now = clock();
    const draft: KeeperDraft = {
      id: `k-${now}-${seq}`,
      savedAt: now,
      values: snapshot,
      changed: size.changed,
      delta: size.delta,
    };
    const next = [...latestDrafts.current, draft];
    commitDrafts(next);
    setSaving(false);
    setSavedAt(now);
    setTick(now);
    setTickSeq((n) => n + 1);
    // Typing went on while the save was out: keep counting from here.
    if (latestValues.current !== snapshot) {
      setDeadline(now + autosaveSeconds * 1000);
      setRound((r) => r + 1);
    }
    say(
      `Saved. Draft ${next.length} kept, ${size.changed.length} ${size.changed.length === 1 ? "field" : "fields"} changed.`,
    );
    onSaved?.(draft, reason);
    return true;
  };

  const saveRef = React.useRef(save);
  React.useEffect(() => {
    saveRef.current = save;
  });

  // The autosave itself: one timer to the deadline, cleared by every
  // keystroke that moves it and by a save that beats it.
  React.useEffect(() => {
    if (deadline === null || inert || saving) return;
    const ms = Math.max(0, deadline - clock());
    const id = window.setTimeout(() => {
      void saveRef.current("auto");
    }, ms);
    return () => window.clearTimeout(id);
  }, [deadline, inert, saving]);

  /* ------------------------------- drafts ------------------------------ */

  const openDrawer = () => {
    setDrawerOpen(true);
    say(
      kept.length === 0
        ? "Drafts opened. No drafts yet."
        : `Drafts opened. ${kept.length} ${kept.length === 1 ? "draft" : "drafts"}, newest first.`,
    );
  };

  const closeDrawer = (returnFocus: boolean) => {
    setDrawerOpen(false);
    if (returnFocus) draftsBtnRef.current?.focus({ preventScroll: true });
  };

  const pick = (draft: KeeperDraft) => {
    setPickedId(draft.id);
    const n = kept.indexOf(draft) + 1;
    const diff = sizeOf(fields, current, draft.values).changed.length;
    say(
      diff === 0
        ? `Draft ${n} matches the form.`
        : `Draft ${n}: ${diff} ${diff === 1 ? "field differs" : "fields differ"} from the form.`,
    );
  };

  const restore = (draft: KeeperDraft) => {
    if (inert) return;
    const ids = sizeOf(fields, current, draft.values).changed;
    if (ids.length === 0) return;
    const next: KeeperValues = { ...current };
    for (const id of ids) next[id] = draft.values[id] ?? "";
    const first = ids[0] ?? "";
    commitValues(next, {
      fieldId: first,
      from: current[first] ?? "",
      to: next[first] ?? "",
    });
    const seq = tickSeq + round + 1;
    setLanded(Object.fromEntries(ids.map((id) => [id, seq])));
    if (landTimer.current !== null) window.clearTimeout(landTimer.current);
    landTimer.current = window.setTimeout(() => {
      landTimer.current = null;
      setLanded({});
    }, 1400);
    setFailed(false);
    const at = clock();
    setTick(at);
    setDeadline(at + autosaveSeconds * 1000);
    setRound((r) => r + 1);
    setDrawerOpen(false);
    setPickedId(null);
    const n = kept.indexOf(draft) + 1;
    say(
      `Restored draft ${n}: ${ids.length} ${ids.length === 1 ? "field" : "fields"} changed. Saves in ${autosaveSeconds} seconds.`,
    );
    onRestore?.(draft);
    const node = fieldNodes.current.get(first);
    node?.scrollIntoView?.({ block: "nearest" });
    node?.focus({ preventScroll: true });
  };

  /* ----------------------------- leave guard --------------------------- */

  const guardOpen = leaving && unsaved > 0 && ready;
  const clean = leaving && unsaved === 0 && !saving;
  React.useEffect(() => {
    if (!leaving) {
      leaveHandled.current = false;
      return;
    }
    if (clean && !leaveHandled.current) {
      leaveHandled.current = true;
      onLeave?.("clean");
    }
  }, [leaving, clean, onLeave]);

  const leaveSave = async () => {
    const ok = await save("leave");
    if (ok && mounted.current && !leaveHandled.current) {
      leaveHandled.current = true;
      onLeave?.("saved");
    }
  };

  const leaveDiscard = () => {
    const first = changedIds[0] ?? "";
    commitValues(
      { ...baseline },
      { fieldId: first, from: current[first] ?? "", to: baseline[first] ?? "" },
    );
    setDeadline(null);
    setFailed(false);
    say("Changes discarded.");
    leaveHandled.current = true;
    onLeave?.("discarded");
  };

  const leaveStay = () => {
    say("Staying.");
    onLeave?.("stayed");
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onRootKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (unsaved === 0) say("Nothing to save.");
      else void save("now");
    }
  };

  /* -------------------------------- chip ------------------------------- */

  const chipText =
    phase === "saving"
      ? "Saving..."
      : phase === "failed"
        ? "Save failed"
        : phase === "counting"
          ? `Saving in ${Math.max(1, secondsLeft)} s`
          : savedAt !== null && age !== null
            ? `Saved ${ageWords(age)}`
            : latest
              ? `All kept · ${formatTime(latest.savedAt)}`
              : "Nothing kept yet";

  const chipAria =
    phase === "saving"
      ? "Saving"
      : phase === "failed"
        ? `Save failed, ${unsaved} unsaved. Retry`
        : phase === "counting"
          ? `Saving in ${Math.max(1, secondsLeft)} seconds, ${unsaved} unsaved. Save now`
          : chipText;

  const chipTone =
    phase === "failed"
      ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] text-warn"
      : phase === "counting" || phase === "saving"
        ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright"
        : "border-hairline bg-surface-1 text-ink-2";

  const chipActs = !inert && (phase === "counting" || phase === "failed");

  const d = DENSITY[density];

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
      style={{ height }}
    >
      <header
        inert={guardOpen || undefined}
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-hairline py-2.5",
          d.pad,
        )}
      >
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {subtitle ? (
            <p className={cn(LABEL, "hidden truncate @min-[30rem]:block")}>
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status === "loading" ? (
            <span
              aria-hidden
              className="h-7 w-24 rounded-full bg-surface-2 motion-safe:animate-pulse"
            />
          ) : ready ? (
            <button
              type="button"
              aria-label={chipAria}
              aria-disabled={!chipActs || undefined}
              onClick={() => {
                if (!chipActs) return;
                void save(phase === "failed" ? "retry" : "now");
              }}
              className={cn(
                "relative inline-flex h-7 items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-[11px] font-medium whitespace-nowrap transition-colors duration-200",
                chipTone,
                chipActs ? "cursor-pointer" : "cursor-default",
                FOCUS_RING,
              )}
            >
              <motion.span
                key={tickSeq}
                className="inline-flex items-center gap-1.5"
                initial={tickSeq > 0 && motionSafe ? { scale: 0.92 } : false}
                animate={{ scale: 1 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                {phase === "counting" || phase === "saving" ? (
                  <Mark
                    style={chipStyle}
                    round={round}
                    seconds={autosaveSeconds}
                    left={phase === "saving" ? 0 : fraction}
                    motionSafe={motionSafe}
                    running={phase === "counting"}
                  />
                ) : phase === "failed" ? (
                  <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                ) : tickSeq > 0 && live ? (
                  <Tick motionSafe={motionSafe} />
                ) : (
                  <Check aria-hidden className="size-3.5 shrink-0" />
                )}
                <span aria-hidden>{chipText}</span>
                {unsaved > 0 && phase !== "saving" ? (
                  <span
                    aria-hidden
                    className="hidden font-mono text-[10px] tabular-nums opacity-80 @min-[30rem]:inline"
                  >
                    · {unsaved} unsaved
                  </span>
                ) : null}
                {phase === "failed" ? (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-flex items-center gap-0.5 rounded-full bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] px-1.5 py-px text-[10px]"
                  >
                    <RotateCcw aria-hidden className="size-2.5" />
                    Retry
                  </span>
                ) : null}
              </motion.span>
            </button>
          ) : null}
          <button
            ref={draftsBtnRef}
            type="button"
            aria-expanded={drawerOpen}
            aria-controls={drawerOpen ? drawerId : undefined}
            aria-label={`Drafts, ${kept.length}`}
            aria-disabled={!ready || undefined}
            onClick={() => {
              if (!ready) return;
              if (drawerOpen) closeDrawer(true);
              else openDrawer();
            }}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2 text-xs text-ink-2 transition-colors",
              ready && "hover:bg-surface-2 hover:text-foreground",
              drawerOpen && "bg-surface-2 text-foreground",
              FOCUS_RING,
            )}
          >
            <History aria-hidden className="size-3.5" />
            <span className="hidden @min-[30rem]:inline">Drafts</span>
            <span className="font-mono text-[10px] text-ink-3 tabular-nums">
              {kept.length}
            </span>
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          inert={guardOpen || undefined}
          className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
        >
          {status === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The application didn&apos;t load.
              </p>
              <p className="text-[12px] text-ink-3">
                Nothing typed here is lost; drafts live on the server.
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
            <div aria-hidden className={cn("flex flex-col", d.pad)}>
              {[3, 4, 3].map((n, s) => (
                <div key={s} className={cn("flex flex-col", d.section)}>
                  <span className="h-2.5 w-20 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                  <div
                    className={cn(
                      "grid grid-cols-1 @min-[40rem]:grid-cols-2",
                      d.gap,
                    )}
                  >
                    {Array.from({ length: n }, (_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex flex-col gap-1.5",
                          i === n - 1 && "@min-[40rem]:col-span-2",
                        )}
                      >
                        <span className="h-2.5 w-24 rounded-1 bg-surface-2 motion-safe:animate-pulse" />
                        <span
                          className={cn(
                            "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                            i === n - 1 ? "h-20" : "h-9",
                          )}
                          style={{ animationDelay: `${(s * 4 + i) * 60}ms` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : fields.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <Inbox aria-hidden className="size-5 text-ink-3" />
              <p className="text-sm text-ink-2">This form has no fields.</p>
              <p className="text-[12px] text-ink-3">
                Give it some and the keeper will watch them.
              </p>
            </div>
          ) : (
            <form
              aria-labelledby={titleId}
              onSubmit={(event) => {
                event.preventDefault();
                if (unsaved > 0) void save("now");
              }}
              className={cn("flex flex-col", d.pad)}
            >
              {sections.map((section) => (
                <fieldset
                  key={section.name}
                  className={cn(
                    "flex min-w-0 flex-col border-t border-hairline first:border-t-0",
                    d.section,
                  )}
                >
                  <legend className={cn(LABEL, "float-left w-full pb-1")}>
                    {section.name}
                  </legend>
                  <div
                    className={cn(
                      "grid grid-cols-1 @min-[40rem]:grid-cols-2",
                      d.gap,
                    )}
                  >
                    {section.fields.map((field) => (
                      <FieldBox
                        key={field.id}
                        field={field}
                        value={current[field.id] ?? ""}
                        density={density}
                        landSeq={landed[field.id] ?? 0}
                        motionSafe={motionSafe}
                        disabled={inert}
                        uid={uid}
                        nodeRef={(node) => {
                          if (node) fieldNodes.current.set(field.id, node);
                          else fieldNodes.current.delete(field.id);
                        }}
                        onChange={(next) => edit(field.id, next)}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                <p className="text-[11px] text-ink-3">
                  {latest
                    ? `Draft ${kept.length} kept at ${formatTime(latest.savedAt)}.`
                    : "No draft kept yet."}{" "}
                  <span className="hidden @min-[30rem]:inline">
                    Ctrl or Cmd+S saves now.
                  </span>
                </p>
                <button
                  type="submit"
                  aria-disabled={inert || unsaved === 0 || saving || undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors",
                    !inert && unsaved > 0 && !saving
                      ? "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground"
                      : "cursor-default border-transparent text-ink-3",
                    FOCUS_RING,
                  )}
                >
                  Save now
                </button>
              </div>
            </form>
          )}
        </div>

        <AnimatePresence>
          {drawerOpen && ready ? (
            <Drawer
              key="drawer"
              id={drawerId}
              drafts={kept}
              fields={fields}
              current={current}
              pickedId={pickedId}
              density={density}
              motionSafe={motionSafe}
              disabled={inert}
              formatTime={formatTime}
              autosaveSeconds={autosaveSeconds}
              onPick={pick}
              onRestore={restore}
              onClose={() => closeDrawer(true)}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {guardOpen ? (
          <Guard
            key="guard"
            id={guardId}
            unsaved={unsaved}
            saving={saving}
            failed={failed}
            motionSafe={motionSafe}
            onSaveGo={() => void leaveSave()}
            onDiscard={leaveDiscard}
            onStay={leaveStay}
          />
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
