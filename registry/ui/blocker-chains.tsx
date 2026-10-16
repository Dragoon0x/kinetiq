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
import {
  Check,
  GripVertical,
  Link2,
  Lock,
  LockOpen,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type BlockerColumn = {
  id: string;
  title: string;
  /** Work that reaches this column is finished: the chains it held snap loose. */
  done?: boolean;
};

export type BlockerCard = {
  /** Also the key printed on the card, e.g. "FLD-205". */
  id: string;
  title: string;
  /** The id of the column the card sits in. Array order is column order. */
  column: string;
  /** Ids of the cards this one waits on. */
  blockedBy?: string[];
  /** Initials of whoever has the card. */
  assignee?: string;
  /** When the card became blocked, in ms since the epoch; read against `now`. */
  since?: number;
};

export type BlockerMove = {
  cardId: string;
  from: string;
  to: string;
  /** Position in the target column, counted without the moved card. */
  index: number;
};

export type BlockerUnlinkReason = "done" | "removed";

export type BlockerChange =
  | { type: "move"; move: BlockerMove }
  | { type: "link"; blocked: string; blocker: string; circular: boolean }
  | {
      type: "unlink";
      blocked: string;
      blocker: string;
      reason: BlockerUnlinkReason;
    };

export type BlockerChainStyle = "links" | "thread" | "beads";
export type BlockerCardStyle = "raised" | "flat" | "outline";
export type BlockerChainsStatus = "ready" | "loading" | "error";

export type BlockerChainsProps = {
  /** The board's columns, left to right; a `done` column finishes work. @default defaultBlockerColumns */
  columns?: BlockerColumn[];
  /** Controlled cards, in column order. */
  cards?: BlockerCard[];
  /** Initial cards when uncontrolled. @default defaultBlockerCards (the Fieldline 4.2 release) */
  defaultCards?: BlockerCard[];
  /** Fires with the whole board after a move, a link or an unlink, and what changed. */
  onCardsChange?: (cards: BlockerCard[], change: BlockerChange) => void;
  /** Fires from the drop (pointer or keyboard) that moved a card. */
  onMove?: (move: BlockerMove) => void;
  /** Fires when a blocker is linked; `circular` says the new chain closes a loop. */
  onLink?: (
    blockedId: string,
    blockerId: string,
    info: { circular: boolean },
  ) => void;
  /** Fires when a chain comes off: its blocker reached a done column, or it was removed. */
  onUnlink?: (
    blockedId: string,
    blockerId: string,
    reason: BlockerUnlinkReason,
  ) => void;
  /** Controlled: every chain in full rather than only the hovered or focused card's. */
  showAll?: boolean;
  /** Initial show-all state when uncontrolled. @default false */
  defaultShowAll?: boolean;
  /** Fires from the switch or the B key that changed show-all. */
  onShowAllChange?: (showAll: boolean) => void;
  /** How a chain is drawn: hollow interlocking links, one fine thread, or beads. @default "links" */
  chainStyle?: BlockerChainStyle;
  /** Card surface: raised with a shadow, a flat tint, or an outline on the board colour. @default "raised" */
  cardStyle?: BlockerCardStyle;
  /** Highlighted chains, shackles, the drop wash and link mode. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** The moment "blocked for 3d" is read against, in ms. Never the wall clock. @default Date.UTC(2026, 9, 16, 9) */
  now?: number;
  /** The board's heading. @default "Fieldline 4.2" */
  title?: string;
  /** One line under the heading. @default "Release board" */
  subtitle?: string;
  /** Whether the board has loaded. @default "ready" */
  status?: BlockerChainsStatus;
  /** Try again was pressed after the board failed to load. */
  onReload?: () => void;
  /** Read-only: nothing moves or links. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const DAY = 86_400_000;
const DEFAULT_NOW = Date.UTC(2026, 9, 16, 9);

export const defaultBlockerColumns: BlockerColumn[] = [
  { id: "next", title: "Up next" },
  { id: "doing", title: "In progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done", done: true },
];

export const defaultBlockerCards: BlockerCard[] = [
  {
    id: "FLD-214",
    title: "Offline map tiles",
    column: "next",
    blockedBy: ["FLD-207"],
    assignee: "RM",
    since: DEFAULT_NOW - 2 * DAY,
  },
  {
    id: "FLD-216",
    title: "Rename tenant ids",
    column: "next",
    blockedBy: ["FLD-217"],
    assignee: "JO",
    since: DEFAULT_NOW - DAY,
  },
  {
    id: "FLD-217",
    title: "Backfill audit log",
    column: "next",
    blockedBy: ["FLD-216"],
    assignee: "PK",
    since: DEFAULT_NOW - DAY,
  },
  {
    id: "FLD-207",
    title: "Storage layer v2",
    column: "doing",
    blockedBy: ["FLD-205"],
    assignee: "AK",
    since: DEFAULT_NOW - 3 * DAY,
  },
  {
    id: "FLD-209",
    title: "Crew roster sync",
    column: "doing",
    blockedBy: ["FLD-205"],
    assignee: "SV",
    since: DEFAULT_NOW - 4 * DAY,
  },
  {
    id: "FLD-211",
    title: "Push token refresh",
    column: "doing",
    assignee: "LT",
  },
  {
    id: "FLD-205",
    title: "Schema migration 31",
    column: "review",
    assignee: "DN",
  },
  {
    id: "FLD-203",
    title: "Sign-in rate limits",
    column: "review",
    assignee: "JO",
  },
  { id: "FLD-201", title: "Crash on resume", column: "done", assignee: "RM" },
  {
    id: "FLD-202",
    title: "Upgrade build tools",
    column: "done",
    assignee: "AK",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const CARD_STYLE: Record<BlockerCardStyle, string> = {
  raised:
    "border border-hairline bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_7%,transparent)] hover:shadow-[0_4px_14px_color-mix(in_oklab,black_10%,transparent)]",
  flat: "border border-transparent bg-surface-2 hover:border-hairline",
  outline:
    "border border-hairline-strong bg-surface-0 hover:border-[color-mix(in_oklab,var(--bc-accent)_45%,var(--hairline-strong))]",
};

type Place = { column: string; index: number };

type Link = {
  key: string;
  blocked: string;
  blocker: string;
  loop: boolean;
};

const linkKey = (blocked: string, blocker: string) => `${blocked}>${blocker}`;
const cleanId = (v: string) => v.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Moves a card to `index` among the other cards of `column`. */
function moveCard(
  list: BlockerCard[],
  id: string,
  column: string,
  index: number,
): BlockerCard[] {
  const card = list.find((c) => c.id === id);
  if (!card) return list;
  const rest = list.filter((c) => c.id !== id);
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
  return [...rest.slice(0, at), { ...card, column }, ...rest.slice(at)];
}

function placeOf(list: BlockerCard[], id: string): Place | null {
  const card = list.find((c) => c.id === id);
  if (!card) return null;
  const index = list
    .filter((c) => c.column === card.column)
    .findIndex((c) => c.id === id);
  return { column: card.column, index };
}

/**
 * Links that still hold: both cards exist and neither has reached a done
 * column. Cards that sit in one strongly connected group wait on each other,
 * so every link inside such a group is part of a loop.
 */
function liveLinks(list: BlockerCard[], done: Set<string>): Link[] {
  const byId = new Map(list.map((c) => [c.id, c]));
  const raw: { blocked: string; blocker: string }[] = [];
  for (const card of list) {
    if (done.has(card.column)) continue;
    for (const b of card.blockedBy ?? []) {
      const blocker = byId.get(b);
      if (!blocker || done.has(blocker.column) || b === card.id) continue;
      raw.push({ blocked: card.id, blocker: b });
    }
  }
  const adj = new Map<string, string[]>();
  for (const l of raw) {
    const out = adj.get(l.blocked);
    if (out) out.push(l.blocker);
    else adj.set(l.blocked, [l.blocker]);
  }
  // Tarjan's strongly connected components; the boards are small.
  let counter = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const group = new Map<string, number>();
  let groups = 0;
  const visit = (v: string) => {
    index.set(v, counter);
    low.set(v, counter);
    counter += 1;
    stack.push(v);
    onStack.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v) ?? 0, low.get(w) ?? 0));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v) ?? 0, index.get(w) ?? 0));
      }
    }
    if (low.get(v) === index.get(v)) {
      let w: string | undefined;
      do {
        w = stack.pop();
        if (w === undefined) break;
        onStack.delete(w);
        group.set(w, groups);
      } while (w !== v);
      groups += 1;
    }
  };
  for (const v of adj.keys()) if (!index.has(v)) visit(v);
  return raw.map((l) => ({
    key: linkKey(l.blocked, l.blocker),
    blocked: l.blocked,
    blocker: l.blocker,
    loop:
      group.get(l.blocked) !== undefined &&
      group.get(l.blocked) === group.get(l.blocker),
  }));
}

/**
 * How many unfinished cards wait on something, and how many loops the live
 * links form. Exported so a host can print the same counts the board shows.
 */
export function summarizeBlockers(
  cards: BlockerCard[],
  columns: BlockerColumn[] = defaultBlockerColumns,
): { blocked: number; loops: number } {
  const done = new Set(columns.filter((c) => c.done).map((c) => c.id));
  const links = liveLinks(cards, done);
  const blocked = new Set(links.map((l) => l.blocked)).size;
  return { blocked, loops: countLoops(links) };
}

/** Loops counted once each: the cards of one loop are walked together. */
function countLoops(links: Link[]): number {
  const seen = new Set<string>();
  let n = 0;
  for (const l of links) {
    if (!l.loop || seen.has(l.blocked)) continue;
    n += 1;
    const stack = [l.blocked];
    while (stack.length) {
      const v = stack.pop();
      if (v === undefined || seen.has(v)) continue;
      seen.add(v);
      for (const m of links) {
        if (!m.loop) continue;
        if (m.blocked === v) stack.push(m.blocker);
        if (m.blocker === v) stack.push(m.blocked);
      }
    }
  }
  return n;
}

/** Layout position inside `root`, ignoring transforms (FLIP needs the destination, not the frame). */
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

/** Slack a resting chain carries, so it hangs a little and never looks strung tight. */
const slackFor = (d: number) => 4 + d * 0.015;

type Curve = {
  ax: number;
  ay: number;
  cx: number;
  cy: number;
  bx: number;
  by: number;
};

/**
 * A hanging chain between two points: a quadratic whose sag comes from the
 * chain's length. For a shallow parabola the arc exceeds the chord by
 * 8s²/3d, so a chain of length L over a chord d sags s = √(3d(L−d)/8);
 * the control point sits at twice the sag below the chord's middle.
 */
function hang(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  len: number,
): Curve {
  const d = Math.hypot(bx - ax, by - ay);
  const s =
    len > d && d > 0.5 ? Math.min(44, Math.sqrt((3 * d * (len - d)) / 8)) : 0;
  return { ax, ay, bx, by, cx: (ax + bx) / 2, cy: (ay + by) / 2 + 2 * s };
}

const pathOf = (c: Curve) =>
  `M ${r2(c.ax)} ${r2(c.ay)} Q ${r2(c.cx)} ${r2(c.cy)} ${r2(c.bx)} ${r2(c.by)}`;

const along = (c: Curve, t: number) => {
  const u = 1 - t;
  return {
    x: u * u * c.ax + 2 * u * t * c.cx + t * t * c.bx,
    y: u * u * c.ay + 2 * u * t * c.cy + t * t * c.by,
  };
};

/** Frame time, read only from handlers and frames. */
const stampNow = () => performance.now();

/** Writes a transform by hand (FLIP's first frame, before motion paints). */
const placeNode = (node: HTMLElement, transform: string) => {
  node.style.transform = transform;
};

/**
 * One frame of a snapped chain: its free end is a damped pendulum hanging
 * from the waiting card, φ'' = −(g/r)·sin φ − c·φ', in two semi-implicit
 * half steps so a slow frame cannot fling it.
 */
const swing = (sim: { phi: number; omega: number; r: number }, dt: number) => {
  const h = Math.min(0.032, dt / 1000) / 2;
  for (let s = 0; s < 2; s += 1) {
    const acc = -(2600 / sim.r) * Math.sin(sim.phi) - 3.4 * sim.omega;
    sim.omega += acc * h;
    sim.phi += sim.omega * h;
  }
};

/** The step response of a critically damped spring: the glide, as a curve. */
const settleCurve = (t: number, w = 14) => 1 - (1 + w * t) * Math.exp(-w * t);

type ChainEls = {
  g: SVGGElement;
  paths: SVGPathElement[];
  a: SVGCircleElement | null;
  b: SVGCircleElement | null;
  burst: SVGCircleElement | null;
};

const collect = (g: SVGGElement): ChainEls => ({
  g,
  paths: Array.from(g.querySelectorAll<SVGPathElement>("path[data-bc-d]")),
  a: g.querySelector<SVGCircleElement>("circle[data-bc-end='a']"),
  b: g.querySelector<SVGCircleElement>("circle[data-bc-end='b']"),
  burst: g.querySelector<SVGCircleElement>("circle[data-bc-burst]"),
});

/** The chain's own drawing. Paths carry no `d` until the layer measures the cards. */
function ChainGlyph({
  style,
  maskId,
  loop,
  shackles = true,
  burst = false,
}: {
  style: BlockerChainStyle;
  maskId: string;
  loop: boolean;
  shackles?: boolean;
  burst?: boolean;
}) {
  return (
    <>
      {style === "links" ? (
        <>
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={-4000}
              y={-4000}
              width={8000}
              height={8000}
            >
              <rect
                x={-4000}
                y={-4000}
                width={8000}
                height={8000}
                fill="white"
              />
              <path
                data-bc-d=""
                fill="none"
                stroke="black"
                strokeWidth={1.4}
                strokeDasharray="6 6"
                strokeLinecap="round"
              />
            </mask>
          </defs>
          {/* Hollow capsules are the links seen face-on; the short bars
              through their ends are the links between, seen edge-on. */}
          <path
            data-bc-d=""
            fill="none"
            stroke="currentColor"
            strokeWidth={3.6}
            strokeDasharray="6 6"
            strokeLinecap="round"
            mask={`url(#${maskId})`}
          />
          <path
            data-bc-d=""
            fill="none"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeDasharray="6 6"
            strokeDashoffset={-6}
          />
        </>
      ) : style === "beads" ? (
        <path
          data-bc-d=""
          fill="none"
          stroke="currentColor"
          strokeWidth={3.4}
          strokeDasharray={loop ? "0 4" : "0 6"}
          strokeLinecap="round"
        />
      ) : (
        <path
          data-bc-d=""
          fill="none"
          stroke="currentColor"
          strokeWidth={1.4}
          strokeDasharray={loop ? "4 3" : undefined}
          strokeLinecap="round"
        />
      )}
      {shackles ? (
        <>
          <circle
            data-bc-end="a"
            r={2.8}
            strokeWidth={1.4}
            stroke="currentColor"
            className="fill-surface-0"
          />
          <circle
            data-bc-end="b"
            r={2.8}
            strokeWidth={1.4}
            stroke="currentColor"
            className="fill-surface-0"
          />
        </>
      ) : null}
      {burst ? (
        <circle
          data-bc-burst=""
          r={3}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          opacity={0}
        />
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  The card                                */
/* ----------------------------------------------------------------------- */

type CardMotion = { x: MotionValue<number>; y: MotionValue<number> };

type ChipInfo = {
  key: string;
  blocker: BlockerCard;
  loop: boolean;
};

type ChainCardProps = {
  card: BlockerCard;
  columnTitle: string;
  done: boolean;
  chips: ChipInfo[];
  freed: string[] | null;
  days: number | null;
  active: boolean;
  lifted: boolean;
  raised: boolean;
  hot: boolean;
  linkSource: boolean;
  linkTarget: boolean;
  cardStyle: BlockerCardStyle;
  motionSafe: boolean;
  hintId: string;
  locked: boolean;
  onNode: (id: string, node: HTMLDivElement | null, mv: CardMotion) => void;
  onChipNode: (key: string, node: HTMLButtonElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>, id: string) => void;
  onFocusCard: (id: string) => void;
  onBlurCard: (event: React.FocusEvent<HTMLDivElement>, id: string) => void;
  onHover: (id: string | null) => void;
  onJump: (blocked: string, blocker: string) => void;
  onUnlinkChip: (blocked: string, blocker: string) => void;
  onLinkButton: (id: string) => void;
};

function ChainCard({
  card,
  columnTitle,
  done,
  chips,
  freed,
  days,
  active,
  lifted,
  raised,
  hot,
  linkSource,
  linkTarget,
  cardStyle,
  motionSafe,
  hintId,
  locked,
  onNode,
  onChipNode,
  onKeyDown,
  onFocusCard,
  onBlurCard,
  onHover,
  onJump,
  onUnlinkChip,
  onLinkButton,
}: ChainCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const lift = useMotionValue(0);
  const shownY = useTransform([y, lift] as MotionValue<number>[], ([a, b]) =>
    r2(Number(a ?? 0) + Number(b ?? 0)),
  );
  const setNode = React.useCallback(
    (node: HTMLDivElement | null) => onNode(card.id, node, { x, y }),
    [card.id, onNode, x, y],
  );

  // An unblocked card rises a few pixels on snap and settles back on glide
  // once the glow has said its piece.
  const isFreed = freed !== null;
  React.useEffect(() => {
    if (!motionSafe) {
      lift.jump(0);
      return;
    }
    const run = animate(
      lift,
      isFreed ? -3 : 0,
      isFreed ? springs.snap : springs.glide,
    );
    return () => run.stop();
  }, [isFreed, motionSafe, lift]);

  const loop = chips.some((c) => c.loop);
  const blockedText = chips
    .map((c) =>
      c.loop
        ? `waits on ${c.blocker.id}, which waits on it`
        : `blocked by ${c.blocker.id}`,
    )
    .join(", ");
  const label = `${card.id}, ${card.title}. ${columnTitle}${
    done ? ", done" : ""
  }.${blockedText ? ` ${blockedText.charAt(0).toUpperCase()}${blockedText.slice(1)}.` : ""}${
    loop ? " In a loop." : ""
  }${lifted ? " Lifted." : ""}`;
  const showChips = chips.length > 0 || isFreed;

  return (
    <motion.div
      ref={setNode}
      data-bc-card={card.id}
      role="group"
      aria-roledescription="card"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={active ? 0 : -1}
      onKeyDown={(event) => onKeyDown(event, card.id)}
      onFocus={() => onFocusCard(card.id)}
      onBlur={(event) => onBlurCard(event, card.id)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onHover(card.id);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onHover(null);
      }}
      style={{ x, y: shownY, zIndex: raised ? 30 : lifted ? 20 : undefined }}
      initial={false}
      animate={{ scale: raised && motionSafe ? 1.025 : 1 }}
      transition={motionSafe ? springs.flick : { duration: 0 }}
      className={cn(
        "group/bc-card relative rounded-3 px-2.5 pt-2 pb-2.5 text-left transition-[box-shadow,border-color,background-color] duration-200 select-none",
        "touch-pan-x touch-pan-y",
        locked ? "cursor-default" : raised ? "cursor-grabbing" : "cursor-grab",
        CARD_STYLE[cardStyle] ?? CARD_STYLE.raised,
        hot &&
          "border-[color-mix(in_oklab,var(--bc-accent)_55%,var(--hairline-strong))]",
        (raised || lifted) &&
          "shadow-[0_14px_32px_color-mix(in_oklab,black_22%,transparent)] hover:shadow-[0_14px_32px_color-mix(in_oklab,black_22%,transparent)]",
        lifted && "ring-2 ring-(--bc-accent)",
        linkSource && "ring-2 ring-(--bc-accent)",
        linkTarget &&
          "ring-2 ring-[color-mix(in_oklab,var(--bc-accent)_70%,transparent)] ring-offset-2 ring-offset-surface-0",
        FOCUS_RING,
      )}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-3 shadow-[0_0_0_1px_var(--bc-ok),0_0_22px_color-mix(in_oklab,var(--bc-ok)_45%,transparent)]"
        initial={false}
        animate={{ opacity: isFreed ? 1 : 0 }}
        transition={{
          duration: isFreed ? durations.base : durations.slow,
          ease: isFreed ? easings.enter : easings.exit,
        }}
      />
      <div className="flex h-5 items-center gap-1">
        <span
          aria-hidden
          data-bc-grip=""
          className={cn(
            "-ml-1 flex h-5 w-4 shrink-0 touch-none items-center justify-center text-ink-3 opacity-60 transition-opacity group-hover/bc-card:opacity-100",
            locked && "hidden",
          )}
        >
          <GripVertical className="size-3.5" />
        </span>
        <span className="font-mono text-[11px] leading-none text-ink-3 tabular-nums">
          {card.id}
        </span>
        {done ? (
          <Check aria-hidden className="size-3 shrink-0 text-success" />
        ) : null}
        <span className="ml-auto flex items-center gap-1">
          {card.assignee ? (
            <span
              aria-hidden
              className="flex size-5 items-center justify-center rounded-full bg-surface-2 text-[9px] font-semibold tracking-[0.02em] text-ink-2 ring-1 ring-hairline"
            >
              {card.assignee}
            </span>
          ) : null}
        </span>
      </div>
      <p
        className={cn(
          "mt-1.5 text-[13px] leading-[1.35] font-medium",
          done ? "text-ink-2" : "text-foreground",
        )}
      >
        {card.title}
      </p>
      <motion.div
        initial={false}
        animate={{ height: showChips ? "auto" : 0, opacity: showChips ? 1 : 0 }}
        transition={
          motionSafe
            ? {
                height: springs.glide,
                opacity: { duration: durations.fast },
              }
            : { duration: durations.fast }
        }
        className="overflow-hidden"
      >
        <div className="flex flex-wrap gap-1.5 pt-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              ref={(node) => onChipNode(chip.key, node)}
              type="button"
              data-bc-chip={chip.key}
              tabIndex={active ? 0 : -1}
              aria-label={
                chip.loop
                  ? `Loop: waits on ${chip.blocker.id}, ${chip.blocker.title}, which waits on this card. Enter jumps to it, Delete unlinks.`
                  : `Blocked by ${chip.blocker.id}, ${chip.blocker.title}${
                      days !== null
                        ? `, for ${days === 1 ? "1 day" : `${days} days`}`
                        : ""
                    }. Enter jumps to it, Delete unlinks.`
              }
              onClick={() => onJump(card.id, chip.blocker.id)}
              onKeyDown={(event) => {
                if (event.key === "Delete" || event.key === "Backspace") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!locked) onUnlinkChip(card.id, chip.blocker.id);
                }
              }}
              className={cn(
                "inline-flex max-w-full items-center gap-1 rounded-2 border px-1.5 py-0.5 text-left text-[11px] leading-4 transition-colors",
                chip.loop
                  ? "border-[color-mix(in_oklab,var(--danger)_40%,transparent)] bg-[color-mix(in_oklab,var(--danger)_9%,transparent)] text-danger"
                  : "border-[color-mix(in_oklab,var(--warn)_42%,transparent)] bg-[color-mix(in_oklab,var(--warn)_10%,transparent)] text-warn",
                "hover:border-current",
                FOCUS_RING,
              )}
            >
              {chip.loop ? (
                <TriangleAlert aria-hidden className="size-3 shrink-0" />
              ) : (
                <Lock aria-hidden className="size-3 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="@min-[40rem]/blocker-chains:hidden">
                  {chip.loop ? "Loop with " : "Blocked by "}
                </span>
                <span className="hidden @min-[40rem]/blocker-chains:inline">
                  {chip.loop ? "Loop · " : ""}
                </span>
                <span className="font-mono tabular-nums">
                  {chip.blocker.id}
                </span>
                <span className="text-ink-2 @min-[40rem]/blocker-chains:hidden">
                  {" "}
                  · {chip.blocker.title}
                </span>
                {days !== null && !chip.loop ? (
                  <span className="font-mono text-ink-3 tabular-nums">
                    {" "}
                    · {days === 0 ? "today" : `${days}d`}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
          {isFreed && chips.length === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-2 border border-[color-mix(in_oklab,var(--success)_40%,transparent)] bg-[color-mix(in_oklab,var(--success)_10%,transparent)] px-1.5 py-0.5 text-[11px] leading-4 text-success">
              <motion.span
                className="inline-flex"
                initial={motionSafe ? { y: 1, rotate: -12 } : false}
                animate={{ y: 0, rotate: 0 }}
                transition={motionSafe ? springs.flick : { duration: 0 }}
              >
                <LockOpen aria-hidden className="size-3 shrink-0" />
              </motion.span>
              Unblocked
              {freed && freed.length > 0 ? (
                <span className="text-ink-3 @min-[40rem]/blocker-chains:hidden">
                  {" "}
                  · <s className="font-mono">{freed.join(", ")}</s> done
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </motion.div>
      {/* Last in the card, so Tab reaches the chains before it. */}
      {!locked && !done ? (
        <button
          type="button"
          data-bc-link=""
          tabIndex={active ? 0 : -1}
          aria-label={`Add a blocker to ${card.id}`}
          title="Add blocker (L)"
          onClick={(event) => {
            // Pointer presses arrive through the board's tap; a click with
            // no pointer behind it is the keyboard's.
            if (event.detail === 0) onLinkButton(card.id);
          }}
          className={cn(
            "absolute top-2 right-8 flex size-5 touch-none items-center justify-center rounded-2 text-ink-3 opacity-0 transition-[opacity,color,background-color] group-focus-within/bc-card:opacity-100 group-hover/bc-card:opacity-100 hover:bg-surface-2 hover:text-(--bc-accent) focus-visible:opacity-100 pointer-coarse:opacity-100",
            linkSource && "opacity-100",
            FOCUS_RING,
          )}
        >
          <Link2 aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The board                                */
/* ----------------------------------------------------------------------- */

type DragState = {
  id: string;
  mode: "move" | "link";
  over: (Place & { y: number }) | null;
  target: string | null;
};

type FallSim = {
  blocked: string;
  side: number;
  dy: number;
  phi: number;
  omega: number;
  r: number;
  len: number;
  t0: number;
  bx: number;
  by: number;
};

type Fall = { id: number; key: string; loop: boolean };

/**
 * A kanban board whose blocked cards hang a thin chain to the card they wait
 * on. Chains are quadratic catenaries drawn under the cards from each card's
 * "blocked by" chip to its blocker; they carry a fixed length, so dragging a
 * card away pulls a chain taut and bringing it closer lets it droop. Moving a
 * blocker into a done column snaps its chains loose: the free end swings down
 * from the waiting card as a damped pendulum and fades on the exit ease, while
 * the freed card lifts on `springs.snap` with an unblocked glow and settles
 * back on `springs.glide`. Every card that moves FLIPs to its place on glide.
 *
 * B shows every chain in full; Enter on a chain chip jumps to its blocker as a
 * bead runs along the chain; Delete on a chip unlinks it; L (or the link
 * handle, dragged or clicked) links a new blocker, and loops are flagged.
 * Cards share one roving tab stop: arrows move, Space lifts and drops, Escape
 * cancels. Under 40rem the chains become "Blocked by" lines on the cards.
 */
export function BlockerChains({
  columns = defaultBlockerColumns,
  cards: cardsProp,
  defaultCards = defaultBlockerCards,
  onCardsChange,
  onMove,
  onLink,
  onUnlink,
  showAll: showAllProp,
  defaultShowAll = false,
  onShowAllChange,
  chainStyle = "links",
  cardStyle = "raised",
  accent = "var(--accent-bright)",
  now = DEFAULT_NOW,
  title = "Fieldline 4.2",
  subtitle = "Release board",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: BlockerChainsProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const sid = cleanId(uid);
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const ready = status === "ready";
  const locked = disabled || !ready;

  const [own, setOwn] = React.useState<BlockerCard[]>(defaultCards);
  const cards = cardsProp ?? own;
  const [ownAll, setOwnAll] = React.useState(defaultShowAll);
  const showAll = showAllProp ?? ownAll;

  const doneCols = new Set(columns.filter((c) => c.done).map((c) => c.id));
  const colIds = new Set(columns.map((c) => c.id));
  const colTitle = (id: string) =>
    columns.find((c) => c.id === id)?.title ?? id;

  /* ----------------------------- keyboard lift ----------------------------- */

  const [lift, setLift] = React.useState<{
    id: string;
    from: Place;
    cards: BlockerCard[];
  } | null>(null);
  const shown = lift ? lift.cards : cards;
  const visible = shown.filter((c) => colIds.has(c.column));
  const byId = new Map(visible.map((c) => [c.id, c]));
  const links = liveLinks(visible, doneCols);
  const lanes = columns.map((col) =>
    visible.filter((c) => c.column === col.id),
  );

  /* -------------------------------- state -------------------------------- */

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const tabStop =
    activeId && byId.has(activeId) ? activeId : (visible[0]?.id ?? null);
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const [hoverId, setHoverId] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [raisedId, setRaisedId] = React.useState<string | null>(null);
  const [linkMode, setLinkMode] = React.useState<{
    from: string;
    to: string | null;
  } | null>(null);
  const [freed, setFreed] = React.useState<Record<string, string[]>>({});
  const [falls, setFalls] = React.useState<Fall[]>([]);
  const [flashKey, setFlashKey] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [wide, setWide] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const cardMv = React.useRef(new Map<string, CardMotion>());
  const chipNodes = React.useRef(new Map<string, HTMLButtonElement>());
  const colNodes = React.useRef(new Map<string, HTMLElement>());
  const chainEls = React.useRef(new Map<string, ChainEls>());
  const fallEls = React.useRef(new Map<number, ChainEls>());
  const previewEls = React.useRef<ChainEls | null>(null);
  const beadEl = React.useRef<SVGCircleElement | null>(null);
  const runs = React.useRef(new Map<string, AnimationPlaybackControls[]>());
  const timers = React.useRef(new Set<number>());

  const onNode = React.useCallback(
    (id: string, node: HTMLDivElement | null, mv: CardMotion) => {
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
  const onChipNode = React.useCallback(
    (key: string, node: HTMLButtonElement | null) => {
      if (node) chipNodes.current.set(key, node);
      else chipNodes.current.delete(key);
    },
    [],
  );

  const later = (fn: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.current.delete(t);
      fn();
    }, ms);
    timers.current.add(t);
  };

  /* --------------------------- the chain layer ---------------------------- */

  // Per-link working state for the drawing, kept off React: current length,
  // last geometry (where a snapped chain starts from), growth of new links.
  const lenRef = React.useRef(new Map<string, number>());
  const frozen = React.useRef(new Set<string>());
  const geo = React.useRef(new Map<string, Curve>());
  const grow = React.useRef(new Map<string, number>());
  const fallSim = React.useRef(new Map<number, FallSim>());
  const fallSeq = React.useRef(0);
  const bead = React.useRef<{ key: string; t0: number } | null>(null);
  const preview = React.useRef<{
    from: string;
    to: string | null;
    point: { x: number; y: number } | null;
  } | null>(null);
  const live = React.useRef({ links, wide, motionSafe });
  const loopState = React.useRef({ raf: 0, until: 0, last: 0 });
  const drawRef = React.useRef<(t: number) => void>(() => {});
  const dragRef = React.useRef<{
    id: string;
    mode: "move" | "link";
    sx: number;
    sy: number;
    sl: number;
    st: number;
    px: number;
    py: number;
    over: (Place & { y: number }) | null;
    target: string | null;
  } | null>(null);

  const kick = React.useCallback((ms: number) => {
    const l = loopState.current;
    l.until = Math.max(l.until, stampNow() + ms);
    if (l.raf) return;
    const tick = (t: number) => {
      l.raf = 0;
      drawRef.current(t);
      const busy =
        t < l.until ||
        dragRef.current !== null ||
        fallSim.current.size > 0 ||
        bead.current !== null ||
        grow.current.size > 0;
      if (busy) l.raf = requestAnimationFrame(tick);
    };
    l.raf = requestAnimationFrame(tick);
  }, []);

  const draw = (t: number) => {
    const content = contentRef.current;
    const L = loopState.current;
    const dt = L.last ? Math.min(48, Math.max(1, t - L.last)) : 16;
    L.last = t;
    const { links: list, wide: isWide, motionSafe: safeMotion } = live.current;
    if (!content || !isWide) {
      // Nothing to draw on: anything mid-flight simply ends.
      if (fallSim.current.size) {
        fallSim.current.clear();
        setFalls([]);
      }
      bead.current = null;
      grow.current.clear();
      return;
    }
    const cb = content.getBoundingClientRect();
    const box = (node: Element) => {
      const r = node.getBoundingClientRect();
      return {
        l: r.left - cb.left,
        t: r.top - cb.top,
        r: r.right - cb.left,
        b: r.bottom - cb.top,
        cx: (r.left + r.right) / 2 - cb.left,
        h: r.height,
      };
    };
    const k = 1 - Math.exp(-dt / 140);

    const writeChain = (els: ChainEls | undefined | null, c: Curve) => {
      if (!els) return;
      const d = pathOf(c);
      for (const p of els.paths) p.setAttribute("d", d);
      els.a?.setAttribute("cx", String(r2(c.ax)));
      els.a?.setAttribute("cy", String(r2(c.ay)));
      els.b?.setAttribute("cx", String(r2(c.bx)));
      els.b?.setAttribute("cy", String(r2(c.by)));
    };

    // Which edge of each card a chain leaves from, and where it bows to when
    // both cards share a column (the second of a pair takes the other side).
    const sameColumnSide = new Map<string, number>();
    for (const link of list) {
      const blockedNode = cardNodes.current.get(link.blocked);
      const blockerNode = cardNodes.current.get(link.blocker);
      if (!blockedNode || !blockerNode) continue;
      const A = box(blockedNode);
      const B = box(blockerNode);
      const chip = chipNodes.current.get(link.key);
      const chipBox = chip ? box(chip) : null;
      const ay = chipBox ? (chipBox.t + chipBox.b) / 2 : A.t + A.h / 2;
      const by = B.t + Math.min(22, B.h / 2);
      const dx = B.cx - A.cx;
      let c: Curve;
      if (Math.abs(dx) > 24) {
        const ax = dx > 0 ? A.r : A.l;
        const bx = dx > 0 ? B.l : B.r;
        const d = Math.hypot(bx - ax, by - ay);
        const target = d + slackFor(d);
        const prev = lenRef.current.get(link.key);
        const len = frozen.current.has(link.key)
          ? (prev ?? target)
          : prev === undefined
            ? target
            : prev + (target - prev) * k;
        lenRef.current.set(link.key, len);
        c = hang(ax, ay, bx, by, len);
      } else {
        const pair = sameColumnSide.get(linkKey(link.blocker, link.blocked));
        const side = pair === 1 ? -1 : 1;
        sameColumnSide.set(link.key, side);
        const ax = side > 0 ? A.r : A.l;
        const bx = side > 0 ? B.r : B.l;
        // The curve reaches half its control offset: about 8px past the card,
        // inside the board's padding.
        const bow = side * Math.min(9, 6 + Math.abs(by - ay) * 0.02);
        c = {
          ax,
          ay,
          bx,
          by,
          cx: (ax + bx) / 2 + bow * 2,
          cy: (ay + by) / 2,
        };
      }
      // A link that was just made throws its free end across on a glide.
      const born = grow.current.get(link.key);
      if (born !== undefined) {
        const p = safeMotion ? settleCurve((t - born) / 1000) : 1;
        if (p > 0.995) grow.current.delete(link.key);
        else {
          const e = along(c, p);
          c = hang(
            c.ax,
            c.ay,
            e.x,
            e.y,
            Math.hypot(e.x - c.ax, e.y - c.ay) * 1.02,
          );
        }
      }
      geo.current.set(link.key, c);
      writeChain(chainEls.current.get(link.key), c);
    }

    // The chain being linked follows the pointer or the chosen card.
    const pv = preview.current;
    const pvEls = previewEls.current;
    if (pv && pvEls) {
      const fromNode = cardNodes.current.get(pv.from);
      const toNode = pv.to ? cardNodes.current.get(pv.to) : null;
      if (fromNode) {
        const A = box(fromNode);
        let bx = pv.point?.x ?? A.r + 40;
        let by = pv.point?.y ?? A.t + A.h / 2;
        if (toNode) {
          const B = box(toNode);
          bx = B.cx > A.cx ? B.l : B.r;
          by = B.t + Math.min(22, B.h / 2);
        }
        const ax = bx > A.cx ? A.r : A.l;
        const ay = A.t + Math.min(22, A.h / 2);
        const d = Math.hypot(bx - ax, by - ay);
        writeChain(pvEls, hang(ax, ay, bx, by, d + slackFor(d)));
        pvEls.g.setAttribute("opacity", "1");
      }
    } else if (pvEls) {
      pvEls.g.setAttribute("opacity", "0");
    }

    // Snapped chains swing down from the waiting card as a damped pendulum.
    let finished: number[] | null = null;
    for (const [id, sim] of fallSim.current) {
      const els = fallEls.current.get(id);
      const age = Math.max(0, (t - sim.t0) / 1000);
      if (!els) {
        if (age > 1.2) (finished ??= []).push(id);
        continue;
      }
      const node = cardNodes.current.get(sim.blocked);
      if (node) {
        const A = box(node);
        const ax = sim.side > 0 ? A.r : A.l;
        const ay = A.t + sim.dy;
        if (safeMotion) swing(sim, dt);
        const ex = ax + sim.r * Math.sin(sim.phi);
        const ey = ay + sim.r * Math.cos(sim.phi);
        writeChain(els, hang(ax, ay, ex, ey, sim.len));
      }
      const fade = safeMotion
        ? clamp01(1 - Math.pow(clamp01((age - 0.16) / 0.52), 1.6))
        : clamp01(1 - age / 0.26);
      els.g.setAttribute("opacity", String(r2(fade)));
      if (els.burst) {
        const b = clamp01(age / 0.26);
        els.burst.setAttribute("cx", String(r2(sim.bx)));
        els.burst.setAttribute("cy", String(r2(sim.by)));
        els.burst.setAttribute("r", String(r2(3 + 9 * b)));
        els.burst.setAttribute(
          "opacity",
          String(safeMotion ? r2(0.9 * (1 - b)) : 0),
        );
      }
      if (fade <= 0.001) (finished ??= []).push(id);
    }
    if (finished) {
      const gone = finished;
      for (const id of gone) fallSim.current.delete(id);
      setFalls((f) => f.filter((x) => !gone.includes(x.id)));
    }

    // Enter on a chain sends a bead along it to the blocker.
    const bd = bead.current;
    const beadNode = beadEl.current;
    if (bd && beadNode) {
      const c = geo.current.get(bd.key);
      const p = clamp01((t - bd.t0) / 380);
      if (!c || p >= 1) {
        bead.current = null;
        beadNode.setAttribute("opacity", "0");
      } else {
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const at = along(c, e);
        beadNode.setAttribute("cx", String(r2(at.x)));
        beadNode.setAttribute("cy", String(r2(at.y)));
        beadNode.setAttribute(
          "opacity",
          String(r2(p > 0.85 ? (1 - p) / 0.15 : 1)),
        );
      }
    }
  };

  // The newest closure and data for the drawing, before any layout effect kicks it.
  React.useLayoutEffect(() => {
    drawRef.current = draw;
    live.current = { links, wide, motionSafe };
  });

  // Width decides whether chains are drawn at all (under 40rem they are lines).
  React.useEffect(() => {
    if (!root) return;
    const ro = new ResizeObserver(() => {
      const w = root.getBoundingClientRect().width;
      setWide(w >= 640);
      kick(0);
    });
    ro.observe(root);
    return () => ro.disconnect();
  }, [root, kick]);

  // Any change to what is drawn (links, styles, a new width) draws one frame.
  const linkSig = links.map((l) => `${l.key}${l.loop ? "!" : ""}`).join(",");
  React.useLayoutEffect(() => {
    kick(wide ? 120 : 0);
  }, [linkSig, wide, chainStyle, kick]);

  React.useEffect(() => {
    const t = timers.current;
    const r = runs.current;
    const l = loopState.current;
    return () => {
      for (const id of t) window.clearTimeout(id);
      t.clear();
      for (const list of r.values()) for (const c of list) c.stop();
      r.clear();
      if (l.raf) cancelAnimationFrame(l.raf);
      l.raf = 0;
    };
  }, []);

  /* ------------------------------ FLIP moves ------------------------------ */

  const flipFrom = React.useRef<{
    at: number;
    pos: Map<string, { x: number; y: number }>;
    velocity: { id: string; vx: number; vy: number } | null;
  } | null>(null);
  const pendingFocus = React.useRef<string | null>(null);

  const capture = (velocity: { id: string; vx: number; vy: number } | null) => {
    const content = contentRef.current;
    if (!content) return;
    const cb = content.getBoundingClientRect();
    const pos = new Map<string, { x: number; y: number }>();
    for (const [id, node] of cardNodes.current) {
      const r = node.getBoundingClientRect();
      // The scale a lifted card wears is not where it lives.
      pos.set(id, {
        x: r.left - cb.left + (r.width - node.offsetWidth) / 2,
        y: r.top - cb.top + (r.height - node.offsetHeight) / 2,
      });
    }
    flipFrom.current = { at: stampNow(), pos, velocity };
  };

  const stopRuns = (id: string) => {
    for (const c of runs.current.get(id) ?? []) c.stop();
    runs.current.delete(id);
  };

  React.useLayoutEffect(() => {
    const snap = flipFrom.current;
    const content = contentRef.current;
    flipFrom.current = null;
    const settled: string[] = [];
    if (snap && content && stampNow() - snap.at < 1500) {
      for (const [id, node] of cardNodes.current) {
        const old = snap.pos.get(id);
        const mv = cardMv.current.get(id);
        if (!old || !mv) continue;
        const at = layoutPos(node, content);
        const dx = r2(old.x - at.x);
        const dy = r2(old.y - at.y);
        stopRuns(id);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !motionSafe) {
          mv.x.jump(0);
          mv.y.jump(0);
          placeNode(node, "");
          if (snap.velocity?.id === id) settled.push(id);
          continue;
        }
        mv.x.jump(dx);
        mv.y.jump(dy);
        // Motion paints a jumped value on its next frame; the browser paints
        // before that, so the card is put where it was by hand for this one.
        placeNode(node, `translateX(${dx}px) translateY(${dy}px)`);
        const v = snap.velocity?.id === id ? snap.velocity : null;
        // Plain numbers written into the values: a freshly mounted card's own
        // values can sit idle when animated from a layout effect.
        runs.current.set(id, [
          animate(dx, 0, {
            ...springs.glide,
            velocity: v?.vx ?? 0,
            onUpdate: (val) => mv.x.set(r2(val)),
          }),
          animate(dy, 0, {
            ...springs.glide,
            velocity: v?.vy ?? 0,
            onUpdate: (val) => mv.y.set(r2(val)),
            onComplete: () => {
              runs.current.delete(id);
              setRaisedId((r) => (r === id ? null : r));
            },
          }),
        ]);
      }
      kick(900);
    }
    // A card that had nowhere to travel lands at once, a frame later.
    if (settled.length) {
      const t = window.setTimeout(() => {
        timers.current.delete(t);
        setRaisedId((r) => (r && settled.includes(r) ? null : r));
      }, 0);
      timers.current.add(t);
    }
    const focus = pendingFocus.current;
    if (focus) {
      pendingFocus.current = null;
      cardNodes.current.get(focus)?.focus({ preventScroll: true });
    }
  }, [shown, motionSafe, kick]);

  /* ------------------------------ committing ------------------------------ */

  const write = (next: BlockerCard[], change: BlockerChange) => {
    if (cardsProp === undefined) setOwn(next);
    onCardsChange?.(next, change);
  };

  const liveBlockers = (list: BlockerCard[], id: string) => {
    const card = list.find((c) => c.id === id);
    if (!card || doneCols.has(card.column)) return 0;
    return (card.blockedBy ?? []).filter((b) => {
      const x = list.find((c) => c.id === b);
      return x && !doneCols.has(x.column);
    }).length;
  };

  /** Starts a chain falling from its last drawn shape. */
  const spawnFall = (key: string, blocked: string, loop: boolean) => {
    const c = geo.current.get(key);
    const node = cardNodes.current.get(blocked);
    const content = contentRef.current;
    if (!c || !node || !content || !wide) return;
    const cb = content.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const side = c.ax >= r.right - cb.left - 1 ? 1 : -1;
    const len = Math.max(
      24,
      lenRef.current.get(key) ?? Math.hypot(c.bx - c.ax, c.by - c.ay),
    );
    fallSeq.current += 1;
    const id = fallSeq.current;
    fallSim.current.set(id, {
      blocked,
      side,
      dy: c.ay - (r.top - cb.top),
      // Angle from straight down, toward where the blocker end was.
      phi: Math.atan2(c.bx - c.ax, c.by - c.ay),
      omega: 0,
      r: len * 0.92,
      len,
      t0: stampNow(),
      bx: c.bx,
      by: c.by,
    });
    lenRef.current.delete(key);
    geo.current.delete(key);
    setFalls((f) => [...f, { id, key, loop }]);
    kick(1000);
  };

  const markFreed = (map: Record<string, string[]>) => {
    const ids = Object.keys(map);
    if (ids.length === 0) return;
    setFreed((f) => ({ ...f, ...map }));
    later(() => {
      setFreed((f) => {
        const next = { ...f };
        for (const id of ids) delete next[id];
        return next;
      });
      kick(700);
    }, 1500);
    kick(900);
  };

  const commitMove = (
    id: string,
    column: string,
    index: number,
    velocity: { vx: number; vy: number } | null,
  ) => {
    const from = placeOf(cards, id);
    if (!from) return false;
    if (from.column === column && from.index === index) return false;
    const card = cards.find((c) => c.id === id);
    let next = moveCard(cards, id, column, index);
    const unlinked: { blocked: string; key: string; loop: boolean }[] = [];
    const finishing = doneCols.has(column) && !doneCols.has(from.column);
    if (finishing) {
      const before = new Map(links.map((l) => [l.key, l.loop]));
      next = next.map((c) => {
        if (!c.blockedBy?.includes(id)) return c;
        const key = linkKey(c.id, id);
        unlinked.push({ blocked: c.id, key, loop: before.get(key) ?? false });
        return { ...c, blockedBy: c.blockedBy.filter((b) => b !== id) };
      });
    }
    capture(velocity ? { id, ...velocity } : null);
    pendingFocus.current = id;
    const move: BlockerMove = {
      cardId: id,
      from: from.column,
      to: column,
      index,
    };
    write(next, { type: "move", move });
    onMove?.(move);
    const freedMap: Record<string, string[]> = {};
    for (const u of unlinked) {
      onUnlink?.(u.blocked, id, "done");
      spawnFall(u.key, u.blocked, u.loop);
      if (
        liveBlockers(cards, u.blocked) > 0 &&
        liveBlockers(next, u.blocked) === 0
      ) {
        freedMap[u.blocked] = [...(freedMap[u.blocked] ?? []), id];
      }
    }
    markFreed(freedMap);
    const freedIds = Object.keys(freedMap);
    const pos = placeOf(next, id);
    const count = next.filter((c) => c.column === column).length;
    say(
      `${card?.id ?? id} moved to ${colTitle(column)}, ${
        (pos?.index ?? 0) + 1
      } of ${count}.${
        freedIds.length
          ? ` ${freedIds.join(" and ")} ${freedIds.length === 1 ? "is" : "are"} unblocked.`
          : unlinked.length
            ? ` ${unlinked.length === 1 ? "1 chain" : `${unlinked.length} chains`} came off.`
            : ""
      }`,
    );
    return true;
  };

  const link = (blocked: string, blocker: string) => {
    const a = cards.find((c) => c.id === blocked);
    const b = cards.find((c) => c.id === blocker);
    if (!a || !b || blocked === blocker) return;
    if (a.blockedBy?.includes(blocker)) {
      say(`${blocked} already waits on ${blocker}.`);
      return;
    }
    if (doneCols.has(b.column)) {
      say(`${blocker} is done already, so it cannot block ${blocked}.`);
      return;
    }
    const next = cards.map((c) =>
      c.id === blocked
        ? {
            ...c,
            blockedBy: [...(c.blockedBy ?? []), blocker],
            since: c.blockedBy?.length ? c.since : now,
          }
        : c,
    );
    const key = linkKey(blocked, blocker);
    const circular =
      liveLinks(next, doneCols).find((l) => l.key === key)?.loop ?? false;
    grow.current.set(key, stampNow());
    write(next, { type: "link", blocked, blocker, circular });
    onLink?.(blocked, blocker, { circular });
    // The blocker takes the hook: a small tug toward the chain, then home.
    const mv = cardMv.current.get(blocker);
    const fromCol = columns.findIndex((c) => c.id === a.column);
    const toCol = columns.findIndex((c) => c.id === b.column);
    if (mv && motionSafe && !runs.current.has(blocker)) {
      const dir = fromCol < toCol ? -1 : 1;
      const tug = animate(mv.x, dir * 3, {
        ...springs.snap,
        delay: 0.22,
        onComplete: () => {
          runs.current.set(blocker, [
            animate(mv.x, 0, {
              ...springs.glide,
              onComplete: () => runs.current.delete(blocker),
            }),
          ]);
        },
      });
      runs.current.set(blocker, [tug]);
    }
    kick(900);
    say(
      `${blocked} now waits on ${blocker}, ${b.title}.${
        circular ? " This closes a loop." : ""
      }`,
    );
  };

  const unlink = (blocked: string, blocker: string) => {
    const a = cards.find((c) => c.id === blocked);
    if (!a?.blockedBy?.includes(blocker)) return;
    const key = linkKey(blocked, blocker);
    const loop = links.find((l) => l.key === key)?.loop ?? false;
    const next = cards.map((c) =>
      c.id === blocked
        ? { ...c, blockedBy: (c.blockedBy ?? []).filter((x) => x !== blocker) }
        : c,
    );
    write(next, { type: "unlink", blocked, blocker, reason: "removed" });
    onUnlink?.(blocked, blocker, "removed");
    spawnFall(key, blocked, loop);
    const freedNow =
      liveBlockers(cards, blocked) > 0 && liveBlockers(next, blocked) === 0;
    if (freedNow) markFreed({ [blocked]: [] });
    setActiveId(blocked);
    cardNodes.current.get(blocked)?.focus({ preventScroll: true });
    say(
      `Unlinked ${blocker} from ${blocked}.${freedNow ? ` ${blocked} is unblocked.` : ""}`,
    );
  };

  /* ------------------------------ navigation ------------------------------ */

  const scrollIntoBoard = (node: HTMLElement) => {
    const sc = scrollRef.current;
    if (!sc) return;
    const s = sc.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    const pad = 12;
    let top = sc.scrollTop;
    let left = sc.scrollLeft;
    if (r.top < s.top + pad) top -= s.top + pad - r.top;
    else if (r.bottom > s.bottom - pad) top += r.bottom - (s.bottom - pad);
    if (r.left < s.left + pad) left -= s.left + pad - r.left;
    else if (r.right > s.right - pad) left += r.right - (s.right - pad);
    if (top !== sc.scrollTop || left !== sc.scrollLeft) {
      sc.scrollTo({ top, left, behavior: motionSafe ? "smooth" : "auto" });
    }
  };

  const focusCard = (id: string) => {
    const node = cardNodes.current.get(id);
    setActiveId(id);
    if (!node) return;
    node.focus({ preventScroll: true });
    scrollIntoBoard(node);
  };

  /** The card an arrow key reaches from `id`, or null at an edge. */
  const neighbour = (id: string, key: string, list = lanes): string | null => {
    const col = list.findIndex((lane) => lane.some((c) => c.id === id));
    if (col < 0) return null;
    const lane = list[col] ?? [];
    const at = lane.findIndex((c) => c.id === id);
    if (key === "ArrowUp") return lane[at - 1]?.id ?? null;
    if (key === "ArrowDown") return lane[at + 1]?.id ?? null;
    if (key === "Home") return lane[0]?.id ?? null;
    if (key === "End") return lane[lane.length - 1]?.id ?? null;
    const step = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : 0;
    if (!step) return null;
    for (let c = col + step; c >= 0 && c < list.length; c += step) {
      const other = list[c] ?? [];
      if (other.length)
        return other[Math.min(at, other.length - 1)]?.id ?? null;
    }
    return null;
  };

  /** Finished work cannot block anything, so link mode never lands on it. */
  const linkLanes = lanes.map((lane, i) => (columns[i]?.done ? [] : lane));

  const jump = (blocked: string, blocker: string) => {
    const key = linkKey(blocked, blocker);
    if (wide && motionSafe && geo.current.has(key)) {
      bead.current = { key, t0: stampNow() };
      kick(420);
    } else if (wide) {
      setFlashKey(key);
      later(() => setFlashKey((k) => (k === key ? null : k)), 700);
    }
    focusCard(blocker);
    const b = byId.get(blocker);
    say(`${blocker}, ${b?.title ?? ""}, in ${colTitle(b?.column ?? "")}.`);
  };

  const startLinkMode = (from: string) => {
    if (locked) return;
    const target =
      neighbour(from, "ArrowRight", linkLanes) ??
      neighbour(from, "ArrowLeft", linkLanes);
    setLinkMode({ from, to: target });
    preview.current = { from, to: target, point: null };
    setActiveId(from);
    cardNodes.current.get(from)?.focus({ preventScroll: true });
    kick(300);
    const t = target ? byId.get(target) : null;
    say(
      `Choose what ${from} waits on. Arrows move, Enter links, Escape cancels.${
        t ? ` ${t.id}, ${t.title}.` : ""
      }`,
    );
  };

  const endLinkMode = () => {
    setLinkMode(null);
    preview.current = null;
    kick(60);
  };

  const toggleAll = () => {
    const next = !showAll;
    if (showAllProp === undefined) setOwnAll(next);
    onShowAllChange?.(next);
    kick(60);
    say(next ? "Showing every chain." : "Showing chains for the focused card.");
  };

  /* ------------------------------- keyboard ------------------------------- */

  const onCardKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (event.target !== event.currentTarget) return;
    const key = event.key;
    const arrows = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
    ];

    if (linkMode && linkMode.from === id) {
      if (arrows.includes(key)) {
        event.preventDefault();
        const from = linkMode.to ?? id;
        let next = neighbour(from, key, linkLanes);
        if (next === id) next = neighbour(id, key, linkLanes);
        if (next && next !== id) {
          setLinkMode({ from: id, to: next });
          preview.current = { from: id, to: next, point: null };
          kick(200);
          const t = byId.get(next);
          if (t) say(`${t.id}, ${t.title}.`);
          const node = cardNodes.current.get(next);
          if (node) scrollIntoBoard(node);
        }
      } else if (key === "Enter" || key === " ") {
        event.preventDefault();
        const to = linkMode.to;
        endLinkMode();
        if (to) link(id, to);
      } else if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        endLinkMode();
        say("Linking cancelled.");
      }
      return;
    }

    if (lift && lift.id === id) {
      if (arrows.includes(key)) {
        event.preventDefault();
        const place = placeOf(lift.cards, id);
        if (!place) return;
        const colIndex = columns.findIndex((c) => c.id === place.column);
        let target: Place | null = null;
        const inCol = lift.cards.filter(
          (c) => c.column === place.column,
        ).length;
        if (key === "ArrowUp" && place.index > 0)
          target = { column: place.column, index: place.index - 1 };
        else if (key === "ArrowDown" && place.index < inCol - 1)
          target = { column: place.column, index: place.index + 1 };
        else if (key === "Home") target = { column: place.column, index: 0 };
        else if (key === "End")
          target = { column: place.column, index: inCol - 1 };
        else if (key === "ArrowLeft" || key === "ArrowRight") {
          const to = columns[colIndex + (key === "ArrowLeft" ? -1 : 1)];
          if (to) {
            const count = lift.cards.filter(
              (c) => c.column === to.id && c.id !== id,
            ).length;
            target = { column: to.id, index: Math.min(place.index, count) };
          }
        }
        if (
          target &&
          (target.column !== place.column || target.index !== place.index)
        ) {
          capture(null);
          pendingFocus.current = id;
          const moved = moveCard(lift.cards, id, target.column, target.index);
          setLift({ ...lift, cards: moved });
          const total = moved.filter((c) => c.column === target.column).length;
          say(`${colTitle(target.column)}, ${target.index + 1} of ${total}.`);
        }
      } else if (key === " " || key === "Enter") {
        event.preventDefault();
        const place = placeOf(lift.cards, id);
        capture(null);
        setLift(null);
        if (!place || !commitMove(id, place.column, place.index, null)) {
          pendingFocus.current = id;
          say(`${id} dropped where it was.`);
        }
      } else if (key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        capture(null);
        pendingFocus.current = id;
        setLift(null);
        say(`${id} put back in ${colTitle(lift.from.column)}.`);
      }
      return;
    }

    if (arrows.includes(key)) {
      event.preventDefault();
      const next = neighbour(id, key);
      if (next) focusCard(next);
      return;
    }
    if (key === " ") {
      event.preventDefault();
      if (locked) return;
      const from = placeOf(cards, id);
      if (!from) return;
      setLift({ id, from, cards });
      say(`Lifted ${id}. Arrows move it, Space drops, Escape puts it back.`);
      return;
    }
    if ((key === "l" || key === "L") && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const card = byId.get(id);
      if (card && !doneCols.has(card.column)) startLinkMode(id);
      return;
    }
    if (key === "Escape" && dragRef.current?.id === id) {
      event.preventDefault();
      event.stopPropagation();
      cancelDrag();
    }
  };

  /** Focus leaving the board ends a lift or a link in progress. */
  const onRootBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const to = event.relatedTarget as Node | null;
    if (to && event.currentTarget.contains(to)) return;
    if (lift && pendingFocus.current !== lift.id) {
      capture(null);
      setLift(null);
    }
    if (linkMode && !dragRef.current) endLinkMode();
  };

  const onRootKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const t = event.target as HTMLElement;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
    if (
      (event.key === "b" || event.key === "B") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      ready
    ) {
      event.preventDefault();
      toggleAll();
    }
  };

  /* -------------------------------- pointer ------------------------------- */

  const press = React.useRef<{
    id: string;
    mode: "move" | "link";
    onButton: boolean;
    /** A finger on the card's face scrolls the board instead of carrying it. */
    face: boolean;
    x: number;
    y: number;
  } | null>(null);
  const edgeLoop = React.useRef(0);

  const placeDragged = () => {
    const d = dragRef.current;
    const sc = scrollRef.current;
    if (!d || !sc || d.mode !== "move") return;
    const mv = cardMv.current.get(d.id);
    if (!mv) return;
    mv.x.set(r2(d.px - d.sx + (sc.scrollLeft - d.sl)));
    mv.y.set(r2(d.py - d.sy + (sc.scrollTop - d.st)));
  };

  const hitTest = (px: number, py: number): (Place & { y: number }) | null => {
    const d = dragRef.current;
    if (!d) return null;
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
    if (!column || !colNode) return null;
    const cr = colNode.getBoundingClientRect();
    const others = visible.filter((c) => c.column === column && c.id !== d.id);
    const rects = others
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

  const cardAt = (px: number, py: number, skip: string): string | null => {
    for (const [id, node] of cardNodes.current) {
      if (id === skip) continue;
      const r = node.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom)
        return id;
    }
    return null;
  };

  const hover = () => {
    const d = dragRef.current;
    if (!d) return;
    if (d.mode === "move") {
      const over = hitTest(d.px, d.py);
      const same =
        over?.column === d.over?.column &&
        over?.index === d.over?.index &&
        over?.y === d.over?.y;
      if (!same) {
        d.over = over;
        setDrag((s) => (s ? { ...s, over } : s));
      }
    } else {
      const target = cardAt(d.px, d.py, d.id);
      const content = contentRef.current;
      if (content && preview.current) {
        const cb = content.getBoundingClientRect();
        preview.current.point = { x: d.px - cb.left, y: d.py - cb.top };
        preview.current.to = target;
      }
      if (target !== d.target) {
        d.target = target;
        setDrag((s) => (s ? { ...s, target } : s));
      }
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
    const dx =
      d.px < r.left + E
        ? -Math.ceil((r.left + E - d.px) / 4)
        : d.px > r.right - E
          ? Math.ceil((d.px - (r.right - E)) / 4)
          : 0;
    if (!dx && !dy) return;
    const before = sc.scrollTop + sc.scrollLeft * 7;
    sc.scrollBy(dx, dy);
    if (sc.scrollTop + sc.scrollLeft * 7 === before) return;
    placeDragged();
    hover();
    edgeLoop.current = requestAnimationFrame(edgeTick);
  };

  const stopEdge = () => {
    if (edgeLoop.current) cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = 0;
  };

  const freezeLinksOf = (id: string, on: boolean) => {
    for (const l of links) {
      if (l.blocked !== id && l.blocker !== id) continue;
      if (on) frozen.current.add(l.key);
      else frozen.current.delete(l.key);
    }
  };

  const cancelDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    stopEdge();
    setDrag(null);
    if (!d) return;
    if (d.mode === "link") {
      preview.current = linkMode
        ? { from: linkMode.from, to: linkMode.to, point: null }
        : null;
      kick(60);
      return;
    }
    freezeLinksOf(d.id, false);
    goHome(d.id, 0, 0);
  };

  const goHome = (id: string, vx: number, vy: number) => {
    const mv = cardMv.current.get(id);
    if (!mv) return;
    stopRuns(id);
    if (!motionSafe) {
      mv.x.jump(0);
      mv.y.jump(0);
      setRaisedId(null);
      return;
    }
    runs.current.set(id, [
      animate(mv.x, 0, { ...springs.glide, velocity: vx }),
      animate(mv.y, 0, {
        ...springs.glide,
        velocity: vy,
        onComplete: () => {
          runs.current.delete(id);
          setRaisedId((r) => (r === id ? null : r));
        },
      }),
    ]);
    kick(800);
  };

  const gesture = useDrag({
    threshold: 4,
    disabled: locked,
    onStart: ({ point }) => {
      const p = press.current;
      const sc = scrollRef.current;
      if (!p || !sc || p.face || lift) return;
      const d = {
        id: p.id,
        mode: p.mode,
        sx: p.x,
        sy: p.y,
        sl: sc.scrollLeft,
        st: sc.scrollTop,
        px: point.x,
        py: point.y,
        over: null,
        target: null,
      };
      if (p.mode === "move") {
        if (linkMode) endLinkMode();
        stopRuns(p.id);
        const mv = cardMv.current.get(p.id);
        // A card caught mid-flight carries on from where it is.
        if (mv) {
          d.sx -= mv.x.get();
          d.sy -= mv.y.get();
        }
        dragRef.current = d;
        freezeLinksOf(p.id, true);
        setRaisedId(p.id);
        setActiveId(p.id);
        setDrag({ id: p.id, mode: "move", over: null, target: null });
      } else {
        dragRef.current = d;
        preview.current = { from: p.id, to: null, point: null };
        setLinkMode(null);
        setDrag({ id: p.id, mode: "link", over: null, target: null });
      }
      hover();
      kick(100);
    },
    onMove: ({ point }) => {
      const d = dragRef.current;
      if (!d) return;
      d.px = point.x;
      d.py = point.y;
      placeDragged();
      hover();
      if (!edgeLoop.current) edgeLoop.current = requestAnimationFrame(edgeTick);
    },
    onEnd: ({ velocity }) => {
      const d = dragRef.current;
      dragRef.current = null;
      stopEdge();
      setDrag(null);
      if (!d) return;
      if (d.mode === "link") {
        preview.current = null;
        kick(60);
        if (d.target) link(d.id, d.target);
        return;
      }
      freezeLinksOf(d.id, false);
      const over = d.over;
      const moved =
        over !== null &&
        commitMove(d.id, over.column, over.index, {
          vx: velocity.x,
          vy: velocity.y,
        });
      if (!moved) goHome(d.id, velocity.x, velocity.y);
    },
    onCancel: () => cancelDrag(),
    onTap: () => {
      const p = press.current;
      if (!p) return;
      if (linkMode && p.id !== linkMode.from) {
        const from = linkMode.from;
        endLinkMode();
        link(from, p.id);
        return;
      }
      if (p.mode === "link") {
        if (linkMode?.from === p.id) {
          endLinkMode();
          say("Linking cancelled.");
        } else startLinkMode(p.id);
        return;
      }
      if (!p.onButton) setActiveId(p.id);
    },
  });

  const onBoardPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const cardNode = target.closest<HTMLElement>("[data-bc-card]");
    const id = cardNode?.getAttribute("data-bc-card");
    if (!id || locked) {
      press.current = null;
      if (linkMode && !id) {
        endLinkMode();
        say("Linking cancelled.");
      }
      return;
    }
    const onLinkHandle = target.closest("[data-bc-link]") !== null;
    const card = byId.get(id);
    press.current = {
      id,
      mode:
        onLinkHandle && card && !doneCols.has(card.column) ? "link" : "move",
      onButton: target.closest("button") !== null,
      // Touch pans the board from a card's face; the grip and the link
      // handle are where a finger takes hold.
      face:
        event.pointerType === "touch" &&
        !onLinkHandle &&
        target.closest("[data-bc-grip]") === null,
      x: event.clientX,
      y: event.clientY,
    };
    gesture.onPointerDown(event);
  };

  /* -------------------------------- render -------------------------------- */

  const focusRef = drag?.id ?? linkMode?.from ?? focusId ?? hoverId;
  const hotKeys = new Set(
    links
      .filter(
        (l) =>
          showAll ||
          l.key === flashKey ||
          (focusRef !== null &&
            (l.blocked === focusRef || l.blocker === focusRef)),
      )
      .map((l) => l.key),
  );
  const hotCards = new Set<string>();
  for (const l of links) {
    if (!hotKeys.has(l.key) || showAll) continue;
    hotCards.add(l.blocked);
    hotCards.add(l.blocker);
  }
  if (focusRef) hotCards.delete(focusRef);

  const blockedCount = visible.filter(
    (c) => !doneCols.has(c.column) && links.some((l) => l.blocked === c.id),
  ).length;
  const loopGroups = countLoops(links);

  const daysFor = (card: BlockerCard) =>
    card.since === undefined
      ? null
      : Math.max(0, Math.floor((now - card.since) / DAY));

  const tone = (l: Link) =>
    l.loop
      ? "text-danger"
      : hotKeys.has(l.key)
        ? "text-(--bc-accent)"
        : "text-ink-3";

  const chainLayer = (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden size-full overflow-visible @min-[40rem]/blocker-chains:block"
    >
      {links.map((l) => (
        <g
          key={`${l.key}|${chainStyle}|${l.loop ? 1 : 0}`}
          ref={(node) => {
            if (node) chainEls.current.set(l.key, collect(node));
            else chainEls.current.delete(l.key);
          }}
          className={cn(
            "transition-[color,opacity] duration-200",
            tone(l),
            !l.loop && !hotKeys.has(l.key) && "opacity-55",
          )}
        >
          <ChainGlyph
            style={chainStyle}
            maskId={`${sid}-m-${cleanId(l.key)}`}
            loop={l.loop}
          />
        </g>
      ))}
      {falls.map((f) => (
        <g
          key={`fall-${f.id}`}
          ref={(node) => {
            if (node) {
              fallEls.current.set(f.id, collect(node));
              kick(60);
            } else fallEls.current.delete(f.id);
          }}
          className={f.loop ? "text-danger" : "text-(--bc-accent)"}
        >
          <ChainGlyph
            style={chainStyle}
            maskId={`${sid}-f-${f.id}`}
            loop={f.loop}
            burst
          />
        </g>
      ))}
      {linkMode || drag?.mode === "link" ? (
        <g
          ref={(node) => {
            previewEls.current = node ? collect(node) : null;
            if (node) kick(60);
          }}
          opacity={0}
          className="text-(--bc-accent)"
        >
          <ChainGlyph
            style={chainStyle}
            maskId={`${sid}-preview`}
            loop={false}
          />
        </g>
      ) : null}
      <circle
        ref={beadEl}
        r={3.6}
        opacity={0}
        className="fill-(--bc-accent) stroke-surface-0"
        strokeWidth={1.5}
      />
    </svg>
  );

  const header = (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <div className="min-w-0 flex-1 basis-40">
        <h2 id={titleId} className="text-[15px] leading-6 font-semibold">
          {title}
        </h2>
        <p className="truncate text-[12px] leading-4 text-ink-3">
          {subtitle} ·{" "}
          {visible.length === 1 ? "1 card" : `${visible.length} cards`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {ready ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 text-[12px] text-ink-2 tabular-nums">
            <Lock aria-hidden className="size-3 text-warn" />
            {blockedCount} blocked
          </span>
        ) : null}
        {ready && loopGroups > 0 ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--danger)_35%,transparent)] bg-[color-mix(in_oklab,var(--danger)_8%,transparent)] px-2.5 text-[12px] text-danger tabular-nums">
            <TriangleAlert aria-hidden className="size-3" />
            {loopGroups === 1 ? "1 loop" : `${loopGroups} loops`}
          </span>
        ) : null}
        <button
          type="button"
          role="switch"
          aria-checked={showAll}
          aria-label="Show every chain"
          disabled={!ready}
          onClick={toggleAll}
          className={cn(
            "hidden h-7 items-center gap-2 rounded-full border border-hairline bg-surface-1 pr-1 pl-2.5 text-[12px] text-ink-2 transition-colors hover:text-foreground disabled:opacity-50 @min-[40rem]/blocker-chains:inline-flex",
            FOCUS_RING,
          )}
        >
          Chains
          <kbd className="font-mono text-[10px] text-ink-3">B</kbd>
          <span
            aria-hidden
            className={cn(
              "relative inline-flex h-5 w-8 items-center rounded-full transition-colors",
              showAll
                ? "bg-(--bc-fill)"
                : "bg-surface-2 ring-1 ring-hairline-strong",
            )}
          >
            <motion.span
              className="absolute left-0.5 size-4 rounded-full bg-card shadow-[0_1px_2px_color-mix(in_oklab,black_25%,transparent)]"
              initial={false}
              animate={{ x: showAll ? 12 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          </span>
        </button>
      </div>
    </header>
  );

  const body =
    status === "loading" ? (
      <div
        aria-busy="true"
        className="grid grid-cols-1 gap-4 p-4 @min-[40rem]/blocker-chains:grid-cols-4 @min-[40rem]/blocker-chains:gap-3"
      >
        <span className="sr-only">Loading the board.</span>
        {[3, 2, 2, 1].map((n, i) => (
          <div key={i} aria-hidden className="flex flex-col gap-2">
            <span className="h-4 w-20 rounded-2 bg-surface-2" />
            {Array.from({ length: n }, (_, j) => (
              <span
                key={j}
                className="h-16 rounded-3 bg-surface-2 motion-safe:animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    ) : status === "error" ? (
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <TriangleAlert aria-hidden className="size-5 text-danger" />
        <p className="text-[13px] text-foreground">The board did not load.</p>
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
        onPointerMove={gesture.onPointerMove}
        onPointerUp={gesture.onPointerUp}
        onPointerCancel={gesture.onPointerCancel}
        onLostPointerCapture={gesture.onLostPointerCapture}
        className="relative grid grid-cols-1 gap-4 p-3 @min-[40rem]/blocker-chains:grid-cols-[repeat(var(--bc-cols),minmax(0,1fr))] @min-[40rem]/blocker-chains:gap-3 @min-[40rem]/blocker-chains:p-4"
        style={
          { "--bc-cols": Math.max(1, columns.length) } as React.CSSProperties
        }
      >
        {chainLayer}
        {columns.map((col, ci) => {
          const lane = lanes[ci] ?? [];
          const isOver = drag?.mode === "move" && drag.over?.column === col.id;
          const headId = `${uid}-col-${ci}`;
          return (
            <section
              key={col.id}
              ref={(node) => {
                if (node) colNodes.current.set(col.id, node);
                else colNodes.current.delete(col.id);
              }}
              aria-labelledby={headId}
              className={cn(
                "relative flex flex-col gap-2 rounded-3 p-1 transition-[background-color,box-shadow] duration-200",
                isOver &&
                  "bg-[color-mix(in_oklab,var(--bc-accent)_7%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--bc-accent)_30%,transparent)]",
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
                {col.done ? (
                  <Check
                    aria-hidden
                    className="ml-auto size-3.5 text-success"
                  />
                ) : null}
              </div>
              <ul
                role="list"
                aria-labelledby={headId}
                className="flex flex-col gap-2"
              >
                {lane.map((card) => {
                  const chips: ChipInfo[] = links
                    .filter((l) => l.blocked === card.id)
                    .map((l) => ({
                      key: l.key,
                      loop: l.loop,
                      blocker: byId.get(l.blocker) ?? card,
                    }));
                  return (
                    <li key={card.id}>
                      <ChainCard
                        card={card}
                        columnTitle={col.title}
                        done={Boolean(col.done)}
                        chips={chips}
                        freed={freed[card.id] ?? null}
                        days={daysFor(card)}
                        active={tabStop === card.id}
                        lifted={lift?.id === card.id}
                        raised={raisedId === card.id}
                        hot={hotCards.has(card.id)}
                        linkSource={
                          linkMode?.from === card.id ||
                          (drag?.mode === "link" && drag.id === card.id)
                        }
                        linkTarget={
                          linkMode?.to === card.id ||
                          (drag?.mode === "link" && drag.target === card.id)
                        }
                        cardStyle={cardStyle}
                        motionSafe={motionSafe}
                        hintId={hintId}
                        locked={locked}
                        onNode={onNode}
                        onChipNode={onChipNode}
                        onKeyDown={onCardKey}
                        onFocusCard={(id) => {
                          setFocusId(id);
                          setActiveId(id);
                          // Another card taking focus puts a lifted one back.
                          if (
                            lift &&
                            lift.id !== id &&
                            pendingFocus.current !== lift.id
                          ) {
                            capture(null);
                            setLift(null);
                            say(`${lift.id} put back.`);
                          }
                        }}
                        onBlurCard={(event, id) => {
                          const to = event.relatedTarget as Node | null;
                          if (to && event.currentTarget.contains(to)) return;
                          setFocusId((f) => (f === id ? null : f));
                        }}
                        onHover={setHoverId}
                        onJump={jump}
                        onUnlinkChip={unlink}
                        onLinkButton={startLinkMode}
                      />
                    </li>
                  );
                })}
                {lane.length === 0 ? (
                  <li
                    aria-hidden
                    className="flex h-14 items-center justify-center rounded-3 border border-dashed border-hairline-strong text-[12px] text-ink-3"
                  >
                    {col.done ? "Nothing finished yet" : "No cards"}
                  </li>
                ) : null}
              </ul>
              {isOver && drag.over ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-(--bc-accent)"
                  style={{ top: drag.over.y - 1 }}
                />
              ) : null}
            </section>
          );
        })}
      </div>
    );

  return (
    <div
      ref={setRoot}
      onKeyDown={onRootKey}
      onBlur={onRootBlur}
      className={cn("@container/blocker-chains w-full", className)}
      style={
        {
          "--bc-accent": accent,
          "--bc-fill": `oklch(from ${accent} 0.6 0.15 h)`,
          "--bc-ok": "oklch(from var(--success) 0.72 0.15 h)",
        } as React.CSSProperties
      }
    >
      <div
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
        <p id={hintId} className="sr-only">
          Arrows move between cards. Space lifts a card, arrows carry it, Space
          drops it and Escape puts it back. L links a blocker, B shows every
          chain, and Tab reaches a card&apos;s chains: Enter jumps to the
          blocker, Delete unlinks.
        </p>
        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </div>
  );
}
