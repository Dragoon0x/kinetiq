"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { ChevronDown, GripVertical, RotateCcw } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

/* --------------------------------- types --------------------------------- */

export type SwimPriority = "high" | "medium" | "low";
export type SwimLanes = "priority" | "owner" | "none";
export type SwimLimit = "warn" | "block" | "off";
export type SwimStatus = "ready" | "loading" | "error";

export type SwimCard = {
  id: string;
  title: string;
  /** The column it sits in. */
  column: string;
  priority: SwimPriority;
  /** A person's id from `people`. */
  owner: string;
  /** A short label: an area, a kind of work. */
  tag?: string;
  /** Estimate, shown at desktop width. */
  points?: number;
};

export type SwimColumn = {
  id: string;
  title: string;
  /** Work-in-progress limit: how many cards the column should hold. */
  limit?: number;
};

export type SwimPerson = { id: string; name: string };

export type SwimPlace = {
  column: string;
  /** The lane: a priority, a person's id, or "all" without lanes. */
  lane: string;
  /** Position within its cell, from 0. */
  index: number;
};

export type SwimMove = {
  cardId: string;
  from: SwimPlace;
  to: SwimPlace;
  via: "pointer" | "keyboard";
};

export type SwimBoardProps = {
  /** Controlled cards, in board order: a cell lists its cards in the order they appear here. */
  cards?: SwimCard[];
  /** Initial cards when uncontrolled. @default defaultSwimCards */
  defaultCards?: SwimCard[];
  /** Fires from the drop that moved a card, with every card and the move. */
  onCardsChange?: (cards: SwimCard[], move: SwimMove) => void;
  /** The columns, left to right. @default defaultSwimColumns */
  columns?: SwimColumn[];
  /** Everyone a card can belong to; owner lanes follow this order. @default defaultSwimPeople */
  people?: SwimPerson[];
  /** A card was dropped somewhere new (also fires when uncontrolled). */
  onMove?: (move: SwimMove) => void;
  /** A card was tapped, clicked, or had Enter pressed on it. */
  onCardOpen?: (id: string) => void;
  /** A lane was folded or unfolded, with its new state. */
  onLaneToggle?: (lane: string, collapsed: boolean) => void;
  /** How far a carried card leans into its travel, in degrees. 0 keeps it level. @default 6 */
  tilt?: number;
  /** Work-in-progress limits: shake and warn when passed, refuse the drop, or hide them. @default "warn" */
  limit?: SwimLimit;
  /** What the rows group by. Moving a card between lanes changes that field. @default "priority" */
  lanes?: SwimLanes;
  /** Controlled folded lanes, by lane id. */
  collapsedLanes?: string[];
  /** Initially folded lanes when uncontrolled. @default [] */
  defaultCollapsedLanes?: string[];
  /** The board's heading. @default "Sprint 14" */
  title?: string;
  /** A quieter line beside the heading. @default "Fernworks Field app" */
  subtitle?: string;
  /** The cards' state: still loading (skeletons) or failed (a message with Retry). @default "ready" */
  status?: SwimStatus;
  /** The error state's Retry button. */
  onRetry?: () => void;
  /** The board's accessible name. @default the title */
  label?: string;
  /** A click as a card comes up or a lane folds, a thock as a card lands. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/* ------------------------------ seeded world ------------------------------ */

export const defaultSwimPeople: SwimPerson[] = [
  { id: "ines", name: "Ines Park" },
  { id: "tomas", name: "Tomas Reyes" },
  { id: "mira", name: "Mira Chen" },
];

export const defaultSwimColumns: SwimColumn[] = [
  { id: "backlog", title: "Backlog" },
  { id: "progress", title: "In progress", limit: 3 },
  { id: "review", title: "Review", limit: 2 },
  { id: "done", title: "Done" },
];

export const defaultSwimCards: SwimCard[] = [
  {
    id: "c1",
    title: "Offline sync for job notes",
    column: "progress",
    priority: "high",
    owner: "ines",
    tag: "Sync",
    points: 5,
  },
  {
    id: "c2",
    title: "Crash on photo upload over 4G",
    column: "progress",
    priority: "high",
    owner: "tomas",
    tag: "Bug",
    points: 3,
  },
  {
    id: "c3",
    title: "Route map clusters its pins",
    column: "progress",
    priority: "medium",
    owner: "mira",
    tag: "Maps",
    points: 5,
  },
  {
    id: "c4",
    title: "Signature capture pad",
    column: "review",
    priority: "medium",
    owner: "mira",
    tag: "Forms",
    points: 3,
  },
  {
    id: "c5",
    title: "Parts list search",
    column: "review",
    priority: "high",
    owner: "ines",
    tag: "Search",
    points: 2,
  },
  {
    id: "c6",
    title: "Retry queue for failed uploads",
    column: "backlog",
    priority: "high",
    owner: "tomas",
    tag: "Sync",
    points: 5,
  },
  {
    id: "c7",
    title: "Push when a job is reassigned",
    column: "backlog",
    priority: "medium",
    owner: "tomas",
    tag: "Alerts",
    points: 3,
  },
  {
    id: "c8",
    title: "Dark mode for the job sheet",
    column: "backlog",
    priority: "low",
    owner: "mira",
    tag: "UI",
    points: 2,
  },
  {
    id: "c9",
    title: "Customer rating prompt",
    column: "backlog",
    priority: "low",
    owner: "ines",
    tag: "Feedback",
    points: 1,
  },
  {
    id: "c10",
    title: "Sign in with SSO",
    column: "done",
    priority: "high",
    owner: "ines",
    tag: "Auth",
    points: 3,
  },
  {
    id: "c11",
    title: "Timesheet export to CSV",
    column: "done",
    priority: "low",
    owner: "tomas",
    tag: "Export",
    points: 2,
  },
  {
    id: "c12",
    title: "Haptics when a job is closed",
    column: "done",
    priority: "medium",
    owner: "mira",
    tag: "Polish",
    points: 1,
  },
];

/* --------------------------------- model --------------------------------- */

type Lane = { id: string; title: string };

const PRIORITY_LANES: Lane[] = [
  { id: "high", title: "High" },
  { id: "medium", title: "Medium" },
  { id: "low", title: "Low" },
];

const PRIORITY_BAR: Record<SwimPriority, string> = {
  high: "bg-danger",
  medium: "bg-warn",
  low: "bg-ink-3",
};

const laneOf = (card: SwimCard, mode: SwimLanes) =>
  mode === "priority" ? card.priority : mode === "owner" ? card.owner : "all";

const inCell = (
  card: SwimCard,
  place: { column: string; lane: string },
  mode: SwimLanes,
) => card.column === place.column && laneOf(card, mode) === place.lane;

function placeOf(
  cards: SwimCard[],
  id: string,
  mode: SwimLanes,
): SwimPlace | null {
  const card = cards.find((c) => c.id === id);
  if (!card) return null;
  const lane = laneOf(card, mode);
  const cell = cards.filter((c) =>
    inCell(c, { column: card.column, lane }, mode),
  );
  return { column: card.column, lane, index: cell.indexOf(card) };
}

/** The board with one card taken out and put back at `to`, its lane field rewritten. */
function moveCard(
  cards: SwimCard[],
  id: string,
  to: SwimPlace,
  mode: SwimLanes,
): SwimCard[] {
  const card = cards.find((c) => c.id === id);
  if (!card) return cards;
  const moved: SwimCard = {
    ...card,
    column: to.column,
    ...(mode === "priority" ? { priority: to.lane as SwimPriority } : {}),
    ...(mode === "owner" ? { owner: to.lane } : {}),
  };
  const rest = cards.filter((c) => c.id !== id);
  const cell = rest.filter((c) => inCell(c, to, mode));
  const before = cell[Math.max(0, to.index)];
  if (before && to.index < cell.length) {
    rest.splice(rest.indexOf(before), 0, moved);
  } else {
    const last = cell[cell.length - 1];
    if (last) rest.splice(rest.indexOf(last) + 1, 0, moved);
    else rest.push(moved);
  }
  return rest;
}

const same = (a: SwimPlace | null, b: SwimPlace | null) =>
  !!a &&
  !!b &&
  a.column === b.column &&
  a.lane === b.lane &&
  a.index === b.index;

/* ---------------------------------- view ---------------------------------- */

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** The flex gap between cards in a cell, px. */
const CARD_GAP = 8;
/** How close to the scroller's edge a carried card makes it scroll, px. */
const EDGE = 44;

const r2 = (v: number) => Math.round(v * 100) / 100;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

function CardFace({
  card,
  owner,
  showGrip,
}: {
  card: SwimCard;
  owner?: SwimPerson;
  showGrip: boolean;
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute top-2.5 bottom-2.5 left-0 w-0.5 rounded-full",
          PRIORITY_BAR[card.priority],
        )}
      />
      <span className="flex items-start gap-1.5">
        <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-foreground">
          {card.title}
        </span>
        {showGrip ? (
          <span
            data-swim-grip=""
            aria-hidden
            className="-mt-0.5 -mr-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-1 text-ink-3 @min-[560px]:hidden"
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-1.5">
        {card.tag ? (
          <span className="inline-flex h-5 min-w-0 items-center truncate rounded-full border border-hairline px-1.5 text-[10px] text-ink-2">
            {card.tag}
          </span>
        ) : null}
        {card.points !== undefined ? (
          <span className="hidden font-mono text-[10px] text-ink-3 tabular-nums @min-[1024px]:inline">
            {card.points} pt
          </span>
        ) : null}
        <span className="hidden text-[10px] text-ink-3 capitalize @min-[1024px]:inline">
          {card.priority}
        </span>
        {owner ? (
          <span
            aria-hidden
            title={owner.name}
            className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-medium text-ink-2"
          >
            {initials(owner.name)}
          </span>
        ) : null}
      </span>
    </>
  );
}

const CARD_BOX =
  "relative flex w-full flex-col gap-2 rounded-3 border border-hairline bg-card py-2.5 pr-2.5 pl-3 text-left shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent)]";

type CardViewProps = {
  card: SwimCard;
  owner?: SwimPerson;
  uid: string;
  name: string;
  hintId: string;
  tabbable: boolean;
  lifted: boolean;
  landing: boolean;
  liftRot: MotionValue<number>;
  motionSafe: boolean;
  disabled: boolean;
  register: (
    id: string,
    node: HTMLButtonElement | null,
  ) => (() => void) | undefined;
  onOpen: (id: string) => void;
  onKeyDown: (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => void;
  onFocusCard: (id: string) => void;
  onBlurCard: (id: string, event: React.FocusEvent<HTMLButtonElement>) => void;
};

function CardView({
  card,
  owner,
  uid,
  name,
  hintId,
  tabbable,
  lifted,
  landing,
  liftRot,
  motionSafe,
  disabled,
  register,
  onOpen,
  onKeyDown,
  onFocusCard,
  onBlurCard,
}: CardViewProps) {
  const still = useMotionValue(0);
  return (
    <motion.li
      layoutId={`${uid}-card-${card.id}`}
      layout="position"
      transition={{ layout: motionSafe ? springs.glide : { duration: 0 } }}
      data-swim-card-id={card.id}
      className={cn("relative", lifted && "z-10", landing && "opacity-0")}
    >
      <motion.button
        ref={(node) => register(card.id, node)}
        type="button"
        data-swim-card={card.id}
        aria-roledescription="card"
        aria-label={name}
        aria-describedby={hintId}
        aria-pressed={lifted}
        aria-disabled={disabled || undefined}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => {
          if (!disabled) onOpen(card.id);
        }}
        onKeyDown={(event) => onKeyDown(card.id, event)}
        onFocus={() => onFocusCard(card.id)}
        onBlur={(event) => onBlurCard(card.id, event)}
        className={cn(
          CARD_BOX,
          "transition-[border-color,box-shadow] select-none",
          FOCUS,
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab hover:border-hairline-strong",
          lifted &&
            "border-cobalt-bright shadow-[0_10px_24px_color-mix(in_oklab,black_22%,transparent)]",
        )}
        style={{ rotate: lifted ? liftRot : still }}
        animate={{ scale: lifted && motionSafe ? 1.03 : 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        <CardFace card={card} owner={owner} showGrip={!disabled} />
      </motion.button>
    </motion.li>
  );
}

function ColumnHeader({
  column,
  count,
  limitMode,
  shake,
  motionSafe,
  refused,
  headingId,
  register,
}: {
  column: SwimColumn;
  count: number;
  limitMode: SwimLimit;
  shake: number;
  motionSafe: boolean;
  refused: boolean;
  headingId: string;
  register: (id: string, node: HTMLDivElement | null) => void;
}) {
  const x = useMotionValue(0);
  const hasLimit = limitMode !== "off" && column.limit !== undefined;
  const limitN = column.limit ?? 0;
  const over = hasLimit && count > limitN;
  const full = hasLimit && count >= limitN;
  const fill = useMotionValue(
    hasLimit ? Math.min(1, count / Math.max(1, limitN)) : 0,
  );
  const fillAnim = React.useRef<AnimationPlaybackControls | null>(null);

  // The refusal: five beats on a tween, never a spring that celebrates.
  React.useEffect(() => {
    if (shake === 0 || !motionSafe) return;
    const c = animate(x, [0, -5, 5, -3, 3, 0], {
      duration: 0.4,
      ease: easings.move,
    });
    return () => {
      c.stop();
      x.set(0);
    };
  }, [shake, motionSafe, x]);

  React.useEffect(() => {
    const to = hasLimit ? Math.min(1, count / Math.max(1, limitN)) : 0;
    fillAnim.current?.stop();
    if (!motionSafe) {
      fill.jump(to);
      return;
    }
    fillAnim.current = animate(fill, to, springs.glide);
    return () => fillAnim.current?.stop();
  }, [count, limitN, hasLimit, motionSafe, fill]);

  const fillScale = useTransform(fill, (f) => r2(f));

  return (
    <div
      ref={(node) => register(column.id, node)}
      className="flex flex-col gap-1.5 pt-2.5 pb-2"
    >
      <motion.div className="flex h-6 items-center gap-2" style={{ x }}>
        <h3
          id={headingId}
          className={cn(
            "truncate text-[13px] font-medium",
            over ? "text-warn" : "text-foreground",
          )}
        >
          {column.title}
        </h3>
        <span
          className={cn(
            "inline-flex h-5 shrink-0 items-center rounded-full px-1.5 font-mono text-[10px] tabular-nums",
            over || refused
              ? "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-warn"
              : "bg-surface-2 text-ink-2",
          )}
        >
          {hasLimit ? `${count}/${limitN}` : count}
        </span>
        <AnimatePresence initial={false}>
          {over || (refused && full) ? (
            <motion.span
              key={over ? "over" : "full"}
              className="truncate text-[11px] text-warn"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              {over ? "Over limit" : "Full"}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.div>
      <span
        aria-hidden
        className={cn(
          "relative h-0.5 overflow-clip rounded-full",
          hasLimit ? "bg-surface-2" : "bg-hairline",
        )}
      >
        {hasLimit ? (
          <motion.span
            className={cn(
              "absolute inset-0 origin-left rounded-full",
              over ? "bg-warn" : "bg-cobalt-bright",
            )}
            style={{ scaleX: fillScale }}
          />
        ) : null}
      </span>
    </div>
  );
}

type Carry = {
  id: string;
  origin: SwimPlace;
  /** Where the gap is, and the column refusing the card, as of the last move. */
  over: SwimPlace;
  refused: string | null;
  grabX: number;
  grabY: number;
  lastX: number;
  lastT: number;
  vx: number;
  px: number;
  py: number;
};

type DragView = {
  id: string;
  over: SwimPlace;
  refused: string | null;
  width: number;
  height: number;
  phase: "drag" | "land";
};

type Lift = { id: string; origin: SwimPlace; preview: SwimCard[] };

/**
 * A kanban board with swimlanes. A card dragged off the board comes up into
 * a carried copy that sits 1:1 under the pointer, scaled on flick, and leans
 * into its horizontal travel — its angle is the pointer's speed, clamped to
 * `tilt` and smoothed by a glide-tuned spring — so a fast sweep swings it
 * over and a pause lets it hang straight. The cell under it opens a gap of
 * exactly the card's height on glide while the cards below slide down, and
 * the gap it left closes the same way. Let go, and it flies from the hand
 * into the gap on snap with the release velocity, straightening as it lands.
 *
 * Columns carry work-in-progress limits: a move that passes one shakes the
 * header on a five-beat tween and turns it warn (`limit="warn"`), or is
 * refused with the gap staying home (`limit="block"`). Lanes group by
 * priority or owner and fold on glide; moving a card between lanes rewrites
 * that field.
 *
 * The keyboard reaches every end state: arrows walk the cards, Space picks
 * one up, arrows carry it a place or a column at a time (crossing lanes past
 * the ends), Enter or Space drops and Escape puts it back — each step
 * announced. Under reduced motion nothing leans, shakes or flies: the gap
 * opens and the card lands at once, and the warnings still show.
 */
export function SwimBoard({
  cards: cardsProp,
  defaultCards = defaultSwimCards,
  onCardsChange,
  columns = defaultSwimColumns,
  people = defaultSwimPeople,
  onMove,
  onCardOpen,
  onLaneToggle,
  tilt = 6,
  limit = "warn",
  lanes = "priority",
  collapsedLanes,
  defaultCollapsedLanes = [],
  title = "Sprint 14",
  subtitle = "Fernworks Field app",
  status = "ready",
  onRetry,
  label,
  sound = false,
  disabled = false,
  className,
}: SwimBoardProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const maxTilt = Math.max(0, Math.min(20, tilt));

  const [ownCards, setOwnCards] = React.useState(defaultCards);
  const cards = cardsProp ?? ownCards;
  const [ownFolded, setOwnFolded] = React.useState(defaultCollapsedLanes);
  const folded = collapsedLanes ?? ownFolded;

  const laneList: Lane[] =
    lanes === "priority"
      ? PRIORITY_LANES
      : lanes === "owner"
        ? people.map((p) => ({ id: p.id, title: p.name }))
        : [{ id: "all", title: "All cards" }];
  const personOf = (id: string) => people.find((p) => p.id === id);

  const [drag, setDrag] = React.useState<DragView | null>(null);
  const [lift, setLift] = React.useState<Lift | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [shakes, setShakes] = React.useState<Record<string, number>>({});
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // What the board shows: the committed cards, a keyboard carry's preview,
  // or the pointer's gap at the place it is over.
  const shown = lift
    ? lift.preview
    : drag && drag.phase === "drag"
      ? moveCard(cards, drag.id, drag.over, lanes)
      : cards;

  const countOf = (column: string, list = shown) =>
    list.filter((c) => c.column === column).length;

  const nameOf = (card: SwimCard, list = shown) => {
    const place = placeOf(list, card.id, lanes);
    const column = columns.find((c) => c.id === card.column);
    const cell = place ? list.filter((c) => inCell(c, place, lanes)).length : 0;
    const owner = personOf(card.owner);
    return `${card.title}. ${card.priority.charAt(0).toUpperCase()}${card.priority.slice(1)}, ${owner?.name ?? "unassigned"}. ${column?.title ?? card.column}, ${place ? place.index + 1 : 1} of ${cell}.`;
  };

  const laneTitle = (lane: string) =>
    laneList.find((l) => l.id === lane)?.title ?? lane;
  const columnTitle = (column: string) =>
    columns.find((c) => c.id === column)?.title ?? column;

  const where = (place: SwimPlace, list: SwimCard[]) => {
    const n = list.filter((c) => inCell(c, place, lanes)).length;
    const lanePart = lanes === "none" ? "" : `, ${laneTitle(place.lane)} lane`;
    return `${columnTitle(place.column)}${lanePart}, position ${place.index + 1} of ${n}`;
  };

  /* ------------------------------ refs & nodes ----------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const headerNodes = React.useRef(new Map<string, HTMLDivElement>());
  const laneNodes = React.useRef(new Map<string, HTMLElement>());
  const cellNodes = React.useRef(new Map<string, HTMLUListElement>());
  const carry = React.useRef<Carry | null>(null);
  const moving = React.useRef(false);
  const pressed = React.useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  const landing = React.useRef<{
    id: string;
    vx: number;
    vy: number;
    refused: boolean;
    column: string;
  } | null>(null);
  const lastHover = React.useRef<string | null>(null);
  const timers = React.useRef<number[]>([]);
  const scrollLoop = React.useRef<number | null>(null);
  const anims = React.useRef<AnimationPlaybackControls[]>([]);

  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const lean = useMotionValue(0);
  const rot = useSpring(lean, { stiffness: 300, damping: 34, mass: 1 });
  const lifted = useMotionValue(0);
  const carryScale = useTransform(lifted, (l) => r2(1 + 0.04 * l));
  const carryShadow = useTransform(lifted, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(14 * l)}px ${r2(30 * l)}px color-mix(in oklab, black ${Math.round(26 * l)}%, transparent)`,
  );
  const liftRot = useMotionValue(0);

  const stopAll = () => {
    for (const c of anims.current) c.stop();
    anims.current = [];
  };

  React.useEffect(() => {
    const list = timers.current;
    return () => {
      for (const t of list) window.clearTimeout(t);
      if (scrollLoop.current !== null) cancelAnimationFrame(scrollLoop.current);
      for (const c of anims.current) c.stop();
    };
  }, []);

  const shake = (column: string) => {
    setShakes((s) => ({ ...s, [column]: (s[column] ?? 0) + 1 }));
  };

  /* ------------------------------- committing ------------------------------ */

  const commit = (id: string, to: SwimPlace, via: SwimMove["via"]) => {
    const from = placeOf(cards, id, lanes);
    if (!from) return null;
    const next = moveCard(cards, id, to, lanes);
    const at = placeOf(next, id, lanes) ?? to;
    if (same(from, at)) return null;
    const move: SwimMove = { cardId: id, from, to: at, via };
    if (cardsProp === undefined) setOwnCards(next);
    onCardsChange?.(next, move);
    onMove?.(move);
    return { next, at };
  };

  /* -------------------------------- pointer ------------------------------- */

  const hitTest = (
    px: number,
    py: number,
  ): { place: SwimPlace; refused: string | null } => {
    const c = carry.current;
    const root = rootRef.current;
    const fallback = {
      place: c?.origin ?? { column: "", lane: "", index: 0 },
      refused: null,
    };
    if (!c || !root) return fallback;
    const rb = root.getBoundingClientRect();
    if (px < rb.left || px > rb.right || py < rb.top || py > rb.bottom) {
      return fallback;
    }
    let column: string | null = null;
    let best = Infinity;
    for (const col of columns) {
      const r = headerNodes.current.get(col.id)?.getBoundingClientRect();
      if (!r) continue;
      const d = px < r.left ? r.left - px : px > r.right ? px - r.right : 0;
      if (d < best) {
        best = d;
        column = col.id;
      }
    }
    let lane: string | null = null;
    best = Infinity;
    for (const l of laneList) {
      const r = laneNodes.current.get(l.id)?.getBoundingClientRect();
      if (!r) continue;
      const d = py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0;
      if (d < best) {
        best = d;
        lane = l.id;
      }
    }
    if (!column || !lane) return fallback;
    const col = columns.find((x) => x.id === column);
    const others = cards.filter((x) => x.id !== c.id);
    if (
      limit === "block" &&
      col?.limit !== undefined &&
      column !== c.origin.column &&
      others.filter((x) => x.column === column).length >= col.limit
    ) {
      return { place: c.origin, refused: column };
    }
    const cellCards = others.filter((x) => inCell(x, { column, lane }, lanes));
    if (folded.includes(lane)) {
      return {
        place: { column, lane, index: cellCards.length },
        refused: null,
      };
    }
    const cell = cellNodes.current.get(`${column}|${lane}`);
    let index = 0;
    if (cell) {
      let shift = 0;
      for (const child of Array.from(cell.children)) {
        if (child.hasAttribute("data-swim-gap")) {
          shift = child.getBoundingClientRect().height + CARD_GAP;
          continue;
        }
        if (!child.hasAttribute("data-swim-card-id")) continue;
        const r = child.getBoundingClientRect();
        if (r.top + r.height / 2 - shift < py) index += 1;
      }
    }
    return {
      place: { column, lane, index: Math.min(index, cellCards.length) },
      refused: null,
    };
  };

  const hover = (px: number, py: number) => {
    const c = carry.current;
    if (!c) return;
    const { place, refused } = hitTest(px, py);
    c.over = place;
    c.refused = refused;
    setDrag((d) => {
      if (!d || d.phase !== "drag") return d;
      if (same(d.over, place) && d.refused === refused) return d;
      return { ...d, over: place, refused };
    });
    // A column passed (or refused) shakes once as the card arrives over it.
    const key = refused ?? place.column;
    if (key !== lastHover.current) {
      lastHover.current = key;
      const col = columns.find((x) => x.id === key);
      if (refused) shake(refused);
      else if (
        limit === "warn" &&
        col?.limit !== undefined &&
        key !== c.origin.column &&
        cards.filter((x) => x.column === key && x.id !== c.id).length >=
          col.limit
      ) {
        shake(key);
      }
    }
  };

  const edgeScroll = () => {
    scrollLoop.current = null;
    const c = carry.current;
    const box = scrollRef.current;
    if (!c || !box) return;
    const r = box.getBoundingClientRect();
    const dx =
      c.px < r.left + EDGE
        ? -Math.ceil((r.left + EDGE - c.px) / 4)
        : c.px > r.right - EDGE
          ? Math.ceil((c.px - (r.right - EDGE)) / 4)
          : 0;
    const dy =
      c.py < r.top + EDGE
        ? -Math.ceil((r.top + EDGE - c.py) / 4)
        : c.py > r.bottom - EDGE
          ? Math.ceil((c.py - (r.bottom - EDGE)) / 4)
          : 0;
    if (dx === 0 && dy === 0) return;
    const before = [box.scrollLeft, box.scrollTop];
    box.scrollBy(dx, dy);
    if (box.scrollLeft === before[0] && box.scrollTop === before[1]) return;
    hover(c.px, c.py);
    scrollLoop.current = requestAnimationFrame(edgeScroll);
  };

  const gesture = useDrag({
    threshold: 4,
    disabled: disabled || status !== "ready",
    onStart: ({ event, point }) => {
      const press = pressed.current;
      const id = press?.id;
      const button = id ? cardNodes.current.get(id) : undefined;
      const root = rootRef.current;
      if (!press || !id || !button || !root) return;
      const origin = placeOf(cards, id, lanes);
      if (!origin) return;
      if (lift) setLift(null);
      stopAll();
      const rb = root.getBoundingClientRect();
      const cb = button.getBoundingClientRect();
      // Held where it was pressed, so the card follows from the first move.
      carry.current = {
        id,
        origin,
        over: origin,
        refused: null,
        grabX: press.x - cb.left,
        grabY: press.y - cb.top,
        lastX: point.x,
        lastT: event.timeStamp,
        vx: 0,
        px: point.x,
        py: point.y,
      };
      lastHover.current = origin.column;
      ox.jump(r2(point.x - rb.left - (press.x - cb.left)));
      oy.jump(r2(point.y - rb.top - (press.y - cb.top)));
      lean.jump(0);
      rot.jump(0);
      lifted.jump(0);
      if (motionSafe) anims.current.push(animate(lifted, 1, springs.flick));
      else lifted.jump(1);
      setDrag({
        id,
        over: origin,
        refused: null,
        width: r2(cb.width),
        height: r2(cb.height),
        phase: "drag",
      });
      audio.play("click", { pitch: 1.1, gain: 0.45 });
    },
    onMove: ({ point, event }) => {
      const c = carry.current;
      const root = rootRef.current;
      if (!c || !root) return;
      const rb = root.getBoundingClientRect();
      ox.set(r2(point.x - rb.left - c.grabX));
      oy.set(r2(point.y - rb.top - c.grabY));
      const dt = Math.max(1, event.timeStamp - c.lastT);
      const instant = ((point.x - c.lastX) / dt) * 1000;
      c.vx = c.vx * 0.6 + instant * 0.4;
      c.lastX = point.x;
      c.lastT = event.timeStamp;
      c.px = point.x;
      c.py = point.y;
      if (motionSafe && maxTilt > 0) {
        lean.set(r2(Math.max(-maxTilt, Math.min(maxTilt, c.vx / 90))));
        // A hand that stops lets the card hang straight again.
        for (const t of timers.current.splice(0)) window.clearTimeout(t);
        timers.current.push(window.setTimeout(() => lean.set(0), 70));
      }
      hover(point.x, point.y);
      if (scrollLoop.current === null) {
        scrollLoop.current = requestAnimationFrame(edgeScroll);
      }
    },
    onEnd: ({ velocity }) => {
      const c = carry.current;
      if (!c) return;
      if (scrollLoop.current !== null) {
        cancelAnimationFrame(scrollLoop.current);
        scrollLoop.current = null;
      }
      const target = c.over;
      const refusedNow = c.refused;
      const done = commit(c.id, target, "pointer");
      const at = done?.at ?? c.origin;
      const list = done?.next ?? cards;
      const card = list.find((x) => x.id === c.id);
      if (done && card) say(`Dropped ${card.title}. ${where(at, list)}.`);
      else if (refusedNow)
        say(
          `${columnTitle(refusedNow)} is full. ${card?.title ?? "The card"} went back.`,
        );
      lean.set(0);
      setFocusId(c.id);
      setDrag((d) => (d ? { ...d, phase: "land" } : d));
      landing.current = {
        id: c.id,
        vx: velocity.x,
        vy: velocity.y,
        refused: !done,
        column: at.column,
      };
    },
    onCancel: () => {
      const c = carry.current;
      if (scrollLoop.current !== null) {
        cancelAnimationFrame(scrollLoop.current);
        scrollLoop.current = null;
      }
      if (!c) return;
      lean.set(0);
      setDrag((d) => (d ? { ...d, phase: "land" } : d));
      landing.current = {
        id: c.id,
        vx: 0,
        vy: 0,
        refused: true,
        column: c.origin.column,
      };
    },
  });

  // The carried card flies into the place the board now holds for it, then
  // hands over to the real card there. Measured after the commit, so it
  // lands where the card really is (where the host put it, or home).
  const phase = drag?.phase;
  React.useLayoutEffect(() => {
    const l = landing.current;
    if (phase !== "land" || !l) return;
    const node = cardNodes.current.get(l.id);
    const root = rootRef.current;
    const finish = () => {
      landing.current = null;
      carry.current = null;
      lastHover.current = null;
      setDrag(null);
      const el = cardNodes.current.get(l.id);
      el?.focus({ preventScroll: true });
    };
    const colIndex = Math.max(
      0,
      columns.findIndex((c) => c.id === l.column),
    );
    audio.play("thock", {
      pitch: l.refused ? 0.7 : r2(0.9 + colIndex * 0.07),
      gain: l.refused ? 0.45 : 0.6,
    });
    if (!node || !root || !motionSafe) {
      finish();
      return;
    }
    const rb = root.getBoundingClientRect();
    const nb = node.getBoundingClientRect();
    stopAll();
    lean.set(0);
    anims.current = [
      animate(ox, r2(nb.left - rb.left), { ...springs.snap, velocity: l.vx }),
      animate(oy, r2(nb.top - rb.top), {
        ...springs.snap,
        velocity: l.vy,
        onComplete: finish,
      }),
      animate(lifted, 0, springs.snap),
    ];
    return () => {
      // A re-run (StrictMode) lands it at once rather than freezing it.
      for (const c of anims.current) c.stop();
      if (landing.current) finish();
    };
    // Runs once per landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* ------------------------------- keyboard ------------------------------- */

  const visibleLanes = laneList.filter((l) => !folded.includes(l.id));

  /** Cards of a column in reading order, through the unfolded lanes. */
  const columnRun = (column: string, list = shown) =>
    visibleLanes.flatMap((l) =>
      list.filter((c) => inCell(c, { column, lane: l.id }, lanes)),
    );

  const focusCard = (id: string) => {
    setFocusId(id);
    cardNodes.current.get(id)?.focus();
  };

  const walk = (id: string, key: string) => {
    const card = shown.find((c) => c.id === id);
    if (!card) return false;
    const run = columnRun(card.column);
    const i = run.findIndex((c) => c.id === id);
    if (key === "ArrowDown" || key === "ArrowUp") {
      const next = run[i + (key === "ArrowDown" ? 1 : -1)];
      if (next) focusCard(next.id);
      return true;
    }
    if (key === "Home" || key === "End") {
      const next = key === "Home" ? run[0] : run[run.length - 1];
      if (next) focusCard(next.id);
      return true;
    }
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const ci = columns.findIndex((c) => c.id === card.column);
      const step = key === "ArrowRight" ? 1 : -1;
      for (let j = ci + step; j >= 0 && j < columns.length; j += step) {
        const col = columns[j];
        if (!col) break;
        const other = columnRun(col.id);
        if (!other.length) continue;
        const lane = laneOf(card, lanes);
        const sameLane = other.filter((c) => laneOf(c, lanes) === lane);
        const pool = sameLane.length ? sameLane : other;
        const place = placeOf(shown, id, lanes);
        const next = pool[Math.min(place?.index ?? 0, pool.length - 1)];
        if (next) focusCard(next.id);
        return true;
      }
      return true;
    }
    return false;
  };

  const kick = (dir: number) => {
    if (!motionSafe || maxTilt === 0) return;
    for (const c of anims.current) c.stop();
    anims.current = [
      animate(liftRot, r2(dir * Math.max(1.5, maxTilt / 2)), {
        ...springs.snap,
        onComplete: () => {
          anims.current = [animate(liftRot, 0, springs.snap)];
        },
      }),
    ];
  };

  const carryStep = (key: string) => {
    if (!lift) return;
    const place = placeOf(lift.preview, lift.id, lanes);
    if (!place) return;
    const cellLen = (p: { column: string; lane: string }, list: SwimCard[]) =>
      list.filter((c) => inCell(c, p, lanes) && c.id !== lift.id).length;
    let to: SwimPlace | null = null;
    let dir = 0;
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const ci = columns.findIndex((c) => c.id === place.column);
      const col = columns[ci + (key === "ArrowRight" ? 1 : -1)];
      if (!col) {
        say(key === "ArrowRight" ? "Last column." : "First column.");
        return;
      }
      if (
        limit === "block" &&
        col.limit !== undefined &&
        col.id !== lift.origin.column &&
        lift.preview.filter((c) => c.column === col.id && c.id !== lift.id)
          .length >= col.limit
      ) {
        shake(col.id);
        audio.play("thock", { pitch: 0.7, gain: 0.4 });
        say(`${col.title} is full: its limit is ${col.limit}.`);
        return;
      }
      to = {
        column: col.id,
        lane: place.lane,
        index: Math.min(
          place.index,
          cellLen({ column: col.id, lane: place.lane }, lift.preview),
        ),
      };
      dir = key === "ArrowRight" ? 1 : -1;
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      const down = key === "ArrowDown";
      const len = cellLen(place, lift.preview);
      if (down && place.index < len) to = { ...place, index: place.index + 1 };
      else if (!down && place.index > 0)
        to = { ...place, index: place.index - 1 };
      else {
        const li = visibleLanes.findIndex((l) => l.id === place.lane);
        const lane = visibleLanes[li + (down ? 1 : -1)];
        if (!lane) {
          say(down ? "Bottom of the column." : "Top of the column.");
          return;
        }
        to = {
          column: place.column,
          lane: lane.id,
          index: down
            ? 0
            : cellLen({ column: place.column, lane: lane.id }, lift.preview),
        };
      }
    }
    if (!to) return;
    const preview = moveCard(lift.preview, lift.id, to, lanes);
    moving.current = true;
    setLift({ ...lift, preview });
    if (dir) kick(dir);
    audio.play("click", {
      pitch: r2(1 + (dir || (key === "ArrowDown" ? -0.5 : 0.5)) * 0.06),
      gain: 0.3,
    });
    const at = placeOf(preview, lift.id, lanes) ?? to;
    const col = columns.find((c) => c.id === at.column);
    const n = preview.filter((c) => c.column === at.column).length;
    let text = `${where(at, preview)}.`;
    if (limit !== "off" && col?.limit !== undefined && n > col.limit) {
      text += ` ${col.title} is over its limit of ${col.limit}.`;
      if (at.column !== place.column) shake(at.column);
    }
    say(text);
  };

  const pickUp = (id: string) => {
    const origin = placeOf(cards, id, lanes);
    const card = cards.find((c) => c.id === id);
    if (!origin || !card) return;
    setLift({ id, origin, preview: cards });
    liftRot.jump(0);
    audio.play("click", { pitch: 1.1, gain: 0.45 });
    say(
      `Picked up ${card.title}. ${where(origin, cards)}. Arrow keys move it, Enter drops it, Escape puts it back.`,
    );
  };

  const drop = () => {
    if (!lift) return;
    const at = placeOf(lift.preview, lift.id, lanes);
    const card = lift.preview.find((c) => c.id === lift.id);
    moving.current = true;
    setLift(null);
    liftRot.set(0);
    if (!at || !card) return;
    const done = commit(lift.id, at, "keyboard");
    const colIndex = Math.max(
      0,
      columns.findIndex((c) => c.id === at.column),
    );
    audio.play("thock", { pitch: r2(0.9 + colIndex * 0.07), gain: 0.6 });
    say(
      done
        ? `Dropped ${card.title}. ${where(done.at, done.next)}.`
        : `Dropped ${card.title} where it was.`,
    );
  };

  const cancelLift = (quiet = false) => {
    if (!lift) return;
    const card = cards.find((c) => c.id === lift.id);
    moving.current = true;
    setLift(null);
    liftRot.set(0);
    if (!quiet && card) {
      say(
        `Move cancelled. ${card.title} is back in ${columnTitle(lift.origin.column)}.`,
      );
    }
  };

  const onCardKeyDown = (
    id: string,
    event: React.KeyboardEvent<HTMLButtonElement>,
  ) => {
    const key = event.key;
    if (disabled) {
      // A disabled board can still be read card by card.
      if (walk(id, key)) event.preventDefault();
      return;
    }
    if (lift && lift.id === id) {
      if (key === " " || key === "Enter") {
        event.preventDefault();
        drop();
      } else if (key === "Escape") {
        event.preventDefault();
        cancelLift();
      } else if (key.startsWith("Arrow")) {
        event.preventDefault();
        carryStep(key);
      } else if (key === "Tab") {
        cancelLift();
      }
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (lift) cancelLift(true);
      pickUp(id);
      return;
    }
    if (key.startsWith("Arrow") || key === "Home" || key === "End") {
      if (walk(id, key)) event.preventDefault();
    }
  };

  // The carried card is a new node in each cell it reaches: focus follows it.
  React.useLayoutEffect(() => {
    if (!moving.current) return;
    const id = lift?.id ?? focusId;
    if (id) cardNodes.current.get(id)?.focus({ preventScroll: false });
    moving.current = false;
  }, [lift, focusId]);

  /* --------------------------------- lanes -------------------------------- */

  const toggleLane = (lane: string) => {
    const now = folded.includes(lane);
    const next = now ? folded.filter((l) => l !== lane) : [...folded, lane];
    if (collapsedLanes === undefined) setOwnFolded(next);
    onLaneToggle?.(lane, !now);
    audio.play("click", { pitch: now ? 1.05 : 0.9, gain: 0.4 });
    const n = cards.filter((c) => laneOf(c, lanes) === lane).length;
    say(
      `${laneTitle(lane)} lane ${now ? "open" : "folded"}, ${n} ${n === 1 ? "card" : "cards"}.`,
    );
  };

  const jumpTo = (column: string) => {
    const box = scrollRef.current;
    const head = headerNodes.current.get(column);
    if (!box || !head) return;
    const left = Math.max(0, head.offsetLeft - 12);
    if (!motionSafe) {
      box.scrollLeft = left;
      return;
    }
    anims.current.push(
      animate(box.scrollLeft, left, {
        ...springs.glide,
        onUpdate: (v) => {
          box.scrollLeft = v;
        },
      }),
    );
  };

  /* -------------------------------- derived ------------------------------- */

  const tabbableId =
    focusId && shown.some((c) => c.id === focusId)
      ? focusId
      : (columnRun(columns[0]?.id ?? "")[0]?.id ??
        visibleLanes.flatMap((l) =>
          columns.flatMap((col) =>
            shown.filter((c) =>
              inCell(c, { column: col.id, lane: l.id }, lanes),
            ),
          ),
        )[0]?.id ??
        null);
  const template = {
    "--swim-cols": String(columns.length),
  } as React.CSSProperties;
  const gridCols =
    "grid gap-3 [grid-template-columns:repeat(var(--swim-cols),248px)] @min-[560px]:[grid-template-columns:repeat(var(--swim-cols),minmax(150px,1fr))]";
  const carriedCard = drag ? cards.find((c) => c.id === drag.id) : undefined;
  const inProgress = columns[1];
  const summary = `${cards.length} ${cards.length === 1 ? "card" : "cards"}${
    inProgress
      ? ` · ${inProgress.title.toLowerCase()} ${countOf(inProgress.id)}${inProgress.limit !== undefined && limit !== "off" ? `/${inProgress.limit}` : ""}`
      : ""
  }`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label ?? title}
      style={template}
      onPointerDown={(event) => {
        // Only cards are carried; on a touch screen only by their grip, so a
        // finger elsewhere on a card still scrolls the board.
        const target = event.target instanceof Element ? event.target : null;
        const card = target?.closest("[data-swim-card]");
        const id = card?.getAttribute("data-swim-card");
        if (!target || !id) return;
        if (
          event.pointerType === "touch" &&
          !target.closest("[data-swim-grip]")
        )
          return;
        pressed.current = { id, x: event.clientX, y: event.clientY };
        gesture.onPointerDown(event);
      }}
      onPointerMove={gesture.onPointerMove}
      onPointerUp={gesture.onPointerUp}
      onPointerCancel={gesture.onPointerCancel}
      onLostPointerCapture={gesture.onLostPointerCapture}
      className={cn(
        "@container relative isolate flex h-[560px] w-full flex-col overflow-clip rounded-4 border border-hairline bg-background text-foreground select-none",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-sm font-semibold">{title}</h2>
          {subtitle ? (
            <span className="hidden truncate text-xs text-ink-3 @min-[480px]:inline">
              {subtitle}
            </span>
          ) : null}
        </div>
        <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
          {summary}
        </span>
      </div>

      <div
        role="group"
        aria-label="Columns"
        className="flex shrink-0 [scrollbar-width:none] gap-1.5 overflow-x-auto border-b border-hairline px-3 py-2 @min-[560px]:hidden"
      >
        {columns.map((col) => {
          const n = countOf(col.id);
          const over =
            limit !== "off" && col.limit !== undefined && n > col.limit;
          return (
            <button
              key={col.id}
              type="button"
              onClick={() => jumpTo(col.id)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              {col.title}
              <span
                className={cn(
                  "font-mono text-[10px] tabular-nums",
                  over ? "text-warn" : "text-ink-3",
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <p id={hintId} className="sr-only">
        Space picks a card up. Arrow keys move it a place or a column, Enter
        drops it, Escape puts it back. Arrow keys alone move between cards.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-start gap-3 p-4">
          <div className="flex flex-col gap-1">
            <p className="text-[13px] font-medium">The board did not load</p>
            <p className="text-xs text-ink-3">
              Cards are safe; this view could not reach them. Try again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRetry?.()}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <motion.div
          ref={scrollRef}
          layoutScroll
          className="relative flex-1 scroll-pl-3 [scrollbar-width:thin] overflow-auto overscroll-contain"
        >
          <div className="w-max px-3 pb-3 @min-[560px]:w-full">
            <div className={cn(gridCols, "sticky top-0 z-20 bg-background")}>
              {columns.map((col) => (
                <ColumnHeader
                  key={col.id}
                  column={col}
                  count={countOf(col.id)}
                  limitMode={limit}
                  shake={shakes[col.id] ?? 0}
                  motionSafe={motionSafe}
                  refused={drag?.refused === col.id}
                  headingId={`${uid}-col-${col.id}`}
                  register={(id, node) => {
                    if (node) headerNodes.current.set(id, node);
                    else headerNodes.current.delete(id);
                  }}
                />
              ))}
            </div>

            <LayoutGroup id={uid}>
              {laneList.map((lane) => {
                const isFolded = folded.includes(lane.id);
                const laneCards = shown.filter(
                  (c) => laneOf(c, lanes) === lane.id,
                );
                const bodyId = `${uid}-lane-${lane.id}`;
                const dropping =
                  !!drag &&
                  drag.phase === "drag" &&
                  isFolded &&
                  drag.over.lane === lane.id;
                return (
                  <div
                    key={lane.id}
                    ref={(node) => {
                      if (node) laneNodes.current.set(lane.id, node);
                      else laneNodes.current.delete(lane.id);
                    }}
                    role={lanes === "none" ? undefined : "group"}
                    aria-label={
                      lanes === "none" ? undefined : `${lane.title} lane`
                    }
                  >
                    {lanes !== "none" ? (
                      <div
                        className={cn(
                          "mt-1 flex h-8 items-center rounded-2 transition-colors",
                          dropping && "bg-cobalt-wash",
                        )}
                      >
                        <button
                          type="button"
                          aria-expanded={!isFolded}
                          aria-controls={bodyId}
                          aria-label={`${lane.title} lane, ${laneCards.length} ${laneCards.length === 1 ? "card" : "cards"}`}
                          onClick={() => toggleLane(lane.id)}
                          className={cn(
                            "sticky left-3 inline-flex h-7 max-w-[calc(100cqw-24px)] items-center gap-2 rounded-2 px-1.5 text-xs text-ink-2 transition-colors hover:text-foreground",
                            FOCUS,
                          )}
                        >
                          <motion.span
                            aria-hidden
                            className="flex size-4 shrink-0 items-center justify-center"
                            initial={false}
                            animate={{ rotate: isFolded ? -90 : 0 }}
                            transition={
                              motionSafe ? springs.snap : { duration: 0 }
                            }
                          >
                            <ChevronDown className="size-3.5" />
                          </motion.span>
                          {lanes === "priority" ? (
                            <span
                              aria-hidden
                              className={cn(
                                "h-3 w-0.5 shrink-0 rounded-full",
                                PRIORITY_BAR[lane.id as SwimPriority],
                              )}
                            />
                          ) : (
                            <span
                              aria-hidden
                              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-medium"
                            >
                              {initials(lane.title)}
                            </span>
                          )}
                          <span className="truncate font-medium text-foreground">
                            {lane.title}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
                            {laneCards.length}{" "}
                            {laneCards.length === 1 ? "card" : "cards"}
                            {isFolded ? " folded" : ""}
                          </span>
                        </button>
                      </div>
                    ) : null}
                    <motion.div
                      id={bodyId}
                      className="overflow-clip"
                      initial={false}
                      animate={{
                        height: isFolded ? 0 : "auto",
                        opacity: isFolded ? 0 : 1,
                      }}
                      transition={{
                        height: motionSafe ? springs.glide : { duration: 0 },
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                      }}
                      inert={isFolded || undefined}
                    >
                      <div className={cn(gridCols, "py-1.5")}>
                        {columns.map((col) => {
                          const cell = shown.filter((c) =>
                            inCell(c, { column: col.id, lane: lane.id }, lanes),
                          );
                          return (
                            <ul
                              key={col.id}
                              role="list"
                              ref={(node) => {
                                const k = `${col.id}|${lane.id}`;
                                if (node) cellNodes.current.set(k, node);
                                else cellNodes.current.delete(k);
                              }}
                              aria-label={
                                lanes === "none"
                                  ? col.title
                                  : `${col.title}, ${lane.title} lane`
                              }
                              className="flex flex-col gap-2"
                            >
                              {status === "loading"
                                ? [0, 1].map((i) => (
                                    <li
                                      key={i}
                                      aria-hidden
                                      className={cn(
                                        "h-16 rounded-3 border border-hairline bg-surface-1",
                                        motionSafe && "animate-pulse",
                                      )}
                                    />
                                  ))
                                : null}
                              <>
                                {status === "ready"
                                  ? cell.map((card, i) => {
                                      if (
                                        drag &&
                                        drag.phase === "drag" &&
                                        card.id === drag.id
                                      ) {
                                        return (
                                          <motion.li
                                            key={`gap-${i}`}
                                            aria-hidden
                                            data-swim-gap=""
                                            className="rounded-3 border border-dashed border-cobalt-bright/50 bg-cobalt-wash"
                                            initial={
                                              motionSafe
                                                ? { height: 0, opacity: 0 }
                                                : false
                                            }
                                            animate={{
                                              height: drag.height,
                                              opacity: 1,
                                            }}
                                            transition={{
                                              height: motionSafe
                                                ? springs.glide
                                                : { duration: 0 },
                                              opacity: {
                                                duration: durations.fast,
                                              },
                                            }}
                                          />
                                        );
                                      }
                                      return (
                                        <CardView
                                          key={card.id}
                                          card={card}
                                          owner={personOf(card.owner)}
                                          uid={uid}
                                          name={nameOf(card)}
                                          hintId={hintId}
                                          tabbable={card.id === tabbableId}
                                          lifted={lift?.id === card.id}
                                          landing={
                                            drag?.phase === "land" &&
                                            drag.id === card.id
                                          }
                                          liftRot={liftRot}
                                          motionSafe={motionSafe}
                                          disabled={disabled}
                                          register={(id, node) => {
                                            if (!node) return;
                                            const nodes = cardNodes.current;
                                            nodes.set(id, node);
                                            // A card moving cells mounts its
                                            // new node first: only this node's
                                            // own entry is cleared.
                                            return () => {
                                              if (nodes.get(id) === node) {
                                                nodes.delete(id);
                                              }
                                            };
                                          }}
                                          onOpen={(id) => onCardOpen?.(id)}
                                          onKeyDown={onCardKeyDown}
                                          onFocusCard={setFocusId}
                                          onBlurCard={(id, event) => {
                                            // Focus leaving the board while a
                                            // card is carried puts it back.
                                            if (
                                              moving.current ||
                                              lift?.id !== id
                                            )
                                              return;
                                            const next = event.relatedTarget;
                                            if (
                                              next instanceof Node &&
                                              rootRef.current?.contains(next)
                                            )
                                              return;
                                            cancelLift();
                                          }}
                                        />
                                      );
                                    })
                                  : null}
                              </>
                            </ul>
                          );
                        })}
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </LayoutGroup>
          </div>
        </motion.div>
      )}

      {drag && carriedCard ? (
        <motion.div
          aria-hidden
          className={cn(
            CARD_BOX,
            "pointer-events-none absolute top-0 left-0 z-40 cursor-grabbing border-cobalt-bright/60",
          )}
          style={{
            width: drag.width,
            x: ox,
            y: oy,
            rotate: rot,
            scale: carryScale,
            boxShadow: carryShadow,
          }}
        >
          <CardFace
            card={carriedCard}
            owner={personOf(carriedCard.owner)}
            showGrip={false}
          />
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
