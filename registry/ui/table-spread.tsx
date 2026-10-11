"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type TableSpreadSuit = "spades" | "hearts" | "diamonds" | "clubs";

export type TableSpreadCard = {
  /** Stable id; picks are reported by it. */
  id: string;
  /** "A", "2"–"10", "J", "Q" or "K". */
  rank: string;
  suit: TableSpreadSuit;
};

export type TableSpreadFelt = "green" | "navy" | "claret" | "slate";

export type TableSpreadProps = {
  /** The deck, bottom card first: the bottom card stays where the sweep starts. @default defaultTableSpreadCards (15 cards) */
  cards?: TableSpreadCard[];
  /** How much of each card shows in the spread, as a fraction of its width; a narrow table tightens it to fit. @default 0.4 */
  spacing?: number;
  /** How fast the turnover wave runs along the spread, in cards per second. @default 22 */
  turnSpeed?: number;
  /** The cloth: a preset or any CSS colour. @default "green" */
  felt?: TableSpreadFelt | (string & {});
  /** The colour printed on the card backs, any CSS colour. @default a claret pigment */
  backColor?: string;
  /** Controlled: whether the deck lies spread across the table. */
  spread?: boolean;
  /** Initial spread state when uncontrolled. @default false */
  defaultSpread?: boolean;
  /** Fires from the sweep, tap or key that spread or gathered the deck. */
  onSpreadChange?: (spread: boolean) => void;
  /** Controlled: whether the spread lies face up. */
  faceUp?: boolean;
  /** Initial face when uncontrolled. @default false */
  defaultFaceUp?: boolean;
  /** Fires when a turnover wave has turned the whole spread. */
  onFaceUpChange?: (faceUp: boolean) => void;
  /** Controlled: the id of the card picked out of the line, or null. */
  picked?: string | null;
  /** Initial pick when uncontrolled. @default null */
  defaultPicked?: string | null;
  /** Fires from the tap or key that picked a card or put it back. */
  onPickedChange?: (id: string | null) => void;
  /** How far a hovered card's edge rises, px. @default 6 */
  lift?: number;
  /** Spread the deck by itself the first time it comes into view (silent). @default false */
  intro?: boolean;
  /** The table's accessible name. @default "Deck of cards" */
  label?: string;
  /** Paper sounds for the sweep, the wave and the pick. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  /** Size the table with a height class; the cards follow its height. @default "h-56" */
  className?: string;
};

const SUITS: TableSpreadSuit[] = ["spades", "hearts", "diamonds", "clubs"];

/** Fifteen cards, shuffled once by hand: the same deck on the server and in the browser. */
export const defaultTableSpreadCards: TableSpreadCard[] = [
  ["A", 0],
  ["7", 1],
  ["Q", 2],
  ["3", 3],
  ["K", 1],
  ["9", 0],
  ["5", 2],
  ["J", 3],
  ["2", 1],
  ["10", 0],
  ["8", 2],
  ["4", 3],
  ["6", 1],
  ["J", 0],
  ["Q", 1],
].map(([rank, s]) => ({
  id: `${rank}-${SUITS[s as number]}`,
  rank: rank as string,
  suit: SUITS[s as number] ?? "spades",
}));

/** Cloth pigments: the same in both themes, because the table is an object in the room. */
const FELTS: Record<TableSpreadFelt, string> = {
  green: "oklch(0.45 0.085 158)",
  navy: "oklch(0.38 0.07 255)",
  claret: "oklch(0.38 0.1 16)",
  slate: "oklch(0.41 0.014 250)",
};

const STOCK = "oklch(0.975 0.008 85)";
const INK_BLACK = "oklch(0.25 0.02 260)";
const INK_RED = "oklch(0.55 0.19 25)";

const RANK_NAMES: Record<string, string> = {
  A: "ace",
  K: "king",
  Q: "queen",
  J: "jack",
  "2": "two",
  "3": "three",
  "4": "four",
  "5": "five",
  "6": "six",
  "7": "seven",
  "8": "eight",
  "9": "nine",
  "10": "ten",
};

/** How many cards are in the air at once as the turnover wave passes. */
const WAVE = 2.4;
const PERSPECTIVE = 900;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Motion hands a combined transform its inputs untyped; these are all numbers. */
const read = (v: unknown[], i: number): number => Number(v[i] ?? 0);

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded offset in [-1, 1], so a laid spread is never ruler-straight. */
const jitter = (id: string, salt: number) =>
  ((hash(`${id}:${salt}`) % 2001) - 1000) / 1000;

const nameOf = (card: TableSpreadCard) =>
  `the ${RANK_NAMES[card.rank] ?? card.rank} of ${card.suit}`;

/** A card's spoken name, "the seven of hearts", for status lines. */
export const tableSpreadCardName = (card: TableSpreadCard): string =>
  nameOf(card);

const canSound = () => {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    userActivation?: { hasBeenActive: boolean };
  };
  return !nav.userActivation || nav.userActivation.hasBeenActive;
};

type Geometry = {
  w: number;
  h: number;
  cardW: number;
  cardH: number;
  /** Distance between two laid cards, px. */
  gap: number;
  /** The hand's offset when every card is laid. */
  full: number;
  /** Left edge of the line (and of the squared deck). */
  startX: number;
  /** Top edge of the line. */
  y0: number;
  /** How far a picked card comes out of the line. */
  drop: number;
};

function geometry(w: number, h: number, n: number, spacing: number): Geometry {
  const cardH = Math.round(clamp(h * 0.5, 40, 190));
  const cardW = Math.round(cardH * 0.7);
  const pad = Math.round(clamp(h * 0.07, 10, 22));
  const room = Math.max(0, w - 2 * pad - cardW);
  const gap =
    n > 1 ? r2(Math.min(clamp(spacing, 0.12, 0.9) * cardW, room / (n - 1))) : 0;
  const full = r2(gap * Math.max(0, n - 1));
  const startX = Math.round((w - (full + cardW)) / 2);
  const y0 = Math.round((h - cardH) * 0.4);
  const drop = Math.round(
    Math.max(0, Math.min(cardH * 0.34, h - (y0 + cardH) - 8)),
  );
  return { w, h, cardW, cardH, gap, full, startX, y0, drop };
}

/* ---------------------------------- art ---------------------------------- */

function Pip({
  suit,
  className,
  style,
}: {
  suit: TableSpreadSuit;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className={className} style={style}>
      {suit === "hearts" ? (
        <path
          fill="currentColor"
          d="M10 18.2C4.2 13.4 1.2 10.3 1.2 6.4 1.2 3.6 3.3 1.6 5.8 1.6c1.9 0 3.4 1.1 4.2 2.7.8-1.6 2.3-2.7 4.2-2.7 2.5 0 4.6 2 4.6 4.8 0 3.9-3 7-8.8 11.8Z"
        />
      ) : suit === "diamonds" ? (
        <path
          fill="currentColor"
          d="M10 1.2Q13.6 6.1 17.6 10 13.6 13.9 10 18.8 6.4 13.9 2.4 10 6.4 6.1 10 1.2Z"
        />
      ) : suit === "spades" ? (
        <path
          fill="currentColor"
          d="M10 1.4c6 5.4 8.9 8.1 8.9 11.3 0 2.5-1.9 4.2-4.1 4.2-1.5 0-2.8-.7-3.6-1.9l1.1 3.8H7.7l1.1-3.8c-.8 1.2-2.1 1.9-3.6 1.9-2.2 0-4.1-1.7-4.1-4.2C1.1 9.5 4 6.8 10 1.4Z"
        />
      ) : (
        <g fill="currentColor">
          <circle cx="10" cy="5.6" r="3.9" />
          <circle cx="5.3" cy="11.4" r="3.9" />
          <circle cx="14.7" cy="11.4" r="3.9" />
          <path d="M9 10.5h2l1.4 8.3H7.6Z" />
        </g>
      )}
    </svg>
  );
}

function CardFace({ card, g }: { card: TableSpreadCard; g: Geometry }) {
  const red = card.suit === "hearts" || card.suit === "diamonds";
  const court = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const index = Math.max(7, Math.round(g.cardW * 0.2));
  const corner = (
    <span
      className="flex flex-col items-center leading-none font-semibold tracking-tight"
      style={{ fontSize: index, gap: Math.round(index * 0.12) }}
    >
      <span>{card.rank}</span>
      <Pip
        suit={card.suit}
        className="block shrink-0"
        style={{
          width: Math.round(index * 0.78),
          height: Math.round(index * 0.78),
        }}
      />
    </span>
  );
  return (
    <span
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: STOCK,
        color: red ? INK_RED : INK_BLACK,
        borderRadius: Math.round(g.cardW * 0.07),
        boxShadow: "inset 0 0 0 1px oklch(0.2 0.02 260 / 0.14)",
      }}
    >
      <span
        className="absolute"
        style={{ left: Math.round(index * 0.32), top: Math.round(index * 0.3) }}
      >
        {corner}
      </span>
      <span
        className="absolute rotate-180"
        style={{
          right: Math.round(index * 0.32),
          bottom: Math.round(index * 0.3),
        }}
      >
        {corner}
      </span>
      {court ? (
        <span
          className="absolute flex items-center justify-center font-semibold"
          style={{
            inset: `${Math.round(g.cardH * 0.24)}px ${Math.round(g.cardW * 0.26)}px`,
            fontSize: Math.round(g.cardW * 0.36),
            boxShadow: "inset 0 0 0 1px currentColor",
            borderRadius: Math.round(g.cardW * 0.04),
          }}
        >
          {card.rank}
        </span>
      ) : (
        <Pip
          suit={card.suit}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: Math.round(g.cardW * 0.42),
            height: Math.round(g.cardW * 0.42),
          }}
        />
      )}
    </span>
  );
}

function CardBack({ g, color }: { g: Geometry; color: string }) {
  const border = Math.max(2, Math.round(g.cardW * 0.07));
  const cell = Math.max(4, Math.round(g.cardW * 0.09));
  return (
    <span
      className="absolute inset-0 overflow-hidden"
      style={{
        backgroundColor: STOCK,
        borderRadius: Math.round(g.cardW * 0.07),
        boxShadow: "inset 0 0 0 1px oklch(0.2 0.02 260 / 0.14)",
      }}
    >
      <span
        className="absolute"
        style={{
          inset: border,
          borderRadius: Math.round(g.cardW * 0.035),
          backgroundColor: color,
          // Two crossing hatches make the diamond lattice of a printed back.
          backgroundImage: `repeating-linear-gradient(45deg, oklch(1 0 0 / 0.2) 0 1px, transparent 1px ${cell}px), repeating-linear-gradient(-45deg, oklch(1 0 0 / 0.2) 0 1px, transparent 1px ${cell}px)`,
          boxShadow: `inset 0 0 0 ${Math.max(1, Math.round(border * 0.4))}px oklch(1 0 0 / 0.28)`,
        }}
      />
    </span>
  );
}

/* --------------------------------- a card -------------------------------- */

type CardViewProps = {
  card: TableSpreadCard;
  index: number;
  count: number;
  g: Geometry;
  hand: MotionValue<number>;
  lean: MotionValue<number>;
  picked: boolean;
  faceUp: boolean;
  laid: boolean;
  focusable: boolean;
  motionSafe: boolean;
  disabled: boolean;
  lift: number;
  backColor: string;
  register: (id: string, angle: MotionValue<number> | null) => void;
  bind: (id: string, node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onFocus: () => void;
  onActivate: () => void;
  canHover: () => boolean;
};

/**
 * One card. Where it lies comes from the shared hand: every card whose slot
 * the hand has passed is laid at its slot, the rest ride under the hand.
 * Its own springs are the turn (an angle the wave sets), the pick and the
 * hover, so one card can be lifted while the line keeps its place.
 */
function CardView({
  card,
  index,
  count,
  g,
  hand,
  lean,
  picked,
  faceUp,
  laid,
  focusable,
  motionSafe,
  disabled,
  lift,
  backColor,
  register,
  bind,
  onKeyDown,
  onFocus,
  onActivate,
  canHover,
}: CardViewProps) {
  const angle = useMotionValue(faceUp ? 180 : 0);
  const pick = useMotionValue(picked ? 1 : 0);
  const hover = useMotionValue(0);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());

  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };

  React.useEffect(() => {
    register(card.id, angle);
    return () => register(card.id, null);
  }, [angle, card.id, register]);

  // The pick follows the value: a host that refuses a pick never shows one.
  // StrictMode's re-run carries an interrupted pick on to rest.
  React.useEffect(() => {
    const target = picked ? 1 : 0;
    if (!motionSafe) {
      runs.current.get("pick")?.stop();
      pick.jump(target);
      return;
    }
    if (Math.abs(pick.get() - target) < 0.001) return;
    run("pick", animate(pick, target, picked ? springs.snap : springs.glide));
  }, [picked, motionSafe, pick]);

  React.useEffect(() => {
    const running = runs.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const jx = jitter(card.id, 1);
  const jy = jitter(card.id, 2);
  const jr = jitter(card.id, 3);
  const pickTurn = jitter(card.id, 4) * 5;
  const depth = count - 1 - index;

  const transform = useTransform(
    [hand, lean, angle, pick, hover] as MotionValue<number>[],
    (v) => {
      const hv = read(v, 0);
      const vel = read(v, 1);
      const av = read(v, 2);
      const pv = read(v, 3);
      const hov = read(v, 4);
      const slot = index * g.gap;
      // Past the end the whole line stretches a little instead of stopping dead.
      const x0 =
        hv > g.full && g.full > 0
          ? g.startX + slot * (hv / g.full)
          : g.startX + Math.min(slot, hv);
      // Under the hand the cards are still a squared deck with a visible edge.
      const behind = hv - slot;
      const stacked = clamp01(-behind / Math.max(1, g.gap));
      const edge = depth * 0.32 * stacked;
      // A card just let go keeps a touch of the hand's lean, straightening as
      // the hand moves on; at rest the lean is zero and every card lies square.
      const near = 1 - clamp01(behind / Math.max(1, g.gap * 3));
      const tilt = vel * -3.5 * near;
      const p = clamp(pv, -0.2, 1.3);
      const shown = av + (180 - av) * clamp01(p) + (p > 1 ? (p - 1) * 40 : 0);
      const turning = motionSafe
        ? Math.sin((clamp(av, 0, 180) * Math.PI) / 180)
        : 0;
      const up = turning * g.cardH * 0.07 + hov * lift;
      const x = x0 - edge + jx * 0.8 * (1 - stacked);
      const y = g.y0 + edge * 0.6 + jy * 1.2 + p * g.drop - up;
      const rz = jr * 0.8 * (1 - stacked) + tilt + p * pickTurn;
      const rx = motionSafe ? -11 * hov : 0;
      const ry = motionSafe ? shown : 0;
      const s = 1 + 0.05 * turning + 0.05 * clamp01(p);
      return `translate3d(${r2(x)}px, ${r2(y)}px, 0) perspective(${PERSPECTIVE}px) rotate(${r2(rz)}deg) rotateX(${r2(rx)}deg) rotateY(${r2(ry)}deg) scale(${r2(s)})`;
    },
  );

  const zIndex = useTransform([angle, pick] as MotionValue<number>[], (v) => {
    const av = read(v, 0);
    const pv = read(v, 1);
    return (
      index +
      1 +
      (pv > 0.01
        ? count * 3
        : Math.sin((av * Math.PI) / 180) > 0.04
          ? count
          : 0)
    );
  });

  // The face shown: under reduced motion the card never turns, it swaps
  // faces with a short cross-fade instead.
  const frontOpacity = useTransform(
    [angle, pick] as MotionValue<number>[],
    (v) => {
      const av = read(v, 0);
      const pv = read(v, 1);
      if (motionSafe) return 1;
      return av + (180 - av) * clamp01(pv) > 90 ? 1 : 0;
    },
  );
  const backOpacity = useTransform(frontOpacity, (o) =>
    motionSafe ? 1 : 1 - o,
  );

  const shadow = useTransform(
    [hand, angle, pick, hover] as MotionValue<number>[],
    (v) => {
      const hv = read(v, 0);
      const av = read(v, 1);
      const pv = read(v, 2);
      const hov = read(v, 3);
      const slot = index * g.gap;
      const x0 =
        hv > g.full && g.full > 0
          ? g.startX + slot * (hv / g.full)
          : g.startX + Math.min(slot, hv);
      const turning = motionSafe
        ? Math.sin((clamp(av, 0, 180) * Math.PI) / 180)
        : 0;
      const p = clamp01(pv);
      const up = Math.max(turning, p * 0.7, hov * 0.6);
      // A card on its edge throws a thin shadow: the shadow narrows with
      // the turn the way the card's footprint does.
      const shown = av + (180 - av) * p;
      const wide = motionSafe
        ? Math.max(0.1, Math.abs(Math.cos((shown * Math.PI) / 180)))
        : 1;
      return `translate3d(${r2(x0 + 2 + up * 6)}px, ${r2(g.y0 + 3 + p * g.drop + up * 10)}px, 0) scale(${r2(wide * (1 + up * 0.04))}, ${r2(1 + up * 0.04)})`;
    },
  );
  const shadowOpacity = useTransform(
    [hand, angle, pick, hover] as MotionValue<number>[],
    (v) => {
      const hv = read(v, 0);
      const av = read(v, 1);
      const pv = read(v, 2);
      const hov = read(v, 3);
      const turning = motionSafe
        ? Math.sin((clamp(av, 0, 180) * Math.PI) / 180)
        : 0;
      // In the squared deck only the bottom card throws a shadow; the rest
      // would darken the deck's paper edge.
      const stacked = clamp01((index * g.gap - hv) / Math.max(1, g.gap));
      const base = index === 0 ? 0.32 : 0.3 * (1 - stacked * 0.9);
      return r2(base + 0.45 * Math.max(turning, clamp01(pv), hov * 0.7));
    },
  );

  const shownFace = faceUp || picked;
  const name = shownFace
    ? nameOf(card)
        .replace(/^the /, "")
        .replace(/^./, (c) => c.toUpperCase())
    : `Card ${index + 1} of ${count}, face down`;

  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 will-change-transform"
        style={{
          width: g.cardW,
          height: g.cardH,
          borderRadius: Math.round(g.cardW * 0.07),
          transform: shadow,
          opacity: shadowOpacity,
          zIndex,
          // A filled blob with a soft rim: an outer shadow alone on an empty
          // box would leave a hard hole where the box is.
          backgroundColor: "oklch(0.14 0.03 160 / 0.42)",
          boxShadow: "0 0 12px 3px oklch(0.14 0.03 160 / 0.42)",
        }}
      />
      <motion.button
        ref={(node) => bind(card.id, node)}
        type="button"
        data-card-index={index}
        aria-label={name}
        aria-pressed={laid ? picked : undefined}
        inert={!laid}
        tabIndex={laid && focusable ? 0 : -1}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onClick={(event) => {
          // Pointer taps arrive through the table's drag; a click with no
          // pointer behind it (Enter, Space, assistive tech) picks here.
          if (event.detail === 0) onActivate();
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || !canHover()) return;
          run(
            "hover",
            animate(hover, 1, motionSafe ? springs.flick : { duration: 0 }),
          );
        }}
        onPointerLeave={() => {
          if (hover.get() === 0) return;
          run(
            "hover",
            animate(hover, 0, motionSafe ? springs.glide : { duration: 0 }),
          );
        }}
        className={cn(
          "absolute top-0 left-0 block cursor-pointer will-change-transform outline-none [transform-style:preserve-3d]",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled && "cursor-not-allowed",
          !laid && "pointer-events-none",
        )}
        style={{
          width: g.cardW,
          height: g.cardH,
          borderRadius: Math.round(g.cardW * 0.07),
          transform,
          zIndex,
        }}
      >
        <motion.span
          className="absolute inset-0 block transition-opacity duration-150 [backface-visibility:hidden]"
          style={{ opacity: backOpacity }}
        >
          <CardBack g={g} color={backColor} />
        </motion.span>
        <motion.span
          className="absolute inset-0 block transition-opacity duration-150 [backface-visibility:hidden]"
          style={{
            opacity: frontOpacity,
            transform: motionSafe ? "rotateY(180deg)" : "none",
          }}
        >
          <CardFace card={card} g={g} />
        </motion.span>
      </motion.button>
    </>
  );
}

/* -------------------------------- the table ------------------------------- */

type DragMode = "sweep" | "wave" | null;

/**
 * A deck squared on a felt table. Drag it to the right and it sweeps out into
 * a long, even line: the hand carries the top of the deck, and every card the
 * hand passes is left behind at its slot, so the spread fans out from under
 * the finger; dragging back gathers it. A release commits by projection on
 * the glide spring with the hand's own velocity. Flick the first card to the
 * right and the whole spread turns over in a cascading wave — the front runs
 * under the finger, then on at `turnSpeed` — each card lifting, turning about
 * its long edge and landing in turn. Hovering a card raises its edge; a tap
 * picks it out of the line and flips it face up on the snap spring.
 *
 * The cards are real buttons in a roving tabindex: arrows and Home/End move,
 * Enter or Space picks, T turns the spread over and Escape gathers it; a
 * face-down card is never named by its rank. Under reduced motion nothing
 * travels or turns: the line appears laid, faces swap with a short
 * cross-fade, and a pick steps out of the line at once.
 */
export function TableSpread({
  cards = defaultTableSpreadCards,
  spacing = 0.4,
  turnSpeed = 22,
  felt = "green",
  backColor = "oklch(0.5 0.16 24)",
  spread,
  defaultSpread = false,
  onSpreadChange,
  faceUp,
  defaultFaceUp = false,
  onFaceUpChange,
  picked,
  defaultPicked = null,
  onPickedChange,
  lift = 6,
  intro = false,
  label = "Deck of cards",
  sound = false,
  disabled = false,
  className,
}: TableSpreadProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const filterId = `ts-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}-felt`;
  const n = cards.length;

  const [ownSpread, setOwnSpread] = React.useState(defaultSpread);
  const [ownFace, setOwnFace] = React.useState(defaultFaceUp);
  const [ownPick, setOwnPick] = React.useState<string | null>(defaultPicked);
  const isSpread = spread ?? ownSpread;
  const isFaceUp = faceUp ?? ownFace;
  const pickedId = picked === undefined ? ownPick : picked;

  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);
  const g = geometry(box?.w ?? 640, box?.h ?? 224, n, spacing);
  const [active, setActive] = React.useState(0);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const hand = useMotionValue(isSpread ? g.full : 0);
  /** The hand's speed as a lean, -1 to 1: set while it moves, sprung to 0 when it stops. */
  const lean = useMotionValue(0);
  const leanRun = React.useRef<AnimationPlaybackControls | null>(null);
  const front = useMotionValue(-WAVE);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const deckRef = React.useRef<HTMLButtonElement | null>(null);
  const nodes = React.useRef(new Map<string, HTMLButtonElement>());
  const angles = React.useRef(new Map<string, MotionValue<number>>());
  const handRun = React.useRef<AnimationPlaybackControls | null>(null);
  const frontRun = React.useRef<AnimationPlaybackControls | null>(null);
  const mode = React.useRef<DragMode>(null);
  const grab = React.useRef(0);
  const pressed = React.useRef(-1);
  const wave = React.useRef<{
    from: number;
    to: number;
    landed: number;
    /** A wave the visitor made reports and announces; a host's does not. */
    report: boolean;
  } | null>(null);
  const shownSpread = React.useRef(isSpread);
  const shownFace = React.useRef(isFaceUp);
  const focusNext = React.useRef<"first" | "deck" | null>(null);
  const laidCount = React.useRef(0);
  const geo = React.useRef(g);
  const latest = React.useRef({ cards, turnSpeed, motionSafe, n });
  const fade = useMotionValue(1);
  const fadeRun = React.useRef<AnimationPlaybackControls | null>(null);
  const playRef = React.useRef<
    (gain: number, pitch: number, x?: number) => void
  >(() => {});

  const register = React.useCallback(
    (id: string, mv: MotionValue<number> | null) => {
      if (mv) angles.current.set(id, mv);
      else angles.current.delete(id);
    },
    [],
  );
  const bind = React.useCallback(
    (id: string, node: HTMLButtonElement | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    [],
  );

  const play = (gain: number, pitch: number, x?: number) => {
    if (!canSound()) return;
    const root = rootRef.current;
    audio.play("paper", {
      gain,
      pitch,
      pan:
        root && x !== undefined
          ? panFrom(root.getBoundingClientRect().left + x, root)
          : 0,
    });
  };

  React.useEffect(() => {
    geo.current = g;
    latest.current = { cards, turnSpeed, motionSafe, n };
    playRef.current = play;
  });

  /* -------------------------------- the hand ------------------------------- */

  const moveHand = React.useCallback(
    (to: boolean, velocity = 0) => {
      handRun.current?.stop();
      const target = to ? geo.current.full : 0;
      if (!latest.current.motionSafe) {
        // Nothing travels: the cards are simply there, faded in.
        hand.jump(target);
        fadeRun.current?.stop();
        fade.jump(0.15);
        fadeRun.current = animate(fade, 1, {
          duration: durations.fast,
          ease: easings.enter,
        });
        return;
      }
      leanRun.current?.stop();
      handRun.current = animate(hand, target, {
        ...springs.glide,
        velocity,
        onUpdate: () => lean.set(r2(clamp(hand.getVelocity() / 1600, -1, 1))),
        onComplete: () => {
          leanRun.current = animate(lean, 0, springs.glide);
        },
      });
    },
    [hand, fade, lean],
  );

  const commitSpread = (next: boolean, velocity = 0, quiet = false) => {
    shownSpread.current = next;
    moveHand(next, velocity);
    if (next !== isSpread) {
      if (spread === undefined) setOwnSpread(next);
      onSpreadChange?.(next);
      if (!quiet)
        say(next ? `Spread out, ${n} cards.` : "Gathered into the deck.");
    }
    if (!next && pickedId !== null) setPick(null, true);
  };

  /* -------------------------------- the wave ------------------------------- */

  // The wave sets each card's angle from the front: a card starts to turn as
  // the front reaches it and lands WAVE cards later, eased at both ends.
  React.useEffect(
    () =>
      front.on("change", (v) => {
        const w = wave.current;
        if (!w) return;
        const list = latest.current.cards;
        let landed = 0;
        list.forEach((card, i) => {
          const mv = angles.current.get(card.id);
          const p = clamp01((v - i) / WAVE);
          if (p >= 1) landed += 1;
          if (mv) mv.set(r2(w.from + (w.to - w.from) * smooth(p)));
        });
        // Under the finger each card is heard as it lands; a running wave
        // is heard from its own update.
        if (landed > w.landed && mode.current === "wave") {
          const g0 = geo.current;
          playRef.current(
            0.2,
            1.05 + (landed % 3) * 0.08,
            g0.startX + (landed - 1) * g0.gap,
          );
        }
        w.landed = landed;
      }),
    [front],
  );

  const setAngles = (deg: number) => {
    for (const mv of angles.current.values()) mv.jump(deg);
  };

  const finishWave = (committed: boolean) => {
    const w = wave.current;
    wave.current = null;
    if (!w) return;
    if (!committed) {
      setAngles(w.from);
      return;
    }
    setAngles(w.to);
    const next = w.to > 90;
    shownFace.current = next;
    if (!w.report) return;
    if (faceUp === undefined) setOwnFace(next);
    onFaceUpChange?.(next);
    say(next ? "Turned face up." : "Turned face down.");
  };

  const runWave = (forward: boolean, heard: boolean) => {
    frontRun.current?.stop();
    const w = wave.current;
    if (!w) return;
    const { n: count, turnSpeed: speed, motionSafe: safeNow } = latest.current;
    const end = forward ? count + WAVE : -WAVE;
    if (!safeNow) {
      front.jump(end);
      finishWave(forward);
      return;
    }
    const from = front.get();
    const duration = Math.max(0.05, Math.abs(end - from) / clamp(speed, 2, 80));
    let ticks = Math.max(0, Math.floor(from - WAVE + 1));
    frontRun.current = animate(front, end, {
      duration,
      ease: "linear",
      onUpdate: (v) => {
        if (!heard || !forward) return;
        const landed = Math.floor(v - WAVE + 1);
        if (landed > ticks && landed <= count) {
          ticks = landed;
          const x = geo.current.startX + (landed - 1) * geo.current.gap;
          playRef.current(0.22, 1.05 + (landed % 3) * 0.08, x);
        }
      },
      onComplete: () => finishWave(forward),
    });
  };

  const turnOver = (heard: boolean) => {
    if (disabled || !shownSpread.current) return;
    if (!wave.current) {
      const from = shownFace.current ? 180 : 0;
      wave.current = { from, to: 180 - from, landed: 0, report: true };
      front.jump(-WAVE);
    }
    wave.current.report = true;
    runWave(true, heard);
  };

  // A host that changes the face gets the same wave a flick would; a host
  // that refused a turn gets the spread turned back.
  React.useEffect(() => {
    if (mode.current || wave.current) return;
    if (shownFace.current === isFaceUp) return;
    if (!shownSpread.current) {
      shownFace.current = isFaceUp;
      setAngles(isFaceUp ? 180 : 0);
      return;
    }
    const from = shownFace.current ? 180 : 0;
    wave.current = { from, to: 180 - from, landed: 0, report: false };
    front.jump(-WAVE);
    runWave(true, false);
  });

  // Likewise for the spread itself.
  React.useEffect(() => {
    if (mode.current) return;
    if (shownSpread.current === isSpread) return;
    shownSpread.current = isSpread;
    moveHand(isSpread);
  });

  /* -------------------------------- the pick ------------------------------- */

  const setPick = (id: string | null, quiet = false) => {
    if (id === pickedId) return;
    if (picked === undefined) setOwnPick(id);
    onPickedChange?.(id);
    if (quiet) return;
    const card = cards.find((c) => c.id === id);
    say(card ? `Picked ${nameOf(card)}.` : "Put back.");
  };

  const togglePick = (index: number, heard: boolean) => {
    const card = cards[index];
    if (!card || disabled || !shownSpread.current) return;
    const next = pickedId === card.id ? null : card.id;
    if (heard) {
      play(
        0.42,
        next ? 1.2 : 0.95,
        geo.current.startX + index * geo.current.gap,
      );
    }
    setPick(next);
  };

  /* ------------------------------ geometry sync ---------------------------- */

  // A new size or a new deck moves the rest positions; the hand goes straight
  // there unless a gesture or a spring is carrying it.
  const full = g.full;
  React.useEffect(() => {
    if (mode.current) return;
    if (hand.isAnimating()) moveHand(shownSpread.current);
    else hand.jump(shownSpread.current ? full : 0);
  }, [full, hand, moveHand]);

  React.useEffect(
    () => () => {
      handRun.current?.stop();
      frontRun.current?.stop();
      leanRun.current?.stop();
      fadeRun.current?.stop();
    },
    [],
  );

  // Size, and the intro, bound to the node when it arrives.
  const introRef = React.useRef({ intro, done: false });
  React.useEffect(() => {
    introRef.current.intro = intro;
  });
  const startIntro = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    startIntro.current = () => {
      if (shownSpread.current || disabled) return;
      commitSpread(true, 0, true);
    };
  });
  const bindTable = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
    });
    sizer.observe(node);
    let timer = 0;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      const s = introRef.current;
      if (!entry?.isIntersecting || !s.intro || s.done) return;
      s.done = true;
      timer = window.setTimeout(() => startIntro.current(), 420);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // Focus follows a keyboard spread to the first card, and a gather back to
  // the deck, once the node it goes to is there.
  React.useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    if (target === "deck") {
      if (isSpread || !deckRef.current) return;
      focusNext.current = null;
      deckRef.current.focus();
      return;
    }
    if (!isSpread) return;
    const first = cards[0];
    const node = first ? nodes.current.get(first.id) : null;
    if (!node) return;
    focusNext.current = null;
    setActive(0);
    node.focus();
  }, [isSpread, cards]);

  /* ------------------------------- gestures -------------------------------- */

  const drag = useDrag({
    axis: "x",
    threshold: 4,
    disabled,
    onStart: () => {
      // The card that was pressed, not the one the pointer has reached by
      // the time the press became a drag.
      const index = pressed.current;
      const g0 = geo.current;
      // The first card of a laid spread, pulled toward the rest of it, is
      // the turnover; anything else is the hand on the deck.
      if (shownSpread.current && index === 0 && hand.get() >= g0.full - 1) {
        mode.current = "wave";
        frontRun.current?.stop();
        if (wave.current) {
          // A running wave caught by the finger carries on from where it is.
          grab.current = front.get();
        } else {
          const from = shownFace.current ? 180 : 0;
          wave.current = { from, to: 180 - from, landed: 0, report: true };
          front.jump(0);
          grab.current = 0;
        }
        wave.current.report = true;
        if (canSound()) play(0.3, 1.25, g0.startX);
        return;
      }
      mode.current = "sweep";
      handRun.current?.stop();
      grab.current = hand.get();
      laidCount.current = Math.floor(hand.get() / Math.max(1, g0.gap));
      if (canSound()) play(0.36, 0.9, g0.startX + hand.get());
    },
    onMove: ({ offset }) => {
      const g0 = geo.current;
      if (mode.current === "wave") {
        // The front runs with the finger, one card per gap travelled.
        const raw = grab.current + offset.x / Math.max(1, g0.gap);
        const max = latest.current.n + WAVE;
        front.set(r2(rubberClamp(raw, -WAVE, max, WAVE)));
        return;
      }
      if (mode.current !== "sweep") return;
      const raw = grab.current + offset.x;
      leanRun.current?.stop();
      lean.set(r2(clamp(hand.getVelocity() / 1600, -1, 1)));
      const x = rubberClamp(raw, 0, g0.full, Math.max(g0.cardW, g0.full * 0.4));
      hand.set(r2(x));
      const laid = Math.floor(clamp(x, 0, g0.full) / Math.max(1, g0.gap));
      if (laid !== laidCount.current) {
        // A soft crinkle for every other card the hand leaves behind.
        if (laid > laidCount.current && laid % 2 === 0) {
          play(0.18, 1.1 + (laid % 4) * 0.05, g0.startX + x);
        }
        laidCount.current = laid;
      }
    },
    onEnd: ({ velocity }) => {
      const g0 = geo.current;
      const was = mode.current;
      mode.current = null;
      if (was === "wave") {
        const v = velocity.x / Math.max(1, g0.gap);
        // The wave carries itself once started: a light, coasting surface.
        const landing = project(front.get(), v, 0.998);
        // Like a real spread, once the first few cards are over the rest
        // follow by themselves: the wave commits early.
        runWave(landing > Math.min(latest.current.n / 2, 4), true);
        return;
      }
      if (was !== "sweep") return;
      const landing = project(hand.get(), velocity.x, 0.995);
      const next = g0.full > 0 && landing > g0.full / 2;
      commitSpread(next, velocity.x);
    },
    onCancel: () => {
      leanRun.current = animate(lean, 0, springs.glide);
      const was = mode.current;
      mode.current = null;
      if (was === "wave") runWave(false, false);
      else if (was === "sweep") moveHand(shownSpread.current);
    },
    onTap: () => {
      if (!shownSpread.current) {
        if (canSound()) play(0.4, 1, geo.current.startX);
        commitSpread(true);
        return;
      }
      const index = pressed.current;
      if (index < 0) return;
      setActive(index);
      togglePick(index, true);
    },
  });

  /* -------------------------------- keyboard ------------------------------- */

  const onCardKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (disabled) return;
    const focusAt = (i: number) => {
      const j = clamp(i, 0, n - 1);
      const card = cards[j];
      if (!card) return;
      setActive(j);
      nodes.current.get(card.id)?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusAt(0);
        break;
      case "End":
        event.preventDefault();
        focusAt(n - 1);
        break;
      case "t":
      case "T":
        event.preventDefault();
        if (event.repeat) return;
        if (canSound()) play(0.3, 1.25, geo.current.startX);
        turnOver(true);
        break;
      case "Escape":
        // Handled here, so the stage around us never closes on it.
        event.preventDefault();
        if (canSound()) play(0.36, 0.85, geo.current.startX);
        focusNext.current = "deck";
        commitSpread(false);
        break;
      default:
        break;
    }
  };

  const spreadByKey = () => {
    if (disabled || shownSpread.current) return;
    if (canSound()) play(0.4, 1, geo.current.startX);
    focusNext.current = "first";
    commitSpread(true);
  };

  /* --------------------------------- render -------------------------------- */

  const measured = box !== null;
  const cloth = felt in FELTS ? FELTS[felt as TableSpreadFelt] : felt;
  const guide = {
    left: g.startX - 8,
    top: g.y0 - 8,
    width: g.full + g.cardW + 16,
    height: g.cardH + 16,
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      aria-describedby={hintId}
      className={cn(
        "relative h-56 w-full",
        disabled && "opacity-60",
        className,
      )}
    >
      <div
        ref={bindTable}
        {...drag}
        onPointerDown={(event) => {
          const target = event.target instanceof Element ? event.target : null;
          const at = target?.closest("[data-card-index]");
          pressed.current = at
            ? Number(at.getAttribute("data-card-index"))
            : -1;
          drag.onPointerDown(event);
        }}
        className={cn(
          "absolute inset-0 touch-pan-y overflow-clip rounded-4 [contain:paint] select-none",
          disabled
            ? "cursor-not-allowed"
            : isSpread
              ? "cursor-default"
              : "cursor-grab",
        )}
        style={{
          backgroundColor: cloth,
          boxShadow:
            "inset 0 0 0 1px oklch(1 0 0 / 0.07), inset 0 14px 40px oklch(0 0 0 / 0.32), inset 0 -10px 30px oklch(0 0 0 / 0.2)",
        }}
      >
        {/* The cloth's fibre, painted once. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-30 mix-blend-soft-light"
        >
          <filter id={filterId} x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves={2}
              seed={4}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter={`url(#${filterId})`} />
        </svg>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 90% at 50% 38%, oklch(1 0 0 / 0.07), transparent 60%, oklch(0 0 0 / 0.28) 100%)",
          }}
        />
        {/* The printed line the spread is laid along. */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute border border-dashed border-[oklch(1_0_0/0.16)] transition-opacity duration-300",
            measured ? "opacity-100" : "opacity-0",
          )}
          style={{ ...guide, borderRadius: Math.round(g.cardW * 0.14) }}
        />

        <motion.div
          className={cn(
            "absolute inset-0 transition-opacity",
            measured ? "duration-200" : "!opacity-0 duration-0",
          )}
          style={{ opacity: fade }}
        >
          {cards.map((card, i) => (
            <CardView
              key={card.id}
              card={card}
              index={i}
              count={n}
              g={g}
              hand={hand}
              lean={lean}
              picked={pickedId === card.id}
              faceUp={isFaceUp}
              laid={isSpread}
              focusable={active === i}
              motionSafe={motionSafe}
              disabled={disabled}
              lift={motionSafe ? lift : 0}
              backColor={backColor}
              register={register}
              bind={bind}
              onKeyDown={(event) => onCardKey(event, i)}
              onFocus={() => setActive(i)}
              onActivate={() => togglePick(i, true)}
              canHover={() => !mode.current && shownSpread.current && !disabled}
            />
          ))}
        </motion.div>

        {!isSpread ? (
          <button
            ref={deckRef}
            type="button"
            aria-label={`Spread the deck, ${n} ${n === 1 ? "card" : "cards"}`}
            disabled={disabled}
            onClick={(event) => {
              if (event.detail === 0) spreadByKey();
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                spreadByKey();
              }
            }}
            className={cn(
              "absolute z-[100] outline-none",
              "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring focus-visible:outline-solid",
              disabled ? "cursor-not-allowed" : "cursor-grab",
            )}
            style={{
              left: g.startX - 6,
              top: g.y0 - 4,
              width: g.cardW + 10,
              height: g.cardH + 10,
              borderRadius: Math.round(g.cardW * 0.1),
            }}
          />
        ) : null}
      </div>

      <p id={hintId} className="sr-only">
        Drag the deck to the right to spread it, or press Enter. In the spread,
        arrow keys move between cards, Enter picks a card, T turns the whole
        spread over and Escape gathers the deck. Flick the first card to the
        right to turn the spread over.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
