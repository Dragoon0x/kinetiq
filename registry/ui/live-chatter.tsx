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
  ArrowDown,
  BadgeCheck,
  Flag,
  Lock,
  Mic,
  Pause,
  RotateCcw,
  Send,
  Shield,
  Timer,
  TriangleAlert,
  WifiOff,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type LiveChatterBadge = "host" | "mod" | "speaker" | "staff";

export type LiveChatterMessage = {
  id: string;
  author: string;
  /** The message. Gap items leave it empty. */
  text: string;
  /** When it was sent, in ms since the epoch. */
  at: number;
  badges?: LiveChatterBadge[];
  /** A `gap` marks messages lost while the connection was down. @default "message" */
  kind?: "message" | "gap";
  /** Gap only: how many messages were missed. */
  missed?: number;
  /** Gap only: when the connection came back, in ms since the epoch. */
  until?: number;
};

export type LiveChatterConnection = "live" | "reconnecting" | "offline";
export type LiveChatterDensity = "compact" | "regular" | "roomy";
export type LiveChatterStatus = "ready" | "loading" | "error";
export type LiveChatterPauseReason =
  "hover" | "focus" | "key" | "scroll" | "pill" | "send";

export type LiveChatterProps = {
  /** The stream so far, oldest first. The host appends; the chat follows. @default defaultLiveChatterMessages */
  messages?: LiveChatterMessage[];
  /** The broadcast's name, in the header. @default "Coldbrook all-hands" */
  title?: string;
  /** A short line under the title. @default "Q4 roadmap" */
  subtitle?: string;
  /** How many people are watching, shown in the header. @default 1284 */
  viewers?: number;
  /** The connection: anything but live marks the gap and holds sending. @default "live" */
  connection?: LiveChatterConnection;
  /** Controlled explicit pause (Space). Hover, focus and reading still hold on top of it. */
  paused?: boolean;
  /** Initial explicit pause when uncontrolled. @default false */
  defaultPaused?: boolean;
  /** Fires when the stream starts or stops holding still, with what caused it. */
  onPause?: (paused: boolean, reason: LiveChatterPauseReason) => void;
  /** A message was sent from the composer. Append it to `messages` to show it. */
  onSend?: (text: string) => void;
  /** A message was reported; it is already hidden for this viewer. */
  onReport?: (message: LiveChatterMessage) => void;
  /** Seconds between messages from one viewer; 0 is off. @default 0 */
  slowMode?: number;
  /** The viewer can read but not send. @default false */
  muted?: boolean;
  /** When the mute lifts, in ms since the epoch. */
  mutedUntil?: number;
  /** Why the viewer is muted, shown under the notice. */
  mutedReason?: string;
  /** The viewer's name: messages that mention their first name get a wash. @default "Mara Quinn" */
  viewerName?: string;
  /** The moment "now" is, in ms since the epoch (never read from the clock). @default defaultLiveChatterNow */
  now?: number;
  /** How briskly the log follows new messages: 0.5 drifts, 2 ticks. @default 1 */
  scrollSpeed?: number;
  /** Row size: one tight line, a dotted line, or an avatar over two lines. @default "regular" */
  density?: LiveChatterDensity;
  /** Pill, Send, Host badge, mention wash and the newest-row edge — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Rows kept in the DOM while live; a hold keeps up to three times as many. @default 80 */
  maxRows?: number;
  /** Characters a message may hold. @default 200 */
  maxLength?: number;
  /** How a time is printed. @default UTC HH:MM */
  formatTime?: (ms: number) => string;
  /** Whether the chat has loaded. @default "ready" */
  status?: LiveChatterStatus;
  /** "Try again" was pressed after the chat failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the log scrolls inside it. @default 540 */
  height?: number;
  /** Read only: no composer and no reporting. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const T0 = Date.UTC(2026, 9, 15, 17, 0, 0);
const at = (seconds: number) => T0 + seconds * 1000;

/** Two minutes into the broadcast, so every default renders the same everywhere. */
export const defaultLiveChatterNow = at(120);

export const defaultLiveChatterMessages: LiveChatterMessage[] = [
  {
    id: "m1",
    author: "Ines Marlow",
    badges: ["host"],
    text: "Welcome in, everyone. We start in two minutes.",
    at: at(0),
  },
  {
    id: "m2",
    author: "Tomas Brandt",
    text: "Morning from the Basin office",
    at: at(6),
  },
  { id: "m3", author: "Priya Raman", text: "Audio is clear here", at: at(11) },
  {
    id: "m4",
    author: "Kenji Ito",
    badges: ["mod"],
    text: "Questions for the panel go in the Q&A tab. Chat is for chatter.",
    at: at(17),
  },
  {
    id: "m5",
    author: "Lena Okafor",
    text: "hi from the night shift",
    at: at(23),
  },
  {
    id: "m6",
    author: "Dario Silva",
    text: "Is this being recorded?",
    at: at(30),
  },
  {
    id: "m7",
    author: "Kenji Ito",
    badges: ["mod"],
    text: "Yes, the recording goes up tomorrow.",
    at: at(36),
  },
  {
    id: "m8",
    author: "Hana Sato",
    text: "the new office plants are thriving",
    at: at(41),
  },
  {
    id: "m9",
    author: "Ines Marlow",
    badges: ["host"],
    text: "And we're live. First up: the Q4 roadmap.",
    at: at(52),
  },
  {
    id: "m10",
    author: "Rafi Okafor",
    badges: ["speaker"],
    text: "Thanks Ines. Three things this quarter.",
    at: at(58),
  },
  { id: "m11", author: "Malia Fern", text: "here we go", at: at(61) },
  {
    id: "m12",
    author: "Joel Park",
    text: "three things, writing them down",
    at: at(64),
  },
  {
    id: "m13",
    author: "Rafi Okafor",
    badges: ["speaker"],
    text: "One: offline mode ships to everyone in November.",
    at: at(75),
  },
  { id: "m14", author: "Tomas Brandt", text: "finally", at: at(77) },
  {
    id: "m15",
    author: "Sana Idris",
    badges: ["staff"],
    text: "Offline beta notes are pinned in #roadmap",
    at: at(82),
  },
  { id: "m16", author: "Dario Silva", text: "@Mara you called it", at: at(90) },
  {
    id: "m17",
    author: "Lena Okafor",
    text: "does that include the tablet app",
    at: at(96),
  },
  {
    id: "m18",
    author: "Kenji Ito",
    badges: ["mod"],
    text: "Lena, drop it in Q&A so the panel sees it",
    at: at(101),
  },
  {
    id: "m19",
    author: "Rafi Okafor",
    badges: ["speaker"],
    text: "Two: shared boards get comments.",
    at: at(112),
  },
  {
    id: "m20",
    author: "Hana Sato",
    text: "comments on boards, yes please",
    at: at(115),
  },
  { id: "m21", author: "Joel Park", text: "two of three", at: at(118) },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  LiveChatterDensity,
  { row: string; text: string; avatar: boolean; dot: boolean }
> = {
  compact: {
    row: "px-3 py-0.5",
    text: "text-[12px] leading-[18px]",
    avatar: false,
    dot: false,
  },
  regular: {
    row: "px-3 py-1",
    text: "text-[13px] leading-5",
    avatar: false,
    dot: true,
  },
  roomy: {
    row: "px-3 py-1.5",
    text: "text-[13px] leading-5",
    avatar: true,
    dot: false,
  },
};

const BADGE_WORD: Record<LiveChatterBadge, string> = {
  host: "Host",
  mod: "Moderator",
  speaker: "Speaker",
  staff: "Staff",
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** FNV-1a, unsigned, so a name always lands on the same hue. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

/**
 * A name's colour: its hue at a fixed lightness, pulled toward the theme's
 * ink so it reads on a light card and a dark one alike.
 */
const nameColor = (name: string) =>
  `color-mix(in oklab, oklch(0.63 0.15 ${hash(name) % 360}) 74%, var(--foreground))`;
const nameWash = (name: string) =>
  `color-mix(in oklab, oklch(0.7 0.12 ${hash(name) % 360}) 26%, var(--card))`;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const utcClock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
    d.getUTCMinutes(),
  ).padStart(2, "0")}`;
};

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** Thousands grouped by hand: a locale lookup could differ between server and browser. */
const grouped = (n: number) =>
  String(Math.max(0, Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Ends a sentence once, whatever the quoted words already carry. */
const sentence = (text: string) => {
  const t = text.trim();
  return /[.!?”"]$/.test(t) ? t : `${t}.`;
};

const span = (from: number, to: number) => {
  const s = Math.max(0, Math.round((to - from) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

/** The fast-forward: glide's damping ratio on a stiffer spring. */
const FAST_SPRING = {
  type: "spring" as const,
  stiffness: 420,
  damping: Math.round(2 * 0.98 * Math.sqrt(420) * 100) / 100,
  mass: 1,
  restDelta: 0.5,
  restSpeed: 4,
};

type HoldFlags = {
  hover: boolean;
  focus: boolean;
  scroll: boolean;
  key: boolean;
};

/** Where a row starts, in the scroller's content coordinates. */
const rowTop = (list: HTMLElement | null, node: HTMLElement) =>
  (list?.offsetTop ?? 0) + node.offsetTop;

const sameFlags = (a: HoldFlags, b: HoldFlags) =>
  a.hover === b.hover &&
  a.focus === b.focus &&
  a.scroll === b.scroll &&
  a.key === b.key;

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

/** Digits that roll into place, each place its own column, so 9 → 10 reads. */
function RollingCount({
  value,
  motionSafe,
}: {
  value: number;
  motionSafe: boolean;
}) {
  const digits = String(Math.max(0, value)).split("");
  return (
    <span
      aria-hidden
      className="inline-flex tabular-nums"
      style={{ height: 16, lineHeight: "16px" }}
    >
      {digits.map((digit, i) => (
        <span
          key={digits.length - 1 - i}
          className="relative inline-block overflow-hidden text-center"
          style={{ width: "1ch", height: 16 }}
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={digit}
              className="absolute inset-0"
              initial={motionSafe ? { y: "100%", opacity: 0 } : { opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={
                motionSafe
                  ? {
                      y: "-100%",
                      opacity: 0,
                      transition: exitFor(durations.fast),
                    }
                  : { opacity: 0, transition: { duration: durations.blink } }
              }
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
            >
              {digit}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/** A torn paper edge: where the stream broke. */
function TornEdge({ id }: { id: string }) {
  return (
    <svg aria-hidden className="block h-2 w-full text-hairline-strong">
      <defs>
        <pattern id={id} width="10" height="8" patternUnits="userSpaceOnUse">
          <path
            d="M0 6 L5 2 L10 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
          />
        </pattern>
      </defs>
      <rect width="100%" height="8" fill={`url(#${id})`} />
    </svg>
  );
}

function BadgeMark({ badge }: { badge: LiveChatterBadge }) {
  const word = BADGE_WORD[badge];
  if (badge === "host") {
    return (
      <span className="mr-1 inline-flex h-4 translate-y-[-1px] items-center rounded-1 bg-[var(--lc-button)] px-1 align-middle font-mono text-[9px] font-semibold tracking-[0.06em] text-white uppercase">
        Host
      </span>
    );
  }
  const Icon =
    badge === "mod" ? Shield : badge === "speaker" ? Mic : BadgeCheck;
  return (
    <span
      title={word}
      className={cn(
        "mr-1 inline-flex size-4 translate-y-[-1px] items-center justify-center rounded-1 align-middle",
        badge === "mod" &&
          "bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success",
        badge === "speaker" &&
          "bg-[color-mix(in_oklab,var(--warn)_18%,transparent)] text-warn",
        badge === "staff" &&
          "bg-[color-mix(in_oklab,var(--lc-accent)_16%,transparent)] text-[var(--lc-ink)]",
      )}
    >
      <Icon aria-hidden className="size-2.5" strokeWidth={2.4} />
      <span className="sr-only">{word}</span>
    </span>
  );
}

type RowProps = {
  message: LiveChatterMessage;
  density: LiveChatterDensity;
  tabbable: boolean;
  isNew: boolean;
  mention: boolean;
  reported: boolean;
  confirming: boolean;
  flashKey: number;
  motionSafe: boolean;
  canReport: boolean;
  time: string;
  uid: string;
  register: (id: string, node: HTMLLIElement | null) => void;
  onConfirmNode: (node: HTMLButtonElement | null) => void;
};

/**
 * One row. Pure in its props and memoised, so a burst of arrivals renders
 * only the new rows; every action is read by delegation on the list.
 */
const Row = React.memo(function Row({
  message,
  density,
  tabbable,
  isNew,
  mention,
  reported,
  confirming,
  flashKey,
  motionSafe,
  canReport,
  time,
  uid,
  register,
  onConfirmNode,
}: RowProps) {
  const d = DENSITY[density];
  const ref = React.useCallback(
    (node: HTMLLIElement | null) => register(message.id, node),
    [message.id, register],
  );
  const badges = message.badges ?? [];
  const label = reported
    ? `Message from ${message.author}, reported and hidden`
    : `${message.author}${badges.length ? `, ${badges.map((b) => BADGE_WORD[b]).join(", ")}` : ""}: ${sentence(message.text)} ${time}`;

  return (
    <li
      ref={ref}
      data-lc-row={message.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      className={cn(
        "group/live-chatter-row relative rounded-2",
        FOCUS_IN,
        d.row,
      )}
    >
      <motion.div
        initial={
          isNew
            ? motionSafe
              ? { opacity: 0, y: distances.nudge }
              : { opacity: 0 }
            : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: motionSafe ? durations.base : durations.fast,
          ease: easings.enter,
        }}
      >
        {mention && !reported ? (
          <span
            aria-hidden
            className="absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--lc-accent)_11%,transparent)]"
          />
        ) : null}
        {flashKey > 0 ? (
          <React.Fragment key={flashKey}>
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-2 bg-[color-mix(in_oklab,var(--lc-accent)_16%,transparent)]"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: easings.exit, delay: 0.25 }}
            />
            <motion.span
              aria-hidden
              className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[var(--lc-accent)]"
              style={{ originY: 0.5 }}
              initial={motionSafe ? { scaleY: 0, opacity: 1 } : { opacity: 1 }}
              animate={{ scaleY: 1, opacity: 0 }}
              transition={{
                scaleY: motionSafe ? springs.flick : { duration: 0 },
                opacity: { duration: 0.6, delay: 0.7, ease: easings.exit },
              }}
            />
          </React.Fragment>
        ) : null}

        {reported ? (
          <p className="relative text-[12px] leading-5 text-ink-3 italic">
            Message from {message.author} reported · hidden for you
          </p>
        ) : d.avatar ? (
          <div className="relative flex gap-2">
            <span
              aria-hidden
              className="mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full font-mono text-[9px] font-semibold"
              style={{
                backgroundColor: nameWash(message.author),
                color: nameColor(message.author),
              }}
            >
              {initials(message.author)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-1 text-[12px] leading-[18px]">
                <span
                  className="font-semibold"
                  style={{ color: nameColor(message.author) }}
                >
                  {message.author}
                </span>
                {badges.map((b) => (
                  <BadgeMark key={b} badge={b} />
                ))}
                <span className="font-mono text-[10px] text-ink-3 tabular-nums">
                  {time}
                </span>
              </p>
              <p
                className={cn(
                  d.text,
                  "[overflow-wrap:anywhere] text-foreground",
                )}
              >
                {message.text}
              </p>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              d.text,
              "relative pr-5 [overflow-wrap:anywhere] text-foreground",
            )}
          >
            {d.dot ? (
              <span
                aria-hidden
                className="mr-1.5 inline-block size-1.5 translate-y-[-2px] rounded-full align-middle"
                style={{ backgroundColor: nameColor(message.author) }}
              />
            ) : null}
            {badges.map((b) => (
              <BadgeMark key={b} badge={b} />
            ))}
            <span
              className="mr-1.5 font-semibold"
              style={{ color: nameColor(message.author) }}
            >
              {message.author}
            </span>
            <span className="sr-only">: </span>
            {message.text}
            <span className="sr-only">, {time}</span>
          </p>
        )}

        {canReport && !reported ? (
          <button
            type="button"
            data-lc-act="report"
            tabIndex={tabbable ? 0 : -1}
            aria-label={`Report the message from ${message.author}`}
            className={cn(
              "absolute top-0.5 right-1 inline-flex size-6 items-center justify-center rounded-2 border border-hairline bg-card text-ink-3 opacity-0 transition-opacity hover:text-danger",
              "group-focus-within/live-chatter-row:opacity-100 group-hover/live-chatter-row:opacity-100 focus-visible:opacity-100",
              confirming && "opacity-100",
              FOCUS_RING,
            )}
          >
            <Flag aria-hidden className="size-3" />
          </button>
        ) : null}

        {confirming && !reported ? (
          <div
            role="group"
            aria-labelledby={`${uid}-confirm-${message.id}`}
            className="relative mt-1.5 flex flex-wrap items-center gap-2 rounded-2 border border-hairline bg-surface-2 px-2.5 py-2"
          >
            <span
              id={`${uid}-confirm-${message.id}`}
              className="mr-auto text-[12px] text-ink-2"
            >
              Report to the moderators?
            </span>
            <button
              ref={onConfirmNode}
              type="button"
              data-lc-act="confirm"
              className={cn(
                "inline-flex h-7 items-center rounded-2 bg-[oklch(from_var(--danger)_0.56_c_h)] px-2.5 text-[12px] font-medium text-white",
                FOCUS_RING,
              )}
            >
              Report
            </button>
            <button
              type="button"
              data-lc-act="cancel"
              className={cn(
                "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 hover:bg-surface-1",
                FOCUS_RING,
              )}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </motion.div>
    </li>
  );
});

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * A live event chat that holds still while you read. While nothing holds it,
 * the log's scroll position chases the newest row on a spring derived from
 * `springs.glide` (stiffness × `scrollSpeed`², damping × `scrollSpeed`, so the
 * damping ratio stays at glide's), and a retarget keeps the velocity it has —
 * a burst of arrivals is one continuous climb. Hovering the log, focusing a
 * row, pressing Space or scrolling up yourself holds it exactly where it is;
 * rows keep landing below, and a pill rises on `springs.snap` counting the ones
 * under the fold. Choosing the pill (or End) fast-forwards: a stiff glide to
 * the newest row under a short vertical blur that peaks and clears, and the
 * newest row's edge draws on `springs.flick` as it lands.
 *
 * Scroll writes come from one motion value, so the reader's own scrolling is
 * told apart from the follow's by comparing against the last written position,
 * and rows trimmed from the top are compensated through an anchor row, so the
 * view never jumps. Nothing runs at rest.
 */
export function LiveChatter({
  messages = defaultLiveChatterMessages,
  title = "Coldbrook all-hands",
  subtitle = "Q4 roadmap",
  viewers = 1284,
  connection = "live",
  paused,
  defaultPaused = false,
  onPause,
  onSend,
  onReport,
  slowMode = 0,
  muted = false,
  mutedUntil,
  mutedReason,
  viewerName = "Mara Quinn",
  now = defaultLiveChatterNow,
  scrollSpeed = 1,
  density = "regular",
  accent = "var(--accent-bright)",
  maxRows = 80,
  maxLength = 200,
  formatTime = utcClock,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: LiveChatterProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeId = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const inputId = `${uid}-input`;
  const metaId = `${uid}-meta`;

  /* ------------------------------ hold state ----------------------------- */

  const [flags, setFlags] = React.useState<HoldFlags>(() => ({
    hover: false,
    focus: false,
    scroll: false,
    key: defaultPaused,
  }));
  const flagsRef = React.useRef(flags);
  const keyHeld = paused ?? flags.key;
  const held = keyHeld || flags.hover || flags.focus || flags.scroll;

  const [frozenFrom, setFrozenFrom] = React.useState<string | null>(null);
  const [lastSeenId, setLastSeenId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [reported, setReported] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [flash, setFlash] = React.useState<{ id: string; n: number }>({
    id: "",
    n: 0,
  });
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [initialIds] = React.useState(() => new Set(messages.map((m) => m.id)));

  const say = React.useCallback((text: string) => {
    setSaid((s) => ({ n: s.n + 1, text }));
  }, []);

  /* ------------------------------ the window ----------------------------- */

  const total = messages.length;
  const liveStart = Math.max(0, total - Math.max(10, maxRows));
  let start = liveStart;
  if (held && frozenFrom) {
    const index = messages.findIndex((m) => m.id === frozenFrom);
    if (index >= 0) {
      start = Math.max(
        Math.min(index, liveStart),
        total - Math.max(10, maxRows) * 3,
        0,
      );
    }
  }
  const rows = messages.slice(start);
  const lastRow = rows[rows.length - 1];
  const rowsKey = `${rows[0]?.id ?? ""}|${lastRow?.id ?? ""}|${rows.length}`;

  const tabStop =
    activeId && rows.some((m) => m.id === activeId) ? activeId : lastRow?.id;

  const below = React.useMemo(() => {
    if (!held || !lastSeenId) return 0;
    const index = messages.findIndex((m) => m.id === lastSeenId);
    if (index < 0) return 0;
    let n = 0;
    for (let i = index + 1; i < messages.length; i += 1) {
      if ((messages[i]?.kind ?? "message") === "message") n += 1;
    }
    return n;
  }, [held, lastSeenId, messages]);

  /* ---------------------------- scroll engine ---------------------------- */

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const listRef = React.useRef<HTMLOListElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLLIElement>());
  const scrollY = useMotionValue(0);
  const blur = useMotionValue(0);
  const listFilter = useTransform(blur, (b) =>
    b > 0.05 ? `blur(${r2(b)}px)` : "none",
  );
  const lastWritten = React.useRef(0);
  const scrollPos = React.useRef(0);
  const anchor = React.useRef<{ id: string; top: number } | null>(null);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const blurRun = React.useRef<AnimationPlaybackControls | null>(null);
  const fastRun = React.useRef(false);
  const pendingFlash = React.useRef(false);
  const suppressHover = React.useRef(false);
  const seenRaf = React.useRef(0);
  const newestRef = React.useRef<string | null>(null);
  const placed = React.useRef(false);
  const [confirmNode, setConfirmNode] =
    React.useState<HTMLButtonElement | null>(null);

  const register = React.useCallback(
    (id: string, node: HTMLLIElement | null) => {
      if (node) rowRefs.current.set(id, node);
      else rowRefs.current.delete(id);
    },
    [],
  );

  const writeScroll = React.useCallback((v: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = v;
    lastWritten.current = el.scrollTop;
    scrollPos.current = el.scrollTop;
  }, []);

  // A layout effect, and declared before the one that places the log: the
  // first jump to the newest row must already reach the scroller.
  React.useLayoutEffect(
    () => scrollY.on("change", writeScroll),
    [scrollY, writeScroll],
  );

  React.useEffect(
    () => () => {
      run.current?.stop();
      blurRun.current?.stop();
      cancelAnimationFrame(seenRaf.current);
    },
    [],
  );

  const measureLastSeen = React.useCallback((): string | null => {
    const el = scrollerRef.current;
    if (!el) return null;
    const bottom = scrollPos.current + el.clientHeight - 8;
    const list = listRef.current;
    const offset = list?.offsetTop ?? 0;
    let found: string | null = null;
    for (const [id, node] of rowRefs.current) {
      const top = offset + node.offsetTop;
      if (top < bottom) {
        if (!found) found = id;
        else {
          const prev = rowRefs.current.get(found);
          if (prev && offset + prev.offsetTop < top) found = id;
        }
      }
    }
    return found;
  }, []);

  const followSpring = React.useMemo(() => {
    const k = clamp(scrollSpeed, 0.25, 4);
    return {
      type: "spring" as const,
      stiffness: springs.glide.stiffness * k * k,
      damping: springs.glide.damping * k,
      mass: springs.glide.mass,
      restDelta: 0.5,
      restSpeed: 4,
    };
  }, [scrollSpeed]);

  const land = React.useCallback(() => {
    fastRun.current = false;
    if (!pendingFlash.current) return;
    pendingFlash.current = false;
    const id = newestRef.current;
    if (id) {
      setFlash((f) => ({ id, n: f.n + 1 }));
      setLastSeenId((seen) => (seen ? id : seen));
    }
  }, []);

  /**
   * Runs the scroll to the bottom: a follow glide, or the fast-forward.
   * `carry` is the velocity a run interrupted by a trim was moving at, so a
   * retarget never stalls the climb.
   */
  const runToBottom = React.useCallback(
    (mode: "follow" | "fast", carry?: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      const target = Math.max(0, el.scrollHeight - el.clientHeight);
      const from = scrollPos.current;
      const distance = target - from;
      if (Math.abs(distance) < 0.5) {
        if (mode === "fast" || fastRun.current) land();
        return;
      }
      if (!motionSafe) {
        run.current?.stop();
        scrollY.jump(target);
        land();
        return;
      }
      const fast =
        mode === "fast" || fastRun.current || distance > el.clientHeight * 1.5;
      const velocity =
        carry ?? (scrollY.isAnimating() ? scrollY.getVelocity() : 0);
      if (Math.abs(scrollY.get() - from) > 1) scrollY.jump(from);
      run.current?.stop();
      if (fast && !fastRun.current) {
        fastRun.current = true;
        pendingFlash.current = true;
        // The blur says "skipping": it peaks early and clears before the
        // landing, so the newest row is sharp when it arrives.
        const peak = r2(clamp(distance / 180, 1, 5));
        const duration = r2(clamp(0.3 + distance / 5000, 0.32, 0.6));
        blurRun.current?.stop();
        blurRun.current = animate(blur, [0, peak, 0], {
          duration,
          times: [0, 0.35, 1],
          ease: easings.move,
        });
      }
      run.current = animate(
        scrollY,
        target,
        fast
          ? { ...FAST_SPRING, velocity, onComplete: land }
          : { ...followSpring, velocity, onComplete: land },
      );
    },
    [blur, followSpring, land, motionSafe, scrollY],
  );

  // After every commit that changed the rows (or the hold): keep the view
  // pinned through trimming, then follow if nothing holds the stream. The
  // first placement jumps: a chat opens at its newest message, not with a
  // fast-forward.
  React.useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) {
      placed.current = false;
      anchor.current = null;
      return;
    }
    const list = listRef.current;
    const carry = scrollY.isAnimating() ? scrollY.getVelocity() : undefined;
    const a = anchor.current;
    if (a) {
      const node = rowRefs.current.get(a.id);
      if (node) {
        const delta = rowTop(list, node) - a.top;
        if (Math.abs(delta) > 0.5) {
          run.current?.stop();
          scrollY.jump(scrollPos.current + delta);
        }
      }
    }
    const lastNode = lastRow ? rowRefs.current.get(lastRow.id) : undefined;
    anchor.current =
      lastRow && lastNode
        ? { id: lastRow.id, top: rowTop(list, lastNode) }
        : null;
    newestRef.current = lastRow?.id ?? null;
    if (!placed.current) {
      placed.current = true;
      scrollY.jump(Math.max(0, el.scrollHeight - el.clientHeight));
      return;
    }
    if (held && !fastRun.current) {
      run.current?.stop();
    } else if (held) {
      runToBottom("fast", carry);
    } else {
      runToBottom("follow", carry);
    }
  }, [rowsKey, held, lastRow, runToBottom, scrollY, status]);

  // A hold freezes the window and notes what the reader has seen; a release
  // lets both go. Read from layout, so it lands a frame after the change.
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (held) {
        setFrozenFrom((f) => f ?? rows[0]?.id ?? null);
        setLastSeenId((s) => s ?? measureLastSeen());
      } else {
        setFrozenFrom(null);
        setLastSeenId(null);
      }
    });
    return () => cancelAnimationFrame(raf);
    // Only the hold's edges matter here; rows change every arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, measureLastSeen]);

  // The report confirm takes focus when it arrives, not on a guessed frame.
  React.useEffect(() => {
    confirmNode?.focus({ preventScroll: true });
  }, [confirmNode]);

  /* ------------------------------ handlers ------------------------------- */

  const setHold = (
    patch: Partial<HoldFlags>,
    reason: LiveChatterPauseReason,
  ) => {
    const prev = flagsRef.current;
    const next = { ...prev, ...patch };
    if (sameFlags(prev, next)) return;
    flagsRef.current = next;
    setFlags(next);
    const was = (paused ?? prev.key) || prev.hover || prev.focus || prev.scroll;
    const is = (paused ?? next.key) || next.hover || next.focus || next.scroll;
    if (was !== is) {
      // A passing pointer is not news; everything else is said once.
      if (reason !== "hover") {
        say(is ? "Chat paused. New messages wait below." : "Chat is live.");
      }
      onPause?.(is, reason);
    }
  };

  const fastForward = (reason: LiveChatterPauseReason) => {
    suppressHover.current = true;
    pendingFlash.current = true;
    if (paused !== undefined && paused) onPause?.(false, reason);
    setHold({ hover: false, focus: false, scroll: false, key: false }, reason);
    runToBottom("fast");
    say(
      below > 0
        ? `Jumped to the latest, past ${plural(below, "message", "messages")}.`
        : "Jumped to the latest.",
    );
  };

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    scrollPos.current = top;
    if (Math.abs(top - lastWritten.current) > 2) {
      // The reader moved it: whatever was running gives way.
      run.current?.stop();
      run.current = null;
      fastRun.current = false;
      scrollY.jump(top);
      const atBottom = el.scrollHeight - el.clientHeight - top < 6;
      if (!atBottom && !flagsRef.current.scroll) {
        setHold({ scroll: true }, "scroll");
      } else if (atBottom && flagsRef.current.scroll) {
        setHold({ scroll: false }, "scroll");
      }
    }
    cancelAnimationFrame(seenRaf.current);
    seenRaf.current = requestAnimationFrame(() => {
      setLastSeenId((seen) =>
        seen === null ? seen : (measureLastSeen() ?? seen),
      );
    });
  };

  const focusRow = (id: string | undefined) => {
    if (!id) return;
    const node = rowRefs.current.get(id);
    if (!node) return;
    setActiveId(id);
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
    // Bringing the focused row into view is ours, not the reader scrolling.
    const el = scrollerRef.current;
    if (el) {
      lastWritten.current = el.scrollTop;
      scrollPos.current = el.scrollTop;
      scrollY.jump(el.scrollTop);
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const rowNode = target.closest<HTMLElement>("[data-lc-row]");
    const onRow = rowNode === target;
    const onScroller = target === scrollerRef.current;
    // From the log itself, Up lands on the newest row.
    const index = rowNode
      ? rows.findIndex((m) => m.id === rowNode.dataset.lcRow)
      : rows.length;

    if (event.key === "Escape" && confirmId) {
      event.preventDefault();
      const id = confirmId;
      setConfirmId(null);
      focusRow(id);
      return;
    }
    if (!onRow && !onScroller) return;
    const step = (delta: number) => {
      event.preventDefault();
      setHold({ focus: true }, "focus");
      const next = rows[clamp(index + delta, 0, rows.length - 1)];
      focusRow(next?.id);
    };
    switch (event.key) {
      case "ArrowUp":
        step(-1);
        break;
      case "ArrowDown":
        step(1);
        break;
      case "PageUp":
        step(-10);
        break;
      case "PageDown":
        step(10);
        break;
      case "Home":
        event.preventDefault();
        setHold({ focus: true }, "focus");
        focusRow(rows[0]?.id);
        break;
      case "End":
        event.preventDefault();
        fastForward("key");
        scrollerRef.current?.focus({ preventScroll: true });
        break;
      case " ": {
        event.preventDefault();
        const next = !keyHeld;
        if (paused === undefined) {
          if (!next) suppressHover.current = true;
          setHold(
            next
              ? { key: true }
              : { key: false, hover: false, focus: false, scroll: false },
            "key",
          );
        } else {
          onPause?.(next, "key");
        }
        break;
      }
      default:
        break;
    }
  };

  const onListClick = (event: React.MouseEvent<HTMLOListElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-lc-act]",
    );
    if (!button) return;
    const rowNode = button.closest<HTMLElement>("[data-lc-row]");
    const id = rowNode?.dataset.lcRow;
    if (!id) return;
    const act = button.dataset.lcAct;
    if (act === "report") {
      setHold({ focus: true }, "focus");
      setConfirmId((c) => (c === id ? null : id));
    } else if (act === "cancel") {
      setConfirmId(null);
      focusRow(id);
    } else if (act === "confirm") {
      const message = messages.find((m) => m.id === id);
      setConfirmId(null);
      setReported((prev) => new Set(prev).add(id));
      if (message) {
        onReport?.(message);
        say(
          `Reported the message from ${message.author}. It is hidden for you.`,
        );
      }
      focusRow(id);
    }
  };

  /* ------------------------------ composer ------------------------------- */

  const [draft, setDraft] = React.useState("");
  const [cool, setCool] = React.useState<{
    until: number;
    total: number;
    n: number;
  } | null>(null);
  const [coolLeft, setCoolLeft] = React.useState(0);
  const textRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!cool) return;
    const id = window.setInterval(() => {
      const left = Math.ceil((cool.until - performance.now()) / 1000);
      if (left <= 0) {
        setCool(null);
        setCoolLeft(0);
      } else {
        setCoolLeft(left);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [cool]);

  const live = connection === "live";
  const cooling = cool !== null && coolLeft > 0;
  const text = draft.trim();
  const canSend = live && !cooling && text.length > 0 && !muted && !disabled;

  const send = () => {
    if (!text) return;
    if (!live) {
      say("Not sent yet. Sending resumes when the chat reconnects.");
      return;
    }
    if (cooling) {
      say(`Slow mode. Wait ${plural(coolLeft, "second", "seconds")}.`);
      return;
    }
    onSend?.(text);
    setDraft("");
    if (textRef.current) textRef.current.style.height = "";
    if (slowMode > 0) {
      setCool((c) => ({
        until: performance.now() + slowMode * 1000,
        total: slowMode,
        n: (c?.n ?? 0) + 1,
      }));
      setCoolLeft(Math.ceil(slowMode));
    }
    // Your own message is worth seeing land.
    suppressHover.current = true;
    setHold({ hover: false, scroll: false, key: false }, "send");
    say("Sent.");
  };

  /* -------------------------------- render ------------------------------- */

  const pillLabel =
    below > 0
      ? `${plural(below, "new message", "new messages")} below. Jump to the latest`
      : "Chat paused. Jump to the latest and go live";

  const chip =
    connection !== "live"
      ? {
          key: connection,
          label: connection === "offline" ? "Offline" : "Reconnecting",
          tone: "text-warn",
        }
      : held
        ? { key: "paused", label: "Paused", tone: "text-ink-2" }
        : { key: "live", label: "Live", tone: "text-danger" };

  const metaLine = muted
    ? null
    : !live
      ? connection === "offline"
        ? "You're offline. Messages send when you're back."
        : "Reconnecting. Your message waits until it's back."
      : cooling
        ? `Slow mode · you can send again in ${coolLeft} s`
        : draft.length > maxLength * 0.8
          ? `${draft.length} / ${maxLength}`
          : slowMode > 0
            ? `Slow mode · one message every ${slowMode} s`
            : null;

  const firstName = viewerName.split(/\s+/)[0]?.toLowerCase() ?? "";
  const mentions = (m: LiveChatterMessage) =>
    firstName.length > 1 && m.text.toLowerCase().includes(`@${firstName}`);

  const log = (
    <div
      className="relative flex-1"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || suppressHover.current) return;
        setHold({ hover: true }, "hover");
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        suppressHover.current = false;
        setHold({ hover: false }, "hover");
      }}
    >
      <div
        ref={scrollerRef}
        role="log"
        aria-live="off"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        tabIndex={-1}
        onScroll={onScroll}
        onKeyDown={onListKeyDown}
        onFocus={(event) => {
          const target = event.target as HTMLElement;
          const rowNode = target.closest<HTMLElement>("[data-lc-row]");
          if (!rowNode) return;
          if (rowNode.dataset.lcRow) setActiveId(rowNode.dataset.lcRow);
          // Keyboard focus is reading; a tap that focuses a row is not.
          if (target.matches(":focus-visible")) {
            setHold({ focus: true }, "focus");
          }
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && scrollerRef.current?.contains(next)) {
            if (next === scrollerRef.current)
              setHold({ focus: false }, "focus");
            return;
          }
          setConfirmId(null);
          setHold({ focus: false }, "focus");
        }}
        className={cn(
          "absolute inset-0 [scrollbar-width:thin] overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none]",
          "[mask-image:linear-gradient(to_bottom,transparent,black_14px,black_calc(100%-16px),transparent)]",
          FOCUS_IN,
        )}
      >
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center-safe justify-center-safe gap-1 px-6 text-center">
            <p className="text-sm text-foreground">No messages yet.</p>
            <p className="text-[12px] text-ink-3">Say hello to the room.</p>
          </div>
        ) : (
          <motion.ol
            ref={listRef}
            role="list"
            onClick={onListClick}
            style={{ filter: listFilter }}
            className="flex flex-col gap-px px-1 pt-3 pb-5"
          >
            {rows.map((m) =>
              (m.kind ?? "message") === "gap" ? (
                <li
                  key={m.id}
                  ref={(node) => register(m.id, node)}
                  data-lc-row={m.id}
                  tabIndex={m.id === tabStop ? 0 : -1}
                  aria-label={`Connection dropped: missed ${plural(m.missed ?? 0, "message", "messages")} over ${span(m.at, m.until ?? m.at)}.`}
                  className={cn(
                    "my-1.5 flex flex-col gap-1 rounded-2 px-2 py-1",
                    FOCUS_IN,
                  )}
                >
                  <TornEdge id={`${safeId}-tear-${m.id}`} />
                  <p className="flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-3 uppercase">
                    <WifiOff aria-hidden className="size-3 shrink-0" />
                    Missed {plural(m.missed ?? 0, "message", "messages")} ·{" "}
                    {span(m.at, m.until ?? m.at)}
                  </p>
                  <TornEdge id={`${safeId}-tear2-${m.id}`} />
                </li>
              ) : (
                <Row
                  key={m.id}
                  message={m}
                  density={density}
                  tabbable={m.id === tabStop}
                  isNew={!initialIds.has(m.id)}
                  mention={mentions(m)}
                  reported={reported.has(m.id)}
                  confirming={confirmId === m.id}
                  flashKey={flash.id === m.id ? flash.n : 0}
                  motionSafe={motionSafe}
                  canReport={!disabled}
                  time={formatTime(m.at)}
                  uid={uid}
                  register={register}
                  onConfirmNode={setConfirmNode}
                />
              ),
            )}
            {!live ? (
              <li
                aria-label={`Connection lost at ${formatTime(now)}. ${connection === "offline" ? "Offline." : "Reconnecting."}`}
                className="mt-2 flex flex-col gap-1 px-2"
              >
                <TornEdge id={`${safeId}-tail`} />
                <p className="flex items-center justify-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-warn uppercase">
                  <WifiOff aria-hidden className="size-3 shrink-0" />
                  Connection lost · {formatTime(now)}
                </p>
              </li>
            ) : null}
          </motion.ol>
        )}
      </div>

      {/* The pill sits on the seam between the log and the composer, so it
          never covers the newest row it is counting from. */}
      <div className="pointer-events-none absolute inset-x-0 -bottom-3.5 z-10 flex justify-center px-3">
        <AnimatePresence>
          {held && rows.length > 0 ? (
            <motion.button
              key="pill"
              type="button"
              onClick={() => fastForward("pill")}
              aria-label={pillLabel}
              initial={
                motionSafe
                  ? { opacity: 0, y: distances.step, scale: 0.96 }
                  : { opacity: 0 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={
                motionSafe
                  ? {
                      opacity: 0,
                      y: distances.nudge,
                      scale: 0.92,
                      transition: exitFor(durations.fast),
                    }
                  : { opacity: 0, transition: { duration: durations.fast } }
              }
              transition={
                motionSafe ? springs.snap : { duration: durations.fast }
              }
              className={cn(
                "pointer-events-auto inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium shadow-md",
                below > 0
                  ? "border-transparent bg-[var(--lc-button)] text-white"
                  : "border-hairline-strong bg-popover text-foreground",
                FOCUS_RING,
              )}
            >
              {below > 0 ? (
                <>
                  <ArrowDown aria-hidden className="size-3.5 shrink-0" />
                  <RollingCount value={below} motionSafe={motionSafe} />
                  <span aria-hidden>new</span>
                </>
              ) : (
                <>
                  <Pause aria-hidden className="size-3.5 shrink-0" />
                  <span aria-hidden>Paused</span>
                </>
              )}
            </motion.button>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );

  const composer = disabled ? (
    <p className="shrink-0 border-t border-hairline px-3 pt-4 pb-3 text-center text-[12px] text-ink-3">
      Chat is read only.
    </p>
  ) : muted ? (
    <div
      role="note"
      className="flex shrink-0 items-start gap-2.5 border-t border-hairline px-3 pt-4 pb-3"
    >
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2"
      >
        <Lock className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[13px] text-foreground">
          {mutedUntil
            ? `You're muted until ${formatTime(mutedUntil)}.`
            : "You're muted in this chat."}
        </p>
        <p className="text-[11px] text-ink-3">
          {mutedReason ?? "You can still read along."}
        </p>
      </div>
    </div>
  ) : (
    <form
      className="shrink-0 border-t border-hairline px-2.5 pt-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-3 border border-hairline bg-surface-2 py-1 pr-1 pl-3 transition-colors",
          "has-[textarea:focus-visible]:border-[color-mix(in_oklab,var(--lc-accent)_45%,transparent)] has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-ring has-[textarea:focus-visible]:outline-solid",
        )}
      >
        <label htmlFor={inputId} className="sr-only">
          Send a message to {title}
        </label>
        <textarea
          ref={textRef}
          id={inputId}
          rows={1}
          value={draft}
          maxLength={maxLength}
          aria-describedby={metaLine ? metaId : undefined}
          placeholder={
            slowMode > 0 ? `Slow mode · every ${slowMode} s` : "Send a message"
          }
          onChange={(event) => {
            const node = event.currentTarget;
            const value = node.value;
            setDraft(value);
            node.style.height = "auto";
            node.style.height = `${Math.min(node.scrollHeight, 76)}px`;
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          className="max-h-[76px] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-ink-3"
        />
        <button
          type="submit"
          aria-disabled={!canSend}
          aria-label={
            cooling
              ? `Send, available in ${plural(coolLeft, "second", "seconds")}`
              : "Send"
          }
          className={cn(
            "relative inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
            canSend
              ? "bg-[var(--lc-button)] text-white"
              : "bg-transparent text-ink-3",
            FOCUS_RING,
          )}
        >
          {cooling && cool ? (
            <>
              <svg
                aria-hidden
                viewBox="0 0 32 32"
                className="absolute inset-0 size-8 -rotate-90"
              >
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  fill="none"
                  strokeWidth="2"
                  className="stroke-hairline-strong"
                />
                <motion.circle
                  key={cool.n}
                  cx="16"
                  cy="16"
                  r="13"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  stroke="var(--lc-accent)"
                  initial={{ pathLength: 1 }}
                  animate={{ pathLength: 0 }}
                  transition={{ duration: cool.total, ease: "linear" }}
                />
              </svg>
              <span aria-hidden className="font-mono text-[11px] tabular-nums">
                {coolLeft}
              </span>
            </>
          ) : (
            <Send aria-hidden className="size-3.5" />
          )}
        </button>
      </div>
      {metaLine ? (
        <p
          id={metaId}
          className={cn(
            "mt-1.5 flex items-center gap-1.5 px-1 text-[11px]",
            !live ? "text-warn" : "text-ink-3",
          )}
        >
          {!live ? (
            <WifiOff aria-hidden className="size-3 shrink-0" />
          ) : cooling || slowMode > 0 ? (
            <Timer aria-hidden className="size-3 shrink-0" />
          ) : null}
          <span className="truncate">{metaLine}</span>
        </p>
      ) : null}
    </form>
  );

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      className={cn(
        "@container/live-chatter flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{
        height,
        ["--lc-accent" as string]: `oklch(from ${accent} 0.62 c h)`,
        ["--lc-button" as string]: `oklch(from ${accent} 0.54 c h)`,
        ["--lc-ink" as string]:
          "color-mix(in oklab, var(--lc-accent) 72%, var(--foreground))",
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-hairline px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-32">
          <p
            id={titleId}
            title={title}
            className="truncate text-sm font-semibold"
          >
            {title}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {subtitle} · {grouped(viewers)} watching
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {slowMode > 0 ? (
            <span
              title={`Slow mode: one message every ${slowMode} seconds`}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-hairline px-2 font-mono text-[10px] text-ink-2 tabular-nums"
            >
              <Timer aria-hidden className="size-3" />
              {slowMode}s
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 font-mono text-[10px] font-medium tracking-[0.08em] uppercase transition-colors",
              chip.tone,
            )}
          >
            {chip.key === "live" ? (
              <span
                aria-hidden
                className="size-1.5 rounded-full bg-[oklch(from_var(--danger)_0.62_c_h)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--danger)_18%,transparent)]"
              />
            ) : chip.key === "paused" ? (
              <Pause aria-hidden className="size-3" />
            ) : (
              <WifiOff aria-hidden className="size-3" />
            )}
            {chip.label}
          </span>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Up and Down move between messages and hold the chat still. Space pauses
        and resumes. End jumps to the latest message and goes live.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">The chat didn&apos;t load.</p>
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
          className="flex flex-1 flex-col gap-2.5 overflow-hidden px-4 pt-4"
        >
          {[62, 84, 48, 76, 58, 90, 40].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  "h-2.5 w-14 shrink-0 rounded-full bg-surface-2",
                  motionSafe && "animate-pulse",
                )}
              />
              <span
                className={cn(
                  "h-2.5 rounded-full bg-surface-2",
                  motionSafe && "animate-pulse",
                )}
                style={{ width: `${w}%` }}
              />
            </div>
          ))}
        </div>
      ) : (
        log
      )}

      {status === "ready" ? composer : null}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
