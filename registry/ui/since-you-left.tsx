"use client";

import * as React from "react";

import { AnimatePresence, motion, useInView } from "motion/react";
import {
  ArrowRight,
  Ban,
  Check,
  ChevronRight,
  CircleCheck,
  Columns3,
  Eye,
  MessageSquare,
  Moon,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
  UserRound,
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

export type SinceKind = "comment" | "done" | "blocked" | "moved" | "assigned";

export type SincePerson = { id: string; name: string };

export type SinceColumn = { id: string; label: string };

export type SinceCard = {
  id: string;
  /** Reference, e.g. "CP-214". */
  ref: string;
  title: string;
  columnId: string;
  /** A person's id. */
  assignee?: string;
  /** A short tag, e.g. "iOS". */
  tag?: string;
  blocked?: boolean;
};

export type SinceBoard = { columns: SinceColumn[]; cards: SinceCard[] };

/** One thing that happened on the board. */
export type SinceChange = {
  id: string;
  kind: SinceKind;
  cardId: string;
  /** Who did it, by person id. */
  actor: string;
  /** When, in ms. */
  at: number;
  /** A comment's words or a blocker's reason. */
  text?: string;
  /** Where a move went (a column id) or who was assigned (a person id). */
  to?: string;
};

export type SinceSeenReason = "jump" | "played" | "card" | "all";
export type SinceSeenChange = { ids: string[]; reason: SinceSeenReason };
export type SinceOpenReason = "jump" | "escape" | "all" | "reopen" | "play";
export type SinceSheetSide = "right" | "foot";
export type SinceDensity = "compact" | "cozy" | "roomy";
export type SinceStatus = "ready" | "loading" | "error";

export type SinceYouLeftProps = {
  /** Where the digest rises from: a panel on the right or a sheet at the foot. @default "right" */
  sheetSide?: SinceSheetSide;
  /** Seconds each change holds when the slideshow plays. @default 1.6 */
  pace?: number;
  /** Card padding, row heights and type size. @default "cozy" */
  density?: SinceDensity;
  /** The board's columns and cards. @default defaultSinceBoard */
  board?: SinceBoard;
  /** Everyone who appears on the board or in the digest. @default defaultSincePeople */
  people?: SincePerson[];
  /** Everything that happened, in any order; only what is after `lastSeen` and not yet seen is digested. @default defaultSinceChanges */
  changes?: SinceChange[];
  /** When the viewer last looked, in ms. @default defaultSinceLastSeen */
  lastSeen?: number;
  /** The moment ages count from, in ms — never read from the clock. @default defaultSinceNow */
  now?: number;
  /** Controlled ids of the changes already seen. */
  value?: string[];
  /** Initial seen ids when uncontrolled. @default [] */
  defaultValue?: string[];
  /** Fires with every id seen so far and the ids this press, jump, playback or Mark all seen added. */
  onChange?: (seen: string[], change: SinceSeenChange) => void;
  /** Whether the sheet is up when the board arrives. @default true */
  defaultOpen?: boolean;
  /** The sheet rose or went away, and why. */
  onOpenChange?: (open: boolean, reason: SinceOpenReason) => void;
  /** A change was jumped to on the board. */
  onJump?: (change: SinceChange, card: SinceCard) => void;
  /** A board card was pressed. Its changes are already seen. */
  onOpenCard?: (card: SinceCard) => void;
  /** Catch me up started or stopped. */
  onPlayChange?: (playing: boolean) => void;
  /** Whether the board and its changes have arrived. @default "ready" */
  status?: SinceStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The board's name. @default "Harbour app relaunch" */
  title?: string;
  /** The sheet's heading. @default "Since you left" */
  sheetTitle?: string;
  /** A line beside the title, hidden below a 30rem container. @default "Coldbrook Projects" */
  subtitle?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the surface in px; the board scrolls inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be seen, jumped to or played. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Monday 12 October 2026, 09:05 UTC — the viewer has just come back. */
export const defaultSinceNow = Date.UTC(2026, 9, 12, 9, 5);

/** Three hours and twelve minutes earlier. */
export const defaultSinceLastSeen = defaultSinceNow - 3 * HOUR - 12 * MIN;

export const defaultSincePeople: SincePerson[] = [
  { id: "mara", name: "Mara Lind" },
  { id: "tomas", name: "Tomas Reyes" },
  { id: "ines", name: "Ines Varga" },
  { id: "kenji", name: "Kenji Aoki" },
  { id: "priya", name: "Priya Nair" },
  { id: "you", name: "You" },
];

/** Coldbrook Projects: the Harbour app relaunch board, four columns. */
export const defaultSinceBoard: SinceBoard = {
  columns: [
    { id: "backlog", label: "Backlog" },
    { id: "doing", label: "In progress" },
    { id: "review", label: "Review" },
    { id: "done", label: "Done" },
  ],
  cards: [
    {
      id: "c201",
      ref: "CP-201",
      title: "Onboarding copy pass",
      columnId: "backlog",
      assignee: "priya",
      tag: "Copy",
    },
    {
      id: "c203",
      ref: "CP-203",
      title: "Offline tide tables",
      columnId: "backlog",
      tag: "iOS",
    },
    {
      id: "c208",
      ref: "CP-208",
      title: "Berth map legend",
      columnId: "backlog",
      assignee: "kenji",
      tag: "Design",
    },
    {
      id: "c214",
      ref: "CP-214",
      title: "Mooring fee checkout",
      columnId: "doing",
      assignee: "tomas",
      tag: "Payments",
    },
    {
      id: "c217",
      ref: "CP-217",
      title: "Push alerts for swell",
      columnId: "doing",
      assignee: "mara",
      tag: "iOS",
      blocked: true,
    },
    {
      id: "c219",
      ref: "CP-219",
      title: "Harbour master chat",
      columnId: "doing",
      assignee: "you",
      tag: "Android",
    },
    {
      id: "c222",
      ref: "CP-222",
      title: "Night mode charts",
      columnId: "doing",
      assignee: "kenji",
      tag: "Design",
    },
    {
      id: "c226",
      ref: "CP-226",
      title: "Slip booking calendar",
      columnId: "review",
      assignee: "ines",
      tag: "Web",
    },
    {
      id: "c229",
      ref: "CP-229",
      title: "Fuel dock hours",
      columnId: "review",
      assignee: "tomas",
      tag: "Web",
    },
    {
      id: "c231",
      ref: "CP-231",
      title: "Crew invite links",
      columnId: "done",
      assignee: "priya",
      tag: "Web",
    },
    {
      id: "c233",
      ref: "CP-233",
      title: "Vessel photo upload",
      columnId: "done",
      assignee: "mara",
      tag: "iOS",
    },
    {
      id: "c235",
      ref: "CP-235",
      title: "Weather strip on home",
      columnId: "done",
      assignee: "ines",
      tag: "Design",
    },
  ],
};

const ago = (n: number) => defaultSinceNow - n * MIN;

/** What happened on the Harbour board: a quiet evening, then a busy morning. */
export const defaultSinceChanges: SinceChange[] = [
  // Before the viewer left: already old news.
  {
    id: "h1",
    kind: "comment",
    cardId: "c219",
    actor: "tomas",
    at: ago(410),
    text: "Chat threads need the harbour's opening hours before we ship.",
  },
  {
    id: "h2",
    kind: "moved",
    cardId: "c226",
    actor: "ines",
    at: ago(380),
    to: "review",
  },
  // Since then.
  {
    id: "n1",
    kind: "done",
    cardId: "c231",
    actor: "priya",
    at: ago(181),
  },
  {
    id: "n2",
    kind: "comment",
    cardId: "c214",
    actor: "tomas",
    at: ago(174),
    text: "Checkout now retries a declined card once before it gives up.",
  },
  {
    id: "n3",
    kind: "comment",
    cardId: "c226",
    actor: "kenji",
    at: ago(160),
    text: "The calendar's week view clips on small phones; screenshots attached.",
  },
  {
    id: "n4",
    kind: "moved",
    cardId: "c229",
    actor: "tomas",
    at: ago(148),
    to: "review",
  },
  {
    id: "n5",
    kind: "comment",
    cardId: "c219",
    actor: "mara",
    at: ago(131),
    text: "Harbour master replies should show their badge, not a plain avatar.",
  },
  {
    id: "n6",
    kind: "done",
    cardId: "c233",
    actor: "mara",
    at: ago(118),
  },
  {
    id: "n7",
    kind: "blocked",
    cardId: "c217",
    actor: "mara",
    at: ago(104),
    text: "Waiting on the swell feed's new API key from the met office.",
  },
  {
    id: "n8",
    kind: "comment",
    cardId: "c222",
    actor: "kenji",
    at: ago(95),
    text: "Night mode contrast passes on the depth chart; the tide chart does not yet.",
  },
  {
    id: "n9",
    kind: "assigned",
    cardId: "c208",
    actor: "ines",
    at: ago(82),
    to: "kenji",
  },
  {
    id: "n10",
    kind: "comment",
    cardId: "c214",
    actor: "ines",
    at: ago(66),
    text: "Receipts should name the berth, not just the slip number.",
  },
  {
    id: "n11",
    kind: "comment",
    cardId: "c219",
    actor: "tomas",
    at: ago(49),
    text: "Agreed on the badge. I will take the Android side of it tomorrow.",
  },
  {
    id: "n12",
    kind: "done",
    cardId: "c235",
    actor: "ines",
    at: ago(37),
  },
  {
    id: "n13",
    kind: "moved",
    cardId: "c222",
    actor: "kenji",
    at: ago(21),
    to: "doing",
  },
  {
    id: "n14",
    kind: "comment",
    cardId: "c229",
    actor: "priya",
    at: ago(6),
    text: "Fuel dock closes early on Sundays; the hours card needs a second row.",
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.2;
const LIFT_MS = 130;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const noopSubscribe = () => () => {};

const KINDS: SinceKind[] = ["blocked", "done", "comment", "moved", "assigned"];

const KIND_WORD: Record<SinceKind, { one: string; other: string }> = {
  blocked: { one: "blocked", other: "blocked" },
  done: { one: "task done", other: "tasks done" },
  comment: { one: "comment", other: "comments" },
  moved: { one: "moved", other: "moved" },
  assigned: { one: "assigned", other: "assigned" },
};

const KIND_LABEL: Record<SinceKind, string> = {
  blocked: "Blocked",
  done: "Done",
  comment: "Comments",
  moved: "Moved",
  assigned: "Assigned",
};

const KIND_TONE: Record<SinceKind, string> = {
  blocked: "var(--danger)",
  done: "var(--success)",
  comment: "var(--accent)",
  moved: "var(--signal)",
  assigned: "var(--warn)",
};

/** Avatar washes by person, cycling through the status tokens. */
const HUES = [
  "var(--accent)",
  "var(--signal)",
  "var(--success)",
  "var(--warn)",
  "var(--danger)",
  "var(--ink-2)",
];

const DENSITY: Record<
  SinceDensity,
  { card: string; title: string; row: string; gap: string; col: string }
> = {
  compact: {
    card: "px-2 py-1.5",
    title: "text-[12px]",
    row: "py-1.5",
    gap: "gap-1.5",
    col: "gap-1.5",
  },
  cozy: {
    card: "px-2.5 py-2",
    title: "text-[13px]",
    row: "py-2",
    gap: "gap-2",
    col: "gap-2",
  },
  roomy: {
    card: "px-3 py-2.5",
    title: "text-[14px]",
    row: "py-2.5",
    gap: "gap-2.5",
    col: "gap-2.5",
  },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** "just now", "6m ago", "2h ago", "3d ago". */
const ageOf = (at: number, now: number) => {
  const d = Math.max(0, now - at);
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.round(d / MIN)}m ago`;
  if (d < 24 * HOUR) return `${Math.floor(d / HOUR)}h ago`;
  return `${Math.floor(d / (24 * HOUR))}d ago`;
};

/** "3h 12m", "48m", "2d 4h". */
const spanOf = (ms: number) => {
  const d = Math.max(0, ms);
  if (d < HOUR) return `${Math.max(1, Math.round(d / MIN))}m`;
  if (d < 24 * HOUR) {
    const h = Math.floor(d / HOUR);
    const m = Math.round((d - h * HOUR) / MIN);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const days = Math.floor(d / (24 * HOUR));
  const h = Math.round((d - days * 24 * HOUR) / HOUR);
  return h ? `${days}d ${h}h` : `${days}d`;
};

type Ctx = {
  people: Map<string, SincePerson>;
  cards: Map<string, SinceCard>;
  columns: Map<string, SinceColumn>;
};

const nameOf = (ctx: Ctx, id: string | undefined) =>
  (id && ctx.people.get(id)?.name) || "Someone";

/** The change as a sentence: "Mara commented on Harbour master chat". */
const sentenceOf = (change: SinceChange, ctx: Ctx) => {
  const who = nameOf(ctx, change.actor).split(" ")[0] ?? "Someone";
  const card = ctx.cards.get(change.cardId)?.title ?? change.cardId;
  switch (change.kind) {
    case "comment":
      return `${who} commented on ${card}`;
    case "done":
      return `${who} finished ${card}`;
    case "blocked":
      return `${who} flagged ${card} as blocked`;
    case "moved":
      return `${who} moved ${card} to ${ctx.columns.get(change.to ?? "")?.label ?? "another column"}`;
    case "assigned":
      return `${who} assigned ${card} to ${nameOf(ctx, change.to)}`;
  }
};

/** Counts the changes still unseen, for hosts that show a badge elsewhere. */
export const countSinceUnseen = (
  changes: SinceChange[],
  lastSeen: number,
  seen: string[],
) => changes.filter((c) => c.at > lastSeen && !seen.includes(c.id)).length;

/* ----------------------------------------------------------------------- */
/*                               Rolling digits                             */
/* ----------------------------------------------------------------------- */

function Roll({
  value,
  motionSafe,
  className,
}: {
  value: number;
  motionSafe: boolean;
  className?: string;
}) {
  const digits = String(Math.max(0, Math.round(value))).split("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex tabular-nums", className)}
      style={{ height: `${DIGIT_H}em`, lineHeight: `${DIGIT_H}em` }}
    >
      <span className="invisible w-0">0</span>
      {digits.map((d, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden"
          style={{ width: "1ch", height: `${DIGIT_H}em` }}
        >
          <motion.span
            className="absolute inset-x-0 top-0 flex flex-col items-center"
            initial={false}
            animate={{ y: `${-r3(Number(d) * DIGIT_H)}em` }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            {DIGITS.map((n) => (
              <span key={n} style={{ height: `${DIGIT_H}em` }}>
                {n}
              </span>
            ))}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Avatar                                  */
/* ----------------------------------------------------------------------- */

function Avatar({
  person,
  index,
  size = 22,
  className,
}: {
  person: SincePerson | undefined;
  index: number;
  size?: number;
  className?: string;
}) {
  const hue = HUES[index % HUES.length] ?? HUES[0];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-card font-mono font-medium",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `color-mix(in oklab, ${hue} 18%, var(--bg-2))`,
        color: `color-mix(in oklab, ${hue} 70%, var(--ink))`,
      }}
    >
      {person ? initials(person.name) : <UserRound className="size-3" />}
    </span>
  );
}

function KindIcon({
  kind,
  className,
}: {
  kind: SinceKind;
  className?: string;
}) {
  const cls = cn("size-3.5", className);
  switch (kind) {
    case "comment":
      return <MessageSquare aria-hidden className={cls} />;
    case "done":
      return <CircleCheck aria-hidden className={cls} />;
    case "blocked":
      return <Ban aria-hidden className={cls} />;
    case "moved":
      return <ArrowRight aria-hidden className={cls} />;
    case "assigned":
      return <UserRound aria-hidden className={cls} />;
  }
}

/* ----------------------------------------------------------------------- */
/*                                Board card                                */
/* ----------------------------------------------------------------------- */

type BoardCardProps = {
  card: SinceCard;
  column: SinceColumn;
  assignee: SincePerson | undefined;
  assigneeIndex: number;
  fresh: number;
  /** How long the dot waits before fading, in s: its place in the mark-all cascade. */
  dotDelay: number;
  pulse: number;
  lifted: boolean;
  density: SinceDensity;
  motionSafe: boolean;
  tabIndex: number;
  disabled: boolean;
  done: boolean;
  nodeRef: (node: HTMLDivElement | null) => void;
  onPress: () => void;
  onFocus: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function BoardCard({
  card,
  column,
  assignee,
  assigneeIndex,
  fresh,
  dotDelay,
  pulse,
  lifted,
  density,
  motionSafe,
  tabIndex,
  disabled,
  done,
  nodeRef,
  onPress,
  onFocus,
  onNav,
}: BoardCardProps) {
  const d = DENSITY[density];
  return (
    <motion.div
      ref={nodeRef}
      role="gridcell"
      tabIndex={tabIndex}
      aria-label={`${card.ref}, ${card.title}, ${column.label}${
        assignee ? `, ${assignee.name}` : ""
      }${card.blocked ? ", blocked" : ""}${
        fresh ? `, ${fresh} new ${fresh === 1 ? "change" : "changes"}` : ""
      }`}
      aria-disabled={disabled || undefined}
      onFocus={onFocus}
      onClick={onPress}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPress();
          return;
        }
        onNav(event);
      }}
      initial={false}
      animate={{ scale: lifted && motionSafe ? 1.035 : 1 }}
      transition={springs.snap}
      className={cn(
        "relative flex cursor-pointer flex-col rounded-3 border border-hairline bg-surface-0 text-left transition-colors hover:border-hairline-strong",
        d.card,
        d.gap,
        done && "opacity-80",
        disabled && "cursor-default",
        FOCUS_RING,
      )}
    >
      <AnimatePresence>
        {pulse > 0 ? (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute -inset-px rounded-3"
            style={{
              boxShadow: `0 0 0 2px var(--accent-bright), 0 10px 26px -12px color-mix(in oklab, var(--accent-bright) 60%, transparent)`,
              background:
                "color-mix(in oklab, var(--accent-bright) 12%, transparent)",
            }}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{
              duration: durations.page,
              ease: easings.exit,
              delay: durations.base,
            }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          />
        ) : null}
      </AnimatePresence>
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          {card.ref}
        </span>
        <span className="flex items-center gap-1.5">
          {card.blocked ? (
            <Ban aria-hidden className="size-3 text-danger" />
          ) : null}
          {done ? <Check aria-hidden className="size-3 text-success" /> : null}
          <span className="relative flex size-2 items-center justify-center">
            {/* `custom` on the presence reaches the dot as it leaves, so the
                delay it fades with is the one Mark all seen decided. */}
            <AnimatePresence custom={dotDelay}>
              {fresh > 0 ? (
                <motion.span
                  key="dot"
                  custom={dotDelay}
                  className="absolute size-2 rounded-full bg-cobalt-bright"
                  variants={{
                    gone: (delay: number) => ({
                      opacity: 0,
                      scale: motionSafe ? 0.4 : 1,
                      transition: { ...exitFor(durations.base), delay },
                    }),
                  }}
                  initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit="gone"
                  transition={
                    motionSafe ? springs.recoil : { duration: durations.fast }
                  }
                />
              ) : null}
            </AnimatePresence>
          </span>
        </span>
      </span>
      <span
        className={cn(
          "leading-snug text-foreground",
          d.title,
          done && "line-through decoration-ink-3",
        )}
      >
        {card.title}
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] text-ink-3">
          {card.tag ?? ""}
        </span>
        <Avatar person={assignee} index={assigneeIndex} size={18} />
      </span>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Sheet                                  */
/* ----------------------------------------------------------------------- */

type Group = { kind: SinceKind; items: SinceChange[] };

type TreeItem = {
  key: string;
  kind: "group" | "change";
  group: Group;
  change?: SinceChange;
};

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Play = { queue: string[]; index: number };

/**
 * A project board with a catch-up sheet over it. The sheet rises on
 * `springs.glide` from the right or the foot when the board arrives, with
 * the digest: counts that roll on `springs.snap` (comments, done, blocked,
 * moved), then the changes grouped by kind, each group opening on glide with
 * the avatars and ages of what happened. Pressing a change jumps to it: the
 * sheet slides aside on the exit ease, the board scrolls the card into view,
 * and the card lifts once on snap under a highlight that fades out. Mark all
 * seen takes the sheet down and the board's new dots fade in a cascade.
 *
 * Catch me up plays the unseen changes oldest first: each one rises at the
 * foot of the board on glide as its card lifts and lights in turn, holding
 * for `pace` seconds, pausing while the tab is hidden or the surface is off
 * screen, and stopping at the end rather than looping.
 *
 * The sheet is a non-modal dialog that Escape closes; its groups and changes
 * are one tree (Up/Down, Right opens, Left closes, Enter jumps). The board is
 * a grid: Left/Right cross columns, Up/Down move within one, Enter opens a
 * card and marks its changes seen. Under reduced motion the sheet and the
 * captions cross-fade, counts place at once, the card lights without lifting
 * and the dots fade together — every change is still announced.
 */
export function SinceYouLeft({
  sheetSide = "right",
  pace = 1.6,
  density = "cozy",
  board = defaultSinceBoard,
  people = defaultSincePeople,
  changes = defaultSinceChanges,
  lastSeen = defaultSinceLastSeen,
  now = defaultSinceNow,
  value,
  defaultValue,
  onChange,
  defaultOpen = true,
  onOpenChange,
  onJump,
  onOpenCard,
  onPlayChange,
  status = "ready",
  onRetry,
  title = "Harbour app relaunch",
  sheetTitle = "Since you left",
  subtitle = "Coldbrook Projects",
  label,
  height = 540,
  disabled = false,
  className,
}: SinceYouLeftProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const sheetId = `${uid}-sheet`;
  const sheetTitleId = `${uid}-sheet-title`;
  const hintId = `${uid}-hint`;
  const d = DENSITY[density];

  const [own, setOwn] = React.useState<string[]>(() => defaultValue ?? []);
  const current = value ?? own;
  // What is seen as of the last commit, so a playback step that fires from
  // a timer, or two marks in one event, never read a stale set.
  const seenRef = React.useRef(current);
  React.useEffect(() => {
    seenRef.current = current;
  });
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [open, setOpen] = React.useState(defaultOpen);
  const [expanded, setExpanded] = React.useState<SinceKind[] | null>(null);
  const [activeItem, setActiveItem] = React.useState<string | null>(null);
  const [activeCard, setActiveCard] = React.useState<string | null>(null);
  const [pulse, setPulse] = React.useState<{ id: string; seq: number } | null>(
    null,
  );
  const [lifted, setLifted] = React.useState<string | null>(null);
  // The order the dots fade in after Mark all seen, fixed at that moment.
  const [cascadeOrder, setCascadeOrder] = React.useState<Record<
    string,
    number
  > | null>(null);
  const [play, setPlay] = React.useState<Play | null>(null);
  const [ended, setEnded] = React.useState<number | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const [focusReq, setFocusReq] = React.useState<{
    target: "card" | "item" | "reopen" | "switch";
    id?: string;
    seq: number;
  } | null>(null);

  // False for the server render and hydration, so a sheet already on the
  // page never rises in; true once the board is live.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const visible = React.useSyncExternalStore(
    (cb) => {
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
    () => !document.hidden,
    () => true,
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const cardNodes = React.useRef(new Map<string, HTMLDivElement>());
  const itemNodes = React.useRef(new Map<string, HTMLElement>());
  const reopenRef = React.useRef<HTMLButtonElement | null>(null);
  const switchRef = React.useRef<HTMLButtonElement | null>(null);
  const liftTimer = React.useRef<number | null>(null);
  const cascadeTimer = React.useRef<number | null>(null);
  const inView = useInView(rootRef, { amount: 0 });

  /* -------------------------------- data ------------------------------- */

  const ctx = React.useMemo<Ctx>(
    () => ({
      people: new Map(people.map((p) => [p.id, p])),
      cards: new Map(board.cards.map((c) => [c.id, c])),
      columns: new Map(board.columns.map((c) => [c.id, c])),
    }),
    [people, board],
  );
  const personIndex = (id: string | undefined) =>
    Math.max(
      0,
      people.findIndex((p) => p.id === id),
    );

  const seenSet = new Set(current);
  const unseen = changes
    .filter(
      (c) => c.at > lastSeen && !seenSet.has(c.id) && ctx.cards.has(c.cardId),
    )
    .sort((a, b) => b.at - a.at);
  const unseenIds = unseen.map((c) => c.id);
  const byKind = new Map<SinceKind, SinceChange[]>();
  for (const c of unseen)
    byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  const groups: Group[] = KINDS.filter((k) => byKind.has(k)).map((kind) => ({
    kind,
    items: byKind.get(kind) ?? [],
  }));
  const counts = Object.fromEntries(
    KINDS.map((k) => [k, byKind.get(k)?.length ?? 0]),
  ) as Record<SinceKind, number>;

  const freshByCard = new Map<string, number>();
  for (const c of unseen)
    freshByCard.set(c.cardId, (freshByCard.get(c.cardId) ?? 0) + 1);
  const dotted = board.cards
    .filter((c) => freshByCard.has(c.id))
    .map((c) => c.id);
  const sinceCount = changes.filter((c) => c.at > lastSeen).length;

  const openKinds: SinceKind[] =
    expanded ?? (groups[0] ? [groups[0].kind] : []);

  const treeItems: TreeItem[] = groups.flatMap((group) => {
    const head: TreeItem = { key: `g:${group.kind}`, kind: "group", group };
    if (!openKinds.includes(group.kind)) return [head];
    return [
      head,
      ...group.items.map<TreeItem>((change) => ({
        key: `c:${change.id}`,
        kind: "change",
        group,
        change,
      })),
    ];
  });
  const activeKey =
    activeItem && treeItems.some((t) => t.key === activeItem)
      ? activeItem
      : (treeItems[0]?.key ?? null);

  const columnsWithCards = board.columns.map((column) => ({
    column,
    cards: board.cards.filter((c) => c.columnId === column.id),
  }));
  const activeCardId =
    activeCard && ctx.cards.has(activeCard)
      ? activeCard
      : (board.cards[0]?.id ?? null);

  const playing = play !== null;
  const paused = !visible || !inView;
  const showSheet = ready && open && !playing && ended === null;

  /* ------------------------------- timers ------------------------------ */

  React.useEffect(
    () => () => {
      if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
      if (cascadeTimer.current !== null)
        window.clearTimeout(cascadeTimer.current);
    },
    [],
  );

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    const node =
      focusReq.target === "card"
        ? cardNodes.current.get(focusReq.id ?? "")
        : focusReq.target === "item"
          ? itemNodes.current.get(focusReq.id ?? "")
          : focusReq.target === "switch"
            ? switchRef.current
            : reopenRef.current;
    node?.focus({ preventScroll: true });
  }, [focusReq]);

  /* ------------------------------- changes ----------------------------- */

  const announce = (text: string) => setAnnouncement(text);

  const markSeen = (ids: string[], reason: SinceSeenReason) => {
    const have = new Set(seenRef.current);
    const fresh = ids.filter((id) => !have.has(id));
    if (fresh.length === 0) return;
    const next = [...seenRef.current, ...fresh];
    seenRef.current = next;
    if (value === undefined) setOwn(next);
    onChange?.(next, { ids: fresh, reason });
  };

  const setSheet = (next: boolean, reason: SinceOpenReason) => {
    if (next === open) return;
    setOpen(next);
    onOpenChange?.(next, reason);
  };

  /** Scrolls the board so a card is in view, within the board only; `foot` keeps it clear of the caption. */
  const reveal = (id: string, foot = 12) => {
    const node = cardNodes.current.get(id);
    const box = boardRef.current;
    if (!node || !box) return;
    const nr = node.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    const pad = 12;
    let dx = 0;
    let dy = 0;
    if (nr.left < br.left + pad) dx = nr.left - br.left - pad;
    else if (nr.right > br.right - pad) dx = nr.right - br.right + pad;
    if (nr.top < br.top + pad) dy = nr.top - br.top - pad;
    else if (nr.bottom > br.bottom - foot) dy = nr.bottom - br.bottom + foot;
    if (dx || dy) {
      box.scrollBy({
        left: dx,
        top: dy,
        behavior: motionSafe ? "smooth" : "auto",
      });
    }
  };

  /** Lifts a card once and lights it. */
  const flash = (id: string, foot = 12) => {
    setPulse((p) => ({ id, seq: (p?.seq ?? 0) + 1 }));
    setLifted(id);
    if (liftTimer.current !== null) window.clearTimeout(liftTimer.current);
    liftTimer.current = window.setTimeout(() => {
      liftTimer.current = null;
      setLifted(null);
    }, LIFT_MS);
    reveal(id, foot);
  };

  const jump = (change: SinceChange) => {
    if (inert) return;
    const card = ctx.cards.get(change.cardId);
    if (!card) return;
    markSeen([change.id], "jump");
    setSheet(false, "jump");
    setActiveCard(card.id);
    flash(card.id);
    setFocusReq((f) => ({
      target: "card",
      id: card.id,
      seq: (f?.seq ?? 0) + 1,
    }));
    onJump?.(change, card);
    announce(
      `Jumped to ${card.title} in ${ctx.columns.get(card.columnId)?.label ?? "the board"}. ${unseenIds.length - 1} left.`,
    );
  };

  const pressCard = (card: SinceCard) => {
    setActiveCard(card.id);
    if (inert) return;
    const ids = unseen.filter((c) => c.cardId === card.id).map((c) => c.id);
    markSeen(ids, "card");
    flash(card.id);
    onOpenCard?.(card);
    announce(
      ids.length
        ? `${card.title} opened. ${ids.length} ${ids.length === 1 ? "change" : "changes"} seen.`
        : `${card.title} opened.`,
    );
  };

  const markAll = () => {
    if (inert || unseenIds.length === 0) return;
    const n = unseenIds.length;
    setCascadeOrder(Object.fromEntries(dotted.map((id, i) => [id, i])));
    if (cascadeTimer.current !== null)
      window.clearTimeout(cascadeTimer.current);
    cascadeTimer.current = window.setTimeout(
      () => {
        cascadeTimer.current = null;
        setCascadeOrder(null);
      },
      Math.ceil(
        (dotted.length * cascade(dotted.length) + durations.base) * 1000,
      ),
    );
    markSeen(unseenIds, "all");
    setSheet(false, "all");
    setFocusReq((f) => ({ target: "reopen", seq: (f?.seq ?? 0) + 1 }));
    announce(`All ${n} ${n === 1 ? "change" : "changes"} marked seen.`);
  };

  const close = (reason: SinceOpenReason) => {
    setSheet(false, reason);
    setFocusReq((f) => ({ target: "reopen", seq: (f?.seq ?? 0) + 1 }));
    announce("Digest closed.");
  };

  const reopen = () => {
    if (!ready) return;
    setEnded(null);
    setSheet(true, "reopen");
    const first = treeItems[0]?.key;
    if (first)
      setFocusReq((f) => ({
        target: "item",
        id: first,
        seq: (f?.seq ?? 0) + 1,
      }));
    announce(
      unseenIds.length
        ? `Digest opened. ${unseenIds.length} ${unseenIds.length === 1 ? "change" : "changes"}.`
        : "Digest opened. Nothing new.",
    );
  };

  const toggleGroup = (kind: SinceKind) => {
    setExpanded(
      openKinds.includes(kind)
        ? openKinds.filter((k) => k !== kind)
        : [...openKinds, kind],
    );
    const n = counts[kind];
    announce(
      `${KIND_LABEL[kind]} ${openKinds.includes(kind) ? "collapsed" : "expanded"}, ${n} ${n === 1 ? KIND_WORD[kind].one : KIND_WORD[kind].other}.`,
    );
  };

  /* ------------------------------ slideshow ---------------------------- */

  const step = (queue: string[], index: number) => {
    const id = queue[index];
    const change = changes.find((c) => c.id === id);
    setPlay({ queue, index });
    if (!change) return;
    markSeen([change.id], "played");
    setActiveCard(change.cardId);
    flash(change.cardId, 150);
    announce(
      `${index + 1} of ${queue.length}: ${sentenceOf(change, ctx)}, ${ageOf(change.at, now)}.`,
    );
  };

  const startPlay = () => {
    if (inert || unseen.length === 0) return;
    const queue = [...unseen].sort((a, b) => a.at - b.at).map((c) => c.id);
    setEnded(null);
    onPlayChange?.(true);
    onOpenChange?.(false, "play");
    step(queue, 0);
  };

  const stopPlay = (reason: "stopped" | "ended") => {
    const n = play?.queue.length ?? 0;
    setPlay(null);
    onPlayChange?.(false);
    if (reason === "ended") {
      setEnded(n);
      announce(`That is everything: ${n} ${n === 1 ? "change" : "changes"}.`);
    } else {
      if (open) onOpenChange?.(true, "play");
      setFocusReq((f) => ({ target: "switch", seq: (f?.seq ?? 0) + 1 }));
      announce("Catch me up stopped.");
    }
  };

  const stepRef = React.useRef({ step, stopPlay });
  React.useEffect(() => {
    stepRef.current = { step, stopPlay };
  });

  React.useEffect(() => {
    if (!play || paused) return;
    const t = window.setTimeout(
      () => {
        const next = play.index + 1;
        if (next >= play.queue.length) stepRef.current.stopPlay("ended");
        else stepRef.current.step(play.queue, next);
      },
      Math.max(0.3, pace) * 1000,
    );
    return () => window.clearTimeout(t);
  }, [play, paused, pace]);

  /* ------------------------------ keyboard ----------------------------- */

  const navTree = (event: React.KeyboardEvent, item: TreeItem) => {
    const keys = treeItems.map((t) => t.key);
    const i = keys.indexOf(item.key);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = keys.length - 1;
    else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (item.kind === "group") {
        if (!openKinds.includes(item.group.kind)) toggleGroup(item.group.kind);
        else to = i + 1;
      }
      if (to < 0) return;
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (item.kind === "group" && openKinds.includes(item.group.kind)) {
        toggleGroup(item.group.kind);
        return;
      }
      if (item.kind === "change") {
        const target = `g:${item.group.kind}`;
        itemNodes.current.get(target)?.focus();
      }
      return;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (item.kind === "group") toggleGroup(item.group.kind);
      else if (item.change) jump(item.change);
      return;
    } else if (event.key === "Escape") {
      // The dialog around the tree also listens for Escape; this one is done.
      event.preventDefault();
      event.stopPropagation();
      close("escape");
      return;
    } else return;
    event.preventDefault();
    const target = keys[clamp(to, 0, keys.length - 1)];
    if (target) itemNodes.current.get(target)?.focus();
  };

  const navBoard = (event: React.KeyboardEvent, card: SinceCard) => {
    const col = columnsWithCards.findIndex(
      (c) => c.column.id === card.columnId,
    );
    const list = columnsWithCards[col]?.cards ?? [];
    const row = list.findIndex((c) => c.id === card.id);
    let target: SinceCard | undefined;
    if (event.key === "ArrowDown") target = list[row + 1];
    else if (event.key === "ArrowUp") target = list[row - 1];
    else if (event.key === "Home") target = list[0];
    else if (event.key === "End") target = list[list.length - 1];
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const dir = event.key === "ArrowRight" ? 1 : -1;
      let c = col + dir;
      while (c >= 0 && c < columnsWithCards.length) {
        const cards = columnsWithCards[c]?.cards ?? [];
        if (cards.length) {
          target = cards[clamp(row, 0, cards.length - 1)];
          break;
        }
        c += dir;
      }
    } else if (event.key === "Escape" && playing) {
      event.preventDefault();
      stopPlay("stopped");
      return;
    } else return;
    event.preventDefault();
    if (target) {
      cardNodes.current.get(target.id)?.focus();
      reveal(target.id);
    }
  };

  /* ------------------------------- render ------------------------------ */

  const away = spanOf(now - lastSeen);
  const total = unseenIds.length;
  const right = sheetSide === "right";
  const offscreen = right ? { x: "100%", y: 0 } : { x: 0, y: "100%" };
  const shown = play
    ? changes.find((c) => c.id === play.queue[play.index])
    : undefined;

  const renderCaption = () => {
    if (play && shown) {
      const actor = ctx.people.get(shown.actor);
      const card = ctx.cards.get(shown.cardId);
      return (
        <motion.div
          key={`play-${shown.id}`}
          role="group"
          aria-label={`Catch me up, ${play.index + 1} of ${play.queue.length}`}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              stopPlay("stopped");
            }
          }}
          initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { ...springs.glide, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          className="flex flex-col gap-2 rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
              {play.index + 1} of {play.queue.length}
              {paused ? " · paused" : ""}
            </span>
            <button
              type="button"
              onClick={() => stopPlay("stopped")}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-2 px-1.5 text-[11px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                FOCUS_RING,
              )}
            >
              <Square aria-hidden className="size-3 fill-current" />
              Stop
            </button>
          </div>
          <div className="flex items-start gap-2.5">
            <Avatar person={actor} index={personIndex(shown.actor)} size={26} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-[13px] leading-snug text-foreground">
                {sentenceOf(shown, ctx)}
              </p>
              {shown.text ? (
                <p className="line-clamp-2 text-[12px] leading-snug text-ink-2">
                  &ldquo;{shown.text}&rdquo;
                </p>
              ) : null}
              <p className="font-mono text-[10px] text-ink-3">
                {card?.ref} · {ageOf(shown.at, now)}
              </p>
            </div>
          </div>
          <div aria-hidden className="flex gap-1">
            {play.queue.map((id, i) => (
              <span
                key={id}
                className="h-1 flex-1 rounded-full transition-colors duration-200"
                style={{
                  background:
                    i <= play.index
                      ? "var(--accent-bright)"
                      : "var(--hairline-strong)",
                }}
              />
            ))}
          </div>
        </motion.div>
      );
    }
    if (ended !== null) {
      return (
        <motion.div
          key="ended"
          role="group"
          aria-label="Caught up"
          initial={{ opacity: 0, y: motionSafe ? distances.shift : 0 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { ...springs.recoil, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
          className="flex items-center gap-3 rounded-3 border border-hairline-strong bg-popover p-3 shadow-[0_14px_34px_-14px_color-mix(in_oklab,black_45%,transparent)]"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] text-success">
            <Check aria-hidden className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] text-foreground">
            That is everything.{" "}
            <span className="text-ink-2">
              {ended} {ended === 1 ? "change" : "changes"} while you were away.
            </span>
          </p>
          <button
            type="button"
            onClick={() => {
              setEnded(null);
              setSheet(false, "all");
              setFocusReq((f) => ({
                target: "reopen",
                seq: (f?.seq ?? 0) + 1,
              }));
            }}
            className={cn(
              "inline-flex h-7 shrink-0 items-center rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            Done
          </button>
        </motion.div>
      );
    }
    return null;
  };

  const captionOrPill = playing || ended !== null;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      className={cn(
        "@container relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
      style={{ height }}
    >
      <p id={hintId} className="sr-only">
        Arrow keys move between cards. Enter opens a card and marks its changes
        seen.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          {subtitle ? (
            <span className="hidden shrink-0 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @min-[30rem]:inline">
              {subtitle}
            </span>
          ) : null}
        </div>
        <button
          ref={reopenRef}
          type="button"
          onClick={() => (showSheet ? close("escape") : reopen())}
          aria-expanded={showSheet}
          aria-controls={showSheet ? sheetId : undefined}
          aria-disabled={!ready || undefined}
          className={cn(
            "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
            total > 0 && ready
              ? "border-[color-mix(in_oklab,var(--accent-bright)_35%,transparent)] bg-cobalt-wash text-cobalt-bright hover:bg-[color-mix(in_oklab,var(--accent-bright)_20%,transparent)]"
              : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
            FOCUS_RING,
          )}
        >
          <Eye aria-hidden className="size-3.5" />
          {ready ? (
            <>
              <span className="sr-only">
                {total} new {total === 1 ? "change" : "changes"}
              </span>
              <Roll
                value={total}
                motionSafe={motionSafe}
                className="font-mono text-[12px]"
              />
              <span aria-hidden>new</span>
            </>
          ) : (
            <span>Digest</span>
          )}
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        {status === "error" ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
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
        ) : status === "loading" ? (
          <div
            aria-hidden
            className="grid h-full auto-cols-[minmax(10rem,1fr)] grid-flow-col gap-3 overflow-hidden p-3"
          >
            {Array.from({ length: 4 }, (_, c) => (
              <div key={c} className="flex flex-col gap-2">
                <span
                  className="h-3 w-20 rounded-1 bg-surface-2 motion-safe:animate-pulse"
                  style={{ animationDelay: `${c * 90}ms` }}
                />
                {Array.from({ length: 3 - (c % 2) }, (_, i) => (
                  <span
                    key={i}
                    className="h-16 rounded-3 bg-surface-2 motion-safe:animate-pulse"
                    style={{ animationDelay: `${c * 90 + i * 70}ms` }}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : board.cards.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-6 text-center">
            <Columns3 aria-hidden className="size-5 text-ink-3" />
            <p className="text-sm text-ink-2">No cards on this board yet.</p>
          </div>
        ) : (
          <div
            ref={boardRef}
            role="grid"
            aria-label={`${title} board`}
            aria-describedby={hintId}
            className="grid h-full auto-cols-[minmax(10.5rem,1fr)] grid-flow-col gap-3 overflow-auto overscroll-contain p-3 @min-[56rem]:auto-cols-[minmax(13rem,1fr)]"
          >
            {columnsWithCards.map(({ column, cards }) => (
              <div key={column.id} className="flex min-w-0 flex-col">
                <div
                  aria-hidden
                  className="flex items-center justify-between gap-2 px-0.5 pb-1.5"
                >
                  <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    {column.label}
                  </span>
                  <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                    {cards.length}
                  </span>
                </div>
                <div
                  role="row"
                  aria-label={`${column.label}, ${cards.length} ${cards.length === 1 ? "card" : "cards"}`}
                  className={cn("flex min-w-0 flex-col", d.col)}
                >
                  {cards.map((card) => (
                    <BoardCard
                      key={card.id}
                      card={card}
                      column={column}
                      assignee={ctx.people.get(card.assignee ?? "")}
                      assigneeIndex={personIndex(card.assignee)}
                      fresh={freshByCard.get(card.id) ?? 0}
                      dotDelay={
                        cascadeOrder && motionSafe
                          ? r3(
                              (cascadeOrder[card.id] ?? 0) *
                                cascade(Object.keys(cascadeOrder).length),
                            )
                          : 0
                      }
                      pulse={pulse?.id === card.id ? pulse.seq : 0}
                      lifted={lifted === card.id}
                      density={density}
                      motionSafe={motionSafe}
                      tabIndex={card.id === activeCardId ? 0 : -1}
                      disabled={inert}
                      done={
                        column.id ===
                        board.columns[board.columns.length - 1]?.id
                      }
                      nodeRef={(node) => {
                        if (node) cardNodes.current.set(card.id, node);
                        else cardNodes.current.delete(card.id);
                      }}
                      onPress={() => pressCard(card)}
                      onFocus={() => setActiveCard(card.id)}
                      onNav={(event) => navBoard(event, card)}
                    />
                  ))}
                  {cards.length === 0 ? (
                    <span className="rounded-3 border border-dashed border-hairline px-2 py-3 text-center text-[11px] text-ink-3">
                      Empty
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Slideshow caption, or the caught-up landing. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-3 bottom-3 z-10",
            right && "@min-[40rem]:left-auto @min-[40rem]:w-[22rem]",
          )}
        >
          <div className="pointer-events-auto">
            <AnimatePresence mode="wait">{renderCaption()}</AnimatePresence>
          </div>
        </div>

        {/* The sheet. */}
        <AnimatePresence>
          {showSheet ? (
            <motion.section
              key="sheet"
              id={sheetId}
              role="dialog"
              aria-modal={false}
              aria-labelledby={sheetTitleId}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !event.defaultPrevented) {
                  event.preventDefault();
                  close("escape");
                }
              }}
              initial={
                live
                  ? motionSafe
                    ? { ...offscreen, opacity: 1 }
                    : { opacity: 0 }
                  : false
              }
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      ...offscreen,
                      opacity: 1,
                      transition: exitFor(durations.slow),
                    }
                  : { opacity: 0, transition: exitFor(durations.base) }
              }
              transition={springs.glide}
              className={cn(
                "absolute z-20 flex flex-col bg-popover shadow-[0_-10px_40px_-16px_color-mix(in_oklab,black_50%,transparent)]",
                right
                  ? "inset-y-0 right-0 w-full border-l border-hairline-strong @min-[40rem]:w-[22rem]"
                  : "inset-x-0 bottom-0 max-h-[82%] rounded-t-3 border-t border-hairline-strong @min-[40rem]:inset-x-3",
              )}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-4 pt-3 pb-2">
                <div className="min-w-0">
                  <p
                    id={sheetTitleId}
                    className="truncate text-sm font-semibold"
                  >
                    {sheetTitle}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                    away {away}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => close("escape")}
                  aria-label="Close digest"
                  className={cn(
                    "inline-flex size-7 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>

              {total === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
                  {sinceCount > 0 ? (
                    <CircleCheck aria-hidden className="size-5 text-success" />
                  ) : (
                    <Moon aria-hidden className="size-5 text-ink-3" />
                  )}
                  <p className="text-sm text-foreground">
                    {sinceCount > 0
                      ? "You are caught up."
                      : "Nothing happened while you were away."}
                  </p>
                  <p className="text-[12px] text-ink-3">
                    {sinceCount > 0
                      ? `All ${sinceCount} ${sinceCount === 1 ? "change" : "changes"} from the last ${away} seen.`
                      : `The board is as you left it ${away} ago.`}
                  </p>
                  <button
                    type="button"
                    onClick={() => close("escape")}
                    className={cn(
                      "mt-1 inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-xs text-foreground transition-colors hover:bg-surface-2",
                      FOCUS_RING,
                    )}
                  >
                    Back to the board
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "grid shrink-0 gap-1.5 px-4 pb-2",
                      right
                        ? "grid-cols-2"
                        : "grid-cols-2 @min-[40rem]:grid-cols-4",
                    )}
                  >
                    {(
                      ["comment", "done", "blocked", "moved"] as SinceKind[]
                    ).map((kind) => {
                      const n = counts[kind];
                      return (
                        <button
                          key={kind}
                          type="button"
                          aria-label={`${n} ${n === 1 ? KIND_WORD[kind].one : KIND_WORD[kind].other}`}
                          aria-disabled={n === 0 || inert || undefined}
                          onClick={() => {
                            if (n === 0 || inert) return;
                            if (!openKinds.includes(kind)) toggleGroup(kind);
                            setFocusReq((f) => ({
                              target: "item",
                              id: `g:${kind}`,
                              seq: (f?.seq ?? 0) + 1,
                            }));
                          }}
                          className={cn(
                            "flex items-center gap-2 rounded-3 border border-hairline bg-surface-0 px-2.5 py-1.5 text-left transition-colors",
                            n > 0 && !inert
                              ? "hover:border-hairline-strong"
                              : "cursor-default",
                            FOCUS_RING,
                          )}
                        >
                          <span
                            aria-hidden
                            className="flex size-6 shrink-0 items-center justify-center rounded-2"
                            style={{
                              background: `color-mix(in oklab, ${KIND_TONE[kind]} ${n ? 16 : 6}%, transparent)`,
                              color: n
                                ? `color-mix(in oklab, ${KIND_TONE[kind]} 80%, var(--ink))`
                                : "var(--ink-3)",
                            }}
                          >
                            <KindIcon kind={kind} />
                          </span>
                          <span className="flex min-w-0 flex-col">
                            <Roll
                              value={n}
                              motionSafe={motionSafe}
                              className={cn(
                                "font-mono text-[15px] font-medium",
                                n ? "text-foreground" : "text-ink-3",
                              )}
                            />
                            <span
                              aria-hidden
                              className="truncate font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase"
                            >
                              {n === 1
                                ? KIND_WORD[kind].one
                                : KIND_WORD[kind].other}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-3 border-y border-hairline px-4 py-2">
                    <span className="text-[12px] text-ink-2">Catch me up</span>
                    <button
                      ref={switchRef}
                      type="button"
                      role="switch"
                      aria-checked={false}
                      aria-label={`Catch me up, play ${total} ${total === 1 ? "change" : "changes"} one at a time`}
                      aria-disabled={inert || undefined}
                      onClick={startPlay}
                      className={cn(
                        "group inline-flex items-center gap-2 rounded-full",
                        FOCUS_RING,
                      )}
                    >
                      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase group-hover:text-ink-2">
                        {pace.toFixed(1)}s each
                      </span>
                      <span
                        aria-hidden
                        className="relative flex h-5 w-9 items-center rounded-full border border-hairline-strong bg-surface-2 px-0.5 transition-colors group-hover:border-ink-3"
                      >
                        <span className="flex size-4 items-center justify-center rounded-full bg-card text-ink-2 shadow-[0_1px_2px_color-mix(in_oklab,black_30%,transparent)]">
                          <Play className="size-2.5 fill-current" />
                        </span>
                      </span>
                    </button>
                  </div>

                  <ul
                    role="tree"
                    aria-label={`${total} ${total === 1 ? "change" : "changes"} since you left`}
                    className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1.5"
                  >
                    {groups.map((group, gi) => {
                      const isOpen = openKinds.includes(group.kind);
                      const key = `g:${group.kind}`;
                      const n = group.items.length;
                      const actors = Array.from(
                        new Set(group.items.map((c) => c.actor)),
                      ).slice(0, 4);
                      return (
                        <li
                          key={group.kind}
                          role="treeitem"
                          aria-expanded={isOpen}
                          aria-selected={activeKey === key}
                          aria-level={1}
                          aria-setsize={groups.length}
                          aria-posinset={gi + 1}
                          aria-label={`${n} ${n === 1 ? KIND_WORD[group.kind].one : KIND_WORD[group.kind].other}`}
                          tabIndex={activeKey === key ? 0 : -1}
                          ref={(node) => {
                            if (node) itemNodes.current.set(key, node);
                            else itemNodes.current.delete(key);
                          }}
                          onFocus={(event) => {
                            if (event.target === event.currentTarget)
                              setActiveItem(key);
                          }}
                          onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            navTree(event, { key, kind: "group", group });
                          }}
                          onClick={(event) => {
                            if (event.target !== event.currentTarget) return;
                            toggleGroup(group.kind);
                          }}
                          className={cn(
                            "rounded-2 transition-colors",
                            FOCUS_RING,
                          )}
                        >
                          <div
                            onClick={() => toggleGroup(group.kind)}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-2 px-2 hover:bg-surface-2",
                              d.row,
                            )}
                          >
                            <motion.span
                              aria-hidden
                              initial={false}
                              animate={{ rotate: isOpen ? 90 : 0 }}
                              transition={
                                motionSafe ? springs.snap : { duration: 0 }
                              }
                              className="flex size-4 items-center justify-center text-ink-3"
                            >
                              <ChevronRight className="size-3.5" />
                            </motion.span>
                            <span
                              aria-hidden
                              className="flex size-5 items-center justify-center rounded-2"
                              style={{
                                background: `color-mix(in oklab, ${KIND_TONE[group.kind]} 16%, transparent)`,
                                color: `color-mix(in oklab, ${KIND_TONE[group.kind]} 80%, var(--ink))`,
                              }}
                            >
                              <KindIcon kind={group.kind} className="size-3" />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                              <span className="font-mono tabular-nums">
                                {n}
                              </span>{" "}
                              {n === 1
                                ? KIND_WORD[group.kind].one
                                : KIND_WORD[group.kind].other}
                            </span>
                            <span aria-hidden className="flex -space-x-1.5">
                              {actors.map((id) => (
                                <Avatar
                                  key={id}
                                  person={ctx.people.get(id)}
                                  index={personIndex(id)}
                                  size={18}
                                />
                              ))}
                            </span>
                          </div>
                          <AnimatePresence initial={false}>
                            {isOpen ? (
                              <motion.ul
                                key="items"
                                role="group"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{
                                  height: 0,
                                  opacity: 0,
                                  transition: exitFor(durations.base),
                                }}
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
                                {group.items.map((change, ci) => {
                                  const ckey = `c:${change.id}`;
                                  const actor = ctx.people.get(change.actor);
                                  const card = ctx.cards.get(change.cardId);
                                  return (
                                    <motion.li
                                      key={change.id}
                                      role="treeitem"
                                      aria-selected={activeKey === ckey}
                                      aria-level={2}
                                      aria-setsize={group.items.length}
                                      aria-posinset={ci + 1}
                                      aria-label={`${sentenceOf(change, ctx)}, ${ageOf(change.at, now)}`}
                                      tabIndex={activeKey === ckey ? 0 : -1}
                                      ref={(node) => {
                                        if (node)
                                          itemNodes.current.set(ckey, node);
                                        else itemNodes.current.delete(ckey);
                                      }}
                                      onFocus={() => setActiveItem(ckey)}
                                      onKeyDown={(event) => {
                                        event.stopPropagation();
                                        navTree(event, {
                                          key: ckey,
                                          kind: "change",
                                          group,
                                          change,
                                        });
                                      }}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        jump(change);
                                      }}
                                      initial={
                                        live
                                          ? {
                                              opacity: 0,
                                              y: motionSafe
                                                ? distances.nudge
                                                : 0,
                                            }
                                          : false
                                      }
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{
                                        y: motionSafe
                                          ? {
                                              ...springs.glide,
                                              delay: r3(
                                                Math.min(ci, 8) *
                                                  cascade(group.items.length),
                                              ),
                                            }
                                          : { duration: 0 },
                                        opacity: {
                                          duration: durations.base,
                                          ease: easings.enter,
                                        },
                                      }}
                                      className={cn(
                                        "ml-4 flex cursor-pointer items-start gap-2 rounded-2 px-2 transition-colors hover:bg-surface-2",
                                        d.row,
                                        inert && "cursor-default",
                                        FOCUS_RING,
                                      )}
                                    >
                                      <Avatar
                                        person={actor}
                                        index={personIndex(change.actor)}
                                        size={22}
                                        className="mt-px"
                                      />
                                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="text-[12.5px] leading-snug text-foreground">
                                          {sentenceOf(change, ctx)}
                                        </span>
                                        {change.text ? (
                                          <span className="line-clamp-2 text-[11.5px] leading-snug text-ink-2">
                                            &ldquo;{change.text}&rdquo;
                                          </span>
                                        ) : null}
                                        <span className="font-mono text-[10px] text-ink-3">
                                          {card?.ref} · {ageOf(change.at, now)}
                                        </span>
                                      </span>
                                      <ArrowRight
                                        aria-hidden
                                        className="mt-1 size-3 shrink-0 text-ink-3"
                                      />
                                    </motion.li>
                                  );
                                })}
                              </motion.ul>
                            ) : null}
                          </AnimatePresence>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-4 py-2.5">
                    <span className="text-[11px] text-ink-3">
                      Enter jumps to a change on the board.
                    </span>
                    <button
                      type="button"
                      onClick={markAll}
                      aria-disabled={inert || undefined}
                      className={cn(
                        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 bg-primary px-2.5 text-xs text-primary-foreground transition-opacity hover:opacity-90",
                        inert && "cursor-default opacity-60",
                        FOCUS_RING,
                      )}
                    >
                      <Check aria-hidden className="size-3.5" />
                      Mark all seen
                    </button>
                  </div>
                </>
              )}
            </motion.section>
          ) : null}
        </AnimatePresence>

        {/* A pill to bring the sheet back once it has gone aside. */}
        <AnimatePresence>
          {ready && !showSheet && !captionOrPill && total > 0 ? (
            <motion.button
              key="pill"
              type="button"
              onClick={reopen}
              aria-controls={sheetId}
              aria-expanded={false}
              initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? {
                      ...springs.recoil,
                      opacity: { duration: durations.fast },
                      delay: durations.fast,
                    }
                  : { duration: durations.fast }
              }
              className={cn(
                "absolute right-3 bottom-3 z-10 inline-flex h-8 items-center gap-2 rounded-full border border-hairline-strong bg-popover pr-3 pl-2.5 text-xs text-foreground shadow-[0_10px_24px_-12px_color-mix(in_oklab,black_45%,transparent)] transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className="size-2 rounded-full bg-cobalt-bright"
              />
              <span className="sr-only">Open the digest,</span>
              {total} left since you left
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
