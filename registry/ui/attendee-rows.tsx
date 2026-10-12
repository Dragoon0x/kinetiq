"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  ChevronDown,
  CopyPlus,
  GripVertical,
  Plus,
  RotateCcw,
  Ticket,
  TriangleAlert,
  Users,
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

export type AttendeeTicketType = {
  id: string;
  /** e.g. "Weekend pass". */
  label: string;
  /** Price per attendee, in whole currency units. */
  price: number;
  /** A short note under the name, e.g. "Saturday and Sunday". */
  note?: string;
};

export type AttendeeDiet = { id: string; label: string };

/** One attendee row; `ticket` is a ticket type id, `diet` holds dietary ids. */
export type Attendee = {
  id: string;
  name: string;
  email: string;
  ticket: string;
  diet: string[];
};

export type AttendeeDiscount = {
  /** The group size that earns it. */
  minAttendees: number;
  /** Percent off the subtotal. */
  percent: number;
  /** How the line reads in the summary. @default "Group discount" */
  label?: string;
};

export type AttendeeField = "name" | "email" | "ticket" | "diet";

export type AttendeeChange =
  | { kind: "add"; id: string }
  | { kind: "remove"; id: string }
  | { kind: "edit"; id: string; field: AttendeeField }
  | { kind: "move"; id: string; from: number; to: number }
  | { kind: "copy"; id: string; from: string };

export type AttendeeTotals = {
  /** One line per ticket type, in ticket order, including the unused ones. */
  lines: { ticket: AttendeeTicketType; count: number; amount: number }[];
  subtotal: number;
  /** The amount taken off by the group discount, 0 when it does not apply. */
  discount: number;
  total: number;
  attendees: number;
  /** Rows still missing a name or a usable email. */
  incomplete: number;
};

export type AttendeeSummaryPosition = "side" | "foot";
export type AttendeeDensity = "compact" | "cozy" | "roomy";
export type AttendeeAccent = "cobalt" | "signal" | "success";
export type AttendeeStatus = "ready" | "loading" | "error";

export type AttendeeRowsProps = {
  /** Where the order summary sits: a column beside the rows from a 40rem container (the foot below it), or always at the foot. @default "side" */
  summaryPosition?: AttendeeSummaryPosition;
  /** Row padding, field height and type size. @default "cozy" */
  density?: AttendeeDensity;
  /** The colour of chosen chips, the row in hand and the discount: cobalt, signal or green. @default "cobalt" */
  accent?: AttendeeAccent;
  /** The tickets on sale, with prices. Empty, and the form shows its not-on-sale state. @default defaultAttendeeTicketTypes */
  ticketTypes?: AttendeeTicketType[];
  /** The dietary options each row offers as chips. @default defaultAttendeeDiets */
  diets?: AttendeeDiet[];
  /** Controlled attendee rows. */
  value?: Attendee[];
  /** Initial rows when uncontrolled. @default defaultAttendees */
  defaultValue?: Attendee[];
  /** Fires from every keystroke, press, drag or key that changed the rows, with all of them and the change. */
  onChange?: (value: Attendee[], change: AttendeeChange) => void;
  /** Most attendees one registration may hold; Add is disabled with the reason at the cap. @default 8 */
  max?: number;
  /** The group discount rule, or null for none. @default defaultAttendeeDiscount */
  discount?: AttendeeDiscount | null;
  /** Register was pressed with every row complete. */
  onSubmit?: (attendees: Attendee[], totals: AttendeeTotals) => void;
  /** Printed before amounts. @default "$" */
  currencySymbol?: string;
  /** Whether the ticket types have arrived. @default "ready" */
  status?: AttendeeStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Coldbrook Field Day" */
  title?: string;
  /** Under the heading. @default "Saturday 7 November, Coldbrook Meadows" */
  subtitle?: string;
  /** The submit button. @default "Register" */
  submitLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the form in px; the rows scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be added, edited, moved or removed. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

export const defaultAttendeeTicketTypes: AttendeeTicketType[] = [
  { id: "day", label: "Day pass", price: 42, note: "Saturday only" },
  {
    id: "weekend",
    label: "Weekend pass",
    price: 68,
    note: "Saturday and Sunday",
  },
  {
    id: "camp",
    label: "Weekend and camping",
    price: 95,
    note: "Pitch included",
  },
  { id: "junior", label: "Junior", price: 12, note: "Under 16" },
];

export const defaultAttendeeDiets: AttendeeDiet[] = [
  { id: "veg", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "gf", label: "Gluten free" },
  { id: "nuts", label: "Nut allergy" },
];

/** Three rows from the Fernmoor co-op: two filled in, one still blank. */
export const defaultAttendees: Attendee[] = [
  {
    id: "a1",
    name: "Ines Varga",
    email: "ines@fernmoor.coop",
    ticket: "weekend",
    diet: ["veg"],
  },
  {
    id: "a2",
    name: "Tomas Reyes",
    email: "tomas@fernmoor.coop",
    ticket: "weekend",
    diet: [],
  },
  { id: "a3", name: "", email: "", ticket: "day", diet: [] },
];

export const defaultAttendeeDiscount: AttendeeDiscount = {
  minAttendees: 5,
  percent: 10,
  label: "Group of five or more",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const ACCENTS: Record<AttendeeAccent, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
};

const DENSITY: Record<
  AttendeeDensity,
  {
    pad: string;
    gap: string;
    field: string;
    chip: string;
    text: string;
    labels: boolean;
    summary: string;
  }
> = {
  compact: {
    pad: "p-2",
    gap: "gap-1.5",
    field: "h-7 text-[12px]",
    chip: "h-6 px-2 text-[11px]",
    text: "text-[12px]",
    labels: false,
    summary: "text-[12px]",
  },
  cozy: {
    pad: "p-2.5",
    gap: "gap-2",
    field: "h-8 text-[13px]",
    chip: "h-6.5 px-2.5 text-[11px]",
    text: "text-[13px]",
    labels: true,
    summary: "text-[13px]",
  },
  roomy: {
    pad: "p-3",
    gap: "gap-2.5",
    field: "h-9 text-sm",
    chip: "h-7 px-3 text-xs",
    text: "text-sm",
    labels: true,
    summary: "text-sm",
  },
};

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;
const STRIKE_MS = 220;
const DONE_MS = 2400;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const isEmail = (text: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());

/** A row counts as complete with a name and an email that could be sent to. */
export const isAttendeeComplete = (attendee: Attendee) =>
  attendee.name.trim().length > 0 && isEmail(attendee.email);

/** Totals the tickets by type and applies the group rule, for hosts that show them elsewhere. */
export const computeAttendeeTotals = (
  attendees: Attendee[],
  ticketTypes: AttendeeTicketType[],
  discount: AttendeeDiscount | null,
): AttendeeTotals => {
  const lines = ticketTypes.map((ticket) => {
    const count = attendees.filter((a) => a.ticket === ticket.id).length;
    return { ticket, count, amount: count * ticket.price };
  });
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const earned =
    discount !== null &&
    discount.percent > 0 &&
    attendees.length >= discount.minAttendees;
  const off = earned ? Math.round(subtotal * discount.percent) / 100 : 0;
  return {
    lines,
    subtotal,
    discount: off,
    total: subtotal - off,
    attendees: attendees.length,
    incomplete: attendees.filter((a) => !isAttendeeComplete(a)).length,
  };
};

const money = (symbol: string, amount: number) =>
  `${amount < 0 ? "-" : ""}${symbol}${Math.abs(amount).toFixed(2)}`;

const nameOf = (attendee: Attendee, index: number) =>
  attendee.name.trim() || `Attendee ${index + 1}`;

/* ----------------------------------------------------------------------- */
/*                               Rolling text                               */
/* ----------------------------------------------------------------------- */

/** Each digit rolls to its new value on `springs.snap`; symbols stay put. */
function Roll({
  text,
  motionSafe,
  className,
}: {
  text: string;
  motionSafe: boolean;
  className?: string;
}) {
  const chars = text.split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      {/* Gives the row a text baseline, so a word beside it lines up. */}
      <span className="invisible w-0">0</span>
      {chars.map((c, i) => {
        // Keyed from the right, so "9.00" growing to "10.00" rolls its
        // units and tens rather than remounting every column.
        const slot = chars.length - 1 - i;
        if (!/\d/.test(c)) return <span key={`${slot}-${c}`}>{c}</span>;
        return (
          <span
            key={slot}
            className="relative inline-block overflow-hidden"
            style={{ width: "1ch", height: `${DIGIT_H}em` }}
          >
            <motion.span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              initial={false}
              animate={{ y: `${-r3(Number(c) * DIGIT_H)}em` }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              {DIGITS.map((n) => (
                <span key={n} style={{ height: `${DIGIT_H}em` }}>
                  {n}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Diet chip                                 */
/* ----------------------------------------------------------------------- */

function DietChip({
  label,
  pressed,
  tabIndex,
  disabled,
  motionSafe,
  chipClass,
  nodeRef,
  onToggle,
  onFocus,
  onNav,
}: {
  label: string;
  pressed: boolean;
  tabIndex: number;
  disabled: boolean;
  motionSafe: boolean;
  chipClass: string;
  nodeRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
}) {
  return (
    <button
      ref={nodeRef}
      type="button"
      tabIndex={tabIndex}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      onFocus={onFocus}
      onClick={onToggle}
      onKeyDown={onNav}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border font-medium whitespace-nowrap transition-colors",
        chipClass,
        pressed
          ? "border-[color-mix(in_oklab,var(--ar-accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--ar-accent)_12%,transparent)] text-(--ar-accent-ink)"
          : "border-hairline-strong text-ink-2",
        disabled
          ? "cursor-not-allowed"
          : pressed
            ? "cursor-pointer"
            : "cursor-pointer hover:bg-surface-2 hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <span className="flex size-3 shrink-0 items-center justify-center">
        {pressed ? (
          <svg aria-hidden viewBox="0 0 14 14" className="size-3">
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
        ) : (
          <Plus aria-hidden className="size-2.5 text-ink-3" />
        )}
      </span>
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Row                                    */
/* ----------------------------------------------------------------------- */

type RowProps = {
  attendee: Attendee;
  index: number;
  count: number;
  ticketTypes: AttendeeTicketType[];
  diets: AttendeeDiet[];
  density: AttendeeDensity;
  symbol: string;
  motionSafe: boolean;
  /** Fades and rises in when it mounts: a row that was just added. */
  enter: boolean;
  leaving: boolean;
  dragged: boolean;
  settling: boolean;
  dragY: MotionValue<number>;
  flashSeq: number;
  disabled: boolean;
  uid: string;
  nodeRef: (node: HTMLLIElement | null) => void;
  fieldRef: (key: string, node: HTMLElement | null) => void;
  onEdit: (field: AttendeeField, next: Partial<Attendee>) => void;
  onRemove: () => void;
  onCopy: () => void;
  onMove: (dir: -1 | 1) => void;
  onHandlePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onHandlePointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onHandlePointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onDragCancel: () => void;
};

function AttendeeRow({
  attendee,
  index,
  count,
  ticketTypes,
  diets,
  density,
  symbol,
  motionSafe,
  enter,
  leaving,
  dragged,
  settling,
  dragY,
  flashSeq,
  disabled,
  uid,
  nodeRef,
  fieldRef,
  onEdit,
  onRemove,
  onCopy,
  onMove,
  onHandlePointerDown,
  onHandlePointerMove,
  onHandlePointerUp,
  onDragCancel,
}: RowProps) {
  const d = DENSITY[density];
  const rowId = `${uid}-${attendee.id}`;
  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const ticket = ticketTypes.find((t) => t.id === attendee.ticket);
  const inHand = dragged || settling;

  const chipKeys = diets.map((x) => x.id);
  const activeKey =
    activeChip && chipKeys.includes(activeChip)
      ? activeChip
      : (chipKeys[0] ?? null);

  const onChipNav = (event: React.KeyboardEvent, key: string) => {
    // Alt with an arrow belongs to the row: it moves the attendee.
    if (event.altKey) return;
    const i = chipKeys.indexOf(key);
    let to = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = chipKeys.length - 1;
    else return;
    event.preventDefault();
    const target = chipKeys[clamp(to, 0, chipKeys.length - 1)];
    if (target) chipNodes.current.get(target)?.focus();
  };

  const toggleDiet = (id: string) => {
    if (disabled) return;
    const next = attendee.diet.includes(id)
      ? attendee.diet.filter((x) => x !== id)
      : [...attendee.diet, id];
    onEdit("diet", { diet: next });
  };

  /** Alt+Up/Down anywhere in the row moves it, so a hand never leaves a field. */
  const onRowKeyDown = (event: React.KeyboardEvent) => {
    if (!event.altKey) return;
    // Alt+Down opens a native select on some platforms; leave it that.
    if ((event.target as HTMLElement | null)?.tagName === "SELECT") return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      onMove(event.key === "ArrowUp" ? -1 : 1);
    }
  };

  const fieldClass = cn(
    "w-full min-w-0 rounded-2 border border-hairline-strong bg-background px-2.5 text-foreground transition-colors placeholder:text-ink-3 disabled:cursor-not-allowed disabled:opacity-60",
    d.field,
    FOCUS_RING,
  );
  const labelClass = cn(
    "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
    !d.labels && "sr-only",
  );

  const wash = (order: number) =>
    flashSeq > 0 ? (
      <motion.span
        key={flashSeq}
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--ar-accent)_18%,transparent)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{
          duration: durations.slow,
          delay: motionSafe ? r3(cascade(3) * order) : 0,
          ease: easings.enter,
          times: [0, 0.3, 1],
        }}
      />
    ) : null;

  return (
    <motion.li
      ref={nodeRef}
      data-dragged={dragged || undefined}
      layout={motionSafe && !inHand ? "position" : false}
      initial={
        enter ? { opacity: 0, y: motionSafe ? distances.step : 0 } : false
      }
      // While in hand, y belongs to the drag value, not to the animation.
      animate={inHand ? { opacity: 1 } : { opacity: leaving ? 0.55 : 1, y: 0 }}
      exit={{
        opacity: 0,
        x: motionSafe ? -distances.shift : 0,
        transition: exitFor(durations.base),
      }}
      transition={{
        layout: springs.glide,
        y: motionSafe ? springs.glide : { duration: 0 },
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      style={{ y: inHand ? dragY : 0 }}
      onKeyDown={onRowKeyDown}
      className={cn("relative", inHand && "z-10")}
    >
      <div
        className={cn(
          "relative flex flex-col rounded-3 border bg-surface-0 transition-[box-shadow,border-color] duration-200",
          d.pad,
          d.gap,
          inHand
            ? "border-[color-mix(in_oklab,var(--ar-accent)_45%,var(--hairline-strong))] shadow-[0_12px_30px_-12px_color-mix(in_oklab,black_45%,transparent)]"
            : "border-hairline",
        )}
      >
        <div className="relative flex items-center gap-1.5">
          <button
            ref={(node) => fieldRef(`${attendee.id}:handle`, node)}
            type="button"
            aria-label={`Reorder ${nameOf(attendee, index)}, position ${index + 1} of ${count}`}
            aria-describedby={`${uid}-hint`}
            aria-disabled={disabled || undefined}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                // Handled here, with or without Alt; the row must not
                // move a second time when the key reaches it.
                event.preventDefault();
                event.stopPropagation();
                onMove(event.key === "ArrowUp" ? -1 : 1);
              } else if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                onRemove();
              } else if (event.key === "Escape" && dragged) {
                event.preventDefault();
                onDragCancel();
              }
            }}
            className={cn(
              "flex size-6 shrink-0 touch-none items-center justify-center rounded-2 text-ink-3 transition-colors select-none",
              disabled
                ? "cursor-not-allowed"
                : dragged
                  ? "cursor-grabbing bg-surface-2 text-foreground"
                  : "cursor-grab hover:bg-surface-2 hover:text-foreground",
              FOCUS_RING,
            )}
          >
            <GripVertical aria-hidden className="size-3.5" />
          </button>
          <span
            aria-hidden
            className={cn(
              "flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] tabular-nums transition-colors",
              inHand
                ? "bg-(--ar-accent) text-primary-foreground"
                : "bg-surface-2 text-ink-2",
            )}
          >
            {index + 1}
          </span>
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-medium text-foreground",
              d.text,
            )}
          >
            <span className="sr-only">Attendee {index + 1}: </span>
            {attendee.name.trim() || `Attendee ${index + 1}`}
            {ticket ? (
              <span className="font-mono text-[11px] font-normal text-ink-3 tabular-nums">
                {" "}
                {money(symbol, ticket.price)}
              </span>
            ) : null}
          </p>
          {index > 0 ? (
            <button
              type="button"
              onClick={onCopy}
              aria-disabled={disabled || undefined}
              aria-label={`Copy ticket and dietary needs from attendee ${index}`}
              title="Copy from above"
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors",
                disabled
                  ? "cursor-not-allowed"
                  : "hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <CopyPlus aria-hidden className="size-3.5" />
              <span className="hidden @min-[30rem]/rows:inline">
                Copy from above
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            aria-disabled={disabled || undefined}
            aria-label={`Remove ${nameOf(attendee, index)}`}
            className={cn(
              "inline-flex size-6 shrink-0 items-center justify-center rounded-2 text-ink-3 transition-colors",
              disabled
                ? "cursor-not-allowed"
                : "hover:bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] hover:text-danger",
              FOCUS_RING,
            )}
          >
            <X aria-hidden className="size-3.5" />
          </button>
          {leaving ? (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-8 left-8 h-px bg-danger"
              style={{ originX: 0 }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={springs.flick}
            />
          ) : null}
        </div>

        <div
          className={cn(
            "grid grid-cols-1 @min-[22rem]/rows:grid-cols-2 @min-[30rem]/rows:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(9rem,11rem)]",
            d.gap,
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={`${rowId}-name`} className={labelClass}>
              Name
            </label>
            <input
              ref={(node) => fieldRef(`${attendee.id}:name`, node)}
              id={`${rowId}-name`}
              type="text"
              autoComplete="off"
              value={attendee.name}
              placeholder="Full name"
              aria-label={d.labels ? undefined : `Attendee ${index + 1} name`}
              disabled={disabled}
              onChange={(event) =>
                onEdit("name", { name: event.currentTarget.value })
              }
              className={fieldClass}
            />
          </div>
          <div className="relative flex min-w-0 flex-col gap-1">
            <label htmlFor={`${rowId}-email`} className={labelClass}>
              Email
            </label>
            <span className="relative block">
              <input
                ref={(node) => fieldRef(`${attendee.id}:email`, node)}
                id={`${rowId}-email`}
                type="email"
                autoComplete="off"
                value={attendee.email}
                placeholder="name@example.org"
                aria-label={
                  d.labels ? undefined : `Attendee ${index + 1} email`
                }
                aria-invalid={
                  attendee.email.trim() !== "" && !isEmail(attendee.email)
                    ? true
                    : undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  onEdit("email", { email: event.currentTarget.value })
                }
                className={cn(
                  fieldClass,
                  attendee.email.trim() !== "" &&
                    !isEmail(attendee.email) &&
                    "border-[color-mix(in_oklab,var(--danger)_55%,var(--hairline-strong))]",
                )}
              />
              {wash(0)}
            </span>
          </div>
          <div className="relative flex min-w-0 flex-col gap-1 @min-[22rem]/rows:col-span-2 @min-[30rem]/rows:col-span-1">
            <label htmlFor={`${rowId}-ticket`} className={labelClass}>
              Ticket
            </label>
            <span className="relative block">
              <select
                id={`${rowId}-ticket`}
                value={attendee.ticket}
                aria-label={
                  d.labels ? undefined : `Attendee ${index + 1} ticket`
                }
                disabled={disabled}
                onChange={(event) =>
                  onEdit("ticket", { ticket: event.currentTarget.value })
                }
                className={cn(
                  fieldClass,
                  "cursor-pointer appearance-none pr-8 [&>option]:bg-popover [&>option]:text-foreground",
                )}
              >
                {ticketTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {`${t.label}, ${money(symbol, t.price)}`}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden
                className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-ink-3"
              />
              {wash(1)}
            </span>
          </div>
        </div>

        <div
          role="group"
          aria-label={`Dietary needs for ${nameOf(attendee, index)}`}
          className="relative flex min-w-0 flex-wrap items-center gap-1.5"
        >
          <span className={cn(labelClass, "mr-0.5")}>Dietary</span>
          {diets.map((diet) => (
            <DietChip
              key={diet.id}
              label={diet.label}
              pressed={attendee.diet.includes(diet.id)}
              tabIndex={activeKey === diet.id ? 0 : -1}
              disabled={disabled}
              motionSafe={motionSafe}
              chipClass={d.chip}
              nodeRef={(node) => {
                if (node) chipNodes.current.set(diet.id, node);
                else chipNodes.current.delete(diet.id);
              }}
              onToggle={() => toggleDiet(diet.id)}
              onFocus={() => setActiveChip(diet.id)}
              onNav={(event) => onChipNav(event, diet.id)}
            />
          ))}
          {diets.length === 0 ? (
            <span className="text-[11px] text-ink-3">None to choose</span>
          ) : null}
          {wash(2)}
        </div>
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Summary                                  */
/* ----------------------------------------------------------------------- */

function Summary({
  totals,
  discount,
  symbol,
  density,
  position,
  motionSafe,
  submitLabel,
  done,
  inert,
  uid,
  onSubmit,
}: {
  totals: AttendeeTotals;
  discount: AttendeeDiscount | null;
  symbol: string;
  density: AttendeeDensity;
  position: AttendeeSummaryPosition;
  motionSafe: boolean;
  submitLabel: string;
  done: number;
  inert: boolean;
  uid: string;
  onSubmit: () => void;
}) {
  const d = DENSITY[density];
  const used = totals.lines.filter((line) => line.count > 0);
  const canSubmit = !inert && totals.attendees > 0 && totals.incomplete === 0;
  const reason =
    totals.attendees === 0
      ? "Add an attendee to register."
      : totals.incomplete > 0
        ? `${totals.incomplete} ${totals.incomplete === 1 ? "row needs" : "rows need"} a name and email.`
        : null;
  const side = position === "side";

  const lines = (
    <ul role="list" aria-label="Tickets" className="flex flex-col gap-1">
      <AnimatePresence initial={false} mode="popLayout">
        {used.map((line) => (
          <motion.li
            key={line.ticket.id}
            layout={motionSafe ? "position" : false}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{
              layout: springs.glide,
              y: motionSafe ? springs.glide : { duration: 0 },
              opacity: { duration: durations.base, ease: easings.enter },
            }}
            className={cn(
              "flex items-baseline justify-between gap-3",
              d.summary,
            )}
          >
            <span className="min-w-0 truncate text-ink-2">
              <span className="font-mono text-ink-3 tabular-nums">
                {line.count} x
              </span>{" "}
              {line.ticket.label}
            </span>
            <span className="sr-only">{money(symbol, line.amount)}</span>
            <Roll
              text={money(symbol, line.amount)}
              motionSafe={motionSafe}
              className="shrink-0 font-mono text-foreground"
            />
          </motion.li>
        ))}
      </AnimatePresence>
      {used.length === 0 ? (
        <li className={cn("text-ink-3", d.summary)}>No tickets chosen yet.</li>
      ) : null}
    </ul>
  );

  const totalsBlock = (
    <div className="flex flex-col gap-1.5">
      {discount ? (
        <div
          className={cn(
            "flex items-baseline justify-between gap-3 text-ink-3",
            d.summary,
          )}
        >
          <span>Subtotal</span>
          <span className="sr-only">{money(symbol, totals.subtotal)}</span>
          <Roll
            text={money(symbol, totals.subtotal)}
            motionSafe={motionSafe}
            className="font-mono"
          />
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {totals.discount > 0 && discount ? (
          <motion.div
            key="discount"
            initial={{
              opacity: 0,
              scale: motionSafe ? 0.9 : 1,
              y: motionSafe ? distances.step : 0,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={
              motionSafe
                ? { ...springs.recoil, opacity: { duration: durations.fast } }
                : { duration: durations.fast }
            }
            style={{ originX: 1 }}
            className={cn(
              "flex items-baseline justify-between gap-3 rounded-2 border border-[color-mix(in_oklab,var(--ar-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--ar-accent)_10%,transparent)] px-2 py-1 text-(--ar-accent-ink)",
              d.summary,
            )}
          >
            <span className="min-w-0 truncate">
              {discount.label ?? "Group discount"}
              <span className="font-mono text-[11px] tabular-nums opacity-80">
                {" "}
                {discount.percent}% off
              </span>
            </span>
            <span className="sr-only">
              minus {money(symbol, totals.discount)}
            </span>
            <Roll
              text={money(symbol, -totals.discount)}
              motionSafe={motionSafe}
              className="shrink-0 font-mono"
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="flex items-baseline justify-between gap-3 border-t border-hairline-strong pt-1.5">
        <span className={cn("font-medium text-foreground", d.summary)}>
          Total
        </span>
        <span className="sr-only">{money(symbol, totals.total)}</span>
        <Roll
          text={money(symbol, totals.total)}
          motionSafe={motionSafe}
          className="font-mono text-[15px] font-semibold text-foreground"
        />
      </div>
      <p className="text-[11px] text-ink-3">
        {totals.attendees} {totals.attendees === 1 ? "attendee" : "attendees"}
        {discount && totals.discount === 0 && totals.attendees > 0
          ? ` · ${Math.max(0, discount.minAttendees - totals.attendees)} more for ${discount.percent}% off`
          : ""}
      </p>
    </div>
  );

  const action = (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSubmit}
          aria-disabled={!canSubmit || undefined}
          aria-describedby={reason ? `${uid}-reason` : undefined}
          className={cn(
            "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-2 px-3 text-[13px] font-medium transition-colors",
            canSubmit
              ? "bg-primary text-primary-foreground hover:opacity-90"
              : "cursor-not-allowed bg-surface-2 text-ink-3",
            FOCUS_RING,
          )}
        >
          <Ticket aria-hidden className="size-3.5" />
          {submitLabel}
        </button>
        <AnimatePresence>
          {done > 0 ? (
            <motion.span
              key={done}
              aria-hidden
              initial={{
                opacity: 0,
                scale: motionSafe ? 0.6 : 1,
                y: motionSafe ? distances.nudge : 0,
              }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.recoil, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-2 border border-[color-mix(in_oklab,var(--success)_45%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] px-2 text-[11px] font-medium text-success"
            >
              <Check aria-hidden className="size-3.5" />
              Sent
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      {reason ? (
        <p id={`${uid}-reason`} className="text-[11px] text-ink-3">
          {reason}
        </p>
      ) : null}
    </div>
  );

  return (
    <section
      aria-labelledby={`${uid}-summary`}
      className={cn(
        "shrink-0 border-t border-hairline bg-surface-1",
        side &&
          "@min-[40rem]:w-[16rem] @min-[40rem]:overflow-y-auto @min-[40rem]:border-t-0 @min-[40rem]:border-l",
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-3 p-3",
          side
            ? "@min-[40rem]:gap-4 @min-[40rem]:p-4"
            : "@min-[40rem]:grid @min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)] @min-[40rem]:gap-x-8",
        )}
      >
        <div className="flex flex-col gap-2">
          <p
            id={`${uid}-summary`}
            className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
          >
            Order summary
          </p>
          {lines}
        </div>
        <div className="flex flex-col gap-3">
          {totalsBlock}
          {action}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

type DragState = {
  id: string;
  pointerId: number;
  startY: number;
  /** The dragged row's top and height when the drag began, in client px. */
  top: number;
  height: number;
  /** Every other row stacked with the dragged one lifted out, in order. */
  others: { id: string; top: number; height: number }[];
  gap: number;
  from: number;
  index: number;
  listTop: number;
  listBottom: number;
};

type FocusReq = { key: string; seq: number };

/**
 * A registration form of repeatable attendee rows. Add attendee appends a
 * row that rises in on `springs.glide` with its name field focused; Remove
 * strikes the row through on `springs.flick`, then it slides out on the exit
 * ease while the rows below close up on glide. Each row can be dragged by
 * its handle — the row in hand follows the pointer, the others glide out of
 * its way as it passes them, and on release it glides into its slot — or
 * moved with Alt+Up and Alt+Down from any of its fields. Copy from above
 * fills a row's ticket, dietary needs and email domain in a short cascade of
 * washes.
 *
 * The order summary beside the rows (at the foot when the container is
 * narrower than 40rem, or always when `summaryPosition` is "foot") totals
 * the tickets by type with rolling digits on `springs.snap`, and at five
 * attendees the group discount lands on `springs.recoil`. A cap (eight by
 * default) disables Add with its reason.
 *
 * The rows are a list with native form semantics inside; the handle takes
 * Up and Down to move, Delete to remove, and the dietary chips in each row
 * are one roving group. Under reduced motion nothing rises, slides, rolls or
 * glides: rows appear and leave in place, reorders are instant, and every
 * change is still announced.
 */
export function AttendeeRows({
  summaryPosition = "side",
  density = "cozy",
  accent = "cobalt",
  ticketTypes = defaultAttendeeTicketTypes,
  diets = defaultAttendeeDiets,
  value,
  defaultValue = defaultAttendees,
  onChange,
  max = 8,
  discount = defaultAttendeeDiscount,
  onSubmit,
  currencySymbol = "$",
  status = "ready",
  onRetry,
  title = "Coldbrook Field Day",
  subtitle = "Saturday 7 November, Coldbrook Meadows",
  submitLabel = "Register",
  label,
  height = 540,
  disabled = false,
  className,
}: AttendeeRowsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [own, setOwn] = React.useState<Attendee[]>(defaultValue);
  const rows = value ?? own;
  const ready = status === "ready";
  const onSale = ticketTypes.length > 0;
  const inert = disabled || !ready || !onSale;

  const [leaving, setLeaving] = React.useState<string | null>(null);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [settlingId, setSettlingId] = React.useState<string | null>(null);
  const [dragOrder, setDragOrder] = React.useState<string[] | null>(null);
  const [flash, setFlash] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [done, setDone] = React.useState(0);
  const [focusReq, setFocusReq] = React.useState<FocusReq | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so rows already on the page
  // never rise in; true for rows that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const dragY = useMotionValue(0);
  const dragRef = React.useRef<DragState | null>(null);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  const rowNodes = React.useRef(new Map<string, HTMLLIElement>());
  const fieldNodes = React.useRef(new Map<string, HTMLElement>());
  const listRef = React.useRef<HTMLDivElement | null>(null);
  const strikeTimer = React.useRef<number | null>(null);
  const doneTimer = React.useRef<number | null>(null);
  const pendingRemove = React.useRef<string | null>(null);
  const idSeq = React.useRef(0);
  // The rows as last rendered, for the strike timer that lands a removal.
  const rowsRef = React.useRef(rows);
  React.useEffect(() => {
    rowsRef.current = rows;
  });

  React.useEffect(
    () => () => {
      if (strikeTimer.current !== null)
        window.clearTimeout(strikeTimer.current);
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
      settle.current?.stop();
    },
    [],
  );

  /* -------------------------------- data ------------------------------- */

  const order =
    dragOrder && dragOrder.length === rows.length
      ? dragOrder
          .map((id) => rows.find((r) => r.id === id))
          .filter((r): r is Attendee => r !== undefined)
      : rows;
  const totals = computeAttendeeTotals(rows, ticketTypes, discount);
  const atMax = rows.length >= max;
  const capReason = `Groups are capped at ${max} ${max === 1 ? "attendee" : "attendees"}.`;

  /* ------------------------------- changes ----------------------------- */

  const apply = (next: Attendee[], change: AttendeeChange) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, change);
    const before = totals.discount;
    const after = computeAttendeeTotals(next, ticketTypes, discount).discount;
    if (discount && before === 0 && after > 0) {
      return ` Group discount applied, ${discount.percent}% off.`;
    }
    if (discount && before > 0 && after === 0) {
      return " Group discount no longer applies.";
    }
    return "";
  };

  const announce = (text: string) => setAnnouncement(text);

  const requestFocus = (key: string) =>
    setFocusReq((f) => ({ key, seq: (f?.seq ?? 0) + 1 }));

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    fieldNodes.current.get(focusReq.key)?.focus({ preventScroll: false });
  }, [focusReq]);

  const newId = () => {
    let id = "";
    do {
      idSeq.current += 1;
      id = `att-${idSeq.current}`;
    } while (rows.some((r) => r.id === id));
    return id;
  };

  const add = () => {
    if (inert || atMax) return;
    const id = newId();
    const next: Attendee[] = [
      ...rows,
      { id, name: "", email: "", ticket: ticketTypes[0]?.id ?? "", diet: [] },
    ];
    const tail = apply(next, { kind: "add", id });
    announce(`Attendee ${next.length} added. ${next.length} of ${max}.${tail}`);
    requestFocus(`${id}:name`);
  };

  const edit = (id: string, field: AttendeeField, patch: Partial<Attendee>) => {
    if (inert) return;
    const next = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
    const tail = apply(next, { kind: "edit", id, field });
    if (field === "ticket") {
      const t = ticketTypes.find((x) => x.id === patch.ticket);
      const i = rows.findIndex((r) => r.id === id);
      const row = rows[i];
      if (t && row) {
        announce(
          `${nameOf(row, i)}: ${t.label}, ${money(currencySymbol, t.price)}. Total ${money(currencySymbol, computeAttendeeTotals(next, ticketTypes, discount).total)}.${tail}`,
        );
      }
    } else if (field === "diet") {
      const i = rows.findIndex((r) => r.id === id);
      const row = next[i];
      if (row) {
        const names = row.diet
          .map((d) => diets.find((x) => x.id === d)?.label)
          .filter(Boolean)
          .join(", ");
        announce(`${nameOf(row, i)}: ${names || "no dietary needs"}.`);
      }
    }
  };

  const commitRemove = (id: string, base: Attendee[]) => {
    const i = base.findIndex((r) => r.id === id);
    const row = base[i];
    if (!row) return base;
    const next = base.filter((r) => r.id !== id);
    const tail = apply(next, { kind: "remove", id });
    announce(
      `${nameOf(row, i)} removed. ${next.length} ${next.length === 1 ? "attendee" : "attendees"}.${tail}`,
    );
    const neighbour = next[i] ?? next[i - 1];
    requestFocus(neighbour ? `${neighbour.id}:handle` : "add");
    return next;
  };

  const remove = (id: string) => {
    if (inert) return;
    let base = rows;
    if (pendingRemove.current) {
      // A second removal lands the first at once rather than queueing.
      if (strikeTimer.current !== null)
        window.clearTimeout(strikeTimer.current);
      strikeTimer.current = null;
      const first = pendingRemove.current;
      pendingRemove.current = null;
      setLeaving(null);
      base = commitRemove(first, base);
      if (first === id) return;
    }
    if (!motionSafe) {
      commitRemove(id, base);
      return;
    }
    pendingRemove.current = id;
    setLeaving(id);
    strikeTimer.current = window.setTimeout(() => {
      strikeTimer.current = null;
      pendingRemove.current = null;
      setLeaving(null);
      commitRemove(id, rowsRef.current);
    }, STRIKE_MS);
  };

  const move = (id: string, dir: -1 | 1) => {
    if (inert || dragRef.current) return;
    const from = rows.findIndex((r) => r.id === id);
    const to = from + dir;
    const row = rows[from];
    if (!row || to < 0 || to >= rows.length) return;
    const next = [...rows];
    next.splice(from, 1);
    next.splice(to, 0, row);
    apply(next, { kind: "move", id, from, to });
    announce(
      `Moved ${nameOf(row, from)} to position ${to + 1} of ${rows.length}.`,
    );
  };

  const copyFromAbove = (id: string) => {
    if (inert) return;
    const i = rows.findIndex((r) => r.id === id);
    const row = rows[i];
    const prev = rows[i - 1];
    if (!row || !prev) return;
    const at = prev.email.indexOf("@");
    const domain = at >= 0 ? prev.email.slice(at) : "";
    const next = rows.map((r) =>
      r.id === id
        ? {
            ...r,
            ticket: prev.ticket,
            diet: [...prev.diet],
            email: r.email.trim() === "" && domain ? domain : r.email,
          }
        : r,
    );
    const tail = apply(next, { kind: "copy", id, from: prev.id });
    setFlash((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
    const t = ticketTypes.find((x) => x.id === prev.ticket);
    announce(
      `Copied ${t ? t.label : "the ticket"} and dietary needs from ${nameOf(prev, i - 1)}.${tail}`,
    );
  };

  const submit = () => {
    if (inert || rows.length === 0 || totals.incomplete > 0) return;
    onSubmit?.(rows, totals);
    setDone((n) => n + 1);
    announce(
      `Registered ${rows.length} ${rows.length === 1 ? "attendee" : "attendees"} for ${title}. Total ${money(currencySymbol, totals.total)}.`,
    );
    if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(() => {
      doneTimer.current = null;
      setDone(0);
    }, DONE_MS);
  };

  /* -------------------------------- drag ------------------------------- */

  const capture = (element: Element, pointerId: number) => {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      // No live pointer to capture.
    }
  };

  const release = (element: Element, pointerId: number) => {
    try {
      if (element.hasPointerCapture(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {
      // Already released, or never captured.
    }
  };

  const onHandlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    id: string,
  ) => {
    if (inert || event.button !== 0 || dragRef.current || leaving) return;
    const list = listRef.current;
    const rects = rows
      .map((r) => ({
        id: r.id,
        rect: rowNodes.current.get(r.id)?.getBoundingClientRect(),
      }))
      .filter((x): x is { id: string; rect: DOMRect } => x.rect !== undefined);
    const me = rects.find((x) => x.id === id);
    if (!me || !list) return;
    const first = rects[0];
    const second = rects[1];
    const gap =
      first && second ? Math.max(0, second.rect.top - first.rect.bottom) : 8;
    // Every other row stacked from the top with this one lifted out: the
    // slots the row in hand can land in, fixed for the whole drag.
    let y = first?.rect.top ?? me.rect.top;
    const others = rects
      .filter((x) => x.id !== id)
      .map((x) => {
        const slot = { id: x.id, top: y, height: x.rect.height };
        y += x.rect.height + gap;
        return slot;
      });
    const from = rects.findIndex((x) => x.id === id);
    const lr = list.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    capture(event.currentTarget, event.pointerId);
    settle.current?.stop();
    dragY.set(0);
    dragRef.current = {
      id,
      pointerId: event.pointerId,
      startY: event.clientY,
      top: me.rect.top,
      height: me.rect.height,
      others,
      gap,
      from,
      index: from,
      listTop: Math.max(lr.top, first?.rect.top ?? lr.top),
      listBottom: lr.bottom,
    };
    setSettlingId(null);
    setDragId(id);
  };

  const slotTop = (d: DragState, index: number) => {
    const first = d.others[0];
    const base = first ? first.top : d.top;
    let top = base;
    for (let k = 0; k < index; k += 1) {
      top += (d.others[k]?.height ?? 0) + d.gap;
    }
    return top;
  };

  const onHandlePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const d = dragRef.current;
    if (!d || event.pointerId !== d.pointerId) return;
    const raw = d.top + (event.clientY - d.startY);
    const top = clamp(
      raw,
      Math.min(d.listTop, d.top),
      Math.max(d.listBottom - d.height, d.top),
    );
    const centre = top + d.height / 2;
    // The row in hand sits after another row once its centre has passed the
    // midpoint of that row's two possible places: before and after the gap
    // the row in hand would open.
    let index = 0;
    for (const o of d.others) {
      if (centre > o.top + o.height / 2 + (d.height + d.gap) / 2) index += 1;
    }
    if (index !== d.index) {
      d.index = index;
      const ids = d.others.map((o) => o.id);
      ids.splice(index, 0, d.id);
      setDragOrder(ids);
    }
    dragY.set(top - slotTop(d, index));
  };

  const endDrag = (
    event: React.PointerEvent<HTMLButtonElement> | null,
    cancel: boolean,
  ) => {
    const d = dragRef.current;
    if (!d) return;
    if (event) {
      if (event.pointerId !== d.pointerId) return;
      release(event.currentTarget, event.pointerId);
    }
    dragRef.current = null;
    const to = cancel ? d.from : d.index;
    const row = rows.find((r) => r.id === d.id);
    if (!cancel && to !== d.from && row) {
      const ids = d.others.map((o) => o.id);
      ids.splice(to, 0, d.id);
      const next = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is Attendee => r !== undefined);
      apply(next, { kind: "move", id: d.id, from: d.from, to });
      announce(
        `Moved ${nameOf(row, d.from)} to position ${to + 1} of ${rows.length}.`,
      );
    } else if (row) {
      announce(
        cancel
          ? `Reorder cancelled. ${nameOf(row, d.from)} stays at position ${d.from + 1}.`
          : `${nameOf(row, d.from)} stays at position ${d.from + 1}.`,
      );
    }
    setDragOrder(null);
    setDragId(null);
    // The row in hand glides the rest of the way into its slot.
    const current = dragY.get();
    const target = cancel
      ? current - (slotTop(d, d.from) - slotTop(d, d.index))
      : current;
    if (cancel) dragY.set(target);
    if (motionSafe && Math.abs(dragY.get()) > 0.5) {
      setSettlingId(d.id);
      settle.current = animate(dragY, 0, {
        ...springs.glide,
        onComplete: () => {
          settle.current = null;
          setSettlingId(null);
        },
      });
    } else {
      dragY.set(0);
      setSettlingId(null);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const fieldRef = (key: string, node: HTMLElement | null) => {
    if (node) fieldNodes.current.set(key, node);
    else fieldNodes.current.delete(key);
  };

  const addButton = (where: "head" | "foot") => (
    <button
      ref={where === "head" ? (node) => fieldRef("add", node) : undefined}
      type="button"
      onClick={add}
      aria-disabled={inert || atMax || undefined}
      aria-describedby={atMax ? `${uid}-cap` : undefined}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border px-2.5 text-xs font-medium transition-colors",
        inert || atMax
          ? "cursor-not-allowed border-hairline text-ink-3"
          : where === "head"
            ? "border-transparent bg-primary text-primary-foreground hover:opacity-90"
            : "border-hairline-strong text-ink-2 hover:bg-surface-2 hover:text-foreground",
        FOCUS_RING,
      )}
    >
      <Plus aria-hidden className="size-3.5" />
      Add attendee
    </button>
  );

  const accentColour = ACCENTS[accent] ?? ACCENTS.cobalt;

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
        ["--ar-accent" as string]: accentColour,
        ["--ar-accent-ink" as string]: `color-mix(in oklab, ${accentColour} 78%, var(--ink))`,
      }}
    >
      <p id={hintId} className="sr-only">
        Up and Down move the attendee. Delete removes it. Alt with Up or Down
        moves from any field.
      </p>

      <header className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-semibold">
            {title}
          </p>
          {subtitle ? (
            <p className="truncate text-[11px] text-ink-3">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {ready && onSale ? (
            <p className="flex items-baseline gap-1 text-[12px] text-ink-2">
              <span className="sr-only">
                {rows.length} of {max} attendees
              </span>
              <Users aria-hidden className="size-3.5 self-center text-ink-3" />
              <Roll
                text={String(rows.length)}
                motionSafe={motionSafe}
                className="font-mono text-[13px] text-foreground"
              />
              <span aria-hidden>of {max}</span>
            </p>
          ) : null}
          {ready && onSale ? addButton("head") : null}
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          summaryPosition === "side" && "@min-[40rem]:flex-row",
        )}
      >
        <div className="@container/rows relative flex min-h-0 flex-1 flex-col">
          {status === "loading" ? (
            <div
              aria-hidden
              className="flex flex-col gap-2 border-t border-hairline px-3 pt-3"
            >
              {Array.from({ length: 3 }, (_, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-2 rounded-3 border border-hairline p-2.5"
                >
                  <span
                    className="h-5 w-32 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${i * 110}ms` }}
                  />
                  <div className="grid grid-cols-2 gap-2 @min-[30rem]/rows:grid-cols-3">
                    {Array.from({ length: 3 }, (_, j) => (
                      <span
                        key={j}
                        className="h-8 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                        style={{ animationDelay: `${i * 110 + j * 40}ms` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : status === "error" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 border-t border-hairline px-6 py-8 text-center">
              <TriangleAlert aria-hidden className="size-5 text-danger" />
              <p className="text-sm text-foreground">
                The ticket types didn&apos;t load.
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
          ) : !onSale ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 border-t border-hairline px-6 py-8 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-surface-2">
                <Ticket aria-hidden className="size-5 text-ink-3" />
              </span>
              <p className="text-sm font-medium text-foreground">
                No tickets on sale yet
              </p>
              <p className="max-w-[28ch] text-[12px] text-ink-3">
                Registration for {title} opens once the ticket types are
                published. Nothing to fill in until then.
              </p>
            </div>
          ) : (
            <div
              ref={listRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline"
            >
              {rows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
                  <span className="flex size-10 items-center justify-center rounded-full bg-surface-2">
                    <Users aria-hidden className="size-5 text-ink-3" />
                  </span>
                  <p className="text-sm font-medium text-foreground">
                    No attendees yet
                  </p>
                  <p className="max-w-[30ch] text-[12px] text-ink-3">
                    Add the first attendee to start the registration. Up to{" "}
                    {max} can come on one booking.
                  </p>
                  <div className="pt-1">{addButton("foot")}</div>
                </div>
              ) : (
                <>
                  <ul
                    role="list"
                    aria-label="Attendees"
                    className="flex flex-col gap-2 p-3"
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {order.map((attendee, i) => (
                        <AttendeeRow
                          key={attendee.id}
                          attendee={attendee}
                          index={i}
                          count={rows.length}
                          ticketTypes={ticketTypes}
                          diets={diets}
                          density={density}
                          symbol={currencySymbol}
                          motionSafe={motionSafe}
                          enter={live}
                          leaving={leaving === attendee.id}
                          dragged={dragId === attendee.id}
                          settling={settlingId === attendee.id}
                          dragY={dragY}
                          flashSeq={flash?.id === attendee.id ? flash.seq : 0}
                          disabled={inert}
                          uid={uid}
                          nodeRef={(node) => {
                            if (node) rowNodes.current.set(attendee.id, node);
                            else rowNodes.current.delete(attendee.id);
                          }}
                          fieldRef={fieldRef}
                          onEdit={(field, patch) =>
                            edit(attendee.id, field, patch)
                          }
                          onRemove={() => remove(attendee.id)}
                          onCopy={() => copyFromAbove(attendee.id)}
                          onMove={(dir) => move(attendee.id, dir)}
                          onHandlePointerDown={(event) =>
                            onHandlePointerDown(event, attendee.id)
                          }
                          onHandlePointerMove={onHandlePointerMove}
                          onHandlePointerUp={(event) => endDrag(event, false)}
                          onDragCancel={() => endDrag(null, true)}
                        />
                      ))}
                    </AnimatePresence>
                  </ul>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-3">
                    {addButton("foot")}
                    {atMax ? (
                      <p id={`${uid}-cap`} className="text-[11px] text-ink-3">
                        {capReason}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {ready && onSale ? (
          <Summary
            totals={totals}
            discount={discount}
            symbol={currencySymbol}
            density={density}
            position={summaryPosition}
            motionSafe={motionSafe}
            submitLabel={submitLabel}
            done={done}
            inert={inert}
            uid={uid}
            onSubmit={submit}
          />
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
