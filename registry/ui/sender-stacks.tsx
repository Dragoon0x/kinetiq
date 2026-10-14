"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type Transition,
} from "motion/react";
import {
  CheckCheck,
  ChevronDown,
  Inbox,
  RotateCcw,
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

export type StackSenderKind = "person" | "team" | "system";
export type StackSenderTone = "cobalt" | "signal" | "success" | "warn" | "ink";

export type StackSender = {
  id: string;
  /** Shown on every card and read out with it, e.g. "Coldbrook Alerts". */
  name: string;
  /** Up to two letters for the avatar. @default the name's initials */
  initials?: string;
  /** A person, a team or a system; shown as a small tag from a 40rem container. @default "person" */
  kind?: StackSenderKind;
  /** The avatar's colour, mixed from a token. @default "cobalt" */
  tone?: StackSenderTone;
};

export type StackNotification = {
  id: string;
  /** A sender's id; notifications with the same sender share a stack. */
  sender: string;
  title: string;
  /** One line under the title; hidden in the compact density. */
  body?: string;
  /** When it arrived, in ms. Newest first within a stack. */
  at: number;
  /** @default false */
  read?: boolean;
};

export type StackChange =
  | { kind: "dismiss"; ids: string[]; sender: string }
  | { kind: "dismiss-stack"; ids: string[]; sender: string }
  | { kind: "read"; ids: string[]; sender: string }
  | { kind: "read-all"; ids: string[] };

export type StackStyle = "fan" | "accordion";
export type StackAvatarShape = "circle" | "rounded" | "square";
export type StackDensity = "compact" | "cozy" | "roomy";
export type StackStatus = "ready" | "loading" | "error";

export type SenderStacksProps = {
  /** How a stack opens: its cards fan down from behind the top card in a cascade, or each row unfolds in its own place. @default "fan" */
  stackStyle?: StackStyle;
  /** The avatar's outline. @default "circle" */
  avatarShape?: StackAvatarShape;
  /** Card height, padding and type size; compact drops the body line. @default "cozy" */
  density?: StackDensity;
  /** Everyone who sends, by id. A notification from an unknown sender is stacked under its id. @default defaultStackSenders */
  senders?: StackSender[];
  /** Controlled notifications. A new id arriving drops onto its stack. */
  notifications?: StackNotification[];
  /** Initial notifications when uncontrolled. @default defaultStackNotifications */
  defaultNotifications?: StackNotification[];
  /** Fires after every dismissal or read, with the notifications left and the change. */
  onChange?: (notifications: StackNotification[], change: StackChange) => void;
  /** Controlled set of open stacks, by sender id. */
  value?: string[];
  /** Initial open stacks when uncontrolled. @default [] */
  defaultValue?: string[];
  /** A stack fanned open or gathered; receives every open sender id. */
  onValueChange?: (value: string[]) => void;
  /** Notifications left the inbox: one from a swipe or Delete, a whole stack after its confirm. */
  onDismiss?: (dismissed: StackNotification[], sender: StackSender) => void;
  /** A single notification was opened from a press or Enter. It is already marked read. */
  onOpen?: (notification: StackNotification, sender: StackSender) => void;
  /** The moment ages count from, in ms; never read from the clock. @default defaultStackNow */
  now?: number;
  /** Whether the notifications have arrived. @default "ready" */
  status?: StackStatus;
  /** "Try again" was pressed after a failed load. */
  onRetry?: () => void;
  /** The heading. @default "Notifications" */
  title?: string;
  /** The surface's accessible name. @default the title */
  label?: string;
  /** Height of the inbox in px; the stacks scroll inside it. @default 540 */
  height?: number;
  /** Read only: nothing can be opened, dismissed or marked. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                                 Defaults                                 */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Monday 12 October 2026, 09:30 UTC. */
export const defaultStackNow = Date.UTC(2026, 9, 12, 9, 30);

export const defaultStackSenders: StackSender[] = [
  {
    id: "coldbrook-alerts",
    name: "Coldbrook Alerts",
    kind: "system",
    tone: "warn",
  },
  { id: "mara", name: "Mara Lind", kind: "person", tone: "cobalt" },
  { id: "basinworks", name: "Basinworks Crew", kind: "team", tone: "success" },
  { id: "kenji", name: "Kenji Aoki", kind: "person", tone: "signal" },
  { id: "billing", name: "Fieldline Billing", kind: "system", tone: "ink" },
  { id: "tomas", name: "Tomas Reyes", kind: "person", tone: "cobalt" },
];

/** Thirteen notifications across six senders in a Fieldline inbox. */
export const defaultStackNotifications: StackNotification[] = [
  {
    id: "n-1",
    sender: "coldbrook-alerts",
    title: "Pump 3 pressure back in range",
    body: "Riverside station, 2.1 bar after the valve reset.",
    at: defaultStackNow - 4 * MIN,
  },
  {
    id: "n-2",
    sender: "mara",
    title: "Commented on WO-1183",
    body: "Can we move the riser swap to Thursday? The crew is short.",
    at: defaultStackNow - 11 * MIN,
  },
  {
    id: "n-3",
    sender: "coldbrook-alerts",
    title: "Pump 3 pressure low",
    body: "Riverside station dropped to 1.4 bar.",
    at: defaultStackNow - 23 * MIN,
    read: true,
  },
  {
    id: "n-4",
    sender: "basinworks",
    title: "Trench backfill signed off",
    body: "Lot 14 closed by Priya Nair.",
    at: defaultStackNow - 48 * MIN,
    read: true,
  },
  {
    id: "n-5",
    sender: "kenji",
    title: "Shared a photo set",
    body: "Valve chamber survey, 12 photos.",
    at: defaultStackNow - 90 * MIN,
  },
  {
    id: "n-6",
    sender: "mara",
    title: "Assigned you WO-1207",
    body: "Hydrant service on Fern Street.",
    at: defaultStackNow - 2 * HOUR,
    read: true,
  },
  {
    id: "n-7",
    sender: "coldbrook-alerts",
    title: "Night shift check-in missed",
    body: "No check-in from the Riverside kiosk at 02:00.",
    at: defaultStackNow - 7 * HOUR - 30 * MIN,
  },
  {
    id: "n-8",
    sender: "billing",
    title: "September invoice is ready",
    body: "Fieldline Field, 14 seats.",
    at: defaultStackNow - 20 * HOUR,
    read: true,
  },
  {
    id: "n-9",
    sender: "basinworks",
    title: "Crew roster updated",
    body: "Two joiners starting Monday.",
    at: defaultStackNow - 26 * HOUR,
    read: true,
  },
  {
    id: "n-10",
    sender: "mara",
    title: "Mentioned you in Leak repair",
    body: "Ask Tomas which fitting we used last time.",
    at: defaultStackNow - 30 * HOUR,
    read: true,
  },
  {
    id: "n-11",
    sender: "coldbrook-alerts",
    title: "Kiosk clean-out due",
    body: "Riverside kiosk, every 90 days.",
    at: defaultStackNow - 2 * DAY,
    read: true,
  },
  {
    id: "n-12",
    sender: "kenji",
    title: "Replied to your note",
    body: "Steel on the main tie-in, copper for the branch.",
    at: defaultStackNow - 3 * DAY,
    read: true,
  },
  {
    id: "n-13",
    sender: "tomas",
    title: "Requested a review of WO-1192",
    body: "Cable joint repair, before it closes.",
    at: defaultStackNow - 4 * DAY,
    read: true,
  },
];

export const defaultStackValue: string[] = [];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const BUTTON =
  "inline-flex h-7 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground";

type DensitySpec = {
  /** Card height in px. */
  card: number;
  avatar: number;
  px: number;
  body: boolean;
};

const DENSITY: Record<StackDensity, DensitySpec> = {
  compact: { card: 54, avatar: 26, px: 10, body: false },
  cozy: { card: 70, avatar: 32, px: 12, body: true },
  roomy: { card: 84, avatar: 36, px: 14, body: true },
};

const TONES: Record<StackSenderTone, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  success: "var(--success)",
  warn: "var(--warn)",
  ink: "var(--ink-2)",
};

const SHAPES: Record<StackAvatarShape, string> = {
  circle: "rounded-full",
  rounded: "rounded-2",
  square: "rounded-1",
};

const KIND_WORD: Record<StackSenderKind, string> = {
  person: "",
  team: "Team",
  system: "System",
};

/** Space between fanned cards. */
const GAP = 6;
/** Room under a collapsed stack for its two edges. */
const EDGE = 8;
/** Padding inside a stack row, so a focus ring is never clipped. */
const PAD = 4;
const LIST_GAP = 10;
const CONFIRM_H = 44;
/** How far a card must travel before release dismisses it, in px. */
const SWIPE_FAR = 112;
/** How far it must have gone for a quick flick to count. */
const SWIPE_NEAR = 36;

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const DIGIT_H = 1.25;

const r3 = (v: number) => Number(v.toFixed(3));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const noopSubscribe = () => () => {};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** "4m" for the card, "4 minutes ago" for the reader. */
const ago = (at: number, now: number): { short: string; long: string } => {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return { short: "now", long: "just now" };
  const m = Math.floor(s / 60);
  if (m < 60)
    return { short: `${m}m`, long: `${plural(m, "minute", "minutes")} ago` };
  const h = Math.floor(m / 60);
  if (h < 24)
    return { short: `${h}h`, long: `${plural(h, "hour", "hours")} ago` };
  const d = Math.floor(h / 24);
  if (d < 7) return { short: `${d}d`, long: `${plural(d, "day", "days")} ago` };
  const w = Math.floor(d / 7);
  return { short: `${w}w`, long: `${plural(w, "week", "weeks")} ago` };
};

const initialsOf = (sender: StackSender) =>
  sender.initials ??
  sender.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const capture = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // No live pointer to capture.
  }
};

const release = (element: Element, pointerId: number) => {
  try {
    if (element.hasPointerCapture(pointerId))
      element.releasePointerCapture(pointerId);
  } catch {
    // Already released.
  }
};

type Stack = {
  sender: StackSender;
  items: StackNotification[];
  unread: number;
  latest: number;
  open: boolean;
};

/** Groups notifications by sender, newest first inside and between stacks. */
export const stackBySender = (
  notifications: StackNotification[],
  senders: StackSender[],
  open: string[],
): Stack[] => {
  const bySender = new Map<string, StackNotification[]>();
  for (const n of [...notifications].sort((a, b) => b.at - a.at)) {
    const list = bySender.get(n.sender);
    if (list) list.push(n);
    else bySender.set(n.sender, [n]);
  }
  const known = new Map(senders.map((s) => [s.id, s]));
  return [...bySender].map(([id, items]) => ({
    sender: known.get(id) ?? { id, name: id },
    items,
    unread: items.filter((n) => !n.read).length,
    latest: items[0]?.at ?? 0,
    open: open.includes(id) && items.length > 1,
  }));
};

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
  sender,
  size,
  shape,
}: {
  sender: StackSender;
  size: number;
  shape: StackAvatarShape;
}) {
  const tone = TONES[sender.tone ?? "cobalt"];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-mono font-semibold tracking-[0.04em] select-none",
        SHAPES[shape],
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        color: tone,
        background: `color-mix(in oklab, ${tone} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${tone} 22%, transparent)`,
      }}
    >
      {initialsOf(sender)}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                   Card                                   */
/* ----------------------------------------------------------------------- */

type CardProps = {
  itemId: string;
  notification: StackNotification;
  sender: StackSender;
  /** Position in its stack: 0 is the newest, the head. */
  index: number;
  count: number;
  stackUnread: number;
  open: boolean;
  stackStyle: StackStyle;
  avatarShape: StackAvatarShape;
  density: StackDensity;
  motionSafe: boolean;
  now: number;
  inert: boolean;
  tabIndex: number;
  /** Mounts with the drop onto its stack. */
  arrive: boolean;
  /** How long the unread dot waits before it ticks off, in s. */
  readDelay: number;
  hintId: string;
  nodeRef: (node: HTMLDivElement | null) => void;
  onFocus: () => void;
  onPress: () => void;
  /** The card has flown out; take it out of the data. */
  onDismissed: () => void;
  onDismissStack: () => void;
  onMarkRead: () => void;
  onNav: (event: React.KeyboardEvent) => void;
};

function Card({
  itemId,
  notification,
  sender,
  index,
  count,
  stackUnread,
  open,
  stackStyle,
  avatarShape,
  density,
  motionSafe,
  now,
  inert,
  tabIndex,
  arrive,
  readDelay,
  hintId,
  nodeRef,
  onFocus,
  onPress,
  onDismissed,
  onDismissStack,
  onMarkRead,
  onNav,
}: CardProps) {
  const spec = DENSITY[density];
  const H = spec.card;
  const head = index === 0;
  const multi = count > 1;
  const shown = head || open;
  const slotY = open ? index * (H + GAP) : 0;
  /** A swipe on a collapsed stack asks about the whole stack. */
  const stackSwipe = head && multi && !open;
  const step = cascade(count);

  const x = useMotionValue(0);
  const reveal = useTransform(x, [0, 56], [0, 1]);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const drag = React.useRef<{
    id: number;
    startX: number;
    startY: number;
    width: number;
    captured: boolean;
    lastX: number;
    lastT: number;
    vx: number;
  } | null>(null);
  const anim = React.useRef<ReturnType<typeof animate> | null>(null);
  const swiped = React.useRef(false);
  const alive = React.useRef(true);
  const dismissedRef = React.useRef(onDismissed);
  const [landing, setLanding] = React.useState(arrive);

  React.useEffect(() => {
    dismissedRef.current = onDismissed;
  });

  React.useEffect(
    () => () => {
      alive.current = false;
      anim.current?.stop();
    },
    [],
  );

  const settle = (to: number, transition: Transition) => {
    anim.current?.stop();
    if (!motionSafe) {
      x.set(to);
      return null;
    }
    const controls = animate(x, to, transition);
    anim.current = controls;
    return controls;
  };

  const flyOut = () => {
    if (inert) return;
    if (!motionSafe) {
      onDismissed();
      return;
    }
    const w = innerRef.current?.offsetWidth ?? 320;
    const controls = settle(w + 48, exitFor(durations.base));
    controls?.then(() => {
      if (alive.current) dismissedRef.current();
    });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (inert || event.button !== 0) return;
    anim.current?.stop();
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: event.currentTarget.offsetWidth,
      captured: false,
      lastX: event.clientX,
      lastT: event.timeStamp,
      vx: 0,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.startX;
    const dy = event.clientY - d.startY;
    if (!d.captured) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        // A vertical intent is a scroll; let the list have it.
        drag.current = null;
        return;
      }
      capture(event.currentTarget, event.pointerId);
      d.captured = true;
      swiped.current = true;
    }
    const dt = Math.max(1, event.timeStamp - d.lastT);
    d.vx = (event.clientX - d.lastX) / dt;
    d.lastX = event.clientX;
    d.lastT = event.timeStamp;
    // Rightward only: leftward pulls meet a stiff resistance.
    x.set(dx >= 0 ? dx : dx * 0.12);
  };

  const onPointerEnd = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    if (!d.captured) return;
    release(event.currentTarget, event.pointerId);
    const at = x.get();
    const far = Math.min(SWIPE_FAR, d.width * 0.42);
    const commit = !cancelled && (at > far || (at > SWIPE_NEAR && d.vx > 0.7));
    if (!commit) {
      settle(0, springs.snap);
      return;
    }
    if (stackSwipe) {
      settle(0, springs.snap);
      onDismissStack();
      return;
    }
    flyOut();
  };

  const when = ago(notification.at, now);
  const unread = !notification.read;
  const dotOn = head && multi && !open ? stackUnread > 0 : unread;
  const kind = KIND_WORD[sender.kind ?? "person"];

  const describe = () => {
    if (head && multi && !open) {
      return `${sender.name}, ${plural(count, "notification", "notifications")} stacked, ${stackUnread} unread. Newest: ${notification.title}, ${when.long}.`;
    }
    if (head && multi) {
      return `${sender.name}, ${count} notifications fanned open. ${notification.title}, ${when.long}${unread ? ", unread" : ""}.`;
    }
    return `${notification.title}, from ${sender.name}, ${when.long}${unread ? ", unread" : ""}.`;
  };

  /* ------------------------------ placement ----------------------------- */

  const delay = open
    ? index * step
    : r3(Math.max(0, count - 1 - index) * step * 0.5);
  const fan = stackStyle === "fan";

  const target = head
    ? { y: 0, scale: 1, scaleY: 1, opacity: 1 }
    : !motionSafe
      ? { y: slotY, scale: 1, scaleY: 1, opacity: open ? 1 : 0 }
      : open
        ? { y: slotY, scale: 1, scaleY: 1, opacity: 1 }
        : fan
          ? { y: 0, scale: 0.96, scaleY: 1, opacity: 1 }
          : { y: slotY, scale: 1, scaleY: 0.6, opacity: 0 };

  const transition = !motionSafe
    ? {
        y: { duration: 0 },
        scale: { duration: 0 },
        scaleY: { duration: 0 },
        opacity: { duration: durations.fast, delay: open ? delay : 0 },
      }
    : landing
      ? {
          ...springs.recoil,
          opacity: { duration: durations.fast, ease: easings.enter },
        }
      : {
          y: fan ? { ...springs.glide, delay } : { duration: 0 },
          scale: { ...springs.glide, delay },
          scaleY: { ...springs.glide, delay },
          opacity: {
            duration: open ? durations.base : durations.fast,
            ease: open ? easings.enter : easings.exit,
            delay,
          },
        };

  const initial = arrive
    ? motionSafe
      ? { y: -distances.shift, scale: 1.03, scaleY: 1, opacity: 0 }
      : { y: slotY, scale: 1, scaleY: 1, opacity: 0 }
    : false;

  return (
    <motion.div
      initial={initial}
      animate={target}
      transition={transition}
      onAnimationComplete={() => {
        if (landing) setLanding(false);
      }}
      className="absolute"
      style={{
        top: PAD,
        left: PAD,
        right: PAD,
        height: H,
        originY: 0,
        zIndex: 10 + count - index,
      }}
    >
      {/* Under the card: what a swipe is about to do. */}
      <motion.div
        aria-hidden
        style={{ opacity: reveal }}
        className="absolute inset-0 flex items-center gap-1.5 rounded-3 bg-[color-mix(in_oklab,var(--danger)_14%,var(--bg-0))] pl-3 text-[12px] font-medium text-danger"
      >
        <X aria-hidden className="size-3.5" />
        {stackSwipe ? `Dismiss all ${count}` : "Dismiss"}
      </motion.div>
      <motion.div
        ref={(node) => {
          innerRef.current = node;
          nodeRef(node);
        }}
        role="option"
        aria-selected={false}
        aria-label={describe()}
        aria-describedby={hintId}
        aria-disabled={inert || undefined}
        aria-hidden={!shown || undefined}
        inert={!shown}
        tabIndex={shown ? tabIndex : -1}
        style={{ x, touchAction: "pan-y", paddingInline: spec.px }}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => onPointerEnd(event, false)}
        onPointerCancel={(event) => onPointerEnd(event, true)}
        onClick={() => {
          if (swiped.current) {
            swiped.current = false;
            return;
          }
          if (!inert) onPress();
        }}
        onKeyDown={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            if (inert) return;
            if (event.shiftKey && multi) onDismissStack();
            else flyOut();
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!inert) onPress();
            return;
          }
          if (event.key === "m" || event.key === "M") {
            event.preventDefault();
            if (!inert) onMarkRead();
            return;
          }
          onNav(event);
        }}
        data-item={itemId}
        className={cn(
          "relative flex h-full items-center gap-2.5 rounded-3 border bg-card text-left select-none",
          head && multi
            ? "border-hairline-strong"
            : "border-hairline hover:border-hairline-strong",
          inert ? "cursor-default" : "cursor-pointer",
          "shadow-[0_1px_2px_color-mix(in_oklab,var(--ink)_6%,transparent)] transition-colors duration-150",
          FOCUS_RING,
        )}
      >
        <Avatar sender={sender} size={spec.avatar} shape={avatarShape} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[12px] font-semibold text-foreground">
              {sender.name}
            </span>
            {kind ? (
              <span className="hidden shrink-0 font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase @min-[40rem]:inline">
                {kind}
              </span>
            ) : null}
            <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-3 tabular-nums">
              {when.short}
            </span>
            <motion.span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full bg-cobalt-bright"
              initial={false}
              animate={
                motionSafe
                  ? { scale: dotOn ? 1 : 0, opacity: dotOn ? 1 : 0 }
                  : { scale: 1, opacity: dotOn ? 1 : 0 }
              }
              transition={
                motionSafe
                  ? { ...springs.flick, delay: readDelay }
                  : { duration: durations.fast, delay: readDelay }
              }
            />
          </span>
          <span
            className={cn(
              "truncate text-[13px] leading-[1.3]",
              unread ? "font-medium text-foreground" : "text-ink-2",
            )}
          >
            {notification.title}
          </span>
          {spec.body && notification.body ? (
            <span className="truncate text-[11.5px] leading-[1.3] text-ink-3">
              {notification.body}
            </span>
          ) : null}
        </span>
        {head && multi ? (
          <span
            aria-hidden
            className="flex h-5 shrink-0 items-center gap-0.5 rounded-full bg-surface-2 pr-1 pl-1.5 font-mono text-[10px] text-ink-2"
          >
            <Roll value={count} motionSafe={motionSafe} />
            <motion.span
              className="flex"
              initial={false}
              animate={{ rotate: open ? 180 : 0 }}
              transition={motionSafe ? springs.snap : { duration: 0 }}
            >
              <ChevronDown aria-hidden className="size-3" />
            </motion.span>
          </span>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

type Known = { key: string; ids: Set<string>; fresh: string[] };

type Wave = { index: Record<string, number>; n: number };

/**
 * A notification inbox that stacks by sender. Every sender's notifications
 * collapse into one card with two offset edges behind it and the count in a
 * badge. Pressing a stack fans it open: the cards spread downward from
 * behind the top card on `springs.glide` in a cascade while the stacks below
 * slide to make room; pressing again gathers them back under it. In the
 * accordion style each row unfolds in its own place instead of travelling.
 *
 * A card dragged to the right follows the pointer over a Dismiss track and,
 * past the threshold or on a quick flick, flies out on the exit ease while
 * the stack's count rolls down on `springs.snap` and the next card comes
 * forward; short of it the card springs home on `springs.snap`. Dragging a
 * collapsed stack asks first, in a strip that drops in on snap. Mark all
 * read ticks each unread dot off on `springs.flick` in a cascade, and a
 * notification arriving from the host drops onto its stack on
 * `springs.recoil`, the stack rising to the top of the list on glide.
 *
 * The stacks are one listbox: Up and Down move, Home and End jump, Enter or
 * Space fans a stack or opens a notification, Delete dismisses, Shift+Delete
 * dismisses a whole stack, M marks read and Escape gathers or cancels.
 * Every change is announced. Under reduced motion nothing travels: cards
 * cross-fade into place, dots fade off, the confirm appears and every state
 * is still reached.
 */
export function SenderStacks({
  stackStyle = "fan",
  avatarShape = "circle",
  density = "cozy",
  senders = defaultStackSenders,
  notifications,
  defaultNotifications = defaultStackNotifications,
  onChange,
  value,
  defaultValue = defaultStackValue,
  onValueChange,
  onDismiss,
  onOpen,
  now = defaultStackNow,
  status = "ready",
  onRetry,
  title = "Notifications",
  label,
  height = 540,
  disabled = false,
  className,
}: SenderStacksProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;

  const [ownItems, setOwnItems] = React.useState(defaultNotifications);
  const items = notifications ?? ownItems;
  const [ownOpen, setOwnOpen] = React.useState(defaultValue);
  const open = value ?? ownOpen;
  const ready = status === "ready";
  const inert = disabled || !ready;

  const [confirm, setConfirm] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [focusReq, setFocusReq] = React.useState<{
    id: string;
    seq: number;
  } | null>(null);
  const [wave, setWave] = React.useState<Wave | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  // False for the server render and hydration, true once mounted: the empty
  // state only lands when it was reached on the page, never on first paint.
  const live = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const nodes = React.useRef(new Map<string, HTMLElement>());

  /* ------------------------------ arrivals ----------------------------- */

  // Ids seen so far, kept as state so a new one can be told apart at render
  // time: it mounts with the drop, the rest never do.
  const idsKey = items.map((n) => n.id).join("\n");
  const [known, setKnown] = React.useState<Known>(() => ({
    key: idsKey,
    ids: new Set(items.map((n) => n.id)),
    fresh: [],
  }));
  if (known.key !== idsKey) {
    const fresh = items.filter((n) => !known.ids.has(n.id)).map((n) => n.id);
    const ids = new Set(known.ids);
    for (const id of fresh) ids.add(id);
    setKnown({ key: idsKey, ids, fresh });
    const first = items.find((n) => n.id === fresh[0]);
    if (first) {
      const from =
        senders.find((s) => s.id === first.sender)?.name ?? first.sender;
      setAnnouncement(`New from ${from}: ${first.title}.`);
    }
  }

  /* -------------------------------- data ------------------------------- */

  const stacks = stackBySender(items, senders, open);
  const senderOf = (id: string): StackSender =>
    stacks.find((s) => s.sender.id === id)?.sender ??
    senders.find((s) => s.id === id) ?? { id, name: id };
  const unread = items.filter((n) => !n.read).length;
  const total = items.length;

  const navItems = stacks.flatMap((s) =>
    s.open
      ? [`s:${s.sender.id}`, ...s.items.slice(1).map((n) => `n:${n.id}`)]
      : [`s:${s.sender.id}`],
  );
  const activeNav =
    activeId && navItems.includes(activeId) ? activeId : (navItems[0] ?? null);

  const waveStep = wave ? cascade(wave.n) : 0;
  const delayFor = (ids: string[]) => {
    if (!wave) return 0;
    for (const id of ids) {
      const i = wave.index[id];
      if (i !== undefined) return r3(i * waveStep);
    }
    return 0;
  };

  /* ------------------------------- changes ----------------------------- */

  const commit = (next: StackNotification[], change: StackChange) => {
    if (notifications === undefined) setOwnItems(next);
    onChange?.(next, change);
  };

  const requestFocus = (id: string) =>
    setFocusReq((f) => ({ id, seq: (f?.seq ?? 0) + 1 }));

  React.useLayoutEffect(() => {
    if (!focusReq) return;
    nodes.current.get(focusReq.id)?.focus({ preventScroll: true });
  }, [focusReq]);

  /** The item to land on once `removed` nav ids are gone. */
  const nextAfter = (removed: string[]) => {
    const gone = new Set(removed);
    const i = navItems.findIndex((id) => gone.has(id));
    if (i < 0) return null;
    return (
      navItems.slice(i + 1).find((id) => !gone.has(id)) ??
      [...navItems.slice(0, i)].reverse().find((id) => !gone.has(id)) ??
      null
    );
  };

  const dismiss = (ids: string[], senderId: string, whole: boolean) => {
    if (inert) return;
    const gone = items.filter((n) => ids.includes(n.id));
    if (gone.length === 0) return;
    const next = items.filter((n) => !ids.includes(n.id));
    const sender = senderOf(senderId);
    const left = next.filter((n) => n.sender === senderId).length;
    const stack = stacks.find((s) => s.sender.id === senderId);
    const removedNav = whole
      ? [
          `s:${senderId}`,
          ...(stack?.items.slice(1).map((n) => `n:${n.id}`) ?? []),
        ]
      : ids.map((id) =>
          stack?.items[0]?.id === id ? `s:${senderId}` : `n:${id}`,
        );
    // The head keeps its nav id while the stack survives, so focus stays on
    // the card that comes forward; otherwise it moves to the neighbour.
    const landOn = !whole && left > 0 ? `s:${senderId}` : nextAfter(removedNav);
    commit(next, {
      kind: whole ? "dismiss-stack" : "dismiss",
      ids: gone.map((n) => n.id),
      sender: senderId,
    });
    onDismiss?.(gone, sender);
    if (left === 0 && confirm === senderId) setConfirm(null);
    setAnnouncement(
      whole
        ? `Dismissed all ${gone.length} from ${sender.name}. ${next.length === 0 ? "All caught up." : `${plural(next.length, "notification", "notifications")} left.`}`
        : `Dismissed ${gone[0]?.title ?? "notification"}. ${left === 0 ? `Nothing left from ${sender.name}.` : `${left} left from ${sender.name}.`}`,
    );
    if (landOn) {
      setActiveId(landOn);
      requestFocus(landOn);
    }
  };

  const markRead = (ids: string[], change: StackChange, words: string) => {
    if (inert) return false;
    const target = ids.filter((id) =>
      items.some((n) => n.id === id && !n.read),
    );
    if (target.length === 0) return false;
    const next = items.map((n) =>
      target.includes(n.id) ? { ...n, read: true } : n,
    );
    setWave({
      index: Object.fromEntries(target.map((id, i) => [id, i])),
      n: target.length,
    });
    commit(next, change);
    setAnnouncement(words);
    return true;
  };

  const markAll = () => {
    // Visual order, so the dots tick off top to bottom.
    const ids = stacks
      .flatMap((s) => s.items)
      .filter((n) => !n.read)
      .map((n) => n.id);
    markRead(
      ids,
      { kind: "read-all", ids },
      `Marked ${plural(ids.length, "notification", "notifications")} as read.`,
    );
  };

  const setOpenStacks = (next: string[]) => {
    if (value === undefined) setOwnOpen(next);
    onValueChange?.(next);
  };

  const toggle = (stack: Stack) => {
    if (inert) return;
    const id = stack.sender.id;
    const wasOpen = open.includes(id);
    setOpenStacks(wasOpen ? open.filter((s) => s !== id) : [...open, id]);
    setAnnouncement(
      wasOpen
        ? `${stack.sender.name} gathered.`
        : `${stack.sender.name} fanned open, ${plural(stack.items.length, "notification", "notifications")}.`,
    );
  };

  const press = (stack: Stack, notification: StackNotification) => {
    if (inert) return;
    const head = stack.items[0]?.id === notification.id;
    if (head && stack.items.length > 1) {
      toggle(stack);
      return;
    }
    const words = `Opened ${notification.title}.`;
    const marked = markRead(
      [notification.id],
      { kind: "read", ids: [notification.id], sender: stack.sender.id },
      words,
    );
    if (!marked) setAnnouncement(words);
    onOpen?.({ ...notification, read: true }, stack.sender);
  };

  const askStack = (stack: Stack) => {
    if (inert) return;
    if (stack.items.length === 1) {
      dismiss([stack.items[0]?.id ?? ""], stack.sender.id, false);
      return;
    }
    setConfirm(stack.sender.id);
    setAnnouncement(
      `Dismiss all ${stack.items.length} from ${stack.sender.name}? Confirm or Keep.`,
    );
    requestFocus(`confirm:${stack.sender.id}`);
  };

  const cancelConfirm = () => {
    const id = confirm;
    setConfirm(null);
    if (id) {
      setActiveId(`s:${id}`);
      requestFocus(`s:${id}`);
      setAnnouncement("Kept.");
    }
  };

  /* ------------------------------ keyboard ----------------------------- */

  const onNav = (event: React.KeyboardEvent, itemId: string) => {
    const i = navItems.indexOf(itemId);
    let to = -1;
    if (event.key === "ArrowDown") to = i + 1;
    else if (event.key === "ArrowUp") to = i - 1;
    else if (event.key === "Home") to = 0;
    else if (event.key === "End") to = navItems.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      if (confirm) {
        cancelConfirm();
        return;
      }
      if (itemId.startsWith("n:")) {
        const id = itemId.slice(2);
        const stack = stacks.find((s) => s.items.some((n) => n.id === id));
        if (stack?.open) {
          toggle(stack);
          setActiveId(`s:${stack.sender.id}`);
          requestFocus(`s:${stack.sender.id}`);
        }
      }
      return;
    } else return;
    event.preventDefault();
    const target = navItems[clamp(to, 0, navItems.length - 1)];
    if (target) nodes.current.get(target)?.focus();
  };

  /* ------------------------------- render ------------------------------ */

  const spec = DENSITY[density];
  const H = spec.card;

  const rowHeight = (stack: Stack) => {
    const n = stack.items.length;
    const inner = stack.open ? n * H + (n - 1) * GAP : H + (n > 1 ? EDGE : 0);
    return (
      PAD * 2 + inner + (confirm === stack.sender.id ? CONFIRM_H + GAP : 0)
    );
  };

  const confirmTop = (stack: Stack) => {
    const n = stack.items.length;
    return PAD + (stack.open ? n * (H + GAP) : H + EDGE + GAP);
  };

  const register = (id: string) => (node: HTMLElement | null) => {
    if (node) nodes.current.set(id, node);
    else nodes.current.delete(id);
  };

  const empty = ready && total === 0;

  return (
    <div
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
        Enter fans a stack open or gathers it, and opens a single notification.
        Delete dismisses. Shift and Delete dismisses a whole stack. M marks
        read.
      </p>

      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-3 pb-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p id={titleId} className="min-w-0 truncate text-sm font-semibold">
            {title}
          </p>
          <p className="flex items-baseline gap-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {ready ? (
              <>
                <span className="sr-only">{unread} unread</span>
                <Roll
                  value={unread}
                  motionSafe={motionSafe}
                  className={cn(
                    "text-[10px]",
                    unread > 0 ? "text-cobalt-bright" : "text-ink-3",
                  )}
                />
                <span aria-hidden>unread</span>
                <span aria-hidden className="hidden @min-[28rem]:inline">
                  &middot; {plural(stacks.length, "sender", "senders")}
                </span>
              </>
            ) : status === "loading" ? (
              "Loading"
            ) : (
              "Not loaded"
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={markAll}
          aria-disabled={inert || unread === 0 || undefined}
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 px-2 text-xs transition-colors",
            !inert && unread > 0
              ? "text-ink-2 hover:bg-surface-2 hover:text-foreground"
              : "cursor-default text-ink-3",
            FOCUS_RING,
          )}
        >
          <CheckCheck aria-hidden className="size-3.5" />
          <span className="hidden @min-[28rem]:inline">Mark all read</span>
          <span className="@min-[28rem]:hidden">Read all</span>
        </button>
      </header>

      <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-contain border-t border-hairline">
        {status === "error" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <TriangleAlert aria-hidden className="size-5 text-danger" />
            <p className="text-sm text-foreground">
              The notifications didn&apos;t load.
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
          <div aria-hidden className="flex flex-col px-3 py-2">
            {[3, 1, 2, 1, 1].map((edges, i) => (
              <div
                key={i}
                className="relative"
                style={{
                  height: PAD * 2 + H + (edges > 1 ? EDGE : 0),
                  marginBottom: LIST_GAP,
                }}
              >
                {edges > 1 ? (
                  <span
                    className="absolute rounded-3 bg-surface-1"
                    style={{
                      top: PAD + 4,
                      left: PAD + 7,
                      right: PAD + 7,
                      height: H,
                    }}
                  />
                ) : null}
                <span
                  className="absolute flex items-center gap-2.5 rounded-3 bg-surface-2 motion-safe:animate-pulse"
                  style={{
                    top: PAD,
                    left: PAD,
                    right: PAD,
                    height: H,
                    paddingInline: spec.px,
                    animationDelay: `${i * 90}ms`,
                  }}
                >
                  <span
                    className={cn("shrink-0 bg-surface-1", SHAPES[avatarShape])}
                    style={{ width: spec.avatar, height: spec.avatar }}
                  />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span
                      className="h-2.5 rounded-1 bg-surface-1"
                      style={{ width: `${34 + ((i * 17) % 30)}%` }}
                    />
                    <span
                      className="h-2.5 rounded-1 bg-surface-1"
                      style={{ width: `${58 + ((i * 23) % 30)}%` }}
                    />
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence initial={false} mode="wait">
            {empty ? (
              <motion.div
                key="empty"
                initial={
                  live
                    ? motionSafe
                      ? { opacity: 0, scale: 0.92 }
                      : { opacity: 0 }
                    : false
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        ...springs.recoil,
                        opacity: {
                          duration: durations.base,
                          ease: easings.enter,
                        },
                      }
                    : { duration: durations.fast }
                }
                className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-2">
                  <Inbox aria-hidden className="size-5 text-ink-3" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  All caught up
                </p>
                <p className="text-[12px] text-ink-3">
                  New notifications stack here by sender.
                </p>
              </motion.div>
            ) : (
              <motion.ul
                key="list"
                role="listbox"
                aria-label={`${title}, stacked by sender`}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                className="relative flex flex-col px-3 py-2"
              >
                <AnimatePresence initial={false}>
                  {stacks.map((stack) => {
                    const sid = stack.sender.id;
                    const n = stack.items.length;
                    const multi = n > 1;
                    const asking = confirm === sid;
                    return (
                      <motion.li
                        key={sid}
                        role="group"
                        aria-label={stack.sender.name}
                        layout={motionSafe ? "position" : false}
                        initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                        animate={{
                          height: rowHeight(stack),
                          opacity: 1,
                          marginBottom: LIST_GAP,
                        }}
                        exit={{
                          height: 0,
                          opacity: 0,
                          marginBottom: 0,
                          transition: motionSafe
                            ? exitFor(durations.base)
                            : { duration: 0 },
                        }}
                        transition={
                          motionSafe
                            ? {
                                layout: springs.glide,
                                height: springs.glide,
                                marginBottom: springs.glide,
                                opacity: {
                                  duration: durations.base,
                                  ease: easings.enter,
                                },
                              }
                            : {
                                duration: 0,
                                opacity: { duration: durations.fast },
                              }
                        }
                        className="group relative shrink-0 overflow-hidden"
                      >
                        {multi ? (
                          <>
                            <motion.span
                              aria-hidden
                              initial={false}
                              animate={{ opacity: stack.open ? 0 : 1 }}
                              transition={{
                                duration: durations.fast,
                                delay:
                                  stack.open || !motionSafe
                                    ? 0
                                    : durations.slow,
                              }}
                              className="absolute rounded-3 border border-hairline bg-card transition-transform duration-200 group-hover:translate-y-px"
                              style={{
                                top: PAD + 4,
                                left: PAD + 7,
                                right: PAD + 7,
                                height: H,
                                zIndex: 2,
                              }}
                            />
                            <motion.span
                              aria-hidden
                              initial={false}
                              animate={{ opacity: stack.open ? 0 : 1 }}
                              transition={{
                                duration: durations.fast,
                                delay:
                                  stack.open || !motionSafe
                                    ? 0
                                    : durations.slow,
                              }}
                              className="absolute rounded-3 border border-hairline bg-surface-1 transition-transform duration-200 group-hover:translate-y-0.5"
                              style={{
                                top: PAD + 8,
                                left: PAD + 14,
                                right: PAD + 14,
                                height: H,
                                zIndex: 1,
                              }}
                            />
                          </>
                        ) : null}

                        {stack.items.map((notification, i) => {
                          const itemId =
                            i === 0 ? `s:${sid}` : `n:${notification.id}`;
                          const headIds =
                            i === 0 && multi && !stack.open
                              ? stack.items.map((x) => x.id)
                              : [notification.id];
                          return (
                            <Card
                              key={notification.id}
                              itemId={itemId}
                              notification={notification}
                              sender={stack.sender}
                              index={i}
                              count={n}
                              stackUnread={stack.unread}
                              open={stack.open}
                              stackStyle={stackStyle}
                              avatarShape={avatarShape}
                              density={density}
                              motionSafe={motionSafe}
                              now={now}
                              inert={inert}
                              tabIndex={activeNav === itemId ? 0 : -1}
                              arrive={known.fresh.includes(notification.id)}
                              readDelay={delayFor(headIds)}
                              hintId={hintId}
                              nodeRef={register(itemId)}
                              onFocus={() => setActiveId(itemId)}
                              onPress={() => press(stack, notification)}
                              onDismissed={() =>
                                dismiss([notification.id], sid, false)
                              }
                              onDismissStack={() => askStack(stack)}
                              onMarkRead={() => {
                                const ids =
                                  i === 0 && multi && !stack.open
                                    ? stack.items.map((x) => x.id)
                                    : [notification.id];
                                const done = markRead(
                                  ids,
                                  { kind: "read", ids, sender: sid },
                                  ids.length > 1
                                    ? `Marked ${ids.length} from ${stack.sender.name} as read.`
                                    : `Marked read: ${notification.title}.`,
                                );
                                if (!done) setAnnouncement("Already read.");
                              }}
                              onNav={(event) => onNav(event, itemId)}
                            />
                          );
                        })}

                        <AnimatePresence>
                          {asking ? (
                            <motion.div
                              key="confirm"
                              role="group"
                              aria-label={`Dismiss all ${n} from ${stack.sender.name}`}
                              initial={{
                                opacity: 0,
                                y: motionSafe ? -distances.nudge : 0,
                              }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{
                                opacity: 0,
                                transition: exitFor(durations.fast),
                              }}
                              transition={
                                motionSafe
                                  ? {
                                      ...springs.snap,
                                      opacity: { duration: durations.fast },
                                    }
                                  : { duration: durations.fast }
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelConfirm();
                                }
                              }}
                              className="absolute flex items-center gap-2 rounded-3 border border-hairline-strong bg-popover pr-1.5 pl-3"
                              style={{
                                top: confirmTop(stack),
                                left: PAD,
                                right: PAD,
                                height: CONFIRM_H,
                                zIndex: 40,
                              }}
                            >
                              <p className="min-w-0 flex-1 truncate text-[12px] text-foreground">
                                Dismiss all {n} from {stack.sender.name}?
                              </p>
                              <button
                                ref={register(`confirm:${sid}`)}
                                type="button"
                                onClick={() => {
                                  setConfirm(null);
                                  dismiss(
                                    stack.items.map((x) => x.id),
                                    sid,
                                    true,
                                  );
                                }}
                                className={cn(
                                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-2 border border-[color-mix(in_oklab,var(--danger)_45%,transparent)] bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] px-2.5 text-xs font-medium text-danger transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_22%,transparent)]",
                                  FOCUS_RING,
                                )}
                              >
                                <X aria-hidden className="size-3.5" />
                                Dismiss all
                              </button>
                              <button
                                type="button"
                                onClick={cancelConfirm}
                                className={cn(BUTTON, "shrink-0", FOCUS_RING)}
                              >
                                Keep
                              </button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </motion.ul>
            )}
          </AnimatePresence>
        )}
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
