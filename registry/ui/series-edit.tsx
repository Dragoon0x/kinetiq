"use client";

import * as React from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Check,
  ChevronDown,
  Pencil,
  Repeat,
  RotateCcw,
  TriangleAlert,
  Undo2,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  distances,
  durations,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type SeriesScope = "one" | "following" | "all";
export type SeriesChipStyle = "tile" | "pill" | "stub";
export type SeriesDensity = "compact" | "regular" | "roomy";
export type SeriesAccent = "cobalt" | "moss" | "plum" | "ember";
export type SeriesStatus = "ready" | "loading" | "error";

export type SeriesInfo = {
  id: string;
  title: string;
  /** 0 is Monday, 6 is Sunday. */
  weekday: number;
  /** Minutes from midnight. */
  start: number;
  /** Minutes. */
  duration: number;
  room: string;
};

export type SeriesOccurrence = {
  id: string;
  /** The day, as ms at UTC midnight. */
  date: number;
  /** Overrides the series' start, minutes from midnight. */
  start?: number;
  /** Overrides the series' length, minutes. */
  duration?: number;
  /** Overrides the series' room. */
  room?: string;
  /** A one-off change ("moved") or a cancelled meeting. */
  exception?: "moved" | "cancelled";
  /** A second series begins here: the strip keeps a divider before it. */
  split?: boolean;
};

export type SeriesBusy = {
  id: string;
  title: string;
  /** The day, as ms at UTC midnight. */
  date: number;
  /** Minutes from midnight. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
};

export type SeriesChanges = {
  /** Minutes from midnight. */
  start: number;
  /** Minutes. */
  duration: number;
  room: string;
};

export type SeriesEditProps = {
  /** How each occurrence chip is drawn: a two-line tile, a one-line pill, or a calendar stub. @default "tile" */
  chipStyle?: SeriesChipStyle;
  /** Chip size, gaps, padding and field height. @default "regular" */
  density?: SeriesDensity;
  /** The colour of the edit: chips in scope, the cleave and the save. @default "cobalt" */
  accent?: SeriesAccent;
  /** The recurring meeting. @default defaultSeries */
  series?: SeriesInfo;
  /** Controlled occurrences. Saves are reported through `onOccurrencesChange`. */
  occurrences?: SeriesOccurrence[];
  /** Initial occurrences when uncontrolled. @default defaultSeriesOccurrences */
  defaultOccurrences?: SeriesOccurrence[];
  /** Fires from Save with every occurrence. */
  onOccurrencesChange?: (occurrences: SeriesOccurrence[]) => void;
  /** Other events on the calendar, checked for clashes before saving. @default defaultSeriesBusy */
  busy?: SeriesBusy[];
  /** Rooms offered by the Room field. @default defaultSeriesRooms */
  rooms?: string[];
  /** The current time, ms; occurrences before today are not shown. Never read from the clock. @default defaultSeriesNow */
  now?: number;
  /** Controlled occurrence being edited (the anchor), by id. */
  anchor?: string;
  /** Initial anchor when uncontrolled. @default the first upcoming meeting */
  defaultAnchor?: string;
  /** Fires from the press or key that chose another occurrence. */
  onAnchorChange?: (id: string) => void;
  /** Controlled scope of the edit. */
  scope?: SeriesScope;
  /** Initial scope when uncontrolled. @default "one" */
  defaultScope?: SeriesScope;
  /** Fires from the press or key that changed the scope. */
  onScopeChange?: (scope: SeriesScope) => void;
  /** Pre-fills the edit form, on top of the anchor's own values. */
  defaultChanges?: Partial<SeriesChanges>;
  /** Save with scope "one": the occurrence and its new values. */
  onEditOne?: (occurrence: SeriesOccurrence, changes: SeriesChanges) => void;
  /** Save with scope "following": the first occurrence of the new series and its values. */
  onEditFollowing?: (
    occurrence: SeriesOccurrence,
    changes: SeriesChanges,
  ) => void;
  /** Save with scope "all": the series' new values. */
  onEditAll?: (changes: SeriesChanges) => void;
  /** Discard was pressed: the form went back to the anchor's values. */
  onDiscard?: () => void;
  /** Whether the series has arrived. @default "ready" */
  status?: SeriesStatus;
  /** "Try again" was pressed after the series failed to load. */
  onRetry?: () => void;
  /** Height of the surface, px; the body scrolls inside. @default 540 */
  height?: number;
  /** Nothing can be chosen or saved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const at = (month: number, day: number) => Date.UTC(2026, month, day);

/** Monday 19 October 2026, 09:00. */
export const defaultSeriesNow = Date.UTC(2026, 9, 19, 9, 0);

export const defaultSeries: SeriesInfo = {
  id: "gw-review",
  title: "Gaugeworks weekly review",
  weekday: 3,
  start: 10 * 60,
  duration: 45,
  room: "Ops room 2",
};

export const defaultSeriesRooms = ["Ops room 2", "Fieldline loft", "Call only"];

/**
 * Eight Thursdays from 22 October: 5 November already moved to the
 * afternoon as a one-off, 26 November cancelled while the studio is shut.
 */
export const defaultSeriesOccurrences: SeriesOccurrence[] = [
  { id: "oct-22", date: at(9, 22) },
  { id: "oct-29", date: at(9, 29) },
  { id: "nov-05", date: at(10, 5), start: 14 * 60, exception: "moved" },
  { id: "nov-12", date: at(10, 12) },
  { id: "nov-19", date: at(10, 19) },
  { id: "nov-26", date: at(10, 26), exception: "cancelled" },
  { id: "dec-03", date: at(11, 3) },
  { id: "dec-10", date: at(11, 10) },
];

/** What else is on those Thursdays: late mornings fill up in November. */
export const defaultSeriesBusy: SeriesBusy[] = [
  {
    id: "b1",
    title: "Design crit",
    date: at(9, 29),
    start: 14 * 60,
    end: 15 * 60,
  },
  {
    id: "b2",
    title: "Fieldline site walk",
    date: at(10, 19),
    start: 11 * 60,
    end: 12 * 60,
  },
  {
    id: "b3",
    title: "Coldbrook quarterly",
    date: at(11, 3),
    start: 11 * 60 + 30,
    end: 12 * 60 + 30,
  },
  {
    id: "b4",
    title: "Basinworks demo",
    date: at(11, 10),
    start: 10 * 60 + 30,
    end: 11 * 60 + 15,
  },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";

const WEEK_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(
  " ",
);
const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** Monday-first weekday names for the series rule. */
const RULE_DAY = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** Filled shapes are pigment: each hue at a fixed lightness, so both themes read. */
const ACCENTS: Record<SeriesAccent, string> = {
  cobalt: "oklch(from var(--accent-bright) 0.7 0.14 h)",
  moss: "oklch(from var(--success) 0.72 0.13 h)",
  plum: "oklch(from var(--accent-bright) 0.68 0.13 318)",
  ember: "oklch(from var(--warn) 0.74 0.14 52)",
};
const CLASH = "oklch(from var(--warn) 0.78 0.16 h)";

const DENSITY: Record<
  SeriesDensity,
  {
    pad: string;
    gap: string;
    chip: number;
    chipGap: string;
    field: string;
    text: string;
    tile: string;
  }
> = {
  compact: {
    pad: "px-3",
    gap: "gap-3",
    chip: 68,
    chipGap: "gap-x-1.5 gap-y-3",
    field: "h-8",
    text: "text-[12px]",
    tile: "py-1",
  },
  regular: {
    pad: "px-4",
    gap: "gap-4",
    chip: 76,
    chipGap: "gap-x-2 gap-y-3",
    field: "h-9",
    text: "text-[13px]",
    tile: "py-1.5",
  },
  roomy: {
    pad: "px-5",
    gap: "gap-5",
    chip: 88,
    chipGap: "gap-x-2.5 gap-y-3.5",
    field: "h-10",
    text: "text-[13px]",
    tile: "py-2",
  },
};

/** Extra room the cleave opens before the first chip of a new series, px. */
const CLEAVE = 18;
/** How far a chip drops for a later time (or rises for an earlier one), px at most. */
const SLIDE = 8;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const clock = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const spanText = (c: SeriesChanges) =>
  `${clock(c.start)}–${clock(c.start + c.duration)}`;
const lengthText = (minutes: number) =>
  minutes < 60
    ? `${minutes} min`
    : minutes % 60 === 0
      ? `${minutes / 60} h`
      : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
const dateParts = (ms: number) => {
  const d = new Date(ms);
  return { wd: d.getUTCDay(), day: d.getUTCDate(), month: d.getUTCMonth() };
};
const shortDate = (ms: number) => {
  const p = dateParts(ms);
  return `${WEEK_SHORT[p.wd] ?? ""} ${p.day} ${MONTH_SHORT[p.month] ?? ""}`;
};
const longDate = (ms: number) => {
  const p = dateParts(ms);
  return `${WEEK_LONG[p.wd] ?? ""} ${p.day} ${MONTH_LONG[p.month] ?? ""}`;
};
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

const effective = (o: SeriesOccurrence, s: SeriesInfo): SeriesChanges => ({
  start: o.start ?? s.start,
  duration: o.duration ?? s.duration,
  room: o.room ?? s.room,
});
const sameChanges = (a: SeriesChanges, b: SeriesChanges) =>
  a.start === b.start && a.duration === b.duration && a.room === b.room;
const selectable = (o: SeriesOccurrence) => o.exception !== "cancelled";

const START_OPTIONS = Array.from({ length: 49 }, (_, i) => 7 * 60 + i * 15);
const LENGTH_OPTIONS = [15, 30, 45, 60, 90];

type ChipPreview = {
  inScope: boolean;
  changed: boolean;
  next: SeriesChanges;
  clashes: SeriesBusy[];
  /** Order among the chips in scope, for the ripple. */
  order: number;
  /** A one-off the edit leaves alone. */
  kept: boolean;
};

type Preview = {
  rows: Map<string, ChipPreview>;
  anchorIndex: number;
  inScope: number;
  changed: SeriesOccurrence[];
  clashes: { occurrence: SeriesOccurrence; busy: SeriesBusy }[];
  kept: number;
};

/** What Save would do, chip by chip: who is in scope, who moves, who clashes. */
function previewOf(
  list: SeriesOccurrence[],
  series: SeriesInfo,
  anchorId: string,
  scope: SeriesScope,
  draft: SeriesChanges,
  busy: SeriesBusy[],
): Preview {
  const anchorIndex = list.findIndex((o) => o.id === anchorId);
  const rows = new Map<string, ChipPreview>();
  const changed: SeriesOccurrence[] = [];
  const clashes: Preview["clashes"] = [];
  let order = 0;
  let kept = 0;
  list.forEach((o, i) => {
    const eff = effective(o, series);
    const isAnchor = o.id === anchorId;
    const reach =
      scope === "one"
        ? isAnchor
        : scope === "following"
          ? i >= anchorIndex && anchorIndex >= 0
          : true;
    const oneOff = o.exception === "moved" && !isAnchor;
    const inScope = selectable(o) && reach && !oneOff;
    const isChanged = inScope && !sameChanges(eff, draft);
    const next = inScope ? draft : eff;
    const hits = isChanged
      ? busy.filter(
          (b) =>
            b.date === o.date &&
            b.start < next.start + next.duration &&
            next.start < b.end,
        )
      : [];
    if (isChanged) changed.push(o);
    for (const b of hits) clashes.push({ occurrence: o, busy: b });
    const isKept = reach && oneOff;
    if (isKept) kept += 1;
    rows.set(o.id, {
      inScope,
      changed: isChanged,
      next,
      clashes: hits,
      order: inScope ? order++ : -1,
      kept: isKept,
    });
  });
  return { rows, anchorIndex, inScope: order, changed, clashes, kept };
}

/* ----------------------------------------------------------------------- */
/*                               Small parts                                */
/* ----------------------------------------------------------------------- */

/** True from the frame after the first commit: what arrives later animates in. */
function useCommitted(): boolean {
  const [committed, setCommitted] = React.useState(false);
  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setCommitted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return committed;
}

/**
 * A time that rolls toward the way the meeting moved: later times arrive
 * from above as the chip drops, earlier ones from below as it rises.
 */
function Roll({
  text,
  dir,
  motionSafe,
  className,
}: {
  text: string;
  dir: number;
  motionSafe: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex overflow-clip", className)}
      style={{ height: "1.25em", lineHeight: "1.25em" }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block whitespace-nowrap"
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? -d * distances.step : 0,
            }),
            shown: { opacity: 1, y: 0 },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? d * distances.step : 0,
              transition: exitFor(durations.fast),
            }),
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A box that opens to its content's measured height on glide. */
function Reveal({
  open,
  motionSafe,
  id,
  children,
}: {
  open: boolean;
  motionSafe: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  const [node, setNode] = React.useState<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node) return;
    const ro = new ResizeObserver(() => setHeight(node.offsetHeight));
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return (
    <motion.div
      id={id}
      initial={false}
      animate={{ height: open ? height : 0, opacity: open ? 1 : 0 }}
      transition={
        motionSafe
          ? { height: springs.glide, opacity: { duration: durations.fast } }
          : { duration: 0 }
      }
      style={{ overflow: "clip", overflowClipMargin: 4 }}
      aria-hidden={!open}
      inert={!open}
    >
      <div ref={setNode}>{children}</div>
    </motion.div>
  );
}

function Field({
  label,
  value,
  onChange,
  options,
  height,
  text,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  height: string;
  text: string;
  disabled: boolean;
  className?: string;
}) {
  const id = React.useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(next);
          }}
          className={cn(
            "w-full cursor-pointer appearance-none truncate rounded-2 border border-input bg-surface-0 pr-8 pl-2.5 text-foreground transition-colors hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-60",
            height,
            text,
            FOCUS_RING,
          )}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3"
        />
      </div>
    </div>
  );
}

/** The lane runs 07:00 to 19:00, the hours the Starts field offers. */
const LANE_FROM = 7 * 60;
const LANE_SPAN = 12 * 60;
const lanePct = (m: number) =>
  r2(clamp((m - LANE_FROM) / LANE_SPAN, 0, 1) * 100);

/**
 * One day of the edit drawn on its hours: what else is on, a dashed ghost
 * where the meeting is now, and the meeting where it is going. The slot
 * glides along the day when the time changes, so the slide the chips make
 * is legible in hours here.
 */
function DayLane({
  date,
  caption,
  current,
  next,
  busy,
  motionSafe,
}: {
  date: number;
  caption: string;
  current: SeriesChanges;
  next: SeriesChanges;
  busy: SeriesBusy[];
  motionSafe: boolean;
}) {
  const moved =
    current.start !== next.start || current.duration !== next.duration;
  const end = next.start + next.duration;
  const overlaps = busy
    .filter((b) => b.start < end && next.start < b.end)
    .map((b) => ({
      id: b.id,
      from: Math.max(b.start, next.start),
      to: Math.min(b.end, end),
    }));
  const span = (from: number, to: number) => {
    const l = lanePct(from);
    return { left: `${l}%`, width: `${r2(lanePct(to) - l)}%` };
  };
  const left = lanePct(next.start);
  const width = r2(lanePct(end) - left);
  const marks = [7, 9, 11, 13, 15, 17, 19];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {shortDate(date)}
          {caption ? ` · ${caption}` : ""}
        </p>
        <p
          className={cn(
            "font-mono text-[11px] tabular-nums",
            overlaps.length > 0 ? "text-warn" : "text-ink-3",
          )}
        >
          {spanText(next)}
          {busy.length === 0
            ? " · nothing else on"
            : overlaps.length > 0
              ? " · overlaps"
              : " · clear"}
        </p>
      </div>
      {/* Two rows on one clock: everything else above, this meeting below,
          and any overlap washed across both so the clash reads as a column. */}
      <div
        aria-hidden
        className="relative h-12 overflow-clip rounded-2 border border-hairline bg-surface-1"
      >
        {Array.from({ length: 11 }, (_, i) => (
          <span
            key={i}
            className="absolute inset-y-0 w-px bg-hairline"
            style={{ left: `${lanePct(LANE_FROM + (i + 1) * 60)}%` }}
          />
        ))}
        {overlaps.map((o) => (
          <span
            key={o.id}
            className="absolute inset-y-0 bg-[color-mix(in_oklab,var(--warn)_22%,transparent)]"
            style={span(o.from, o.to)}
          />
        ))}
        {busy.map((b) => (
          <span
            key={b.id}
            className="absolute top-1 flex h-[18px] items-center overflow-hidden rounded-1 border border-hairline-strong bg-surface-2 px-1.5 text-[10px] text-ink-2"
            style={span(b.start, b.end)}
          >
            <span className="truncate">{b.title}</span>
          </span>
        ))}
        {moved ? (
          <span
            className="absolute bottom-1 h-[18px] rounded-1 border border-dashed border-ink-3/70"
            style={span(current.start, current.start + current.duration)}
          />
        ) : null}
        <motion.span
          className="absolute bottom-1 flex h-[18px] items-center overflow-hidden rounded-1 px-1.5 font-mono text-[10px] text-[oklch(0.22_0.02_258)] tabular-nums"
          style={{ backgroundColor: "var(--se-accent)" }}
          initial={false}
          animate={{ left: `${left}%`, width: `${width}%` }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
        >
          <span className="hidden truncate @min-[34rem]:inline">
            {clock(next.start)}
          </span>
        </motion.span>
      </div>
      <div
        aria-hidden
        className="relative h-3 font-mono text-[10px] leading-3 text-ink-3 tabular-nums"
      >
        {marks.map((h, i) => (
          <span
            key={h}
            className={cn(
              "absolute top-0",
              i === 0
                ? ""
                : i === marks.length - 1
                  ? "-translate-x-full"
                  : "-translate-x-1/2",
            )}
            style={{ left: `${lanePct(h * 60)}%` }}
          >
            {String(h).padStart(2, "0")}
          </span>
        ))}
      </div>
    </div>
  );
}

type ChipProps = {
  occurrence: SeriesOccurrence;
  current: SeriesChanges;
  view: ChipPreview;
  isAnchor: boolean;
  isFocus: boolean;
  cleave: "none" | "preview" | "split";
  chipStyle: SeriesChipStyle;
  density: SeriesDensity;
  inScopeCount: number;
  stamp: number;
  committed: boolean;
  motionSafe: boolean;
  disabled: boolean;
  label: string;
  register: (id: string, node: HTMLDivElement | null) => void;
  onChoose: (id: string) => void;
  onFocusChip: (id: string) => void;
};

/**
 * One occurrence. The outer box is the option and owns the layout move (the
 * reflow when the cleave opens); the inner box is what the eye follows, and
 * it alone slides to the new time — so the focus ring is drawn on it and
 * travels with it.
 */
function OccurrenceChip({
  occurrence: o,
  current,
  view,
  isAnchor,
  isFocus,
  cleave,
  chipStyle,
  density,
  inScopeCount,
  stamp,
  committed,
  motionSafe,
  disabled,
  label,
  register,
  onChoose,
  onFocusChip,
}: ChipProps) {
  const d = DENSITY[density];
  const cancelled = o.exception === "cancelled";
  const shown = view.next;
  const delta = view.changed ? shown.start - current.start : 0;
  const offset = r2(clamp(delta / 4, -SLIDE, SLIDE));
  const dir = delta === 0 ? 1 : Math.sign(delta);
  // The ripple runs away from the cleave: each chip in scope a cascade step
  // after the one before it, so the move reads as one wave, not a block.
  const delay =
    motionSafe && view.order > 0 ? view.order * cascade(inScopeCount) : 0;
  const p = dateParts(o.date);
  const time = cancelled ? "—" : clock(shown.start);
  const clash = view.clashes.length > 0;
  const moved = o.exception === "moved";

  const surface = cancelled
    ? "border-dashed border-hairline-strong bg-transparent text-ink-3"
    : view.inScope
      ? "border-[color-mix(in_oklab,var(--se-accent)_62%,transparent)] bg-[color-mix(in_oklab,var(--se-accent)_20%,var(--card))] text-foreground"
      : "border-hairline bg-surface-1 text-foreground";

  const mark = moved ? (
    <motion.span
      key={stamp}
      aria-hidden
      title="One-off change"
      className="absolute -top-1 -left-1 size-2.5 rotate-45 rounded-[2px] border border-card"
      style={{ backgroundColor: "var(--se-accent)" }}
      initial={
        committed && stamp > 0
          ? { opacity: 0, scale: motionSafe ? 1.6 : 1 }
          : false
      }
      animate={{ opacity: 1, scale: 1 }}
      transition={
        motionSafe
          ? { scale: springs.recoil, opacity: { duration: durations.fast } }
          : { duration: durations.base }
      }
    />
  ) : null;

  const body =
    chipStyle === "pill" ? (
      <span className="flex items-center gap-1.5 px-3 whitespace-nowrap">
        <span
          className={cn(
            "text-[12px] text-ink-2",
            cancelled && "text-ink-3 line-through",
          )}
        >
          {p.day} {MONTH_SHORT[p.month]}
        </span>
        <span aria-hidden className="text-ink-3">
          ·
        </span>
        <Roll
          text={time}
          dir={dir}
          motionSafe={motionSafe}
          className="font-mono text-[12px] tabular-nums"
        />
      </span>
    ) : chipStyle === "stub" ? (
      <span className="flex flex-col items-stretch">
        <span
          className={cn(
            "rounded-t-[inherit] py-0.5 text-center font-mono text-[9px] tracking-[0.1em] uppercase transition-colors duration-200",
            view.inScope && !cancelled
              ? "bg-[color-mix(in_oklab,var(--se-accent)_45%,var(--card))] text-foreground"
              : "bg-surface-2 text-ink-3",
          )}
        >
          {MONTH_SHORT[p.month]}
        </span>
        <span
          className={cn(
            "pt-1 text-center text-[17px] leading-none font-semibold tabular-nums",
            cancelled && "text-ink-3 line-through",
          )}
        >
          {p.day}
        </span>
        <span className="flex items-center justify-center gap-1 pt-1 pb-1.5 text-[11px] text-ink-2">
          <span>{WEEK_SHORT[p.wd]}</span>
          <Roll
            text={time}
            dir={dir}
            motionSafe={motionSafe}
            className="font-mono tabular-nums"
          />
        </span>
      </span>
    ) : (
      <span className={cn("flex flex-col items-start px-2", d.tile)}>
        <span
          className={cn(
            "truncate text-[11px] leading-tight text-ink-2",
            cancelled && "text-ink-3 line-through",
          )}
        >
          {WEEK_SHORT[p.wd]} {p.day} {MONTH_SHORT[p.month]}
        </span>
        <Roll
          text={time}
          dir={dir}
          motionSafe={motionSafe}
          className="font-mono text-[13px] font-medium tabular-nums"
        />
      </span>
    );

  return (
    <motion.div
      ref={(node) => register(o.id, node)}
      role="option"
      data-se-chip={o.id}
      aria-selected={isAnchor}
      aria-disabled={cancelled || disabled || undefined}
      aria-label={label}
      tabIndex={isFocus ? 0 : -1}
      layout="position"
      transition={motionSafe ? springs.glide : { duration: 0 }}
      onClick={() => onChoose(o.id)}
      onFocus={() => onFocusChip(o.id)}
      className={cn(
        "group/series-edit-chip relative shrink-0 outline-none select-none",
        cancelled || disabled ? "cursor-default" : "cursor-pointer",
      )}
      style={{
        marginLeft: cleave === "none" ? 0 : CLEAVE,
        width: chipStyle === "pill" ? undefined : d.chip,
      }}
    >
      {cleave !== "none" ? (
        <motion.span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 bottom-0 w-0 border-l",
            cleave === "preview"
              ? "border-dashed border-(--se-accent)"
              : "border-hairline-strong",
          )}
          style={{ left: -Math.round((CLEAVE + 8) / 2), originY: 0.5 }}
          initial={committed ? { scaleY: 0, opacity: 0 } : false}
          animate={{ scaleY: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { scaleY: springs.flick, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        />
      ) : null}
      <motion.span
        data-se-face=""
        className={cn(
          "relative flex rounded-2 border transition-[background-color,border-color,box-shadow,color] ease-out",
          chipStyle === "pill" && "h-8 items-center rounded-full",
          chipStyle === "stub" && "rounded-2",
          !view.inScope &&
            !cancelled &&
            "group-hover/series-edit-chip:border-hairline-strong",
          "group-focus-visible/series-edit-chip:outline-2 group-focus-visible/series-edit-chip:outline-offset-2 group-focus-visible/series-edit-chip:outline-ring group-focus-visible/series-edit-chip:outline-solid",
          surface,
        )}
        style={{
          transitionDuration: motionSafe ? "240ms" : "150ms",
          transitionDelay: `${Math.round(delay * 1000)}ms`,
          boxShadow: isAnchor
            ? "0 0 0 2px var(--se-accent)"
            : clash
              ? `0 0 0 1.5px ${CLASH}`
              : undefined,
        }}
        initial={false}
        animate={{ y: offset }}
        transition={motionSafe ? { ...springs.glide, delay } : { duration: 0 }}
      >
        {body}
        {mark}
        {isAnchor ? (
          <span
            aria-hidden
            className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-card"
            style={{ backgroundColor: "var(--se-accent)" }}
          >
            <Pencil className="size-2.5 text-[oklch(0.22_0.02_258)]" />
          </span>
        ) : clash ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 size-2.5 rounded-full border border-card"
            style={{ backgroundColor: CLASH }}
          />
        ) : null}
      </motion.span>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The editor                                */
/* ----------------------------------------------------------------------- */

const SCOPES: { id: SeriesScope; label: string }[] = [
  { id: "one", label: "This meeting" },
  { id: "following", label: "This and following" },
  { id: "all", label: "All meetings" },
];

type Said = { n: number; text: string };

/**
 * A recurring meeting's editor: its upcoming occurrences as a row of chips
 * above the form, and a scope — this meeting, this and following, or all of
 * them. The strip always shows what Save would do. Chips in scope take the
 * accent on a colour tween; choosing "This and following" cleaves the row at
 * the chosen date — a gap opens before it and the chips after it reflow on
 * glide, a dashed rule drawing down the gap on flick — and the chips in
 * scope slide to the new time, later dropping and earlier rising, each a
 * cascade step after the one before, while their times roll on snap. One-off
 * exceptions keep their mark and their time; clashes with other events are
 * listed before saving, the list opening to its measured height on glide.
 * A one-off save stamps its mark in on recoil.
 *
 * The strip is a horizontal listbox: arrows move the edit to another date
 * (the cleave follows), Home and End jump. The scope is a radio group.
 * Under reduced motion nothing travels or rolls; colours, gaps, times and
 * the clash list still change, because the preview is the information.
 */
export function SeriesEdit({
  chipStyle = "tile",
  density = "regular",
  accent = "cobalt",
  series = defaultSeries,
  occurrences,
  defaultOccurrences,
  onOccurrencesChange,
  busy = defaultSeriesBusy,
  rooms = defaultSeriesRooms,
  now = defaultSeriesNow,
  anchor,
  defaultAnchor,
  onAnchorChange,
  scope,
  defaultScope = "one",
  onScopeChange,
  defaultChanges,
  onEditOne,
  onEditFollowing,
  onEditAll,
  onDiscard,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: SeriesEditProps) {
  const motionSafe = useMotionSafe();
  const committed = useCommitted();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const clashId = `${uid}-clashes`;
  const d = DENSITY[density] ?? DENSITY.regular;
  const ready = status === "ready";

  /* ------------------------------- state --------------------------------- */

  const [ownList, setOwnList] = React.useState<SeriesOccurrence[]>(
    () => defaultOccurrences ?? defaultSeriesOccurrences,
  );
  const list = occurrences ?? ownList;
  const today = Math.floor(now / DAY) * DAY;
  const upcoming = React.useMemo(
    () => list.filter((o) => o.date >= today).sort((a, b) => a.date - b.date),
    [list, today],
  );

  const firstChoice = () =>
    upcoming.find((o) => o.id === defaultAnchor && selectable(o))?.id ??
    upcoming.find(selectable)?.id ??
    "";
  const [ownAnchor, setOwnAnchor] = React.useState<string>(firstChoice);
  const anchorId = anchor ?? ownAnchor;
  const anchorOcc =
    upcoming.find((o) => o.id === anchorId) ?? upcoming.find(selectable);
  const base = anchorOcc
    ? effective(anchorOcc, series)
    : { start: series.start, duration: series.duration, room: series.room };

  const [ownScope, setOwnScope] = React.useState<SeriesScope>(defaultScope);
  const scopeNow = scope ?? ownScope;

  const [draft, setDraft] = React.useState<SeriesChanges>(() => {
    const first = upcoming.find((o) => o.id === firstChoice());
    return {
      ...(first
        ? effective(first, series)
        : {
            start: series.start,
            duration: series.duration,
            room: series.room,
          }),
      ...defaultChanges,
    };
  });

  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [stamps, setStamps] = React.useState<Record<string, number>>({});
  const [flash, setFlash] = React.useState<{ n: number; text: string }>({
    n: 0,
    text: "",
  });
  const [flashShown, setFlashShown] = React.useState(0);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  React.useEffect(() => {
    if (flash.n === 0) return;
    const t = window.setTimeout(() => setFlashShown(flash.n), 1800);
    return () => window.clearTimeout(t);
  }, [flash.n]);
  const flashing = flash.n > 0 && flashShown !== flash.n;

  const view = previewOf(
    upcoming,
    series,
    anchorOcc?.id ?? "",
    scopeNow,
    draft,
    busy,
  );
  const dirty = view.changed.length > 0;

  /* ----------------------------- sentences ------------------------------- */

  const what = (from: SeriesChanges, to: SeriesChanges) => {
    const parts: string[] = [];
    if (from.start !== to.start || from.duration !== to.duration)
      parts.push(spanText(to));
    if (from.room !== to.room) parts.push(to.room);
    return parts.join(", ") || spanText(to);
  };

  const summaryOf = (v: Preview, sc: SeriesScope, dr: SeriesChanges) => {
    const a = anchorOcc;
    if (!a || v.changed.length === 0)
      return "Change the time, length or room to edit.";
    const firstChanged = v.changed[0];
    const target = what(
      firstChanged ? effective(firstChanged, series) : base,
      dr,
    );
    const kept =
      v.kept > 0 ? ` · ${plural(v.kept, "one-off kept", "one-offs kept")}` : "";
    if (sc === "one")
      return `Moves ${shortDate(a.date)} to ${target} · a one-off`;
    if (sc === "following")
      return `Moves ${plural(v.changed.length, "meeting", "meetings")} from ${shortDate(a.date)} to ${target} · starts a new series${kept}`;
    return `Moves ${plural(v.changed.length, "meeting", "meetings")} to ${target}${kept}`;
  };

  const spoken = (v: Preview, sc: SeriesScope, dr: SeriesChanges) => {
    const label = SCOPES.find((s) => s.id === sc)?.label ?? "";
    const n = v.changed.length;
    const moves =
      n === 0
        ? "nothing changes yet"
        : `${plural(n, "meeting moves", "meetings move")} to ${what(base, dr)}`;
    const clashes =
      v.clashes.length === 0
        ? "No clashes."
        : `${plural(v.clashes.length, "clash", "clashes")}.`;
    return `${label}: ${moves}. ${clashes}`;
  };

  /* ------------------------------ actions -------------------------------- */

  const chipNodes = React.useRef(new Map<string, HTMLDivElement>());
  const register = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) chipNodes.current.set(id, node);
      else chipNodes.current.delete(id);
    },
    [],
  );

  const choose = (id: string) => {
    if (disabled || !ready) return;
    const next = upcoming.find((o) => o.id === id);
    if (!next || !selectable(next) || id === anchorOcc?.id) return;
    const clean = sameChanges(draft, base);
    const nextDraft = clean ? effective(next, series) : draft;
    if (clean) setDraft(nextDraft);
    if (anchor === undefined) setOwnAnchor(id);
    onAnchorChange?.(id);
    const v = previewOf(upcoming, series, id, scopeNow, nextDraft, busy);
    say(`Editing ${longDate(next.date)}. ${spoken(v, scopeNow, nextDraft)}`);
  };

  const setScopeTo = (next: SeriesScope) => {
    if (disabled || !ready || next === scopeNow) return;
    if (scope === undefined) setOwnScope(next);
    onScopeChange?.(next);
    const v = previewOf(
      upcoming,
      series,
      anchorOcc?.id ?? "",
      next,
      draft,
      busy,
    );
    say(spoken(v, next, draft));
  };

  const setField = (patch: Partial<SeriesChanges>) => {
    if (disabled || !ready) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    const v = previewOf(
      upcoming,
      series,
      anchorOcc?.id ?? "",
      scopeNow,
      next,
      busy,
    );
    say(spoken(v, scopeNow, next));
  };

  const discard = () => {
    if (disabled || !dirty) return;
    setDraft(base);
    say("Changes discarded.");
    onDiscard?.();
  };

  const save = () => {
    const a = anchorOcc;
    if (disabled || !ready || !dirty || !a) return;
    const changes = { ...draft };
    const anchorIndex = upcoming.findIndex((o) => o.id === a.id);
    const byId = new Map(upcoming.map((o, i) => [o.id, i]));
    let next: SeriesOccurrence[];
    if (scopeNow === "one") {
      next = list.map((o) =>
        o.id === a.id ? { ...o, ...changes, exception: "moved" as const } : o,
      );
      setStamps((s) => ({ ...s, [a.id]: (s[a.id] ?? 0) + 1 }));
      onEditOne?.({ ...a, ...changes, exception: "moved" }, changes);
    } else {
      next = list.map((o) => {
        const i = byId.get(o.id);
        if (i === undefined) return o;
        const reach = scopeNow === "all" || i >= anchorIndex;
        const own = o.id === a.id;
        if (!reach || o.exception === "cancelled") return o;
        if (o.exception === "moved" && !own) {
          return scopeNow === "following" && i > anchorIndex
            ? { ...o, split: undefined }
            : o;
        }
        const rest: SeriesOccurrence = {
          ...o,
          ...changes,
          exception: undefined,
          split:
            scopeNow === "following" && own && anchorIndex > 0
              ? true
              : undefined,
        };
        return rest;
      });
      if (scopeNow === "following") {
        onEditFollowing?.({ ...a, ...changes, split: true }, changes);
      } else {
        onEditAll?.(changes);
      }
    }
    if (occurrences === undefined) setOwnList(next);
    onOccurrencesChange?.(next);
    const text =
      scopeNow === "one"
        ? `Saved ${shortDate(a.date)} as a one-off`
        : scopeNow === "following"
          ? `Saved ${plural(view.changed.length, "meeting", "meetings")} from ${shortDate(a.date)}`
          : `Saved ${plural(view.changed.length, "meeting", "meetings")}`;
    setFlash((f) => ({ n: f.n + 1, text }));
    say(`${text}.`);
  };

  /* ------------------------------ keyboard ------------------------------- */

  const focusChip = (id: string) => {
    setFocusId(id);
    chipNodes.current.get(id)?.focus();
  };

  const onStripKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || upcoming.length === 0) return;
    const at = upcoming.findIndex((o) => o.id === (focusId ?? anchorOcc?.id));
    const go = (i: number) => {
      const target = upcoming[clamp(i, 0, upcoming.length - 1)];
      if (!target) return;
      focusChip(target.id);
      // Selection follows focus, so the cleave walks with the arrow keys.
      if (selectable(target)) choose(target.id);
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        go(at - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(upcoming.length - 1);
        return;
      case "Enter":
      case " ": {
        event.preventDefault();
        const target = upcoming[at];
        if (target) choose(target.id);
        return;
      }
      default:
        return;
    }
  };

  const scopeRefs = React.useRef(new Map<SeriesScope, HTMLDivElement>());
  const onScopeKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    i: number,
  ) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const s = SCOPES[i];
      if (s) setScopeTo(s.id);
      return;
    }
    if (!step) return;
    event.preventDefault();
    const next = SCOPES[(i + step + SCOPES.length) % SCOPES.length];
    if (!next) return;
    setScopeTo(next.id);
    scopeRefs.current.get(next.id)?.focus();
  };

  /* -------------------------------- parts -------------------------------- */

  const chipLabel = (o: SeriesOccurrence) => {
    const v = view.rows.get(o.id);
    const eff = effective(o, series);
    const parts = [
      `${longDate(o.date)}, ${clock(eff.start)} to ${clock(eff.start + eff.duration)}, ${eff.room}`,
    ];
    if (o.exception === "cancelled") parts.push("cancelled");
    else if (o.exception === "moved") parts.push("one-off change");
    if (v?.changed) parts.push(`will move to ${what(eff, v.next)}`);
    else if (v?.kept) parts.push("keeps its own time");
    if (v && v.clashes.length > 0)
      parts.push(`clashes with ${v.clashes.map((b) => b.title).join(" and ")}`);
    return parts.join(", ");
  };

  const splitAt = upcoming.find((o, i) => i > 0 && o.split);
  const splitRule = splitAt ? effective(splitAt, series) : null;
  const counts: Record<SeriesScope, string> = {
    one: anchorOcc ? `Only ${shortDate(anchorOcc.date)}` : "One meeting",
    following: (() => {
      const v = previewOf(
        upcoming,
        series,
        anchorOcc?.id ?? "",
        "following",
        draft,
        busy,
      );
      const after = Math.max(0, v.inScope - 1);
      return anchorOcc
        ? `${shortDate(anchorOcc.date)} + ${after} after`
        : "From here on";
    })(),
    all: (() => {
      const v = previewOf(
        upcoming,
        series,
        anchorOcc?.id ?? "",
        "all",
        draft,
        busy,
      );
      return `${v.inScope} of ${upcoming.length} upcoming`;
    })(),
  };

  const strip = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p
          id={`${uid}-strip`}
          className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
        >
          Upcoming
        </p>
        {view.kept > 0 ? (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <span
              aria-hidden
              className="size-2 rotate-45 rounded-[1.5px]"
              style={{ backgroundColor: "var(--se-accent)" }}
            />
            One-off changes keep their own time
          </p>
        ) : null}
      </div>
      <div
        role="listbox"
        aria-orientation="horizontal"
        aria-labelledby={`${uid}-strip`}
        aria-describedby={hintId}
        onKeyDown={onStripKey}
        className={cn("flex flex-wrap items-start py-2.5", d.chipGap)}
      >
        {upcoming.map((o, i) => {
          const v = view.rows.get(o.id);
          if (!v) return null;
          const isAnchor = o.id === anchorOcc?.id;
          const cleave =
            scopeNow === "following" && isAnchor && i > 0
              ? "preview"
              : o.split && i > 0
                ? "split"
                : "none";
          return (
            <OccurrenceChip
              key={o.id}
              occurrence={o}
              current={effective(o, series)}
              view={v}
              isAnchor={isAnchor}
              isFocus={(focusId ?? anchorOcc?.id) === o.id}
              cleave={cleave}
              chipStyle={chipStyle}
              density={density}
              inScopeCount={view.inScope}
              stamp={stamps[o.id] ?? 0}
              committed={committed}
              motionSafe={motionSafe}
              disabled={disabled}
              label={chipLabel(o)}
              register={register}
              onChoose={choose}
              onFocusChip={setFocusId}
            />
          );
        })}
      </div>
    </div>
  );

  const form = (
    <div className="grid grid-cols-2 gap-3 @min-[34rem]:grid-cols-3">
      <Field
        label="Starts"
        value={String(draft.start)}
        onChange={(v) => setField({ start: Number(v) })}
        options={START_OPTIONS.map((m) => ({
          value: String(m),
          label: clock(m),
        }))}
        height={d.field}
        text={d.text}
        disabled={disabled || !ready}
      />
      <Field
        label="Length"
        value={String(draft.duration)}
        onChange={(v) => setField({ duration: Number(v) })}
        options={LENGTH_OPTIONS.map((m) => ({
          value: String(m),
          label: lengthText(m),
        }))}
        height={d.field}
        text={d.text}
        disabled={disabled || !ready}
      />
      <Field
        label="Room"
        value={draft.room}
        onChange={(v) => setField({ room: v })}
        options={(rooms.includes(draft.room)
          ? rooms
          : [draft.room, ...rooms]
        ).map((r) => ({ value: r, label: r }))}
        height={d.field}
        text={d.text}
        disabled={disabled || !ready}
        className="col-span-2 @min-[34rem]:col-span-1"
      />
    </div>
  );

  const scopes = (
    <div className="flex flex-col gap-1.5">
      <p
        id={`${uid}-scope`}
        className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
      >
        Apply to
      </p>
      <div
        role="radiogroup"
        aria-labelledby={`${uid}-scope`}
        className="grid grid-cols-1 gap-1.5 rounded-3 border border-hairline bg-surface-1 p-1 @min-[34rem]:grid-cols-3"
      >
        {SCOPES.map((s, i) => {
          const on = s.id === scopeNow;
          return (
            <div
              key={s.id}
              ref={(node) => {
                if (node) scopeRefs.current.set(s.id, node);
              }}
              role="radio"
              aria-checked={on}
              aria-disabled={disabled || undefined}
              tabIndex={on ? 0 : -1}
              onClick={() => setScopeTo(s.id)}
              onKeyDown={(event) => onScopeKey(event, i)}
              className={cn(
                "relative flex min-w-0 cursor-pointer items-center gap-2.5 rounded-2 px-3 py-2 select-none",
                disabled && "cursor-not-allowed",
                FOCUS_RING,
              )}
            >
              {on ? (
                <motion.span
                  layoutId={`${uid}-scope-thumb`}
                  aria-hidden
                  className="absolute inset-0 z-0 rounded-2 border border-[color-mix(in_oklab,var(--se-accent)_55%,transparent)] bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_12%,transparent)]"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                  on ? "border-(--se-accent)" : "border-hairline-strong",
                )}
              >
                <motion.span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: "var(--se-accent)" }}
                  initial={false}
                  animate={{ scale: on ? 1 : 0, opacity: on ? 1 : 0 }}
                  transition={
                    motionSafe ? springs.flick : { duration: durations.fast }
                  }
                />
              </span>
              <span className="relative z-10 min-w-0 leading-tight">
                <span className="block truncate text-[13px] font-medium text-foreground">
                  {s.label}
                </span>
                <span className="block truncate text-[11px] text-ink-3 tabular-nums">
                  {counts[s.id]}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  // The lane shows the first day that clashes, else the day being edited.
  const firstClash = view.clashes[0]?.occurrence;
  const laneOcc = firstClash ?? anchorOcc;
  const laneCaption = firstClash
    ? firstClash.id === anchorOcc?.id
      ? "clashes"
      : "first clash"
    : "the day";

  // While the list closes it keeps showing the clashes it last had, so it
  // never collapses around "0 clashes".
  const clashKey = `${view.clashes.map((c) => `${c.occurrence.id}:${c.busy.id}`).join(",")}|${spanText(draft)}`;
  const [held, setHeld] = React.useState({
    key: "",
    list: view.clashes,
    span: spanText(draft),
  });
  if (view.clashes.length > 0 && held.key !== clashKey) {
    setHeld({ key: clashKey, list: view.clashes, span: spanText(draft) });
  }
  const shownClashes = view.clashes.length > 0 ? view.clashes : held.list;
  const shownSpan = view.clashes.length > 0 ? spanText(draft) : held.span;

  const clashList = (
    <Reveal open={view.clashes.length > 0} motionSafe={motionSafe}>
      <div
        id={clashId}
        className="rounded-3 border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_7%,var(--card))] px-3 py-2.5"
      >
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warn" />
          {plural(shownClashes.length, "clash", "clashes")} before you save
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {shownClashes.map(({ occurrence: o, busy: b }) => (
            <li
              key={`${o.id}-${b.id}`}
              className="flex flex-wrap items-baseline gap-x-2 text-[12px] leading-snug"
            >
              <span className="font-mono text-[11px] text-ink-2 tabular-nums">
                {shortDate(o.date)} · {shownSpan}
              </span>
              <span className="text-ink-3">
                overlaps {b.title}{" "}
                <span className="font-mono text-[11px] tabular-nums">
                  {clock(b.start)}–{clock(b.end)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Reveal>
  );

  const loading = (
    <div aria-busy="true" className={cn("flex flex-col py-4", d.pad, d.gap)}>
      <p className="sr-only">Loading the series.</p>
      <div className={cn("flex flex-wrap", d.chipGap)}>
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            className="h-10 rounded-2 bg-surface-2 motion-safe:animate-pulse"
            style={{ width: d.chip, opacity: i % 3 === 0 ? 0.5 : 1 }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 @min-[34rem]:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "rounded-2 bg-surface-2 motion-safe:animate-pulse",
              d.field,
            )}
          />
        ))}
      </div>
      <span className="h-14 rounded-3 bg-surface-2 motion-safe:animate-pulse" />
    </div>
  );

  const ruleText = `Weekly on ${RULE_DAY[series.weekday] ?? "Thursday"} · ${spanText(series)} · ${series.room}`;

  return (
    <div
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "@container relative grid w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height, ["--se-accent" as string]: ACCENTS[accent] }}
    >
      <header
        className={cn(
          "flex items-start gap-3 border-b border-hairline py-3",
          d.pad,
        )}
      >
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2 border border-hairline bg-surface-1 text-ink-2"
        >
          <Repeat className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={titleId} className="truncate text-sm font-semibold">
            {series.title}
          </p>
          <p className="truncate text-[12px] text-ink-3 tabular-nums">
            {ruleText}
          </p>
          {splitAt && splitRule ? (
            <p className="truncate text-[12px] text-ink-2 tabular-nums">
              From {shortDate(splitAt.date)} · {spanText(splitRule)} ·{" "}
              {splitRule.room}
            </p>
          ) : null}
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys choose another date to edit; Home and End jump to the first
        and last.
      </p>

      {status === "error" ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The series did not load.</p>
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
        <div className="overflow-y-auto">{loading}</div>
      ) : upcoming.length === 0 ? (
        <div className="flex flex-col items-center-safe justify-center-safe gap-2 overflow-y-auto p-6 text-center">
          <p className="text-sm text-foreground">No upcoming meetings.</p>
          <p className="text-[12px] text-ink-3">
            The series has ended; earlier meetings are in the calendar.
          </p>
        </div>
      ) : (
        // layoutScroll: the chips' layout moves are measured against this
        // scroller, so scrolling it never reads as a move to animate.
        <motion.div
          layoutScroll
          className={cn(
            "flex [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain py-3",
            d.pad,
            d.gap,
          )}
        >
          {strip}
          {form}
          {laneOcc ? (
            <DayLane
              date={laneOcc.date}
              caption={laneCaption}
              current={effective(laneOcc, series)}
              next={
                view.rows.get(laneOcc.id)?.next ?? effective(laneOcc, series)
              }
              busy={busy.filter((b) => b.date === laneOcc.date)}
              motionSafe={motionSafe}
            />
          ) : null}
          {scopes}
          {clashList}
        </motion.div>
      )}

      <footer
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-hairline bg-surface-1 py-2.5",
          d.pad,
        )}
      >
        <p className="flex min-w-0 flex-1 basis-56 items-center gap-1.5 text-[12px] leading-snug text-ink-2">
          {flashing ? (
            <>
              <Check
                aria-hidden
                className="size-4 shrink-0 text-success"
                strokeWidth={2.5}
              />
              <span className="min-w-0">{flash.text}</span>
            </>
          ) : (
            <span className="min-w-0">
              {ready
                ? summaryOf(view, scopeNow, draft)
                : status === "loading"
                  ? "Loading"
                  : "Nothing to save"}
              {view.clashes.length > 0 ? (
                <span className="text-warn">
                  {" "}
                  · {plural(view.clashes.length, "clash", "clashes")}
                </span>
              ) : null}
            </span>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={discard}
            aria-disabled={disabled || !dirty || undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-45",
              FOCUS_RING,
            )}
          >
            <Undo2 aria-hidden className="size-3.5" />
            Discard
          </button>
          <button
            type="button"
            onClick={save}
            aria-disabled={disabled || !dirty || !ready || undefined}
            aria-describedby={view.clashes.length > 0 ? clashId : undefined}
            className={cn(
              "inline-flex h-8 items-center rounded-2 px-3.5 text-xs font-medium transition-[opacity,background-color] duration-200 hover:opacity-90 aria-disabled:pointer-events-none aria-disabled:opacity-45",
              "bg-(--se-accent) text-[oklch(0.22_0.02_258)]",
              FOCUS_RING,
            )}
          >
            Save
          </button>
        </div>
      </footer>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
