"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  ArrowUp,
  Check,
  CheckCheck,
  ChevronLeft,
  CircleAlert,
  Clock3,
  Heart,
  Laugh,
  LoaderCircle,
  Reply,
  RotateCcw,
  SmilePlus,
  Sparkles,
  ThumbsUp,
  X,
  Frown,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type SwipeBubbleStyle = "tail" | "round" | "block";
export type SwipeDelivery =
  "sending" | "sent" | "delivered" | "read" | "failed";
export type SwipeReaction = "like" | "love" | "laugh" | "wow" | "sad" | "done";

export type SwipePerson = {
  id: string;
  name: string;
  /** Avatar hue, 0–360. Derived from the id when absent. */
  hue?: number;
  /** Shown under the name in the header, e.g. "Active 5 min ago". */
  presence?: string;
};

export type SwipeMessage = {
  id: string;
  /** A participant id. */
  from: string;
  text: string;
  /** Sent at, ms. */
  at: number;
  /** Delivery, for your own messages. */
  status?: SwipeDelivery;
  /** The id of the message this one answers. */
  replyTo?: string;
  /** Who reacted with what, by participant id. */
  reactions?: Partial<Record<SwipeReaction, string[]>>;
};

export type SwipeReplyProps = {
  /** How far a pull travels before the reply arms, px; past it the bubble rubber-bands. @default 64 */
  swipeDistance?: number;
  /** Bubble shape: a small tail on the last of a run, full pills, or squarer blocks. @default "tail" */
  bubbleStyle?: SwipeBubbleStyle;
  /** Any CSS colour: your bubbles, read ticks, the reply ring and the dock's edge. @default "var(--accent-bright)" */
  accent?: string;
  /** Controlled messages, oldest first. */
  messages?: SwipeMessage[];
  /** Initial messages when uncontrolled. @default defaultSwipeMessages */
  defaultMessages?: SwipeMessage[];
  /** Fires from a send, a reaction, a retry or older messages arriving, with every message. */
  onMessagesChange?: (messages: SwipeMessage[]) => void;
  /** Everyone in the thread. @default defaultSwipePeople */
  participants?: SwipePerson[];
  /** Which participant is you. @default "you" */
  me?: string;
  /** A message was sent. Return a promise: resolved marks it sent, rejected marks it failed. */
  onSend?: (message: SwipeMessage) => void | Promise<void>;
  /** A message was picked to reply to, by swipe, R or the hover bar. */
  onReply?: (message: SwipeMessage) => void;
  /** You added or removed a reaction. */
  onReact?: (
    message: SwipeMessage,
    reaction: SwipeReaction,
    on: boolean,
  ) => void;
  /** Retry was pressed on a failed message (it is sent again through onSend). */
  onRetry?: (message: SwipeMessage) => void;
  /** The thread reached the top; return older messages (oldest first) or add them yourself. */
  onLoadEarlier?: () => Promise<SwipeMessage[] | void> | void;
  /** Whether older messages exist. @default true */
  hasEarlier?: boolean;
  /** The current time, ms; day dividers and "Today". Never read from the clock. @default 17 Oct 2026 09:40 UTC */
  now?: number;
  /** Height of the screen, px; the thread scrolls inside. @default 560 */
  height?: number;
  /** Nothing can be sent, swiped or reacted to. @default false */
  disabled?: boolean;
  /** Classes for the outer box. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

export const defaultSwipePeople: SwipePerson[] = [
  { id: "you", name: "You", hue: 250 },
  {
    id: "noor",
    name: "Noor Haddad",
    hue: 28,
    presence: "Active 5 min ago",
  },
];

const day = (d: number, h: number, m: number) => Date.UTC(2026, 9, d, h, m);

/** Noor and you, sorting out a Fieldline site visit. */
export const defaultSwipeMessages: SwipeMessage[] = [
  {
    id: "m1",
    from: "noor",
    text: "Are we still on for the Fieldline site visit on Thursday?",
    at: day(16, 18, 40),
  },
  {
    id: "m2",
    from: "you",
    text: "Yes. I booked the 08:10 train, back by six.",
    at: day(16, 18, 42),
    status: "read",
  },
  {
    id: "m3",
    from: "noor",
    text: "Perfect. Can you bring the survey tablets?",
    at: day(16, 18, 43),
  },
  {
    id: "m4",
    from: "you",
    text: "Both charged and in my bag.",
    at: day(16, 18, 51),
    status: "read",
    replyTo: "m3",
    reactions: { like: ["noor"] },
  },
  {
    id: "m5",
    from: "noor",
    text: "Morning. The client moved the walkthrough to 10:30.",
    at: day(17, 9, 12),
  },
  {
    id: "m6",
    from: "noor",
    text: "Still fine for the train?",
    at: day(17, 9, 13),
  },
  {
    id: "m7",
    from: "you",
    text: "Fine. I'll grab coffee for both of us.",
    at: day(17, 9, 20),
    status: "read",
  },
  {
    id: "m8",
    from: "noor",
    text: "You're the best. Gate 4, I'll be early.",
    at: day(17, 9, 31),
    reactions: { love: ["you"] },
  },
];

export const defaultSwipeNow = day(17, 9, 40);

const REACTIONS: {
  kind: SwipeReaction;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { kind: "like", label: "thumbs up", Icon: ThumbsUp },
  { kind: "love", label: "heart", Icon: Heart },
  { kind: "laugh", label: "laugh", Icon: Laugh },
  { kind: "wow", label: "wow", Icon: Sparkles },
  { kind: "sad", label: "sad", Icon: Frown },
  { kind: "done", label: "done", Icon: Check },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:-outline-offset-2";

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
const pad = (n: number) => String(n).padStart(2, "0");
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
const dayKey = (ms: number) => Math.floor(ms / 86_400_000);
const dayLabel = (ms: number, now: number) => {
  const diff = dayKey(now) - dayKey(ms);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(ms);
  return `${WEEKDAYS[d.getUTCDay()] ?? ""} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ""}`;
};

const hueOf = (p: { id: string; hue?: number }) => {
  if (p.hue !== undefined) return Math.round(p.hue) % 360;
  let h = 0;
  for (const ch of p.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;

const deliveryWords: Record<SwipeDelivery, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Not delivered",
};

const RING = 28;
const CIRC = Math.round(2 * Math.PI * 11 * 1000) / 1000;

// The scroll anchor must be restored before paint, or prepended history
// jumps the thread for a frame; the server has nothing to anchor.
const useAnchorEffect =
  typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/* ----------------------------------------------------------------------- */
/*                                A message                                 */
/* ----------------------------------------------------------------------- */

type BubbleProps = {
  message: SwipeMessage;
  mine: boolean;
  author: SwipePerson | undefined;
  quoted: { who: string; text: string } | null;
  firstOfRun: boolean;
  lastOfRun: boolean;
  fresh: boolean;
  active: boolean;
  menuOpen: boolean;
  menuBelow: boolean;
  me: string;
  distance: number;
  bubbleStyle: SwipeBubbleStyle;
  motionSafe: boolean;
  disabled: boolean;
  label: string;
  register: (id: string, node: HTMLLIElement | null) => void;
  onFocusRow: () => void;
  onKey: (event: React.KeyboardEvent<HTMLLIElement>) => void;
  onReply: () => void;
  onOpenMenu: () => void;
  onCloseMenu: (refocus: boolean) => void;
  onReact: (kind: SwipeReaction) => void;
  onRetry: () => void;
};

function MessageRow({
  message: m,
  mine,
  author,
  quoted,
  firstOfRun,
  lastOfRun,
  fresh,
  active,
  menuOpen,
  menuBelow,
  me,
  distance,
  bubbleStyle,
  motionSafe,
  disabled,
  label,
  register,
  onFocusRow,
  onKey,
  onReply,
  onOpenMenu,
  onCloseMenu,
  onReact,
  onRetry,
}: BubbleProps) {
  const dir = mine ? -1 : 1;
  const D = Math.max(24, distance);
  const x = useMotionValue(0);
  const pull = useTransform(x, (v) => Math.min(1, Math.max(0, (v * dir) / D)));
  const dash = useTransform(
    pull,
    (p) => Math.round(CIRC * (1 - p) * 100) / 100,
  );
  const ringOpacity = useTransform(
    pull,
    (p) => Math.round(Math.min(1, p * 1.6) * 100) / 100,
  );
  const ringScale = useTransform(
    pull,
    (p) => Math.round((0.6 + p * 0.4) * 1000) / 1000,
  );
  // The ring sits in the middle of the gap the bubble uncovers.
  const ringX = useTransform(x, (v) => {
    const gap = Math.max(0, v * dir);
    return Math.round(dir * Math.max(2, gap / 2 - RING / 2) * 10) / 10;
  });
  const pop = useMotionValue(1);
  const [armed, setArmed] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const armedRef = React.useRef(false);
  const running = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => running.current?.stop(), []);

  const arm = (on: boolean) => {
    if (armedRef.current === on) return;
    armedRef.current = on;
    setArmed(on);
    if (on && motionSafe) {
      pop.jump(1.22);
      animate(pop, 1, springs.flick);
    }
  };

  // Home always, with the hand's velocity: a pull is a question, never a move.
  const home = (velocity: number) => {
    running.current?.stop();
    running.current = animate(
      x,
      0,
      motionSafe ? { ...springs.snap, velocity } : { duration: 0 },
    );
  };

  const drag = useDrag({
    axis: "x",
    threshold: 6,
    disabled,
    onStart: () => {
      running.current?.stop();
      setDragging(true);
    },
    onMove: ({ offset }) => {
      const raw = offset.x * dir;
      // 1:1 up to the distance, a rubber band past it, and a stiff refusal
      // the wrong way.
      const v =
        raw < 0
          ? rubberband(raw, 18)
          : raw <= D
            ? raw
            : D + rubberband(raw - D, D * 1.5);
      x.set(Math.round(v * dir * 10) / 10);
      arm(raw >= D);
    },
    onEnd: ({ velocity }) => {
      const reply = armedRef.current;
      setDragging(false);
      home(velocity.x);
      arm(false);
      if (reply) onReply();
    },
    onCancel: () => {
      setDragging(false);
      home(0);
      arm(false);
    },
  });

  const bubbleFill = mine
    ? "bg-(--sw-solid) text-[oklch(0.99_0_0)]"
    : "bg-surface-2 text-foreground";
  const radius =
    bubbleStyle === "block"
      ? "rounded-[7px]"
      : bubbleStyle === "round"
        ? "rounded-[20px]"
        : cn(
            "rounded-[18px]",
            mine
              ? cn(
                  !firstOfRun && "rounded-tr-[6px]",
                  !lastOfRun && "rounded-br-[6px]",
                  lastOfRun && "rounded-br-[4px]",
                )
              : cn(
                  !firstOfRun && "rounded-tl-[6px]",
                  !lastOfRun && "rounded-bl-[6px]",
                  lastOfRun && "rounded-bl-[4px]",
                ),
          );

  const reactions = REACTIONS.filter(
    (r) => (m.reactions?.[r.kind]?.length ?? 0) > 0,
  );
  // One stable ref for the row's whole life: motion binds it once.
  const bindRow = React.useCallback(
    (node: HTMLLIElement | null) => register(m.id, node),
    [m.id, register],
  );

  return (
    <motion.li
      ref={bindRow}
      data-swr-message={m.id}
      tabIndex={active ? 0 : -1}
      aria-label={label}
      onFocus={(e) => {
        if (e.target === e.currentTarget) onFocusRow();
      }}
      onKeyDown={onKey}
      onContextMenu={(e) => {
        if (disabled) return;
        e.preventDefault();
        onOpenMenu();
      }}
      className={cn(
        "group/swipe-reply relative flex flex-col rounded-3 px-1",
        mine ? "items-end" : "items-start",
        firstOfRun ? "mt-2.5" : "mt-0.5",
        FOCUS_IN,
      )}
      initial={
        fresh ? { opacity: 0, y: motionSafe ? distances.step : 0 } : false
      }
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? { y: springs.snap, opacity: { duration: durations.base } }
          : { duration: durations.fast }
      }
    >
      <span className="sr-only">{label}</span>
      {firstOfRun && !mine && author ? (
        <span aria-hidden className="mb-0.5 px-2 text-[11px] text-ink-3">
          {firstName(author.name)}
        </span>
      ) : null}
      <div aria-hidden className="relative flex max-w-[82%] items-center">
        {/* The reply ring, uncovered by the pull. */}
        <motion.span
          className={cn(
            "pointer-events-none absolute top-1/2 grid -translate-y-1/2 place-items-center",
            mine ? "right-0" : "left-0",
          )}
          style={{
            width: RING,
            height: RING,
            x: ringX,
            opacity: ringOpacity,
            scale: ringScale,
          }}
        >
          <svg
            width={RING}
            height={RING}
            viewBox="0 0 28 28"
            className="absolute inset-0 -rotate-90"
          >
            <circle
              cx={14}
              cy={14}
              r={11}
              fill="none"
              strokeWidth={2}
              className="stroke-hairline-strong"
            />
            <circle
              cx={14}
              cy={14}
              r={11}
              className={cn(
                "transition-[fill] duration-150",
                armed ? "fill-(--sw-solid)" : "fill-card",
              )}
              strokeWidth={0}
            />
            <motion.circle
              cx={14}
              cy={14}
              r={11}
              fill="none"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              className="stroke-(--sw-accent)"
              style={{ strokeDashoffset: dash }}
            />
          </svg>
          <motion.span
            className="relative grid place-items-center"
            style={{ scale: pop }}
          >
            <Reply
              className={cn(
                "size-3.5 transition-colors duration-150",
                armed ? "text-[oklch(0.99_0_0)]" : "text-ink-2",
              )}
            />
          </motion.span>
        </motion.span>

        <motion.div
          {...drag}
          data-swr-bubble={m.id}
          className={cn(
            "relative min-w-0 cursor-grab touch-pan-y px-3 py-2 text-[13px] leading-5 select-none active:cursor-grabbing",
            bubbleFill,
            radius,
            m.status === "failed" && "ring-1 ring-danger",
          )}
          style={{ x }}
        >
          {quoted ? (
            <span
              className={cn(
                "mb-1.5 block rounded-[8px] border-l-2 px-2 py-1 text-[12px] leading-4",
                mine
                  ? "border-[oklch(0.99_0_0/0.7)] bg-[oklch(1_0_0/0.14)]"
                  : "border-(--sw-accent) bg-[color-mix(in_oklab,var(--sw-accent)_10%,var(--card))]",
              )}
            >
              <span className="block font-medium">{quoted.who}</span>
              <span className="line-clamp-1 opacity-85">{quoted.text}</span>
            </span>
          ) : null}
          <span className="break-words whitespace-pre-wrap">{m.text}</span>
          <span
            className={cn(
              "ml-2 inline-flex translate-y-0.5 items-center gap-0.5 align-baseline text-[10px] tabular-nums",
              mine ? "text-[oklch(0.99_0_0/0.75)]" : "text-ink-3",
            )}
          >
            {clock(m.at)}
            {mine ? (
              m.status === "read" ? (
                <CheckCheck className="size-3 text-[oklch(0.92_0.06_200)]" />
              ) : m.status === "delivered" ? (
                <CheckCheck className="size-3" />
              ) : m.status === "sent" ? (
                <Check className="size-3" />
              ) : m.status === "failed" ? (
                <CircleAlert className="size-3" />
              ) : (
                <Clock3 className="size-3" />
              )
            ) : null}
          </span>
          {bubbleStyle === "tail" && lastOfRun ? (
            <svg
              viewBox="0 0 8 12"
              className={cn(
                "absolute bottom-0 h-3 w-2",
                mine
                  ? "-right-1.5 fill-(--sw-solid)"
                  : "-left-1.5 -scale-x-100 fill-surface-2",
              )}
            >
              <path d="M0 0 C 0 7 3 11 8 12 L 0 12 Z" />
            </svg>
          ) : null}
        </motion.div>

        {/* Pointer shortcuts beside the bubble; the keyboard has R and the menu key. */}
        {!disabled ? (
          <span
            className={cn(
              "absolute top-1/2 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity duration-150",
              !dragging &&
                "group-focus-within/swipe-reply:opacity-100 group-hover/swipe-reply:opacity-100",
              mine ? "right-full mr-1" : "left-full ml-1",
            )}
          >
            <button
              type="button"
              tabIndex={-1}
              onClick={onReply}
              className="inline-flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground"
            >
              <Reply className="size-3.5" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={onOpenMenu}
              className="inline-flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground"
            >
              <SmilePlus className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {reactions.length ? (
        <span
          aria-hidden
          className={cn("-mt-1 flex gap-1", mine ? "mr-2" : "ml-2")}
        >
          <AnimatePresence initial={false}>
            {reactions.map(({ kind, Icon }) => {
              const who = m.reactions?.[kind] ?? [];
              const minePressed = who.includes(me);
              return (
                <motion.button
                  key={kind}
                  type="button"
                  tabIndex={-1}
                  onClick={() => onReact(kind)}
                  initial={{ scale: motionSafe ? 0.5 : 1, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{
                    scale: motionSafe ? 0.6 : 1,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }}
                  transition={
                    motionSafe
                      ? {
                          scale: springs.recoil,
                          opacity: { duration: durations.fast },
                        }
                      : { duration: durations.fast }
                  }
                  className={cn(
                    "relative inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 text-[10px] tabular-nums shadow-[0_1px_2px_color-mix(in_oklab,black_10%,transparent)]",
                    minePressed
                      ? "border-[color-mix(in_oklab,var(--sw-accent)_50%,transparent)] bg-[color-mix(in_oklab,var(--sw-accent)_14%,var(--card))] text-foreground"
                      : "border-hairline bg-card text-ink-2",
                  )}
                >
                  <Icon className="size-3" />
                  {who.length > 1 ? who.length : null}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </span>
      ) : null}

      {m.status === "failed" ? (
        <span className="mt-1 mr-1 flex items-center gap-1.5 text-[11px] text-danger">
          Not delivered
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border border-[color-mix(in_oklab,var(--danger)_40%,transparent)] px-2 text-[11px] text-foreground hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <RotateCcw aria-hidden className="size-3" />
            Retry
          </button>
        </span>
      ) : null}

      <AnimatePresence>
        {menuOpen ? (
          <ReactionMenu
            key="menu"
            mine={mine}
            below={menuBelow}
            chosen={REACTIONS.filter((r) =>
              m.reactions?.[r.kind]?.includes(me),
            ).map((r) => r.kind)}
            motionSafe={motionSafe}
            onPick={(kind) => {
              onReact(kind);
              onCloseMenu(true);
            }}
            onClose={onCloseMenu}
          />
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

function ReactionMenu({
  mine,
  below,
  chosen,
  motionSafe,
  onPick,
  onClose,
}: {
  mine: boolean;
  below: boolean;
  chosen: SwipeReaction[];
  motionSafe: boolean;
  onPick: (kind: SwipeReaction) => void;
  onClose: (refocus: boolean) => void;
}) {
  const items = React.useRef<(HTMLButtonElement | null)[]>([]);
  const wrap = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    items.current[0]?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) onClose(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const at = items.current.findIndex((n) => n === document.activeElement);
    const go = (i: number) =>
      items.current[(i + REACTIONS.length) % REACTIONS.length]?.focus();
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      go(at + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      go(at - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      go(0);
    } else if (e.key === "End") {
      e.preventDefault();
      go(REACTIONS.length - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose(true);
    } else if (e.key === "Tab") {
      onClose(false);
    }
  };
  return (
    <motion.div
      ref={wrap}
      role="menu"
      aria-label="React"
      onKeyDown={onKey}
      className={cn(
        "absolute z-20 flex gap-0.5 rounded-full border border-hairline-strong bg-popover p-1 shadow-[0_10px_28px_-10px_color-mix(in_oklab,black_35%,transparent)]",
        below ? "top-full mt-1" : "bottom-full mb-1",
        mine ? "right-1" : "left-1",
      )}
      initial={{
        opacity: 0,
        y: motionSafe ? (below ? -distances.nudge : distances.nudge) : 0,
        scale: motionSafe ? 0.96 : 1,
      }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? {
              y: springs.snap,
              scale: springs.snap,
              opacity: { duration: durations.fast },
            }
          : { duration: durations.fast }
      }
    >
      {REACTIONS.map(({ kind, label, Icon }, i) => (
        <button
          key={kind}
          ref={(node) => {
            items.current[i] = node;
          }}
          type="button"
          role="menuitemcheckbox"
          aria-checked={chosen.includes(kind)}
          aria-label={label}
          tabIndex={-1}
          onClick={() => onPick(kind)}
          className={cn(
            "inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
            chosen.includes(kind) &&
              "bg-[color-mix(in_oklab,var(--sw-accent)_16%,transparent)] text-foreground",
            FOCUS_IN,
          )}
        >
          <Icon aria-hidden className="size-4" />
        </button>
      ))}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The thread                                */
/* ----------------------------------------------------------------------- */

type Said = { n: number; text: string };
type Track = { known: string[]; fresh: string[]; first: string };

/**
 * A direct-message thread on a phone-width screen, with day dividers,
 * delivery ticks and a composer. Swiping a bubble toward the middle pulls it
 * 1:1 for `swipeDistance` px and rubber-bands past it, while a ring in the
 * gap it uncovers fills with the pull; full, it arms with a flick. Letting go
 * always snaps the bubble home on springs.snap with the release velocity,
 * and an armed pull docks the quoted message above the composer on
 * springs.glide. Keyboard users press R on a focused message (arrows walk
 * them) and the menu key opens reactions, which land with springs.recoil.
 * Older messages load at the top behind a spinner without moving what you
 * were reading, and a failed message offers retry.
 */
export function SwipeReply({
  swipeDistance = 64,
  bubbleStyle = "tail",
  accent = "var(--accent-bright)",
  messages,
  defaultMessages = defaultSwipeMessages,
  onMessagesChange,
  participants = defaultSwipePeople,
  me = "you",
  onSend,
  onReply,
  onReact,
  onRetry,
  onLoadEarlier,
  hasEarlier = true,
  now = defaultSwipeNow,
  height = 560,
  disabled = false,
  className,
}: SwipeReplyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const hintId = `${uid}-hint`;
  const composerId = `${uid}-composer`;

  const [ownList, setOwnList] = React.useState<SwipeMessage[]>(defaultMessages);
  const list = messages ?? ownList;
  const write = (next: SwipeMessage[]) => {
    if (messages === undefined) setOwnList(next);
    onMessagesChange?.(next);
  };
  const latest = React.useRef({ list, write, onSend });
  React.useEffect(() => {
    latest.current = { list, write, onSend };
  });

  const personOf = (id: string) => participants.find((p) => p.id === id);
  const other = participants.find((p) => p.id !== me) ?? participants[0];

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // Which messages arrived at the end (they rise in) and which came from
  // the past (they appear in place): a fact about successive renders.
  const [track, setTrack] = React.useState<Track>(() => ({
    known: list.map((m) => m.id),
    fresh: [],
    first: list[0]?.id ?? "",
  }));
  const ids = list.map((m) => m.id);
  if (
    ids.length !== track.known.length ||
    ids.some((id, i) => track.known[i] !== id)
  ) {
    const known = new Set(track.known);
    const lastKnown = track.known[track.known.length - 1];
    const tailFrom = lastKnown ? ids.indexOf(lastKnown) + 1 : ids.length;
    const added = ids.filter((id, i) => !known.has(id) && i >= tailFrom);
    setTrack({
      known: ids,
      fresh: [...track.fresh.filter((id) => ids.includes(id)), ...added],
      first: ids[0] ?? "",
    });
  }

  /* ------------------------------ focus --------------------------------- */

  const rows = React.useRef(new Map<string, HTMLLIElement>());
  const register = React.useCallback(
    (id: string, node: HTMLLIElement | null) => {
      if (node) rows.current.set(id, node);
      else rows.current.delete(id);
    },
    [],
  );
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const active =
    activeId && ids.includes(activeId)
      ? activeId
      : (ids[ids.length - 1] ?? null);
  const focusRow = (id: string | undefined) => {
    if (!id) return;
    setActiveId(id);
    rows.current.get(id)?.focus();
  };

  /* ------------------------------- reply -------------------------------- */

  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const quotedOf = (id: string | undefined) => {
    if (!id) return null;
    const q = list.find((x) => x.id === id);
    if (!q) return null;
    return {
      who: q.from === me ? "You" : (personOf(q.from)?.name ?? "Them"),
      text: q.text,
    };
  };
  const startReply = (m: SwipeMessage) => {
    if (disabled) return;
    setReplyTo(m.id);
    onReply?.(m);
    composerRef.current?.focus({ preventScroll: true });
    const who = m.from === me ? "yourself" : (personOf(m.from)?.name ?? "them");
    say(`Replying to ${who}: ${m.text}`);
  };

  /* ----------------------------- reactions ------------------------------ */

  const [menu, setMenu] = React.useState<{ id: string; below: boolean } | null>(
    null,
  );
  const menuId = React.useRef<string | null>(null);
  const logRef = React.useRef<HTMLDivElement | null>(null);
  const openMenu = (id: string) => {
    if (disabled) return;
    const row = rows.current.get(id);
    const log = logRef.current;
    const below =
      !!row &&
      !!log &&
      row.getBoundingClientRect().top - log.getBoundingClientRect().top < 56;
    setActiveId(id);
    menuId.current = id;
    setMenu({ id, below });
  };
  const closeMenu = React.useCallback((refocus: boolean) => {
    const id = menuId.current;
    menuId.current = null;
    setMenu(null);
    if (refocus && id) rows.current.get(id)?.focus();
  }, []);
  const react = (m: SwipeMessage, kind: SwipeReaction) => {
    if (disabled) return;
    const who = m.reactions?.[kind] ?? [];
    const on = !who.includes(me);
    const nextWho = on ? [...who, me] : who.filter((x) => x !== me);
    const reactions = { ...(m.reactions ?? {}), [kind]: nextWho };
    write(list.map((x) => (x.id === m.id ? { ...x, reactions } : x)));
    onReact?.(m, kind, on);
    const label = REACTIONS.find((r) => r.kind === kind)?.label ?? kind;
    say(on ? `Reacted with ${label}.` : `Removed ${label}.`);
  };

  /* -------------------------------- send -------------------------------- */

  const [draft, setDraft] = React.useState("");
  const counter = React.useRef(0);
  const deliver = (msg: SwipeMessage) => {
    let out: unknown;
    try {
      out = latest.current.onSend?.(msg);
    } catch {
      out = Promise.reject(new Error("send failed"));
    }
    // The answer can arrive before the thread holding the message has
    // rendered; it waits a frame or two for the message rather than lose it.
    const settle = (status: SwipeDelivery, tries = 0) => {
      const { list: cur, write: put } = latest.current;
      const found = cur.find((x) => x.id === msg.id);
      if (!found) {
        if (tries < 8) window.setTimeout(() => settle(status, tries + 1), 32);
        return;
      }
      // A host that already moved it on (delivered, read) is not overruled.
      if (found.status !== "sending") return;
      put(cur.map((x) => (x.id === msg.id ? { ...x, status } : x)));
      if (status === "failed")
        say("Message not delivered. Retry is on the bubble.");
    };
    if (out && typeof (out as PromiseLike<void>).then === "function") {
      Promise.resolve(out as PromiseLike<void>).then(
        () => settle("sent"),
        () => settle("failed"),
      );
    } else settle("sent");
  };
  const send = () => {
    if (disabled) return;
    const text = draft.trim();
    if (!text) return;
    counter.current += 1;
    const msg: SwipeMessage = {
      id: `${idBase}-s${counter.current}`,
      from: me,
      text,
      at: now,
      status: "sending",
      ...(replyTo ? { replyTo } : {}),
    };
    write([...list, msg]);
    setDraft("");
    setReplyTo(null);
    deliver(msg);
  };
  const retry = (m: SwipeMessage) => {
    if (disabled) return;
    write(list.map((x) => (x.id === m.id ? { ...x, status: "sending" } : x)));
    onRetry?.(m);
    deliver({ ...m, status: "sending" });
  };

  /* ------------------------------ scrolling ----------------------------- */

  const [loading, setLoading] = React.useState(false);
  const loadingRef = React.useRef(false);
  const anchor = React.useRef<{ height: number; top: number } | null>(null);
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const loadEarlier = () => {
    const log = logRef.current;
    if (!log || !hasEarlier || !onLoadEarlier || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    anchor.current = { height: log.scrollHeight, top: log.scrollTop };
    const done = (older?: SwipeMessage[] | void) => {
      if (!alive.current) return;
      loadingRef.current = false;
      setLoading(false);
      if (older && older.length) {
        const { list: cur, write: put } = latest.current;
        const have = new Set(cur.map((m) => m.id));
        put([...older.filter((m) => !have.has(m.id)), ...cur]);
        say(
          `${older.length} earlier ${older.length === 1 ? "message" : "messages"} loaded.`,
        );
      }
    };
    let out: unknown;
    try {
      out = onLoadEarlier();
    } catch {
      out = undefined;
    }
    if (out && typeof (out as PromiseLike<unknown>).then === "function") {
      Promise.resolve(out as PromiseLike<SwipeMessage[] | void>).then(
        done,
        () => done(),
      );
    } else done();
  };

  // Older history lands above without moving what you were reading.
  useAnchorEffect(() => {
    const log = logRef.current;
    const a = anchor.current;
    if (!log || !a) return;
    if (log.scrollHeight !== a.height) {
      log.scrollTop = a.top + (log.scrollHeight - a.height);
      anchor.current = null;
    }
  }, [track.first, loading]);

  // New messages at the end bring the thread down to them.
  // The first view opens at the latest message; later arrivals glide to it.
  const lastId = ids[ids.length - 1] ?? "";
  const settled = React.useRef(false);
  React.useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    log.scrollTo({
      top: log.scrollHeight,
      behavior: motionSafe && settled.current ? "smooth" : "auto",
    });
    settled.current = true;
  }, [lastId, motionSafe]);

  /* ------------------------------ keyboard ------------------------------ */

  const onRowKey = (
    event: React.KeyboardEvent<HTMLLIElement>,
    m: SwipeMessage,
  ) => {
    if (event.target !== event.currentTarget) return;
    const i = ids.indexOf(m.id);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(ids[Math.min(ids.length - 1, i + 1)]);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (i === 0) loadEarlier();
      focusRow(ids[Math.max(0, i - 1)]);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(ids[0]);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(ids[ids.length - 1]);
    } else if (
      (event.key === "r" || event.key === "R") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      startReply(m);
    } else if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      openMenu(m.id);
    }
  };

  /* -------------------------------- render ------------------------------ */

  const labelOf = (m: SwipeMessage) => {
    const mine = m.from === me;
    const who = mine ? "You" : (personOf(m.from)?.name ?? "Them");
    const q = quotedOf(m.replyTo);
    const rs = REACTIONS.filter(
      (r) => (m.reactions?.[r.kind]?.length ?? 0) > 0,
    );
    const count = rs.reduce(
      (s, r) => s + (m.reactions?.[r.kind]?.length ?? 0),
      0,
    );
    return [
      `${who}, ${clock(m.at)}${q ? `, replying to ${q.who}` : ""}: ${m.text}`,
      mine && m.status ? `${deliveryWords[m.status]}.` : "",
      count
        ? `${count} ${count === 1 ? "reaction" : "reactions"}: ${rs.map((r) => r.label).join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/([.?!])\s*\.(\s|$)/g, "$1$2");
  };

  const dock = replyTo ? quotedOf(replyTo) : null;

  return (
    <div
      className={cn("@container flex w-full justify-center", className)}
      style={{
        height,
        ["--sw-accent" as string]: accent,
        ["--sw-solid" as string]: `oklch(from ${accent} 0.52 0.16 h)`,
      }}
    >
      <div className="flex h-full w-full max-w-[24rem] flex-col overflow-hidden rounded-[22px] border border-hairline bg-card text-foreground">
        <header className="flex items-center gap-2.5 border-b border-hairline px-3 py-2.5">
          <span
            aria-hidden
            className="inline-flex size-7 shrink-0 items-center justify-center text-ink-3"
          >
            <ChevronLeft className="size-5" />
          </span>
          {other ? (
            <span
              aria-hidden
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-medium"
              style={{
                backgroundColor: `oklch(0.84 0.07 ${hueOf(other)})`,
                color: `oklch(0.32 0.08 ${hueOf(other)})`,
              }}
            >
              {initials(other.name)}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">
              {other?.name ?? "Thread"}
            </p>
            {other?.presence ? (
              <p className="truncate text-[11px] text-ink-3">
                {other.presence}
              </p>
            ) : null}
          </div>
        </header>

        <p id={hintId} className="sr-only">
          Arrow keys move between messages. R replies to the focused message;
          the menu key opens reactions.
        </p>
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label={`Messages with ${other?.name ?? "them"}`}
          aria-describedby={hintId}
          onScroll={(e) => {
            if (e.currentTarget.scrollTop < 40) loadEarlier();
          }}
          className="flex-1 [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain px-2 pb-3"
          style={{ minHeight: 0 }}
        >
          {hasEarlier && onLoadEarlier ? (
            <div className="flex h-9 items-center justify-center gap-2 text-[11px] text-ink-3">
              {loading ? (
                <>
                  <LoaderCircle
                    aria-hidden
                    className="size-3.5 motion-safe:animate-spin"
                  />
                  Loading earlier messages
                </>
              ) : (
                <button
                  type="button"
                  onClick={loadEarlier}
                  className={cn(
                    "rounded-full px-2 py-0.5 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  Earlier messages
                </button>
              )}
            </div>
          ) : (
            <p className="pt-3 text-center text-[11px] text-ink-3">
              Start of your conversation
            </p>
          )}
          <ol role="list" className="flex flex-col">
            {list.map((m, i) => {
              const prev = list[i - 1];
              const next = list[i + 1];
              const newDay = !prev || dayKey(prev.at) !== dayKey(m.at);
              const firstOfRun = newDay || !prev || prev.from !== m.from;
              const lastOfRun =
                !next ||
                next.from !== m.from ||
                dayKey(next.at) !== dayKey(m.at);
              return (
                <React.Fragment key={m.id}>
                  {newDay ? (
                    <li aria-hidden className="mt-3 mb-1 flex justify-center">
                      <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.04em] text-ink-3 uppercase">
                        {dayLabel(m.at, now)}
                      </span>
                    </li>
                  ) : null}
                  <MessageRow
                    message={m}
                    mine={m.from === me}
                    author={personOf(m.from)}
                    quoted={quotedOf(m.replyTo)}
                    firstOfRun={firstOfRun}
                    lastOfRun={lastOfRun}
                    fresh={track.fresh.includes(m.id)}
                    active={active === m.id}
                    menuOpen={menu?.id === m.id}
                    menuBelow={menu?.id === m.id ? menu.below : false}
                    me={me}
                    distance={swipeDistance}
                    bubbleStyle={bubbleStyle}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    label={labelOf(m)}
                    register={register}
                    onFocusRow={() => setActiveId(m.id)}
                    onKey={(e) => onRowKey(e, m)}
                    onReply={() => startReply(m)}
                    onOpenMenu={() => openMenu(m.id)}
                    onCloseMenu={closeMenu}
                    onReact={(kind) => react(m, kind)}
                    onRetry={() => retry(m)}
                  />
                </React.Fragment>
              );
            })}
          </ol>
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-hairline"
        >
          <AnimatePresence initial={false}>
            {dock ? (
              <motion.div
                key={replyTo}
                role="group"
                aria-label={`Replying to ${dock.who}`}
                className="overflow-hidden"
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
                        opacity: {
                          duration: durations.fast,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
              >
                <motion.div
                  className="flex items-center gap-2.5 px-3 pt-2.5"
                  initial={{ y: motionSafe ? distances.step : 0 }}
                  animate={{ y: 0 }}
                  transition={motionSafe ? springs.glide : { duration: 0 }}
                >
                  <motion.span
                    aria-hidden
                    className="w-0.5 self-stretch rounded-full bg-(--sw-accent)"
                    style={{ originY: 0 }}
                    initial={{ scaleY: motionSafe ? 0 : 1 }}
                    animate={{ scaleY: 1 }}
                    transition={
                      motionSafe
                        ? { ...springs.glide, delay: 0.05 }
                        : { duration: 0 }
                    }
                  />
                  <Reply
                    aria-hidden
                    className="size-3.5 shrink-0 text-(--sw-accent)"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">
                      Replying to {dock.who}
                    </span>
                    <span className="block truncate text-[12px] text-ink-2">
                      {dock.text}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Cancel reply"
                    onClick={() => {
                      setReplyTo(null);
                      composerRef.current?.focus();
                    }}
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-foreground",
                      FOCUS_RING,
                    )}
                  >
                    <X aria-hidden className="size-3.5" />
                  </button>
                </motion.div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <div className="flex items-end gap-2 p-2.5">
            <div className="grid min-w-0 flex-1 rounded-[18px] border border-input bg-surface-1 focus-within:border-(--sw-accent)">
              <textarea
                ref={composerRef}
                id={composerId}
                aria-label={`Message ${other?.name ?? ""}`.trim()}
                rows={1}
                value={draft}
                disabled={disabled}
                placeholder="Message"
                onChange={(e) => {
                  const value = e.currentTarget.value;
                  setDraft(value);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    send();
                  } else if (e.key === "Escape" && replyTo) {
                    e.preventDefault();
                    e.stopPropagation();
                    setReplyTo(null);
                  }
                }}
                className={cn(
                  "max-h-24 resize-none overflow-y-auto rounded-[18px] bg-transparent px-3.5 py-[7px] text-[13px] leading-5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
                  FOCUS_RING,
                )}
              />
              <span
                aria-hidden
                className="invisible max-h-24 overflow-hidden px-3.5 py-[7px] text-[13px] leading-5 break-words whitespace-pre-wrap [grid-area:1/1]"
              >
                {`${draft} `}
              </span>
            </div>
            <button
              type="submit"
              aria-label="Send"
              aria-disabled={disabled || !draft.trim() || undefined}
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--sw-solid) text-[oklch(0.99_0_0)] transition-opacity",
                !draft.trim() && "opacity-45",
                FOCUS_RING,
              )}
            >
              <ArrowUp aria-hidden className="size-4" />
            </button>
          </div>
        </form>

        <p role="status" className="sr-only">
          <span key={said.n}>{said.text}</span>
        </p>
      </div>
    </div>
  );
}
