"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  motionValue,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  GripVertical,
  LoaderCircle,
  Plus,
  RotateCcw,
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
import { rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type AttendeeFieldKind = "text" | "email" | "select";

export type AttendeeField = {
  /** Key into each row's values. */
  key: string;
  label: string;
  kind: AttendeeFieldKind;
  /** Choices for the select kind. */
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
  /** Column width on the wide table, any grid track. @default 1fr (email 1.25fr, select 8.5rem) */
  width?: string;
  /** On the compact card: a full line, or half of one beside its neighbour. @default "half" for selects, else "full" */
  span?: "full" | "half";
};

export type AttendeeRow = {
  /** Stable and unique: it keys the row through every move. */
  id: string;
  values: Record<string, string>;
};

export type AttendeeRowStyle = "lines" | "cards" | "striped";
export type AttendeeDensity = "compact" | "cozy" | "roomy";

export type AttendeeRowsProps = {
  /** Controlled guests, in order. Removed rows waiting on Undo are not in it. */
  rows?: AttendeeRow[];
  /** Initial guests when uncontrolled. @default defaultAttendeeRows */
  defaultRows?: AttendeeRow[];
  /** Fires from every add, remove, undo, move and edit, with the guests in order. */
  onRowsChange?: (rows: AttendeeRow[]) => void;
  /** The columns of each row. @default defaultAttendeeFields (name, email, dietary needs, access) */
  fields?: AttendeeField[];
  /** Seats available; the add button greys out with its reason at the limit. @default 6 */
  seats?: number;
  /** A guest was added, with its index. */
  onAdd?: (row: AttendeeRow, index: number) => void;
  /** A guest was removed (Undo is still offered), with the index it had. */
  onRemove?: (row: AttendeeRow, index: number) => void;
  /** Undo brought a removed guest back at its old place. */
  onRestore?: (row: AttendeeRow, index: number) => void;
  /** A drag or Alt+Arrow moved a guest. */
  onReorder?: (rows: AttendeeRow[], from: number, to: number) => void;
  /** Register was pressed with every row valid. A promise shows progress; a rejection keeps every row. */
  onSubmit?: (rows: AttendeeRow[]) => void | Promise<void>;
  /** How rows are set apart: hairlines like a table, raised cards, or alternating washes. @default "lines" */
  rowStyle?: AttendeeRowStyle;
  /** Field height and row padding. @default "cozy" */
  density?: AttendeeDensity;
  /** Badges, seat pips, the lifted row's edge, the add button and the submit fill, any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a removed row waits behind its undo chip, in ms. Paused while the chip is hovered or focused. @default 5000 */
  undoMs?: number;
  /** The form's heading and accessible name. @default "Open day registration" */
  title?: string;
  /** The event line under the heading. */
  event?: string;
  /** The submit button's verb; the guest count follows it. @default "Register" */
  submitLabel?: string;
  /** Panel height in px; the rows scroll inside it. @default 520 */
  height?: number;
  /** Loading draws placeholder rows. @default "ready" */
  status?: "ready" | "loading";
  /** Nothing can be edited, moved or sent. @default false */
  disabled?: boolean;
  className?: string;
};

/* --------------------------------- data --------------------------------- */

export const defaultAttendeeFields: AttendeeField[] = [
  {
    key: "name",
    label: "Name",
    kind: "text",
    required: true,
    autoComplete: "name",
    placeholder: "Full name",
  },
  {
    key: "email",
    label: "Email",
    kind: "email",
    required: true,
    autoComplete: "email",
    placeholder: "name@studio.net",
  },
  {
    key: "diet",
    label: "Dietary needs",
    kind: "select",
    options: [
      { value: "none", label: "None" },
      { value: "vegetarian", label: "Vegetarian" },
      { value: "vegan", label: "Vegan" },
      { value: "gluten-free", label: "Gluten free" },
      { value: "other", label: "Other" },
    ],
  },
  {
    key: "access",
    label: "Access",
    kind: "text",
    placeholder: "Step-free, seating…",
    span: "half",
  },
];

/** Lina registering her studio team; Theo's email is missing its domain. */
export const defaultAttendeeRows: AttendeeRow[] = [
  {
    id: "lina",
    values: {
      name: "Lina Okafor",
      email: "lina@coldbrook.studio",
      diet: "vegetarian",
      access: "",
    },
  },
  {
    id: "theo",
    values: {
      name: "Theo Park",
      email: "theo.park@",
      diet: "none",
      access: "Step-free route",
    },
  },
  {
    id: "ana",
    values: {
      name: "Ana Ruiz",
      email: "ana@fernworks.studio",
      diet: "gluten-free",
      access: "",
    },
  },
];

/* ------------------------------ validation ------------------------------ */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function checkField(
  field: AttendeeField,
  raw: string | undefined,
): string | null {
  const value = (raw ?? "").trim();
  if (!value) {
    if (!field.required) return null;
    return field.kind === "select"
      ? "Choose one"
      : `Add ${field.kind === "email" ? "an email" : `a ${field.label.toLowerCase()}`}`;
  }
  if (field.kind === "email") {
    if (!value.includes("@")) return "An email needs an @";
    if (!EMAIL.test(value)) return "Add the part after the @";
  }
  return null;
}

/* ------------------------------- styling -------------------------------- */

type Density = { control: string; cell: string; pad: string; gap: string };

const DENSITY: Record<AttendeeDensity, Density> = {
  compact: {
    control: "h-8",
    cell: "@min-[40rem]:h-8",
    pad: "py-1.5",
    gap: "gap-2",
  },
  cozy: {
    control: "h-9",
    cell: "@min-[40rem]:h-9",
    pad: "py-2.5",
    gap: "gap-2.5",
  },
  roomy: {
    control: "h-10",
    cell: "@min-[40rem]:h-10",
    pad: "py-3.5",
    gap: "gap-3",
  },
};

const RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const CONTROL_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-1";

/** The removed row's slot while it waits on Undo: a 36px chip and its gap. */
const CHIP_H = 44;

const nameOf = (row: AttendeeRow, index: number) =>
  row.values.name?.trim() || `Guest ${index + 1}`;
const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;
const r2 = (v: number) => Math.round(v * 100) / 100;

type Entry = {
  row: AttendeeRow;
  /** Removed, waiting behind its undo chip. */
  ghost: boolean;
  /** The chip ran out; the slot is closing. */
  gone: boolean;
  /** The name a removed row was known by, frozen when it was removed. */
  ghostName?: string;
  /** Added this session: unfolds from the add button on arrival. */
  fresh: boolean;
};

const toEntries = (rows: AttendeeRow[]): Entry[] =>
  rows.map((row) => ({ row, ghost: false, gone: false, fresh: false }));

const activeRows = (list: Entry[]) =>
  list.filter((e) => !e.ghost && !e.gone).map((e) => e.row);

/**
 * Lays a host's rows over the current entries: rows keep their order from the
 * host, removed rows still waiting on Undo keep their slots between them.
 */
function reconcile(prev: Entry[], rows: AttendeeRow[]): Entry[] {
  const known = new Map(prev.map((e) => [e.row.id, e]));
  const next: Entry[] = rows.map((row) => ({
    row,
    ghost: false,
    gone: false,
    fresh: known.get(row.id)?.fresh ?? false,
  }));
  prev.forEach((e, index) => {
    if ((e.ghost || e.gone) && !rows.some((r) => r.id === e.row.id)) {
      next.splice(Math.min(index, next.length), 0, e);
    }
  });
  return next;
}

/* ------------------------------- undo chip ------------------------------- */

function UndoChip({
  name,
  ms,
  motionSafe,
  focusOnMount,
  onUndo,
  onExpire,
}: {
  name: string;
  ms: number;
  motionSafe: boolean;
  focusOnMount: boolean;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const left = useMotionValue(1);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const expire = React.useRef(onExpire);
  React.useEffect(() => {
    expire.current = onExpire;
  });
  const [hold, setHold] = React.useState({ hover: false, focus: false });
  const button = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    left.jump(1);
    // A plain number written into `left`: the chip has only just mounted,
    // and an animation on its own bound value can wait on it.
    const r = animate(1, 0, {
      duration: ms / 1000,
      ease: easings.linear,
      onUpdate: (v) => left.set(v),
      onComplete: () => expire.current(),
    });
    run.current = r;
    return () => r.stop();
  }, [left, ms]);

  const paused = hold.hover || hold.focus;
  React.useEffect(() => {
    if (paused) run.current?.pause();
    else run.current?.play();
  }, [paused]);

  React.useEffect(() => {
    if (focusOnMount) button.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <motion.div
      className="absolute inset-x-0 top-0 flex h-9 items-center gap-2 overflow-hidden rounded-2 border border-dashed border-hairline-strong bg-surface-0 pr-1 pl-3 text-[12.5px]"
      initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.base, delay: motionSafe ? 0.12 : 0 },
        y: motionSafe ? { ...springs.snap, delay: 0.12 } : { duration: 0 },
      }}
      onPointerEnter={() => setHold((h) => ({ ...h, hover: true }))}
      onPointerLeave={() => setHold((h) => ({ ...h, hover: false }))}
      onFocus={(event) => {
        // Keyboard focus holds the timer, so a keyboard user gets all the
        // time they need; the focus a mouse remove hands to Undo does not.
        const keyboard = event.target.matches(":focus-visible");
        setHold((h) => ({ ...h, focus: keyboard }));
      }}
      onBlur={() => setHold((h) => ({ ...h, focus: false }))}
    >
      <span className="min-w-0 flex-1 truncate text-ink-2">
        Removed <span className="font-medium text-foreground">{name}</span>
      </span>
      <button
        ref={button}
        type="button"
        onClick={onUndo}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 px-2 text-[12px] font-medium text-(--ar-accent) transition-colors hover:bg-surface-2",
          RING,
        )}
      >
        <Undo2 aria-hidden className="size-3.5" />
        Undo
      </button>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[color-mix(in_oklab,var(--ar-accent)_70%,transparent)]"
        style={{ scaleX: left, originX: 0 }}
      />
    </motion.div>
  );
}

/* ---------------------------------- row ---------------------------------- */

type RowProps = {
  entry: Entry;
  index: number;
  /** Position among the active guests, or -1 for a removed row. */
  guestIndex: number;
  guestCount: number;
  fields: AttendeeField[];
  uid: string;
  d: Density;
  rowStyle: AttendeeRowStyle;
  motionSafe: boolean;
  disabled: boolean;
  y: MotionValue<number>;
  lifted: boolean;
  dragBusy: boolean;
  shownError: (key: string) => string | null;
  complete: boolean;
  confirmed: boolean;
  confirmDelay: number;
  undoMs: number;
  focusUndo: boolean;
  hintId: string;
  onEdit: (key: string, value: string) => void;
  onBlurField: (key: string) => void;
  onRemove: () => void;
  onUndo: () => void;
  onExpire: () => void;
  onGone: () => void;
  onMoveKey: (dir: -1 | 1) => void;
  onDragStart: () => void;
  onDragMove: (dy: number) => void;
  onDragEnd: (vy: number) => void;
  onDragCancel: () => void;
  bindSlot: (node: HTMLLIElement | null) => void;
  bindInput: (key: string, node: HTMLElement | null) => void;
};

function Row({
  entry,
  index,
  guestIndex,
  guestCount,
  fields,
  uid,
  d,
  rowStyle,
  motionSafe,
  disabled,
  y,
  lifted,
  dragBusy,
  shownError,
  complete,
  confirmed,
  confirmDelay,
  undoMs,
  focusUndo,
  hintId,
  onEdit,
  onBlurField,
  onRemove,
  onUndo,
  onExpire,
  onGone,
  onMoveKey,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
  bindSlot,
  bindInput,
}: RowProps) {
  const { row } = entry;
  const base = `${uid}-${row.id}`;
  const label =
    guestIndex < 0 && entry.ghostName
      ? entry.ghostName
      : nameOf(row, Math.max(guestIndex, 0));

  // A fresh row renders folded first and opens on the next frame, so the
  // unfold is driven by `animate` alone — no `initial`, which motion would
  // re-apply if a StrictMode rehearsal re-ran the effects of a moved row.
  const [opened, setOpened] = React.useState(!entry.fresh);
  React.useEffect(() => {
    if (opened) return;
    const raf = window.requestAnimationFrame(() => setOpened(true));
    return () => window.cancelAnimationFrame(raf);
  }, [opened]);

  const phase = entry.gone
    ? "gone"
    : entry.ghost
      ? "ghost"
      : opened
        ? "open"
        : "closed";
  const [settled, setSettled] = React.useState<string>(
    entry.fresh ? "closed" : "open",
  );
  // The slot clips only while it opens or closes: a lifted or shifting row
  // must be free to travel outside it.
  const clip = !(phase === "open" && settled === "open") && !dragBusy;
  const folded = phase !== "open";
  // Only a removed row leaves the tab order; a fresh one is focusable the
  // moment it mounts, so the add button can hand focus straight to it.
  const hidden = entry.ghost || entry.gone;

  const drag = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || entry.ghost,
    onStart: () => onDragStart(),
    onMove: ({ offset }) => onDragMove(offset.y),
    onEnd: ({ velocity }) => onDragEnd(velocity.y),
    onCancel: () => onDragCancel(),
  });

  const errors = fields.map((f) => shownError(f.key));
  const errorCount = errors.filter(Boolean).length;

  const leafStyle =
    rowStyle === "cards"
      ? "rounded-3 border border-hairline bg-card px-3 shadow-[0_1px_2px_color-mix(in_oklab,black_6%,transparent)]"
      : rowStyle === "striped"
        ? cn("rounded-2 px-2", index % 2 === 1 ? "bg-surface-0" : "bg-card")
        : "border-b border-hairline bg-card px-1";

  return (
    <motion.li
      ref={bindSlot}
      role="group"
      aria-label={
        entry.ghost || entry.gone
          ? `Removed guest, ${label}`
          : `Guest ${guestIndex + 1} of ${guestCount}, ${label}`
      }
      className={cn("relative", clip && "overflow-hidden", lifted && "z-10")}
      initial={false}
      animate={{
        height:
          phase === "gone"
            ? 0
            : phase === "ghost"
              ? CHIP_H
              : phase === "closed"
                ? 0
                : "auto",
        opacity: phase === "gone" ? 0 : 1,
      }}
      transition={
        !motionSafe
          ? { height: { duration: 0 }, opacity: { duration: durations.fast } }
          : phase === "gone"
            ? { ...exitFor(durations.slow), opacity: exitFor(durations.base) }
            : { height: springs.glide, opacity: { duration: durations.base } }
      }
      onAnimationComplete={() => {
        setSettled(phase);
        if (phase === "gone") onGone();
      }}
      onKeyDown={(event) => {
        if (!event.altKey || entry.ghost) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          onMoveKey(event.key === "ArrowUp" ? -1 : 1);
        }
      }}
    >
      <div
        className={cn(
          rowStyle === "cards" ? "pb-2" : rowStyle === "striped" ? "pb-1" : "",
        )}
      >
        <motion.div
          aria-hidden={hidden || undefined}
          inert={hidden || undefined}
          className={cn(
            "relative transition-shadow",
            leafStyle,
            d.pad,
            lifted &&
              "shadow-[0_10px_28px_-8px_color-mix(in_oklab,black_35%,transparent),0_0_0_1px_color-mix(in_oklab,var(--ar-accent)_45%,transparent)]",
          )}
          style={{ y, originY: 0, transformPerspective: 700 }}
          initial={false}
          animate={{
            rotateX: folded && motionSafe ? -72 : 0,
            opacity: folded ? 0 : 1,
            scale: lifted && motionSafe ? 1.015 : 1,
          }}
          transition={
            !motionSafe
              ? { duration: durations.fast }
              : folded
                ? {
                    rotateX: exitFor(durations.slow),
                    opacity: exitFor(durations.base),
                    scale: springs.flick,
                  }
                : {
                    rotateX: springs.glide,
                    opacity: { duration: durations.base, ease: easings.enter },
                    scale: springs.flick,
                  }
          }
        >
          <div
            className={cn(
              "flex flex-col @min-[40rem]:grid @min-[40rem]:grid-cols-(--ar-cols) @min-[40rem]:items-start @min-[40rem]:gap-x-2",
              d.gap,
            )}
          >
            <div className="flex items-center gap-2 @min-[40rem]:contents">
              <button
                type="button"
                {...drag}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    event.stopPropagation();
                    onMoveKey(event.key === "ArrowUp" ? -1 : 1);
                  }
                }}
                disabled={disabled}
                aria-label={`Move ${label}, ${guestIndex + 1} of ${guestCount}`}
                aria-describedby={hintId}
                className={cn(
                  "inline-flex size-6 shrink-0 cursor-grab touch-pan-x items-center justify-center self-center rounded-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed",
                  d.cell,
                  lifted && "cursor-grabbing text-(--ar-accent)",
                  RING,
                )}
              >
                <GripVertical aria-hidden className="size-4" />
              </button>
              <span
                aria-hidden
                className={cn(
                  "inline-flex shrink-0 items-center justify-center",
                  d.cell,
                )}
              >
                <span
                  className={cn(
                    "relative inline-flex size-6 items-center justify-center rounded-full border font-mono text-[10.5px] tabular-nums transition-colors",
                    confirmed
                      ? "border-transparent bg-(--ar-accent) text-background"
                      : errorCount > 0
                        ? "border-[color-mix(in_oklab,var(--danger)_60%,transparent)] text-danger"
                        : complete
                          ? "border-[color-mix(in_oklab,var(--ar-accent)_65%,transparent)] bg-[color-mix(in_oklab,var(--ar-accent)_8%,transparent)] text-(--ar-accent)"
                          : "border-hairline-strong text-ink-2",
                  )}
                  style={{
                    transitionDelay: confirmed
                      ? `${Math.round(confirmDelay * 1000)}ms`
                      : "0ms",
                  }}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {confirmed ? (
                      <motion.span
                        key="ok"
                        className="inline-flex"
                        initial={{ scale: motionSafe ? 0.4 : 1, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                        transition={
                          motionSafe
                            ? { ...springs.flick, delay: confirmDelay }
                            : { duration: durations.fast, delay: confirmDelay }
                        }
                      >
                        <Check strokeWidth={3} className="size-3" />
                      </motion.span>
                    ) : (
                      <motion.span
                        key="n"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{
                          opacity: 0,
                          transition: exitFor(durations.fast),
                        }}
                      >
                        {Math.max(guestIndex, 0) + 1}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground @min-[40rem]:hidden">
                {label}
              </span>
              {errorCount > 0 ? (
                <span className="shrink-0 rounded-full bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] px-1.5 py-0.5 text-[11px] text-danger @min-[40rem]:hidden">
                  {errorCount} to fix
                </span>
              ) : null}
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center @min-[40rem]:order-last",
                  d.cell,
                )}
              >
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={disabled}
                  aria-label={`Remove ${label}`}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger disabled:cursor-not-allowed",
                    RING,
                  )}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </span>
            </div>
            <div
              className={cn("grid grid-cols-2 @min-[40rem]:contents", d.gap)}
            >
              {fields.map((field, f) => {
                const id = `${base}-${field.key}`;
                const err = errors[f] ?? null;
                const errId = `${id}-error`;
                const value = row.values[field.key] ?? "";
                const box = cn(
                  "w-full rounded-2 border bg-background px-2.5 text-[13px] text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
                  d.control,
                  CONTROL_RING,
                  err
                    ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
                    : "border-input hover:border-hairline-strong",
                );
                const shared = {
                  id,
                  disabled,
                  "aria-invalid": err ? true : undefined,
                  "aria-describedby": err ? errId : undefined,
                  "aria-errormessage": err ? errId : undefined,
                  "aria-required": field.required || undefined,
                  onBlur: () => onBlurField(field.key),
                };
                return (
                  <div
                    key={field.key}
                    className={cn(
                      "flex min-w-0 flex-col gap-1",
                      (field.span ??
                        (field.kind === "select" ? "half" : "full")) ===
                        "full" && "col-span-2 @min-[40rem]:col-span-1",
                    )}
                  >
                    <label
                      htmlFor={id}
                      className="text-[11.5px] font-medium text-ink-2 @min-[40rem]:sr-only"
                    >
                      {field.label}
                      {field.required ? null : (
                        <span className="ml-1 hidden font-normal text-ink-3 @min-[26rem]:inline">
                          optional
                        </span>
                      )}
                    </label>
                    {field.kind === "select" ? (
                      <span className="relative block">
                        <select
                          {...shared}
                          ref={(node) => bindInput(field.key, node)}
                          value={value}
                          onChange={(e) =>
                            onEdit(field.key, e.currentTarget.value)
                          }
                          className={cn(box, "appearance-none pr-7")}
                        >
                          {field.required ? (
                            <option value="">Choose…</option>
                          ) : null}
                          {(field.options ?? []).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          aria-hidden
                          className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-ink-3"
                        />
                      </span>
                    ) : (
                      <input
                        {...shared}
                        ref={(node) => bindInput(field.key, node)}
                        type={field.kind === "email" ? "email" : "text"}
                        inputMode={field.kind === "email" ? "email" : undefined}
                        autoComplete={field.autoComplete}
                        placeholder={field.placeholder}
                        value={value}
                        onChange={(e) =>
                          onEdit(field.key, e.currentTarget.value)
                        }
                        className={box}
                      />
                    )}
                    {err ? (
                      <p
                        id={errId}
                        className="flex items-start gap-1 text-[11px] leading-4 text-danger"
                      >
                        <CircleAlert
                          aria-hidden
                          className="mt-px size-3 shrink-0"
                        />
                        {err}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </div>
      <AnimatePresence>
        {entry.ghost && !entry.gone ? (
          <UndoChip
            key="chip"
            name={label}
            ms={undoMs}
            motionSafe={motionSafe}
            focusOnMount={focusUndo}
            onUndo={onUndo}
            onExpire={onExpire}
          />
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

/* --------------------------------- form --------------------------------- */

type Phase = "idle" | "sending" | "sent" | "failed";

type DragState = {
  id: string;
  from: number;
  to: number;
  order: string[];
  tops: number[];
  heights: number[];
  scroll0: number;
};

/**
 * A registration form whose guests are rows you can add, remove and move.
 * Add guest unfolds a new row downward out of the button: its slot opens to
 * the row's height on `springs.glide` while the row swings down from -72°
 * about its top edge, so it reads as a leaf turned down from the button.
 * Remove folds it back up on the exit ease behind an undo chip that takes its
 * place, with a hairline timer that drains over `undoMs` and holds while the
 * chip is hovered or focused; Undo unfolds the row again where it was.
 *
 * Rows move by their grip — the row lifts and follows the pointer 1:1, the
 * others glide out of its way as it crosses their midpoints, and on release
 * it settles into its slot on `springs.snap` with the release velocity — or
 * by Alt+Arrow from anywhere in the row (plain arrows on the grip), every row
 * travelling to its new place on glide. Each row checks itself when a field
 * loses focus and on submit; its badge shows a check when it is complete.
 * A seat limit greys the add button with its reason, Register shows progress
 * and a refused submit keeps every row. Below 40rem each row becomes a
 * compact card. Under reduced motion rows cross-fade in and out at full
 * height and neighbours swap at once; a drag still follows the finger.
 */
export function AttendeeRows({
  rows,
  defaultRows = defaultAttendeeRows,
  onRowsChange,
  fields = defaultAttendeeFields,
  seats = 6,
  onAdd,
  onRemove,
  onRestore,
  onReorder,
  onSubmit,
  rowStyle = "lines",
  density = "cozy",
  accent = "var(--accent-bright)",
  undoMs = 5000,
  title = "Open day registration",
  event = "Fernworks · Sat 14 Nov · Glass studio and print room",
  submitLabel = "Register",
  height = 520,
  status = "ready",
  disabled = false,
  className,
}: AttendeeRowsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const reasonId = `${uid}-reason`;
  const d = DENSITY[density] ?? DENSITY.cozy;

  const [entries, setEntries] = React.useState<Entry[]>(() =>
    toEntries(rows ?? defaultRows),
  );
  // A host that controls `rows` is laid over the entries in the render that
  // sees the change, keeping removed rows (still offering Undo) in place.
  const [seenRows, setSeenRows] = React.useState(rows);
  if (rows !== undefined && rows !== seenRows) {
    setSeenRows(rows);
    setEntries((prev) => reconcile(prev, rows));
  }

  const [touched, setTouched] = React.useState<Set<string>>(() => new Set());
  const dirty = React.useRef(new Set<string>());
  const [submitted, setSubmitted] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [lifted, setLifted] = React.useState<string | null>(null);
  const [focusUndo, setFocusUndo] = React.useState<string | null>(null);
  const [focusRequest, setFocusRequest] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");

  const [ys] = React.useState(() => new Map<string, MotionValue<number>>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const slots = React.useRef(new Map<string, HTMLLIElement>());
  const inputs = React.useRef(new Map<string, HTMLElement>());
  const bodyRef = React.useRef<HTMLDivElement | null>(null);
  const addRef = React.useRef<HTMLButtonElement | null>(null);
  const dragRef = React.useRef<DragState | null>(null);
  const flip = React.useRef<{
    tops: Map<string, number>;
    lead?: { id: string; velocity: number };
    focus?: Element | null;
  } | null>(null);
  const seq = React.useRef(0);
  const timers = React.useRef<number[]>([]);
  const scrollRun = React.useRef<AnimationPlaybackControls | null>(null);
  const alive = React.useRef(false);

  React.useEffect(() => {
    alive.current = true;
    const running = runs.current;
    const pending = timers.current;
    return () => {
      alive.current = false;
      for (const r of running.values()) r.stop();
      for (const t of pending) window.clearTimeout(t);
      scrollRun.current?.stop();
    };
  }, []);

  const yOf = (id: string) => {
    let v = ys.get(id);
    if (!v) {
      v = motionValue(0);
      ys.set(id, v);
    }
    return v;
  };
  const run = (id: string, controls: AnimationPlaybackControls | null) => {
    runs.current.get(id)?.stop();
    if (controls) runs.current.set(id, controls);
    else runs.current.delete(id);
  };

  const active = activeRows(entries);
  const count = active.length;
  const atLimit = count >= seats;
  const fieldByKey = new Map(fields.map((f) => [f.key, f]));

  const commit = (next: Entry[]) => {
    setEntries(next);
    onRowsChange?.(activeRows(next));
    if (phase === "sent" || phase === "failed") setPhase("idle");
  };

  const errorFor = (row: AttendeeRow, key: string) => {
    const field = fieldByKey.get(key);
    return field ? checkField(field, row.values[key]) : null;
  };
  const shown = (row: AttendeeRow, key: string) =>
    submitted || touched.has(`${row.id}:${key}`) ? errorFor(row, key) : null;
  const rowValid = (row: AttendeeRow) =>
    fields.every((f) => errorFor(row, f.key) === null);

  /* ------------------------------- focus ------------------------------- */

  const reveal = React.useCallback(
    (id: string) => {
      const body = bodyRef.current;
      const slot = slots.current.get(id);
      if (!body || !slot) return;
      scrollRun.current?.stop();
      // Re-aimed every frame: the slot is still unfolding while we scroll.
      const target = () => {
        const s = slots.current.get(id);
        if (!s) return body.scrollTop;
        const top = s.offsetTop - 8;
        const bottom = s.offsetTop + s.offsetHeight + 64 - body.clientHeight;
        const max = body.scrollHeight - body.clientHeight;
        const want =
          body.scrollTop > top
            ? top
            : body.scrollTop < bottom
              ? bottom
              : body.scrollTop;
        return Math.round(Math.min(Math.max(0, want), Math.max(0, max)));
      };
      if (!motionSafe) {
        body.scrollTop = target();
        return;
      }
      const from = body.scrollTop;
      scrollRun.current = animate(0, 1, {
        ...springs.glide,
        onUpdate: (p) => {
          body.scrollTop = from + (target() - from) * p;
        },
      });
    },
    [motionSafe],
  );

  React.useEffect(() => {
    if (!focusRequest) return;
    const first = fields[0];
    const node = first
      ? inputs.current.get(`${focusRequest.id}:${first.key}`)
      : null;
    node?.focus({ preventScroll: true });
    reveal(focusRequest.id);
  }, [fields, focusRequest, reveal]);

  /* -------------------------------- flip -------------------------------- */

  React.useLayoutEffect(() => {
    const f = flip.current;
    if (!f) return;
    flip.current = null;
    for (const [id, oldTop] of f.tops) {
      const slot = slots.current.get(id);
      if (!slot) continue;
      const v = yOf(id);
      const delta = oldTop - slot.offsetTop;
      run(id, null);
      v.jump(r2(delta));
      if (!motionSafe || Math.abs(delta) < 0.5) {
        v.jump(0);
        continue;
      }
      const lead = f.lead?.id === id ? f.lead : null;
      run(
        id,
        animate(
          v,
          0,
          lead ? { ...springs.snap, velocity: lead.velocity } : springs.glide,
        ),
      );
    }
    // Moving a focused node through the DOM drops its focus; hand it back.
    const keep = f.focus;
    if (
      keep instanceof HTMLElement &&
      keep.isConnected &&
      keep !== document.activeElement
    ) {
      keep.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const visualTops = () => {
    const tops = new Map<string, number>();
    for (const e of entries) {
      const slot = slots.current.get(e.row.id);
      if (slot) tops.set(e.row.id, slot.offsetTop + yOf(e.row.id).get());
    }
    return tops;
  };

  const move = (from: number, to: number) => {
    const next = [...entries];
    const [moved] = next.splice(from, 1);
    if (!moved) return null;
    next.splice(to, 0, moved);
    return { next, moved };
  };

  const reportMove = (next: Entry[], movedId: string) => {
    const before = activeRows(entries);
    const after = activeRows(next);
    const a = before.findIndex((r) => r.id === movedId);
    const b = after.findIndex((r) => r.id === movedId);
    commit(next);
    if (a !== b) onReorder?.(after, a, b);
    const row = after[b];
    if (row) {
      setAnnouncement(
        `${nameOf(row, b)} moved to ${b + 1} of ${after.length}.`,
      );
    }
  };

  const moveByKey = (id: string, dir: -1 | 1) => {
    if (disabled || dragRef.current) return;
    const from = entries.findIndex((e) => e.row.id === id);
    let to = from + dir;
    // Step over rows that are only an undo chip now.
    while (to >= 0 && to < entries.length && entries[to]?.ghost) to += dir;
    if (from < 0 || to < 0 || to >= entries.length) {
      setAnnouncement(dir < 0 ? "Already first." : "Already last.");
      return;
    }
    const result = move(from, to);
    if (!result) return;
    flip.current = { tops: visualTops(), focus: document.activeElement };
    reportMove(result.next, id);
    const body = bodyRef.current;
    const slot = slots.current.get(id);
    if (body && slot) {
      window.requestAnimationFrame(() => {
        const s = slots.current.get(id);
        if (!s || !alive.current) return;
        const top = s.offsetTop - 8;
        const bottom = s.offsetTop + s.offsetHeight + 8 - body.clientHeight;
        if (body.scrollTop > top) body.scrollTop = Math.max(0, top);
        else if (body.scrollTop < bottom) body.scrollTop = bottom;
      });
    }
  };

  /* -------------------------------- drag -------------------------------- */

  const dragStart = (id: string) => {
    const order = entries.map((e) => e.row.id);
    const from = order.indexOf(id);
    if (from < 0) return;
    dragRef.current = {
      id,
      from,
      to: from,
      order,
      tops: order.map((k) => slots.current.get(k)?.offsetTop ?? 0),
      heights: order.map((k) => slots.current.get(k)?.offsetHeight ?? 0),
      scroll0: bodyRef.current?.scrollTop ?? 0,
    };
    for (const k of order) run(k, null);
    setLifted(id);
  };

  const dragMove = (id: string, dy: number) => {
    const g = dragRef.current;
    if (!g || g.id !== id) return;
    const top0 = g.tops[g.from] ?? 0;
    const h = g.heights[g.from] ?? 0;
    const lastIndex = g.order.length - 1;
    const end = (g.tops[lastIndex] ?? 0) + (g.heights[lastIndex] ?? 0);
    // Measured against the list, not the page: a scroll during the drag
    // must not pull the row out from under the finger.
    const raw = dy + ((bodyRef.current?.scrollTop ?? 0) - g.scroll0);
    const offset = rubberClamp(raw, -top0, end - h - top0, Math.max(h, 80));
    yOf(id).set(r2(offset));
    const center = top0 + offset + h / 2;
    let to = 0;
    g.order.forEach((_, k) => {
      if (k === g.from) return;
      if ((g.tops[k] ?? 0) + (g.heights[k] ?? 0) / 2 < center) to++;
    });
    if (to === g.to) return;
    g.to = to;
    g.order.forEach((key, k) => {
      if (k === g.from) return;
      const shift = g.from < k && k <= to ? -h : to <= k && k < g.from ? h : 0;
      const v = yOf(key);
      if (!motionSafe) {
        run(key, null);
        v.jump(shift);
      } else if (v.get() !== shift) {
        run(key, animate(v, shift, springs.glide));
      }
    });
  };

  const dragEnd = (id: string, vy: number) => {
    const g = dragRef.current;
    dragRef.current = null;
    setLifted(null);
    if (!g || g.id !== id) return;
    if (g.to === g.from) {
      run(
        id,
        motionSafe
          ? animate(yOf(id), 0, { ...springs.snap, velocity: vy })
          : null,
      );
      if (!motionSafe) yOf(id).jump(0);
      return;
    }
    const result = move(g.from, g.to);
    if (!result) return;
    flip.current = { tops: visualTops(), lead: { id, velocity: vy } };
    reportMove(result.next, id);
  };

  const dragCancel = () => {
    dragRef.current = null;
    setLifted(null);
    for (const e of entries) {
      const v = yOf(e.row.id);
      if (!motionSafe) {
        run(e.row.id, null);
        v.jump(0);
      } else {
        run(e.row.id, animate(v, 0, springs.glide));
      }
    }
  };

  /* ------------------------------- actions ------------------------------ */

  const add = () => {
    if (disabled) return;
    if (atLimit) {
      setAnnouncement(`All ${seats} seats are taken.`);
      return;
    }
    seq.current += 1;
    const row: AttendeeRow = {
      id: `${uid}-new-${seq.current}`,
      values: Object.fromEntries(
        fields.map((f) => [
          f.key,
          f.kind === "select" && !f.required
            ? (f.options?.[0]?.value ?? "")
            : "",
        ]),
      ),
    };
    const next = [...entries, { row, ghost: false, gone: false, fresh: true }];
    commit(next);
    onAdd?.(row, count);
    setFocusRequest((r) => ({ id: row.id, n: (r?.n ?? 0) + 1 }));
    setAnnouncement(
      `Guest ${count + 1} added. ${seats - count - 1} seats left.`,
    );
  };

  const remove = (id: string) => {
    if (disabled) return;
    const index = activeRows(entries).findIndex((r) => r.id === id);
    const entry = entries.find((e) => e.row.id === id);
    if (!entry || index < 0) return;
    const next = entries.map((e) =>
      e.row.id === id
        ? { ...e, ghost: true, ghostName: nameOf(e.row, index) }
        : e,
    );
    commit(next);
    onRemove?.(entry.row, index);
    setFocusUndo(id);
    setAnnouncement(
      `Removed ${nameOf(entry.row, index)}. Undo is available for ${Math.round(undoMs / 1000)} seconds.`,
    );
  };

  const restore = (id: string) => {
    const next = entries.map((e) =>
      e.row.id === id ? { ...e, ghost: false, gone: false } : e,
    );
    const index = activeRows(next).findIndex((r) => r.id === id);
    const entry = next.find((e) => e.row.id === id);
    if (!entry || index < 0) return;
    commit(next);
    onRestore?.(entry.row, index);
    setFocusUndo(null);
    setFocusRequest((r) => ({ id, n: (r?.n ?? 0) + 1 }));
    setAnnouncement(
      `${nameOf(entry.row, index)} is back as guest ${index + 1}.`,
    );
  };

  const drop = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.row.id !== id));
    ys.delete(id);
    run(id, null);
  };

  const expire = (id: string) => {
    const slot = slots.current.get(id);
    const hadFocus = !!slot && slot.contains(document.activeElement);
    setEntries((prev) =>
      prev.map((e) => (e.row.id === id ? { ...e, gone: true } : e)),
    );
    if (hadFocus) addRef.current?.focus({ preventScroll: true });
    // The slot's own close removes it; this is the backstop if a re-run
    // interrupts that animation.
    timers.current.push(window.setTimeout(() => drop(id), 900));
  };

  const edit = (id: string, key: string, value: string) => {
    dirty.current.add(`${id}:${key}`);
    commit(
      entries.map((e) =>
        e.row.id === id
          ? {
              ...e,
              row: { ...e.row, values: { ...e.row.values, [key]: value } },
            }
          : e,
      ),
    );
  };

  // A field is checked when you leave it after typing in it. Leaving a blank
  // field you never touched says nothing yet: the error line it would open
  // would shift the add button out from under a pointer already on its way.
  const blurField = (id: string, key: string) => {
    const k = `${id}:${key}`;
    if (touched.has(k) || !dirty.current.has(k)) return;
    setTouched((prev) => new Set(prev).add(k));
  };

  const send = () => {
    const snapshot = active;
    setPhase("sending");
    setAnnouncement(
      `Registering ${plural(snapshot.length, "guest", "guests")}.`,
    );
    let result: void | Promise<void> = undefined;
    try {
      result = onSubmit?.(snapshot);
    } catch {
      setPhase("failed");
      setAnnouncement("Couldn't register. Your guests are still here.");
      return;
    }
    Promise.resolve(result).then(
      () => {
        if (!alive.current) return;
        setPhase("sent");
        setAnnouncement(
          `Registered ${plural(snapshot.length, "guest", "guests")}.`,
        );
      },
      () => {
        if (!alive.current) return;
        setPhase("failed");
        setAnnouncement("Couldn't register. Your guests are still here.");
      },
    );
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (disabled || phase === "sending" || status === "loading") return;
    setSubmitted(true);
    const bad = active.filter((row) => !rowValid(row));
    if (count === 0) {
      setAnnouncement("Add at least one guest first.");
      addRef.current?.focus();
      return;
    }
    if (bad.length > 0) {
      const first = bad[0];
      const key = first
        ? fields.find((f) => errorFor(first, f.key))?.key
        : undefined;
      if (first && key) {
        inputs.current.get(`${first.id}:${key}`)?.focus();
      }
      setAnnouncement(
        `${plural(bad.length, "guest needs", "guests need")} fixing: ${bad
          .map((row) => nameOf(row, active.indexOf(row)))
          .join(", ")}.`,
      );
      return;
    }
    send();
  };

  /* The submit button's progress: a slow creep while waiting, a quick finish. */
  const fill = useMotionValue(0);
  React.useEffect(() => {
    if (phase === "sending") {
      fill.jump(0);
      const r = animate(fill, 0.85, {
        duration: motionSafe ? 3 : 1.5,
        ease: [0.12, 0.7, 0.3, 1],
      });
      return () => r.stop();
    }
    const r =
      phase === "sent"
        ? animate(fill, 1, { duration: durations.base, ease: easings.enter })
        : animate(fill, 0, exitFor(durations.slow));
    return () => r.stop();
  }, [fill, motionSafe, phase]);

  const cols = [
    "1.5rem",
    "1.75rem",
    ...fields.map(
      (f) =>
        f.width ??
        (f.kind === "select"
          ? "8.5rem"
          : f.kind === "email"
            ? "minmax(0,1.25fr)"
            : "minmax(0,1fr)"),
    ),
    "2rem",
  ].join(" ");

  const step = cascade(count);
  let guestCursor = 0;

  return (
    <div className={cn("@container w-full", className)}>
      <div
        className="relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground"
        style={
          {
            height,
            "--ar-accent": accent,
            "--ar-cols": cols,
          } as React.CSSProperties
        }
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-hairline px-4 py-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[15px] leading-5 font-semibold">
              {phase === "sent" ? "Registered" : title}
            </h2>
            {event ? (
              <p className="text-[12px] leading-4 text-ink-3">{event}</p>
            ) : null}
          </div>
          <div
            className="flex shrink-0 items-center gap-2"
            aria-label={`${count} of ${seats} seats taken`}
            role="img"
          >
            <span className="flex items-center gap-1">
              {Array.from({ length: seats }, (_, i) => (
                <motion.span
                  key={i}
                  className={cn(
                    "size-2 rounded-full border transition-colors",
                    i < count
                      ? "border-transparent bg-(--ar-accent)"
                      : "border-hairline-strong bg-surface-0",
                  )}
                  initial={false}
                  animate={{ scale: i < count ? 1 : 0.8 }}
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ))}
            </span>
            <span className="font-mono text-[11px] text-ink-2 tabular-nums">
              {count} of {seats} seats
            </span>
          </div>
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
            className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-2 pb-4"
          >
            <p id={hintId} className="sr-only">
              Drag the grip, or press Alt with Up or Down anywhere in the row,
              to move this guest.
            </p>

            {status === "loading" ? (
              <div aria-hidden className="flex flex-col gap-2 pt-2">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="flex items-center gap-2 py-2">
                    <span className="size-6 rounded-full bg-surface-2" />
                    <span
                      className={cn("flex-1 rounded-2 bg-surface-2", d.control)}
                    />
                    <span
                      className={cn(
                        "hidden flex-1 rounded-2 bg-surface-2 @min-[40rem]:block",
                        d.control,
                      )}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div
                  aria-hidden
                  className="sticky top-0 z-20 -mx-4 hidden border-b border-hairline bg-card px-4 py-2 @min-[40rem]:block"
                >
                  <div
                    className={cn(
                      "grid grid-cols-(--ar-cols) items-center gap-x-2 text-[11px] font-medium text-ink-3",
                      rowStyle === "cards"
                        ? "px-[13px]"
                        : rowStyle === "striped"
                          ? "px-2"
                          : "px-1",
                    )}
                  >
                    <span />
                    <span>#</span>
                    {fields.map((f) => (
                      <span key={f.key} className="truncate">
                        {f.label}
                      </span>
                    ))}
                    <span />
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {phase === "failed" || phase === "sent" ? (
                    <motion.div
                      key={phase}
                      initial={{
                        opacity: 0,
                        y: motionSafe ? -distances.nudge : 0,
                      }}
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
                        "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-3 border px-3 py-2.5 text-[12.5px]",
                        phase === "failed"
                          ? "border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_7%,var(--card))]"
                          : "border-[color-mix(in_oklab,var(--ar-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--ar-accent)_7%,var(--card))]",
                      )}
                    >
                      {phase === "failed" ? (
                        <>
                          <CircleAlert
                            aria-hidden
                            className="size-4 shrink-0 text-danger"
                          />
                          <span className="min-w-0 flex-1">
                            Couldn&apos;t register. Your guests are still here.
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
                            className="size-4 shrink-0 text-(--ar-accent)"
                          />
                          <span className="min-w-0 flex-1">
                            {plural(count, "guest is", "guests are")} on the
                            list. Tickets go out by email the week before.
                          </span>
                        </>
                      )}
                    </motion.div>
                  ) : null}
                </AnimatePresence>

                <ol
                  className={cn(
                    "relative mt-2 flex flex-col",
                    rowStyle === "lines" &&
                      "border-t border-hairline @min-[40rem]:border-t-0",
                  )}
                >
                  {entries.map((entry, index) => {
                    const isGuest = !entry.ghost && !entry.gone;
                    const guestIndex = isGuest ? guestCursor++ : -1;
                    const row = entry.row;
                    return (
                      <Row
                        key={row.id}
                        entry={entry}
                        index={index}
                        guestIndex={guestIndex}
                        guestCount={count}
                        fields={fields}
                        uid={uid}
                        d={d}
                        rowStyle={rowStyle}
                        motionSafe={motionSafe}
                        disabled={disabled}
                        y={yOf(row.id)}
                        lifted={lifted === row.id}
                        dragBusy={lifted !== null}
                        shownError={(key) => shown(row, key)}
                        complete={isGuest && rowValid(row)}
                        confirmed={phase === "sent" && isGuest}
                        confirmDelay={Math.max(guestIndex, 0) * step}
                        undoMs={undoMs}
                        focusUndo={focusUndo === row.id}
                        hintId={hintId}
                        onEdit={(key, value) => edit(row.id, key, value)}
                        onBlurField={(key) => blurField(row.id, key)}
                        onRemove={() => remove(row.id)}
                        onUndo={() => restore(row.id)}
                        onExpire={() => expire(row.id)}
                        onGone={() => drop(row.id)}
                        onMoveKey={(dir) => moveByKey(row.id, dir)}
                        onDragStart={() => dragStart(row.id)}
                        onDragMove={(dy) => dragMove(row.id, dy)}
                        onDragEnd={(vy) => dragEnd(row.id, vy)}
                        onDragCancel={dragCancel}
                        bindSlot={(node) => {
                          if (node) slots.current.set(row.id, node);
                          else slots.current.delete(row.id);
                        }}
                        bindInput={(key, node) => {
                          const k = `${row.id}:${key}`;
                          if (node) inputs.current.set(k, node);
                          else inputs.current.delete(k);
                        }}
                      />
                    );
                  })}
                </ol>

                <div className="relative z-10 mt-2 flex flex-col gap-1.5 bg-card">
                  <button
                    ref={addRef}
                    type="button"
                    onClick={add}
                    disabled={disabled}
                    aria-disabled={atLimit || undefined}
                    aria-describedby={atLimit ? reasonId : undefined}
                    className={cn(
                      "inline-flex w-full items-center justify-center gap-2 rounded-3 border border-dashed text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      d.control,
                      atLimit
                        ? "cursor-not-allowed border-hairline text-ink-3 opacity-60"
                        : "border-hairline-strong text-ink-2 hover:border-(--ar-accent) hover:bg-[color-mix(in_oklab,var(--ar-accent)_6%,transparent)] hover:text-foreground",
                      RING,
                    )}
                  >
                    <Plus
                      aria-hidden
                      className={cn(
                        "size-4",
                        atLimit ? "text-ink-3" : "text-(--ar-accent)",
                      )}
                    />
                    Add guest
                  </button>
                  {atLimit ? (
                    <p
                      id={reasonId}
                      className="text-center text-[11.5px] text-ink-3"
                    >
                      All {seats} seats are taken. Remove a guest to add
                      another.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-hairline px-4 py-3">
            <span className="mr-auto hidden text-[12px] text-ink-3 @min-[24rem]:inline">
              {plural(count, "guest", "guests")} ·{" "}
              {plural(Math.max(0, seats - count), "seat", "seats")} left
            </span>
            <button
              type="submit"
              disabled={disabled || status === "loading"}
              aria-disabled={phase === "sending" || undefined}
              aria-busy={phase === "sending" || undefined}
              className={cn(
                "relative inline-flex h-9 items-center justify-center gap-1.5 overflow-hidden rounded-2 bg-foreground px-4 text-[13px] font-medium text-background disabled:cursor-not-allowed disabled:opacity-50",
                RING,
                phase === "sending" && "cursor-progress",
              )}
            >
              <motion.span
                aria-hidden
                className="absolute inset-0 bg-[color-mix(in_oklab,var(--ar-accent)_70%,transparent)]"
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
                  ? "Registering…"
                  : phase === "sent"
                    ? "Registered"
                    : `${submitLabel} ${plural(count, "guest", "guests")}`}
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
