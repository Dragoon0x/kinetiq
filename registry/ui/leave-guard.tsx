"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  RotateCcw,
  TriangleAlert,
  Undo2,
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

export type GuardFieldKind = "text" | "select" | "switch";

export type GuardOption = { id: string; label: string };

/** One setting on the form. */
export type GuardField = {
  id: string;
  label: string;
  kind: GuardFieldKind;
  /** The section heading the field sits under; fields with the same section are grouped. */
  section?: string;
  /** A line under the label. */
  hint?: string;
  /** The choices of a select. */
  options?: GuardOption[];
  /** Shown in an empty text field. */
  placeholder?: string;
};

export type GuardValue = string | boolean;

/** Field id to its value. */
export type GuardValues = Record<string, GuardValue>;

/** One field that differs from the saved values. */
export type GuardChange = {
  id: string;
  label: string;
  from: GuardValue;
  to: GuardValue;
};

/** A leave the host wants to make. A new `id` asks the guard. */
export type GuardLeaveRequest = {
  id: string | number;
  /** Where the leave goes, e.g. "Billing" or "the tab". */
  destination: string;
  /** Navigating within the app, or closing the tab or window. @default "navigate" */
  kind?: "navigate" | "close";
};

export type GuardOutcome = "saved" | "discarded" | "clean";
export type GuardSheetSide = "foot" | "centre";
export type GuardDensity = "compact" | "cozy" | "roomy";
export type GuardStatus = "ready" | "loading" | "error";

export type LeaveGuardProps = {
  /** The settings on the form, in order. @default defaultGuardFields */
  fields?: GuardField[];
  /** Controlled values of every field. */
  value?: GuardValues;
  /** Initial values when uncontrolled. @default defaultGuardValues */
  defaultValue?: GuardValues;
  /** Fires from the keystroke, choice or switch that changed a field, with all the values. */
  onChange?: (values: GuardValues, change: GuardChange) => void;
  /** The values last saved; dirty is measured against them. @default the initial values, then whatever was last saved here */
  baseline?: GuardValues;
  /** The leave the host is trying to make. A new id raises the guard when the form is dirty, or lets the leave through with a brief toast when it is clean. @default null */
  leaveRequest?: GuardLeaveRequest | null;
  /** Saves the values when Save and leave is pressed. Resolve when it is done; reject to show the failure in the sheet with a retry. @default a simulator that resolves after 900ms */
  onSave?: (
    values: GuardValues,
    changes: GuardChange[],
  ) => Promise<void> | void;
  /** The leave may go ahead: after a save, after leaving without saving, or at once when the form was clean. */
  onLeave?: (outcome: GuardOutcome, request: GuardLeaveRequest) => void;
  /** Stay was pressed, or Escape, or the dim behind the sheet. */
  onStay?: (request: GuardLeaveRequest) => void;
  /** Discard all was pressed in the header, with what was thrown away. */
  onDiscard?: (changes: GuardChange[]) => void;
  /** Where the guard sheet rises: from the foot of the form, or in its centre. @default "foot" */
  sheetSide?: GuardSheetSide;
  /** How long Leave without saving stays armed for its second press, in seconds. @default 4 */
  armSeconds?: number;
  /** Row padding and type size. @default "cozy" */
  density?: GuardDensity;
  /** Whether the settings have arrived. @default "ready" */
  status?: GuardStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Workspace settings" */
  title?: string;
  /** The line over the heading. @default "Gaugeworks" */
  subtitle?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height in px; the form scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be edited, and a leave goes through. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** Gaugeworks' workspace settings: identity, alerting and billing. */
export const defaultGuardFields: GuardField[] = [
  {
    id: "name",
    label: "Workspace name",
    kind: "text",
    section: "Workspace",
    hint: "Shown in the sidebar and on invoices.",
  },
  {
    id: "region",
    label: "Data region",
    kind: "select",
    section: "Workspace",
    hint: "Where meter readings are stored.",
    options: [
      { id: "eu-west", label: "EU West (Dublin)" },
      { id: "us-east", label: "US East (Ashburn)" },
      { id: "ap-south", label: "AP South (Singapore)" },
    ],
  },
  {
    id: "digest",
    label: "Weekly digest",
    kind: "switch",
    section: "Notifications",
    hint: "A summary of readings every Monday.",
  },
  {
    id: "alerts",
    label: "Alert channel",
    kind: "select",
    section: "Notifications",
    hint: "Where threshold alerts are sent.",
    options: [
      { id: "email", label: "Email" },
      { id: "pager", label: "Pager" },
      { id: "none", label: "Nowhere" },
    ],
  },
  {
    id: "invoiceEmail",
    label: "Invoice email",
    kind: "text",
    section: "Billing",
    placeholder: "finance@example.com",
  },
  {
    id: "autoRenew",
    label: "Auto-renew",
    kind: "switch",
    section: "Billing",
    hint: "Renew the plan at the end of each term.",
  },
];

export const defaultGuardValues: GuardValues = {
  name: "Gaugeworks",
  region: "eu-west",
  digest: true,
  alerts: "email",
  invoiceEmail: "accounts@gaugeworks.example",
  autoRenew: true,
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  GuardDensity,
  { row: string; text: string; control: string; section: string }
> = {
  compact: {
    row: "py-2",
    text: "text-[12px]",
    control: "h-7 text-[12px]",
    section: "pt-3 pb-1",
  },
  cozy: {
    row: "py-3",
    text: "text-[13px]",
    control: "h-8 text-[13px]",
    section: "pt-4 pb-1.5",
  },
  roomy: {
    row: "py-4",
    text: "text-sm",
    control: "h-9 text-sm",
    section: "pt-5 pb-2",
  },
};

const SAVED_HOLD_MS = 650;
const TOAST_MS = 1800;
const FLASH_MS = 700;

const r3 = (v: number) => Number(v.toFixed(3));

const noopSubscribe = () => () => {};

const simulateSave = () =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, 900);
  });

/** What a value is called out loud and in the sheet. */
export const describeGuardValue = (
  field: GuardField,
  value: GuardValue | undefined,
): string => {
  if (field.kind === "switch") return value === true ? "On" : "Off";
  if (field.kind === "select") {
    const option = field.options?.find((o) => o.id === value);
    return option?.label ?? (typeof value === "string" ? value : "None");
  }
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" ? "Empty" : text;
};

/** The fields whose value differs from the baseline, in form order. */
export const diffGuardValues = (
  fields: GuardField[],
  base: GuardValues,
  current: GuardValues,
): GuardChange[] =>
  fields.flatMap((field) => {
    const from = base[field.id] ?? (field.kind === "switch" ? false : "");
    const to = current[field.id] ?? (field.kind === "switch" ? false : "");
    return from === to ? [] : [{ id: field.id, label: field.label, from, to }];
  });

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* ----------------------------------------------------------------------- */
/*                                   Tick                                   */
/* ----------------------------------------------------------------------- */

function Tick({
  motionSafe,
  className,
}: {
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className={cn("size-3.5", className)}>
      <motion.path
        d="M3.5 8.4 6.6 11.4 12.5 5"
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
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Field                                   */
/* ----------------------------------------------------------------------- */

type FieldRowProps = {
  field: GuardField;
  value: GuardValue | undefined;
  base: GuardValue | undefined;
  changed: boolean;
  /** A sequence number that bumps when the field was just reverted. */
  flash: number;
  flashDelay: number;
  density: GuardDensity;
  inert: boolean;
  motionSafe: boolean;
  uid: string;
  onChange: (value: GuardValue) => void;
  onRevert: () => void;
  nodeRef: (node: HTMLElement | null) => void;
};

function FieldRow({
  field,
  value,
  base,
  changed,
  flash,
  flashDelay,
  density,
  inert,
  motionSafe,
  uid,
  onChange,
  onRevert,
  nodeRef,
}: FieldRowProps) {
  const d = DENSITY[density];
  const controlId = `${uid}-f-${field.id}`;
  const hintId = field.hint ? `${uid}-h-${field.id}` : undefined;
  const wasId = changed ? `${uid}-w-${field.id}` : undefined;
  const describedBy = [hintId, wasId].filter(Boolean).join(" ") || undefined;
  const on = value === true;

  const control =
    field.kind === "switch" ? (
      <button
        ref={nodeRef}
        id={controlId}
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={describedBy}
        aria-disabled={inert || undefined}
        onClick={() => {
          if (!inert) onChange(!on);
        }}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200",
          on
            ? "border-transparent bg-primary"
            : "border-hairline-strong bg-surface-2",
          inert ? "cursor-not-allowed" : "cursor-pointer",
          FOCUS_RING,
        )}
      >
        <span className="sr-only">{field.label}</span>
        <motion.span
          aria-hidden
          className={cn(
            "absolute top-0.5 left-0.5 size-[18px] rounded-full shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]",
            on ? "bg-primary-foreground" : "bg-card",
          )}
          initial={false}
          animate={{ x: on ? 20 : 0 }}
          transition={motionSafe ? springs.snap : { duration: 0 }}
        />
      </button>
    ) : field.kind === "select" ? (
      <span className="relative block w-full">
        <select
          ref={nodeRef}
          id={controlId}
          value={typeof value === "string" ? value : ""}
          aria-describedby={describedBy}
          disabled={inert}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "w-full appearance-none rounded-2 border border-hairline bg-surface-0 pr-8 pl-2.5 text-foreground transition-colors hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60",
            d.control,
            FOCUS_RING,
          )}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3"
        />
      </span>
    ) : (
      <input
        ref={nodeRef}
        id={controlId}
        type="text"
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        aria-describedby={describedBy}
        disabled={inert}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "w-full rounded-2 border border-hairline bg-surface-0 px-2.5 text-foreground transition-colors placeholder:text-ink-3 hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60",
          d.control,
          FOCUS_RING,
        )}
      />
    );

  return (
    <div
      className={cn(
        "relative grid grid-cols-1 gap-x-4 gap-y-1.5 px-4 @min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] @min-[36rem]:items-start",
        d.row,
      )}
    >
      {/* A wash that fades out when the field was just put back. */}
      <AnimatePresence>
        {flash > 0 ? (
          <motion.span
            key={flash}
            aria-hidden
            className="pointer-events-none absolute inset-x-1.5 inset-y-0.5 rounded-2 bg-cobalt-wash"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: FLASH_MS / 1000,
              delay: motionSafe ? flashDelay : 0,
              ease: easings.move,
              times: [0, 0.3, 1],
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          />
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {changed ? (
          <motion.span
            key="bar"
            aria-hidden
            className="absolute top-2 bottom-2 left-1.5 w-0.5 rounded-full bg-cobalt-bright"
            style={{ originY: 0.5 }}
            initial={motionSafe ? { scaleY: 0 } : { opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            exit={{
              scaleY: motionSafe ? 0 : 1,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
          />
        ) : null}
      </AnimatePresence>

      <div className="relative min-w-0 @min-[36rem]:pt-1">
        <label
          htmlFor={controlId}
          className={cn("block font-medium text-foreground", d.text)}
        >
          {field.label}
        </label>
        {field.hint ? (
          <p id={hintId} className="mt-0.5 text-[11px] text-ink-3">
            {field.hint}
          </p>
        ) : null}
      </div>

      <div className="relative flex min-w-0 flex-col gap-1.5">
        <div
          className={cn(
            "flex items-center",
            field.kind === "switch" && "@min-[36rem]:h-8",
          )}
        >
          {control}
        </div>
        <AnimatePresence initial={false}>
          {changed ? (
            <motion.div
              key="was"
              className="flex min-w-0 items-center gap-2"
              initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              <p
                id={wasId}
                className="min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
              >
                was {describeGuardValue(field, base)}
              </p>
              <button
                type="button"
                aria-label={`Revert ${field.label}`}
                aria-disabled={inert || undefined}
                onClick={() => {
                  if (!inert) onRevert();
                }}
                className={cn(
                  "inline-flex h-5 shrink-0 items-center gap-1 rounded-1 px-1 font-mono text-[10px] tracking-[0.08em] text-cobalt-bright uppercase transition-colors hover:bg-cobalt-wash",
                  FOCUS_RING,
                )}
              >
                <Undo2 aria-hidden className="size-3" />
                Revert
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Phase = "idle" | "saving" | "saved" | "failed";

type Guard = {
  request: GuardLeaveRequest;
  phase: Phase;
  error: string | null;
};

/**
 * An unsaved-changes guard around a settings form. Each edit lights a bar
 * beside its field and a "was" line with a per-field Revert; the first one
 * blooms a dot in the header on `springs.snap`. When the host asks to
 * leave — a new `leaveRequest` — a clean form lets it through with a toast
 * that lands on `springs.recoil`, and a dirty one raises a sheet from the
 * foot on `springs.glide` (or in the centre, scaling in on the same spring)
 * over a dimmed form, listing exactly what would be lost: each changed
 * field with old and new value, rising in a cascade.
 *
 * Save and leave fills a bar across the top of the sheet while `onSave`
 * runs, then draws a tick on `springs.flick` and drops the sheet; a
 * rejected save keeps the sheet up with the failure and a retry. Leave
 * without saving is a two-step arm: the button turns red and a countdown
 * drains along its foot for `armSeconds`, and only a second press inside
 * that window lets the leave through and puts the form back. Stay drops the
 * sheet and returns focus to where it was. Discard all in the header glides
 * every field back with a wash fading in a cascade.
 *
 * The sheet is a modal dialog: Tab cycles inside it, Escape is Stay, and the
 * form behind it is inert. Under reduced motion the sheet, the list and the
 * dot cross-fade in place; the save bar and the countdown still fill and
 * drain, because they are the measure of the thing.
 */
export function LeaveGuard({
  fields = defaultGuardFields,
  value,
  defaultValue = defaultGuardValues,
  onChange,
  baseline,
  leaveRequest = null,
  onSave,
  onLeave,
  onStay,
  onDiscard,
  sheetSide = "foot",
  armSeconds = 4,
  density = "cozy",
  status = "ready",
  onRetry,
  title = "Workspace settings",
  subtitle = "Gaugeworks",
  label,
  height = 540,
  disabled = false,
  className,
}: LeaveGuardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sheetTitleId = `${uid}-sheet-title`;
  const sheetDescId = `${uid}-sheet-desc`;

  const [own, setOwn] = React.useState<GuardValues>(
    () => value ?? defaultValue,
  );
  const current = value ?? own;
  const [ownBase, setOwnBase] = React.useState<GuardValues>(
    () => value ?? defaultValue,
  );
  const base = baseline ?? ownBase;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [guard, setGuard] = React.useState<Guard | null>(null);
  const [armed, setArmed] = React.useState(0);
  const [toast, setToast] = React.useState(0);
  const [flashes, setFlashes] = React.useState<
    Record<string, { seq: number; delay: number }>
  >({});
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so a form that mounts dirty
  // does not bloom its dot; true once the page is live.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const primaryRef = React.useRef<HTMLButtonElement | null>(null);
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const returnTo = React.useRef<HTMLElement | null>(null);
  const handled = React.useRef<string | number | null>(null);
  const armTimer = React.useRef<number | null>(null);
  const holdTimer = React.useRef<number | null>(null);
  const toastTimer = React.useRef<number | null>(null);
  const flashTimer = React.useRef<number | null>(null);
  const saveSeq = React.useRef(0);
  const alive = React.useRef(true);

  /* -------------------------------- data ------------------------------- */

  const byId = new Map(fields.map((f) => [f.id, f]));
  const changes = diffGuardValues(fields, base, current);
  const changedIds = new Set(changes.map((c) => c.id));
  const dirty = changes.length > 0;
  const open = guard !== null;

  const sections: { name: string | undefined; fields: GuardField[] }[] = [];
  for (const field of fields) {
    const last = sections[sections.length - 1];
    if (last && last.name === field.section) last.fields.push(field);
    else sections.push({ name: field.section, fields: [field] });
  }

  const latest = React.useRef({ changes, inert, onLeave, onStay });
  React.useEffect(() => {
    latest.current = { changes, inert, onLeave, onStay };
  });

  /* ------------------------------- timers ------------------------------ */

  const clearArm = React.useCallback(() => {
    if (armTimer.current !== null) window.clearTimeout(armTimer.current);
    armTimer.current = null;
    setArmed(0);
  }, []);

  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const t of [armTimer, holdTimer, toastTimer, flashTimer]) {
        if (t.current !== null) window.clearTimeout(t.current);
        t.current = null;
      }
    };
  }, []);

  // An armed Leave disarms when the tab is hidden or the guard leaves the
  // screen: a countdown nobody can see must not be the one that lets a
  // second press through.
  React.useEffect(() => {
    if (armed === 0) return;
    const root = rootRef.current;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") clearArm();
    };
    document.addEventListener("visibilitychange", onVisibility);
    let watcher: IntersectionObserver | null = null;
    if (root && typeof IntersectionObserver !== "undefined") {
      watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry && !entry.isIntersecting) clearArm();
      });
      watcher.observe(root);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      watcher?.disconnect();
    };
  }, [armed, clearArm]);

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: GuardValues, change: GuardChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
  };

  const edit = (field: GuardField, to: GuardValue) => {
    if (inert) return;
    const from = current[field.id] ?? (field.kind === "switch" ? false : "");
    if (from === to) return;
    const next = { ...current, [field.id]: to };
    commit(next, { id: field.id, label: field.label, from, to });
    const n = diffGuardValues(fields, base, next).length;
    const wasDirty = changedIds.has(field.id);
    const nowDirty =
      (base[field.id] ?? (field.kind === "switch" ? false : "")) !== to;
    if (field.kind === "text") {
      // Keystrokes are not read out one by one; the row's own "was" line
      // and the header count carry the state. Announce crossing only.
      if (wasDirty !== nowDirty) {
        setAnnouncement(
          nowDirty
            ? `${field.label} changed. ${plural(n, "unsaved change", "unsaved changes")}.`
            : `${field.label} back to saved. ${n === 0 ? "No unsaved changes." : plural(n, "unsaved change", "unsaved changes") + "."}`,
        );
      }
      return;
    }
    setAnnouncement(
      `${field.label} ${describeGuardValue(field, to)}. ${n === 0 ? "No unsaved changes." : plural(n, "unsaved change", "unsaved changes") + "."}`,
    );
  };

  const flashFields = (ids: string[]) => {
    if (ids.length === 0) return;
    const step = cascade(ids.length);
    setFlashes((prev) => {
      const next = { ...prev };
      ids.forEach((id, i) => {
        next[id] = { seq: (prev[id]?.seq ?? 0) + 1, delay: r3(i * step) };
      });
      return next;
    });
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(
      () => {
        flashTimer.current = null;
        if (alive.current) setFlashes({});
      },
      FLASH_MS + ids.length * step * 1000 + 100,
    );
  };

  const revert = (field: GuardField) => {
    if (inert) return;
    const to = base[field.id] ?? (field.kind === "switch" ? false : "");
    const from = current[field.id] ?? (field.kind === "switch" ? false : "");
    if (from === to) return;
    const next = { ...current, [field.id]: to };
    commit(next, { id: field.id, label: field.label, from, to });
    flashFields([field.id]);
    const n = diffGuardValues(fields, base, next).length;
    setAnnouncement(
      `${field.label} reverted to ${describeGuardValue(field, to)}. ${n === 0 ? "No unsaved changes." : plural(n, "unsaved change", "unsaved changes") + "."}`,
    );
    fieldNodes.current.get(field.id)?.focus({ preventScroll: true });
  };

  const discardAll = () => {
    if (inert || !dirty) return;
    const next = { ...current };
    for (const c of changes) next[c.id] = c.from;
    if (value === undefined) setOwn(next);
    const first = changes[0];
    if (first) onChange?.(next, { ...first, to: first.from, from: first.to });
    onDiscard?.(changes);
    flashFields(changes.map((c) => c.id));
    setAnnouncement(
      `${plural(changes.length, "change", "changes")} discarded. No unsaved changes.`,
    );
  };

  /* ------------------------------- leaving ----------------------------- */

  const showToast = () => {
    setToast((t) => t + 1);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      toastTimer.current = null;
      if (alive.current) setToast(0);
    }, TOAST_MS);
  };

  const reqId = leaveRequest?.id;
  React.useEffect(() => {
    if (!leaveRequest || reqId === undefined || handled.current === reqId) {
      return;
    }
    handled.current = reqId;
    const L = latest.current;
    if (L.inert || L.changes.length === 0) {
      showToast();
      setAnnouncement(
        `No unsaved changes. Leaving for ${leaveRequest.destination}.`,
      );
      L.onLeave?.("clean", leaveRequest);
      return;
    }
    returnTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setGuard({ request: leaveRequest, phase: "idle", error: null });
    setAnnouncement(
      `Unsaved changes. ${leaveRequest.kind === "close" ? "Closing" : `Leaving for ${leaveRequest.destination}`} would lose ${plural(L.changes.length, "change", "changes")}. Save and leave, leave without saving, or stay.`,
    );
    // The request is the only trigger; everything else is read from `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqId]);

  const close = (focusBack: boolean) => {
    clearArm();
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    saveSeq.current += 1;
    setGuard(null);
    if (focusBack) {
      const target = returnTo.current;
      returnTo.current = null;
      if (target && target.isConnected) target.focus({ preventScroll: true });
      else {
        const firstDirty = changes[0];
        if (firstDirty) {
          fieldNodes.current.get(firstDirty.id)?.focus({ preventScroll: true });
        }
      }
    } else returnTo.current = null;
  };

  const stay = () => {
    if (!guard || guard.phase === "saving" || guard.phase === "saved") return;
    const request = guard.request;
    close(true);
    setAnnouncement("Stayed. Your changes are still here.");
    onStay?.(request);
  };

  const save = () => {
    if (!guard || guard.phase === "saving" || guard.phase === "saved") return;
    clearArm();
    const request = guard.request;
    const seq = (saveSeq.current += 1);
    const snapshot = current;
    const list = changes;
    setGuard({ request, phase: "saving", error: null });
    setAnnouncement("Saving.");
    const run = onSave ?? simulateSave;
    Promise.resolve()
      .then(() => run(snapshot, list))
      .then(
        () => {
          if (!alive.current || saveSeq.current !== seq) return;
          setOwnBase(snapshot);
          setGuard({ request, phase: "saved", error: null });
          setAnnouncement(
            `Saved ${plural(list.length, "change", "changes")}. Leaving for ${request.destination}.`,
          );
          holdTimer.current = window.setTimeout(() => {
            holdTimer.current = null;
            if (!alive.current || saveSeq.current !== seq) return;
            close(false);
            onLeave?.("saved", request);
          }, SAVED_HOLD_MS);
        },
        (reason: unknown) => {
          if (!alive.current || saveSeq.current !== seq) return;
          const message =
            reason instanceof Error && reason.message
              ? reason.message
              : "The settings could not be saved.";
          setGuard({ request, phase: "failed", error: message });
          setAnnouncement(
            `Save failed. ${message} Try again, or leave without saving.`,
          );
        },
      );
  };

  const leaveWithout = () => {
    if (!guard || guard.phase === "saving" || guard.phase === "saved") return;
    const request = guard.request;
    if (armed === 0) {
      setArmed((a) => a + 1);
      setAnnouncement(
        `Press again within ${armSeconds} ${armSeconds === 1 ? "second" : "seconds"} to leave without saving.`,
      );
      if (armTimer.current !== null) window.clearTimeout(armTimer.current);
      armTimer.current = window.setTimeout(() => {
        armTimer.current = null;
        if (alive.current) {
          setArmed(0);
          setAnnouncement("Leave without saving disarmed.");
        }
      }, armSeconds * 1000);
      return;
    }
    // Second press: the form goes back to what was saved and the leave goes.
    const next = { ...current };
    for (const c of changes) next[c.id] = c.from;
    if (value === undefined) setOwn(next);
    const first = changes[0];
    if (first) onChange?.(next, { ...first, to: first.from, from: first.to });
    close(false);
    setAnnouncement(
      `Left without saving. ${plural(changes.length, "change", "changes")} lost.`,
    );
    onLeave?.("discarded", request);
  };

  // Focus lands on Save and leave when the sheet opens: the safe way out.
  React.useEffect(() => {
    if (!open) return;
    const raf = window.requestAnimationFrame(() => {
      primaryRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  const onSheetKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stay();
      return;
    }
    if (event.key !== "Tab" || !sheetRef.current) return;
    const nodes = Array.from(
      sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ).filter((n) => n.getAttribute("aria-hidden") !== "true");
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (
      event.shiftKey &&
      (active === first || !sheetRef.current.contains(active))
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  /* ------------------------------- render ------------------------------ */

  const d = DENSITY[density];
  const phase = guard?.phase ?? "idle";
  const busy = phase === "saving" || phase === "saved";
  const sheetStep = cascade(Math.min(changes.length, 8));
  const dest = guard?.request.destination ?? "";
  const closing = guard?.request.kind === "close";

  const buttonBase =
    "relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-2 px-3.5 text-[13px] font-medium transition-colors";

  return (
    <div
      ref={rootRef}
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
      <header
        className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 pt-3 pb-3"
        inert={open || undefined}
      >
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {subtitle}
          </p>
          <div className="flex items-center gap-2">
            <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
              {title}
            </p>
            <AnimatePresence>
              {dirty && ready ? (
                <motion.span
                  key="dot"
                  aria-hidden
                  className="block size-2 shrink-0 rounded-full bg-cobalt-bright"
                  initial={
                    live ? (motionSafe ? { scale: 0 } : { opacity: 0 }) : false
                  }
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{
                    scale: motionSafe ? 0.4 : 1,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe ? springs.snap : { duration: durations.fast }
                  }
                />
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {ready ? (
            <p
              className={cn(
                "font-mono text-[10px] tracking-[0.08em] uppercase transition-colors",
                dirty ? "text-cobalt-bright" : "text-ink-3",
              )}
            >
              {dirty ? (
                <>
                  {changes.length}{" "}
                  <span className="hidden @min-[24rem]:inline">unsaved</span>
                </>
              ) : (
                "Saved"
              )}
            </p>
          ) : null}
          <button
            type="button"
            onClick={discardAll}
            aria-disabled={inert || !dirty || undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
              !inert && dirty
                ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
                : "cursor-default text-ink-3",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Discard all
          </button>
        </div>
      </header>

      <div
        className="relative flex-1 overflow-y-auto overscroll-contain"
        inert={open || undefined}
      >
        {status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The settings didn&apos;t load.
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
          <div aria-hidden className="flex flex-col pb-4">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-1 gap-x-4 gap-y-2 px-4 @min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,17rem)]",
                  d.row,
                  i % 2 === 0 && "pt-6",
                )}
              >
                <div className="flex flex-col gap-1.5">
                  <span
                    className="h-3.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${38 + ((i * 17) % 30)}%`,
                      animationDelay: `${i * 90}ms`,
                    }}
                  />
                  <span
                    className="h-2.5 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                    style={{
                      width: `${55 + ((i * 23) % 30)}%`,
                      animationDelay: `${i * 90 + 40}ms`,
                    }}
                  />
                </div>
                <span
                  className={cn(
                    "rounded-2 bg-surface-2 motion-safe:animate-pulse",
                    i % 3 === 2 ? "h-6 w-11 rounded-full" : "h-8 w-full",
                  )}
                  style={{ animationDelay: `${i * 90 + 20}ms` }}
                />
              </div>
            ))}
          </div>
        ) : fields.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <p className="text-sm text-ink-2">Nothing to set here yet.</p>
            <p className="text-[11px] text-ink-3">
              Leaving is always safe: there is nothing to lose.
            </p>
          </div>
        ) : (
          <div className="flex flex-col pb-3">
            {sections.map((section, s) => (
              <section
                key={`${section.name ?? "untitled"}-${s}`}
                aria-label={section.name}
                className={cn(s > 0 && "border-t border-hairline")}
              >
                {section.name ? (
                  <h3
                    className={cn(
                      "px-4 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
                      d.section,
                    )}
                  >
                    {section.name}
                  </h3>
                ) : null}
                {section.fields.map((field) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    value={current[field.id]}
                    base={base[field.id]}
                    changed={changedIds.has(field.id)}
                    flash={flashes[field.id]?.seq ?? 0}
                    flashDelay={flashes[field.id]?.delay ?? 0}
                    density={density}
                    inert={inert}
                    motionSafe={motionSafe}
                    uid={uid}
                    onChange={(v) => edit(field, v)}
                    onRevert={() => revert(field)}
                    nodeRef={(node) => {
                      if (node) fieldNodes.current.set(field.id, node);
                      else fieldNodes.current.delete(field.id);
                    }}
                  />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* The clean-leave toast. */}
      <AnimatePresence>
        {toast > 0 ? (
          <motion.div
            key={toast}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-4"
            initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
          >
            <span className="inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-popover px-3 py-1.5 text-xs text-foreground shadow-[0_10px_28px_-12px_color-mix(in_oklab,black_45%,transparent)]">
              <span className="text-success">
                <Tick motionSafe={motionSafe} />
              </span>
              No unsaved changes
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* The guard. */}
      <AnimatePresence>
        {guard ? (
          <motion.div
            key="dim"
            aria-hidden
            onClick={stay}
            className="absolute inset-0 z-20 bg-[color-mix(in_oklab,var(--ink)_32%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={{ duration: durations.base, ease: easings.enter }}
          />
        ) : null}
        {guard ? (
          // A motion wrapper, so AnimatePresence waits for the dialog's own
          // exit before the layer leaves the tree.
          <motion.div
            key="sheet-layer"
            initial={false}
            className={cn(
              "pointer-events-none absolute inset-0 z-30 flex",
              sheetSide === "centre"
                ? "items-center justify-center p-4"
                : "items-end justify-center",
            )}
          >
            <motion.div
              ref={sheetRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              aria-describedby={sheetDescId}
              onKeyDown={onSheetKeyDown}
              className={cn(
                "pointer-events-auto relative flex w-full flex-col overflow-hidden border border-hairline-strong bg-popover text-foreground shadow-[0_-12px_40px_-16px_color-mix(in_oklab,black_55%,transparent)]",
                sheetSide === "centre"
                  ? "max-w-md rounded-3"
                  : "max-h-full max-w-2xl rounded-t-3 border-b-0",
              )}
              initial={
                !motionSafe
                  ? { opacity: 0 }
                  : sheetSide === "centre"
                    ? { opacity: 0, scale: 0.96, y: distances.step }
                    : { y: "100%" }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                !motionSafe
                  ? { opacity: 0, transition: exitFor(durations.base) }
                  : sheetSide === "centre"
                    ? {
                        opacity: 0,
                        scale: 0.98,
                        transition: exitFor(durations.base),
                      }
                    : { y: "100%", transition: exitFor(durations.slow) }
              }
              transition={
                motionSafe
                  ? { ...springs.glide, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {/* Save progress along the top edge. */}
              <div aria-hidden className="absolute inset-x-0 top-0 h-0.5">
                <AnimatePresence>
                  {phase === "saving" || phase === "saved" ? (
                    <motion.div
                      key="progress"
                      className="h-full origin-left bg-cobalt-bright"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: phase === "saved" ? 1 : 0.85 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        phase === "saved"
                          ? motionSafe
                            ? springs.flick
                            : { duration: durations.fast }
                          : { duration: 1.6, ease: easings.enter }
                      }
                    />
                  ) : null}
                </AnimatePresence>
              </div>

              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-4 pb-4 @min-[36rem]:px-5">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn"
                  >
                    <CircleAlert className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h2
                      id={sheetTitleId}
                      className="text-sm font-semibold text-foreground"
                    >
                      Unsaved changes
                    </h2>
                    <p
                      id={sheetDescId}
                      className="mt-0.5 text-[12px] text-ink-2"
                    >
                      {closing ? "Closing" : <>Leaving for {dest}</>} would lose{" "}
                      {plural(changes.length, "change", "changes")}.
                    </p>
                  </div>
                </div>

                <ul
                  role="list"
                  aria-label="Changes that would be lost"
                  className="flex flex-col rounded-2 border border-hairline bg-surface-0"
                >
                  {changes.map((change, i) => {
                    const field = byId.get(change.id);
                    return (
                      <motion.li
                        key={change.id}
                        className={cn(
                          "grid grid-cols-1 gap-x-3 gap-y-0.5 px-3 py-2 @min-[30rem]:grid-cols-[minmax(0,10rem)_minmax(0,1fr)] @min-[30rem]:items-center",
                          i > 0 && "border-t border-hairline",
                        )}
                        initial={{
                          opacity: 0,
                          y: motionSafe ? distances.step : 0,
                        }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={
                          motionSafe
                            ? {
                                ...springs.glide,
                                delay: r3(0.08 + i * sheetStep),
                                opacity: {
                                  duration: durations.base,
                                  delay: r3(0.08 + i * sheetStep),
                                  ease: easings.enter,
                                },
                              }
                            : { duration: durations.fast }
                        }
                      >
                        <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
                          {change.label}
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[11px]">
                          <span className="min-w-0 break-words text-ink-3 line-through decoration-[color-mix(in_oklab,var(--ink-3)_60%,transparent)]">
                            {field
                              ? describeGuardValue(field, change.from)
                              : String(change.from)}
                          </span>
                          <ArrowRight
                            aria-hidden
                            className="size-3 shrink-0 text-ink-3"
                          />
                          <span className="sr-only">to</span>
                          <span className="min-w-0 break-words text-cobalt-bright">
                            {field
                              ? describeGuardValue(field, change.to)
                              : String(change.to)}
                          </span>
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>

                <AnimatePresence initial={false}>
                  {phase === "failed" && guard.error ? (
                    <motion.p
                      key="error"
                      role="alert"
                      className="flex items-start gap-2 rounded-2 border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-3 py-2 text-[12px] text-foreground"
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.nudge : 0,
                      }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={
                        motionSafe
                          ? {
                              ...springs.snap,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <TriangleAlert
                        aria-hidden
                        className="mt-0.5 size-3.5 shrink-0 text-danger"
                      />
                      <span>
                        <span className="font-medium">Couldn&apos;t save.</span>{" "}
                        {guard.error}
                      </span>
                    </motion.p>
                  ) : null}
                </AnimatePresence>

                <div className="flex flex-col gap-2 @min-[30rem]:flex-row @min-[30rem]:items-center">
                  <button
                    ref={primaryRef}
                    type="button"
                    onClick={save}
                    aria-disabled={busy || undefined}
                    className={cn(
                      buttonBase,
                      "bg-primary text-primary-foreground hover:bg-[color-mix(in_oklab,var(--accent)_88%,var(--ink))]",
                      busy && "cursor-default",
                      FOCUS_RING,
                    )}
                  >
                    {phase === "saved" ? (
                      <>
                        <Tick motionSafe={motionSafe} />
                        Saved
                      </>
                    ) : phase === "saving" ? (
                      <>
                        <span
                          aria-hidden
                          className="size-3 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin"
                        />
                        Saving
                      </>
                    ) : phase === "failed" ? (
                      <>
                        <RotateCcw aria-hidden className="size-3.5" />
                        Try again
                      </>
                    ) : (
                      "Save and leave"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={leaveWithout}
                    aria-disabled={busy || undefined}
                    aria-describedby={armed > 0 ? `${uid}-arm` : undefined}
                    className={cn(
                      buttonBase,
                      armed > 0
                        ? "border border-transparent bg-danger text-[color-mix(in_oklab,white_94%,var(--danger))]"
                        : "border border-hairline-strong text-danger hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]",
                      busy && "cursor-default opacity-60",
                      FOCUS_RING,
                    )}
                  >
                    <span className="relative">
                      {armed > 0
                        ? "Press again to leave"
                        : "Leave without saving"}
                    </span>
                    {armed > 0 ? (
                      <motion.span
                        key={armed}
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-current opacity-80"
                        initial={{ scaleX: 1 }}
                        animate={{ scaleX: 0 }}
                        transition={{
                          duration: armSeconds,
                          ease: easings.linear,
                        }}
                      />
                    ) : null}
                  </button>
                  <span id={`${uid}-arm`} className="sr-only">
                    Armed. Press again within {armSeconds} seconds.
                  </span>
                  <button
                    type="button"
                    onClick={stay}
                    aria-disabled={busy || undefined}
                    className={cn(
                      buttonBase,
                      "text-ink-2 hover:bg-surface-2 hover:text-foreground @min-[30rem]:ml-auto",
                      busy && "cursor-default opacity-60",
                      FOCUS_RING,
                    )}
                  >
                    Stay
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
