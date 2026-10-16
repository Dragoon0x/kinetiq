"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  LoaderCircle,
  MoveRight,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  cascade,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type StackColumn = { id: string; title: string };

export type StackPriority = "urgent" | "high" | "normal";

export type StackCard = {
  /** Also the key printed on the card, e.g. "CB-1042". */
  id: string;
  title: string;
  /** The id of the column the card sits in. Array order is column order. */
  column: string;
  /** Who the ticket is from. */
  customer?: string;
  /** Urgent and high show a dot; normal shows nothing. @default "normal" */
  priority?: StackPriority;
  /** When the ticket was opened, in ms since the epoch; read against `now`. */
  openedAt?: number;
};

export type StackMoveFailure = { id: string; reason: string };

/** What a host answers a move with: the cards that could not go, and why. */
export type StackMoveResult = { failed?: StackMoveFailure[] };

export type StackCardStyle = "raised" | "flat" | "outline";
export type StackCarryStatus = "ready" | "loading" | "error";

export type StackCarryProps = {
  /** The board's columns, left to right. @default defaultStackColumns */
  columns?: StackColumn[];
  /** Controlled cards, in column order. */
  cards?: StackCard[];
  /** Initial cards when uncontrolled. @default defaultStackCards (Coldbrook's Tuesday queue) */
  defaultCards?: StackCard[];
  /** Fires with the whole board after a move landed. */
  onCardsChange?: (cards: StackCard[]) => void;
  /** Controlled selection, as card ids. */
  selected?: string[];
  /** Initial selection when uncontrolled. @default [] */
  defaultSelected?: string[];
  /** Fires from the click, key or long press that changed the selection, with the ids in board order. */
  onSelect?: (ids: string[]) => void;
  /** Moves the cards; answer (now or later) with any that could not move. The rest land, in their board order, at `index` among the column's other cards. */
  onMoveMany?: (
    ids: string[],
    toColumn: string,
    index: number,
  ) => StackMoveResult | void | Promise<StackMoveResult | void>;
  /** How far the carried stack fans, in degrees per card; 0 is a neat pile. @default 7 */
  fanAngle?: number;
  /** Cards drawn in the carried stack; the badge counts the rest. @default 5 */
  maxFan?: number;
  /** Card surface: raised with a shadow, a flat tint, or an outline on the board colour. @default "raised" */
  cardStyle?: StackCardStyle;
  /** Selection border and tab, the stack's badge, the drop wash and the menu. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a finger holds a card before selecting starts, in ms. @default 450 */
  longPressMs?: number;
  /** The moment ticket ages are read against, in ms. Never the wall clock. @default Date.UTC(2026, 9, 13, 11) */
  now?: number;
  /** The board's heading. @default "Coldbrook Support" */
  title?: string;
  /** One line under the heading. @default "Tuesday queue" */
  subtitle?: string;
  /** Whether the board has loaded. @default "ready" */
  status?: StackCarryStatus;
  /** Try again was pressed after the board failed to load. */
  onReload?: () => void;
  /** Read-only: cards can be selected but nothing moves. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DEFAULT_NOW = Date.UTC(2026, 9, 13, 11);

export const defaultStackColumns: StackColumn[] = [
  { id: "new", title: "New" },
  { id: "assigned", title: "Assigned" },
  { id: "waiting", title: "Waiting" },
  { id: "solved", title: "Solved" },
];

export const defaultStackCards: StackCard[] = [
  {
    id: "CB-1048",
    title: "Card declined at checkout",
    column: "new",
    customer: "Harbour Deli",
    priority: "urgent",
    openedAt: DEFAULT_NOW - 40 * MIN,
  },
  {
    id: "CB-1047",
    title: "Export stuck at 90%",
    column: "new",
    customer: "Tidewater Co.",
    priority: "high",
    openedAt: DEFAULT_NOW - 70 * MIN,
  },
  {
    id: "CB-1046",
    title: "Change billing email",
    column: "new",
    customer: "Moss & Rye",
    openedAt: DEFAULT_NOW - 2 * HOUR,
  },
  {
    id: "CB-1045",
    title: "Duplicate invoice in March",
    column: "new",
    customer: "Pellar Studio",
    openedAt: DEFAULT_NOW - 3 * HOUR,
  },
  {
    id: "CB-1044",
    title: "Sign-in loops back to start",
    column: "new",
    customer: "Northgate Rowing",
    priority: "high",
    openedAt: DEFAULT_NOW - 5 * HOUR,
  },
  {
    id: "CB-1043",
    title: "Add a second admin",
    column: "assigned",
    customer: "Fenn Bakery",
    openedAt: DEFAULT_NOW - 26 * HOUR,
  },
  {
    id: "CB-1040",
    title: "Cancel annual plan",
    column: "assigned",
    customer: "Quayside Books",
    openedAt: DEFAULT_NOW - 30 * HOUR,
  },
  {
    id: "CB-1042",
    title: "Refund for a double charge",
    column: "waiting",
    customer: "Harbour Deli",
    priority: "high",
    openedAt: DEFAULT_NOW - 50 * HOUR,
  },
  {
    id: "CB-1041",
    title: "Receipt missing VAT number",
    column: "waiting",
    customer: "Larch Joinery",
    openedAt: DEFAULT_NOW - 52 * HOUR,
  },
  {
    id: "CB-1039",
    title: "Webhook retries doubled",
    column: "solved",
    customer: "Tidewater Co.",
    openedAt: DEFAULT_NOW - 74 * HOUR,
  },
  {
    id: "CB-1038",
    title: "Password reset email late",
    column: "solved",
    customer: "Fenn Bakery",
    openedAt: DEFAULT_NOW - 98 * HOUR,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const EMPTY: string[] = [];

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CARD_STYLE: Record<StackCardStyle, string> = {
  raised:
    "border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_7%,transparent)]",
  flat: "border border-transparent bg-surface-2",
  outline: "border border-hairline-strong bg-surface-0",
};

/** "40m", "3h", "2d": an age by hand, so the server and the browser agree. */
const ageOf = (now: number, at?: number) => {
  if (at === undefined) return null;
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 60)
    return { short: `${m}m`, long: m === 1 ? "1 minute" : `${m} minutes` };
  const h = Math.floor(m / 60);
  if (h < 24)
    return { short: `${h}h`, long: h === 1 ? "1 hour" : `${h} hours` };
  const d = Math.floor(h / 24);
  return { short: `${d}d`, long: d === 1 ? "1 day" : `${d} days` };
};

/** Cards in reading order: column by column, array order within. */
const boardOrder = (list: StackCard[], columns: StackColumn[]) =>
  columns.flatMap((col) => list.filter((c) => c.column === col.id));

/** Moves `ids`, in board order, to `index` among the other cards of `column`. */
function moveMany(
  list: StackCard[],
  columns: StackColumn[],
  ids: string[],
  column: string,
  index: number,
): StackCard[] {
  const set = new Set(ids);
  const moving = boardOrder(list, columns)
    .filter((c) => set.has(c.id))
    .map((c) => ({ ...c, column }));
  const rest = list.filter((c) => !set.has(c.id));
  let seen = 0;
  let at = -1;
  let last = -1;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i]?.column !== column) continue;
    if (seen === index && at === -1) at = i;
    seen += 1;
    last = i;
  }
  if (at === -1) at = last === -1 ? rest.length : last + 1;
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** Frame time, read only from handlers. */
const stampNow = () => performance.now();

/** Writes a transform by hand: FLIP's first frame, before motion paints. */
const placeNode = (node: HTMLElement, transform: string) => {
  node.style.transform = transform;
};

/** Layout position inside `root`, ignoring transforms. */
function layoutPos(node: HTMLElement, root: HTMLElement) {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = node;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/** Where card `k` (0 is the grabbed one, on top) sits in the fan. */
const fanSlot = (k: number, fanAngle: number, maxFan: number) => {
  const depth = Math.min(k, Math.max(1, maxFan) - 1);
  if (depth === 0) return { x: 0, y: 0, rot: 0 };
  const side = depth % 2 === 1 ? 1 : -1;
  const m = Math.ceil(depth / 2);
  return {
    x: r2(side * (3 + fanAngle * 0.9) * m),
    y: r2(4 * m),
    rot: r2(side * fanAngle * m * 0.75),
  };
};

/* ----------------------------------------------------------------------- */
/*                                 Card face                                */
/* ----------------------------------------------------------------------- */

function CardFace({
  card,
  selected,
  age,
  failure,
  cardStyle,
  motionSafe,
  lifted = false,
}: {
  card: StackCard;
  selected: boolean;
  age: string | null;
  failure: string | null;
  cardStyle: StackCardStyle;
  motionSafe: boolean;
  lifted?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative rounded-3 px-2.5 pt-2 pb-2.5 transition-[border-color,background-color,box-shadow] duration-200",
        CARD_STYLE[cardStyle] ?? CARD_STYLE.raised,
        selected &&
          "border-(--sc-accent) bg-[color-mix(in_oklab,var(--sc-accent)_7%,var(--card))]",
        lifted &&
          "shadow-[0_14px_30px_color-mix(in_oklab,black_20%,transparent)]",
      )}
    >
      <div className="flex h-4 items-center gap-1.5">
        <span
          aria-hidden
          data-sc-check=""
          className={cn(
            "flex size-3.5 shrink-0 items-center justify-center rounded-1 border transition-colors",
            selected
              ? "border-(--sc-fill) bg-(--sc-fill) text-white"
              : "border-hairline-strong bg-card text-transparent group-hover/sc-item:border-ink-3",
          )}
        >
          <svg viewBox="0 0 16 16" className="size-2.5">
            <motion.path
              d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: selected ? 1 : 0 }}
              transition={motionSafe ? springs.flick : { duration: 0 }}
            />
          </svg>
        </span>
        <span className="font-mono text-[11px] leading-none text-ink-3 tabular-nums">
          {card.id}
        </span>
        {card.priority === "urgent" || card.priority === "high" ? (
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              card.priority === "urgent"
                ? "bg-(--sc-urgent)"
                : "bg-(--sc-high)",
            )}
          />
        ) : null}
        {age ? (
          <span className="ml-auto font-mono text-[11px] leading-none text-ink-3 tabular-nums">
            {age}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.35] font-medium text-foreground">
        {card.title}
      </p>
      {card.customer ? (
        <p className="mt-0.5 truncate text-[12px] leading-4 text-ink-3">
          {card.customer}
        </p>
      ) : null}
      {failure ? (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] leading-4 text-danger">
          <TriangleAlert aria-hidden className="size-3 shrink-0" />
          {failure}
        </p>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Real card                                */
/* ----------------------------------------------------------------------- */

type CardMotion = { x: MotionValue<number>; y: MotionValue<number> };

type StackItemProps = {
  card: StackCard;
  selected: boolean;
  active: boolean;
  placeholder: boolean;
  hidden: boolean;
  busy: boolean;
  failure: string | null;
  shake: number;
  pulse: number;
  age: { short: string; long: string } | null;
  cardStyle: StackCardStyle;
  touchGrab: boolean;
  motionSafe: boolean;
  hintId: string;
  onNode: (id: string, node: HTMLLIElement | null, mv: CardMotion) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLLIElement>, id: string) => void;
  onFocusItem: (id: string) => void;
};

function StackItem({
  card,
  selected,
  active,
  placeholder,
  hidden,
  busy,
  failure,
  shake,
  pulse,
  age,
  cardStyle,
  touchGrab,
  motionSafe,
  hintId,
  onNode,
  onKeyDown,
  onFocusItem,
}: StackItemProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const face = React.useRef<HTMLDivElement | null>(null);
  const setNode = React.useCallback(
    (node: HTMLLIElement | null) => onNode(card.id, node, { x, y }),
    [card.id, onNode, x, y],
  );

  // A refused card shakes its head once, on a five-beat tween; a long press
  // answers with a quick squeeze on flick.
  React.useEffect(() => {
    const el = face.current;
    if (!shake || !el || !motionSafe) return;
    const run = animate(
      el,
      { x: [0, -5, 5, -3, 3, 0] },
      { duration: 0.42, ease: easings.move },
    );
    return () => run.stop();
  }, [shake, motionSafe]);
  React.useEffect(() => {
    const el = face.current;
    if (!pulse || !el || !motionSafe) return;
    let back: AnimationPlaybackControls | null = null;
    const run = animate(
      el,
      { scale: 0.96 },
      {
        ...springs.flick,
        onComplete: () => {
          back = animate(el, { scale: 1 }, springs.snap);
        },
      },
    );
    return () => {
      run.stop();
      back?.stop();
      placeNode(el, "");
    };
  }, [pulse, motionSafe]);

  const label = `${card.id}, ${card.title}${card.customer ? `, ${card.customer}` : ""}${
    card.priority === "urgent"
      ? ", urgent"
      : card.priority === "high"
        ? ", high priority"
        : ""
  }${age ? `, opened ${age.long} ago` : ""}.${failure ? ` Not moved: ${failure}.` : ""}`;

  return (
    <motion.li
      ref={setNode}
      role="option"
      aria-selected={selected}
      aria-label={label}
      aria-describedby={hintId}
      aria-busy={busy || undefined}
      data-sc-card={card.id}
      tabIndex={active ? 0 : -1}
      onKeyDown={(event) => onKeyDown(event, card.id)}
      onFocus={() => onFocusItem(card.id)}
      style={{
        x,
        y,
        touchAction: touchGrab ? "none" : "pan-x pan-y",
      }}
      className={cn(
        "group/sc-item relative block cursor-grab rounded-3 select-none",
        FOCUS_RING,
      )}
    >
      {placeholder ? (
        <span
          aria-hidden
          className="absolute inset-0 rounded-3 border border-dashed border-[color-mix(in_oklab,var(--sc-accent)_45%,var(--hairline-strong))] bg-[color-mix(in_oklab,var(--sc-accent)_4%,transparent)]"
        />
      ) : null}
      <div
        ref={face}
        className={cn(
          // Only dimming while the host answers eases; a card its copy has
          // just reached appears at once, so the hand-off never blinks.
          placeholder || hidden
            ? "opacity-0"
            : busy
              ? "opacity-60 transition-opacity duration-150"
              : "opacity-100",
        )}
      >
        <CardFace
          card={card}
          selected={selected}
          age={age?.short ?? null}
          failure={failure}
          cardStyle={cardStyle}
          motionSafe={motionSafe}
        />
      </div>
    </motion.li>
  );
}

/* ----------------------------------------------------------------------- */
/*                               Flying copies                              */
/* ----------------------------------------------------------------------- */

type Box = { x: number; y: number; w: number };

type Ghost = {
  id: string;
  /** Depth in the stack; 0 is the grabbed card, on top. */
  k: number;
  from: Box;
};

type GhostMotion = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  opacity: MotionValue<number>;
};

function StackGhost({
  ghost,
  card,
  count,
  anchor,
  slot,
  following,
  pending,
  showBadge,
  visible,
  age,
  cardStyle,
  motionSafe,
  onGhost,
}: {
  ghost: Ghost;
  card: StackCard;
  count: number;
  anchor: { x: MotionValue<number>; y: MotionValue<number> };
  slot: { x: number; y: number; rot: number };
  following: boolean;
  pending: boolean;
  showBadge: boolean;
  visible: boolean;
  age: string | null;
  cardStyle: StackCardStyle;
  motionSafe: boolean;
  onGhost: (id: string, mv: GhostMotion | null) => void;
}) {
  const x = useMotionValue(ghost.from.x);
  const y = useMotionValue(ghost.from.y);
  const rotate = useMotionValue(0);
  const opacity = useMotionValue(visible ? 1 : 0);

  // Registered before the board's own layout effect runs, so the deal can
  // fly this copy in the same frame the cards land.
  React.useLayoutEffect(() => {
    onGhost(ghost.id, { x, y, rotate, opacity });
    return () => onGhost(ghost.id, null);
  }, [ghost.id, onGhost, x, y, rotate, opacity]);

  React.useEffect(() => {
    if (following) opacity.set(visible ? 1 : 0);
  }, [following, visible, opacity]);

  // While carried, the grabbed card follows 1:1 and every card behind it
  // follows on its own spring, softer the deeper it sits: a fast throw
  // strings the deck out, a pause gathers it.
  React.useEffect(() => {
    if (!following) return;
    const k = ghost.k;
    const stiffness = 560 / (1 + 0.5 * k);
    const trail = {
      type: "spring" as const,
      stiffness,
      damping: 2 * 0.92 * Math.sqrt(stiffness),
      mass: 1,
    };
    let runs: AnimationPlaybackControls[] = [];
    const go = () => {
      for (const r of runs) r.stop();
      runs = [];
      const tx = r2(anchor.x.get() + slot.x);
      const ty = r2(anchor.y.get() + slot.y);
      if (k === 0 || !motionSafe) {
        x.set(tx);
        y.set(ty);
        return;
      }
      runs = [animate(x, tx, trail), animate(y, ty, trail)];
    };
    go();
    const offX = anchor.x.on("change", go);
    const offY = anchor.y.on("change", go);
    let tilt: AnimationPlaybackControls | null = null;
    if (motionSafe) tilt = animate(rotate, slot.rot, springs.snap);
    else rotate.jump(0);
    return () => {
      offX();
      offY();
      for (const r of runs) r.stop();
      tilt?.stop();
    };
  }, [
    following,
    ghost.k,
    anchor,
    slot.x,
    slot.y,
    slot.rot,
    motionSafe,
    x,
    y,
    rotate,
  ]);

  return (
    <motion.div
      className="absolute top-0 left-0"
      style={{
        x,
        y,
        rotate,
        opacity,
        width: ghost.from.w,
        zIndex: 100 - ghost.k,
      }}
    >
      <CardFace
        card={card}
        selected
        age={age}
        failure={null}
        cardStyle={cardStyle}
        motionSafe={motionSafe}
        lifted
      />
      {showBadge ? (
        <motion.span
          className="absolute -top-2 -right-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-(--sc-fill) px-1.5 font-mono text-[11px] font-semibold text-white tabular-nums shadow-[0_4px_10px_color-mix(in_oklab,black_25%,transparent)] ring-2 ring-card"
          initial={motionSafe ? { scale: 0.4, opacity: 0 } : { opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            motionSafe
              ? { scale: springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {pending ? (
            <LoaderCircle
              aria-hidden
              className="size-3.5 motion-safe:animate-spin"
            />
          ) : (
            count
          )}
        </motion.span>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Move menu                                */
/* ----------------------------------------------------------------------- */

function MoveMenu({
  columns,
  counts,
  here,
  total,
  motionSafe,
  opener,
  onPick,
  onClose,
}: {
  opener: React.RefObject<HTMLElement | null>;
  columns: StackColumn[];
  counts: Record<string, number>;
  here: Record<string, number>;
  total: number;
  motionSafe: boolean;
  onPick: (column: string) => void;
  onClose: (refocus: boolean) => void;
}) {
  const usable = columns.map((c) => (here[c.id] ?? 0) < total);
  const first = Math.max(0, usable.indexOf(true));
  const [at, setAt] = React.useState(first);
  const items = React.useRef<(HTMLButtonElement | null)[]>([]);
  const box = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    items.current[at]?.focus({ preventScroll: true });
  }, [at]);

  // A press anywhere else closes the menu without moving anything.
  React.useEffect(() => {
    const down = (event: PointerEvent) => {
      const t = event.target as Node;
      if (opener.current?.contains(t)) return;
      if (box.current && !box.current.contains(t)) onClose(false);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [onClose, opener]);

  const step = (dir: number) => {
    for (let i = 1; i <= columns.length; i += 1) {
      const n = (at + dir * i + columns.length) % columns.length;
      if (usable[n]) {
        setAt(n);
        return;
      }
    }
  };

  return (
    <motion.div
      ref={box}
      role="menu"
      aria-label={`Move ${total === 1 ? "1 ticket" : `${total} tickets`} to`}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          step(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          step(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          setAt(first);
        } else if (event.key === "End") {
          event.preventDefault();
          setAt(Math.max(0, usable.lastIndexOf(true)));
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        } else if (event.key === "Tab") {
          onClose(false);
        }
      }}
      initial={{
        opacity: 0,
        y: motionSafe ? -4 : 0,
        scale: motionSafe ? 0.97 : 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={{
        opacity: { duration: durations.fast },
        y: motionSafe ? springs.snap : { duration: 0 },
        scale: motionSafe ? springs.snap : { duration: 0 },
      }}
      style={{ originX: 1, originY: 0 }}
      className="absolute top-full right-3 z-50 mt-1.5 w-56 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_14px_36px_color-mix(in_oklab,black_20%,transparent)]"
    >
      <p className="px-2 pt-1.5 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        Move to
      </p>
      {columns.map((col, i) => {
        const allHere = !usable[i];
        return (
          <button
            key={col.id}
            ref={(node) => {
              items.current[i] = node;
            }}
            type="button"
            role="menuitem"
            tabIndex={i === at ? 0 : -1}
            aria-disabled={allHere || undefined}
            onClick={() => {
              if (!allHere) onPick(col.id);
            }}
            onPointerMove={() => {
              if (!allHere && i !== at) setAt(i);
            }}
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-2 px-2 text-left text-[13px] transition-colors",
              allHere
                ? "cursor-default text-ink-3"
                : "text-foreground hover:bg-[color-mix(in_oklab,var(--sc-accent)_10%,transparent)] focus-visible:bg-[color-mix(in_oklab,var(--sc-accent)_10%,transparent)]",
              FOCUS_RING,
              "focus-visible:outline-offset-0",
            )}
          >
            <MoveRight aria-hidden className="size-3.5 shrink-0 text-ink-3" />
            <span className="flex-1 truncate">{col.title}</span>
            <span className="font-mono text-[11px] text-ink-3 tabular-nums">
              {allHere
                ? "here"
                : (here[col.id] ?? 0) > 0
                  ? `${here[col.id]} here`
                  : (counts[col.id] ?? 0)}
            </span>
          </button>
        );
      })}
    </motion.div>
  );
}

/**
 * The stack a drag will carry, in miniature: up to three cards fanned at the
 * board's own angle, so the fan can be read before anything is picked up.
 */
function StackGlyph({
  count,
  fanAngle,
  motionSafe,
}: {
  count: number;
  fanAngle: number;
  motionSafe: boolean;
}) {
  const cards = Math.max(1, Math.min(3, count));
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 16"
      className="h-4 w-5 shrink-0 overflow-visible"
    >
      {Array.from({ length: cards }, (_, i) => {
        const k = cards - 1 - i;
        const slot = fanSlot(k, fanAngle, 3);
        return (
          <motion.rect
            key={k}
            x={6}
            y={3}
            width={8}
            height={10}
            rx={1.5}
            initial={false}
            animate={{
              rotate: slot.rot,
              x: r2(slot.x * 0.5),
              y: r2(slot.y * 0.25),
            }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
            style={{ originX: "50%", originY: "100%" }}
            className={cn(
              "stroke-card",
              k === 0
                ? "fill-(--sc-fill)"
                : "fill-[color-mix(in_oklab,var(--sc-fill)_55%,var(--card))]",
            )}
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}

/** A count that rolls toward the direction it moved. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [seen, setSeen] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (seen !== value) {
    setDir(value > seen ? 1 : -1);
    setSeen(value);
  }
  return (
    <span
      aria-hidden
      className="relative inline-grid overflow-clip tabular-nums"
    >
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          className="[grid-area:1/1]"
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${d * 70}%` : 0,
            }),
            shown: { opacity: 1, y: "0%" },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${-d * 70}%` : 0,
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
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The board                                */
/* ----------------------------------------------------------------------- */

type Over = { column: string; index: number; y: number };

type Carry = {
  ids: string[];
  lead: string;
  over: Over | null;
  /** The host has not answered yet: the stack waits where it was dropped. */
  pending: boolean;
};

/**
 * A kanban board where a selection moves as one stack. Shift-click selects a
 * run, Cmd or Ctrl-click (or the card's check tab) toggles, X toggles the
 * focused card and a long press starts selecting on touch. Dragging any
 * selected card gathers the others under the pointer: each flies from its
 * place to its slot in a fan on its own spring, softer the deeper it sits,
 * so a fast throw strings the deck out and a pause gathers it, while a count
 * badge lands on `springs.recoil`. Dropping deals them into the column in
 * their original order on `springs.glide`, `cascade()` apart, as the cards
 * around them FLIP to make room; M opens a move menu that deals the same way.
 *
 * `onMoveMany` may refuse some cards: they fly home, shake once and say why.
 * Columns are multi-select listboxes sharing one roving tab stop; Escape
 * clears the selection. Under reduced motion the stack is a tidy pile at the
 * pointer and the cards cross-fade into place.
 */
export function StackCarry({
  columns = defaultStackColumns,
  cards: cardsProp,
  defaultCards = defaultStackCards,
  onCardsChange,
  selected: selectedProp,
  defaultSelected = EMPTY,
  onSelect,
  onMoveMany,
  fanAngle = 7,
  maxFan = 5,
  cardStyle = "raised",
  accent = "var(--accent-bright)",
  longPressMs = 450,
  now = DEFAULT_NOW,
  title = "Coldbrook Support",
  subtitle = "Tuesday queue",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: StackCarryProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const locked = disabled || !ready;

  const [own, setOwn] = React.useState<StackCard[]>(defaultCards);
  const cards = cardsProp ?? own;
  const [ownSel, setOwnSel] = React.useState<string[]>(defaultSelected);
  const visible = boardOrder(cards, columns);
  const byId = new Map(visible.map((c) => [c.id, c]));
  const order = new Map(visible.map((c, i) => [c.id, i]));
  const selection = (selectedProp ?? ownSel).filter((id) => byId.has(id));
  const selSet = new Set(selection);
  const lanes = columns.map((col) =>
    visible.filter((c) => c.column === col.id),
  );
  const colTitle = (id: string) =>
    columns.find((c) => c.id === id)?.title ?? id;

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const tabStop =
    activeId && byId.has(activeId) ? activeId : (visible[0]?.id ?? null);
  const [carry, setCarry] = React.useState<Carry | null>(null);
  const [ghosts, setGhosts] = React.useState<Ghost[]>([]);
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState<string[]>([]);
  const [failures, setFailures] = React.useState<Record<string, string>>({});
  const [shakes, setShakes] = React.useState<Record<string, number>>({});
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const [menu, setMenu] = React.useState<{ from: string | null } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const moveButton = React.useRef<HTMLButtonElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLLIElement>());
  const cardMv = React.useRef(new Map<string, CardMotion>());
  const colNodes = React.useRef(new Map<string, HTMLElement>());
  const runs = React.useRef(new Map<string, AnimationPlaybackControls[]>());
  const timers = React.useRef(new Set<number>());
  const anchorX = useMotionValue(0);
  const anchorY = useMotionValue(0);
  const anchor = React.useMemo(
    () => ({ x: anchorX, y: anchorY }),
    [anchorX, anchorY],
  );
  const anchorSel = React.useRef<string | null>(null);
  const token = React.useRef(0);

  const onNode = React.useCallback(
    (id: string, node: HTMLLIElement | null, mv: CardMotion) => {
      if (node) {
        cardNodes.current.set(id, node);
        cardMv.current.set(id, mv);
      } else if (cardMv.current.get(id) === mv) {
        cardNodes.current.delete(id);
        cardMv.current.delete(id);
      }
    },
    [],
  );

  React.useEffect(() => {
    const t = timers.current;
    const r = runs.current;
    return () => {
      for (const id of t) window.clearTimeout(id);
      t.clear();
      for (const list of r.values()) for (const c of list) c.stop();
      r.clear();
    };
  }, []);

  /* ------------------------------ selection ------------------------------ */

  const setSelection = (ids: string[], spoken?: string) => {
    const sorted = Array.from(new Set(ids))
      .filter((id) => byId.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    if (selectedProp === undefined) setOwnSel(sorted);
    onSelect?.(sorted);
    if (Object.keys(failures).length) setFailures({});
    say(
      spoken ??
        (sorted.length === 0
          ? "Selection cleared."
          : `${sorted.length === 1 ? "1 ticket" : `${sorted.length} tickets`} selected.`),
    );
  };

  const toggle = (id: string) => {
    anchorSel.current = id;
    const on = selSet.has(id);
    const next = on ? selection.filter((x) => x !== id) : [...selection, id];
    setSelection(
      next,
      `${id} ${on ? "deselected" : "selected"}. ${next.length === 1 ? "1 ticket" : `${next.length} tickets`} selected.`,
    );
  };

  const selectRun = (to: string) => {
    const from =
      anchorSel.current && byId.has(anchorSel.current) ? anchorSel.current : to;
    const a = order.get(from) ?? 0;
    const b = order.get(to) ?? 0;
    const run = visible
      .slice(Math.min(a, b), Math.max(a, b) + 1)
      .map((c) => c.id);
    setSelection(Array.from(new Set([...selection, ...run])));
  };

  /* ------------------------------ FLIP moves ------------------------------ */

  const flipFrom = React.useRef<{
    at: number;
    pos: Map<string, { x: number; y: number }>;
  } | null>(null);
  const deal = React.useRef<{
    ghosts: string[];
    failed: Set<string>;
    focus: string | null;
  } | null>(null);
  const [dealSeq, setDealSeq] = React.useState(0);

  const failedNow = React.useRef(new Set<string>());
  const ghostMv = React.useRef(new Map<string, GhostMotion>());
  const onGhost = React.useCallback((id: string, mv: GhostMotion | null) => {
    if (mv) ghostMv.current.set(id, mv);
    else ghostMv.current.delete(id);
  }, []);

  /** A copy reached its card: the card shows, the copy goes, a refusal shakes. */
  const arrived = React.useCallback((id: string) => {
    runs.current.delete(`ghost:${id}`);
    setGhosts((list) => list.filter((g) => g.id !== id));
    setHidden((h) => h.filter((x) => x !== id));
    if (failedNow.current.has(id)) {
      failedNow.current.delete(id);
      setShakes((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
    }
  }, []);

  const capture = () => {
    const content = contentRef.current;
    if (!content) return;
    const cb = content.getBoundingClientRect();
    const pos = new Map<string, { x: number; y: number }>();
    for (const [id, node] of cardNodes.current) {
      const r = node.getBoundingClientRect();
      pos.set(id, { x: r.left - cb.left, y: r.top - cb.top });
    }
    flipFrom.current = { at: stampNow(), pos };
  };

  /** A node's box in the surface's own coordinates, where the copies fly. */
  const boxIn = (node: Element): Box => {
    const surface = surfaceRef.current;
    const r = node.getBoundingClientRect();
    if (!surface) return { x: r.left, y: r.top, w: r.width };
    const s = surface.getBoundingClientRect();
    return {
      x: r2(r.left - s.left - surface.clientLeft),
      y: r2(r.top - s.top - surface.clientTop),
      w: r2(r.width),
    };
  };

  React.useLayoutEffect(() => {
    const snap = flipFrom.current;
    const content = contentRef.current;
    flipFrom.current = null;
    if (snap && content && stampNow() - snap.at < 1500) {
      const skip = new Set(deal.current?.ghosts ?? []);
      for (const [id, node] of cardNodes.current) {
        const old = snap.pos.get(id);
        const mv = cardMv.current.get(id);
        if (!old || !mv || skip.has(id)) continue;
        const at = layoutPos(node, content);
        const dx = r2(old.x - at.x);
        const dy = r2(old.y - at.y);
        for (const c of runs.current.get(id) ?? []) c.stop();
        runs.current.delete(id);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !motionSafe) {
          mv.x.jump(0);
          mv.y.jump(0);
          placeNode(node, "");
          continue;
        }
        mv.x.jump(dx);
        mv.y.jump(dy);
        placeNode(node, `translateX(${dx}px) translateY(${dy}px)`);
        runs.current.set(id, [
          animate(dx, 0, {
            ...springs.glide,
            onUpdate: (v) => mv.x.set(r2(v)),
          }),
          animate(dy, 0, {
            ...springs.glide,
            onUpdate: (v) => mv.y.set(r2(v)),
            onComplete: () => runs.current.delete(id),
          }),
        ]);
      }
    }
    // The copies fly to where their cards now really are: plain numbers
    // written into each copy's values, a cascade apart, on glide.
    const d = deal.current;
    if (!d) return;
    deal.current = null;
    const step = cascade(d.ghosts.length);
    let n = 0;
    for (const id of d.ghosts) {
      const node = cardNodes.current.get(id);
      const mv = ghostMv.current.get(id);
      if (!node || !mv) {
        arrived(id);
        continue;
      }
      const b = boxIn(node);
      mv.x.stop();
      mv.y.stop();
      mv.rotate.stop();
      mv.opacity.set(1);
      if (!motionSafe) {
        mv.x.jump(b.x);
        mv.y.jump(b.y);
        mv.rotate.jump(0);
        arrived(id);
        continue;
      }
      const t = { ...springs.glide, delay: r2(n * step) };
      n += 1;
      const list = [
        animate(mv.x.get(), b.x, { ...t, onUpdate: (v) => mv.x.set(r2(v)) }),
        animate(mv.rotate.get(), 0, {
          ...t,
          onUpdate: (v) => mv.rotate.set(r2(v)),
        }),
        animate(mv.y.get(), b.y, {
          ...t,
          onUpdate: (v) => mv.y.set(r2(v)),
          onComplete: () => arrived(id),
        }),
      ];
      runs.current.set(`ghost:${id}`, list);
    }
    if (d.focus) cardNodes.current.get(d.focus)?.focus({ preventScroll: true });
    // Measured after commit by design: the layout this effect reads only
    // exists once the cards are in their new columns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, dealSeq]);

  /* ------------------------------- the deal ------------------------------- */

  /**
   * Lands a move: commits the cards that went, sends every copy to its card's
   * real place (the moved ones into the column, refused ones home), and says
   * what happened.
   */
  const land = (
    ids: string[],
    column: string,
    index: number,
    result: StackMoveResult | void,
    focus: string | null,
    carried: boolean,
  ) => {
    const failed = new Map(
      (result?.failed ?? [])
        .filter((f) => ids.includes(f.id))
        .map((f) => [f.id, f.reason] as const),
    );
    const went = ids.filter((id) => !failed.has(id));
    const next = went.length
      ? moveMany(cards, columns, went, column, index)
      : cards;
    // A keyboard move has no stack: its copies rise from the cards' places.
    if (!carried) liftInPlace(went);
    capture();
    failedNow.current = new Set(failed.keys());
    deal.current = {
      ghosts: carried ? ids : went,
      failed: new Set(failed.keys()),
      focus,
    };
    setHidden(carried ? ids : went);
    setBusy([]);
    setCarry(null);
    setDealSeq((s) => s + 1);
    if (went.length) {
      if (cardsProp === undefined) setOwn(next);
      onCardsChange?.(next);
    }
    if (failed.size) setFailures(Object.fromEntries(failed));
    const keep = ids.filter((id) => failed.has(id));
    if (selectedProp === undefined) setOwnSel(keep);
    onSelect?.(keep);
    const where = colTitle(column);
    say(
      failed.size === 0
        ? `Moved ${went.length === 1 ? "1 ticket" : `${went.length} tickets`} to ${where}.`
        : `${went.length} of ${ids.length} moved to ${where}. ${Array.from(
            failed,
          )
            .map(([id, why]) => `${id} stayed: ${why}`)
            .join(". ")}.`,
    );
  };

  const run = (
    ids: string[],
    column: string,
    index: number,
    focus: string | null,
    carried: boolean,
  ) => {
    token.current += 1;
    const mine = token.current;
    let answer: StackMoveResult | void | Promise<StackMoveResult | void>;
    try {
      answer = onMoveMany?.(ids, column, index);
    } catch {
      answer = { failed: ids.map((id) => ({ id, reason: "The move failed" })) };
    }
    if (answer && typeof (answer as Promise<unknown>).then === "function") {
      setCarry((c) => (c ? { ...c, pending: true } : c));
      setBusy(ids);
      say(`Moving ${ids.length === 1 ? "1 ticket" : `${ids.length} tickets`}…`);
      (answer as Promise<StackMoveResult | void>).then(
        (res) => {
          if (token.current === mine)
            land(ids, column, index, res, focus, carried);
        },
        (error: unknown) => {
          if (token.current !== mine) return;
          const reason =
            error instanceof Error && error.message
              ? error.message
              : "The move failed";
          land(
            ids,
            column,
            index,
            { failed: ids.map((id) => ({ id, reason })) },
            focus,
            carried,
          );
        },
      );
      return;
    }
    land(ids, column, index, answer as StackMoveResult | void, focus, carried);
  };

  /** Copies of the cards at their current places, for a keyboard move. */
  const liftInPlace = (ids: string[]) => {
    const list: Ghost[] = [];
    ids.forEach((id, k) => {
      const node = cardNodes.current.get(id);
      if (node) list.push({ id, k, from: boxIn(node) });
    });
    setGhosts(list);
  };

  const moveSelectionTo = (column: string, focus: string | null) => {
    if (locked || selection.length === 0) return;
    const ids = selection.filter((id) => byId.get(id)?.column !== column);
    if (ids.length === 0) return;
    const index = visible.filter(
      (c) => c.column === column && !ids.includes(c.id),
    ).length;
    run(ids, column, index, focus, false);
  };

  /* -------------------------------- pointer ------------------------------- */

  const press = React.useRef<{
    id: string;
    x: number;
    y: number;
    pointer: string;
    onCheck: boolean;
    longPressed: boolean;
    timer: number;
  } | null>(null);
  const dragRef = React.useRef<{
    ids: string[];
    lead: string;
    grabX: number;
    grabY: number;
    px: number;
    py: number;
    over: Over | null;
  } | null>(null);
  const edgeLoop = React.useRef(0);

  const clearPressTimer = () => {
    const p = press.current;
    if (p?.timer) {
      window.clearTimeout(p.timer);
      timers.current.delete(p.timer);
      p.timer = 0;
    }
  };

  const hitTest = (px: number, py: number, carried: string[]): Over | null => {
    let column: string | null = null;
    let best = Infinity;
    for (const col of columns) {
      const node = colNodes.current.get(col.id);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      const dx = px < r.left ? r.left - px : px > r.right ? px - r.right : 0;
      const dy = py < r.top ? r.top - py : py > r.bottom ? py - r.bottom : 0;
      const dist = Math.hypot(dx, dy);
      if (dist < best) {
        best = dist;
        column = col.id;
      }
    }
    const colNode = column ? colNodes.current.get(column) : null;
    if (!column || !colNode || best > 48) return null;
    const cr = colNode.getBoundingClientRect();
    const rects = visible
      .filter((c) => c.column === column && !carried.includes(c.id))
      .map((c) => cardNodes.current.get(c.id)?.getBoundingClientRect())
      .filter((r): r is DOMRect => r !== undefined);
    let index = 0;
    for (const r of rects) if (r.top + r.height / 2 < py) index += 1;
    const prev = rects[index - 1];
    const next = rects[index];
    const list = colNode.querySelector("ul")?.getBoundingClientRect();
    const y =
      prev && next
        ? (prev.bottom + next.top) / 2
        : prev
          ? prev.bottom + 4
          : next
            ? next.top - 4
            : (list?.top ?? cr.top) + 4;
    return { column, index, y: r2(y - cr.top) };
  };

  const follow = () => {
    const d = dragRef.current;
    const surface = surfaceRef.current;
    if (!d || !surface) return;
    const s = surface.getBoundingClientRect();
    anchorX.set(r2(d.px - s.left - surface.clientLeft - d.grabX));
    anchorY.set(r2(d.py - s.top - surface.clientTop - d.grabY));
    const over = hitTest(d.px, d.py, d.ids);
    const same =
      over?.column === d.over?.column &&
      over?.index === d.over?.index &&
      over?.y === d.over?.y;
    if (!same) {
      d.over = over;
      setCarry((c) => (c ? { ...c, over } : c));
    }
  };

  const edgeTick = () => {
    edgeLoop.current = 0;
    const d = dragRef.current;
    const sc = scrollRef.current;
    if (!d || !sc) return;
    const r = sc.getBoundingClientRect();
    const E = 36;
    const dy =
      d.py < r.top + E
        ? -Math.ceil((r.top + E - d.py) / 4)
        : d.py > r.bottom - E
          ? Math.ceil((d.py - (r.bottom - E)) / 4)
          : 0;
    if (!dy) return;
    const before = sc.scrollTop;
    sc.scrollBy(0, dy);
    if (sc.scrollTop === before) return;
    follow();
    edgeLoop.current = requestAnimationFrame(edgeTick);
  };

  const stopEdge = () => {
    if (edgeLoop.current) cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = 0;
  };

  /** Sends every copy home: a drop outside the board, Escape or a lost pointer. */
  const goHome = (ids: string[]) => {
    deal.current = { ghosts: ids, failed: new Set(), focus: null };
    setHidden(ids);
    setCarry(null);
    setDealSeq((s) => s + 1);
    say("Nothing moved.");
  };

  const gesture = useDrag({
    threshold: 5,
    // Read-only boards still take taps: selecting is allowed, carrying not.
    disabled: !ready,
    onStart: () => {
      const p = press.current;
      const surface = surfaceRef.current;
      clearPressTimer();
      if (!p || !surface || p.longPressed || ghosts.length || locked) return;
      // A finger carries only cards it can hold: selected ones.
      if (p.pointer === "touch" && !selSet.has(p.id)) return;
      const ids = selSet.has(p.id) ? selection : [p.id];
      if (!selSet.has(p.id)) {
        anchorSel.current = p.id;
        if (selectedProp === undefined) setOwnSel([p.id]);
        onSelect?.([p.id]);
      }
      const leadNode = cardNodes.current.get(p.id);
      if (!leadNode) return;
      const lead = boxIn(leadNode);
      const s = surface.getBoundingClientRect();
      const ordered = [p.id, ...ids.filter((id) => id !== p.id)];
      const list: Ghost[] = [];
      ordered.forEach((id, k) => {
        const node = cardNodes.current.get(id);
        if (node) list.push({ id, k, from: boxIn(node) });
      });
      dragRef.current = {
        ids: ordered,
        lead: p.id,
        grabX: p.x - s.left - surface.clientLeft - lead.x,
        grabY: p.y - s.top - surface.clientTop - lead.y,
        px: p.x,
        py: p.y,
        over: null,
      };
      anchorX.jump(lead.x);
      anchorY.jump(lead.y);
      setFailures({});
      setMenu(null);
      setGhosts(list);
      setCarry({ ids: ordered, lead: p.id, over: null, pending: false });
      setActiveId(p.id);
      say(
        `Carrying ${ordered.length === 1 ? "1 ticket" : `${ordered.length} tickets`}. Drop on a column.`,
      );
    },
    onMove: ({ point }) => {
      const d = dragRef.current;
      if (!d) return;
      d.px = point.x;
      d.py = point.y;
      follow();
      if (!edgeLoop.current) edgeLoop.current = requestAnimationFrame(edgeTick);
    },
    onEnd: () => {
      const d = dragRef.current;
      dragRef.current = null;
      stopEdge();
      if (!d) return;
      const over = d.over;
      if (!over) {
        goHome(d.ids);
        return;
      }
      const ordered = boardOrder(cards, columns)
        .filter((c) => d.ids.includes(c.id))
        .map((c) => c.id);
      // Dropped where they already are, in the same order: nothing to ask.
      const next = moveMany(cards, columns, ordered, over.column, over.index);
      const unchanged = next.every(
        (c, i) => c.id === cards[i]?.id && c.column === cards[i]?.column,
      );
      if (unchanged) {
        goHome(d.ids);
        return;
      }
      run(ordered, over.column, over.index, d.lead, true);
    },
    onCancel: () => {
      const d = dragRef.current;
      dragRef.current = null;
      stopEdge();
      clearPressTimer();
      if (d) goHome(d.ids);
    },
    onTap: (event) => {
      const p = press.current;
      clearPressTimer();
      if (!p || p.longPressed) return;
      if (p.pointer === "touch") {
        // On touch, taps toggle once selecting has started.
        if (selection.length > 0) toggle(p.id);
        else setActiveId(p.id);
        return;
      }
      if (event.shiftKey) selectRun(p.id);
      else if (event.metaKey || event.ctrlKey || p.onCheck) toggle(p.id);
      else {
        anchorSel.current = p.id;
        setSelection([p.id], `${p.id} selected.`);
      }
      setActiveId(p.id);
    },
  });

  const onBoardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const id = target
      .closest<HTMLElement>("[data-sc-card]")
      ?.getAttribute("data-sc-card");
    if (!id) {
      press.current = null;
      if (selection.length && !ghosts.length && event.button === 0)
        setSelection([]);
      return;
    }
    if (ghosts.length || busy.length) {
      press.current = null;
      return;
    }
    press.current = {
      id,
      x: event.clientX,
      y: event.clientY,
      pointer: event.pointerType,
      onCheck: target.closest("[data-sc-check]") !== null,
      longPressed: false,
      timer: 0,
    };
    if (event.pointerType === "touch") {
      const p = press.current;
      const t = window.setTimeout(
        () => {
          timers.current.delete(t);
          if (press.current !== p) return;
          p.longPressed = true;
          p.timer = 0;
          setPulses((s) => ({ ...s, [id]: (s[id] ?? 0) + 1 }));
          if (!selSet.has(id)) toggle(id);
          setActiveId(id);
        },
        Math.max(150, longPressMs),
      );
      timers.current.add(t);
      p.timer = t;
    }
    gesture.onPointerDown(event);
  };

  const onBoardPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p?.timer && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 6) {
      clearPressTimer();
    }
    gesture.onPointerMove(event);
  };

  /* ------------------------------- keyboard ------------------------------- */

  const focusCard = (id: string) => {
    setActiveId(id);
    const node = cardNodes.current.get(id);
    if (!node) return;
    node.focus({ preventScroll: true });
    const sc = scrollRef.current;
    if (!sc) return;
    const s = sc.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    if (r.top < s.top + 8) sc.scrollBy({ top: r.top - s.top - 8 });
    else if (r.bottom > s.bottom - 8)
      sc.scrollBy({ top: r.bottom - s.bottom + 8 });
  };

  const neighbour = (id: string, key: string): string | null => {
    const col = lanes.findIndex((lane) => lane.some((c) => c.id === id));
    if (col < 0) return null;
    const lane = lanes[col] ?? [];
    const at = lane.findIndex((c) => c.id === id);
    if (key === "ArrowUp") return lane[at - 1]?.id ?? null;
    if (key === "ArrowDown") return lane[at + 1]?.id ?? null;
    if (key === "Home") return lane[0]?.id ?? null;
    if (key === "End") return lane[lane.length - 1]?.id ?? null;
    const step = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    if (!step) return null;
    for (let c = col + step; c >= 0 && c < lanes.length; c += step) {
      const other = lanes[c] ?? [];
      if (other.length)
        return other[Math.min(at, other.length - 1)]?.id ?? null;
    }
    return null;
  };

  const openMenu = (from: string | null) => {
    if (locked) return;
    menuFrom.current = from;
    setMenu({ from });
  };

  const menuFrom = React.useRef<string | null>(null);
  const closeMenu = React.useCallback((refocus: boolean) => {
    setMenu(null);
    if (!refocus) return;
    const from = menuFrom.current;
    const back = from ? cardNodes.current.get(from) : moveButton.current;
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      back?.focus({ preventScroll: true });
    }, 0);
    timers.current.add(t);
  }, []);

  const onItemKey = (event: React.KeyboardEvent<HTMLLIElement>, id: string) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
      ].includes(key)
    ) {
      event.preventDefault();
      const next = neighbour(id, key);
      if (!next) return;
      if (event.shiftKey && (key === "ArrowUp" || key === "ArrowDown")) {
        anchorSel.current = anchorSel.current ?? id;
        setSelection([...selection, id, next]);
      }
      focusCard(next);
      return;
    }
    if (key === " " || key === "x" || key === "X") {
      if (event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      toggle(id);
      return;
    }
    if ((key === "a" || key === "A") && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      const col = byId.get(id)?.column;
      setSelection([
        ...selection,
        ...visible.filter((c) => c.column === col).map((c) => c.id),
      ]);
      return;
    }
    if ((key === "m" || key === "M") && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      if (locked) return;
      if (selection.length === 0) setSelection([id]);
      openMenu(id);
      return;
    }
    if (key === "Escape" && selection.length) {
      event.preventDefault();
      event.stopPropagation();
      setSelection([]);
    }
  };

  /* -------------------------------- render -------------------------------- */

  const hiddenSet = new Set(hidden);
  const carried = new Set(carry?.ids ?? []);
  const busySet = new Set(busy);
  const selColumns = Array.from(
    new Set(selection.map((id) => byId.get(id)?.column ?? "")),
  ).filter(Boolean);
  const counts = Object.fromEntries(
    lanes.map((lane, i) => [columns[i]?.id ?? "", lane.length]),
  );
  const here = Object.fromEntries(
    columns.map((c) => [
      c.id,
      selection.filter((id) => byId.get(id)?.column === c.id).length,
    ]),
  );
  const fan = Math.max(0, Math.min(30, fanAngle));
  const shownFan = motionSafe ? fan : 0;

  const header = (
    <header className="relative flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <div className="min-w-0 flex-1 basis-40">
        <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
          {title}
        </h2>
        <p className="truncate text-[12px] leading-4 text-ink-3">
          {subtitle} ·{" "}
          {visible.length === 1 ? "1 ticket" : `${visible.length} tickets`}
        </p>
      </div>
      <p
        aria-hidden
        className="hidden items-center gap-2 text-[11px] text-ink-3 @min-[40rem]/stack-carry:flex"
      >
        <span>
          <kbd className="font-mono">⇧</kbd>/<kbd className="font-mono">⌘</kbd>{" "}
          click to select
        </span>
        <span className="text-hairline-strong">·</span>
        <span>
          <kbd className="font-mono">X</kbd> select ·{" "}
          <kbd className="font-mono">M</kbd> move
        </span>
      </p>
      <AnimatePresence initial={false}>
        {selection.length > 0 && ready ? (
          <motion.div
            key="bar"
            className="absolute inset-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1.5 bg-card px-4 py-2"
            initial={{ y: motionSafe ? "-100%" : 0, opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            exit={{
              y: motionSafe ? "-100%" : 0,
              opacity: 0,
              transition: exitFor(durations.base),
            }}
            transition={{
              y: motionSafe ? springs.snap : { duration: 0 },
              opacity: { duration: durations.fast },
            }}
          >
            <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[color-mix(in_oklab,var(--sc-accent)_12%,transparent)] pr-2.5 pl-2 text-[13px] font-medium text-foreground">
              <StackGlyph
                count={selection.length}
                fanAngle={fan}
                motionSafe={motionSafe}
              />
              <RollingCount value={selection.length} motionSafe={motionSafe} />
              <span>selected</span>
              <span className="sr-only">{`${selection.length} selected`}</span>
            </span>
            <span className="hidden truncate text-[12px] text-ink-3 @min-[30rem]/stack-carry:inline">
              from {selColumns.map(colTitle).join(", ")}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <button
                ref={moveButton}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu !== null}
                aria-disabled={locked || undefined}
                onClick={() => (menu ? closeMenu(false) : openMenu(null))}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-2 bg-(--sc-fill) px-3 text-[12px] font-medium text-white transition-opacity hover:opacity-90 aria-disabled:opacity-50",
                  FOCUS_RING,
                )}
              >
                {busy.length ? (
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 motion-safe:animate-spin"
                  />
                ) : (
                  <MoveRight aria-hidden className="size-3.5" />
                )}
                Move
                <span className="hidden @min-[24rem]/stack-carry:inline">
                  {" "}
                  to…
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelection([])}
                aria-label="Clear selection"
                className={cn(
                  "inline-flex size-8 items-center justify-center rounded-2 border border-hairline text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {menu && selection.length > 0 ? (
          <MoveMenu
            key="menu"
            columns={columns}
            counts={counts}
            here={here}
            total={selection.length}
            motionSafe={motionSafe}
            opener={moveButton}
            onClose={closeMenu}
            onPick={(column) => {
              const from = menu.from;
              setMenu(null);
              moveSelectionTo(column, from ?? selection[0] ?? null);
            }}
          />
        ) : null}
      </AnimatePresence>
    </header>
  );

  const body =
    status === "loading" ? (
      <div
        aria-busy="true"
        className="grid grid-cols-1 gap-4 p-4 @min-[40rem]/stack-carry:grid-cols-4 @min-[40rem]/stack-carry:gap-3"
      >
        <span className="sr-only">Loading the queue.</span>
        {[3, 2, 2, 1].map((n, i) => (
          <div key={i} aria-hidden className="flex flex-col gap-2">
            <span className="h-4 w-20 rounded-2 bg-surface-2" />
            {Array.from({ length: n }, (_, j) => (
              <span
                key={j}
                className="h-[4.5rem] rounded-3 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">The queue did not load.</p>
        {onReload ? (
          <button
            type="button"
            onClick={onReload}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline bg-card px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Try again
          </button>
        ) : null}
      </div>
    ) : (
      <div
        ref={contentRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={(event) => {
          clearPressTimer();
          gesture.onPointerUp(event);
        }}
        onPointerCancel={(event) => {
          clearPressTimer();
          gesture.onPointerCancel(event);
        }}
        onLostPointerCapture={gesture.onLostPointerCapture}
        className="relative grid grid-cols-1 gap-4 p-3 @min-[40rem]/stack-carry:grid-cols-[repeat(var(--sc-cols),minmax(0,1fr))] @min-[40rem]/stack-carry:gap-3 @min-[40rem]/stack-carry:p-4"
        style={
          { "--sc-cols": Math.max(1, columns.length) } as React.CSSProperties
        }
      >
        {columns.map((col, ci) => {
          const lane = lanes[ci] ?? [];
          const isOver = carry?.over?.column === col.id && !carry.pending;
          const headId = `${uid}-col-${ci}`;
          const selHere = here[col.id] ?? 0;
          return (
            <section
              key={col.id}
              ref={(node) => {
                if (node) colNodes.current.set(col.id, node);
                else colNodes.current.delete(col.id);
              }}
              className={cn(
                "relative flex flex-col gap-2 rounded-3 p-1 transition-[background-color,box-shadow] duration-200",
                isOver &&
                  "bg-[color-mix(in_oklab,var(--sc-accent)_7%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--sc-accent)_30%,transparent)]",
              )}
            >
              <div className="flex h-7 items-center gap-2 px-1">
                <h3
                  id={headId}
                  className="truncate text-[12px] font-semibold tracking-[0.02em] text-ink-2"
                >
                  {col.title}
                </h3>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {lane.length}
                </span>
                {selHere > 0 ? (
                  <span className="ml-auto rounded-full bg-[color-mix(in_oklab,var(--sc-accent)_12%,transparent)] px-1.5 font-mono text-[10px] leading-4 text-(--sc-accent) tabular-nums">
                    {selHere} sel
                  </span>
                ) : null}
              </div>
              <ul
                role="listbox"
                aria-multiselectable="true"
                aria-labelledby={headId}
                className="flex flex-col gap-2"
              >
                {lane.map((card) => (
                  <StackItem
                    key={card.id}
                    card={card}
                    selected={selSet.has(card.id)}
                    active={tabStop === card.id}
                    placeholder={carried.has(card.id)}
                    hidden={hiddenSet.has(card.id)}
                    busy={busySet.has(card.id) && !carried.has(card.id)}
                    failure={failures[card.id] ?? null}
                    shake={shakes[card.id] ?? 0}
                    pulse={pulses[card.id] ?? 0}
                    age={ageOf(now, card.openedAt)}
                    cardStyle={cardStyle}
                    touchGrab={selSet.has(card.id) && !locked}
                    motionSafe={motionSafe}
                    hintId={hintId}
                    onNode={onNode}
                    onKeyDown={onItemKey}
                    onFocusItem={setActiveId}
                  />
                ))}
                {lane.length === 0 ? (
                  <li
                    role="presentation"
                    className="flex h-14 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-[12px] text-ink-3"
                  >
                    Empty
                  </li>
                ) : null}
              </ul>
              {isOver && carry?.over ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-(--sc-accent)"
                  style={{ top: carry.over.y - 1 }}
                />
              ) : null}
            </section>
          );
        })}
      </div>
    );

  const following = carry !== null;

  return (
    <div
      className={cn("@container/stack-carry w-full", className)}
      style={
        {
          "--sc-accent": accent,
          "--sc-fill": `oklch(from ${accent} 0.58 0.15 h)`,
          "--sc-urgent": "oklch(from var(--danger) 0.64 0.2 h)",
          "--sc-high": "oklch(from var(--warn) 0.78 0.15 h)",
        } as React.CSSProperties
      }
    >
      <div
        ref={surfaceRef}
        role="region"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className={cn(
          "relative mx-auto flex max-h-[35rem] w-full max-w-[64rem] flex-col overflow-hidden rounded-4 border border-hairline-strong bg-card text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_12%,transparent)]",
          disabled && "opacity-70",
        )}
      >
        {header}
        <div
          ref={scrollRef}
          className="relative flex-1 [scrollbar-width:thin] overflow-auto overscroll-contain bg-surface-0"
        >
          {body}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-40">
          {ghosts.map((g) => {
            const card = byId.get(g.id);
            if (!card) return null;
            return (
              <StackGhost
                key={g.id}
                ghost={g}
                card={card}
                count={carry?.ids.length ?? ghosts.length}
                anchor={anchor}
                slot={fanSlot(g.k, shownFan, maxFan)}
                following={following && carry?.ids.includes(g.id) === true}
                pending={carry?.pending === true}
                showBadge={g.k === 0 && carry !== null && carry.ids.length > 1}
                visible={g.k < Math.max(1, maxFan) || carry === null}
                age={ageOf(now, card.openedAt)?.short ?? null}
                cardStyle={cardStyle}
                motionSafe={motionSafe}
                onGhost={onGhost}
              />
            );
          })}
        </div>
        <p id={hintId} className="sr-only">
          Arrows move between tickets, Shift with Up or Down extends the
          selection, X or Space selects, M moves the selection to a column,
          Escape clears it. Drag a selected ticket to carry them all.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </div>
  );
}
