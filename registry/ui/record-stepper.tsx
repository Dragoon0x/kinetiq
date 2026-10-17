"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type Variants,
} from "motion/react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                   */
/* ----------------------------------------------------------------------- */

export type RecordStepperState =
  "new" | "open" | "pending" | "on-hold" | "solved";
export type RecordStepperPriority = "low" | "normal" | "high" | "urgent";

export type RecordStepperRecord = {
  id: string;
  title: string;
  requester: string;
  company: string;
  state: RecordStepperState;
  priority: RecordStepperPriority;
  /** Last update, ms since the epoch. */
  updatedAt: number;
  /** The latest message, as plain text. */
  excerpt: string;
};

export type RecordStepperFilter = { id: string; label: string };
export type RecordStepperAccentName = "cobalt" | "plum" | "mint" | "ink";
export type RecordStepperCounterStyle = "words" | "slash" | "track";
export type RecordStepperStatus = "ready" | "error";

export type RecordStepperProps = {
  /** Every id in the list, in list order; its length is the total. @default defaultRecordStepperOrder */
  order?: string[];
  /** The records the host has loaded; a position whose record is missing shows as loading. @default defaultRecordStepperRecords */
  records?: RecordStepperRecord[];
  /** Controlled position in the list, 1-based. */
  position?: number;
  /** Initial position when uncontrolled, 1-based. @default 12 */
  defaultPosition?: number;
  /** Fires from the press or key that stepped, with the direction, the new position and its record (null while not loaded). */
  onStep?: (
    direction: 1 | -1,
    position: number,
    record: RecordStepperRecord | null,
  ) => void;
  /** Fires from the list button, the end-of-list link or Escape. */
  onBackToList?: () => void;
  /** The list's name. @default "Open tickets" */
  listLabel?: string;
  /** The filters the list is under, shown beside its name. @default defaultRecordStepperFilters */
  filters?: RecordStepperFilter[];
  /** How far a title travels when stepping, px. @default 16 */
  slideDistance?: number;
  /** How the place in the list reads: "12 of 240", "12/240" in a pill, or over a small track. @default "words" */
  counterStyle?: RecordStepperCounterStyle;
  /** Track, focus and loading accents: a named accent or any CSS colour. @default "cobalt" */
  accent?: RecordStepperAccentName | (string & {});
  /** The time updates are measured from, ms since the epoch. @default defaultRecordStepperNow */
  now?: number;
  /** Listen for J, K and Escape while focus is inside. @default true */
  shortcuts?: boolean;
  /** Record state: error shows a retry in place of the ticket. @default "ready" */
  status?: RecordStepperStatus;
  /** Called by the error state's Retry. */
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

/** A fixed moment, so "12 min ago" is the same on the server and in the browser. */
export const defaultRecordStepperNow = Date.UTC(2026, 9, 17, 9, 40, 0);

/** Gaugeworks' open high-priority queue: 240 tickets, GW-4406 to GW-4645. */
export const defaultRecordStepperOrder: string[] = Array.from(
  { length: 240 },
  (_, i) => `GW-${4406 + i}`,
);

const MIN = 60_000;
export const defaultRecordStepperRecords: RecordStepperRecord[] = [
  {
    id: "GW-4415",
    title: "Invoice shows our old company name",
    requester: "Mara Quist",
    company: "Fieldline Freight",
    state: "open",
    priority: "high",
    updatedAt: defaultRecordStepperNow - 41 * MIN,
    excerpt:
      "We renamed in August but the September invoice still says Fieldline Haulage. Finance can't book it until it matches.",
  },
  {
    id: "GW-4416",
    title: "CSV export stops at 10,000 rows",
    requester: "Ivo Brandt",
    company: "Coldbrook Roasters",
    state: "pending",
    priority: "high",
    updatedAt: defaultRecordStepperNow - 26 * MIN,
    excerpt:
      "The orders export ends at exactly 10,000 lines with no warning. We need the whole quarter for the audit on Friday.",
  },
  {
    id: "GW-4417",
    title: "Can't add a second admin to our workspace",
    requester: "Ines Duarte",
    company: "Basinworks",
    state: "open",
    priority: "urgent",
    updatedAt: defaultRecordStepperNow - 12 * MIN,
    excerpt:
      "The invite goes out but the role drops back to member when they accept. I'm the only admin and I'm away from Monday.",
  },
  {
    id: "GW-4418",
    title: "Login loop after the SSO change",
    requester: "Theo Lindqvist",
    company: "Waylight Cargo",
    state: "new",
    priority: "high",
    updatedAt: defaultRecordStepperNow - 7 * MIN,
    excerpt:
      "Since we switched identity providers this morning, three of our drivers land back on the sign-in page after every login.",
  },
  {
    id: "GW-4419",
    title: "Webhook retries arrive out of order",
    requester: "Sana Okafor",
    company: "Fernworks Studio",
    state: "open",
    priority: "high",
    updatedAt: defaultRecordStepperNow - 64 * MIN,
    excerpt:
      "A retried order.updated lands after the newer one, so our stock count goes backwards for a few minutes.",
  },
  {
    id: "GW-4420",
    title: "Seat count wrong after removing a user",
    requester: "Pim de Vries",
    company: "Gaugeworks Supply",
    state: "on-hold",
    priority: "high",
    updatedAt: defaultRecordStepperNow - 3 * 60 * MIN,
    excerpt:
      "We removed a contractor last week and billing still counts 41 seats. Waiting on our finance team for the invoice number.",
  },
];

export const defaultRecordStepperFilters: RecordStepperFilter[] = [
  { id: "priority", label: "High priority" },
  { id: "mine", label: "Assigned to me" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const r3 = (v: number) => Number(v.toFixed(3));
const mod10 = (v: number) => ((v % 10) + 10) % 10;

const ACCENTS: Record<RecordStepperAccentName, string> = {
  cobalt: "var(--accent-bright)",
  plum: "oklch(from var(--accent-bright) l c 320)",
  mint: "var(--success)",
  ink: "var(--ink-2)",
};

const accentVars = (accent: string): React.CSSProperties =>
  ({
    "--rs-accent": Object.hasOwn(ACCENTS, accent)
      ? ACCENTS[accent as RecordStepperAccentName]
      : accent,
    "--rs-wash": "color-mix(in oklab, var(--rs-accent) 12%, transparent)",
  }) as React.CSSProperties;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

const HEADER = 48;

const STATE: Record<RecordStepperState, { label: string; chip: string }> = {
  new: { label: "New", chip: "bg-cobalt-wash text-cobalt-bright" },
  open: {
    label: "Open",
    chip: "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-danger",
  },
  pending: {
    label: "Pending",
    chip: "bg-[color-mix(in_oklab,var(--warn)_14%,transparent)] text-warn",
  },
  "on-hold": { label: "On hold", chip: "bg-surface-2 text-ink-2" },
  solved: {
    label: "Solved",
    chip: "bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-success",
  },
};

const PRIORITY: Record<RecordStepperPriority, { label: string; bars: number }> =
  {
    low: { label: "Low", bars: 1 },
    normal: { label: "Normal", bars: 2 },
    high: { label: "High", bars: 3 },
    urgent: { label: "Urgent", bars: 4 },
  };

const ago = (now: number, at: number) => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

/* ----------------------------------------------------------------------- */
/*                                 Counter                                  */
/* ----------------------------------------------------------------------- */

const FACE = 1.25;
const FACES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/**
 * One digit of the position. The strip is positioned in faces and shown
 * mod 10, so stepping 19 → 20 turns the units wheel one face forward onto
 * its trailing zero while the tens wheel turns one — never a spin back.
 */
function Wheel({
  digit,
  active,
  dir,
  motionSafe,
}: {
  digit: number;
  active: boolean;
  dir: number;
  motionSafe: boolean;
}) {
  const pos = useMotionValue(digit);
  const y = useTransform(pos, (p) => `${-r3(mod10(p) * FACE)}em`);
  React.useEffect(() => {
    const base = mod10(pos.get());
    const gap = mod10(digit - base);
    if (gap < 1e-3 || gap > 10 - 1e-3) return;
    pos.jump(base);
    const target = dir >= 0 ? base + gap : base - (10 - gap);
    if (!motionSafe) {
      pos.jump(target);
      return;
    }
    // The same glide as the title, so the number and the page move as one.
    const controls = animate(pos, target, springs.glide);
    return () => controls.stop();
  }, [digit, dir, motionSafe, pos]);
  return (
    <motion.span
      className="relative inline-block shrink-0 overflow-hidden"
      style={{ height: `${FACE}em` }}
      initial={false}
      animate={{ width: active ? "1ch" : "0ch", opacity: active ? 1 : 0 }}
      transition={motionSafe ? springs.glide : { duration: 0 }}
    >
      <motion.span
        className="absolute inset-x-0 top-0 flex flex-col"
        style={{ y }}
      >
        {FACES.map((face, i) => (
          <span
            key={i}
            className="block text-center"
            style={{ height: `${FACE}em`, lineHeight: `${FACE}em` }}
          >
            {face}
          </span>
        ))}
      </motion.span>
    </motion.span>
  );
}

function Rolling({
  value,
  places,
  dir,
  motionSafe,
}: {
  value: number;
  places: number;
  dir: number;
  motionSafe: boolean;
}) {
  return (
    <span
      aria-hidden
      className="inline-flex items-start justify-end tabular-nums"
      style={{
        height: `${FACE}em`,
        lineHeight: `${FACE}em`,
        minWidth: `${places}ch`,
      }}
    >
      {Array.from({ length: places }, (_, i) => places - 1 - i).map((place) => (
        <Wheel
          key={place}
          digit={Math.floor(value / 10 ** place) % 10}
          active={place === 0 || value >= 10 ** place}
          dir={dir}
          motionSafe={motionSafe}
        />
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Component                                 */
/* ----------------------------------------------------------------------- */

/**
 * A detail-page header that knows where the record sits in its list — "12 of
 * 240" — with Previous and Next. Stepping slides the title stack up (or down)
 * by `slideDistance` on glide in the direction you moved: the old title
 * leaves on the exit ease while the new one rises into place, the counter's
 * digits roll the same way on the same glide (each digit its own wheel), the
 * ticket body cross-slides by half the distance and the peek of the next
 * ticket updates, so the page feels like it rests on the list and the list
 * moved under it.
 *
 * A neighbour the host has not loaded yet still moves the counter — the
 * position is information — while the title and body show skeletons until
 * it lands. At either end the missing step leans the title 4 px on flick and
 * returns it on snap. J and K step, Escape returns to the list, and below
 * 30rem the counter becomes a small progress tick. Under reduced motion the
 * titles cross-fade and the digits swap.
 */
export function RecordStepper({
  order = defaultRecordStepperOrder,
  records = defaultRecordStepperRecords,
  position,
  defaultPosition = 12,
  onStep,
  onBackToList,
  listLabel = "Open tickets",
  filters = defaultRecordStepperFilters,
  slideDistance = 16,
  counterStyle = "words",
  accent = "cobalt",
  now = defaultRecordStepperNow,
  shortcuts = true,
  status = "ready",
  onRetry,
  disabled = false,
  className,
}: RecordStepperProps) {
  const motionSafe = useMotionSafe();
  const total = order.length;
  const places = Math.max(1, String(Math.max(1, total)).length);
  const travel = Math.max(0, Math.round(slideDistance));

  const [own, setOwn] = React.useState(defaultPosition);
  const pos = Math.min(Math.max(1, position ?? own), Math.max(1, total));
  const recordAt = React.useCallback(
    (p: number): RecordStepperRecord | null => {
      const id = order[p - 1];
      return id ? (records.find((r) => r.id === id) ?? null) : null;
    },
    [order, records],
  );
  const record = recordAt(pos);
  const idHere = order[pos - 1] ?? "";
  const nextRecord = pos < total ? recordAt(pos + 1) : null;
  const atStart = pos <= 1;
  const atEnd = pos >= total;

  const [trail, setTrail] = React.useState({ pos, dir: 1 });
  if (trail.pos !== pos) setTrail({ pos, dir: pos > trail.pos ? 1 : -1 });
  const dir = trail.dir;

  const [announcement, setAnnouncement] = React.useState("");
  // A ticket stepped onto before it loaded is announced when it lands, not
  // before: the sentence is frozen from the record the host sends.
  const [waitingFor, setWaitingFor] = React.useState<string | null>(null);
  if (waitingFor && waitingFor === idHere && record) {
    setWaitingFor(null);
    setAnnouncement(`Ticket ${pos} of ${total}, ${record.title}.`);
  }

  const [bumped, setBumped] = React.useState<1 | -1 | null>(null);
  const lean = useMotionValue(0);
  const leaning = React.useRef<AnimationPlaybackControls | null>(null);
  const bumpTimer = React.useRef(0);
  React.useEffect(
    () => () => {
      leaning.current?.stop();
      window.clearTimeout(bumpTimer.current);
    },
    [],
  );

  const bump = (d: 1 | -1) => {
    setAnnouncement(
      d > 0
        ? `This is the last ticket in ${listLabel}.`
        : `This is the first ticket in ${listLabel}.`,
    );
    window.clearTimeout(bumpTimer.current);
    setBumped(d);
    bumpTimer.current = window.setTimeout(() => setBumped(null), 320);
    if (!motionSafe) return;
    leaning.current?.stop();
    // A lean toward the ticket that is not there, then back: flick out,
    // snap home. Nothing celebrates; it is a soft "no".
    leaning.current = animate(lean, d * distances.nudge, {
      ...springs.flick,
      onComplete: () => {
        leaning.current = animate(lean, 0, springs.snap);
      },
    });
  };

  const step = (d: 1 | -1) => {
    if (disabled) return;
    const to = pos + d;
    if (to < 1 || to > total) {
      bump(d);
      return;
    }
    leaning.current?.stop();
    lean.jump(0);
    const landing = recordAt(to);
    if (position === undefined) setOwn(to);
    onStep?.(d, to, landing);
    if (landing) {
      setWaitingFor(null);
      setAnnouncement(`Ticket ${to} of ${total}, ${landing.title}.`);
    } else {
      setWaitingFor(order[to - 1] ?? null);
      setAnnouncement(`Ticket ${to} of ${total}, loading.`);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!shortcuts || disabled) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']"))
      return;
    const key = event.key.toLowerCase();
    if (key === "j") {
      event.preventDefault();
      step(1);
    } else if (key === "k") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Escape" && onBackToList) {
      event.preventDefault();
      onBackToList();
    }
  };

  /* ------------------------------ motion ------------------------------- */

  const half = Math.round(travel / 2);
  const slide = (distance: number): Variants => ({
    enter: (d: unknown) => ({
      opacity: 0,
      y: motionSafe && typeof d === "number" ? d * distance : 0,
    }),
    shown: {
      opacity: 1,
      y: 0,
      transition: motionSafe
        ? {
            ...springs.glide,
            opacity: { duration: durations.base, ease: easings.enter },
          }
        : { duration: durations.fast },
    },
    leave: (d: unknown) => ({
      opacity: 0,
      y: motionSafe && typeof d === "number" ? -d * distance : 0,
      transition: motionSafe
        ? { ...exitFor(durations.base), opacity: exitFor(durations.fast) }
        : { duration: durations.fast },
    }),
  });
  const titleSlide = slide(travel);
  const bodySlide = slide(half);

  const ratio = total > 1 ? (pos - 1) / (total - 1) : 1;
  const track = useMotionValue(ratio);
  React.useEffect(() => {
    if (!motionSafe) {
      track.jump(ratio);
      return;
    }
    const c = animate(track, ratio, springs.glide);
    return () => c.stop();
  }, [motionSafe, ratio, track]);
  const thumbX = useTransform(track, (t) => `${r3(t * 100)}%`);
  const thumbY = useTransform(track, (t) => `${r3(t * 100)}%`);

  /* ------------------------------ render ------------------------------- */

  const key = `${pos}-${idHere}`;
  const filterText = filters.map((f) => f.label).join(" and ");
  const prevId = order[pos - 2];
  const nextId = order[pos];
  const loading = !record;

  const counterLabel = `Ticket ${pos} of ${total} in ${listLabel}`;
  const words = (
    <span
      className="inline-flex items-center gap-1 font-mono text-[12px] text-foreground"
      style={{ lineHeight: `${FACE}em` }}
    >
      <Rolling value={pos} places={places} dir={dir} motionSafe={motionSafe} />
      <span className="text-ink-3">of</span>
      <span className="tabular-nums">{total}</span>
    </span>
  );

  return (
    <section
      aria-label={record ? `${idHere}, ${record.title}` : `${idHere}, loading`}
      aria-busy={loading || undefined}
      onKeyDown={onKeyDown}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-60",
        className,
      )}
      style={accentVars(accent)}
    >
      {/* ------------------------------ header ----------------------------- */}
      <header
        className="relative flex shrink-0 items-center gap-2 border-b border-hairline px-2"
        style={{ height: HEADER }}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onBackToList?.()}
          aria-label={`Back to ${listLabel}${filters.length ? `, filtered by ${filterText}` : ""}`}
          aria-keyshortcuts="Escape"
          title={`Back to ${listLabel} · Esc`}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 pr-2 pl-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground @max-[22rem]:w-8 @max-[22rem]:justify-center @max-[22rem]:px-0",
            FOCUS,
          )}
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" />
          <span aria-hidden className="whitespace-nowrap @max-[22rem]:hidden">
            {listLabel}
          </span>
          {filters.length > 0 ? (
            <span
              aria-hidden
              className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-surface-2 px-1 font-mono text-[10px] text-ink-3 @max-[30rem]:hidden @[52rem]:hidden"
            >
              {filters.length}
            </span>
          ) : null}
        </button>
        {filters.length > 0 ? (
          <span
            aria-hidden
            className="hidden shrink-0 items-center gap-1 @[52rem]:flex"
          >
            {filters.map((f) => (
              <span
                key={f.id}
                className="inline-flex h-6 items-center rounded-full border border-hairline px-2 text-[11px] whitespace-nowrap text-ink-2"
              >
                {f.label}
              </span>
            ))}
          </span>
        ) : null}
        <span aria-hidden className="h-5 w-px shrink-0 bg-hairline" />

        {/* The title stack: clipped to the header, so a step reads as the
            list moving under a window. */}
        <motion.div
          className="relative grid h-full min-w-0 flex-1 items-center overflow-hidden"
          style={{ y: lean }}
        >
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={key}
              custom={dir}
              variants={titleSlide}
              initial="enter"
              animate="shown"
              exit="leave"
              className="col-start-1 row-start-1 min-w-0"
            >
              <p className="font-mono text-[10.5px] leading-tight text-ink-3">
                {idHere}
              </p>
              {record ? (
                <h3
                  className="truncate text-[14px] leading-tight font-semibold"
                  title={record.title}
                >
                  {record.title}
                </h3>
              ) : (
                <h3 className="flex h-[17.5px] items-center">
                  <span className="sr-only">{`${idHere}, loading`}</span>
                  <span
                    aria-hidden
                    className="block h-2.5 w-48 max-w-full rounded-full bg-surface-2 motion-safe:animate-pulse"
                  />
                </h3>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Counter */}
        <span className="shrink-0">
          <span className="sr-only">{counterLabel}</span>
          <span aria-hidden className="flex items-center @max-[30rem]:hidden">
            {counterStyle === "slash" ? (
              <span className="inline-flex h-6 items-center rounded-full bg-surface-2 px-2.5 font-mono text-[12px] shadow-[inset_0_0_0_1px_var(--hairline)]">
                <Rolling
                  value={pos}
                  places={places}
                  dir={dir}
                  motionSafe={motionSafe}
                />
                <span className="px-0.5 text-ink-3">/</span>
                <span className="text-ink-2 tabular-nums">{total}</span>
              </span>
            ) : counterStyle === "track" ? (
              <span className="flex flex-col items-end gap-1">
                {words}
                <span className="relative block h-[3px] w-12 rounded-full bg-hairline-strong">
                  <motion.span
                    className="absolute top-1/2 block h-[7px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--rs-accent)]"
                    style={{ left: thumbX }}
                  />
                </span>
              </span>
            ) : (
              words
            )}
          </span>
          {/* Below 30rem the counter is a tick on a short vertical track. */}
          <span
            aria-hidden
            className="relative hidden h-6 w-[3px] rounded-full bg-hairline-strong @max-[30rem]:block"
          >
            <motion.span
              className="absolute left-1/2 block h-[5px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--rs-accent)]"
              style={{ top: thumbY }}
            />
          </span>
        </span>

        <div
          className="flex shrink-0 items-center gap-0.5"
          role="group"
          aria-label="Step through tickets"
        >
          {([-1, 1] as const).map((d) => {
            const off = d < 0 ? atStart : atEnd;
            const neighbour = d < 0 ? prevId : nextId;
            const Icon = d < 0 ? ChevronUp : ChevronDown;
            return (
              <button
                key={d}
                type="button"
                data-rs-step={d < 0 ? "prev" : "next"}
                aria-label={
                  off
                    ? d < 0
                      ? "Previous ticket, start of list"
                      : "Next ticket, end of list"
                    : `${d < 0 ? "Previous" : "Next"} ticket, ${neighbour ?? ""}`
                }
                aria-disabled={off || undefined}
                aria-keyshortcuts={d < 0 ? "K" : "J"}
                title={`${d < 0 ? "Previous" : "Next"} · ${d < 0 ? "K" : "J"}`}
                disabled={disabled}
                onClick={() => step(d)}
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-2 transition-colors",
                  FOCUS,
                  off
                    ? cn(
                        "cursor-not-allowed text-ink-3",
                        bumped === d
                          ? "bg-[color-mix(in_oklab,var(--danger)_10%,transparent)] text-danger"
                          : "opacity-50",
                      )
                    : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
                )}
              >
                <Icon aria-hidden className="size-4" />
              </button>
            );
          })}
        </div>
      </header>

      {/* ------------------------------- body ------------------------------ */}
      <div className="relative grid overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={key}
            custom={dir}
            variants={bodySlide}
            initial="enter"
            animate="shown"
            exit="leave"
            className="col-start-1 row-start-1 flex min-w-0 flex-col"
          >
            {status === "error" ? (
              <div className="flex flex-col items-start gap-2 px-4 py-4">
                <p className="text-[13px]">{`${idHere} didn’t load.`}</p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className={cn(
                      "inline-flex h-8 items-center rounded-2 border border-hairline px-3 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ) : record ? (
              <div className="flex flex-col gap-2 px-4 pt-3.5 pb-3">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                  <span
                    aria-hidden
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--rs-wash)] text-[11px] font-semibold text-[var(--rs-accent)]"
                  >
                    {initials(record.requester)}
                  </span>
                  <span className="min-w-0 text-[13px] leading-tight">
                    <span className="font-medium">{record.requester}</span>
                    <span className="text-ink-3 @max-[30rem]:hidden">{` · ${record.company}`}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium",
                      STATE[record.state].chip,
                    )}
                  >
                    {STATE[record.state].label}
                  </span>
                  <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2 text-[11px] text-ink-2">
                    <span
                      aria-hidden
                      className="flex h-2.5 items-end gap-[2px]"
                    >
                      {[1, 2, 3, 4].map((b) => (
                        <span
                          key={b}
                          className={cn(
                            "block w-[2px] rounded-full",
                            b <= PRIORITY[record.priority].bars
                              ? record.priority === "urgent"
                                ? "bg-danger"
                                : "bg-ink-2"
                              : "bg-hairline-strong",
                          )}
                          style={{ height: 3 + b * 2 }}
                        />
                      ))}
                    </span>
                    {PRIORITY[record.priority].label}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-ink-3 @max-[30rem]:hidden">
                    {`updated ${ago(now, record.updatedAt)}`}
                  </span>
                </div>
                <p className="line-clamp-2 text-[13px] leading-[1.45] text-ink-2">
                  {record.excerpt}
                </p>
              </div>
            ) : (
              <div aria-hidden className="flex flex-col gap-2.5 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="size-7 rounded-full bg-surface-2" />
                  <span className="h-2.5 w-28 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                  <span className="h-4 w-12 rounded-full bg-surface-2" />
                </div>
                <span className="h-2.5 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
                <span className="h-2.5 w-3/4 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              </div>
            )}

            {/* The list beneath: what the next step would bring. */}
            <div className="mx-4 mb-3 flex h-8 min-w-0 items-center gap-2 rounded-2 border border-dashed border-hairline-strong px-2.5 text-[12px]">
              {atEnd ? (
                <>
                  <span className="shrink-0 text-ink-3">{`End of ${listLabel}`}</span>
                  {onBackToList ? (
                    <button
                      type="button"
                      onClick={onBackToList}
                      className={cn(
                        "ml-auto shrink-0 rounded-1 font-medium text-[var(--rs-accent)] hover:underline",
                        FOCUS,
                      )}
                    >
                      Back to the list
                    </button>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="shrink-0 font-mono text-[10.5px] tracking-[0.08em] text-ink-3 uppercase">
                    Next
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-2">
                    {nextId}
                  </span>
                  <span
                    className="min-w-0 truncate text-ink-2"
                    title={nextRecord?.title}
                  >
                    {nextRecord ? nextRecord.title : "not loaded yet"}
                  </span>
                  <kbd
                    aria-hidden
                    className="ml-auto shrink-0 font-mono text-[10.5px] text-ink-3 @max-[30rem]:hidden"
                  >
                    J
                  </kbd>
                </>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
