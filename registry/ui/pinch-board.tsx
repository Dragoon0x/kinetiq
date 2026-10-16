"use client";

import * as React from "react";

import {
  animate,
  LayoutGroup,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Bug,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag, wheelPixels } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PinchLevel = "dots" | "titles" | "cards" | "detail";
export type PinchKind = "feature" | "bug" | "design" | "chore";
export type PinchCardStyle = "plain" | "edge" | "tint";
export type PinchStatus = "ready" | "loading" | "error";
export type PinchZoomSource = "pinch" | "wheel" | "key" | "button";

export type PinchCard = {
  id: string;
  /** The column the card sits in; order within a column is the array's order. */
  columnId: string;
  title: string;
  /** Ticket key in mono: "WL-418". */
  key?: string;
  /** @default "feature" */
  kind?: PinchKind;
  /** Who is on it, as a full name. */
  owner?: string;
  /** Due date, ms since the epoch. */
  due?: number;
  /** One or two sentences, shown at the detail level. */
  note?: string;
  /** Checklist progress as [done, total], shown at the detail level. */
  checklist?: [number, number];
};

export type PinchColumn = {
  id: string;
  title: string;
  /** A column still fetching its cards draws outlines in the level's shape. @default "ready" */
  status?: "ready" | "loading";
};

export type PinchPlace = { columnId: string; index: number };

export type PinchMove = {
  cardId: string;
  from: PinchPlace;
  to: PinchPlace;
  /** Every card, in the order after the move. */
  cards: PinchCard[];
};

export type PinchBoardProps = {
  /** The columns, in order. @default defaultPinchColumns */
  columns?: PinchColumn[];
  /** Controlled cards. Moves are reported through `onCardsChange` and `onMove`. */
  cards?: PinchCard[];
  /** Initial cards when uncontrolled. @default defaultPinchCards (72) */
  defaultCards?: PinchCard[];
  /** Fires with every card after a move. */
  onCardsChange?: (cards: PinchCard[]) => void;
  /** Fires from the drop or key that moved a card. */
  onMove?: (move: PinchMove) => void;
  /** Controlled level of detail. */
  level?: PinchLevel;
  /** Initial level when uncontrolled. Omit it and narrow boards (under 40rem) start at titles, wider ones at cards. */
  defaultLevel?: PinchLevel;
  /** Fires from the pinch, wheel, key or button that changed the level. */
  onZoom?: (
    level: PinchLevel,
    info: { from: PinchLevel; source: PinchZoomSource },
  ) => void;
  /** How many levels the zoom steps through: 2 (titles, cards), 3 (dots, titles, cards) or 4 (adds detail). @default 3 */
  zoomLevels?: number;
  /** The pinch ratio that steps one level: lower is more eager. @default 1.3 */
  pinchStep?: number;
  /** Cards drawn plain with a hairline, with a coloured edge by kind, or on a soft tint of their kind. @default "plain" */
  cardStyle?: PinchCardStyle;
  /** The level pill, the lifted card's ring and the placeholder; any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Today, ms, for "in 3d" and "2d late". @default defaultPinchNow */
  now?: number;
  /** Whether the board's cards have arrived. @default "ready" */
  status?: PinchStatus;
  /** "Try again" was pressed after the board failed to load. */
  onRetry?: () => void;
  /** A card was tapped, or Enter was pressed on it. */
  onOpen?: (cardId: string) => void;
  /** The heading. @default "Waylight 4.2 release" */
  title?: string;
  /** The board's height, px; columns scroll inside it. @default 480 */
  height?: number;
  /** The board's accessible name. @default the title */
  label?: string;
  /** Freezes the board: no zoom, drags or keys. @default false */
  disabled?: boolean;
  /** Classes for the outer panel. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;

/** 16 October 2026, 09:00 UTC: two weeks before the 4.2 cut. */
export const defaultPinchNow = Date.UTC(2026, 9, 16, 9);

export const defaultPinchColumns: PinchColumn[] = [
  { id: "backlog", title: "Backlog" },
  { id: "next", title: "Next" },
  { id: "doing", title: "Doing" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
];

const SEED_TITLES: [string, string[]][] = [
  [
    "backlog",
    [
      "Offline tiles for whole regions",
      "Trip sharing with live ETA",
      "Search by postcode",
      "Widget for the next departure",
      "Saved places in folders",
      "Wheelchair-friendly routes",
      "Fare estimates on the route card",
      "Night mode for turn arrows",
      "Import trips from a calendar",
      "Bike lane layer",
      "Weather on arrival",
      "Watch app: next turn",
      "Group trips with shared stops",
      "Speed camera warnings opt-in",
      "Parking near the destination",
      "Lock-screen live activity",
      "Report a closed road",
      "Elevation profile for walks",
      "Battery saver navigation",
      "Carbon estimate per trip",
      "Custom voice packs",
      "Station exits in walking steps",
    ],
  ],
  [
    "next",
    [
      "Reroute when a line is down",
      "Haptics for upcoming turns",
      "Faster cold start on Android",
      "Recent searches sync",
      "Fix pin labels colliding at zoom 14",
      "Map style for print",
      "Onboarding: pick home and work",
      "Larger text for route steps",
      "Avoid tolls toggle",
      "Station entrances on the map",
      "Share a pin as a link",
      "Tidy the settings screen",
      "Rate-limit geocoder calls",
      "Crash on rotate in search",
    ],
  ],
  [
    "doing",
    [
      "Fix offline tiles flicker on resume",
      "Live ETA drift on long trips",
      "Voice prompts duck the music",
      "Route card redesign",
      "Search results ranking",
      "Background location budget",
      "Accessibility labels on pins",
      "Migrate saved places schema",
      "Lane guidance assets",
      "Analytics for reroutes",
    ],
  ],
  [
    "review",
    [
      "Dark map palette",
      "Arrival notification copy",
      "Fix stale traffic tiles",
      "Transit times in the 24h clock",
      "Compact route summary",
      "Retry failed downloads",
      "Remove the legacy tile server",
      "Tablet split view",
    ],
  ],
  [
    "done",
    [
      "Release notes for 4.2",
      "Map pins render sharp on retina",
      "Search keyboard dismisses on scroll",
      "Trip history export",
      "Swipe to dismiss a route",
      "Localise into Portuguese",
      "Fix ETA rounding",
      "Faster tile decode",
      "Sign in with a magic link",
      "Crash in the share sheet",
      "Update map attribution",
      "Deep links into settings",
      "Reduce the APK size",
      "Pin clustering at low zoom",
      "Compass calibration hint",
      "Toll roads in the route list",
      "Favourite stops widget",
      "Fix the metric toggle",
    ],
  ],
];

const OWNERS = [
  "Rae Okafor",
  "Tomas Ferrer",
  "Mara Lind",
  "Kenji Ota",
  "Priya Das",
  "Joel Ade",
  "Ines Park",
];

const NOTES = [
  "Repro on a cold start after the app was backgrounded for an hour.",
  "Design signed off; needs the empty state from the route card.",
  "Behind a flag until the 4.2 cut, then on for everyone.",
  "Measure on the slowest supported phone before and after.",
  "Copy is in the strings file; Portuguese still to come.",
  "Pairs with the tile server change; ship them together.",
  "Two crash reports this week, both on tablets.",
  "Keep the old behaviour behind the settings toggle.",
];

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const kindFor = (title: string): PinchKind =>
  /^(Fix|Crash)|flicker|drift|stale/.test(title)
    ? "bug"
    : /redesign|palette|style|copy|Onboarding|Compact|Tidy|Larger|exits/.test(
          title,
        )
      ? "design"
      : /Migrate|Remove|Rate-limit|Analytics|Release notes|Update|Reduce|Localise|budget/.test(
            title,
          )
        ? "chore"
        : "feature";

/** Seventy-two cards for the Waylight 4.2 release, seeded so they never change. */
export const defaultPinchCards: PinchCard[] = (() => {
  const rand = mulberry32(4207);
  const out: PinchCard[] = [];
  let n = 400;
  for (const [columnId, titles] of SEED_TITLES) {
    for (const title of titles) {
      n += 1 + Math.floor(rand() * 3);
      const total = 2 + Math.floor(rand() * 5);
      const done =
        columnId === "done"
          ? total
          : columnId === "backlog"
            ? 0
            : Math.floor(rand() * total);
      const offset =
        columnId === "done"
          ? -(1 + Math.floor(rand() * 12))
          : Math.floor(rand() * 26) - (columnId === "doing" ? 6 : 2);
      out.push({
        id: `wl-${n}`,
        columnId,
        key: `WL-${n}`,
        title,
        kind: kindFor(title),
        owner: OWNERS[Math.floor(rand() * OWNERS.length)] ?? "Rae Okafor",
        due: defaultPinchNow + offset * DAY,
        note: NOTES[Math.floor(rand() * NOTES.length)] ?? NOTES[0],
        checklist: [done, total],
      });
    }
  }
  return out;
})();

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const LADDER: PinchLevel[] = ["dots", "titles", "cards", "detail"];
const LEVEL_NAME: Record<PinchLevel, string> = {
  dots: "Dots",
  titles: "Titles",
  cards: "Cards",
  detail: "Detail",
};

const levelsFor = (count: number): PinchLevel[] =>
  count <= 2
    ? ["titles", "cards"]
    : count >= 4
      ? LADDER
      : ["dots", "titles", "cards"];

const KIND: Record<
  PinchKind,
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
  design: {
    label: "Design",
    text: "text-warn",
    pigment: "oklch(from var(--warn) 0.74 0.13 h)",
    Icon: Palette,
  },
  chore: {
    label: "Chore",
    text: "text-ink-2",
    pigment: "oklch(from var(--ink-3) 0.62 0.02 h)",
    Icon: Wrench,
  },
};

/** Column widths per level, and the corner each card shape is drawn with. */
const COLUMN_W: Record<PinchLevel, string> = {
  dots: "w-[7.25rem]",
  titles: "w-[10.5rem]",
  cards: "w-[13rem]",
  detail: "w-[15rem]",
};
const RADIUS: Record<PinchLevel, number> = {
  dots: 3,
  titles: 6,
  cards: 10,
  detail: 10,
};

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const EDGE = 40;
const PREVIEW = 0.15;

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
const same = (a: PinchPlace | null, b: PinchPlace | null) =>
  !!a && !!b && a.columnId === b.columnId && a.index === b.index;

/** Whole days from now, by hand: the same words on the server and the client. */
function dueText(due: number, now: number, done: boolean) {
  const days = Math.round((due - now) / DAY);
  if (done) return { short: "Done", long: "done", late: false };
  if (days === 0) return { short: "Today", long: "due today", late: false };
  if (days > 0) {
    return {
      short: `in ${days}d`,
      long: `due in ${plural(days, "day", "days")}`,
      late: false,
    };
  }
  return {
    short: `${-days}d late`,
    long: `${plural(-days, "day", "days")} late`,
    late: true,
  };
}

type Order = Record<string, string[]>;

function orderOf(columns: PinchColumn[], cards: PinchCard[]): Order {
  const out: Order = {};
  for (const c of columns) out[c.id] = [];
  for (const card of cards) out[card.columnId]?.push(card.id);
  return out;
}

function placed(order: Order, id: string, at: PinchPlace | null): Order {
  if (!at) return order;
  const out: Order = {};
  for (const [col, ids] of Object.entries(order)) {
    out[col] = ids.filter((x) => x !== id);
  }
  const list = out[at.columnId];
  if (list) list.splice(clamp(at.index, 0, list.length), 0, id);
  return out;
}

function placeOf(order: Order, id: string): PinchPlace | null {
  for (const [columnId, ids] of Object.entries(order)) {
    const index = ids.indexOf(id);
    if (index !== -1) return { columnId, index };
  }
  return null;
}

function cardsFrom(order: Order, columns: PinchColumn[], cards: PinchCard[]) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: PinchCard[] = [];
  for (const col of columns) {
    for (const id of order[col.id] ?? []) {
      const card = byId.get(id);
      if (card) {
        out.push(
          card.columnId === col.id ? card : { ...card, columnId: col.id },
        );
      }
    }
  }
  return out;
}

/**
 * Layout position inside `container` (which must be positioned), from offsets:
 * transforms are ignored, so a morph or a preview scale in flight never
 * skews it, and scroll is ignored, so it is in content coordinates.
 */
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
  return { x, y, w: node.offsetWidth, h: node.offsetHeight };
}

/* ----------------------------------------------------------------------- */
/*                                   Faces                                  */
/* ----------------------------------------------------------------------- */

type ShownLevel = PinchLevel | "auto";

function boxStyle(
  cardStyle: PinchCardStyle,
  pigment: string,
  dot: boolean,
): React.CSSProperties {
  if (dot) {
    if (cardStyle === "edge") {
      return {
        backgroundColor: "var(--card)",
        boxShadow: `inset 0 0 0 2px ${pigment}`,
      };
    }
    if (cardStyle === "tint") {
      return {
        backgroundColor: `color-mix(in oklab, ${pigment} 45%, var(--card))`,
      };
    }
    return { backgroundColor: pigment };
  }
  if (cardStyle === "tint") {
    return {
      backgroundColor: `color-mix(in oklab, ${pigment} 9%, var(--card))`,
      borderColor: `color-mix(in oklab, ${pigment} 26%, transparent)`,
    };
  }
  if (cardStyle === "edge") {
    return { borderLeftColor: pigment };
  }
  return {};
}

function TitleRow({ card }: { card: PinchCard }) {
  const kind = KIND[card.kind ?? "feature"];
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="h-3 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: kind.pigment }}
      />
      <span className="min-w-0 truncate text-[12px] leading-none text-foreground">
        {card.title}
      </span>
    </span>
  );
}

function FullFace({
  card,
  now,
  detail,
}: {
  card: PinchCard;
  now: number;
  detail: boolean;
}) {
  const kind = KIND[card.kind ?? "feature"];
  const due =
    card.due !== undefined
      ? dueText(card.due, now, card.columnId === "done")
      : null;
  const [done, total] = card.checklist ?? [0, 0];
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="flex min-w-0 items-center gap-1.5">
        {card.key ? (
          <span className="font-mono text-[10.5px] text-ink-3 tabular-nums">
            {card.key}
          </span>
        ) : null}
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
      {detail && card.note ? (
        <span className="line-clamp-2 text-[12px] leading-snug text-ink-2">
          {card.note}
        </span>
      ) : null}
      {detail && total > 0 ? (
        <span className="flex items-center gap-2">
          <span className="relative h-1 flex-1 overflow-clip rounded-full bg-surface-2">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-success"
              style={{ width: `${r2((done / total) * 100)}%` }}
            />
          </span>
          <span className="font-mono text-[10px] text-ink-3 tabular-nums">
            {done}/{total}
          </span>
        </span>
      ) : null}
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
        {due ? (
          <span
            className={cn(
              "ml-auto shrink-0 font-mono tabular-nums",
              due.late && "text-danger",
            )}
          >
            {due.short}
          </span>
        ) : null}
      </span>
    </span>
  );
}

type CardMode = "rest" | "lifted" | "placeholder" | "landing";

type CardProps = {
  card: PinchCard;
  uid: string;
  level: ShownLevel;
  mode: CardMode;
  name: string;
  hintId: string;
  tabbable: boolean;
  cardStyle: PinchCardStyle;
  accent: string;
  now: number;
  placeholderHeight: number;
  lean: MotionValue<number>;
  motionSafe: boolean;
  disabled: boolean;
  register: (id: string, node: HTMLButtonElement | null) => void;
  onKey: (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocusCard: (id: string) => void;
  onPress: (id: string, event: React.PointerEvent<HTMLButtonElement>) => void;
};

const CardView = React.memo(function CardView({
  card,
  uid,
  level,
  mode,
  name,
  hintId,
  tabbable,
  cardStyle,
  accent,
  now,
  placeholderHeight,
  lean,
  motionSafe,
  disabled,
  register,
  onKey,
  onFocusCard,
  onPress,
}: CardProps) {
  const still = useMotionValue(0);
  const kind = KIND[card.kind ?? "feature"];
  const lifted = mode === "lifted";
  const dot = level === "dots";
  const full = level === "cards" || level === "detail";
  const fade = {
    duration: durations.base,
    ease: easings.enter,
    delay: motionSafe ? 0.12 : 0,
  };

  // Each level is a different shape of the same button: the box morphs on
  // glide, the content arrives on a short fade once the box has room for it.
  let face: React.ReactNode = null;
  if (level === "titles") face = <TitleRow card={card} />;
  else if (full)
    face = <FullFace card={card} now={now} detail={level === "detail"} />;
  else if (level === "auto")
    face = (
      <>
        <span className="block @min-[40rem]:hidden">
          <TitleRow card={card} />
        </span>
        <span className="hidden @min-[40rem]:block">
          <FullFace card={card} now={now} detail={false} />
        </span>
      </>
    );

  const shape =
    level === "dots"
      ? "size-3"
      : level === "titles"
        ? "flex h-[26px] w-full items-center px-2"
        : level === "auto"
          ? "flex h-[26px] w-full items-center px-2 @min-[40rem]:block @min-[40rem]:h-auto @min-[40rem]:p-2.5"
          : "block w-full p-2.5";

  return (
    <li className={cn("relative", dot ? "flex" : "block", lifted && "z-10")}>
      {mode === "placeholder" ? (
        <span
          aria-hidden
          className={cn(
            "block border-2 border-dashed",
            dot ? "size-3 rounded-[3px] border" : "w-full",
          )}
          style={{
            height: dot ? undefined : placeholderHeight,
            borderRadius: dot
              ? undefined
              : RADIUS[level === "auto" ? "titles" : level],
            borderColor: `color-mix(in oklab, ${accent} 60%, transparent)`,
            backgroundColor: `color-mix(in oklab, ${accent} 8%, transparent)`,
          }}
        />
      ) : null}
      <motion.button
        ref={(node) => register(card.id, node)}
        type="button"
        layout={motionSafe}
        layoutId={`${uid}-card-${card.id}`}
        transition={{
          layout: motionSafe ? springs.glide : { duration: 0 },
          scale: motionSafe ? springs.flick : { duration: 0 },
        }}
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
        animate={{ scale: lifted && motionSafe ? 1.03 : 1 }}
        className={cn(
          "relative touch-pan-y text-left transition-[opacity,box-shadow] duration-150 select-none",
          !dot &&
            (cardStyle === "edge"
              ? "border border-l-[3px] border-hairline bg-card"
              : "border border-hairline bg-card"),
          shape,
          FOCUS,
          disabled ? "cursor-not-allowed" : "cursor-grab",
          !dot && !disabled && "hover:border-hairline-strong",
          mode === "placeholder" &&
            "pointer-events-none absolute inset-0 opacity-0",
          mode === "landing" && "opacity-0",
        )}
        style={{
          x: lifted ? lean : still,
          borderRadius: RADIUS[level === "auto" ? "titles" : level],
          ...boxStyle(cardStyle, kind.pigment, dot),
          ...(lifted
            ? {
                boxShadow: `0 0 0 2px ${accent}, 0 10px 24px color-mix(in oklab, black 22%, transparent)`,
              }
            : null),
        }}
      >
        {face ? (
          <motion.span
            key={level}
            layout={motionSafe ? "position" : false}
            className="block min-w-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ opacity: fade, layout: springs.glide }}
          >
            {face}
          </motion.span>
        ) : null}
      </motion.button>
    </li>
  );
});

/* ----------------------------------------------------------------------- */
/*                                   Board                                  */
/* ----------------------------------------------------------------------- */

type Carry = {
  id: string;
  origin: PinchPlace;
  over: PinchPlace | null;
  grabX: number;
  grabY: number;
  px: number;
  py: number;
};

type DragView = {
  id: string;
  over: PinchPlace | null;
  width: number;
  height: number;
  phase: "drag" | "land";
};

type Lift = { id: string; origin: PinchPlace; at: PinchPlace };

type Anchor = {
  /** Board scroll, and the focal point's place in the board's viewport. */
  fromLeft: number;
  sx: number;
  columns: {
    id: string;
    body: HTMLElement;
    card: string | null;
    fx: number;
    fy: number;
    sy: number;
    fromTop: number;
  }[];
  focalColumn: string | null;
};

/**
 * A kanban board you zoom. Its cards have levels of detail — coloured dots,
 * one-line titles, full cards with the owner and due date, and (with four
 * levels) open cards with a note and a checklist — and a pinch, Ctrl or ⌘
 * with the wheel, the + and − keys or the toolbar morphs every card between
 * them at once.
 *
 * The morph keeps the point under the fingers still. Before the level
 * changes the board notes the card under the focal point and where inside it
 * the point sits; the new level is laid out at once and every card glides from
 * its old box to its new one, while the board's scroll rides the same glide
 * spring to the offset that puts that spot back under the focal point. The
 * two run together, so the focal card holds its place for the whole morph
 * while the board unfolds round it; every other column keeps its topmost card
 * where it was. During a pinch the board follows the fingers 1:1 — scaling a
 * little about their midpoint — until the pinch passes `pinchStep`, when the
 * level steps and the morph takes over.
 *
 * Cards move by drag (a lifted copy 1:1, a landing on snap with the release
 * velocity) or by keys: Space lifts, arrows carry, Space or Enter drops,
 * Escape puts back; + and − zoom about the focused card. Under reduced motion
 * the level swaps at once and the scroll jumps straight to the anchored
 * offset, so the focal card is still where it was.
 */
export function PinchBoard({
  columns = defaultPinchColumns,
  cards,
  defaultCards,
  onCardsChange,
  onMove,
  level,
  defaultLevel,
  onZoom,
  zoomLevels = 3,
  pinchStep = 1.3,
  cardStyle = "plain",
  accent = "var(--accent-bright)",
  now = defaultPinchNow,
  status = "ready",
  onRetry,
  onOpen,
  title = "Waylight 4.2 release",
  height = 480,
  label,
  disabled = false,
  className,
}: PinchBoardProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const levels = levelsFor(Math.round(zoomLevels));
  const step = Math.max(1.05, pinchStep);

  /* -------------------------------- data -------------------------------- */

  const [own, setOwn] = React.useState<PinchCard[]>(
    () => defaultCards ?? defaultPinchCards,
  );
  const list = cards ?? own;
  const order = React.useMemo(() => orderOf(columns, list), [columns, list]);
  const byId = React.useMemo(() => new Map(list.map((c) => [c.id, c])), [list]);

  /* ------------------------------- levels ------------------------------- */

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const [rootNode, setRootNode] = React.useState<HTMLDivElement | null>(null);
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    setRootNode(node);
  }, []);
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    if (!rootNode) return;
    const ro = new ResizeObserver(() => setNarrow(rootNode.clientWidth < 640));
    ro.observe(rootNode);
    return () => ro.disconnect();
  }, [rootNode]);

  const [ownLevel, setOwnLevel] = React.useState<PinchLevel | null>(
    defaultLevel ?? null,
  );
  const chosen = level ?? ownLevel;
  // Until someone zooms, a board with no level of its own is laid out by its
  // container: titles when narrow, cards when wide — on the first paint.
  const effective: PinchLevel = chosen ?? (narrow ? "titles" : "cards");
  const fit = (l: PinchLevel): PinchLevel => {
    if (levels.includes(l)) return l;
    const at = LADDER.indexOf(l);
    let best = levels[0] ?? "cards";
    for (const option of levels) {
      if (
        Math.abs(LADDER.indexOf(option) - at) <
        Math.abs(LADDER.indexOf(best) - at)
      ) {
        best = option;
      }
    }
    return best;
  };
  const current = fit(effective);
  const shown: ShownLevel =
    chosen === null && levels.includes("cards") && levels.includes("titles")
      ? "auto"
      : current;

  /* ------------------------------- states ------------------------------- */

  const [drag, setDrag] = React.useState<DragView | null>(null);
  const [lift, setLift] = React.useState<Lift | null>(null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [focusAsk, setFocusAsk] = React.useState<{
    id: string;
    n: number;
  } | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const shownOrder = React.useMemo(() => {
    if (drag && drag.phase === "drag" && drag.over) {
      return placed(order, drag.id, drag.over);
    }
    if (lift) return placed(order, lift.id, lift.at);
    return order;
  }, [order, drag, lift]);

  const columnTitle = (id: string) =>
    columns.find((c) => c.id === id)?.title ?? id;

  /* ------------------------------- nodes -------------------------------- */

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const bodyNodes = React.useRef(new Map<string, HTMLElement>());
  const listNodes = React.useRef(new Map<string, HTMLElement>());
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

  // Focus follows the keyboard onto a card that may have just moved column.
  // The card is scrolled into view by its layout box — the button may still
  // be mid-glide — and only inside the board, never the page.
  React.useEffect(() => {
    if (!focusAsk) return;
    const node = cardNodes.current.get(focusAsk.id);
    const scroller = scrollRef.current;
    const inner = innerRef.current;
    if (!node) return;
    const li = node.parentElement;
    const body = node.closest<HTMLElement>("[data-pb-body]");
    const section = body?.parentElement;
    const behavior: ScrollBehavior = motionSafeRef.current ? "smooth" : "auto";
    if (li && body && section && scroller && inner) {
      const x0 = offsetWithin(section, inner).x;
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

  /* -------------------------------- zoom -------------------------------- */

  const preview = useMotionValue(1);
  const [origin, setOrigin] = React.useState("50% 50%");
  const anchor = React.useRef<Anchor | null>(null);
  const morph = React.useRef<AnimationPlaybackControls | null>(null);
  const shiftAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const settleAnim = React.useRef<AnimationPlaybackControls | null>(null);

  /** Notes, for every column, the card a level change must hold still. */
  const takeAnchor = (
    focal: { x: number; y: number } | null,
  ): Anchor | null => {
    const scroller = scrollRef.current;
    if (!scroller) return null;
    const sr = scroller.getBoundingClientRect();
    // Without a focal point (the toolbar), the board's centre holds still
    // across, and every column keeps its top.
    const fx0 = focal?.x ?? sr.left + sr.width / 2;
    let focalColumn: string | null = null;
    const cols: Anchor["columns"] = [];
    for (const col of columns) {
      const body = bodyNodes.current.get(col.id);
      if (!body) continue;
      const br = body.getBoundingClientRect();
      const inThis = fx0 >= br.left - 6 && fx0 <= br.right + 6;
      if (inThis) focalColumn = col.id;
      const fy0 = inThis && focal ? clamp(focal.y, br.top, br.bottom) : br.top;
      let best: { id: string; r: DOMRect; d: number } | null = null;
      for (const id of order[col.id] ?? []) {
        const node = cardNodes.current.get(id);
        if (!node) continue;
        const r = node.getBoundingClientRect();
        if (r.bottom < br.top || r.top > br.bottom) continue;
        const dx = inThis ? Math.max(0, r.left - fx0, fx0 - r.right) : 0;
        const dy = Math.max(0, r.top - fy0, fy0 - r.bottom);
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { id, r, d };
        if (d === 0) break;
      }
      cols.push({
        id: col.id,
        body,
        card: best?.id ?? null,
        fx: best
          ? clamp((fx0 - best.r.left) / Math.max(1, best.r.width), 0, 1)
          : 0,
        fy: best
          ? clamp((fy0 - best.r.top) / Math.max(1, best.r.height), 0, 1)
          : 0,
        sy: fy0 - br.top,
        fromTop: body.scrollTop,
      });
    }
    return {
      fromLeft: scroller.scrollLeft,
      sx: fx0 - sr.left,
      columns: cols,
      focalColumn,
    };
  };

  /** A level asked for but not yet rendered: a burst of wheel events steps from it. */
  const pending = React.useRef<PinchLevel | null>(null);
  React.useEffect(() => {
    pending.current = null;
  }, [current]);

  const zoomTo = (
    next: PinchLevel,
    source: PinchZoomSource,
    focal: { x: number; y: number } | null,
  ) => {
    const from = pending.current ?? current;
    const target = fit(next);
    if (target === from || disabled || !ready) return false;
    morph.current?.stop();
    settleAnim.current?.stop();
    // A board still settling from the last morph is measured where it stands.
    shiftAnim.current?.stop();
    // The preview scale hands over to the morph: written straight to the
    // node so the layout is measured unscaled.
    preview.jump(1);
    if (innerRef.current) innerRef.current.style.transform = "none";
    anchor.current = takeAnchor(focal);
    pending.current = target;
    if (level === undefined) setOwnLevel(target);
    onZoom?.(target, { from, source });
    say(
      `${LEVEL_NAME[target]} level, ${plural(list.length, "card", "cards")}.`,
    );
    return true;
  };

  const zoomBy = (
    dir: 1 | -1,
    source: PinchZoomSource,
    focal: { x: number; y: number } | null,
  ) => {
    const i = levels.indexOf(pending.current ?? current);
    const next = levels[clamp(i + dir, 0, levels.length - 1)];
    return next ? zoomTo(next, source, focal) : false;
  };

  // The level is laid out; now carry every scroll to where the anchors sit
  // again, on the same spring the cards are gliding on. Where the board has
  // no scroll left to give (its edge, or a column shorter than the view), the
  // content is shifted instead so the anchor still holds through the morph,
  // and the shift then settles back to the edge on drift.
  React.useLayoutEffect(() => {
    const a = anchor.current;
    const scroller = scrollRef.current;
    const inner = innerRef.current;
    anchor.current = null;
    if (!a || !scroller || !inner) return;
    const naturalW = inner.offsetWidth;
    const maxLeft = Math.max(0, naturalW - scroller.clientWidth);
    let idealLeft = a.fromLeft;
    const plans: {
      body: HTMLElement;
      list: HTMLElement | null;
      from: number;
      to: number;
      shift: number;
    }[] = [];
    for (const c of a.columns) {
      const list = listNodes.current.get(c.id) ?? null;
      const node = c.card ? cardNodes.current.get(c.card) : null;
      if (!node || !list) {
        plans.push({
          body: c.body,
          list,
          from: c.fromTop,
          to: c.fromTop,
          shift: 0,
        });
        continue;
      }
      const p = offsetWithin(node, c.body);
      const naturalH = list.offsetTop + list.offsetHeight + 8;
      const maxTop = Math.max(0, naturalH - c.body.clientHeight);
      const ideal = Math.round(p.y + c.fy * p.h - c.sy);
      const to = clamp(ideal, 0, maxTop);
      plans.push({
        body: c.body,
        list,
        from: c.fromTop,
        to,
        shift: to - ideal,
      });
      if (c.id === a.focalColumn) {
        const q = offsetWithin(node, inner);
        idealLeft = Math.round(q.x + c.fx * q.w - a.sx);
      }
    }
    const toLeft = clamp(idealLeft, 0, maxLeft);
    const shiftX = toLeft - idealLeft;
    if (!motionSafe) {
      scroller.scrollLeft = toLeft;
      for (const p of plans) p.body.scrollTop = p.to;
      return;
    }
    // Hold the old scroll range open while the morph runs, so a board that
    // shrinks never clamps its scroll mid-flight.
    inner.style.minWidth = `${Math.max(naturalW, a.fromLeft + scroller.clientWidth)}px`;
    for (const p of plans) {
      if (!p.list) continue;
      p.list.style.minHeight = `${Math.max(p.list.offsetHeight, p.from + p.body.clientHeight)}px`;
    }
    const shiftTo = (k: number) => {
      inner.style.translate = shiftX ? `${r2(shiftX * k)}px 0px` : "";
      for (const p of plans) {
        if (p.list)
          p.list.style.translate = p.shift ? `0px ${r2(p.shift * k)}px` : "";
      }
    };
    shiftTo(1);
    scroller.scrollLeft = a.fromLeft;
    for (const p of plans) p.body.scrollTop = p.from;
    const release = () => {
      inner.style.minWidth = "";
      for (const p of plans) if (p.list) p.list.style.minHeight = "";
    };
    let settled = false;
    const settleShift = () => {
      if (settled) return;
      settled = true;
      if (!shiftX && plans.every((p) => !p.shift)) return;
      shiftAnim.current = animate(1, 0, {
        ...springs.drift,
        onUpdate: shiftTo,
        onComplete: () => {
          shiftTo(0);
          shiftAnim.current = null;
        },
      });
    };
    morph.current = animate(0, 1, {
      ...springs.glide,
      onUpdate: (t) => {
        scroller.scrollLeft = Math.round(
          a.fromLeft + (toLeft - a.fromLeft) * t,
        );
        for (const p of plans) {
          p.body.scrollTop = Math.round(p.from + (p.to - p.from) * t);
        }
      },
      onComplete: () => {
        release();
        morph.current = null;
        settleShift();
      },
    });
    return () => {
      // A re-run (StrictMode) lands everything where it was going.
      if (morph.current) {
        morph.current.stop();
        morph.current = null;
        release();
        scroller.scrollLeft = toLeft;
        for (const p of plans) p.body.scrollTop = p.to;
      }
      shiftAnim.current?.stop();
      shiftAnim.current = null;
      shiftTo(0);
    };
  }, [shown, motionSafe]);

  /* ----------------------- pinch, wheel and gesture ---------------------- */

  const live = React.useRef({ zoomBy, current, motionSafe, step });
  React.useEffect(() => {
    live.current = { zoomBy, current, motionSafe, step };
  });

  const [scroller, setScroller] = React.useState<HTMLDivElement | null>(null);
  const bindScroller = React.useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    setScroller(node);
  }, []);

  React.useEffect(() => {
    if (!scroller) return;
    let scale = 1;
    let idle = 0;
    let pinch: { d0: number } | null = null;
    let gesture = 1;

    const setOriginAt = (x: number, y: number) => {
      const inner = innerRef.current;
      if (!inner) return;
      const r = inner.getBoundingClientRect();
      setOrigin(`${r2(x - r.left)}px ${r2(y - r.top)}px`);
    };
    const show = (s: number) => {
      if (!live.current.motionSafe) return;
      settleAnim.current?.stop();
      preview.set(r2(clamp(s, 1 - PREVIEW, 1 + PREVIEW)));
    };
    const settle = () => {
      scale = 1;
      if (!live.current.motionSafe) return;
      settleAnim.current = animate(preview, 1, springs.glide);
    };
    const stepIf = (
      focal: { x: number; y: number },
      source: PinchZoomSource,
    ) => {
      const s = live.current.step;
      if (scale >= s) {
        if (live.current.zoomBy(1, source, focal)) scale = 1;
        else scale = Math.min(scale, s);
      } else if (scale <= 1 / s) {
        if (live.current.zoomBy(-1, source, focal)) scale = 1;
        else scale = Math.max(scale, 1 / s);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      // Ours: the page must not zoom while the board does.
      event.preventDefault();
      const { y } = wheelPixels(event);
      if (scale === 1) setOriginAt(event.clientX, event.clientY);
      scale = clamp(scale * Math.exp(-y * 0.01), 0.4, 2.5);
      show(scale);
      stepIf({ x: event.clientX, y: event.clientY }, "wheel");
      window.clearTimeout(idle);
      idle = window.setTimeout(settle, 160);
    };

    const touchesOf = (event: TouchEvent) => {
      const a = event.touches[0];
      const b = event.touches[1];
      if (!a || !b) return null;
      return {
        d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        x: (a.clientX + b.clientX) / 2,
        y: (a.clientY + b.clientY) / 2,
      };
    };
    const onTouchStart = (event: TouchEvent) => {
      const t = touchesOf(event);
      if (!t) return;
      pinch = { d0: Math.max(1, t.d) };
      scale = 1;
      setOriginAt(t.x, t.y);
    };
    const onTouchMove = (event: TouchEvent) => {
      const t = touchesOf(event);
      if (!t || !pinch) return;
      event.preventDefault();
      scale = t.d / pinch.d0;
      show(scale);
      const before = live.current.current;
      stepIf({ x: t.x, y: t.y }, "pinch");
      if (live.current.current !== before || scale === 1) {
        pinch = { d0: Math.max(1, t.d) };
      }
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (pinch) settle();
      pinch = null;
    };

    // Desktop Safari reports a trackpad pinch as gesture events.
    type GestureLike = Event & {
      scale?: number;
      clientX?: number;
      clientY?: number;
    };
    const onGestureStart = (event: Event) => {
      event.preventDefault();
      const g = event as GestureLike;
      gesture = 1;
      scale = 1;
      setOriginAt(g.clientX ?? 0, g.clientY ?? 0);
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const g = event as GestureLike;
      const s = g.scale ?? 1;
      scale *= s / gesture;
      gesture = s;
      show(scale);
      stepIf({ x: g.clientX ?? 0, y: g.clientY ?? 0 }, "pinch");
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      settle();
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd, { passive: true });
    scroller.addEventListener("touchcancel", onTouchEnd, { passive: true });
    scroller.addEventListener("gesturestart", onGestureStart);
    scroller.addEventListener("gesturechange", onGestureChange);
    scroller.addEventListener("gestureend", onGestureEnd);
    return () => {
      window.clearTimeout(idle);
      scroller.removeEventListener("wheel", onWheel);
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
      scroller.removeEventListener("gesturestart", onGestureStart);
      scroller.removeEventListener("gesturechange", onGestureChange);
      scroller.removeEventListener("gestureend", onGestureEnd);
      settleAnim.current?.stop();
      preview.jump(1);
    };
  }, [scroller, preview]);

  React.useEffect(
    () => () => {
      morph.current?.stop();
    },
    [],
  );

  /* ------------------------------- moves -------------------------------- */

  const commit = (id: string, to: PinchPlace, how: "drop" | "key") => {
    const from = placeOf(order, id);
    if (!from || same(from, to)) return false;
    const nextOrder = placed(order, id, to);
    const next = cardsFrom(nextOrder, columns, list);
    if (cards === undefined) setOwn(next);
    onCardsChange?.(next);
    onMove?.({ cardId: id, from, to, cards: next });
    const card = byId.get(id);
    say(
      `${how === "drop" ? "Dropped" : "Moved"} ${card?.key ?? card?.title ?? "card"} in ${columnTitle(
        to.columnId,
      )}, ${to.index + 1} of ${(nextOrder[to.columnId] ?? []).length}.`,
    );
    return true;
  };

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

  /** The column, and the seat in it, a point is over — rows or a wrapped grid of dots. */
  const hitTest = (px: number, py: number, id: string): PinchPlace | null => {
    for (const col of columns) {
      if (col.status === "loading" || status === "loading") continue;
      const body = bodyNodes.current.get(col.id);
      if (!body) continue;
      const r = body.getBoundingClientRect();
      if (
        px < r.left - 6 ||
        px > r.right + 6 ||
        py < r.top - 40 ||
        py > r.bottom + 6
      ) {
        continue;
      }
      const ids = (order[col.id] ?? []).filter((x) => x !== id);
      let index = ids.length;
      for (let i = 0; i < ids.length; i += 1) {
        const node = cardNodes.current.get(ids[i] ?? "");
        if (!node) continue;
        const b = node.getBoundingClientRect();
        const before =
          py < b.top || (py <= b.bottom && px < b.left + b.width / 2);
        if (before) {
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
    disabled: disabled || !ready,
    onStart: ({ point }) => {
      const press = pressed.current;
      const node = press ? cardNodes.current.get(press.id) : undefined;
      const root = rootRef.current;
      if (!press || !node || !root) return;
      const from = placeOf(order, press.id);
      if (!from) return;
      if (lift) setLift(null);
      stopAll();
      const rb = root.getBoundingClientRect();
      const nb = node.getBoundingClientRect();
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
        anims.current.push(animate(liftScale, 1.04, springs.flick));
      setFocusId(press.id);
      setDrag({
        id: press.id,
        over: from,
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
      if (!press || disabled) return;
      setFocusId(press.id);
      onOpen?.(press.id);
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
  const centreOf = (id: string) => {
    const r = cardNodes.current.get(id)?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  };

  const onKey = (id: string, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || !ready) return;
    const key = event.key;
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (key === "+" || key === "=") {
        event.preventDefault();
        zoomBy(1, "key", centreOf(id));
        return;
      }
      if (key === "-" || key === "_") {
        event.preventDefault();
        zoomBy(-1, "key", centreOf(id));
        return;
      }
    }
    const view = shownOrder;
    const at = placeOf(view, id);
    if (!at) return;
    const colIndex = columns.findIndex((c) => c.id === at.columnId);
    const name = byId.get(id)?.key ?? byId.get(id)?.title ?? "Card";

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
        const n = (order[target.id] ?? []).filter((x) => x !== id).length;
        const index = Math.min(at.index, n);
        setLift({ ...lift, at: { columnId: target.id, index } });
        say(`${target.title}, ${index + 1} of ${n + 1}.`);
        focusCard(id);
      } else if (key === "Tab") {
        setLift(null);
      }
      return;
    }

    if (key === " ") {
      event.preventDefault();
      const from = placeOf(order, id);
      if (!from) return;
      setLift({ id, origin: from, at: from });
      say(
        `Picked up ${name}. Arrows move it, Space drops it, Escape puts it back.`,
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

  // Stable handlers for the memoised cards: a drag re-renders only the cards
  // whose own props change.
  const handlers = React.useRef({ onKey });
  React.useEffect(() => {
    handlers.current = { onKey };
  });
  const stableKey = React.useCallback(
    (id: string, event: React.KeyboardEvent<HTMLButtonElement>) =>
      handlers.current.onKey(id, event),
    [],
  );
  const onPress = React.useCallback(
    (id: string, event: React.PointerEvent<HTMLButtonElement>) => {
      pressed.current = { id, x: event.clientX, y: event.clientY };
    },
    [],
  );

  /* ------------------------------- edges -------------------------------- */

  const scrollX = useMotionValue(0);
  const maxX = useMotionValue(0);
  React.useEffect(() => {
    if (!scroller) return;
    const measure = () => {
      maxX.set(Math.max(0, scroller.scrollWidth - scroller.clientWidth));
      scrollX.set(scroller.scrollLeft);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    const inner = scroller.firstElementChild;
    if (inner) ro.observe(inner);
    return () => ro.disconnect();
  }, [scroller, maxX, scrollX]);
  const leftFade = useTransform(scrollX, (x) => r2(clamp(x / 24, 0, 1)));
  const rightFade = useTransform(
    [scrollX, maxX] as MotionValue<number>[],
    ([x = 0, m = 0]: number[]) => r2(clamp((m - x) / 24, 0, 1)),
  );

  /* ------------------------------- render ------------------------------- */

  const tabbableId =
    focusId && byId.has(focusId) ? focusId : (list[0]?.id ?? null);
  const dragged = drag ? byId.get(drag.id) : undefined;
  const levelIndex = levels.indexOf(current);
  const radioRefs = React.useRef(new Map<PinchLevel, HTMLButtonElement>());

  const nameOf = (card: PinchCard, view: Order) => {
    const at = placeOf(view, card.id);
    const kind = KIND[card.kind ?? "feature"].label;
    const due =
      card.due !== undefined
        ? dueText(card.due, now, card.columnId === "done").long
        : null;
    return [
      card.key,
      kind,
      card.title,
      at
        ? `${columnTitle(at.columnId)}, ${at.index + 1} of ${(view[at.columnId] ?? []).length}`
        : null,
      due,
    ]
      .filter(Boolean)
      .join(", ");
  };

  const outline = (lv: ShownLevel) => {
    if (lv === "dots") {
      return (
        <div className="flex flex-wrap gap-1 pt-1" aria-hidden>
          {Array.from({ length: 18 }, (_, i) => (
            <span
              key={i}
              className="block size-3 rounded-[3px] border border-dashed border-hairline-strong motion-safe:animate-pulse"
            />
          ))}
        </div>
      );
    }
    const tall = lv === "cards" || lv === "detail";
    return (
      <div className="flex flex-col gap-1.5 pt-1" aria-hidden>
        {Array.from({ length: tall ? 3 : 6 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "block rounded-2 border border-dashed border-hairline-strong motion-safe:animate-pulse",
              lv === "auto"
                ? "h-[26px] @min-[40rem]:h-20"
                : tall
                  ? lv === "detail"
                    ? "h-28"
                    : "h-20"
                  : "h-[26px]",
            )}
          />
        ))}
      </div>
    );
  };

  const column = (col: PinchColumn) => {
    const ids = shownOrder[col.id] ?? [];
    const loading = col.status === "loading" || status === "loading";
    const headId = `${uid}-col-${col.id}`;
    const dots = shown === "dots";
    return (
      <motion.section
        key={col.id}
        layout={motionSafe}
        transition={{ layout: motionSafe ? springs.glide : { duration: 0 } }}
        role="group"
        aria-labelledby={headId}
        aria-busy={loading || undefined}
        className={cn(
          "relative flex h-full shrink-0 snap-start flex-col overflow-hidden border border-hairline bg-surface-0",
          shown === "auto"
            ? "w-[10.5rem] @min-[40rem]:w-[13rem]"
            : COLUMN_W[shown],
        )}
        style={{ borderRadius: 10 }}
      >
        <motion.div
          layout={motionSafe ? "position" : false}
          transition={{ layout: springs.glide }}
          className="flex items-center gap-2 px-2.5 pt-2.5 pb-1.5"
        >
          <h3
            id={headId}
            className="min-w-0 truncate text-[12px] font-semibold"
            title={col.title}
          >
            {col.title}
          </h3>
          <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {loading ? "…" : (order[col.id] ?? []).length}
          </span>
        </motion.div>
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
            outline(shown)
          ) : (
            <ul
              ref={(node) => {
                if (node) listNodes.current.set(col.id, node);
                else listNodes.current.delete(col.id);
              }}
              role="list"
              className={cn(
                "pt-1",
                dots
                  ? "flex flex-wrap content-start gap-1"
                  : "flex flex-col gap-1.5",
                shown === "cards" || shown === "detail" ? "gap-2" : null,
                shown === "auto" && "@min-[40rem]:gap-2",
              )}
            >
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
                  <CardView
                    key={id}
                    card={card}
                    uid={uid}
                    level={shown}
                    mode={mode}
                    name={nameOf(card, shownOrder)}
                    hintId={hintId}
                    tabbable={tabbableId === id}
                    cardStyle={cardStyle}
                    accent={accent}
                    now={now}
                    placeholderHeight={drag?.id === id ? drag.height : 0}
                    lean={lean}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    register={register}
                    onKey={stableKey}
                    onFocusCard={setFocusId}
                    onPress={onPress}
                  />
                );
              })}
              {ids.length === 0 ? (
                <li className="flex flex-col items-center gap-0.5 rounded-2 border border-dashed border-hairline-strong px-2 py-4 text-center">
                  <span className="text-[11px] text-ink-3">Nothing here</span>
                </li>
              ) : null}
            </ul>
          )}
        </motion.div>
      </motion.section>
    );
  };

  const stepButton = cn(
    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
    "enabled:hover:bg-surface-2 enabled:hover:text-foreground aria-disabled:opacity-40",
    FOCUS,
  );

  return (
    <div
      ref={bindRoot}
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
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 flex-1 basis-40 flex-col">
          <h2 id={titleId} className="truncate text-sm font-semibold">
            {title}
          </h2>
          <p className="text-[11px] text-ink-3 tabular-nums">
            {ready
              ? `${plural(list.length, "card", "cards")} · ${plural(columns.length, "column", "columns")}`
              : status === "loading"
                ? "Loading the board"
                : "Not loaded"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[11px] text-ink-3 @min-[44rem]:inline">
            Pinch or Ctrl + scroll
          </span>
          <div className="flex h-8 items-center gap-0.5 rounded-3 border border-hairline bg-surface-1 p-0.5">
            <button
              type="button"
              aria-label="Zoom out"
              aria-disabled={levelIndex <= 0 || disabled || undefined}
              onClick={() => zoomBy(-1, "button", null)}
              className={stepButton}
            >
              <Minus aria-hidden className="size-3.5" />
            </button>
            <div
              role="radiogroup"
              aria-label="Level of detail"
              className="flex items-center"
            >
              {levels.map((lv) => {
                const on = lv === current;
                // Until someone zooms the container picks the level, so the
                // pill is placed by the same container query, never moved.
                const auto =
                  chosen === null && (lv === "titles" || lv === "cards");
                const autoPill =
                  lv === "titles"
                    ? "@min-[40rem]:hidden"
                    : "hidden @min-[40rem]:block";
                const autoText =
                  lv === "titles"
                    ? "text-primary-foreground @min-[40rem]:text-ink-2"
                    : "text-ink-2 @min-[40rem]:text-primary-foreground";
                return (
                  <button
                    key={lv}
                    ref={(node) => {
                      if (node) radioRefs.current.set(lv, node);
                      else radioRefs.current.delete(lv);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    tabIndex={on ? 0 : -1}
                    onClick={() => zoomTo(lv, "button", null)}
                    onKeyDown={(event) => {
                      const i = levels.indexOf(lv);
                      const d =
                        event.key === "ArrowRight" || event.key === "ArrowDown"
                          ? 1
                          : event.key === "ArrowLeft" || event.key === "ArrowUp"
                            ? -1
                            : 0;
                      if (d === 0) return;
                      event.preventDefault();
                      const nextLevel =
                        levels[clamp(i + d, 0, levels.length - 1)];
                      if (!nextLevel) return;
                      zoomTo(nextLevel, "button", null);
                      radioRefs.current.get(nextLevel)?.focus();
                    }}
                    className={cn(
                      "relative inline-flex h-7 items-center rounded-2 px-2 text-[11px] font-medium transition-colors",
                      chosen === null
                        ? auto
                          ? autoText
                          : "text-ink-2 hover:text-foreground"
                        : on
                          ? "text-primary-foreground"
                          : "text-ink-2 hover:text-foreground",
                      FOCUS,
                    )}
                  >
                    {auto ? (
                      <span
                        aria-hidden
                        className={cn("absolute inset-0 rounded-2", autoPill)}
                        style={{
                          backgroundColor: `oklch(from ${accent} 0.56 c h)`,
                        }}
                      />
                    ) : chosen !== null && on ? (
                      <motion.span
                        layoutId={`${uid}-level`}
                        aria-hidden
                        className="absolute inset-0 rounded-2"
                        style={{
                          backgroundColor: `oklch(from ${accent} 0.56 c h)`,
                        }}
                        transition={motionSafe ? springs.snap : { duration: 0 }}
                      />
                    ) : null}
                    <span className="relative">{LEVEL_NAME[lv]}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              aria-label="Zoom in"
              aria-disabled={
                levelIndex >= levels.length - 1 || disabled || undefined
              }
              onClick={() => zoomBy(1, "button", null)}
              className={stepButton}
            >
              <Plus aria-hidden className="size-3.5" />
            </button>
          </div>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Arrow keys move between cards. Plus and minus change the level of
        detail. Space picks a card up; arrows carry it, Space drops it, Escape
        puts it back. Enter opens a card.
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
            className="h-full [scrollbar-width:thin] overflow-x-auto overscroll-x-contain"
            style={{ touchAction: "pan-x pan-y" }}
          >
            <motion.div
              ref={innerRef}
              className="relative flex h-full w-max gap-2.5 p-3"
              style={{ scale: preview, transformOrigin: origin }}
            >
              <LayoutGroup id={uid}>{columns.map(column)}</LayoutGroup>
            </motion.div>
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
            "pointer-events-none absolute top-0 left-0 z-30 overflow-hidden",
            shown === "dots"
              ? ""
              : cardStyle === "edge"
                ? "border border-l-[3px] border-hairline bg-card"
                : "border border-hairline bg-card",
            shown === "dots"
              ? "size-3"
              : shown === "titles"
                ? "flex h-[26px] items-center px-2"
                : shown === "auto"
                  ? "flex h-[26px] items-center px-2 @min-[40rem]:block @min-[40rem]:h-auto @min-[40rem]:p-2.5"
                  : "p-2.5",
          )}
          style={{
            x: ox,
            y: oy,
            scale: liftScale,
            width: drag.width,
            borderRadius: RADIUS[shown === "auto" ? "titles" : shown],
            ...boxStyle(
              cardStyle,
              KIND[dragged.kind ?? "feature"].pigment,
              shown === "dots",
            ),
            boxShadow: `0 0 0 2px ${accent}, 0 14px 32px color-mix(in oklab, black 26%, transparent)`,
          }}
        >
          {shown === "titles" ? (
            <TitleRow card={dragged} />
          ) : shown === "cards" || shown === "detail" ? (
            <FullFace card={dragged} now={now} detail={shown === "detail"} />
          ) : shown === "auto" ? (
            <>
              <span className="block @min-[40rem]:hidden">
                <TitleRow card={dragged} />
              </span>
              <span className="hidden @min-[40rem]:block">
                <FullFace card={dragged} now={now} detail={false} />
              </span>
            </>
          ) : null}
        </motion.div>
      ) : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
