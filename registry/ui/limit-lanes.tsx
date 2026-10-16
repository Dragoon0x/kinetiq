"use client";

import * as React from "react";

import {
  animate,
  LayoutGroup,
  motion,
  useAnimate,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { Bug, RotateCcw, Sparkles, TriangleAlert, Wrench } from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type LimitKind = "feature" | "bug" | "chore";

export type LimitCard = {
  id: string;
  /** The column the card sits in. Order within a column is the array's order. */
  columnId: string;
  /** The ticket key, set in mono: "FW-214". */
  key: string;
  title: string;
  /** @default "feature" */
  kind?: LimitKind;
  /** Who is on it, as a full name. */
  owner?: string;
  points?: number;
};

export type LimitColumn = {
  id: string;
  title: string;
  /** Work-in-progress limit. Omit (or null) for a column that takes anything. */
  limit?: number | null;
  /** A column still fetching its cards draws outlines and takes no drops. @default "ready" */
  status?: "ready" | "loading";
};

export type LimitGaugeStyle = "segments" | "bar" | "ring";
export type LimitCardStyle = "plain" | "edge" | "raised";
export type LimitStatus = "ready" | "loading" | "error";

export type LimitPlace = { columnId: string; index: number };

export type LimitMove = {
  cardId: string;
  from: LimitPlace;
  to: LimitPlace;
  /** Every card, in the order after the move. */
  cards: LimitCard[];
};

export type LimitBlocked = {
  cardId: string;
  /** The full column that refused the card. */
  columnId: string;
  limit: number;
  /** Cards already in it. */
  count: number;
};

export type LimitLanesProps = {
  /** The columns, in order, each with its work-in-progress limit. @default defaultLimitColumns */
  columns?: LimitColumn[];
  /** Controlled cards. Moves are reported through `onCardsChange` and `onMove`. */
  cards?: LimitCard[];
  /** Initial cards when uncontrolled. @default defaultLimitCards */
  defaultCards?: LimitCard[];
  /** Fires with every card after a move. */
  onCardsChange?: (cards: LimitCard[]) => void;
  /** Fires from the drop or key that moved a card, with where it came from and went. */
  onMove?: (move: LimitMove) => void;
  /** Fires from the gauge drag or key that changed a column's limit. */
  onLimitChange?: (columnId: string, limit: number) => void;
  /** A card was dropped (or keyed) into a full column and sent back. */
  onBlockedDrop?: (blocked: LimitBlocked) => void;
  /** A card was tapped, or Enter was pressed on it. */
  onOpen?: (cardId: string) => void;
  /** How each header draws its limit: one pill per slot, a continuous bar, or a ring of arcs. @default "segments" */
  gaugeStyle?: LimitGaugeStyle;
  /** Cards drawn plain with a hairline, with a coloured edge by kind, or raised on a shadow. @default "edge" */
  cardStyle?: LimitCardStyle;
  /** Gauge fill, the lifted card's ring, the placeholder and open drop slots; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** A full column refuses cards. Off, it takes them and shows the overrun in danger. @default true */
  enforce?: boolean;
  /** The highest a gauge can be set. @default 8 */
  maxLimit?: number;
  /** Whether the board's cards have arrived. @default "ready" */
  status?: LimitStatus;
  /** "Try again" was pressed after the board failed to load. */
  onRetry?: () => void;
  /** The heading. @default "Fernworks delivery" */
  title?: string;
  /** The board's height, px; columns scroll inside it. @default 460 */
  height?: number;
  /** The board's accessible name. @default the title */
  label?: string;
  /** Freezes the board: no drags, keys or limit changes. @default false */
  disabled?: boolean;
  /** Classes for the outer panel. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultLimitColumns: LimitColumn[] = [
  { id: "ready", title: "Ready", limit: null },
  { id: "building", title: "Building", limit: 3 },
  { id: "review", title: "Review", limit: 2 },
  { id: "shipping", title: "Shipping", limit: 2 },
];

/** Fernworks' delivery sprint: Building and Review already at their limits. */
export const defaultLimitCards: LimitCard[] = [
  {
    id: "fw-221",
    columnId: "ready",
    key: "FW-221",
    title: "Export invoices as CSV",
    kind: "feature",
    owner: "Mara Lind",
    points: 3,
  },
  {
    id: "fw-224",
    columnId: "ready",
    key: "FW-224",
    title: "Retry webhooks after a 502",
    kind: "bug",
    owner: "Joel Ade",
    points: 2,
  },
  {
    id: "fw-229",
    columnId: "ready",
    key: "FW-229",
    title: "Dark receipts for the kiosk",
    kind: "feature",
    owner: "Kenji Ota",
    points: 5,
  },
  {
    id: "fw-231",
    columnId: "ready",
    key: "FW-231",
    title: "Slow search past 10k customers",
    kind: "bug",
    owner: "Priya Das",
    points: 3,
  },
  {
    id: "fw-233",
    columnId: "ready",
    key: "FW-233",
    title: "Remove retired feature flags",
    kind: "chore",
    owner: "Sade Bello",
    points: 1,
  },
  {
    id: "fw-212",
    columnId: "building",
    key: "FW-212",
    title: "Offline invoice drafts",
    kind: "feature",
    owner: "Mara Lind",
    points: 5,
  },
  {
    id: "fw-215",
    columnId: "building",
    key: "FW-215",
    title: "Rounding on split tax lines",
    kind: "bug",
    owner: "Sade Bello",
    points: 2,
  },
  {
    id: "fw-218",
    columnId: "building",
    key: "FW-218",
    title: "Bulk archive customers",
    kind: "feature",
    owner: "Tomas Ferrer",
    points: 3,
  },
  {
    id: "fw-207",
    columnId: "review",
    key: "FW-207",
    title: "Filters for the audit log",
    kind: "feature",
    owner: "Ines Park",
    points: 3,
  },
  {
    id: "fw-209",
    columnId: "review",
    key: "FW-209",
    title: "Upgrade the PDF renderer",
    kind: "chore",
    owner: "Joel Ade",
    points: 2,
  },
  {
    id: "fw-203",
    columnId: "shipping",
    key: "FW-203",
    title: "Team invites by link",
    kind: "feature",
    owner: "Priya Das",
    points: 3,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const KIND: Record<
  LimitKind,
  { label: string; text: string; pigment: string; Icon: typeof Bug }
> = {
  feature: {
    label: "Feature",
    text: "text-cobalt-bright",
    pigment: "oklch(from var(--accent-bright) 0.64 0.15 h)",
    Icon: Sparkles,
  },
  bug: {
    label: "Bug",
    text: "text-danger",
    pigment: "oklch(from var(--danger) 0.64 0.17 h)",
    Icon: Bug,
  },
  chore: {
    label: "Chore",
    text: "text-ink-2",
    pigment: "oklch(from var(--ink-3) 0.62 0.02 h)",
    Icon: Wrench,
  },
};

/** Warn and danger as pigment: a filled pill reads the same in both themes. */
const FULL = "oklch(from var(--warn) 0.78 0.13 h)";
const OVER = "oklch(from var(--danger) 0.64 0.19 h)";

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";

/** Pixels of travel per step when a gauge is scrubbed: one segment's pitch. */
const SCRUB = 14;
/** How close to a scroller's edge a carried card starts it scrolling. */
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
const same = (a: LimitPlace | null, b: LimitPlace | null) =>
  !!a && !!b && a.columnId === b.columnId && a.index === b.index;

/** Layout position inside a positioned `container`, from offsets: transforms and scroll ignored. */
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

type Order = Record<string, string[]>;

function orderOf(columns: LimitColumn[], cards: LimitCard[]): Order {
  const out: Order = {};
  for (const c of columns) out[c.id] = [];
  for (const card of cards) out[card.columnId]?.push(card.id);
  return out;
}

/** The order with one card taken out and put back at a place. */
function placed(order: Order, id: string, at: LimitPlace | null): Order {
  if (!at) return order;
  const out: Order = {};
  for (const [col, ids] of Object.entries(order)) {
    out[col] = ids.filter((x) => x !== id);
  }
  const list = out[at.columnId];
  if (list) list.splice(clamp(at.index, 0, list.length), 0, id);
  return out;
}

function placeOf(order: Order, id: string): LimitPlace | null {
  for (const [columnId, ids] of Object.entries(order)) {
    const index = ids.indexOf(id);
    if (index !== -1) return { columnId, index };
  }
  return null;
}

/** Cards in the order the board shows them: column by column. */
function cardsFrom(order: Order, columns: LimitColumn[], cards: LimitCard[]) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: LimitCard[] = [];
  for (const col of columns) {
    for (const id of order[col.id] ?? []) {
      const card = byId.get(id);
      if (card)
        out.push(
          card.columnId === col.id ? card : { ...card, columnId: col.id },
        );
    }
  }
  return out;
}

/* ----------------------------------------------------------------------- */
/*                                   Gauge                                  */
/* ----------------------------------------------------------------------- */

function Gauge({
  gaugeStyle,
  title,
  limit,
  count,
  maxLimit,
  accent,
  pulse,
  refusing,
  disabled,
  motionSafe,
  onChange,
}: {
  gaugeStyle: LimitGaugeStyle;
  title: string;
  limit: number;
  count: number;
  maxLimit: number;
  accent: string;
  pulse: number;
  refusing: boolean;
  disabled: boolean;
  motionSafe: boolean;
  onChange: (limit: number) => void;
}) {
  const [scope, run] = useAnimate<HTMLDivElement>();
  const [flash, setFlash] = React.useState(false);
  const full = count >= limit;
  const over = count > limit;
  const room = Math.max(0, limit - count);

  // A refusal pulses the gauge once: three keyframes, so a tween, and a
  // danger flash that fades on its own.
  React.useEffect(() => {
    if (pulse === 0) return;
    const node = scope.current;
    const controls: AnimationPlaybackControls[] = [];
    if (node && motionSafe) {
      controls.push(
        run(
          node,
          { scale: [1, 1.14, 1] },
          { duration: 0.36, ease: easings.move },
        ),
      );
    }
    const on = window.setTimeout(() => setFlash(true), 0);
    const off = window.setTimeout(() => setFlash(false), 620);
    return () => {
      window.clearTimeout(on);
      window.clearTimeout(off);
      for (const c of controls) c.complete();
    };
  }, [pulse, motionSafe, run, scope]);

  const scrub = React.useRef(limit);
  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      scrub.current = limit;
    },
    onMove: ({ offset }) => {
      // Scrubbed a segment's pitch per step, so the row's end stays under
      // the finger; past the ends the travel gives less and less.
      const raw = scrub.current + offset.x / SCRUB;
      const soft =
        raw < 1
          ? 1 + rubberband(raw - 1, 3)
          : raw > maxLimit
            ? maxLimit + rubberband(raw - maxLimit, 3)
            : raw;
      const next = clamp(Math.round(soft), 1, maxLimit);
      if (next !== limit) onChange(next);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next = limit;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next += 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next -= 1;
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = maxLimit;
    else if (event.key === "PageUp") next += 2;
    else if (event.key === "PageDown") next -= 2;
    else return;
    event.preventDefault();
    next = clamp(next, 1, maxLimit);
    if (next !== limit) onChange(next);
  };

  const tone = over || flash ? OVER : full ? FULL : accent;
  const spring = motionSafe ? springs.snap : { duration: 0 };
  const slots = Math.max(limit, count);

  let drawing: React.ReactNode;
  if (gaugeStyle === "bar") {
    const fraction = clamp(count / limit, 0, 1);
    drawing = (
      <span className="relative block h-1.5 w-full overflow-clip rounded-full bg-hairline-strong">
        <motion.span
          className="absolute inset-y-0 left-0 block rounded-full"
          initial={false}
          animate={{ width: `${r2(fraction * 100)}%` }}
          transition={motionSafe ? springs.glide : { duration: 0 }}
          style={{ backgroundColor: tone }}
        />
        {Array.from({ length: limit - 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute inset-y-0 w-px bg-card"
            style={{ left: `${r2(((i + 1) / limit) * 100)}%` }}
          />
        ))}
      </span>
    );
  } else if (gaugeStyle === "ring") {
    const size = 22;
    const c = size / 2;
    const rad = 8.5;
    const gap = slots > 1 ? Math.min(0.6, 2.4 / slots) : 0;
    const arc = (i: number) => {
      const a0 = (i / slots) * Math.PI * 2 - Math.PI / 2 + gap / 2;
      const a1 = ((i + 1) / slots) * Math.PI * 2 - Math.PI / 2 - gap / 2;
      const p = (a: number) =>
        `${r2(c + rad * Math.cos(a))} ${r2(c + rad * Math.sin(a))}`;
      if (slots === 1) {
        return `M ${c} ${r2(c - rad)} A ${rad} ${rad} 0 1 1 ${r2(c - 0.01)} ${r2(c - rad)}`;
      }
      return `M ${p(a0)} A ${rad} ${rad} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`;
    };
    drawing = (
      <span className="flex items-center gap-2">
        <svg
          aria-hidden
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block shrink-0"
        >
          {Array.from({ length: slots }, (_, i) => {
            const filled = i < count;
            const extra = i >= limit;
            return (
              <path
                key={`${slots}-${i}`}
                d={arc(i)}
                fill="none"
                strokeWidth={2.75}
                strokeLinecap={slots === 1 ? "round" : "butt"}
                className="transition-[stroke] duration-200"
                style={{
                  stroke: extra
                    ? OVER
                    : filled
                      ? tone
                      : "var(--hairline-strong)",
                }}
              />
            );
          })}
        </svg>
      </span>
    );
  } else {
    drawing = (
      <span className="flex items-center gap-1">
        {Array.from({ length: slots }, (_, i) => {
          const filled = i < count;
          const extra = i >= limit;
          return (
            <motion.span
              key={i}
              aria-hidden
              className="block h-1.5 w-2.5 rounded-full"
              initial={false}
              animate={{ scaleY: filled ? 1 : 0.67 }}
              transition={spring}
              style={{
                backgroundColor: extra
                  ? OVER
                  : filled
                    ? tone
                    : "var(--hairline-strong)",
                transition: "background-color 200ms linear",
              }}
            />
          );
        })}
        {refusing ? (
          <motion.span
            aria-hidden
            className="block h-1.5 w-2.5 rounded-full border border-dashed border-danger"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: durations.fast }}
          />
        ) : null}
      </span>
    );
  }

  return (
    <div
      ref={scope}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${title} limit`}
      aria-valuemin={1}
      aria-valuemax={maxLimit}
      aria-valuenow={limit}
      aria-valuetext={`Limit ${limit}, ${plural(count, "card", "cards")}, ${
        over ? `${count - limit} over` : full ? "full" : `room for ${room}`
      }`}
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      {...drag}
      className={cn(
        "-mx-1 flex min-w-0 touch-pan-y items-center rounded-2 px-1 py-1.5 select-none",
        gaugeStyle === "bar" ? "flex-1" : "",
        disabled ? "cursor-default" : "cursor-ew-resize",
        FOCUS,
      )}
    >
      {drawing}
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                    Card                                  */
/* ----------------------------------------------------------------------- */

const CARD_STYLE: Record<LimitCardStyle, string> = {
  plain: "rounded-3 border border-hairline bg-card",
  edge: "rounded-3 border border-l-[3px] border-hairline bg-card",
  raised:
    "rounded-3 bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent),0_4px_12px_color-mix(in_oklab,black_7%,transparent)]",
};

function CardFace({
  card,
  cardStyle,
}: {
  card: LimitCard;
  cardStyle: LimitCardStyle;
}) {
  const kind = KIND[card.kind ?? "feature"];
  return (
    <span className="flex min-w-0 flex-col gap-1.5 px-2.5 py-2 text-left">
      <span className="flex min-w-0 items-center gap-1.5">
        {cardStyle === "raised" ? (
          <span
            aria-hidden
            className="size-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: kind.pigment }}
          />
        ) : null}
        <span className="font-mono text-[10.5px] whitespace-nowrap text-ink-3 tabular-nums">
          {card.key}
        </span>
        <span
          className={cn(
            "ml-auto inline-flex h-4 shrink-0 items-center gap-1 rounded-full px-1.5 text-[10px] leading-none font-medium",
            kind.text,
          )}
          style={{
            backgroundColor: `color-mix(in oklab, ${kind.pigment} 14%, transparent)`,
          }}
        >
          <kind.Icon aria-hidden className="size-2.5" />
          {kind.label}
        </span>
      </span>
      <span className="line-clamp-2 text-[13px] leading-snug font-medium text-foreground">
        {card.title}
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
        {card.owner ? (
          <>
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold text-ink-2"
            >
              {initials(card.owner)}
            </span>
            <span className="truncate">{card.owner.split(" ")[0]}</span>
          </>
        ) : null}
        {card.points !== undefined ? (
          <span className="ml-auto shrink-0 font-mono tabular-nums">
            {card.points} pt
          </span>
        ) : null}
      </span>
    </span>
  );
}

type CardMode = "rest" | "lifted" | "placeholder" | "landing";

const CardItem = React.memo(function CardItem({
  card,
  uid,
  mode,
  name,
  hintId,
  tabbable,
  cardStyle,
  accent,
  placeholderHeight,
  lean,
  motionSafe,
  disabled,
  register,
  onKey,
  onFocusCard,
  onPress,
}: {
  card: LimitCard;
  uid: string;
  mode: CardMode;
  name: string;
  hintId: string;
  tabbable: boolean;
  cardStyle: LimitCardStyle;
  accent: string;
  placeholderHeight: number;
  lean: MotionValue<number>;
  motionSafe: boolean;
  disabled: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onKey: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusCard: (id: string) => void;
  onPress: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const still = useMotionValue(0);
  const kind = KIND[card.kind ?? "feature"];
  const lifted = mode === "lifted";
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
      <motion.button
        ref={(node) => register(card.id, node)}
        type="button"
        data-ll-card={card.id}
        aria-roledescription="card"
        aria-label={name}
        aria-describedby={hintId}
        aria-pressed={lifted}
        aria-disabled={disabled || undefined}
        tabIndex={tabbable ? 0 : -1}
        onKeyDown={(event) => onKey(card.id, event)}
        onFocus={() => onFocusCard(card.id)}
        onPointerDown={(event) => onPress(card.id, event)}
        className={cn(
          CARD_STYLE[cardStyle],
          "block w-full touch-pan-y transition-[border-color,box-shadow,opacity] duration-150 select-none",
          FOCUS,
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab hover:border-hairline-strong",
          mode === "placeholder" &&
            "pointer-events-none absolute inset-0 opacity-0",
          mode === "landing" && "opacity-0",
        )}
        style={{
          x: lifted ? lean : still,
          borderLeftColor: cardStyle === "edge" ? kind.pigment : undefined,
          boxShadow: lifted
            ? `0 0 0 2px ${accent}, 0 10px 24px color-mix(in oklab, black 22%, transparent)`
            : undefined,
        }}
        animate={{ scale: lifted && motionSafe ? 1.02 : 1 }}
        transition={motionSafe ? springs.flick : { duration: 0 }}
      >
        <CardFace card={card} cardStyle={cardStyle} />
      </motion.button>
    </motion.li>
  );
});

/* ----------------------------------------------------------------------- */
/*                                   Board                                  */
/* ----------------------------------------------------------------------- */

type Carry = {
  id: string;
  origin: LimitPlace;
  over: LimitPlace | null;
  refused: string | null;
  grabX: number;
  grabY: number;
  px: number;
  py: number;
};

type DragView = {
  id: string;
  over: LimitPlace | null;
  refused: string | null;
  width: number;
  height: number;
  phase: "drag" | "land";
};

type Lift = { id: string; origin: LimitPlace; at: LimitPlace };

/**
 * A kanban board whose columns say no when they are full. Every header
 * carries a gauge of its work-in-progress limit — one pill per slot, a bar or
 * a ring — that fills as cards arrive (each pill popping in on snap) and turns
 * warn at the limit; the gauge is itself a slider, scrubbed a pill's pitch per
 * step or keyed, so a team can change its limit where it reads it.
 *
 * A dragged card lifts on flick into a carried copy that follows the finger
 * 1:1, tracked relative to the board so an auto-scrolling board never pulls
 * it away, while a dashed placeholder opens where it would land and the cards
 * round it glide aside. Over a full column the column takes a danger wash, its
 * gauge offers a dashed refused slot, and the placeholder stays home; let go
 * there and the card springs back to where it came from on snap, carrying the
 * throw's velocity so a hard throw overshoots home once, while the full
 * column's gauge pulses once.
 *
 * Keys reach every end state: arrows walk the cards, Space lifts one, arrows
 * carry it through the layout (a full column makes it lean toward it and
 * spring back), Space or Enter drops it, Escape puts it back. Under reduced
 * motion nothing travels or bounces: cards appear in place, refusals flash,
 * and every count, limit and refusal still shows.
 */
export function LimitLanes({
  columns = defaultLimitColumns,
  cards,
  defaultCards,
  onCardsChange,
  onMove,
  onLimitChange,
  onBlockedDrop,
  onOpen,
  gaugeStyle = "segments",
  cardStyle = "edge",
  accent = "var(--accent-bright)",
  enforce = true,
  maxLimit = 8,
  status = "ready",
  onRetry,
  title = "Fernworks delivery",
  height = 460,
  label,
  disabled = false,
  className,
}: LimitLanesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const top = Math.max(1, Math.round(maxLimit));

  /* -------------------------------- data -------------------------------- */

  const [own, setOwn] = React.useState<LimitCard[]>(
    () => defaultCards ?? defaultLimitCards,
  );
  const list = cards ?? own;
  const order = React.useMemo(() => orderOf(columns, list), [columns, list]);
  const byId = React.useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);

  // Limits are seeded by the columns and owned here after that; a host that
  // sends new columns re-seeds them.
  const columnsSig = columns.map((c) => `${c.id}:${c.limit ?? "-"}`).join("|");
  const [limits, setLimits] = React.useState(() => ({
    sig: columnsSig,
    map: Object.fromEntries(
      columns.map((c) => [c.id, c.limit ?? null]),
    ) as Record<string, number | null>,
  }));
  if (limits.sig !== columnsSig) {
    setLimits({
      sig: columnsSig,
      map: Object.fromEntries(columns.map((c) => [c.id, c.limit ?? null])),
    });
  }
  const limitOf = (columnId: string) => limits.map[columnId] ?? null;

  /* ------------------------------- states ------------------------------- */

  const [drag, setDrag] = React.useState<DragView | null>(null);
  const [lift, setLift] = React.useState<Lift | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const shownOrder = React.useMemo(() => {
    if (drag && drag.phase === "drag" && !drag.refused && drag.over) {
      return placed(order, drag.id, drag.over);
    }
    if (lift) return placed(order, lift.id, lift.at);
    return order;
  }, [order, drag, lift]);

  const columnTitle = (id: string) =>
    columns.find((c) => c.id === id)?.title ?? id;
  const countIn = (columnId: string, without?: string) =>
    (order[columnId] ?? []).filter((id) => id !== without).length;
  const isFull = (columnId: string, without: string, origin: string) => {
    const lim = limitOf(columnId);
    return (
      enforce &&
      lim !== null &&
      columnId !== origin &&
      countIn(columnId, without) >= lim
    );
  };

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

  // Focus follows the keyboard onto a card that may have just moved column.
  // It is scrolled into view by its layout box — the card may still be
  // mid-glide — and only inside the board, never the page.
  const motionSafeRef = React.useRef(motionSafe);
  React.useEffect(() => {
    motionSafeRef.current = motionSafe;
  });
  React.useEffect(() => {
    if (!focusAsk) return;
    const node = cardNodes.current.get(focusAsk.id);
    const scroller = scrollRef.current;
    if (!node) return;
    const li = node.closest("li");
    const body = node.closest<HTMLElement>("[data-ll-body]");
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

  /* ------------------------------- moves -------------------------------- */

  const commit = (id: string, to: LimitPlace, how: "drop" | "key") => {
    const from = placeOf(order, id);
    if (!from || same(from, to)) return false;
    const nextOrder = placed(order, id, to);
    const next = cardsFrom(nextOrder, columns, list);
    if (cards === undefined) setOwn(next);
    onCardsChange?.(next);
    onMove?.({ cardId: id, from, to, cards: next });
    const card = byId.get(id);
    const col = nextOrder[to.columnId] ?? [];
    say(
      `${how === "drop" ? "Dropped" : "Moved"} ${card?.key ?? "card"} in ${columnTitle(
        to.columnId,
      )}, ${to.index + 1} of ${col.length}.`,
    );
    return true;
  };

  const refuse = (id: string, columnId: string) => {
    const lim = limitOf(columnId) ?? 0;
    const count = countIn(columnId, id);
    setPulses((p) => ({ ...p, [columnId]: (p[columnId] ?? 0) + 1 }));
    const card = byId.get(id);
    const home = placeOf(order, id);
    say(
      `${columnTitle(columnId)} is full (${count} of ${lim}). ${
        card?.key ?? "The card"
      } went back to ${home ? columnTitle(home.columnId) : "its column"}.`,
    );
    onBlockedDrop?.({ cardId: id, columnId, limit: lim, count });
  };

  const setLimit = (columnId: string, next: number) => {
    if (disabled) return;
    setLimits((l) => ({ ...l, map: { ...l.map, [columnId]: next } }));
    const count = countIn(columnId);
    say(
      `${columnTitle(columnId)} limit ${next}${
        count >= next
          ? count > next
            ? `, ${count - next} over`
            : ", full"
          : ""
      }.`,
    );
    onLimitChange?.(columnId, next);
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

  const onPress = React.useCallback(
    (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
      pressed.current = { id, x: event.clientX, y: event.clientY };
    },
    [],
  );

  /** Which column, and which seat in it, a point is over. */
  const hitTest = (px: number, py: number, id: string) => {
    const root = rootRef.current?.getBoundingClientRect();
    if (!root || py < root.top || py > root.bottom) return null;
    for (const col of columns) {
      if (col.status === "loading") continue;
      const body = bodyNodes.current.get(col.id);
      if (!body) continue;
      const r = body.getBoundingClientRect();
      if (px < r.left - 6 || px > r.right + 6) continue;
      const ids = (order[col.id] ?? []).filter((x) => x !== id);
      let index = ids.length;
      for (let i = 0; i < ids.length; i += 1) {
        const node = cardNodes.current.get(ids[i] ?? "");
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
    const place = hitTest(px, py, c.id);
    const refused =
      place && isFull(place.columnId, c.id, c.origin.columnId)
        ? place.columnId
        : null;
    const over = refused ? null : (place ?? null);
    if (same(over, c.over) && refused === c.refused) return;
    c.over = over;
    c.refused = refused;
    setDrag((d) => (d && d.phase === "drag" ? { ...d, over, refused } : d));
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
    const col = c.over?.columnId ?? null;
    const body = col ? bodyNodes.current.get(col) : null;
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
    disabled: disabled || !ready,
    onStart: ({ point }) => {
      const press = pressed.current;
      const node = press ? cardNodes.current.get(press.id) : undefined;
      const root = rootRef.current;
      if (!press || !node || !root) return;
      const origin = placeOf(order, press.id);
      if (!origin) return;
      if (lift) setLift(null);
      stopAll();
      const rb = root.getBoundingClientRect();
      const nb = node.getBoundingClientRect();
      carry.current = {
        id: press.id,
        origin,
        over: origin,
        refused: null,
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
        over: origin,
        refused: null,
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
      if (c.refused) refuse(c.id, c.refused);
      else if (c.over) commit(c.id, c.over, "drop");
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
      if (!press || disabled) return;
      setFocusId(press.id);
      onOpen?.(press.id);
    },
  });

  // The carried copy flies to where the card now lives — its new seat, or
  // home after a refusal — with the release velocity, then hands over.
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
    };
    const node = cardNodes.current.get(l.id);
    const root = rootRef.current;
    if (!node || !root || !motionSafe) {
      finish();
      return;
    }
    const rb = root.getBoundingClientRect();
    const nb = node.getBoundingClientRect();
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
      // A re-run (StrictMode) lands it at once instead of freezing it.
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
  const leanAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const leanToward = (dir: number) => {
    leanAnim.current?.stop();
    if (!motionSafe) return;
    leanAnim.current = animate(lean, dir * 12, {
      duration: 0.1,
      ease: easings.exit,
      onComplete: () => {
        leanAnim.current = animate(lean, 0, springs.snap);
      },
    });
  };

  const focusCard = (id: string) => {
    setFocusId(id);
    setFocusAsk((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  };

  const onKey = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !ready) return;
    const key = event.key;
    const view = shownOrder;
    const at = placeOf(view, id);
    if (!at) return;
    const colIndex = columns.findIndex((c) => c.id === at.columnId);

    if (lift && lift.id === id) {
      if (key === " " || key === "Enter") {
        event.preventDefault();
        setLift(null);
        if (!commit(id, lift.at, "key"))
          say(`${byId.get(id)?.key ?? "Card"} put down.`);
        focusCard(id);
        return;
      }
      if (key === "Escape") {
        event.preventDefault();
        setLift(null);
        say(`${byId.get(id)?.key ?? "Card"} put back.`);
        focusCard(id);
        return;
      }
      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        const n = (view[at.columnId] ?? []).length;
        const index = clamp(at.index + (key === "ArrowUp" ? -1 : 1), 0, n - 1);
        if (index !== at.index) {
          setLift({ ...lift, at: { columnId: at.columnId, index } });
          say(`${index + 1} of ${n} in ${columnTitle(at.columnId)}.`);
          focusCard(id);
        }
        return;
      }
      if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        const dir = key === "ArrowLeft" ? -1 : 1;
        // Full columns say no on the way past — each gauge pulses — and the
        // card goes on to the next column with room. With none left that
        // way, the first full one refuses it outright.
        const passed: LimitColumn[] = [];
        let target: LimitColumn | undefined;
        for (let j = colIndex + dir; j >= 0 && j < columns.length; j += dir) {
          const col = columns[j];
          if (!col || col.status === "loading") continue;
          if (isFull(col.id, id, lift.origin.columnId)) {
            passed.push(col);
            continue;
          }
          target = col;
          break;
        }
        const first = passed[0];
        if (!target) {
          if (first) {
            leanToward(dir);
            refuse(id, first.id);
          }
          return;
        }
        if (passed.length > 0) {
          setPulses((p) => {
            const next = { ...p };
            for (const c of passed) next[c.id] = (next[c.id] ?? 0) + 1;
            return next;
          });
        }
        const n = (order[target.id] ?? []).filter((x) => x !== id).length;
        const index = Math.min(at.index, n);
        setLift({ ...lift, at: { columnId: target.id, index } });
        say(
          `${
            passed.length > 0
              ? `${passed.map((c) => c.title).join(" and ")} ${passed.length === 1 ? "is" : "are"} full. `
              : ""
          }${target.title}, ${index + 1} of ${n + 1}.`,
        );
        focusCard(id);
        return;
      }
      if (key === "Tab") {
        setLift(null);
      }
      return;
    }

    if (key === " ") {
      event.preventDefault();
      const origin = placeOf(order, id);
      if (!origin) return;
      setLift({ id, origin, at: origin });
      say(
        `Picked up ${byId.get(id)?.key ?? "card"}. Arrows move it, Space drops it, Escape puts it back.`,
      );
      return;
    }
    if (key === "Enter") {
      event.preventDefault();
      onOpen?.(id);
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

  const total = list.length;
  const fullCols = columns.filter((c) => {
    const lim = limitOf(c.id);
    return lim !== null && countIn(c.id) >= lim;
  });
  const summary =
    fullCols.length === 0
      ? "room in every column"
      : fullCols.length === 1
        ? `${fullCols[0]?.title} is full`
        : `${fullCols.length} columns full`;
  const tabbableId =
    focusId && byId.has(focusId) ? focusId : (list[0]?.id ?? null);
  const dragged = drag ? byId.get(drag.id) : undefined;

  const nameOf = (card: LimitCard, view: Order) => {
    const at = placeOf(view, card.id);
    const colIds = at ? (view[at.columnId] ?? []) : [];
    const kind = KIND[card.kind ?? "feature"].label;
    return [
      card.key,
      kind,
      card.title,
      card.owner,
      card.points !== undefined ? plural(card.points, "point", "points") : null,
      at
        ? `${columnTitle(at.columnId)}, ${at.index + 1} of ${colIds.length}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const column = (col: LimitColumn) => {
    const ids = shownOrder[col.id] ?? [];
    const lim = limitOf(col.id);
    const count = countIn(col.id);
    const loading = col.status === "loading" || status === "loading";
    const refusing = drag?.phase === "drag" && drag.refused === col.id;
    const inviting =
      drag?.phase === "drag" && !drag.refused && drag.over?.columnId === col.id;
    const headId = `${uid}-col-${col.id}`;
    const room = lim === null ? null : Math.max(0, lim - count);
    return (
      <section
        key={col.id}
        role="group"
        aria-labelledby={headId}
        aria-busy={loading || undefined}
        className={cn(
          "flex h-full w-[min(15rem,82cqw)] shrink-0 snap-start flex-col overflow-hidden rounded-3 border bg-surface-0 transition-colors duration-200",
          "@min-[40rem]:w-auto @min-[40rem]:min-w-[9.5rem] @min-[40rem]:flex-1",
          refusing
            ? "border-danger/50 bg-[color-mix(in_oklab,var(--danger)_6%,var(--bg-0))]"
            : "border-hairline",
        )}
      >
        <header className="flex flex-col gap-1 px-3 pt-2.5 pb-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h3
              id={headId}
              className="min-w-0 truncate text-[13px] font-semibold"
              title={col.title}
            >
              {col.title}
            </h3>
            <span
              className={cn(
                "ml-auto shrink-0 font-mono text-[11px] tabular-nums transition-colors",
                lim !== null && count > lim
                  ? "text-danger"
                  : lim !== null && count >= lim
                    ? "text-warn"
                    : "text-ink-3",
              )}
            >
              {lim === null ? count : `${count} / ${lim}`}
            </span>
          </div>
          <div className="flex h-7 min-w-0 items-center gap-2">
            {lim === null ? (
              <span className="text-[11px] text-ink-3">No limit</span>
            ) : (
              <>
                <Gauge
                  gaugeStyle={gaugeStyle}
                  title={col.title}
                  limit={lim}
                  count={count}
                  maxLimit={top}
                  accent={accent}
                  pulse={pulses[col.id] ?? 0}
                  refusing={refusing}
                  disabled={disabled}
                  motionSafe={motionSafe}
                  onChange={(next) => setLimit(col.id, next)}
                />
                <span
                  className={cn(
                    "ml-auto shrink-0 text-[11px] transition-colors",
                    count > lim
                      ? "text-danger"
                      : refusing || count >= lim
                        ? "text-warn"
                        : "text-ink-3",
                  )}
                >
                  {count > lim
                    ? `${count - lim} over`
                    : count >= lim
                      ? "Full"
                      : `Room for ${room}`}
                </span>
              </>
            )}
          </div>
        </header>
        <motion.div
          ref={(node: HTMLDivElement | null) => {
            if (node) bodyNodes.current.set(col.id, node);
            else bodyNodes.current.delete(col.id);
          }}
          layoutScroll
          data-ll-body=""
          className="relative flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-2"
        >
          {loading ? (
            <div className="flex flex-col gap-2 pt-1" aria-hidden>
              {[64, 78, 64].map((h, i) => (
                <span
                  key={i}
                  className="block rounded-3 border border-dashed border-hairline-strong motion-safe:animate-pulse"
                  style={{ height: h }}
                />
              ))}
            </div>
          ) : (
            <ul role="list" className="flex flex-col gap-2 pt-1">
              {ids.map((id) => {
                const card = byId.get(id);
                if (!card) return null;
                const mode: CardMode =
                  drag?.id === id
                    ? drag.phase === "drag"
                      ? "placeholder"
                      : "landing"
                    : lift?.id === id
                      ? "lifted"
                      : "rest";
                return (
                  <CardItem
                    key={id}
                    card={card}
                    uid={uid}
                    mode={mode}
                    name={nameOf(card, shownOrder)}
                    hintId={hintId}
                    tabbable={tabbableId === id}
                    cardStyle={cardStyle}
                    accent={accent}
                    placeholderHeight={drag?.height ?? 64}
                    lean={lean}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    register={register}
                    onKey={onKey}
                    onFocusCard={setFocusId}
                    onPress={onPress}
                  />
                );
              })}
              {ids.length === 0 ? (
                <li
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-3 border border-dashed px-3 py-5 text-center transition-colors duration-200",
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
                  <span className="text-[12px] font-medium text-ink-2">
                    {room !== null ? `Room for ${room}` : "Nothing here yet"}
                  </span>
                  <span className="text-[11px] text-ink-3">
                    Drag a card here
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
        if (target?.closest("[data-ll-card]")) gesture.onPointerDown(event);
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
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <h2 id={titleId} className="min-w-0 truncate text-sm font-semibold">
          {title}
        </h2>
        <p className="text-[12px] text-ink-3 tabular-nums">
          {ready ? (
            <>
              {plural(total, "card", "cards")} ·{" "}
              <span className={fullCols.length > 0 ? "text-warn" : undefined}>
                {summary}
              </span>
            </>
          ) : status === "loading" ? (
            "Loading the board"
          ) : (
            "Not loaded"
          )}
        </p>
        <span
          aria-hidden
          className="ml-auto hidden items-center gap-1.5 text-[11px] text-ink-3 @min-[34rem]:inline-flex"
        >
          <span className="flex gap-0.5">
            <span
              className="block h-1.5 w-2 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="block h-1.5 w-2 rounded-full bg-hairline-strong" />
          </span>
          room
          <span className="ml-1.5 flex gap-0.5">
            <span
              className="block h-1.5 w-2 rounded-full"
              style={{ backgroundColor: FULL }}
            />
            <span
              className="block h-1.5 w-2 rounded-full"
              style={{ backgroundColor: FULL }}
            />
          </span>
          full
        </span>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between cards. Space picks a card up; arrows carry it,
        Space drops it, Escape puts it back. Enter opens a card. Each
        column&apos;s limit is a slider.
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
            CARD_STYLE[cardStyle],
            "pointer-events-none absolute top-0 left-0 z-30",
          )}
          style={{
            x: ox,
            y: oy,
            scale: liftScale,
            width: drag.width,
            borderLeftColor:
              cardStyle === "edge"
                ? KIND[dragged.kind ?? "feature"].pigment
                : undefined,
            boxShadow: drag.refused
              ? `0 0 0 2px ${OVER}, 0 14px 32px color-mix(in oklab, black 26%, transparent)`
              : `0 0 0 2px ${accent}, 0 14px 32px color-mix(in oklab, black 26%, transparent)`,
          }}
        >
          <CardFace card={dragged} cardStyle={cardStyle} />
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
