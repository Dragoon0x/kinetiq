"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  LayoutGroup,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Bell,
  Check,
  CircleCheck,
  Hourglass,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PatinaTone = "copper" | "rust" | "dust" | "ink";
export type PatinaCardStyle = "plain" | "raised" | "outline";
export type PatinaStatus = "ready" | "loading" | "error";

export type PatinaCard = {
  id: string;
  /** The column the card sits in; order within a column is the array's order. */
  columnId: string;
  title: string;
  /** Request number in mono: "BW-131". */
  key?: string;
  /** Who owns it, as a full name. Stale cards offer to nudge them. */
  owner?: string;
  /** When the card last moved or changed, ms since the epoch: its patina grows from here. */
  still: number;
};

export type PatinaColumn = {
  id: string;
  title: string;
  /** A column still fetching its cards draws outlines. @default "ready" */
  status?: "ready" | "loading";
};

export type PatinaPlace = { columnId: string; index: number };

export type PatinaMove = {
  cardId: string;
  from: PatinaPlace;
  to: PatinaPlace;
  /** Every card after the move; the moved card's `still` is now. */
  cards: PatinaCard[];
};

export type PatinaBoardProps = {
  /** The columns, in order. @default defaultPatinaColumns */
  columns?: PatinaColumn[];
  /** Controlled cards. Moves and edits are reported through `onCardsChange`. */
  cards?: PatinaCard[];
  /** Initial cards when uncontrolled. @default defaultPatinaCards */
  defaultCards?: PatinaCard[];
  /** Fires with every card after a move or an edit. */
  onCardsChange?: (cards: PatinaCard[]) => void;
  /** Fires from the drop or key that moved a card. */
  onMove?: (move: PatinaMove) => void;
  /** Fires when a card's title is edited in place. */
  onEdit?: (cardId: string, title: string) => void;
  /** Nudge was pressed on a stale card, for its owner. */
  onNudgeOwner?: (card: PatinaCard) => void;
  /** Controlled Stale filter: the oldest cards gathered to the top of each column. */
  staleFirst?: boolean;
  /** Initial Stale filter when uncontrolled. @default false */
  defaultStaleFirst?: boolean;
  /** Fires from the toggle that turned the Stale filter on or off. */
  onFilterStale?: (on: boolean) => void;
  /** How much patina a card gains per day it sits still, as a share of full; full at 1 / rate days. @default 0.08 */
  patinaRate?: number;
  /** Cards drawn plain with a hairline, raised on a shadow, or as an outline over the column. @default "plain" */
  cardStyle?: PatinaCardStyle;
  /** The patina's pigment: verdigris, rust, dust or ink. It follows the theme. @default "copper" */
  tone?: PatinaTone;
  /** Days still before a card counts as stale: its counter warns and its owner can be nudged. @default 7 */
  staleAfter?: number;
  /** Today, ms since the epoch. @default defaultPatinaNow */
  now?: number;
  /** Whether the board's cards have arrived. @default "ready" */
  status?: PatinaStatus;
  /** "Try again" was pressed after the board failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Basinworks facilities" */
  title?: string;
  /** The board's height, px; columns scroll inside it. @default 460 */
  height?: number;
  /** The board's accessible name. @default the title */
  label?: string;
  /** Freezes the board: no drags, keys, edits or nudges. @default false */
  disabled?: boolean;
  /** Classes for the outer panel. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** 16 October 2026, 09:00 UTC. */
export const defaultPatinaNow = Date.UTC(2026, 9, 16, 9);

export const defaultPatinaColumns: PatinaColumn[] = [
  { id: "requested", title: "Requested" },
  { id: "quoting", title: "Quoting" },
  { id: "approved", title: "Approved" },
  { id: "scheduled", title: "Scheduled" },
];

const ago = (days: number, hours = 0) =>
  defaultPatinaNow - days * DAY - hours * 3_600_000;

/** Basinworks' facilities requests: some fresh, some weeks still. Scheduled is clear. */
export const defaultPatinaCards: PatinaCard[] = [
  {
    id: "bw-131",
    columnId: "requested",
    key: "BW-131",
    title: "Replace the dock door seal",
    owner: "Mara Lind",
    still: ago(12, 3),
  },
  {
    id: "bw-138",
    columnId: "requested",
    key: "BW-138",
    title: "Leak above the cold store",
    owner: "Joel Ade",
    still: ago(3, 5),
  },
  {
    id: "bw-140",
    columnId: "requested",
    key: "BW-140",
    title: "New badge reader at gate 2",
    owner: "Priya Das",
    still: ago(9, 1),
  },
  {
    id: "bw-142",
    columnId: "requested",
    key: "BW-142",
    title: "Repaint the loading bay lines",
    owner: "Kenji Ota",
    still: ago(1, 2),
  },
  {
    id: "bw-144",
    columnId: "requested",
    key: "BW-144",
    title: "Break room lights flicker",
    owner: "Sade Bello",
    still: ago(0, 4),
  },
  {
    id: "bw-118",
    columnId: "quoting",
    key: "BW-118",
    title: "Forklift charger quote",
    owner: "Tomas Ferrer",
    still: ago(21, 2),
  },
  {
    id: "bw-122",
    columnId: "quoting",
    key: "BW-122",
    title: "HVAC service contract",
    owner: "Ines Park",
    still: ago(15, 6),
  },
  {
    id: "bw-127",
    columnId: "quoting",
    key: "BW-127",
    title: "Pallet racking inspection",
    owner: "Mara Lind",
    still: ago(6, 1),
  },
  {
    id: "bw-133",
    columnId: "quoting",
    key: "BW-133",
    title: "Window film for the south office",
    owner: "Joel Ade",
    still: ago(4, 7),
  },
  {
    id: "bw-109",
    columnId: "approved",
    key: "BW-109",
    title: "Clear the roof drains",
    owner: "Priya Das",
    still: ago(18, 3),
  },
  {
    id: "bw-112",
    columnId: "approved",
    key: "BW-112",
    title: "Fire door closers",
    owner: "Kenji Ota",
    still: ago(8, 2),
  },
  {
    id: "bw-115",
    columnId: "approved",
    key: "BW-115",
    title: "Bike shelter by reception",
    owner: "Sade Bello",
    still: ago(2, 5),
  },
  {
    id: "bw-119",
    columnId: "approved",
    key: "BW-119",
    title: "Office chairs for finance",
    owner: "Tomas Ferrer",
    still: ago(5, 2),
  },
  {
    id: "bw-121",
    columnId: "approved",
    key: "BW-121",
    title: "Water cooler filters",
    owner: "Ines Park",
    still: ago(11, 4),
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

/**
 * Each tone is a pigment taken from a token at a fixed lightness, then mixed
 * with the ink: on a light page the mix darkens like tarnish, on a dark one it
 * lifts like dust, so the patina follows the theme by itself.
 */
const TONE: Record<PatinaTone, string> = {
  copper:
    "color-mix(in oklab, oklch(from var(--signal) 0.6 0.09 h) 68%, var(--ink))",
  rust: "color-mix(in oklab, oklch(from var(--warn) 0.56 0.12 calc(h - 28)) 70%, var(--ink))",
  dust: "color-mix(in oklab, oklch(from var(--ink-3) 0.6 0.02 h) 58%, var(--ink))",
  ink: "color-mix(in oklab, oklch(from var(--accent-bright) 0.55 0.12 h) 70%, var(--ink))",
};

const CARD_STYLE: Record<PatinaCardStyle, string> = {
  plain: "border border-hairline bg-card",
  raised:
    "bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent),0_4px_12px_color-mix(in_oklab,black_7%,transparent)]",
  outline: "border border-hairline-strong bg-transparent",
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const EDGE = 40;

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;
const same = (a: PatinaPlace | null, b: PatinaPlace | null) =>
  !!a && !!b && a.columnId === b.columnId && a.index === b.index;
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
};
const daysStill = (card: PatinaCard, now: number) =>
  Math.max(0, Math.floor((now - card.still) / DAY));
const ageText = (days: number) => (days === 0 ? "today" : `${days}d`);

type Order = Record<string, string[]>;

function orderOf(columns: PatinaColumn[], cards: PatinaCard[]): Order {
  const out: Order = {};
  for (const c of columns) out[c.id] = [];
  for (const card of cards) out[card.columnId]?.push(card.id);
  return out;
}

function placed(order: Order, id: string, at: PatinaPlace | null): Order {
  if (!at) return order;
  const out: Order = {};
  for (const [col, ids] of Object.entries(order)) {
    out[col] = ids.filter((x) => x !== id);
  }
  const list = out[at.columnId];
  if (list) list.splice(clamp(at.index, 0, list.length), 0, id);
  return out;
}

function placeOf(order: Order, id: string): PatinaPlace | null {
  for (const [columnId, ids] of Object.entries(order)) {
    const index = ids.indexOf(id);
    if (index !== -1) return { columnId, index };
  }
  return null;
}

function offsetWithin(node: HTMLElement, container: HTMLElement) {
  let x = 0;
  let y = 0;
  let el: HTMLElement | null = node;
  while (el && el !== container) {
    x += el.offsetLeft;
    y += el.offsetTop;
    const parent: Element | null = el.offsetParent;
    el = parent instanceof HTMLElement ? parent : null;
  }
  return { x, y };
}

/* ----------------------------------------------------------------------- */
/*                                   Patina                                 */
/* ----------------------------------------------------------------------- */

/**
 * Four turbulence masks with different seeds, defined once per board; a card
 * picks one by the hash of its id, so neighbours never weather alike.
 */
function PatinaFilters({ id }: { id: string }) {
  return (
    <svg aria-hidden width="0" height="0" className="absolute">
      <defs>
        {[11, 29, 47, 83].map((seed, i) => (
          <filter
            key={seed}
            id={`${id}-${i}`}
            x="0"
            y="0"
            width="1"
            height="1"
            filterUnits="objectBoundingBox"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={i % 2 ? "0.05 0.08" : "0.075 0.055"}
              numOctaves={3}
              seed={seed}
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.7 0 0 0 -0.62"
              result="mask"
            />
            <feComposite in="SourceGraphic" in2="mask" operator="in" />
          </filter>
        ))}
      </defs>
    </svg>
  );
}

/** Tarnish first gathers at the edges; mottling blooms on the face once it is a quarter of the way. */
function PatinaLayer({
  amount,
  filterId,
  variant,
  tone,
}: {
  amount: number;
  filterId: string;
  variant: number;
  tone: PatinaTone;
}) {
  const colour = TONE[tone];
  const edge = r2(clamp(amount, 0, 1));
  const mottle = r2(clamp((amount - 0.2) / 0.8, 0, 1) * 0.42);
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-[opacity,box-shadow] duration-700"
      style={{
        opacity: amount > 0 ? 1 : 0,
        boxShadow: `inset 0 0 ${r2(4 + edge * 18)}px ${r2(-1 + edge * 2.5)}px color-mix(in oklab, ${colour} ${Math.round(6 + edge * 34)}%, transparent)`,
      }}
    >
      <svg
        className="absolute inset-0 size-full transition-opacity duration-700"
        style={{ opacity: mottle }}
        preserveAspectRatio="none"
      >
        <rect
          width="100%"
          height="100%"
          filter={`url(#${filterId}-${variant})`}
          style={{ fill: colour }}
        />
      </svg>
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                    Card                                  */
/* ----------------------------------------------------------------------- */

type CardMode = "rest" | "lifted" | "placeholder" | "landing";
type Polish = { n: number; amount: number };

function DaysCounter({
  days,
  stale,
  motionSafe,
}: {
  days: number;
  stale: boolean;
  motionSafe: boolean;
}) {
  const text = ageText(days);
  return (
    <span
      className={cn(
        "relative inline-flex h-4 shrink-0 items-center gap-1 overflow-clip font-mono text-[10.5px] tabular-nums transition-colors",
        stale ? "text-warn" : "text-ink-3",
      )}
    >
      {stale ? <Hourglass aria-hidden className="size-2.5" /> : null}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={text}
          className="inline-block leading-4"
          initial={{ opacity: 0, y: motionSafe ? -6 : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{
            opacity: 0,
            y: motionSafe ? 6 : 0,
            transition: { duration: durations.fast, ease: easings.exit },
          }}
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

function CardFace({
  card,
  days,
  stale,
  nudged,
  hop,
  tabbable,
  editing,
  disabled,
  motionSafe,
  onNudge,
  onEditDone,
}: {
  card: PatinaCard;
  days: number;
  stale: boolean;
  nudged: boolean;
  hop: number;
  tabbable: boolean;
  editing: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onNudge?: () => void;
  onEditDone?: (title: string | null) => void;
}) {
  const [draft, setDraft] = React.useState(card.title);
  // Each edit starts from the title as it is now.
  const [seenEditing, setSeenEditing] = React.useState(editing);
  if (seenEditing !== editing) {
    setSeenEditing(editing);
    if (editing) setDraft(card.title);
  }
  const closing = React.useRef(false);
  const bindInput = React.useCallback((node: HTMLInputElement | null) => {
    if (!node) return;
    closing.current = false;
    node.focus({ preventScroll: true });
    node.select();
  }, []);
  return (
    <span className="pointer-events-none relative flex min-w-0 flex-col gap-1.5 px-2.5 py-2 text-left">
      <span className="flex min-w-0 items-center gap-1.5">
        {card.key ? (
          <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
            {card.key}
          </span>
        ) : null}
        <span className="ml-auto">
          <DaysCounter days={days} stale={stale} motionSafe={motionSafe} />
        </span>
      </span>
      {editing && onEditDone ? (
        <input
          ref={bindInput}
          value={draft}
          aria-label={`Title of ${card.key ?? "the card"}`}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              closing.current = true;
              onEditDone(draft);
            } else if (event.key === "Escape") {
              // Ours: the edit closes, and nothing behind it.
              event.preventDefault();
              closing.current = true;
              onEditDone(null);
            }
          }}
          onBlur={() => {
            if (closing.current) return;
            closing.current = true;
            onEditDone(draft);
          }}
          className={cn(
            "pointer-events-auto -mx-1 h-7 rounded-2 border border-hairline-strong bg-popover px-1 text-[13px] font-medium text-foreground",
            "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
      ) : (
        <span className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
          {card.title}
        </span>
      )}
      <span className="flex h-6 min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
        {card.owner ? (
          <>
            <motion.span
              key={hop}
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-2"
              initial={hop > 0 && motionSafe ? { y: -5 } : false}
              animate={{ y: 0 }}
              transition={springs.recoil}
            >
              {initials(card.owner)}
            </motion.span>
            {/* With a Nudge beside them the initials carry the name. */}
            {stale && onNudge ? null : (
              <span className="truncate">{card.owner.split(" ")[0]}</span>
            )}
          </>
        ) : null}
        {stale && card.owner && onNudge ? (
          <button
            type="button"
            tabIndex={tabbable ? 0 : -1}
            aria-label={
              nudged
                ? `Nudged ${card.owner}`
                : `Nudge ${card.owner} about ${card.key ?? card.title}`
            }
            aria-disabled={disabled || nudged || undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (!nudged && !disabled) onNudge();
            }}
            className={cn(
              "pointer-events-auto relative ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors",
              nudged
                ? "border-transparent text-success"
                : "border-hairline-strong bg-card text-ink-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <span className="relative inline-flex size-3 items-center justify-center">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={nudged ? "done" : "bell"}
                  className="inline-flex"
                  initial={{ opacity: 0, scale: motionSafe ? 0.5 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    transition: {
                      duration: durations.blink,
                      ease: easings.exit,
                    },
                  }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.flick,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {nudged ? (
                    <Check aria-hidden className="size-3" />
                  ) : (
                    <Bell aria-hidden className="size-3" />
                  )}
                </motion.span>
              </AnimatePresence>
            </span>
            {nudged ? "Nudged" : "Nudge"}
          </button>
        ) : null}
      </span>
    </span>
  );
}

type CardProps = {
  card: PatinaCard;
  uid: string;
  filterId: string;
  mode: CardMode;
  name: string;
  hintId: string;
  tabbable: boolean;
  cardStyle: PatinaCardStyle;
  tone: PatinaTone;
  amount: number;
  days: number;
  stale: boolean;
  nudged: boolean;
  hop: number;
  polish: Polish | null;
  editing: boolean;
  accent: string;
  placeholderHeight: number;
  lean: MotionValue<number>;
  motionSafe: boolean;
  disabled: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onKey: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusCard: (id: string) => void;
  onPress: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
  onNudge: (id: string) => void;
  onStartEdit: (id: string) => void;
  onEditDone: (id: string, title: string | null) => void;
  onPolished: (id: string, n: number) => void;
};

const CardItem = React.memo(function CardItem({
  card,
  uid,
  filterId,
  mode,
  name,
  hintId,
  tabbable,
  cardStyle,
  tone,
  amount,
  days,
  stale,
  nudged,
  hop,
  polish,
  editing,
  accent,
  placeholderHeight,
  lean,
  motionSafe,
  disabled,
  register,
  onKey,
  onFocusCard,
  onPress,
  onNudge,
  onStartEdit,
  onEditDone,
  onPolished,
}: CardProps) {
  const still = useMotionValue(0);
  const lifted = mode === "lifted";
  const variant = hashOf(card.id) % 4;
  return (
    <motion.li
      layout={motionSafe ? "position" : false}
      layoutId={`${uid}-card-${card.id}`}
      transition={{ layout: motionSafe ? springs.glide : { duration: 0 } }}
      className={cn("relative", lifted && "z-10")}
    >
      {mode === "placeholder" ? (
        <span
          aria-hidden
          className="block rounded-3 border-2 border-dashed"
          style={{
            height: placeholderHeight,
            borderColor: `color-mix(in oklab, ${accent} 55%, transparent)`,
            backgroundColor: `color-mix(in oklab, ${accent} 7%, transparent)`,
          }}
        />
      ) : null}
      <motion.div
        className={cn(
          "relative overflow-hidden rounded-3 transition-[opacity,box-shadow] duration-150",
          CARD_STYLE[cardStyle],
          mode === "placeholder" &&
            "pointer-events-none absolute inset-0 opacity-0",
          mode === "landing" && "opacity-0",
        )}
        style={{
          x: lifted ? lean : still,
          boxShadow: lifted
            ? `0 0 0 2px ${accent}, 0 10px 24px color-mix(in oklab, black 22%, transparent)`
            : undefined,
        }}
        animate={{ scale: lifted && motionSafe ? 1.02 : 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        <PatinaLayer
          amount={amount}
          filterId={filterId}
          variant={variant}
          tone={tone}
        />
        {polish ? (
          <Polishing
            key={polish.n}
            amount={polish.amount}
            filterId={filterId}
            variant={variant}
            tone={tone}
            motionSafe={motionSafe}
            onDone={() => onPolished(card.id, polish.n)}
          />
        ) : null}
        <button
          ref={(node) => register(card.id, node)}
          type="button"
          data-pb-card={card.id}
          aria-roledescription="card"
          aria-label={name}
          aria-describedby={hintId}
          aria-pressed={lifted}
          aria-disabled={disabled || undefined}
          tabIndex={tabbable ? 0 : -1}
          onKeyDown={(event) => onKey(card.id, event)}
          onFocus={() => onFocusCard(card.id)}
          onPointerDown={(event) => onPress(card.id, event)}
          onDoubleClick={() => {
            if (!disabled) onStartEdit(card.id);
          }}
          className={cn(
            "absolute inset-0 touch-pan-y rounded-3 select-none",
            FOCUS_IN,
            disabled ? "cursor-not-allowed" : "cursor-grab",
          )}
        />
        <CardFace
          card={card}
          days={days}
          stale={stale}
          nudged={nudged}
          hop={hop}
          tabbable={tabbable}
          editing={editing}
          disabled={disabled}
          motionSafe={motionSafe}
          onNudge={() => onNudge(card.id)}
          onEditDone={(title) => onEditDone(card.id, title)}
        />
      </motion.div>
    </motion.li>
  );
});

/**
 * The polish: the old patina is wiped off left to right by a clip that
 * follows a soft band of light across the card.
 */
function Polishing({
  amount,
  filterId,
  variant,
  tone,
  motionSafe,
  onDone,
}: {
  amount: number;
  filterId: string;
  variant: number;
  tone: PatinaTone;
  motionSafe: boolean;
  onDone: () => void;
}) {
  const done = React.useRef(onDone);
  React.useEffect(() => {
    done.current = onDone;
  });
  const sweep = { duration: 0.56, ease: easings.move };
  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={
          motionSafe ? { clipPath: "inset(0% 0% 0% 0%)" } : { opacity: 1 }
        }
        animate={
          motionSafe ? { clipPath: "inset(0% 0% 0% 100%)" } : { opacity: 0 }
        }
        transition={motionSafe ? sweep : { duration: 0.3, ease: easings.exit }}
        onAnimationComplete={() => done.current()}
      >
        <PatinaLayer
          amount={amount}
          filterId={filterId}
          variant={variant}
          tone={tone}
        />
      </motion.span>
      {motionSafe ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-2/5 -skew-x-12"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent, color-mix(in oklab, white 42%, transparent) 50%, transparent)",
            mixBlendMode: "soft-light",
          }}
          initial={{ x: "-110%" }}
          animate={{ x: "260%" }}
          transition={sweep}
        />
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Board                                  */
/* ----------------------------------------------------------------------- */

type Carry = {
  id: string;
  origin: PatinaPlace;
  over: PatinaPlace | null;
  grabX: number;
  grabY: number;
  px: number;
  py: number;
};

type DragView = {
  id: string;
  over: PatinaPlace | null;
  width: number;
  height: number;
  phase: "drag" | "land";
};

type Lift = { id: string; origin: PatinaPlace; at: PatinaPlace };

/**
 * A kanban board that shows how long each card has waited. Every day a card
 * sits still it gains a little patina — tarnish gathering at its edges first,
 * then a mottled bloom across its face from a turbulence mask — and its corner
 * counts the days, turning warn when the card goes stale and offering to nudge
 * its owner. The pigment is mixed with the ink, so the patina darkens like
 * tarnish on a light page and lifts like dust on a dark one.
 *
 * Moving or editing a card polishes it: a band of light crosses its face on a
 * move-eased tween while a clip follows the band's edge, wiping the old patina
 * off as the cloth passes, and the counter rolls to "today" on snap. The Stale
 * filter gathers the oldest cards to the top of every column on glide, with a
 * hairline marking where the fresher ones begin; an empty column stays clean.
 *
 * Cards move by drag (a lifted copy 1:1, a landing on snap with the release
 * velocity, then the polish) or by keys: Space lifts, arrows carry, Space or
 * Enter drops, Escape puts back; Enter or F2 renames a card in place and N
 * nudges a stale card's owner. Under reduced motion the patina fades instead
 * of being wiped and nothing travels; ages and stale marks still show.
 */
export function PatinaBoard({
  columns = defaultPatinaColumns,
  cards,
  defaultCards,
  onCardsChange,
  onMove,
  onEdit,
  onNudgeOwner,
  staleFirst,
  defaultStaleFirst = false,
  onFilterStale,
  patinaRate = 0.08,
  cardStyle = "plain",
  tone = "copper",
  staleAfter = 7,
  now = defaultPatinaNow,
  status = "ready",
  onRetry,
  title = "Basinworks facilities",
  height = 460,
  label,
  disabled = false,
  className,
}: PatinaBoardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const filterId = `pt${uid.replace(/[^a-zA-Z0-9]/g, "")}`;
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const accent = "var(--accent-bright)";
  const rate = clamp(patinaRate, 0, 1);

  /* -------------------------------- data -------------------------------- */

  const [own, setOwn] = React.useState<PatinaCard[]>(
    () => defaultCards ?? defaultPatinaCards,
  );
  const list = cards ?? own;
  const byId = React.useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);
  const [ownStale, setOwnStale] = React.useState(defaultStaleFirst);
  const sorting = staleFirst ?? ownStale;

  const daysOf = (id: string) => {
    const card = byId.get(id);
    return card ? daysStill(card, now) : 0;
  };

  /** The board's own order, before any filter. */
  const baseOrder = React.useMemo(
    () => orderOf(columns, list),
    [columns, list],
  );

  /* ------------------------------- states ------------------------------- */

  const [drag, setDrag] = React.useState<DragView | null>(null);
  const [lift, setLift] = React.useState<Lift | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [nudged, setNudged] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [hops, setHops] = React.useState<Record<string, number>>({});
  const [polish, setPolish] = React.useState<Record<string, Polish>>({});
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /** Oldest first when the filter is on; a card in hand counts as fresh, which it will be once dropped. */
  const sortColumn = React.useCallback(
    (ids: string[], held: string | null) => {
      if (!sorting) return ids;
      return ids
        .map((id, i) => ({
          id,
          i,
          d:
            id === held
              ? -1
              : (() => {
                  const card = byId.get(id);
                  return card ? daysStill(card, now) : 0;
                })(),
        }))
        .sort((a, b) => b.d - a.d || a.i - b.i)
        .map((x) => x.id);
    },
    [sorting, byId, now],
  );

  const shownOrder = React.useMemo(() => {
    let o = baseOrder;
    let held: string | null = null;
    if (drag && drag.phase === "drag" && drag.over) {
      o = placed(baseOrder, drag.id, drag.over);
      held = drag.id;
    } else if (lift) {
      o = placed(baseOrder, lift.id, lift.at);
      held = lift.id;
    }
    if (!sorting) return o;
    const out: Order = {};
    for (const [col, ids] of Object.entries(o))
      out[col] = sortColumn(ids, held);
    return out;
  }, [baseOrder, drag, lift, sorting, sortColumn]);

  const columnTitle = (id: string) =>
    columns.find((c) => c.id === id)?.title ?? id;

  /* ------------------------------- nodes -------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const bodyNodes = React.useRef(new Map<string, HTMLElement>());
  const register = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) cardNodes.current.set(id, node);
      else if (cardNodes.current.get(id)?.isConnected === false) {
        cardNodes.current.delete(id);
      }
    },
    [],
  );

  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  });

  // Focus follows the keyboard onto a card that may have just moved column;
  // it is scrolled into view by its layout box, inside the board only.
  React.useEffect(() => {
    if (!focusAsk) return;
    const node = cardNodes.current.get(focusAsk.id);
    const scroller = scrollRef.current;
    if (!node) return;
    const li = node.closest("li");
    const body = node.closest<HTMLElement>("[data-pb-body]");
    const section = body?.parentElement;
    const behavior: ScrollBehavior = motionSafeRef.current ? "smooth" : "auto";
    if (li && body && section && scroller) {
      const x0 = offsetWithin(section, scroller).x;
      const x1 = x0 + section.offsetWidth;
      const left = scroller.scrollLeft;
      const to =
        x0 - 12 < left
          ? x0 - 12
          : x1 + 12 > left + scroller.clientWidth
            ? x1 + 12 - scroller.clientWidth
            : left;
      if (to !== left) scroller.scrollTo({ left: Math.max(0, to), behavior });
      const y0 = offsetWithin(li, body).y;
      const y1 = y0 + li.offsetHeight;
      const top = body.scrollTop;
      const toTop =
        y0 - 8 < top
          ? y0 - 8
          : y1 + 8 > top + body.clientHeight
            ? y1 + 8 - body.clientHeight
            : top;
      if (toTop !== top) body.scrollTo({ top: Math.max(0, toTop), behavior });
    }
    if (document.activeElement !== node) node.focus({ preventScroll: true });
  }, [focusAsk]);

  /* ------------------------------- writes ------------------------------- */

  const write = (next: PatinaCard[]) => {
    if (cards === undefined) setOwn(next);
    onCardsChange?.(next);
  };

  /** The patina a card wore before this change, for the polish to wipe off. */
  const amountOf = (card: PatinaCard) =>
    r2(Math.min(1, daysStill(card, now) * rate));

  /** Polishes held back until a carried card has landed and can be seen. */
  const queued = React.useRef(new Map<string, number>());
  const startPolish = (id: string, amount: number) => {
    if (amount <= 0) return;
    setPolish((p) => ({ ...p, [id]: { n: (p[id]?.n ?? 0) + 1, amount } }));
  };

  const commit = (id: string, to: PatinaPlace, how: "drop" | "key") => {
    const from = placeOf(baseOrder, id);
    const card = byId.get(id);
    if (!from || !card) return false;
    if (from.columnId === to.columnId && (sorting || from.index === to.index)) {
      return false;
    }
    // While the filter sorts by age, a card joins the end of its new column.
    const at = sorting
      ? {
          columnId: to.columnId,
          index: (baseOrder[to.columnId] ?? []).filter((x) => x !== id).length,
        }
      : to;
    const nextOrder = placed(baseOrder, id, at);
    const moved = { ...card, columnId: at.columnId, still: now };
    const out: PatinaCard[] = [];
    for (const col of columns) {
      for (const cid of nextOrder[col.id] ?? []) {
        const c = cid === id ? moved : byId.get(cid);
        if (c) out.push(c.columnId === col.id ? c : { ...c, columnId: col.id });
      }
    }
    write(out);
    onMove?.({ cardId: id, from, to: at, cards: out });
    const amount = amountOf(card);
    if (how === "drop") queued.current.set(id, amount);
    else startPolish(id, amount);
    setNudged((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
    say(
      `${card.key ?? card.title} moved to ${columnTitle(at.columnId)}.${
        amount > 0 ? " Clean again." : ""
      }`,
    );
    return true;
  };

  const doEditDone = (id: string, next: string | null) => {
    setEditing(null);
    setFocusAsk((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    const card = byId.get(id);
    const text = next?.trim();
    if (!card || !text || text === card.title) return;
    const amount = amountOf(card);
    write(
      list.map((c) => (c.id === id ? { ...c, title: text, still: now } : c)),
    );
    onEdit?.(id, text);
    startPolish(id, amount);
    say(
      `Renamed ${card.key ?? "the card"}.${amount > 0 ? " Clean again." : ""}`,
    );
  };

  const doNudge = (id: string) => {
    const card = byId.get(id);
    if (!card || disabled || nudged.has(id)) return;
    setNudged((s) => new Set(s).add(id));
    setHops((h) => ({ ...h, [id]: (h[id] ?? 0) + 1 }));
    onNudgeOwner?.(card);
    say(`Nudged ${card.owner ?? "the owner"} about ${card.key ?? card.title}.`);
  };

  const polished = React.useCallback((id: string, n: number) => {
    setPolish((p) => {
      if (p[id]?.n !== n) return p;
      const next = { ...p };
      delete next[id];
      return next;
    });
  }, []);

  const toggleStale = () => {
    if (disabled) return;
    const on = !sorting;
    if (staleFirst === undefined) setOwnStale(on);
    onFilterStale?.(on);
    say(on ? "Stale first: oldest cards at the top." : "Board order.");
  };

  /* ------------------------------ pointer ------------------------------- */

  const ox = useMotionValue(0);
  const oy = useMotionValue(0);
  const liftScale = useMotionValue(1);
  const carry = React.useRef<Carry | null>(null);
  const pressed = React.useRef<{ id: string; x: number; y: number } | null>(
    null,
  );
  const landing = React.useRef<{ id: string; vx: number; vy: number } | null>(
    null,
  );
  const anims = React.useRef<AnimationPlaybackControls[]>([]);
  const scrollLoop = React.useRef<number | null>(null);
  const stopAll = () => {
    for (const c of anims.current) c.stop();
    anims.current = [];
  };

  const hitTest = (px: number, py: number, id: string): PatinaPlace | null => {
    const root = rootRef.current?.getBoundingClientRect();
    if (!root || py < root.top || py > root.bottom) return null;
    for (const col of columns) {
      if (col.status === "loading") continue;
      const body = bodyNodes.current.get(col.id);
      if (!body) continue;
      const r = body.getBoundingClientRect();
      if (px < r.left - 6 || px > r.right + 6) continue;
      const ids = (baseOrder[col.id] ?? []).filter((x) => x !== id);
      const view = sorting ? sortColumn(ids, null) : ids;
      let index = view.length;
      for (let i = 0; i < view.length; i += 1) {
        const node = cardNodes.current.get(view[i] ?? "");
        if (!node) continue;
        const b = node.getBoundingClientRect();
        if (py < b.top + b.height / 2) {
          index = i;
          break;
        }
      }
      return { columnId: col.id, index };
    }
    return null;
  };

  const hover = (px: number, py: number) => {
    const c = carry.current;
    if (!c) return;
    const over = hitTest(px, py, c.id);
    if (same(over, c.over) || (!over && !c.over)) return;
    c.over = over;
    setDrag((d) => (d && d.phase === "drag" ? { ...d, over } : d));
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
    let moved = false;
    if (dx !== 0) {
      const before = box.scrollLeft;
      box.scrollLeft = before + dx;
      moved = box.scrollLeft !== before;
    }
    const body = c.over ? bodyNodes.current.get(c.over.columnId) : null;
    if (body) {
      const b = body.getBoundingClientRect();
      const dy =
        c.py < b.top + EDGE
          ? -Math.ceil((b.top + EDGE - c.py) / 4)
          : c.py > b.bottom - EDGE
            ? Math.ceil((c.py - (b.bottom - EDGE)) / 4)
            : 0;
      if (dy !== 0) {
        const before = body.scrollTop;
        body.scrollTop = before + dy;
        moved = moved || body.scrollTop !== before;
      }
    }
    if (!moved) return;
    hover(c.px, c.py);
    scrollLoop.current = requestAnimationFrame(edgeScroll);
  };
  const stopScroll = () => {
    if (scrollLoop.current !== null) cancelAnimationFrame(scrollLoop.current);
    scrollLoop.current = null;
  };

  const gesture = useDrag({
    threshold: 4,
    disabled: disabled || !ready || editing !== null,
    onStart: ({ point }) => {
      const press = pressed.current;
      const node = press ? cardNodes.current.get(press.id) : undefined;
      const face = node?.parentElement;
      const root = rootRef.current;
      if (!press || !node || !face || !root) return;
      const from = placeOf(shownOrder, press.id);
      if (!from) return;
      if (lift) setLift(null);
      stopAll();
      const rb = root.getBoundingClientRect();
      const nb = face.getBoundingClientRect();
      carry.current = {
        id: press.id,
        origin: from,
        over: from,
        grabX: press.x - nb.left,
        grabY: press.y - nb.top,
        px: point.x,
        py: point.y,
      };
      ox.jump(r2(point.x - rb.left - (press.x - nb.left)));
      oy.jump(r2(point.y - rb.top - (press.y - nb.top)));
      liftScale.jump(1);
      if (motionSafe)
        anims.current.push(animate(liftScale, 1.03, springs.flick));
      setFocusId(press.id);
      setDrag({
        id: press.id,
        over: placeOf(baseOrder, press.id),
        width: r2(nb.width),
        height: r2(nb.height),
        phase: "drag",
      });
    },
    onMove: ({ point }) => {
      const c = carry.current;
      const root = rootRef.current;
      if (!c || !root) return;
      const rb = root.getBoundingClientRect();
      ox.set(r2(point.x - rb.left - c.grabX));
      oy.set(r2(point.y - rb.top - c.grabY));
      c.px = point.x;
      c.py = point.y;
      hover(point.x, point.y);
      if (scrollLoop.current === null) {
        scrollLoop.current = requestAnimationFrame(edgeScroll);
      }
    },
    onEnd: ({ velocity }) => {
      const c = carry.current;
      stopScroll();
      if (!c) return;
      if (c.over) commit(c.id, c.over, "drop");
      landing.current = { id: c.id, vx: velocity.x, vy: velocity.y };
      setDrag((d) => (d ? { ...d, phase: "land" } : d));
    },
    onCancel: () => {
      const c = carry.current;
      stopScroll();
      if (!c) return;
      landing.current = { id: c.id, vx: 0, vy: 0 };
      setDrag((d) => (d ? { ...d, phase: "land" } : d));
    },
    onTap: () => {
      const press = pressed.current;
      pressed.current = null;
      if (press) setFocusId(press.id);
    },
  });

  const phase = drag?.phase;
  React.useLayoutEffect(() => {
    const l = landing.current;
    if (phase !== "land" || !l) return;
    const finish = () => {
      landing.current = null;
      carry.current = null;
      pressed.current = null;
      setDrag(null);
      setFocusAsk((f) => ({ id: l.id, n: (f?.n ?? 0) + 1 }));
      // The card can be seen again: now polish it.
      const amount = queued.current.get(l.id);
      queued.current.delete(l.id);
      if (amount !== undefined) startPolish(l.id, amount);
    };
    const face = cardNodes.current.get(l.id)?.parentElement;
    const root = rootRef.current;
    if (!face || !root || !motionSafe) {
      finish();
      return;
    }
    const rb = root.getBoundingClientRect();
    const nb = face.getBoundingClientRect();
    stopAll();
    anims.current = [
      animate(ox, r2(nb.left - rb.left), { ...springs.snap, velocity: l.vx }),
      animate(oy, r2(nb.top - rb.top), {
        ...springs.snap,
        velocity: l.vy,
        onComplete: finish,
      }),
      animate(liftScale, 1, springs.snap),
    ];
    return () => {
      for (const c of anims.current) c.stop();
      anims.current = [];
      if (landing.current) finish();
    };
    // One landing per release.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  React.useEffect(
    () => () => {
      for (const c of anims.current) c.stop();
      if (scrollLoop.current !== null) cancelAnimationFrame(scrollLoop.current);
    },
    [],
  );

  /* ------------------------------ keyboard ------------------------------ */

  const lean = useMotionValue(0);
  const focusCard = (id: string) => {
    setFocusId(id);
    setFocusAsk((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };

  const onKey = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !ready || editing) return;
    const key = event.key;
    const view = shownOrder;
    const at = placeOf(view, id);
    if (!at) return;
    const colIndex = columns.findIndex((c) => c.id === at.columnId);
    const card = byId.get(id);
    const name = card?.key ?? card?.title ?? "Card";

    if (lift && lift.id === id) {
      if (key === " " || key === "Enter") {
        event.preventDefault();
        setLift(null);
        if (!commit(id, lift.at, "key")) say(`${name} put down.`);
        focusCard(id);
      } else if (key === "Escape") {
        event.preventDefault();
        setLift(null);
        say(`${name} put back.`);
        focusCard(id);
      } else if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        if (sorting) {
          say("Sorted by age while Stale first is on.");
          return;
        }
        const n = (view[at.columnId] ?? []).length;
        const index = clamp(at.index + (key === "ArrowUp" ? -1 : 1), 0, n - 1);
        if (index !== at.index) {
          setLift({ ...lift, at: { columnId: at.columnId, index } });
          say(`${index + 1} of ${n} in ${columnTitle(at.columnId)}.`);
          focusCard(id);
        }
      } else if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        const dir = key === "ArrowLeft" ? -1 : 1;
        let j = colIndex + dir;
        while (columns[j]?.status === "loading") j += dir;
        const target = columns[j];
        if (!target) return;
        const n = (baseOrder[target.id] ?? []).filter((x) => x !== id).length;
        const index = sorting ? n : Math.min(lift.at.index, n);
        setLift({ ...lift, at: { columnId: target.id, index } });
        say(`${target.title}, ${plural(n, "card", "cards")} there.`);
        focusCard(id);
      } else if (key === "Tab") {
        setLift(null);
      }
      return;
    }

    if (key === " ") {
      event.preventDefault();
      const from = placeOf(baseOrder, id);
      if (!from) return;
      setLift({ id, origin: from, at: from });
      say(
        `Picked up ${name}. Arrows move it, Space drops it, Escape puts it back.`,
      );
      return;
    }
    if (key === "Enter" || key === "F2") {
      event.preventDefault();
      setEditing(id);
      return;
    }
    if ((key === "n" || key === "N") && !event.ctrlKey && !event.metaKey) {
      if (card && daysStill(card, now) >= staleAfter && card.owner) {
        event.preventDefault();
        doNudge(id);
      }
      return;
    }
    const ids = view[at.columnId] ?? [];
    let next: string | undefined;
    if (key === "ArrowUp") next = ids[at.index - 1];
    else if (key === "ArrowDown") next = ids[at.index + 1];
    else if (key === "Home") next = ids[0];
    else if (key === "End") next = ids[ids.length - 1];
    else if (key === "ArrowLeft" || key === "ArrowRight") {
      const dir = key === "ArrowLeft" ? -1 : 1;
      for (let j = colIndex + dir; j >= 0 && j < columns.length; j += dir) {
        const other = view[columns[j]?.id ?? ""] ?? [];
        if (other.length > 0) {
          next = other[Math.min(at.index, other.length - 1)];
          break;
        }
      }
    } else return;
    event.preventDefault();
    if (next) focusCard(next);
  };

  const handlers = React.useRef({
    onKey,
    editDone: doEditDone,
    nudge: doNudge,
  });
  React.useEffect(() => {
    handlers.current = { onKey, editDone: doEditDone, nudge: doNudge };
  });
  const stableKey = React.useCallback(
    (id: string, event: React.KeyboardEvent<HTMLButtonElement>) =>
      handlers.current.onKey(id, event),
    [],
  );
  const stableNudge = React.useCallback(
    (id: string) => handlers.current.nudge(id),
    [],
  );
  const editDone = React.useCallback(
    (id: string, next: string | null) => handlers.current.editDone(id, next),
    [],
  );
  const startEdit = React.useCallback((id: string) => setEditing(id), []);
  const onPress = React.useCallback(
    (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
      pressed.current = { id, x: event.clientX, y: event.clientY };
    },
    [],
  );

  /* ------------------------------ scrolling ----------------------------- */

  const scrollX = useMotionValue(0);
  const maxX = useMotionValue(0);
  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const bindScroller = React.useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScroller(node);
  }, []);
  React.useEffect(() => {
    if (!scroller) return;
    const measure = () => {
      maxX.set(Math.max(0, scroller.scrollWidth - scroller.clientWidth));
      scrollX.set(scroller.scrollLeft);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, [scroller, maxX, scrollX]);
  const leftFade = useTransform(scrollX, (x) => r2(clamp(x / 24, 0, 1)));
  const rightFade = useTransform(
    [scrollX, maxX] as MotionValue<number>[],
    ([x = 0, m = 0]: number[]) => r2(clamp((m - x) / 24, 0, 1)),
  );

  /* ------------------------------- render ------------------------------- */

  const staleCount = list.filter((c) => daysStill(c, now) >= staleAfter).length;
  const tabbableId =
    focusId && byId.has(focusId) ? focusId : (list[0]?.id ?? null);
  const dragged = drag ? byId.get(drag.id) : undefined;

  const nameOf = (card: PatinaCard, view: Order) => {
    const at = placeOf(view, card.id);
    const days = daysStill(card, now);
    return [
      card.key,
      card.title,
      card.owner,
      days === 0 ? "moved today" : `waiting ${plural(days, "day", "days")}`,
      days >= staleAfter ? "stale" : null,
      at
        ? `${columnTitle(at.columnId)}, ${at.index + 1} of ${(view[at.columnId] ?? []).length}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const column = (col: PatinaColumn) => {
    const ids = shownOrder[col.id] ?? [];
    const loading = col.status === "loading" || status === "loading";
    const headId = `${uid}-col-${col.id}`;
    const count = (baseOrder[col.id] ?? []).length;
    const staleHere = (baseOrder[col.id] ?? []).filter(
      (id) => daysOf(id) >= staleAfter,
    ).length;
    const inviting =
      drag?.phase === "drag" && drag.over?.columnId === col.id && count === 0;
    const firstFresh = sorting
      ? ids.findIndex((id) => id !== drag?.id && daysOf(id) < staleAfter)
      : -1;
    return (
      <section
        key={col.id}
        role="group"
        aria-labelledby={headId}
        aria-busy={loading || undefined}
        className={cn(
          "flex h-full w-[min(15rem,82cqw)] shrink-0 snap-start flex-col overflow-hidden rounded-3 border border-hairline bg-surface-0",
          "@min-[40rem]:w-auto @min-[40rem]:min-w-[9.5rem] @min-[40rem]:flex-1",
        )}
      >
        <header className="flex items-center gap-2 px-3 pt-2.5 pb-2">
          <h3
            id={headId}
            className="min-w-0 truncate text-[13px] font-semibold"
            title={col.title}
          >
            {col.title}
          </h3>
          {staleHere > 0 && !loading ? (
            <span className="inline-flex h-4 shrink-0 items-center gap-1 rounded-full px-1.5 font-mono text-[10px] text-warn tabular-nums">
              <Hourglass aria-hidden className="size-2.5" />
              {staleHere}
              <span className="sr-only"> stale</span>
            </span>
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {loading ? "…" : count}
          </span>
        </header>
        <motion.div
          ref={(node: HTMLDivElement | null) => {
            if (node) bodyNodes.current.set(col.id, node);
            else bodyNodes.current.delete(col.id);
          }}
          layoutScroll
          data-pb-body=""
          className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-2"
        >
          {loading ? (
            <div className="flex flex-col gap-2 pt-1" aria-hidden>
              {[72, 72, 72].map((h, i) => (
                <span
                  key={i}
                  className="block rounded-3 border border-dashed border-hairline-strong motion-safe:animate-pulse"
                  style={{ height: h }}
                />
              ))}
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-2 pt-1">
              {ids.map((id, i) => {
                const card = byId.get(id);
                if (!card) return null;
                const days = daysStill(card, now);
                const mode: CardMode =
                  drag?.id === id
                    ? drag.phase === "drag"
                      ? "placeholder"
                      : "landing"
                    : lift?.id === id
                      ? "lifted"
                      : "rest";
                return (
                  <React.Fragment key={id}>
                    {i === firstFresh && i > 0 ? (
                      <li
                        aria-hidden
                        className="flex items-center gap-2 px-1 pt-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                      >
                        <span className="h-px flex-1 bg-hairline-strong" />
                        Fresher
                        <span className="h-px flex-1 bg-hairline-strong" />
                      </li>
                    ) : null}
                    <CardItem
                      card={card}
                      uid={uid}
                      filterId={filterId}
                      mode={mode}
                      name={nameOf(card, shownOrder)}
                      hintId={hintId}
                      tabbable={tabbableId === id}
                      cardStyle={cardStyle}
                      tone={tone}
                      amount={r2(Math.min(1, days * rate))}
                      days={days}
                      stale={days >= staleAfter}
                      nudged={nudged.has(id)}
                      hop={hops[id] ?? 0}
                      polish={polish[id] ?? null}
                      editing={editing === id}
                      accent={accent}
                      placeholderHeight={drag?.id === id ? drag.height : 0}
                      lean={lean}
                      motionSafe={motionSafe}
                      disabled={disabled}
                      register={register}
                      onKey={stableKey}
                      onFocusCard={setFocusId}
                      onPress={onPress}
                      onNudge={stableNudge}
                      onStartEdit={startEdit}
                      onEditDone={editDone}
                      onPolished={polished}
                    />
                  </React.Fragment>
                );
              })}
              {ids.length === 0 ? (
                <li
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-3 border border-dashed px-3 py-6 text-center transition-colors duration-200",
                    inviting ? "" : "border-hairline-strong",
                  )}
                  style={
                    inviting
                      ? {
                          borderColor: accent,
                          backgroundColor: `color-mix(in oklab, ${accent} 8%, transparent)`,
                        }
                      : undefined
                  }
                >
                  <CircleCheck aria-hidden className="size-4 text-success" />
                  <span className="text-[12px] font-medium text-ink-2">
                    All clear
                  </span>
                  <span className="text-[11px] text-ink-3">
                    Nothing waiting here.
                  </span>
                </li>
              ) : null}
            </ul>
          )}
        </motion.div>
      </section>
    );
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onPointerDown={(event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-pb-card]")) gesture.onPointerDown(event);
      }}
      onPointerMove={gesture.onPointerMove}
      onPointerUp={gesture.onPointerUp}
      onPointerCancel={gesture.onPointerCancel}
      onLostPointerCapture={gesture.onLostPointerCapture}
      className={cn(
        "@container relative flex w-full flex-col overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        drag?.phase === "drag" && "cursor-grabbing",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <PatinaFilters id={filterId} />
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 flex-1 basis-40 flex-col">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="text-[11px] text-ink-3 tabular-nums">
            {ready ? (
              <>
                {plural(list.length, "request", "requests")} ·{" "}
                <span className={staleCount > 0 ? "text-warn" : undefined}>
                  {staleCount} stale
                </span>
              </>
            ) : status === "loading" ? (
              "Loading the board"
            ) : (
              "Not loaded"
            )}
          </p>
        </div>
        <button
          type="button"
          aria-pressed={sorting}
          disabled={disabled || !ready}
          onClick={toggleStale}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border px-3 text-xs font-medium transition-colors disabled:opacity-50",
            sorting
              ? "border-warn/40 bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-warn"
              : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS,
          )}
        >
          <Hourglass aria-hidden className="size-3.5" />
          Stale first
          <span className="font-mono text-[10px] tabular-nums opacity-80">
            {staleCount}
          </span>
        </button>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between cards. Space picks a card up; arrows carry it,
        Space drops it, Escape puts it back. Enter renames a card; N nudges the
        owner of a stale one.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The board did not load.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-xs text-foreground transition-colors hover:bg-surface-2",
                FOCUS,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="relative flex-1 overflow-hidden">
          <motion.div
            ref={bindScroller}
            layoutScroll
            onScroll={(event) => {
              const el = event.currentTarget;
              scrollX.set(el.scrollLeft);
              maxX.set(Math.max(0, el.scrollWidth - el.clientWidth));
            }}
            className="relative flex h-full snap-x snap-mandatory scroll-px-3 [scrollbar-width:thin] gap-2.5 overflow-x-auto overscroll-x-contain p-3 @min-[40rem]:snap-none"
          >
            <LayoutGroup id={uid}>{columns.map(column)}</LayoutGroup>
          </motion.div>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-linear-to-r from-card to-transparent"
            style={{ opacity: leftFade }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent"
            style={{ opacity: rightFade }}
          />
        </div>
      )}

      {drag && dragged ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-30 overflow-hidden rounded-3",
            CARD_STYLE[cardStyle],
            cardStyle === "outline" && "bg-surface-0",
          )}
          style={{
            x: ox,
            y: oy,
            scale: liftScale,
            width: drag.width,
            boxShadow: `0 0 0 2px ${accent}, 0 14px 32px color-mix(in oklab, black 26%, transparent)`,
          }}
        >
          <PatinaLayer
            amount={r2(Math.min(1, daysStill(dragged, now) * rate))}
            filterId={filterId}
            variant={hashOf(dragged.id) % 4}
            tone={tone}
          />
          <CardFace
            card={dragged}
            days={daysStill(dragged, now)}
            stale={daysStill(dragged, now) >= staleAfter}
            nudged={nudged.has(dragged.id)}
            hop={0}
            tabbable={false}
            editing={false}
            disabled
            motionSafe={motionSafe}
          />
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
