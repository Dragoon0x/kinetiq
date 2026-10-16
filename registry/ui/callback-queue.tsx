"use client";

import * as React from "react";

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  CircleAlert,
  Clock,
  Headset,
  MessageSquare,
  Moon,
  PhoneCall,
  RotateCcw,
  Users,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, exitFor, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

/* ----------------------------------------------------------------------- */
/*                                  Types                                  */
/* ----------------------------------------------------------------------- */

export type QueueAgent = {
  id: string;
  name: string;
  initials: string;
  /** Free to take a chat, on a chat, or on a break (not counted as on shift). */
  status: "free" | "busy" | "break";
};

export type QueueSnapshot = {
  /** Your place in line: 1 is next, 0 is your turn. */
  position: number;
  /** Everyone waiting, you included. */
  waiting: number;
  /** The most the queue takes before it is full. */
  capacity: number;
  /** How long a chat takes on average, seconds. */
  avgHandleSeconds: number;
  /** Your ticket number; the person being served holds ticket − position. */
  ticket: number;
  /** Your place when you joined, for the lane. */
  joinedAt: number;
};

export type CallbackSlot = {
  id: string;
  label: string;
  /** When we call, ms; null is as soon as an agent is free. */
  at: number | null;
};

export type CallbackRequest = { phone: string; slot: CallbackSlot };

export type CallbackQueueStatus = "open" | "closed" | "full" | "loading";
export type CallbackQueueTokenStyle = "dots" | "tickets" | "lane";
export type CallbackQueueDensity = "compact" | "cozy" | "roomy";
export type CallbackQueueAccent = "cobalt" | "jade" | "amber" | "mono";

export type CallbackQueueProps = {
  /** How the line is drawn: circles to the desk, numbered ticket stubs, or a lane you ride along. @default "dots" */
  tokenStyle?: CallbackQueueTokenStyle;
  /** Token size, type and gaps. @default "cozy" */
  density?: CallbackQueueDensity;
  /** Your token, the estimate and the primary button: cobalt, jade, amber or mono. @default "cobalt" */
  accent?: CallbackQueueAccent;
  /** Where you are in the line and how fast it moves. A lower position moves you forward. @default defaultQueue */
  queue?: QueueSnapshot;
  /** Who is on shift and whether they're free. @default defaultQueueAgents */
  agents?: QueueAgent[];
  /** The moment times count from, ms. Never read from the clock. @default defaultQueueNow */
  now?: number;
  /** Open, closed for the day, full, or loading. @default "open" */
  status?: CallbackQueueStatus;
  /** Opening hours, minutes after midnight (UTC). @default { open: 480, close: 1200 } */
  hours?: { open: number; close: number };
  /** The times offered for a callback. @default the next three half hours (or tomorrow morning when closed) */
  callbackSlots?: CallbackSlot[];
  /** The number a callback goes to until it's changed. @default "07700 900418" */
  defaultPhone?: string;
  /** Whose queue this is. @default "Coldbrook" */
  company?: string;
  /** A callback was booked. Return a promise to hold the button; a rejection keeps the picker open. */
  onRequestCallback?: (request: CallbackRequest) => void | Promise<unknown>;
  /** A booked callback was cancelled; you're back in the line. */
  onCancelCallback?: () => void;
  /** Leave queue was pressed. */
  onLeave?: () => void;
  /** Rejoin was pressed after leaving. */
  onRejoin?: () => void;
  /** Join chat was pressed when it was your turn. */
  onJoinChat?: () => void;
  /** The most people drawn ahead of you; the rest fold into a count. @default 5 */
  maxTokens?: number;
  /** Nothing can be booked, left or joined. @default false */
  disabled?: boolean;
  /** Classes for the outer surface. */
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                             Seeded defaults                              */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** Thursday 15 October 2026, 14:05 UTC. */
export const defaultQueueNow = Date.UTC(2026, 9, 15, 14, 5);

export const defaultQueue: QueueSnapshot = {
  position: 4,
  waiting: 9,
  capacity: 24,
  avgHandleSeconds: 270,
  ticket: 47,
  joinedAt: 7,
};

export const defaultQueueAgents: QueueAgent[] = [
  { id: "ana", name: "Ana Lindgren", initials: "AL", status: "busy" },
  { id: "ravi", name: "Ravi Shah", initials: "RS", status: "busy" },
  { id: "lou", name: "Lou Okafor", initials: "LO", status: "busy" },
  { id: "mae", name: "Mae Torres", initials: "MT", status: "break" },
];

/* ----------------------------------------------------------------------- */
/*                                 Helpers                                  */
/* ----------------------------------------------------------------------- */

const ACCENT: Record<CallbackQueueAccent, Record<string, string>> = {
  cobalt: {
    "--cq-ink": "var(--accent-bright)",
    "--cq-fill": "var(--primary)",
    "--cq-on": "var(--primary-foreground)",
  },
  jade: {
    "--cq-ink": "var(--success)",
    "--cq-fill": "oklch(from var(--success) 0.52 0.12 h)",
    "--cq-on": "var(--primary-foreground)",
  },
  amber: {
    "--cq-ink": "var(--warn)",
    "--cq-fill": "oklch(from var(--warn) 0.8 0.13 h)",
    "--cq-on": "oklch(from var(--warn) 0.26 0.05 h)",
  },
  mono: {
    "--cq-ink": "var(--foreground)",
    "--cq-fill": "var(--foreground)",
    "--cq-on": "var(--background)",
  },
};

type Geometry = {
  token: number;
  gap: number;
  pad: string;
  stack: string;
  big: string;
  text: string;
};

const DENSITY: Record<CallbackQueueDensity, Geometry> = {
  compact: {
    token: 16,
    gap: 6,
    pad: "p-4",
    stack: "gap-3",
    big: "text-[24px]",
    text: "text-[12px]",
  },
  cozy: {
    token: 20,
    gap: 8,
    pad: "p-5",
    stack: "gap-4",
    big: "text-[28px]",
    text: "text-[12.5px]",
  },
  roomy: {
    token: 24,
    gap: 10,
    pad: "p-6",
    stack: "gap-5",
    big: "text-[32px]",
    text: "text-[13.5px]",
  },
};

const ordinal = (n: number) => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/** A fixed 24-hour clock in UTC: a locale lookup would not survive hydration. */
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const span = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
const minuteOfDay = (ms: number) => {
  const d = new Date(ms);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `••• ${digits.slice(-3)}` : phone;
};

/** An honest estimate: a likely figure and a range, from the line and the agents on it. */
function estimate(position: number, avgSeconds: number, onShift: number) {
  const seconds = (position * avgSeconds) / Math.max(1, onShift);
  const mid = Math.max(1, Math.round(seconds / 60));
  const low = Math.max(1, Math.floor((seconds * 0.8) / 60));
  const high = Math.max(mid + 1, Math.ceil((seconds * 1.3) / 60));
  return { mid, low, high };
}

/** Slots: as soon as possible, then the next three half hours inside opening hours, or tomorrow's first three when closed. */
function slotsFor(
  now: number,
  hours: { open: number; close: number },
  closed: boolean,
  asap: number,
): CallbackSlot[] {
  const day = now - (now % (24 * 60 * MIN));
  if (closed) {
    const today = minuteOfDay(now);
    const base = day + (today >= hours.open ? 24 * 60 * MIN : 0);
    return [0, 30, 60, 90].map((offset) => {
      const at = base + (hours.open + offset) * MIN;
      return {
        id: `t${offset}`,
        label: `${today >= hours.open ? "Tomorrow" : "Today"} ${clock(at)}`,
        at,
      };
    });
  }
  const out: CallbackSlot[] = [
    { id: "asap", label: `Soonest, about ${asap} min`, at: null },
  ];
  let t = Math.ceil((now + 20 * MIN) / (30 * MIN)) * 30 * MIN;
  while (out.length < 4) {
    const m = minuteOfDay(t);
    if (m >= hours.open && m < hours.close)
      out.push({ id: `s${t}`, label: clock(t), at: t });
    t += 30 * MIN;
    if (t - now > 2 * 24 * 60 * MIN) break;
  }
  return out;
}

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const BUTTON =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-2 px-3.5 text-[12.5px] font-medium whitespace-nowrap transition-[background-color,color,opacity]";
const PRIMARY = cn(
  BUTTON,
  "bg-[var(--cq-fill)] text-[var(--cq-on)] hover:bg-[color-mix(in_oklab,var(--cq-fill)_88%,var(--foreground))]",
);
const SECONDARY = cn(
  BUTTON,
  "border border-input bg-surface-1 text-foreground hover:bg-surface-2",
);
const GHOST = cn(BUTTON, "text-ink-2 hover:bg-surface-2 hover:text-foreground");

/** A node's height, measured when it arrives and whenever it changes. */
function useMeasured() {
  const [node, setNode] = React.useState<HTMLElement | null>(null);
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    ro.observe(node);
    return () => ro.disconnect();
  }, [node]);
  return [setNode, height] as const;
}

/* ----------------------------------------------------------------------- */
/*                              Rolling digits                              */
/* ----------------------------------------------------------------------- */

/**
 * Text that rolls a character at a time, aligned from the right like an
 * odometer: only the characters that change move. A falling number rolls
 * down (the new figure drops in from above), a rising one rolls up.
 */
function Rolling({
  text,
  down,
  motionSafe,
  delay = 0,
}: {
  text: string;
  down: boolean;
  motionSafe: boolean;
  delay?: number;
}) {
  const chars = [...text];
  const travel = motionSafe ? distances.shift * 0.75 : 0;
  return (
    <span aria-hidden className="inline-flex">
      {chars.map((char, i) => {
        const slot = chars.length - i;
        return (
          <span key={slot} className="relative inline-grid overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout" custom={down}>
              <motion.span
                key={char}
                custom={down}
                className="col-start-1 row-start-1"
                variants={{
                  enter: (d: boolean) => ({
                    y: d ? -travel : travel,
                    opacity: 0,
                  }),
                  shown: { y: 0, opacity: 1 },
                  leave: (d: boolean) => ({
                    y: d ? travel : -travel,
                    opacity: 0,
                    transition: exitFor(durations.fast),
                  }),
                }}
                initial="enter"
                animate="shown"
                exit="leave"
                transition={
                  motionSafe
                    ? {
                        y: { ...springs.glide, delay },
                        opacity: { duration: durations.fast, delay },
                      }
                    : { duration: durations.fast }
                }
              >
                {char === " " ? "\u00a0" : char}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 The line                                 */
/* ----------------------------------------------------------------------- */

type Mode = "waiting" | "callback" | "left" | "joined";

function Line({
  style,
  queue,
  mode,
  callbackAt,
  geo,
  motionSafe,
  maxTokens,
  uid,
  muted,
}: {
  style: CallbackQueueTokenStyle;
  queue: QueueSnapshot;
  mode: Mode;
  callbackAt: string | null;
  geo: Geometry;
  motionSafe: boolean;
  maxTokens: number;
  uid: string;
  muted: boolean;
}) {
  const position = Math.max(0, queue.position);
  const ahead = Math.max(0, position - 1);
  const shown = Math.min(ahead, Math.max(1, maxTokens));
  const hidden = ahead - shown;
  const serving = queue.ticket - position;
  const behind = Math.max(0, Math.min(3, queue.waiting - position));
  const turn = position === 0 && mode === "waiting";
  const inLine = mode === "waiting";
  const size = geo.token;
  const glide = motionSafe ? springs.glide : { duration: 0 };

  // People ahead keep their ticket numbers as keys, so when the front one is
  // served the rest are the same elements gliding one place forward.
  const tickets = Array.from(
    { length: shown },
    (_, i) => queue.ticket - shown + i,
  );
  const youLabel =
    mode === "callback" && callbackAt
      ? callbackAt
      : style === "tickets"
        ? String(queue.ticket)
        : "You";

  if (style === "lane") {
    const joined = Math.max(1, queue.joinedAt, position);
    const progress = Number(
      Math.min(1, Math.max(0, (joined - position) / joined)).toFixed(3),
    );
    return (
      <div
        aria-hidden
        className={cn("relative px-1", muted && "opacity-50")}
        style={{ height: size + 34 }}
      >
        <div
          className="absolute inset-x-1 flex items-center"
          style={{ top: 10, height: size }}
        >
          <span className="h-1.5 w-full rounded-full bg-hairline-strong" />
          <motion.span
            className="absolute left-0 h-1.5 rounded-full bg-[color-mix(in_oklab,var(--cq-ink)_55%,transparent)]"
            initial={false}
            animate={{ width: `calc(${progress} * (100% - ${size + 30}px))` }}
            transition={glide}
          />
          {Array.from({ length: Math.min(ahead, 12) }, (_, k) => {
            const f = Number(
              Math.min(1, (joined - position + k + 1) / joined).toFixed(3),
            );
            return (
              <motion.span
                key={queue.ticket - k - 1}
                className="absolute h-3 w-0.5 rounded-full bg-ink-3"
                initial={false}
                animate={{
                  left: `calc(${f} * (100% - ${size + 30}px) + ${size / 2}px)`,
                  opacity: 1,
                }}
                transition={glide}
              />
            );
          })}
          <span
            className={cn(
              "absolute right-0 flex items-center justify-center rounded-2 border bg-card",
              turn
                ? "border-[var(--cq-ink)] text-[var(--cq-ink)]"
                : "border-hairline-strong text-ink-2",
            )}
            style={{ width: size + 10, height: size + 10 }}
          >
            <Headset className="size-3.5" />
          </span>
          <motion.span
            className={cn(
              "absolute flex items-center justify-center rounded-full px-2 font-mono text-[10px] font-semibold whitespace-nowrap",
              inLine || mode === "callback"
                ? "bg-[var(--cq-fill)] text-[var(--cq-on)]"
                : "bg-surface-2 text-ink-3",
            )}
            style={{ height: size, minWidth: size }}
            initial={false}
            animate={{ left: `calc(${progress} * (100% - ${size + 30}px))` }}
            transition={glide}
          >
            {youLabel}
          </motion.span>
        </div>
        <span className="absolute bottom-0 left-1 font-mono text-[10px] text-ink-3">
          joined {ordinal(joined)}
        </span>
        <span className="absolute right-1 bottom-0 font-mono text-[10px] text-ink-3">
          desk
        </span>
      </div>
    );
  }

  const token = (kind: "ahead" | "behind") =>
    style === "tickets"
      ? cn(
          "flex items-center justify-center rounded-1 border font-mono text-[9.5px] tabular-nums",
          kind === "ahead"
            ? "border-hairline-strong bg-surface-2 text-ink-2"
            : "border-dashed border-hairline-strong text-ink-3",
        )
      : cn(
          "rounded-full border",
          kind === "ahead"
            ? "border-hairline-strong bg-surface-2"
            : "border-dashed border-hairline-strong",
        );
  const width = style === "tickets" ? Math.round(size * 1.5) : size;

  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden", muted && "opacity-50")}
    >
      <LayoutGroup id={`${uid}-line`}>
        <ol className="flex items-start pb-5" style={{ gap: geo.gap }}>
          <li className="relative flex shrink-0 flex-col items-center">
            {/* The desk lights when it's your turn: a colour change, so a
                plain transition carries it in both motion settings. */}
            <span
              className={cn(
                "flex items-center justify-center rounded-2 border bg-card transition-[border-color,color,box-shadow] duration-300",
                turn
                  ? "border-[var(--cq-ink)] text-[var(--cq-ink)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--cq-ink)_22%,transparent)]"
                  : "border-hairline-strong text-ink-2",
              )}
              style={{ width: size + 12, height: size + 12, marginTop: -6 }}
            >
              <Headset className="size-3.5" />
            </span>
            <span className="absolute top-full mt-1 font-mono text-[9.5px] whitespace-nowrap text-ink-3">
              {style === "tickets" && serving > 0 ? `now ${serving}` : "desk"}
            </span>
          </li>
          {hidden > 0 ? (
            <li
              className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 px-1.5 font-mono text-[9.5px] text-ink-2 tabular-nums"
              style={{ height: size }}
            >
              +{hidden}
            </li>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            {tickets.map((ticket) => (
              <motion.li
                key={ticket}
                layout={motionSafe ? "position" : false}
                className={cn("shrink-0", token("ahead"))}
                style={{ width, height: size }}
                initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
                animate={{ opacity: inLine || turn ? 1 : 0.45, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.6 : 1,
                  x: motionSafe ? -distances.shift : 0,
                  transition: exitFor(durations.slow),
                }}
                transition={
                  motionSafe
                    ? {
                        layout: springs.glide,
                        scale: springs.snap,
                        opacity: { duration: durations.base },
                      }
                    : { duration: durations.fast }
                }
              >
                {style === "tickets" ? ticket : null}
              </motion.li>
            ))}
            {mode !== "left" ? (
              <motion.li
                key="you"
                layout={motionSafe}
                className={cn(
                  "relative flex shrink-0 items-center justify-center font-semibold whitespace-nowrap",
                  mode === "callback"
                    ? "rounded-full bg-[var(--cq-fill)] px-2.5 font-mono text-[10.5px] text-[var(--cq-on)]"
                    : style === "tickets"
                      ? "rounded-1 bg-[var(--cq-fill)] font-mono text-[9.5px] text-[var(--cq-on)] tabular-nums"
                      : "rounded-full bg-[var(--cq-fill)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--cq-ink)_22%,transparent)]",
                )}
                style={{
                  height: size,
                  minWidth: mode === "callback" ? undefined : width,
                }}
                transition={
                  motionSafe ? { layout: springs.glide } : { duration: 0 }
                }
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={mode === "callback" ? "time" : "token"}
                    layout={motionSafe}
                    className="flex items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                    transition={{
                      duration: durations.base,
                      delay: motionSafe ? 0.12 : 0,
                    }}
                  >
                    {mode === "callback" ? (
                      <>
                        <PhoneCall className="size-3" />
                        {youLabel}
                      </>
                    ) : style === "tickets" ? (
                      youLabel
                    ) : null}
                  </motion.span>
                </AnimatePresence>
                {mode !== "callback" ? (
                  <span className="absolute top-full mt-1 font-mono text-[9.5px] text-[var(--cq-ink)]">
                    you
                  </span>
                ) : null}
              </motion.li>
            ) : null}
            {Array.from({ length: behind }, (_, k) => (
              <motion.li
                key={`b${queue.ticket + k + 1}`}
                layout={motionSafe ? "position" : false}
                className={cn("shrink-0", token("behind"))}
                // The line behind you fades out rather than ending.
                style={{
                  width,
                  height: size,
                  opacity: [0.6, 0.35, 0.15][k] ?? 0.15,
                }}
                transition={
                  motionSafe ? { layout: springs.glide } : { duration: 0 }
                }
              >
                {style === "tickets" ? queue.ticket + k + 1 : null}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      </LayoutGroup>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                The surface                               */
/* ----------------------------------------------------------------------- */

/**
 * A live support queue: your place, an honest wait and the agents on shift.
 * The line runs from the desk to your token; when `queue.position` drops, the
 * person at the front goes into the desk on the exit ease, everyone behind —
 * you included — glides one place forward on `springs.glide`, and your place
 * and the estimate roll down digit by digit, the estimate a beat later. The
 * estimate is a figure and a range from the position, the average chat and
 * the agents on shift, never a promise.
 *
 * Call me back opens a picker (a number and a radiogroup of times); booking
 * turns your token into a time chip in its place, one element whose layout
 * glides from circle to pill. Your turn, leaving, closed hours and a full
 * queue each say what happens next. Every change is announced politely as one
 * sentence; every action is a button. Under reduced motion tokens re-place
 * and digits cross-fade without travel.
 */
export function CallbackQueue({
  tokenStyle = "dots",
  density = "cozy",
  accent = "cobalt",
  queue = defaultQueue,
  agents = defaultQueueAgents,
  now = defaultQueueNow,
  status = "open",
  hours = { open: 480, close: 1200 },
  callbackSlots,
  defaultPhone = "07700 900418",
  company = "Coldbrook",
  onRequestCallback,
  onCancelCallback,
  onLeave,
  onRejoin,
  onJoinChat,
  maxTokens = 5,
  disabled = false,
  className,
}: CallbackQueueProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const geo = DENSITY[density] ?? DENSITY.cozy;
  const loading = status === "loading";
  const closed = status === "closed";
  const full = status === "full";

  const [mode, setMode] = React.useState<Mode>("waiting");
  const [picking, setPicking] = React.useState(false);
  const [phone, setPhone] = React.useState(defaultPhone);
  const [phoneError, setPhoneError] = React.useState<string | null>(null);
  const [slotId, setSlotId] = React.useState<string | null>(null);
  const [booked, setBooked] = React.useState<CallbackRequest | null>(null);
  const [booking, setBooking] = React.useState<"idle" | "busy" | "failed">(
    "idle",
  );
  const [announcement, setAnnouncement] = React.useState("");

  const onShift = agents.filter((a) => a.status !== "break");
  const free = agents.find((a) => a.status === "free");
  // Whoever takes your chat: a free agent, or the first one on shift.
  const ready = free ?? agents.find((a) => a.status !== "break");
  const position = Math.max(0, queue.position);
  const { mid, low, high } = estimate(
    position,
    queue.avgHandleSeconds,
    onShift.length,
  );
  const turn = position === 0 && mode === "waiting" && !closed && !full;
  const slots = callbackSlots ?? slotsFor(now, hours, closed, mid);
  const slot = slots.find((s) => s.id === slotId) ?? slots[0];
  const opensIn = (() => {
    const m = minuteOfDay(now);
    return m < hours.open ? hours.open - m : 24 * 60 - m + hours.open;
  })();

  // The queue moving is announced once per move, from the new place.
  const [seenPosition, setSeenPosition] = React.useState(position);
  const [down, setDown] = React.useState(true);
  if (seenPosition !== position) {
    setDown(position < seenPosition);
    setSeenPosition(position);
    if (mode === "waiting" && !closed && !full)
      setAnnouncement(
        position === 0
          ? `It's your turn. ${ready?.name.split(" ")[0] ?? "An agent"} is ready to chat.`
          : `You're ${ordinal(position)} in line. About ${estimate(position, queue.avgHandleSeconds, onShift.length).mid} minutes.`,
      );
  }

  /* ------------------------------ actions ------------------------------- */

  const callBackRef = React.useRef<HTMLButtonElement | null>(null);
  const [pickerFirst, setPickerFirst] = React.useState<HTMLInputElement | null>(
    null,
  );
  const wantPicker = React.useRef(false);
  React.useEffect(() => {
    if (!pickerFirst || !wantPicker.current || !pickerFirst.isConnected) return;
    wantPicker.current = false;
    pickerFirst.focus({ preventScroll: true });
  }, [pickerFirst]);
  const wantCallBack = React.useRef(false);
  const [callBackNode, setCallBackNode] =
    React.useState<HTMLButtonElement | null>(null);
  const bindCallBack = React.useCallback((node: HTMLButtonElement | null) => {
    callBackRef.current = node;
    setCallBackNode(node);
  }, []);
  React.useEffect(() => {
    if (!callBackNode || !wantCallBack.current || !callBackNode.isConnected)
      return;
    wantCallBack.current = false;
    callBackNode.focus({ preventScroll: true });
  }, [callBackNode]);
  const [mainNode, setMainNode] = React.useState<HTMLElement | null>(null);
  const wantMain = React.useRef(false);
  React.useEffect(() => {
    if (!mainNode || !wantMain.current || !mainNode.isConnected) return;
    wantMain.current = false;
    mainNode.focus({ preventScroll: true });
  }, [mainNode]);

  const openPicker = () => {
    if (disabled) return;
    wantPicker.current = true;
    setBooking("idle");
    setPicking(true);
  };
  const closePicker = () => {
    wantCallBack.current = true;
    setPicking(false);
    setPhoneError(null);
  };

  const book = (event: React.FormEvent) => {
    event.preventDefault();
    if (disabled || booking === "busy" || !slot) return;
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      setPhoneError("Enter a number we can call, with its area code.");
      pickerFirst?.focus();
      return;
    }
    const request: CallbackRequest = { phone: phone.trim(), slot };
    const land = () => {
      setBooked(request);
      setBooking("idle");
      setPicking(false);
      setMode("callback");
      wantMain.current = true;
      setAnnouncement(
        `Callback booked${slot.at === null ? " for as soon as an agent is free" : ` for ${slot.label}`}. We'll call ${request.phone}.`,
      );
    };
    const result = onRequestCallback?.(request);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setBooking("busy");
      (result as Promise<unknown>).then(land, () => {
        setBooking("failed");
        setAnnouncement("The callback didn't book. Try again.");
      });
    } else {
      land();
    }
  };

  const cancelCallback = () => {
    if (disabled) return;
    setMode("waiting");
    setBooked(null);
    onCancelCallback?.();
    wantCallBack.current = true;
    setAnnouncement(
      `Callback cancelled. You're ${ordinal(position)} in line again.`,
    );
  };
  const leave = () => {
    if (disabled) return;
    setMode("left");
    setPicking(false);
    onLeave?.();
    wantMain.current = true;
    setAnnouncement("You've left the queue.");
  };
  const rejoin = () => {
    if (disabled) return;
    setMode("waiting");
    onRejoin?.();
    wantCallBack.current = true;
    setAnnouncement(
      `You're back in the queue, ${ordinal(Math.max(1, position))} in line.`,
    );
  };
  const join = () => {
    if (disabled) return;
    setMode("joined");
    onJoinChat?.();
    setAnnouncement(
      `Opening your chat with ${ready?.name.split(" ")[0] ?? "an agent"}.`,
    );
  };

  const slotRefs = React.useRef(new Map<string, HTMLButtonElement | null>());
  const onSlotKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    i: number,
  ) => {
    let next = i;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (i + 1) % slots.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (i - 1 + slots.length) % slots.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = slots.length - 1;
    else return;
    event.preventDefault();
    const target = slots[next];
    if (!target) return;
    setSlotId(target.id);
    slotRefs.current.get(target.id)?.focus();
  };

  /* ------------------------------- parts -------------------------------- */

  const [bindLower, lowerHeight] = useMeasured();
  const accentVars = (ACCENT[accent] ?? ACCENT.cobalt) as React.CSSProperties;
  const callbackAt = booked
    ? booked.slot.at === null
      ? "Soonest"
      : clock(booked.slot.at)
    : null;
  const firstFree = free?.name.split(" ")[0];
  const readyName = ready?.name.split(" ")[0];

  const heading = (text: string) => (
    <h3
      ref={setMainNode}
      tabIndex={-1}
      className="text-[14px] leading-5 font-semibold text-foreground outline-none"
    >
      {text}
    </h3>
  );

  const stat = (
    label: string,
    value: React.ReactNode,
    sub?: React.ReactNode,
  ) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
        {label}
      </span>
      <span
        className={cn(
          "leading-none font-semibold text-foreground tabular-nums",
          geo.big,
        )}
      >
        {value}
      </span>
      {sub ? (
        <span className="text-[11.5px] leading-4 text-ink-3">{sub}</span>
      ) : null}
    </div>
  );

  const placeText =
    mode === "callback" ? "—" : turn ? "Now" : ordinal(Math.max(1, position));
  const waitText =
    mode === "callback" ? (callbackAt ?? "") : turn ? "0 min" : `${mid} min`;
  const placeSentence =
    mode === "callback"
      ? `Callback booked for ${callbackAt}.`
      : turn
        ? "It's your turn."
        : `You're ${ordinal(position)} in line, ${position - 1} ${position - 1 === 1 ? "person" : "people"} ahead. About ${mid} minutes, usually ${low} to ${high}.`;

  const picker = (
    <motion.form
      key="picker"
      noValidate
      onSubmit={book}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closePicker();
        }
      }}
      className="flex flex-col gap-3"
      initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
      transition={
        motionSafe
          ? { y: springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
      aria-labelledby={`${uid}-picker`}
    >
      <p
        id={`${uid}-picker`}
        className="text-[13px] leading-5 font-semibold text-foreground"
      >
        {closed ? "Book a call for when we open" : "We'll call you instead"}
      </p>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${uid}-phone`}
          className="text-[11.5px] leading-4 text-ink-2"
        >
          Number to call
        </label>
        <input
          ref={setPickerFirst}
          id={`${uid}-phone`}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={phoneError ? `${uid}-phone-error` : undefined}
          onChange={(event) => {
            const next = event.currentTarget.value;
            setPhone(next);
            setPhoneError(null);
          }}
          className={cn(
            "h-9 w-full rounded-2 border bg-surface-0 px-3 font-mono text-[13px] text-foreground tabular-nums",
            phoneError
              ? "border-[color-mix(in_oklab,var(--danger)_55%,transparent)]"
              : "border-input",
            "outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring focus-visible:outline-solid",
          )}
        />
        {phoneError ? (
          <p
            id={`${uid}-phone-error`}
            className="flex items-center gap-1.5 text-[11.5px] leading-4 text-danger"
          >
            <CircleAlert aria-hidden className="size-3.5 shrink-0" />
            {phoneError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <span id={`${uid}-when`} className="text-[11.5px] leading-4 text-ink-2">
          When
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${uid}-when`}
          className="grid grid-cols-2 gap-1.5"
        >
          {slots.map((s, i) => {
            const chosen = slot?.id === s.id;
            return (
              <button
                key={s.id}
                ref={(node) => {
                  slotRefs.current.set(s.id, node);
                }}
                type="button"
                role="radio"
                aria-checked={chosen}
                tabIndex={chosen ? 0 : -1}
                onClick={() => setSlotId(s.id)}
                onKeyDown={(event) => onSlotKey(event, i)}
                className={cn(
                  "relative flex h-9 min-w-0 items-center gap-1.5 rounded-2 border px-2.5 text-left text-[12px] transition-colors",
                  i === 0 && !closed && "col-span-2",
                  chosen
                    ? "border-[color-mix(in_oklab,var(--cq-ink)_55%,transparent)] bg-[color-mix(in_oklab,var(--cq-ink)_10%,transparent)] font-medium text-foreground"
                    : "border-hairline text-ink-2 hover:bg-surface-2 hover:text-foreground",
                  FOCUS,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                    chosen
                      ? "border-[var(--cq-ink)]"
                      : "border-hairline-strong",
                  )}
                >
                  <motion.span
                    className="size-1.5 rounded-full bg-[var(--cq-ink)]"
                    initial={false}
                    animate={{ scale: chosen ? 1 : 0 }}
                    transition={motionSafe ? springs.flick : { duration: 0 }}
                  />
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {booking === "failed" ? (
        <p className="flex items-center gap-1.5 text-[11.5px] leading-4 text-danger">
          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
          The callback didn&apos;t book. Try again.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          aria-disabled={disabled || booking === "busy" || undefined}
          aria-busy={booking === "busy" || undefined}
          className={cn(PRIMARY, FOCUS, "flex-1")}
        >
          <PhoneCall aria-hidden className="size-3.5" />
          {booking === "busy"
            ? "Booking…"
            : slot && slot.at !== null
              ? `Call me at ${clock(slot.at)}`
              : "Call me back"}
        </button>
        <button
          type="button"
          onClick={closePicker}
          className={cn(GHOST, FOCUS)}
        >
          Cancel
        </button>
      </div>
    </motion.form>
  );

  const agentsRow = (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 -space-x-1.5">
        {agents.slice(0, 4).map((agent) => (
          <span
            key={agent.id}
            title={`${agent.name}, ${agent.status === "free" ? "free" : agent.status === "busy" ? "on a chat" : "on a break"}`}
            className={cn(
              "relative flex size-7 items-center justify-center rounded-full border-2 border-card text-[10px] font-semibold",
              agent.status === "break"
                ? "bg-surface-2 text-ink-3"
                : "bg-[color-mix(in_oklab,var(--cq-ink)_16%,var(--card))] text-foreground",
            )}
          >
            {agent.initials}
            <span
              aria-hidden
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card transition-colors",
                agent.status === "free"
                  ? "bg-success"
                  : agent.status === "busy"
                    ? "bg-[var(--cq-ink)]"
                    : "bg-ink-3",
              )}
            />
          </span>
        ))}
      </div>
      <p className="min-w-0 text-[11.5px] leading-4 text-ink-2">
        <span className="font-medium text-foreground">
          {onShift.length} on shift
        </span>
        {free ? `, ${firstFree} is free` : ", all on chats"}
        {agents.length > onShift.length
          ? `, ${agents.length - onShift.length} on a break`
          : ""}
      </p>
    </div>
  );

  const actions = (() => {
    if (mode === "joined")
      return (
        <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <MessageSquare aria-hidden className="size-4 text-[var(--cq-ink)]" />
          {heading(`Chat open with ${readyName ?? "an agent"}`)}
        </div>
      );
    if (mode === "left")
      return (
        <div className="flex flex-col items-start gap-2">
          {heading("You've left the queue")}
          <p className={cn("text-ink-2", geo.text)}>
            Your place has gone to the next person. You can join again at the
            back.
          </p>
          <button
            ref={bindCallBack}
            type="button"
            onClick={rejoin}
            aria-disabled={disabled || undefined}
            className={cn(SECONDARY, FOCUS)}
          >
            <RotateCcw aria-hidden className="size-3.5" />
            Rejoin
          </button>
        </div>
      );
    if (mode === "callback")
      return (
        <div className="flex flex-col items-start gap-2">
          {heading(
            booked?.slot.at === null
              ? "We'll call as soon as we can"
              : `We'll call at ${callbackAt}`,
          )}
          <p className={cn("text-ink-2", geo.text)}>
            To {booked ? maskPhone(booked.phone) : ""}. You&apos;ve left the
            line, so there&apos;s no need to keep this page open.
          </p>
          <button
            type="button"
            onClick={cancelCallback}
            aria-disabled={disabled || undefined}
            className={cn(GHOST, FOCUS, "-ml-2")}
          >
            Cancel callback
          </button>
        </div>
      );
    if (turn)
      return (
        <motion.div
          className="flex flex-col items-stretch gap-2"
          initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            motionSafe
              ? { y: springs.snap, opacity: { duration: durations.fast } }
              : { duration: durations.fast }
          }
        >
          {heading(`It's your turn. ${readyName ?? "An agent"} is ready.`)}
          <button
            type="button"
            onClick={join}
            aria-disabled={disabled || undefined}
            className={cn(PRIMARY, FOCUS)}
          >
            <MessageSquare aria-hidden className="size-3.5" />
            Join chat
          </button>
        </motion.div>
      );
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={bindCallBack}
          type="button"
          onClick={openPicker}
          aria-disabled={disabled || undefined}
          aria-expanded={picking}
          className={cn(full || closed ? PRIMARY : SECONDARY, FOCUS, "flex-1")}
        >
          <PhoneCall aria-hidden className="size-3.5" />
          {closed ? "Book a callback" : "Call me back"}
        </button>
        {!closed && !full ? (
          <button
            type="button"
            onClick={leave}
            aria-disabled={disabled || undefined}
            className={cn(GHOST, FOCUS)}
          >
            Leave queue
          </button>
        ) : null}
      </div>
    );
  })();

  const notice = closed ? (
    <div className="flex items-start gap-3 rounded-3 border border-hairline bg-surface-1 p-3">
      <Moon aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-2" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] leading-5 font-semibold text-foreground">
          We&apos;re closed
        </p>
        <p className={cn("text-ink-2", geo.text)}>
          Live chat opens at {clock(Date.UTC(2026, 0, 1) + hours.open * MIN)},
          in {span(opensIn)}. Book a call for the morning and we&apos;ll ring
          you first.
        </p>
      </div>
    </div>
  ) : full ? (
    <div className="flex items-start gap-3 rounded-3 border border-[color-mix(in_oklab,var(--warn)_40%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] p-3">
      <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] leading-5 font-semibold text-foreground">
          The queue is full right now
        </p>
        <p className={cn("text-ink-2", geo.text)}>
          {queue.waiting} people are waiting, the most we can serve well. Book a
          callback and we&apos;ll ring you in the order you asked.
        </p>
      </div>
    </div>
  ) : null;

  const showLine = !closed && !full && !loading;

  return (
    <section
      aria-labelledby={`${uid}-title`}
      aria-busy={loading || undefined}
      className={cn(
        "@container/callback-queue relative flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={accentVars}
    >
      <header
        className={cn(
          geo.pad,
          "flex items-center justify-between gap-3 border-b border-hairline pb-3.5",
        )}
      >
        <div className="flex min-w-0 flex-col">
          <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
            {company} support
          </span>
          <h2
            id={`${uid}-title`}
            className="text-[15px] leading-5 font-semibold"
          >
            Live chat queue
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2 text-[11px] font-medium",
            closed
              ? "bg-surface-2 text-ink-2"
              : full
                ? "bg-[color-mix(in_oklab,var(--warn)_16%,transparent)] text-foreground"
                : "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full",
              closed ? "bg-ink-3" : full ? "bg-warn" : "bg-success",
            )}
          />
          {loading ? "Connecting" : closed ? "Closed" : full ? "Full" : "Open"}
        </span>
      </header>

      <div
        className={cn(
          geo.pad,
          "grid grid-cols-1 gap-x-6",
          geo.stack,
          "@min-[40rem]/callback-queue:grid-cols-2",
        )}
      >
        <div className={cn("flex min-w-0 flex-col", geo.stack)}>
          {loading ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <span className="h-2 w-14 rounded-full bg-surface-2" />
                    <span className="h-7 w-16 rounded-2 bg-surface-2 motion-safe:animate-pulse" />
                  </div>
                ))}
              </div>
              <span className="h-6 w-full rounded-full bg-surface-2 motion-safe:animate-pulse" />
            </div>
          ) : notice ? (
            notice
          ) : (
            <>
              <p className="sr-only">{placeSentence}</p>
              <div aria-hidden className="grid grid-cols-2 gap-4">
                {stat(
                  "Your place",
                  <Rolling
                    text={placeText}
                    down={down}
                    motionSafe={motionSafe}
                  />,
                  mode === "callback"
                    ? "out of the line"
                    : turn
                      ? "at the desk"
                      : `${position - 1} ahead of you`,
                )}
                {stat(
                  mode === "callback" ? "We'll call" : "Wait",
                  <span className="text-[var(--cq-ink)]">
                    <Rolling
                      text={waitText}
                      down={down}
                      motionSafe={motionSafe}
                      delay={motionSafe ? 0.12 : 0}
                    />
                  </span>,
                  mode === "callback"
                    ? booked?.slot.at === null
                      ? "as soon as we can"
                      : "booked"
                    : turn
                      ? "now"
                      : `usually ${low}–${high} min`,
                )}
              </div>
              {showLine ? (
                <>
                  <Line
                    style={tokenStyle}
                    queue={queue}
                    mode={mode}
                    callbackAt={callbackAt}
                    geo={geo}
                    motionSafe={motionSafe}
                    maxTokens={maxTokens}
                    uid={uid}
                    muted={mode === "left"}
                  />
                  {mode === "waiting" && !turn ? (
                    <p className="flex items-start gap-1.5 text-[11.5px] leading-4 text-ink-3">
                      <Clock aria-hidden className="mt-px size-3.5 shrink-0" />
                      <span>
                        Estimated from {onShift.length}{" "}
                        {onShift.length === 1 ? "agent" : "agents"} averaging{" "}
                        {(Math.round(queue.avgHandleSeconds / 30) / 2).toFixed(
                          queue.avgHandleSeconds % 60 >= 15 &&
                            queue.avgHandleSeconds % 60 < 45
                            ? 1
                            : 0,
                        )}{" "}
                        min a chat. It updates as the line moves.
                      </span>
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>

        <div className={cn("flex min-w-0 flex-col", geo.stack)}>
          {loading ? (
            <div className="flex items-center gap-3">
              <span className="size-7 rounded-full bg-surface-2" />
              <span className="h-2.5 w-32 rounded-full bg-surface-2" />
            </div>
          ) : (
            agentsRow
          )}
          <motion.div
            className="-m-1 overflow-hidden"
            initial={false}
            animate={{ height: lowerHeight ? lowerHeight : "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <div ref={bindLower} className="relative p-1">
              {loading ? (
                <span className="block h-9 w-full rounded-2 bg-surface-2" />
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {picking ? (
                    picker
                  ) : (
                    <motion.div
                      key={`actions-${mode}-${turn}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                      transition={{ duration: durations.base }}
                    >
                      {actions}
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
