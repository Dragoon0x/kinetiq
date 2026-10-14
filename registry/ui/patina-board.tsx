"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Archive,
  GripVertical,
  Hand,
  Inbox,
  RotateCcw,
  TriangleAlert,
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

export type PatinaStyle = "sepia" | "fade" | "dust";
export type PatinaDensity = "compact" | "cozy" | "roomy";
export type PatinaStatus = "ready" | "loading" | "error";
export type PatinaAge = "fresh" | "aging" | "stale";

export type PatinaColumn = {
  id: string;
  /** The column's heading, e.g. "In progress". */
  label: string;
};

export type PatinaCard = {
  id: string;
  /** Reference, e.g. "FJ-2041". */
  ref: string;
  title: string;
  /** Who holds the job. */
  assignee?: string;
  /** A short kind, e.g. "Water". */
  tag?: string;
  /** When the card was last touched, in ms. Its age counts from here. */
  touchedAt: number;
};

/** Card id to column id. Cards missing from it sit in the first column. */
export type PatinaValue = Record<string, string>;

export type PatinaChange = {
  cardIds: string[];
  /** The column the cards went to. */
  to: string;
  reason: "move" | "archive" | "sweep";
};

export type PatinaBoardProps = {
  /** How age shows on a card: a warm sepia wash, a fade into the column, or a dusting of grey grain. @default "sepia" */
  patina?: PatinaStyle;
  /** Days untouched before a card is stale: dog-eared, tagged, and swept by "Sweep stale". @default 21 */
  staleAfterDays?: number;
  /** Card padding and type size. @default "cozy" */
  density?: PatinaDensity;
  /** Days untouched before a card starts to age: the wash begins and a corner curls. @default 7 */
  agingAfterDays?: number;
  /** The work columns, in board order. The Archive column is always last. @default defaultPatinaColumns */
  columns?: PatinaColumn[];
  /** The cards, with when each was last touched. @default defaultPatinaCards */
  cards?: PatinaCard[];
  /** Controlled placement: card id to column id. */
  value?: PatinaValue;
  /** Initial placement when uncontrolled. @default defaultPatinaValue */
  defaultValue?: PatinaValue;
  /** Fires from the drop, key, press or sweep that moved cards, with the whole placement. */
  onChange?: (value: PatinaValue, change: PatinaChange) => void;
  /** The moment ages count from, in ms; never read from the clock. @default defaultPatinaNow */
  now?: number;
  /** Controlled time slider: days ahead of `now` the board is viewed at. */
  scrub?: number;
  /** Initial days ahead when uncontrolled. @default 0 */
  defaultScrub?: number;
  /** The slider moved, from a drag or a key. */
  onScrubChange?: (days: number) => void;
  /** How far ahead the slider can scrub, in days. @default 45 */
  scrubDays?: number;
  /** A card was touched: its patina lifts and its age restarts at the viewing time. */
  onTouch?: (card: PatinaCard, at: number) => void;
  /** "Sweep stale" gathered these cards into the Archive. */
  onSweep?: (cards: PatinaCard[]) => void;
  /** Whether the board's data has arrived. @default "ready" */
  status?: PatinaStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Fieldline Jobs" */
  title?: string;
  /** The last column's heading. @default "Archive" */
  archiveLabel?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the board in px; its columns scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be moved, touched or swept. The slider still scrubs. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** The Archive column's id; `value` entries pointing here are archived. */
export const ARCHIVE_COLUMN = "archive";

/** Wednesday 14 October 2026, 09:00 UTC. */
export const defaultPatinaNow = Date.UTC(2026, 9, 14, 9, 0);

export const defaultPatinaColumns: PatinaColumn[] = [
  { id: "queued", label: "Queued" },
  { id: "progress", label: "In progress" },
  { id: "waiting", label: "Waiting on parts" },
];

const ago = (days: number) => defaultPatinaNow - Math.round(days * DAY);

/** Fourteen Fieldline jobs, from touched this morning to six weeks untouched. */
export const defaultPatinaCards: PatinaCard[] = [
  {
    id: "fj-2041",
    ref: "FJ-2041",
    title: "Replace meter bank, Harrow Lane",
    assignee: "Coldbrook",
    tag: "Water",
    touchedAt: ago(0.4),
  },
  {
    id: "fj-2044",
    ref: "FJ-2044",
    title: "Hydrant service, Mill Row",
    assignee: "Basinworks",
    tag: "Water",
    touchedAt: ago(2.2),
  },
  {
    id: "fj-2038",
    ref: "FJ-2038",
    title: "Kiosk clean-out, Pier Street",
    assignee: "Fernmoor",
    tag: "Power",
    touchedAt: ago(9),
  },
  {
    id: "fj-2019",
    ref: "FJ-2019",
    title: "Pole inspection, Lower Fen",
    assignee: "Night shift",
    tag: "Power",
    touchedAt: ago(26),
  },
  {
    id: "fj-2002",
    ref: "FJ-2002",
    title: "Duct clearance, Ash Walk",
    assignee: "Coldbrook",
    tag: "Cable",
    touchedAt: ago(41),
  },
  {
    id: "fj-2046",
    ref: "FJ-2046",
    title: "Cable joint repair, Quay Road",
    assignee: "Basinworks",
    tag: "Cable",
    touchedAt: ago(0.1),
  },
  {
    id: "fj-2040",
    ref: "FJ-2040",
    title: "Valve chamber survey, Dyke Lane",
    assignee: "Fernmoor",
    tag: "Water",
    touchedAt: ago(5.5),
  },
  {
    id: "fj-2031",
    ref: "FJ-2031",
    title: "Riser swap, Tannery Court",
    assignee: "Coldbrook",
    tag: "Water",
    touchedAt: ago(12),
  },
  {
    id: "fj-2024",
    ref: "FJ-2024",
    title: "Trench backfill, Orchard Close",
    assignee: "Night shift",
    tag: "Civils",
    touchedAt: ago(18.5),
  },
  {
    id: "fj-2011",
    ref: "FJ-2011",
    title: "Pump house wiring, Weir Lane",
    assignee: "Basinworks",
    tag: "Power",
    touchedAt: ago(33),
  },
  {
    id: "fj-2043",
    ref: "FJ-2043",
    title: "Main tie-in, Kiln Yard",
    assignee: "Coldbrook",
    tag: "Water",
    touchedAt: ago(3.1),
  },
  {
    id: "fj-2035",
    ref: "FJ-2035",
    title: "Leak repair, Salt Road",
    assignee: "Fernmoor",
    tag: "Water",
    touchedAt: ago(7.8),
  },
  {
    id: "fj-2027",
    ref: "FJ-2027",
    title: "Meter swap, Gable End",
    assignee: "Basinworks",
    tag: "Water",
    touchedAt: ago(15),
  },
  {
    id: "fj-2008",
    ref: "FJ-2008",
    title: "Riser swap, Fold Street",
    assignee: "Night shift",
    tag: "Civils",
    touchedAt: ago(36),
  },
];

export const defaultPatinaValue: PatinaValue = {
  "fj-2041": "queued",
  "fj-2044": "queued",
  "fj-2038": "queued",
  "fj-2019": "queued",
  "fj-2002": "queued",
  "fj-2046": "progress",
  "fj-2040": "progress",
  "fj-2031": "progress",
  "fj-2024": "progress",
  "fj-2011": "progress",
  "fj-2043": "waiting",
  "fj-2035": "waiting",
  "fj-2027": "waiting",
  "fj-2008": "waiting",
};

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

/** "Wed 14 Oct", read in UTC so server and client agree. */
const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const ageWords = (days: number) => {
  if (days < 1) return "touched today";
  if (days < 2) return "touched yesterday";
  if (days < 14) return `touched ${Math.floor(days)} days ago`;
  if (days < 60) return `touched ${Math.floor(days / 7)} weeks ago`;
  return `touched ${Math.floor(days / 30)} months ago`;
};

const ageShort = (days: number) =>
  days < 1 ? "today" : days < 2 ? "1d" : `${Math.floor(days)}d`;

const ageOf = (days: number, aging: number, stale: number): PatinaAge =>
  days >= stale ? "stale" : days >= aging ? "aging" : "fresh";

/**
 * How deep the patina sits: 0 until a card starts to age, 1 at the stale
 * mark, and on to 1.3 by twice that, so a forgotten card keeps darkening.
 */
const depthOf = (days: number, aging: number, stale: number) => {
  const span = Math.max(stale - aging, 0.5);
  const base = clamp((days - aging) / span, 0, 1);
  const beyond = clamp((days - stale) / Math.max(stale, 1), 0, 0.3);
  return r3(base + beyond);
};

const STYLE_MAX: Record<PatinaStyle, number> = {
  sepia: 0.46,
  fade: 0.66,
  dust: 0.62,
};

const AGE_WORD: Record<PatinaAge, string> = {
  fresh: "fresh",
  aging: "aging",
  stale: "stale",
};

type View = {
  card: PatinaCard;
  columnId: string;
  days: number;
  age: PatinaAge;
  depth: number;
};

/** Cards past the stale mark and not yet archived, for hosts showing a count. */
export const countPatinaStale = (
  cards: PatinaCard[],
  value: PatinaValue,
  viewingAt: number,
  staleAfterDays: number,
  touched: Record<string, number> = {},
) =>
  cards.filter((card) => {
    if (value[card.id] === ARCHIVE_COLUMN) return false;
    const at = Math.max(card.touchedAt, touched[card.id] ?? 0);
    return (viewingAt - at) / DAY >= staleAfterDays;
  }).length;

/* ----------------------------------------------------------------------- */
/*                               Patina layers                              */
/* ----------------------------------------------------------------------- */

const overlayStyle = (style: PatinaStyle): React.CSSProperties => {
  if (style === "sepia") {
    return {
      background: "color-mix(in oklab, var(--pb-sepia) 44%, transparent)",
    };
  }
  if (style === "fade") return { background: "var(--pb-col)" };
  return {
    backgroundColor: "color-mix(in oklab, var(--ink-3) 12%, transparent)",
    backgroundImage:
      "radial-gradient(color-mix(in oklab, var(--ink-3) 60%, transparent) 0.7px, transparent 0.9px)",
    backgroundSize: "4px 4px",
  };
};

const contentFilter = (style: PatinaStyle, depth: number) => {
  const d = Math.min(depth, 1);
  if (style === "sepia") {
    return `sepia(${r3(0.7 * d)}) saturate(${r3(1 - 0.35 * d)}) grayscale(0)`;
  }
  if (style === "dust") return `sepia(0) saturate(1) grayscale(${r3(0.6 * d)})`;
  return "sepia(0) saturate(1) grayscale(0)";
};

/** A tinted wash over the card and, for sepia and dust, a filter on its ink. */
function Wash({
  style,
  depth,
  lifting,
  motionSafe,
}: {
  style: PatinaStyle;
  depth: number;
  lifting: boolean;
  motionSafe: boolean;
}) {
  const opacity = r3(Math.min(depth, 1.3) * STYLE_MAX[style]);
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute inset-0 rounded-[inherit]"
      style={overlayStyle(style)}
      initial={false}
      animate={{ opacity }}
      transition={
        !motionSafe
          ? { duration: 0 }
          : lifting
            ? springs.snap
            : { duration: durations.page, ease: easings.move }
      }
    />
  );
}

/** The curled corner: a small curl while aging, a dog-ear once stale. */
function Fold({ size, motionSafe }: { size: number; motionSafe: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="pointer-events-none absolute -top-px -right-px rounded-tr-[inherit]"
      style={{
        transformOrigin: "100% 0%",
        background:
          "linear-gradient(225deg, var(--pb-col) 0 50%, color-mix(in oklab, var(--ink) 26%, transparent) 50% calc(50% + 1px), var(--pb-fold) calc(50% + 1px) 100%)",
      }}
      initial={motionSafe ? { scale: 0, width: size, height: size } : false}
      animate={{ scale: 1, width: size, height: size }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.6 : 1,
        transition: exitFor(durations.fast),
      }}
      transition={motionSafe ? springs.snap : { duration: 0 }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Card                                   */
/* ----------------------------------------------------------------------- */

const DENSITY: Record<
  PatinaDensity,
  { pad: string; title: string; meta: string; fold: [number, number] }
> = {
  compact: {
    pad: "px-2 py-1.5 gap-0.5",
    title: "text-[12px] leading-4",
    meta: "text-[10px]",
    fold: [10, 16],
  },
  cozy: {
    pad: "px-2.5 py-2 gap-1",
    title: "text-[13px] leading-[1.15rem]",
    meta: "text-[10px]",
    fold: [12, 20],
  },
  roomy: {
    pad: "px-3 py-2.5 gap-1.5",
    title: "text-sm leading-5",
    meta: "text-[11px]",
    fold: [14, 24],
  },
};

function Face({
  view,
  patina,
  density,
  lifting,
  motionSafe,
}: {
  view: View;
  patina: PatinaStyle;
  density: PatinaDensity;
  lifting: boolean;
  motionSafe: boolean;
}) {
  const d = DENSITY[density];
  const stale = view.age === "stale";
  const inkOpacity = r3(1 - Math.min(view.depth, 1) * 0.3);
  return (
    <>
      <motion.span
        className={cn("relative flex min-w-0 flex-col", d.pad)}
        initial={false}
        animate={{
          opacity: inkOpacity,
          filter: contentFilter(patina, view.depth),
        }}
        transition={
          !motionSafe
            ? { duration: 0 }
            : lifting
              ? springs.snap
              : { duration: durations.page, ease: easings.move }
        }
      >
        <span className="flex items-center gap-1.5 pr-4">
          <span
            className={cn(
              "font-mono tracking-[0.04em] text-ink-3 tabular-nums",
              d.meta,
            )}
          >
            {view.card.ref}
          </span>
          <AnimatePresence initial={false}>
            {stale ? (
              <motion.span
                key="stale"
                initial={motionSafe ? { opacity: 0, scale: 0.85 } : false}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe ? springs.flick : { duration: durations.fast }
                }
                className="rounded-1 border border-[color-mix(in_oklab,var(--pb-stale)_45%,transparent)] px-1 font-mono text-[9px] tracking-[0.08em] text-(--pb-stale) uppercase"
              >
                stale
              </motion.span>
            ) : null}
          </AnimatePresence>
          {view.card.tag ? (
            <span
              className={cn(
                "ml-auto truncate font-mono tracking-[0.06em] text-ink-3 uppercase",
                d.meta,
              )}
            >
              {view.card.tag}
            </span>
          ) : null}
        </span>
        <span className={cn("truncate text-foreground", d.title)}>
          {view.card.title}
        </span>
        <span
          className={cn(
            "flex items-center justify-between gap-2 text-ink-3",
            d.meta,
          )}
        >
          <span className="truncate">{view.card.assignee ?? "Unassigned"}</span>
          <span className="shrink-0 font-mono tabular-nums">
            {ageShort(view.days)}
          </span>
        </span>
      </motion.span>
      <Wash
        style={patina}
        depth={view.depth}
        lifting={lifting}
        motionSafe={motionSafe}
      />
      <AnimatePresence initial={false}>
        {view.age !== "fresh" ? (
          <Fold
            key="fold"
            size={stale ? d.fold[1] : d.fold[0]}
            motionSafe={motionSafe}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

type CardProps = {
  view: View;
  patina: PatinaStyle;
  density: PatinaDensity;
  motionSafe: boolean;
  layoutKey: string | undefined;
  /** Arrives from a gap; a card that travelled here never fades in. */
  enter: boolean;
  /** Landed from a drop: a small settle on recoil. */
  landed: boolean;
  lifting: boolean;
  sweepDelay: number;
  dragging: boolean;
  open: boolean;
  tabIndex: number;
  inert: boolean;
  hintId: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onOpen: () => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onGrip: (event: React.PointerEvent<HTMLSpanElement>) => void;
};

function Card({
  view,
  patina,
  density,
  motionSafe,
  layoutKey,
  enter,
  landed,
  lifting,
  sweepDelay,
  dragging,
  open,
  tabIndex,
  inert,
  hintId,
  nodeRef,
  onOpen,
  onFocus,
  onKeyDown,
  onGrip,
}: CardProps) {
  return (
    <motion.div
      ref={nodeRef}
      role="gridcell"
      tabIndex={tabIndex}
      aria-selected={open || undefined}
      aria-label={`${view.card.ref}, ${view.card.title}, ${ageWords(view.days)}, ${AGE_WORD[view.age]}`}
      aria-describedby={hintId}
      aria-disabled={inert || undefined}
      layoutId={layoutKey}
      layout={motionSafe ? "position" : false}
      initial={
        enter
          ? { opacity: 0, y: motionSafe ? distances.nudge : 0 }
          : landed && motionSafe
            ? { scale: 0.96 }
            : false
      }
      animate={{ opacity: dragging ? 0.35 : 1, y: 0, scale: 1 }}
      transition={{
        layout: { ...springs.glide, delay: sweepDelay },
        y: springs.glide,
        scale: springs.recoil,
        opacity: { duration: durations.base, ease: easings.enter },
      }}
      onClick={onOpen}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative flex shrink-0 rounded-2 border border-hairline bg-card text-left select-none",
        open && "border-cobalt-bright",
        inert ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span className="relative flex min-w-0 flex-1 overflow-hidden rounded-[inherit]">
        <Face
          view={view}
          patina={patina}
          density={density}
          lifting={lifting}
          motionSafe={motionSafe}
        />
      </span>
      {/* The drag surface: only this strip gives up touch scrolling. */}
      <span
        aria-hidden
        onPointerDown={onGrip}
        onClick={(event) => event.stopPropagation()}
        className={cn(
          "flex w-5 shrink-0 touch-none items-center justify-center rounded-r-[inherit] text-ink-3 transition-colors",
          inert
            ? "cursor-default"
            : "cursor-grab hover:bg-surface-2 active:cursor-grabbing",
        )}
      >
        <GripVertical className="size-3.5" />
      </span>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                Time slider                               */
/* ----------------------------------------------------------------------- */

function TimeSlider({
  value,
  max,
  valueText,
  disabled,
  motionSafe,
  onChange,
}: {
  value: number;
  max: number;
  valueText: string;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (days: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const pct = max > 0 ? (clamp(value, 0, max) / max) * 100 : 0;

  const fromPointer = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return value;
    const t = clamp((clientX - rect.left) / rect.width, 0, 1);
    return Math.round(t * max);
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Viewing time"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={clamp(value, 0, max)}
      aria-valuetext={valueText}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      onPointerDown={(event) => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
        setDragging(true);
        onChange(fromPointer(event.clientX));
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        onChange(fromPointer(event.clientX));
      }}
      onPointerUp={(event) => {
        if (!dragging) return;
        setDragging(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      onKeyDown={(event) => {
        if (disabled) return;
        const big = Math.max(1, Math.min(7, max));
        let next: number | null = null;
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
          next = value + (event.shiftKey ? big : 1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
          next = value - (event.shiftKey ? big : 1);
        } else if (event.key === "PageUp") next = value + big;
        else if (event.key === "PageDown") next = value - big;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = max;
        if (next === null) return;
        event.preventDefault();
        onChange(clamp(Math.round(next), 0, max));
      }}
      className={cn(
        "relative h-6 min-w-0 flex-1 touch-none rounded-2",
        disabled ? "cursor-default" : "cursor-pointer",
        FOCUS_RING,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2"
      />
      <motion.span
        aria-hidden
        className="absolute top-1/2 left-0 h-1 rounded-full bg-[color-mix(in_oklab,var(--pb-sepia)_60%,var(--hairline-strong))]"
        style={{ y: "-50%" }}
        initial={false}
        animate={{ width: `${r3(pct)}%` }}
        transition={dragging || !motionSafe ? { duration: 0 } : springs.snap}
      />
      <motion.span
        aria-hidden
        className="absolute top-1/2 size-3.5 rounded-full border-2 border-card bg-foreground shadow-[0_1px_3px_color-mix(in_oklab,var(--ink)_30%,transparent)]"
        style={{ x: "-50%", y: "-50%" }}
        initial={false}
        animate={{ left: `${r3(pct)}%`, scale: dragging ? 1.15 : 1 }}
        transition={
          dragging || !motionSafe
            ? { left: { duration: 0 }, scale: springs.flick }
            : { left: springs.snap, scale: springs.flick }
        }
      />
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Legend                                  */
/* ----------------------------------------------------------------------- */

function Legend({
  patina,
  agingAfterDays,
  staleAfterDays,
}: {
  patina: PatinaStyle;
  agingAfterDays: number;
  staleAfterDays: number;
}) {
  const items: { age: PatinaAge; depth: number; text: string }[] = [
    { age: "fresh", depth: 0, text: `under ${agingAfterDays}d` },
    {
      age: "aging",
      depth: 0.5,
      text: `${agingAfterDays}-${staleAfterDays}d`,
    },
    { age: "stale", depth: 1.1, text: `${staleAfterDays}d and over` },
  ];
  return (
    <ul
      aria-label="Age legend"
      className="flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      {items.map((item) => (
        <li key={item.age} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="relative block h-3 w-4 overflow-hidden rounded-[3px] border border-hairline bg-card"
          >
            <span
              className="absolute inset-0"
              style={{
                ...overlayStyle(patina),
                opacity: r3(Math.min(item.depth, 1.3) * STYLE_MAX[patina]),
              }}
            />
            {item.age !== "fresh" ? (
              <span
                className="absolute -top-px -right-px"
                style={{
                  width: item.age === "stale" ? 7 : 4,
                  height: item.age === "stale" ? 7 : 4,
                  background:
                    "linear-gradient(225deg, var(--pb-col) 0 50%, var(--pb-fold) 50% 100%)",
                }}
              />
            ) : null}
          </span>
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {AGE_WORD[item.age]}{" "}
            <span className="tracking-normal normal-case">{item.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Drag = {
  id: string;
  fromColumn: string;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  /** Where the card sat in the root when it was picked up. */
  left: number;
  top: number;
  width: number;
  over: string | null;
  rects: { id: string; rect: DOMRect }[];
};

/**
 * A three-column job board whose cards age in view. Every card carries a
 * patina that deepens with the time since it was last touched: a fresh card
 * is clean, a card a week old takes a faint sepia wash and its corner curls
 * on `springs.snap`, and a card a month old is dog-eared and tagged stale.
 * A time slider scrubs the board forward from `now`, and the washes deepen
 * behind it on a slow tween, as if the paper were yellowing. Open a card and
 * press Touch and the wash lifts on `springs.snap`, the fold falls away and
 * its age restarts. Sweep stale gathers every stale card into the Archive
 * column on `springs.glide`, each a beat after the last on `cascade`, while
 * the column opens to take them; a card dropped into a column settles on
 * `springs.recoil`.
 *
 * The cards are one grid with a single tab stop: Up/Down move within a
 * column, Left/Right across, Home/End to a column's ends, Shift with
 * Left/Right carries the card to the next column, Enter or Space opens it,
 * T touches it and Delete archives it. The slider is a slider: arrows step a
 * day, Shift or Page keys a week. Under reduced motion the washes and folds
 * change in place and a moved card appears where it landed; every age, count
 * and placement is still reached and announced.
 */
export function PatinaBoard({
  patina = "sepia",
  staleAfterDays = 21,
  density = "cozy",
  agingAfterDays = 7,
  columns = defaultPatinaColumns,
  cards = defaultPatinaCards,
  value,
  defaultValue = defaultPatinaValue,
  onChange,
  now = defaultPatinaNow,
  scrub,
  defaultScrub = 0,
  onScrubChange,
  scrubDays = 45,
  onTouch,
  onSweep,
  status = "ready",
  onRetry,
  title = "Fieldline Jobs",
  archiveLabel = "Archive",
  label,
  height = 540,
  disabled = false,
  className,
}: PatinaBoardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const panelId = `${uid}-panel`;

  const [own, setOwn] = React.useState<PatinaValue>(defaultValue);
  const current = value ?? own;
  const [ownScrub, setOwnScrub] = React.useState(defaultScrub);
  const scrubNow = clamp(Math.round(scrub ?? ownScrub), 0, scrubDays);
  const viewingAt = now + scrubNow * DAY;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [touched, setTouched] = React.useState<Record<string, number>>({});
  const [lifting, setLifting] = React.useState<string | null>(null);
  const [landed, setLanded] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);
  const [active, setActive] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, so cards already on the page
  // never fade in; true for cards that mount later.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  // Per-card delays for the sweep's cascade; cleared once the last has landed.
  const [sweeping, setSweeping] = React.useState<Record<string, number>>({});

  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const colNodes = React.useRef(new Map<string, HTMLElement>());
  const dragRef = React.useRef<Drag | null>(null);
  const timers = React.useRef(new Set<number>());
  const lastStale = React.useRef<number | null>(null);

  const after = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };
  React.useEffect(() => {
    const set = timers.current;
    return () => {
      for (const id of set) window.clearTimeout(id);
      set.clear();
    };
  }, []);

  /* -------------------------------- data ------------------------------- */

  const aging = Math.min(agingAfterDays, staleAfterDays);
  const allColumns: PatinaColumn[] = [
    ...columns,
    { id: ARCHIVE_COLUMN, label: archiveLabel },
  ];
  const firstColumn = columns[0]?.id ?? ARCHIVE_COLUMN;
  const knownColumn = (id: string | undefined) =>
    id !== undefined && allColumns.some((c) => c.id === id) ? id : firstColumn;

  const views: View[] = cards.map((card) => {
    const at = Math.max(card.touchedAt, touched[card.id] ?? 0);
    const days = Math.max(0, (viewingAt - at) / DAY);
    return {
      card,
      columnId: knownColumn(current[card.id]),
      days,
      age: ageOf(days, aging, staleAfterDays),
      depth: depthOf(days, aging, staleAfterDays),
    };
  });
  const byId = new Map(views.map((v) => [v.card.id, v]));
  const byColumn = new Map<string, View[]>(allColumns.map((c) => [c.id, []]));
  for (const v of views) byColumn.get(v.columnId)?.push(v);
  const archived = byColumn.get(ARCHIVE_COLUMN) ?? [];
  const staleViews = views.filter(
    (v) => v.age === "stale" && v.columnId !== ARCHIVE_COLUMN,
  );
  const staleCount = staleViews.length;
  const empty = cards.length === 0;

  /** Columns a key can land in: the Archive only once something is in it. */
  const navColumns = allColumns.filter(
    (c) => c.id !== ARCHIVE_COLUMN || archived.length > 0,
  );
  const navIds = navColumns.flatMap((c) =>
    (byColumn.get(c.id) ?? []).map((v) => v.card.id),
  );
  const activeId =
    active && navIds.includes(active) ? active : (navIds[0] ?? null);

  /* ------------------------------- changes ----------------------------- */

  const place = (ids: string[], to: string, reason: PatinaChange["reason"]) => {
    if (ids.length === 0) return;
    const next: PatinaValue = { ...current };
    for (const id of ids) next[id] = to;
    if (value === undefined) setOwn(next);
    onChange?.(next, { cardIds: ids, to, reason });
  };

  const columnLabel = (id: string) =>
    allColumns.find((c) => c.id === id)?.label ?? id;

  const moveCard = (
    id: string,
    to: string,
    reason: PatinaChange["reason"],
    follow: boolean,
  ) => {
    if (inert) return;
    const view = byId.get(id);
    if (!view || view.columnId === to) return;
    place([id], to, reason);
    setLanded(id);
    after(700, () => setLanded((l) => (l === id ? null : l)));
    setAnnouncement(
      `${view.card.ref} ${to === ARCHIVE_COLUMN ? "archived" : `moved to ${columnLabel(to)}`}.`,
    );
    if (follow) setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
  };

  const touchCard = (id: string) => {
    if (inert) return;
    const view = byId.get(id);
    if (!view) return;
    setTouched((t) => ({ ...t, [id]: viewingAt }));
    setLifting(id);
    after(500, () => setLifting((l) => (l === id ? null : l)));
    onTouch?.(view.card, viewingAt);
    setAnnouncement(`${view.card.ref} touched, fresh again.`);
  };

  const sweep = () => {
    if (inert || staleViews.length === 0) return;
    const step = cascade(staleViews.length);
    const delays: Record<string, number> = {};
    staleViews.forEach((v, i) => {
      delays[v.card.id] = r3(i * step);
    });
    setSweeping(delays);
    after((staleViews.length * step + 0.7) * 1000, () => setSweeping({}));
    place(
      staleViews.map((v) => v.card.id),
      ARCHIVE_COLUMN,
      "sweep",
    );
    onSweep?.(staleViews.map((v) => v.card));
    setOpen((o) => (o && staleViews.some((v) => v.card.id === o) ? null : o));
    setAnnouncement(
      `Swept ${staleViews.length} stale ${staleViews.length === 1 ? "job" : "jobs"} to ${archiveLabel}.`,
    );
  };

  const setScrub = (days: number) => {
    const next = clamp(Math.round(days), 0, scrubDays);
    if (next === scrubNow) return;
    if (scrub === undefined) setOwnScrub(next);
    onScrubChange?.(next);
    const n = countPatinaStale(
      cards,
      current,
      now + next * DAY,
      staleAfterDays,
      touched,
    );
    if (lastStale.current !== n) {
      lastStale.current = n;
      setAnnouncement(
        `Viewing ${next === 0 ? "today" : `${next} days ahead`}: ${n} stale.`,
      );
    }
  };

  /* -------------------------------- focus ------------------------------ */

  // Focus follows a card to the column it landed in, bound after the DOM moved.
  React.useLayoutEffect(() => {
    if (!focusReq) return;
    cardNodes.current.get(focusReq.id)?.focus({ preventScroll: true });
  }, [focusReq]);

  React.useEffect(() => {
    if (!open) return;
    const node =
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    node?.focus({ preventScroll: true });
  }, [open]);

  const closePanel = (returnFocus: boolean) => {
    const id = open;
    setOpen(null);
    if (returnFocus && id) {
      setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (cardNodes.current.get(open)?.contains(target)) return;
      setOpen(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  /* ------------------------------ keyboard ----------------------------- */

  const onCardKey = (event: React.KeyboardEvent, id: string) => {
    const view = byId.get(id);
    if (!view) return;
    const colIndex = navColumns.findIndex((c) => c.id === view.columnId);
    const list = (byColumn.get(view.columnId) ?? []).map((v) => v.card.id);
    const i = list.indexOf(id);
    const focusTo = (target: string | undefined) => {
      if (target) cardNodes.current.get(target)?.focus();
    };
    const sideways = (dir: 1 | -1) => {
      for (let c = colIndex + dir; c >= 0 && c < navColumns.length; c += dir) {
        const col = navColumns[c];
        const items = col ? (byColumn.get(col.id) ?? []) : [];
        if (items.length > 0) {
          return items[clamp(i, 0, items.length - 1)]?.card.id;
        }
      }
      return undefined;
    };
    const carry = (dir: 1 | -1) => {
      const workIndex = allColumns.findIndex((c) => c.id === view.columnId);
      const to = allColumns[workIndex + dir];
      if (to) moveCard(id, to.id, "move", true);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusTo(list[Math.min(i + 1, list.length - 1)]);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusTo(list[Math.max(i - 1, 0)]);
        return;
      case "ArrowRight":
        event.preventDefault();
        if (event.shiftKey) carry(1);
        else focusTo(sideways(1));
        return;
      case "ArrowLeft":
        event.preventDefault();
        if (event.shiftKey) carry(-1);
        else focusTo(sideways(-1));
        return;
      case "Home":
        event.preventDefault();
        focusTo(list[0]);
        return;
      case "End":
        event.preventDefault();
        focusTo(list[list.length - 1]);
        return;
      case "Enter":
      case " ":
        event.preventDefault();
        setOpen((o) => (o === id ? null : id));
        return;
      case "t":
      case "T":
        event.preventDefault();
        touchCard(id);
        return;
      case "Delete":
      case "Backspace":
        event.preventDefault();
        moveCard(id, ARCHIVE_COLUMN, "archive", true);
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          closePanel(false);
        }
        return;
      default:
        return;
    }
  };

  /* -------------------------------- drag ------------------------------- */

  const onGrip = (event: React.PointerEvent<HTMLSpanElement>, id: string) => {
    if (inert || event.button !== 0) return;
    const board = boardRef.current;
    const node = cardNodes.current.get(id);
    const view = byId.get(id);
    if (!board || !node || !view) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const br = board.getBoundingClientRect();
    const cr = node.getBoundingClientRect();
    const rects = allColumns
      .map((c) => {
        const el = colNodes.current.get(c.id);
        return el ? { id: c.id, rect: el.getBoundingClientRect() } : null;
      })
      .filter((r): r is { id: string; rect: DOMRect } => r !== null);
    const next: Drag = {
      id,
      fromColumn: view.columnId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      left: cr.left - br.left,
      top: cr.top - br.top,
      width: cr.width,
      over: view.columnId,
      rects,
    };
    dragRef.current = next;
    setOpen(null);
    setDrag(next);
  };

  // The drop reads the latest data, not the render the listener was bound in.
  const dropRef = React.useRef<(id: string, to: string) => void>(() => {});
  React.useEffect(() => {
    dropRef.current = (id, to) =>
      moveCard(id, to, to === ARCHIVE_COLUMN ? "archive" : "move", false);
  });

  // The grip holds the pointer, so its moves bubble up to the document from
  // wherever the pointer goes; the drop is read there too.
  const dragging = drag !== null;
  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const x = event.clientX;
      const y = event.clientY;
      const hit = d.rects.find(
        ({ rect }) =>
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom,
      );
      const next: Drag = {
        ...d,
        dx: x - d.startX,
        dy: y - d.startY,
        over: hit ? hit.id : null,
      };
      dragRef.current = next;
      setDrag(next);
    };
    const onEnd = (event: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || event.type === "pointercancel") return;
      if (d.over && d.over !== d.fromColumn) {
        dropRef.current(d.id, d.over);
      }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onEnd);
      document.removeEventListener("pointercancel", onEnd);
    };
  }, [dragging]);

  /* ------------------------------- render ------------------------------ */

  const openView = open ? byId.get(open) : undefined;
  const dragView = drag ? byId.get(drag.id) : undefined;
  const viewingText = `${scrubNow === 0 ? "today" : `${scrubNow} days ahead`}, ${fmtDate(viewingAt)}`;

  const renderColumn = (column: PatinaColumn) => {
    const items = byColumn.get(column.id) ?? [];
    const isArchive = column.id === ARCHIVE_COLUMN;
    const stub = isArchive && items.length === 0;
    const staleHere = items.filter((v) => v.age === "stale").length;
    const over = drag?.over === column.id && drag.fromColumn !== column.id;
    return (
      <motion.section
        key={column.id}
        ref={(node) => {
          if (node) colNodes.current.set(column.id, node);
          else colNodes.current.delete(column.id);
        }}
        role="row"
        aria-label={`${column.label}, ${items.length} ${items.length === 1 ? "job" : "jobs"}`}
        layout={motionSafe}
        transition={{ layout: springs.glide }}
        className={cn(
          "flex shrink-0 flex-col rounded-3 border border-transparent bg-surface-0 transition-colors duration-200 @min-[40rem]:min-h-0 @min-[40rem]:min-w-0",
          stub
            ? "@min-[40rem]:w-10 @min-[40rem]:flex-none"
            : isArchive
              ? "@min-[40rem]:flex-[0.8]"
              : "@min-[40rem]:flex-1",
          over && "border-cobalt-bright bg-cobalt-wash",
        )}
      >
        <header
          className={cn(
            "flex shrink-0 items-center gap-2 px-2.5 pt-2 pb-1.5",
            stub &&
              "@min-[40rem]:flex-col @min-[40rem]:px-0 @min-[40rem]:pt-2.5",
          )}
        >
          {isArchive ? (
            <Archive aria-hidden className="size-3.5 shrink-0 text-ink-3" />
          ) : null}
          <span
            className={cn(
              "min-w-0 truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase",
              stub && "@min-[40rem]:hidden",
            )}
          >
            {column.label}
          </span>
          <span
            className={cn(
              "ml-auto font-mono text-[10px] text-ink-3 tabular-nums",
              stub && "@min-[40rem]:ml-0",
            )}
          >
            {items.length}
          </span>
          {staleHere > 0 && !isArchive ? (
            <span className="font-mono text-[10px] text-(--pb-stale) tabular-nums">
              {staleHere} stale
            </span>
          ) : null}
        </header>
        <div
          role="presentation"
          className={cn(
            "flex flex-col gap-1.5 px-1.5 pb-1.5 @min-[40rem]:min-h-0 @min-[40rem]:flex-1 @min-[40rem]:overflow-y-auto @min-[40rem]:overscroll-contain",
            stub && "@min-[40rem]:hidden",
          )}
        >
          {items.map((v) => (
            <Card
              key={v.card.id}
              view={v}
              patina={patina}
              density={density}
              motionSafe={motionSafe}
              layoutKey={motionSafe ? `${uid}-card-${v.card.id}` : undefined}
              enter={live && v.card.id !== landed && !(v.card.id in sweeping)}
              landed={v.card.id === landed}
              lifting={v.card.id === lifting}
              sweepDelay={sweeping[v.card.id] ?? 0}
              dragging={drag?.id === v.card.id}
              open={open === v.card.id}
              tabIndex={v.card.id === activeId ? 0 : -1}
              inert={inert}
              hintId={hintId}
              nodeRef={(node) => {
                if (node) cardNodes.current.set(v.card.id, node);
                else cardNodes.current.delete(v.card.id);
              }}
              onOpen={() => {
                if (drag) return;
                setOpen((o) => (o === v.card.id ? null : v.card.id));
              }}
              onFocus={() => setActive(v.card.id)}
              onKeyDown={(event) => onCardKey(event, v.card.id)}
              onGrip={(event) => onGrip(event, v.card.id)}
            />
          ))}
          {items.length === 0 ? (
            <p
              className={cn(
                "rounded-2 border border-dashed border-hairline px-2 py-3 text-center text-[11px] text-ink-3",
                stub && "@min-[40rem]:hidden",
              )}
            >
              {isArchive ? "Nothing archived" : "Nothing here"}
            </p>
          ) : null}
        </div>
      </motion.section>
    );
  };

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
        ["--pb-col" as string]: "var(--bg-0)",
        ["--pb-fold" as string]:
          "color-mix(in oklab, var(--ink) 14%, var(--card))",
        ["--pb-sepia" as string]:
          "color-mix(in oklab, var(--warn) 62%, var(--ink-3))",
        ["--pb-stale" as string]:
          "color-mix(in oklab, var(--warn) 55%, var(--ink-2))",
      }}
    >
      <p id={hintId} className="sr-only">
        Arrows move between jobs, Shift with Left or Right carries a job to the
        next column, Enter opens it, T touches it, Delete archives it.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <p className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            viewing {fmtDate(viewingAt)}
            {scrubNow > 0 ? ` · +${scrubNow}d` : ""}
          </p>
        </div>
        {ready && !empty ? (
          <button
            type="button"
            onClick={sweep}
            aria-disabled={inert || staleCount === 0 || undefined}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border px-2.5 text-xs transition-colors",
              !inert && staleCount > 0
                ? "border-hairline text-foreground hover:bg-surface-2"
                : "cursor-default border-transparent text-ink-3",
              FOCUS_RING,
            )}
          >
            <Archive aria-hidden className="size-3.5" />
            <span className="hidden @min-[24rem]:inline">Sweep stale</span>
            <span className="@min-[24rem]:hidden">Sweep</span>
            <span className="font-mono text-[11px] tabular-nums opacity-80">
              {staleCount}
            </span>
          </button>
        ) : null}
      </header>

      <div
        ref={boardRef}
        className="relative flex min-h-0 flex-1 flex-col border-t border-hairline"
      >
        {status === "loading" ? (
          <div
            aria-hidden
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-3 @min-[40rem]:flex-row @min-[40rem]:gap-3"
          >
            {Array.from({ length: 3 }, (_, c) => (
              <div
                key={c}
                className="flex flex-col gap-1.5 rounded-3 bg-surface-0 p-1.5 pt-2 @min-[40rem]:flex-1"
              >
                <span className="mx-1 mb-1 h-2.5 w-16 rounded-full bg-surface-2 motion-safe:animate-pulse" />
                {Array.from({ length: 3 - (c % 2) }, (_, i) => (
                  <span
                    key={i}
                    className="h-14 rounded-2 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${(c * 3 + i) * 80}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The board didn&apos;t load.
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
        ) : empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
            <Inbox aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">No jobs on the board.</p>
            <p className="max-w-xs text-[12px] text-ink-3">
              New jobs arrive clean and age from the day they land; touch one to
              keep it fresh.
            </p>
          </div>
        ) : (
          <LayoutGroup id={uid}>
            <div
              role="grid"
              aria-label={`${title} board`}
              aria-rowcount={allColumns.length}
              className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3 @min-[40rem]:flex-row @min-[40rem]:gap-3 @min-[40rem]:overflow-y-hidden"
            >
              {allColumns.map(renderColumn)}
            </div>
          </LayoutGroup>
        )}

        {/* The lifted card, drawn over the board while a pointer carries it. */}
        <AnimatePresence>
          {drag && dragView ? (
            <motion.div
              key="ghost"
              aria-hidden
              className="pointer-events-none absolute z-30 flex rounded-2 border border-hairline-strong bg-card shadow-[0_12px_28px_-10px_color-mix(in_oklab,var(--ink)_45%,transparent)]"
              style={{
                left: drag.left,
                top: drag.top,
                width: drag.width,
                x: drag.dx,
                y: drag.dy,
              }}
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: 1, scale: motionSafe ? 1.03 : 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            >
              <span className="relative flex min-w-0 flex-1 overflow-hidden rounded-[inherit]">
                <Face
                  view={dragView}
                  patina={patina}
                  density={density}
                  lifting={false}
                  motionSafe={false}
                />
              </span>
              <span className="flex w-5 shrink-0 items-center justify-center text-ink-3">
                <GripVertical className="size-3.5" />
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {openView ? (
            <motion.div
              key={openView.card.id}
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={`${openView.card.ref}, ${openView.card.title}`}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closePanel(true);
                }
              }}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { ...springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
              className="absolute inset-x-3 bottom-3 z-20 flex flex-col gap-2.5 rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    <span>{openView.card.ref}</span>
                    <span
                      className={cn(
                        "rounded-1 border px-1",
                        openView.age === "fresh"
                          ? "border-[color-mix(in_oklab,var(--success)_45%,transparent)] text-success"
                          : openView.age === "aging"
                            ? "border-[color-mix(in_oklab,var(--warn)_45%,transparent)] text-warn"
                            : "border-[color-mix(in_oklab,var(--pb-stale)_45%,transparent)] text-(--pb-stale)",
                      )}
                    >
                      {AGE_WORD[openView.age]}
                    </span>
                  </p>
                  <p className="truncate text-sm font-medium text-foreground">
                    {openView.card.title}
                  </p>
                  <p className="truncate text-[11px] text-ink-2">
                    {columnLabel(openView.columnId)} ·{" "}
                    {openView.card.assignee ?? "Unassigned"} ·{" "}
                    {ageWords(openView.days)}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => closePanel(true)}
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-autofocus
                  onClick={() => touchCard(openView.card.id)}
                  aria-disabled={inert || undefined}
                  className={cn(
                    "inline-flex h-7 items-center gap-1.5 rounded-2 px-2.5 text-xs font-medium transition-colors",
                    inert
                      ? "cursor-default bg-surface-2 text-ink-3"
                      : "bg-primary text-primary-foreground hover:opacity-90",
                    FOCUS_RING,
                  )}
                >
                  <Hand aria-hidden className="size-3.5" />
                  Touch
                </button>
                <span className="mx-1 hidden h-4 w-px bg-hairline @min-[24rem]:block" />
                <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                  Move to
                </span>
                {allColumns
                  .filter((c) => c.id !== openView.columnId)
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        moveCard(
                          openView.card.id,
                          c.id,
                          c.id === ARCHIVE_COLUMN ? "archive" : "move",
                          false,
                        )
                      }
                      aria-disabled={inert || undefined}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-2 border border-hairline px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                        inert && "cursor-default",
                        FOCUS_RING,
                      )}
                    >
                      {c.id === ARCHIVE_COLUMN ? (
                        <Archive aria-hidden className="size-3" />
                      ) : null}
                      {c.label}
                    </button>
                  ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <footer className="flex shrink-0 flex-col gap-2 border-t border-hairline px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            Time
          </span>
          <TimeSlider
            value={scrubNow}
            max={scrubDays}
            valueText={viewingText}
            disabled={!ready}
            motionSafe={motionSafe}
            onChange={setScrub}
          />
          <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-2 tabular-nums">
            +{scrubNow}d
          </span>
        </div>
        <Legend
          patina={patina}
          agingAfterDays={aging}
          staleAfterDays={staleAfterDays}
        />
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
