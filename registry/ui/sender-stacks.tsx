"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  GitPullRequest,
  Receipt,
  Rocket,
  RotateCcw,
  ShieldAlert,
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

/* ----------------------------------------------------------------------- */
/*                                   Types                                  */
/* ----------------------------------------------------------------------- */

export type SenderIcon =
  "deploy" | "review" | "billing" | "mention" | "alert" | "calendar";

/** Who sends notifications: each source becomes one stack. */
export type SenderSource = { id: string; name: string; icon?: SenderIcon };

export type SenderItem = {
  id: string;
  /** The source id this notification belongs to. */
  source: string;
  title: string;
  /** One line under the title. */
  body?: string;
  /** When it arrived, ms since the epoch. */
  at: number;
  /** Already read. @default false */
  read?: boolean;
};

export type SenderCardStyle = "raised" | "flat" | "outline";
export type SenderStacksStatus = "ready" | "loading" | "error";

export type SenderStacksProps = {
  /** The notifications, in any order; they are grouped by `source`. @default defaultSenderItems (11) */
  items?: SenderItem[];
  /** The sources, with their names and glyphs. @default defaultSenderSources */
  sources?: SenderSource[];
  /** The moment relative times count from, ms. @default defaultSenderNow */
  now?: number;
  /** Controlled open stacks: source ids. */
  open?: string[];
  /** Initial open stacks when uncontrolled. @default [] */
  defaultOpen?: string[];
  /** Fires from the press or key that opened or closed a stack. */
  onOpenChange?: (open: string[]) => void;
  /** Let several stacks stay open at once. @default false */
  multiple?: boolean;
  /** A stack was opened. */
  onOpen?: (sourceId: string) => void;
  /** A stack was dismissed, with the ids it held. */
  onDismiss?: (sourceId: string, itemIds: string[]) => void;
  /** Undo brought a dismissed stack back. */
  onRestore?: (sourceId: string) => void;
  /** A stack was marked read, with the ids that were unread. */
  onMarkRead?: (sourceId: string, itemIds: string[]) => void;
  /** Mark all read was pressed, with every id that was unread. */
  onMarkAllRead?: (itemIds: string[]) => void;
  /** A notification in an open stack was pressed. */
  onItemOpen?: (item: SenderItem) => void;
  /** How many cards peek under each stack's top card, 0 to 4. @default 2 */
  stackDepth?: number;
  /** Shadowed paper cards, filled flat cards, or hairline outline cards. @default "raised" */
  cardStyle?: SenderCardStyle;
  /** Count pills, unread dots and an open stack's rail. Any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** How long Undo is offered after a dismissal, ms. @default 5000 */
  undoMs?: number;
  /** Tallest the panel grows before its stacks scroll, px. @default 560 */
  maxHeight?: number;
  /** The panel's heading. @default "Notifications" */
  title?: string;
  /** Whether the notifications have arrived. @default "ready" */
  status?: SenderStacksStatus;
  /** Try again was pressed after they failed to load. */
  onReload?: () => void;
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
/** A Monday morning in October, fixed so every machine draws the same panel. */
export const defaultSenderNow = Date.UTC(2026, 9, 12, 9, 40);
const N = defaultSenderNow;

export const defaultSenderSources: SenderSource[] = [
  { id: "deploys", name: "Coldbrook deploys", icon: "deploy" },
  { id: "reviews", name: "Review requests", icon: "review" },
  { id: "mentions", name: "Mentions", icon: "mention" },
  { id: "billing", name: "Billing", icon: "billing" },
];

export const defaultSenderItems: SenderItem[] = [
  {
    id: "d1",
    source: "deploys",
    title: "api-gateway is live",
    body: "main → production · 3 checks passed",
    at: N - 3 * MIN,
  },
  {
    id: "d2",
    source: "deploys",
    title: "web-console is live",
    body: "main → production · built in 41 s",
    at: N - 26 * MIN,
  },
  {
    id: "d3",
    source: "deploys",
    title: "ledger-worker rolled back",
    body: "Back on v2.18.4 after a failed health check",
    at: N - 72 * MIN,
  },
  {
    id: "d4",
    source: "deploys",
    title: "Preview ready for PR 1182",
    body: "pricing-copy · coldbrook-preview-1182",
    at: N - 130 * MIN,
    read: true,
  },
  {
    id: "r1",
    source: "reviews",
    title: "Mara Ruiz asked you to review PR 1188",
    body: "Retry uploads with full jitter",
    at: N - 8 * MIN,
  },
  {
    id: "r2",
    source: "reviews",
    title: "Joel Okafor asked you to review PR 1185",
    body: "Move the readings export to a worker",
    at: N - 41 * MIN,
  },
  {
    id: "r3",
    source: "reviews",
    title: "Ines Varga re-requested your review",
    body: "PR 1179 · Round ledger totals to cents",
    at: N - 190 * MIN,
    read: true,
  },
  {
    id: "m1",
    source: "mentions",
    title: "Priya mentioned you in #ops-harbour",
    body: "Can you check the gauge on pier 4 before noon?",
    at: N - 15 * MIN,
  },
  {
    id: "m2",
    source: "mentions",
    title: "Kenji replied in Readings export",
    body: "The 30-day CSV is 215 MB, so email it.",
    at: N - 300 * MIN,
    read: true,
  },
  {
    id: "b1",
    source: "billing",
    title: "Invoice INV-2214 is ready",
    body: "Coldbrook Pro · 14 seats · paid",
    at: N - 125 * MIN,
  },
  {
    id: "b2",
    source: "billing",
    title: "Your card expires next month",
    body: "Update it before 1 November to keep paying by card",
    at: N - 26 * 60 * MIN,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const ICONS: Record<SenderIcon, typeof Bell> = {
  deploy: Rocket,
  review: GitPullRequest,
  billing: Receipt,
  mention: AtSign,
  alert: ShieldAlert,
  calendar: CalendarClock,
};

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

/** Every card is this tall, so the pile and the list are pure arithmetic. */
const CARD_H = 60;
const GAP = 6;
const PEEK = 6;
const PEEK_LIFT = 9;

const r2 = (v: number) => Math.round(v * 100) / 100;

const ago = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** A count whose digit rolls toward the direction it moved, on snap. */
function Rolling({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const [last, setLast] = React.useState(value);
  const [dir, setDir] = React.useState(1);
  if (last !== value) {
    setDir(value > last ? 1 : -1);
    setLast(value);
  }
  const text = String(value);
  return (
    <span
      className="relative inline-flex justify-center overflow-clip tabular-nums"
      style={{
        width: `${text.length}ch`,
        height: "1.2em",
        lineHeight: "1.2em",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={text}
          custom={dir}
          className="inline-block"
          variants={{
            enter: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${d * 80}%` : 0,
            }),
            shown: { opacity: 1, y: "0%" },
            leave: (d: number) => ({
              opacity: 0,
              y: motionSafe ? `${-d * 80}%` : 0,
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

type Group = {
  source: SenderSource;
  items: SenderItem[];
  newest: number;
};

/* ----------------------------------------------------------------------- */
/*                                 One stack                                */
/* ----------------------------------------------------------------------- */

type StackProps = {
  group: Group;
  isOpen: boolean;
  depth: number;
  style: SenderCardStyle;
  read: ReadonlySet<string>;
  now: number;
  motionSafe: boolean;
  disabled: boolean;
  leaving: boolean;
  focusKey: string | null;
  uid: string;
  register: (key: string, node: HTMLElement | null) => void;
  setPile: (id: string, node: HTMLDivElement | null) => void;
  onToggle: (id: string) => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
  onItem: (item: SenderItem) => void;
  onFocusKey: (key: string) => void;
};

/**
 * A source's notifications as a neat pile: the newest on the top card, the
 * next `depth` peeking below it, each lower, narrower and a shade darker,
 * with the unread count on top. Opening fans the cards down into a list on
 * glide, top card first; closing gathers them back in reverse. Every card
 * has the same height, so both poses are arithmetic, not measurement.
 */
function Stack({
  group,
  isOpen,
  depth,
  style,
  read,
  now,
  motionSafe,
  disabled,
  leaving,
  focusKey,
  uid,
  register,
  setPile,
  onToggle,
  onMarkRead,
  onDismiss,
  onItem,
  onFocusKey,
}: StackProps) {
  const { source, items } = group;
  const n = items.length;
  const unread = items.filter((i) => !read.has(i.id)).length;
  const top = items[0];
  const Icon = ICONS[source.icon ?? "alert"] ?? Bell;
  const [hover, setHover] = React.useState(false);
  const shownDepth = Math.min(depth, n - 1);
  const peek = hover && !isOpen && motionSafe ? PEEK_LIFT : PEEK;
  const pileH = isOpen
    ? n * CARD_H + (n - 1) * GAP
    : CARD_H + Math.max(0, shownDepth) * peek;
  const step = cascade(n);
  const headerKey = `h:${source.id}`;
  const pileId = `${uid}-pile-${source.id}`;
  const active =
    focusKey === headerKey ||
    (focusKey !== null && items.some((i) => focusKey === `c:${i.id}`));

  const [seenOpen, setSeenOpen] = React.useState(isOpen);
  const [flip, setFlip] = React.useState(0);
  if (seenOpen !== isOpen) {
    setSeenOpen(isOpen);
    setFlip((f) => f + 1);
  }
  // Reduced motion trades the fan for a short cross-fade of the whole pile,
  // carried by a motion value so no extra animation state is made per node.
  const pileOpacity = useMotionValue(1);
  React.useEffect(() => {
    if (flip === 0 || motionSafe) {
      pileOpacity.jump(1);
      return;
    }
    const c = animate(pileOpacity, [0.35, 1], { duration: durations.fast });
    return () => c.complete();
  }, [flip, motionSafe, pileOpacity]);

  const headerName = `${source.name}, ${
    unread > 0 ? `${unread} new` : "all read"
  }${top ? `, newest: ${top.title}, ${ago(top.at, now)} ago` : ""}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1">
        <button
          ref={(node) => register(headerKey, node)}
          type="button"
          data-key={headerKey}
          aria-expanded={isOpen}
          aria-controls={pileId}
          aria-label={headerName}
          aria-disabled={disabled || undefined}
          tabIndex={focusKey === headerKey ? 0 : -1}
          onFocus={() => onFocusKey(headerKey)}
          onClick={() => {
            if (!disabled && !leaving) onToggle(source.id);
          }}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-2 px-1.5 text-left transition-colors hover:bg-surface-2",
            FOCUS_IN,
          )}
        >
          <span
            aria-hidden
            className="flex size-7 shrink-0 items-center justify-center rounded-2 bg-[color-mix(in_oklab,var(--ss-accent)_13%,transparent)] text-(--ss-accent)"
          >
            <Icon className="size-3.5" />
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {source.name}
            </span>
            <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
              {unread > 0 ? `${unread} new · ` : ""}
              {top ? ago(top.at, now) : ""}
            </span>
          </span>
          <motion.span
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center text-ink-3"
            initial={false}
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={motionSafe ? springs.snap : { duration: 0 }}
          >
            <ChevronDown className="size-4" />
          </motion.span>
        </button>
        <button
          type="button"
          aria-label={`Mark ${source.name} read`}
          title="Mark read"
          tabIndex={active ? 0 : -1}
          aria-disabled={disabled || unread === 0 || undefined}
          onClick={() => {
            if (!disabled && unread > 0) onMarkRead(source.id);
          }}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-35 aria-disabled:hover:bg-transparent",
            FOCUS_IN,
          )}
        >
          <Check aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Dismiss ${source.name}`}
          title="Dismiss"
          tabIndex={active ? 0 : -1}
          aria-disabled={disabled || undefined}
          onClick={() => {
            if (!disabled) onDismiss(source.id);
          }}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            FOCUS_IN,
          )}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <motion.div
        ref={(node: HTMLDivElement | null) => setPile(source.id, node)}
        id={pileId}
        role={isOpen ? "list" : undefined}
        aria-label={isOpen ? `${source.name} notifications` : undefined}
        aria-hidden={isOpen ? undefined : true}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHover(true);
        }}
        onPointerLeave={() => setHover(false)}
        onClick={() => {
          if (!isOpen && !disabled && !leaving) onToggle(source.id);
        }}
        className={cn("relative", isOpen ? "pl-2.5" : "cursor-pointer")}
        style={{ opacity: pileOpacity }}
        initial={false}
        animate={{ height: pileH }}
        transition={
          motionSafe
            ? { ...springs.glide, delay: isOpen ? 0 : step * 0.5 }
            : { duration: 0 }
        }
      >
        <motion.span
          aria-hidden
          className="absolute top-1 bottom-1 left-0 w-0.5 rounded-full bg-(--ss-accent)"
          initial={false}
          animate={{ opacity: isOpen ? 0.7 : 0, scaleY: isOpen ? 1 : 0.4 }}
          style={{ transformOrigin: "50% 0%" }}
          transition={{ duration: durations.base, ease: easings.enter }}
        />
        {items.map((item, i) => {
          const layer = Math.min(i, Math.max(0, shownDepth));
          const hidden = !isOpen && i > shownDepth;
          const y = isOpen ? i * (CARD_H + GAP) : layer * peek;
          const scale = isOpen ? 1 : r2(1 - layer * 0.05);
          const delay = motionSafe
            ? isOpen
              ? i * step
              : (n - 1 - i) * step * 0.6
            : 0;
          const unreadDot = !read.has(item.id);
          const tint = isOpen ? 0 : layer;
          return (
            <motion.div
              key={item.id}
              data-ss-card={item.id}
              role={isOpen ? "listitem" : undefined}
              className="absolute inset-x-0 top-0"
              style={{
                height: CARD_H,
                zIndex: n - i,
                transformOrigin: "50% 100%",
              }}
              initial={false}
              animate={{
                y,
                scale,
                left: isOpen ? 10 : 0,
                opacity: hidden ? 0 : 1,
              }}
              transition={
                motionSafe
                  ? {
                      y: { ...springs.glide, delay },
                      scale: { ...springs.glide, delay },
                      left: { ...springs.glide, delay },
                      opacity: { duration: durations.fast, delay },
                    }
                  : { duration: 0 }
              }
            >
              <button
                ref={(node) => register(`c:${item.id}`, node)}
                type="button"
                data-key={`c:${item.id}`}
                tabIndex={isOpen && focusKey === `c:${item.id}` ? 0 : -1}
                onFocus={() => onFocusKey(`c:${item.id}`)}
                onClick={(event) => {
                  // Closed, the press falls through to the pile and opens it.
                  if (!isOpen) return;
                  event.stopPropagation();
                  if (!disabled) onItem(item);
                }}
                aria-label={`${item.title}${item.body ? `. ${item.body}` : ""}. ${ago(item.at, now)} ago${unreadDot ? ", unread" : ""}`}
                className={cn(
                  "flex size-full flex-col justify-center gap-0.5 rounded-3 px-3 text-left transition-[background-color,box-shadow,border-color] duration-200",
                  style === "raised"
                    ? "border border-hairline shadow-[0_1px_2px_color-mix(in_oklab,black_8%,transparent),0_6px_16px_-6px_color-mix(in_oklab,black_16%,transparent)]"
                    : style === "flat"
                      ? "border border-transparent"
                      : "border border-hairline-strong",
                  isOpen && "hover:border-hairline-strong",
                  FOCUS_IN,
                )}
                style={{
                  backgroundColor:
                    style === "flat"
                      ? `color-mix(in oklab, var(--color-surface-2) ${100 - tint * 6}%, var(--ink-3))`
                      : style === "outline"
                        ? "var(--popover)"
                        : `color-mix(in oklab, var(--card) ${100 - tint * 7}%, var(--ink-3))`,
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <motion.span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-(--ss-accent)"
                    initial={false}
                    animate={{
                      opacity: unreadDot ? 1 : 0,
                      scale: unreadDot ? 1 : 0.4,
                    }}
                    transition={
                      motionSafe ? springs.snap : { duration: durations.fast }
                    }
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[13px] leading-5",
                      unreadDot ? "font-medium text-foreground" : "text-ink-2",
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3 tabular-nums">
                    {ago(item.at, now)}
                  </span>
                </span>
                {item.body ? (
                  <span
                    className="truncate pl-3.5 text-[12px] leading-4 text-ink-3"
                    title={item.body}
                  >
                    {item.body}
                  </span>
                ) : null}
              </button>
              {i === 0 ? (
                <AnimatePresence initial={false}>
                  {unread > 0 ? (
                    <motion.span
                      key="count"
                      aria-hidden
                      className="absolute -top-2 -right-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-(--ss-fill) px-1.5 font-mono text-[11px] font-semibold text-white shadow-[0_2px_6px_color-mix(in_oklab,black_20%,transparent)] ring-2 ring-popover"
                      initial={{ opacity: 0, scale: motionSafe ? 0.4 : 1 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{
                        opacity: 0,
                        scale: motionSafe ? 0.4 : 1,
                        transition: exitFor(durations.base),
                      }}
                      transition={
                        motionSafe
                          ? {
                              scale: springs.recoil,
                              opacity: { duration: durations.fast },
                            }
                          : { duration: durations.fast }
                      }
                    >
                      <Rolling value={unread} motionSafe={motionSafe} />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              ) : null}
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The panel                                 */
/* ----------------------------------------------------------------------- */

/**
 * A notification panel where notifications gather by who sent them, each
 * source a neat pile of cards with its unread count on top. Opening a pile
 * fans its cards down into a list on glide, top card first, while the pile's
 * height glides with them; closing gathers them back in reverse. Dismissing a
 * source sweeps the whole pile aside together — the header leads and each
 * card trails a beat behind the one above, like a deck pushed off a table —
 * then the gap closes and Undo is offered for a few seconds. Marking a source
 * read rolls its count down to nothing and fades the dots.
 *
 * One tab stop walks the panel: Up and Down move between stacks (and through
 * an open stack's cards), Home and End jump, Enter opens, Right and Left open
 * and close, Delete dismisses and Escape closes the stack you are in. The
 * focused stack's Mark read and Dismiss buttons follow on Tab. Under reduced
 * motion the pile cross-fades into the list, the sweep is a fade, and every
 * count still changes.
 */
export function SenderStacks({
  items = defaultSenderItems,
  sources = defaultSenderSources,
  now = defaultSenderNow,
  open,
  defaultOpen,
  onOpenChange,
  multiple = false,
  onOpen,
  onDismiss,
  onRestore,
  onMarkRead,
  onMarkAllRead,
  onItemOpen,
  stackDepth = 2,
  cardStyle = "raised",
  accent = "var(--accent-bright)",
  undoMs = 5000,
  maxHeight = 560,
  title = "Notifications",
  status = "ready",
  onReload,
  disabled = false,
  className,
}: SenderStacksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const depth = Math.max(0, Math.min(4, Math.round(stackDepth)));
  const ready = status === "ready";

  /* ------------------------------- state -------------------------------- */

  const [ownOpen, setOwnOpen] = React.useState<string[]>(
    () => defaultOpen ?? [],
  );
  const openIds = open ?? ownOpen;
  const [dismissed, setDismissed] = React.useState<string[]>([]);
  const [leaving, setLeaving] = React.useState<string[]>([]);
  const [read, setRead] = React.useState<ReadonlySet<string>>(
    () => new Set(items.filter((i) => i.read).map((i) => i.id)),
  );
  const [undo, setUndo] = React.useState<{ id: string; name: string } | null>(
    null,
  );
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = React.useCallback(
    (text: string) => setSaid((s) => ({ n: s.n + 1, text })),
    [],
  );

  const groups = React.useMemo<Group[]>(() => {
    const by = new Map<string, SenderItem[]>();
    for (const item of items) {
      const list = by.get(item.source);
      if (list) list.push(item);
      else by.set(item.source, [item]);
    }
    const out: Group[] = [];
    for (const source of sources) {
      const list = by.get(source.id);
      if (!list || list.length === 0) continue;
      const sorted = [...list].sort((a, b) => b.at - a.at);
      out.push({ source, items: sorted, newest: sorted[0]?.at ?? 0 });
    }
    return out.sort((a, b) => b.newest - a.newest);
  }, [items, sources]);
  const visible = groups.filter((g) => !dismissed.includes(g.source.id));
  const unreadAll = visible.flatMap((g) =>
    g.items.filter((i) => !read.has(i.id)).map((i) => i.id),
  );

  /* -------------------------------- focus ------------------------------- */

  const nodes = React.useRef(new Map<string, HTMLElement>());
  const piles = React.useRef(new Map<string, HTMLDivElement>());
  const register = React.useCallback(
    (key: string, node: HTMLElement | null) => {
      if (node) nodes.current.set(key, node);
      else nodes.current.delete(key);
    },
    [],
  );
  const setPile = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) piles.current.set(id, node);
      else piles.current.delete(id);
    },
    [],
  );
  const [focusKey, setFocusKey] = React.useState<string | null>(null);
  const firstKey = visible[0] ? `h:${visible[0].source.id}` : null;
  const navKeys = visible.flatMap((g) => [
    `h:${g.source.id}`,
    ...(openIds.includes(g.source.id) ? g.items.map((i) => `c:${i.id}`) : []),
  ]);
  const currentKey =
    focusKey && navKeys.includes(focusKey) ? focusKey : firstKey;
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) => {
    setFocusKey(key);
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  };
  React.useEffect(() => {
    if (!focusAsk) return;
    nodes.current.get(focusAsk.key)?.focus({ preventScroll: false });
  }, [focusAsk]);

  /* ------------------------------- actions ------------------------------ */

  const setOpenIds = (next: string[]) => {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };

  const toggle = (id: string) => {
    if (disabled) return;
    const g = groups.find((x) => x.source.id === id);
    if (openIds.includes(id)) {
      setOpenIds(openIds.filter((x) => x !== id));
      say(`${g?.source.name ?? "Stack"} closed.`);
    } else {
      setOpenIds(multiple ? [...openIds, id] : [id]);
      onOpen?.(id);
      say(
        `${g?.source.name ?? "Stack"} opened, ${plural(g?.items.length ?? 0, "notification", "notifications")}.`,
      );
    }
  };

  const markRead = (id: string) => {
    const g = groups.find((x) => x.source.id === id);
    if (!g) return;
    const ids = g.items.filter((i) => !read.has(i.id)).map((i) => i.id);
    if (ids.length === 0) return;
    setRead((r) => new Set([...r, ...ids]));
    onMarkRead?.(id, ids);
    say(`${g.source.name} marked read.`);
  };

  const markAll = () => {
    if (disabled || unreadAll.length === 0) return;
    const ids = unreadAll;
    setRead((r) => new Set([...r, ...ids]));
    onMarkAllRead?.(ids);
    say("Everything marked read.");
  };

  const timers = React.useRef(new Map<string, number>());
  const sweeps = React.useRef(new Map<string, AnimationPlaybackControls[]>());
  const undoTimer = React.useRef(0);
  React.useEffect(() => {
    const t = timers.current;
    const sw = sweeps.current;
    return () => {
      for (const id of t.values()) window.clearTimeout(id);
      t.clear();
      window.clearTimeout(undoTimer.current);
      for (const list of sw.values()) for (const c of list) c.stop();
      sw.clear();
    };
  }, []);

  const dismiss = (id: string) => {
    if (disabled || leaving.includes(id) || dismissed.includes(id)) return;
    const at = visible.findIndex((g) => g.source.id === id);
    const g = visible[at];
    if (!g) return;
    onDismiss?.(
      id,
      g.items.map((i) => i.id),
    );
    // Focus goes to the stack that takes its place (or to Undo), before it
    // leaves.
    const neighbour = visible[at + 1] ?? visible[at - 1];
    ask(neighbour ? `h:${neighbour.source.id}` : "undo");
    setLeaving((l) => [...l, id]);
    if (openIds.includes(id)) setOpenIds(openIds.filter((x) => x !== id));
    say(`${g.source.name} dismissed. Undo is available.`);

    const finish = () => {
      timers.current.delete(id);
      sweeps.current.delete(id);
      setLeaving((l) => l.filter((x) => x !== id));
      setDismissed((d) => [...d, id]);
    };
    const pile = piles.current.get(id);
    const row = pile?.previousElementSibling as HTMLElement | null;
    if (!motionSafe || !pile) {
      finish();
    } else {
      // The header leads; each card trails 30ms behind the one above.
      const cards = Array.from(
        pile.querySelectorAll<HTMLElement>("[data-ss-card]"),
      );
      const out = { duration: 0.26, ease: easings.exit };
      const runs: AnimationPlaybackControls[] = [];
      if (row) runs.push(animate(row, { x: "108%", opacity: 0 }, out));
      cards.forEach((card, i) => {
        runs.push(
          animate(card, { x: "112%" }, { ...out, delay: 0.03 * (i + 1) }),
        );
      });
      sweeps.current.set(id, runs);
      timers.current.set(
        id,
        window.setTimeout(finish, 260 + 30 * Math.min(cards.length, 5)),
      );
    }
    window.clearTimeout(undoTimer.current);
    setUndo({ id, name: g.source.name });
    undoTimer.current = window.setTimeout(
      () => setUndo(null),
      Math.max(1000, undoMs),
    );
  };

  const restore = () => {
    if (!undo) return;
    const id = undo.id;
    window.clearTimeout(undoTimer.current);
    // Caught mid-sweep, or while its gap is still closing: the pile comes
    // straight back from wherever it got to.
    const pending = timers.current.get(id);
    if (pending !== undefined) window.clearTimeout(pending);
    timers.current.delete(id);
    for (const c of sweeps.current.get(id) ?? []) c.stop();
    sweeps.current.delete(id);
    // Only a moving sweep can be caught; reduced motion never starts one.
    const pile = motionSafe ? piles.current.get(id) : undefined;
    if (pile) {
      const row = pile.previousElementSibling as HTMLElement | null;
      const back = springs.glide;
      if (row) animate(row, { x: "0%", opacity: 1 }, back);
      pile
        .querySelectorAll<HTMLElement>("[data-ss-card]")
        .forEach((card) => animate(card, { x: "0%" }, back));
    }
    setUndo(null);
    setDismissed((d) => d.filter((x) => x !== id));
    setLeaving((l) => l.filter((x) => x !== id));
    onRestore?.(id);
    say(`${undo.name} restored.`);
    ask(`h:${id}`);
  };

  /* ------------------------------ keyboard ------------------------------ */

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    const key = currentKey;
    if (!key) return;
    const at = navKeys.indexOf(key);
    const sourceOf = (k: string) =>
      k.startsWith("h:")
        ? k.slice(2)
        : (items.find((i) => `c:${i.id}` === k)?.source ?? "");
    const go = (i: number) => {
      const k = navKeys[Math.max(0, Math.min(navKeys.length - 1, i))];
      if (k) ask(k);
    };
    const target = event.target as HTMLElement;
    if (!target.dataset.key) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(at + 1);
        return;
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
        go(navKeys.length - 1);
        return;
      case "ArrowRight": {
        const s = sourceOf(key);
        if (key.startsWith("h:") && !openIds.includes(s)) {
          event.preventDefault();
          toggle(s);
        }
        return;
      }
      case "ArrowLeft": {
        const s = sourceOf(key);
        if (openIds.includes(s)) {
          event.preventDefault();
          toggle(s);
          ask(`h:${s}`);
        }
        return;
      }
      case "Escape": {
        const s = sourceOf(key);
        if (openIds.includes(s)) {
          // Ours: the stage behind must not close on it.
          event.preventDefault();
          event.stopPropagation();
          toggle(s);
          ask(`h:${s}`);
        }
        return;
      }
      case "Delete":
      case "Backspace": {
        event.preventDefault();
        const s = sourceOf(key);
        if (s) dismiss(s);
        return;
      }
      default:
        return;
    }
  };

  /* ------------------------------- render ------------------------------- */

  const fill = `oklch(from ${accent} 0.6 0.16 h)`;

  const body = () => {
    if (status === "loading") {
      return (
        <div aria-busy="true" className="flex flex-col gap-5 px-3 py-3">
          <span className="sr-only">Loading notifications.</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="flex flex-col gap-2">
              <div className="flex h-9 items-center gap-2.5 px-1.5">
                <span className="size-7 rounded-2 bg-surface-2" />
                <span className="h-3 w-32 rounded-full bg-surface-2 motion-safe:animate-pulse" />
              </div>
              <div className="relative h-[72px]">
                {[2, 1, 0].map((l) => (
                  <span
                    key={l}
                    className="absolute inset-x-0 top-0 h-[60px] rounded-3 border border-hairline bg-surface-1 motion-safe:animate-pulse"
                    style={{
                      transform: `translateY(${l * PEEK}px) scale(${r2(1 - l * 0.05)})`,
                      transformOrigin: "50% 100%",
                      zIndex: 3 - l,
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-[13px] text-foreground">
            Notifications did not load.
          </p>
          {onReload ? (
            <button
              type="button"
              onClick={onReload}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Try again
            </button>
          ) : null}
        </div>
      );
    }
    if (visible.length === 0) {
      return (
        <motion.div
          className="flex flex-col items-center gap-3 px-6 py-12 text-center"
          initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: durations.base, ease: easings.enter }}
        >
          <svg
            aria-hidden
            viewBox="0 0 120 72"
            className="h-[72px] w-[120px] text-ink-3"
          >
            <rect
              x="22"
              y="34"
              width="76"
              height="26"
              rx="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.35"
            />
            <rect
              x="18"
              y="28"
              width="84"
              height="26"
              rx="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              opacity="0.55"
            />
            <rect
              x="14"
              y="20"
              width="92"
              height="28"
              rx="6"
              className="fill-popover"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M48 34 L56 41 L72 27"
              fill="none"
              className="stroke-(--ss-accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-[14px] font-medium text-foreground">
            All caught up
          </p>
          <p className="max-w-64 text-[12px] leading-4 text-ink-3">
            New notifications land here, gathered by who sent them.
          </p>
        </motion.div>
      );
    }
    return (
      <ul
        role="list"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        onKeyDown={onListKeyDown}
        className="flex flex-col px-2.5 pt-2 pb-3"
      >
        <AnimatePresence initial={false}>
          {visible.map((g) => (
            <motion.li
              key={g.source.id}
              className="py-2"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{
                height: 0,
                opacity: 0,
                transition: {
                  height: { duration: durations.base, ease: easings.move },
                  opacity: { duration: durations.fast },
                },
              }}
              transition={
                motionSafe
                  ? {
                      height: springs.glide,
                      opacity: { duration: durations.base },
                    }
                  : { duration: durations.fast }
              }
              style={{ overflow: "clip", overflowClipMargin: 10 }}
            >
              <Stack
                group={g}
                isOpen={openIds.includes(g.source.id)}
                depth={depth}
                style={cardStyle}
                read={read}
                now={now}
                motionSafe={motionSafe}
                disabled={disabled}
                leaving={leaving.includes(g.source.id)}
                focusKey={currentKey}
                uid={uid}
                register={register}
                setPile={setPile}
                onToggle={toggle}
                onMarkRead={markRead}
                onDismiss={dismiss}
                onItem={(item) => {
                  if (!read.has(item.id)) {
                    setRead((r) => new Set([...r, item.id]));
                  }
                  onItemOpen?.(item);
                }}
                onFocusKey={setFocusKey}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    );
  };

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative flex w-full max-w-[25rem] flex-col overflow-clip rounded-4 border border-hairline-strong bg-popover text-foreground shadow-[0_18px_48px_color-mix(in_oklab,black_16%,transparent)]",
        disabled && "opacity-70",
        className,
      )}
      style={
        {
          maxHeight,
          "--ss-accent": accent,
          "--ss-fill": fill,
        } as React.CSSProperties
      }
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h2 id={titleId} className="truncate text-[15px] font-semibold">
            {title}
          </h2>
          <AnimatePresence initial={false}>
            {ready && unreadAll.length > 0 ? (
              <motion.span
                key="total"
                className="inline-flex h-5 items-center rounded-full bg-[color-mix(in_oklab,var(--ss-accent)_14%,transparent)] px-1.5 font-mono text-[11px] font-medium text-(--ss-accent)"
                initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        scale: springs.snap,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: durations.fast }
                }
              >
                <Rolling value={unreadAll.length} motionSafe={motionSafe} />
                <span className="sr-only"> unread</span>
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={markAll}
          aria-disabled={
            disabled || !ready || unreadAll.length === 0 || undefined
          }
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 px-2 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40 aria-disabled:hover:bg-transparent",
            FOCUS_RING,
          )}
        >
          <CheckCheck aria-hidden className="size-3.5" />
          Mark all read
        </button>
      </header>

      <p id={hintId} className="sr-only">
        Up and Down move between stacks and through an open stack. Enter opens a
        stack, Escape closes it, Delete dismisses it.
      </p>

      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain">
        {body()}
      </div>

      <AnimatePresence initial={false}>
        {undo ? (
          <motion.div
            key="undo"
            className="shrink-0 overflow-clip border-t border-hairline bg-surface-1"
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
                    opacity: { duration: durations.base },
                  }
                : { duration: durations.fast }
            }
          >
            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
              <p className="min-w-0 truncate text-[12px] text-ink-2">
                {undo.name} dismissed
              </p>
              <button
                ref={(node) => register("undo", node)}
                type="button"
                onClick={restore}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-2 border border-hairline bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface-2",
                  FOCUS_RING,
                )}
              >
                <RotateCcw aria-hidden className="size-3.5" />
                Undo
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
