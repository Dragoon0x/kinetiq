"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  BellOff,
  Check,
  ChevronLeft,
  Eye,
  Hash,
  Heart,
  Laugh,
  MessageSquareText,
  Pin,
  RotateCcw,
  SendHorizontal,
  SmilePlus,
  Sparkles,
  ThumbsUp,
  X,
  type LucideIcon,
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
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";
import { FollowKnot } from "@/registry/ui/follow-knot";
import { MuteCone } from "@/registry/ui/mute-cone";
import { PinPress } from "@/registry/ui/pin-press";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type TeamChatThread = "dock" | "overlay" | "full";
export type TeamChatPresence = "dot" | "ring" | "off";
export type TeamChatDensity = "compact" | "cozy" | "roomy";
export type TeamChatStatus = "ready" | "loading" | "error";
export type ChatPresence = "active" | "away" | "busy" | "offline";
export type ChatReactionKind =
  "ack" | "done" | "heart" | "eyes" | "spark" | "laugh";

export type ChatPerson = {
  id: string;
  name: string;
  /** What they do, under their name in a direct message. */
  role?: string;
  presence: ChatPresence;
  /** A few words they set themselves: "On site · Basin Road". */
  status?: string;
};

export type ChatChannel = {
  id: string;
  /** A channel's name without the #; a direct message's is its person's. */
  name: string;
  kind: "channel" | "direct";
  /** One line under the name in the header. */
  topic?: string;
  /** Person ids. A direct message holds the viewer and one other. */
  members: string[];
  /** Messages not yet read. Opening the channel clears it. */
  unread?: number;
  /** Of those, how many mention the viewer. */
  mentions?: number;
  /** Notifications are off for it. */
  muted?: boolean;
};

export type ChatReaction = {
  kind: ChatReactionKind;
  /** Person ids, in the order they reacted. */
  people: string[];
};

export type ChatMessage = {
  id: string;
  channel: string;
  /** A person id. */
  author: string;
  /** When it was sent, ms since the epoch. */
  at: number;
  /** Plain text. `@Name` is washed as a mention and `code` is set in mono. */
  text: string;
  /** The message this one replies to in a thread. */
  parent?: string;
  reactions?: ChatReaction[];
  pinned?: boolean;
};

export type TeamChatProps = {
  /** How the thread panel arrives on wide screens: docked beside the stream (which narrows), over it above a scrim, or pushed like a phone screen. A phone always pushes. @default "dock" */
  thread?: TeamChatThread;
  /** How presence is drawn on avatars: a corner dot, a ring, or not drawn (it is still spoken, and the header still counts who is active). @default "dot" */
  presence?: TeamChatPresence;
  /** Avatar size, type and spacing in the stream; compact sets each run's name inline with its first line. @default "cozy" */
  density?: TeamChatDensity;
  /** Everyone in the workspace. @default defaultChatPeople */
  people?: ChatPerson[];
  /** The viewer's person id: the author of what they send. @default "noor" */
  me?: string;
  /** Controlled channels and direct messages, in sidebar order. */
  channels?: ChatChannel[];
  /** Initial channels when uncontrolled. @default defaultChatChannels */
  defaultChannels?: ChatChannel[];
  /** Fires from the visit, mute or read that changed a channel, with all of them. */
  onChannelsChange?: (channels: ChatChannel[]) => void;
  /** Controlled messages, every channel and thread, as one flat list. */
  messages?: ChatMessage[];
  /** Initial messages when uncontrolled. @default defaultChatMessages */
  defaultMessages?: ChatMessage[];
  /** Fires from the send, reaction or pin that changed the list, with all of it. */
  onMessagesChange?: (messages: ChatMessage[]) => void;
  /** Controlled open channel id. */
  channel?: string;
  /** Initial channel when uncontrolled. @default "field-ops", else the first */
  defaultChannel?: string;
  onChannelChange?: (id: string) => void;
  /** Controlled open thread: its first message's id, or null. */
  openThread?: string | null;
  /** Initial thread when uncontrolled. @default null */
  defaultOpenThread?: string | null;
  onOpenThreadChange?: (id: string | null) => void;
  /** Controlled followed threads (their first messages' ids). */
  following?: string[];
  /** Initial followed threads when uncontrolled. @default [] */
  defaultFollowing?: string[];
  /** Fires from Follow, or from a reply that followed the thread. */
  onFollowingChange?: (ids: string[]) => void;
  /** Person ids writing in the open channel right now. */
  typing?: string[];
  /** The moment times are read against, and what a sent message is stamped with (Date or ms). @default defaultTeamChatNow */
  now?: Date | number;
  /** Minutes east of UTC that times are shown in, so server and browser agree. @default 0 */
  zoneOffset?: number;
  /** The workspace's name, over the channel list. @default "Fieldline" */
  workspace?: string;
  /** A message or a reply was sent. It is already in the list. */
  onSend?: (message: ChatMessage) => void;
  /** The viewer added (true) or took back (false) a reaction. */
  onReact?: (messageId: string, kind: ChatReactionKind, added: boolean) => void;
  onPinChange?: (messageId: string, pinned: boolean) => void;
  onMuteChange?: (channelId: string, muted: boolean) => void;
  /** Loading draws placeholder rows; error offers Retry. @default "ready" */
  status?: TeamChatStatus;
  onRetry?: () => void;
  /** The screen's accessible name. @default "Team chat" */
  label?: string;
  /** Play the reactions, the sends and the slides. Off unless asked for. @default false */
  sound?: boolean;
  /** Read only: nothing can be sent, reacted to or pinned. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults: Fieldline's workspace on a Friday morning                  */
/* ------------------------------------------------------------------ */

const MIN = 60_000;
const DAY = 86_400_000;

/** Friday 2 October 2026, 10:24 UTC. */
export const defaultTeamChatNow = Date.UTC(2026, 9, 2, 10, 24);

const at = (dayOffset: number, hhmm: string) => {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Date.UTC(2026, 9, 2 + dayOffset, Number(h), Number(m));
};

export const defaultChatPeople: ChatPerson[] = [
  {
    id: "noor",
    name: "Noor Halvorsen",
    role: "Operations",
    presence: "active",
  },
  {
    id: "rae",
    name: "Rae Okafor",
    role: "Field engineer",
    presence: "active",
    status: "On site · Basin Road",
  },
  { id: "lina", name: "Lina Moreau", role: "Hydrology", presence: "active" },
  { id: "tomas", name: "Tomas Ilunga", role: "Data", presence: "away" },
  {
    id: "priya",
    name: "Priya Nandakumar",
    role: "Design",
    presence: "busy",
    status: "Heads down until 12",
  },
  { id: "jun", name: "Jun Takeda", role: "Releases", presence: "offline" },
  { id: "amara", name: "Amara Osei", role: "Finance", presence: "active" },
];

export const defaultChatChannels: ChatChannel[] = [
  {
    id: "general",
    name: "general",
    kind: "channel",
    topic: "Fieldline-wide news and questions",
    members: ["noor", "rae", "lina", "tomas", "priya", "jun", "amara"],
  },
  {
    id: "field-ops",
    name: "field-ops",
    kind: "channel",
    topic: "Survey crews, gauges and the plan for the week",
    members: ["noor", "rae", "lina", "tomas", "jun"],
  },
  {
    id: "design",
    name: "design",
    kind: "channel",
    topic: "Review notes and the pricing page",
    members: ["noor", "priya", "amara", "rae"],
    unread: 3,
    mentions: 1,
  },
  {
    id: "releases",
    name: "releases",
    kind: "channel",
    topic: "What shipped and what is next",
    members: ["noor", "jun", "tomas", "priya"],
    unread: 2,
    muted: true,
  },
  {
    id: "dm-rae",
    name: "Rae Okafor",
    kind: "direct",
    members: ["noor", "rae"],
  },
  {
    id: "dm-priya",
    name: "Priya Nandakumar",
    kind: "direct",
    members: ["noor", "priya"],
    unread: 1,
    mentions: 1,
  },
  {
    id: "dm-amara",
    name: "Amara Osei",
    kind: "direct",
    members: ["noor", "amara"],
  },
];

const msg = (
  id: string,
  channel: string,
  author: string,
  when: number,
  text: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage => ({ id, channel, author, at: when, text, ...extra });

export const defaultChatMessages: ChatMessage[] = [
  msg(
    "fo-1",
    "field-ops",
    "jun",
    at(-1, "16:05"),
    "Gauge firmware 2.4 is on every N-series logger. Readings now arrive every 5 minutes instead of 15.",
    {
      reactions: [
        { kind: "done", people: ["noor", "rae", "lina"] },
        { kind: "spark", people: ["tomas"] },
      ],
    },
  ),
  msg(
    "fo-2",
    "field-ops",
    "lina",
    at(0, "09:12"),
    "Overnight rain pushed N4 to 1.8 m³/s. I'd like a second reading before we trust it.",
  ),
  msg(
    "fo-3",
    "field-ops",
    "rae",
    at(0, "09:14"),
    "I can take it on the way to the weir. The ford is passable this morning.",
    { reactions: [{ kind: "ack", people: ["lina", "noor"] }] },
  ),
  msg(
    "fo-4",
    "field-ops",
    "rae",
    at(0, "09:15"),
    "Bringing the spare flow meter in case the first one drifts again.",
  ),
  msg(
    "fo-5",
    "field-ops",
    "noor",
    at(0, "09:31"),
    "Plan for today: Rae on N4 and the weir, Lina on the slump survey, Tomas checks the logger sync. Shout if anything moves.",
    {
      pinned: true,
      reactions: [
        { kind: "ack", people: ["rae", "lina", "tomas"] },
        { kind: "eyes", people: ["jun"] },
      ],
    },
  ),
  msg(
    "fo-6",
    "field-ops",
    "lina",
    at(0, "09:58"),
    "@Rae the left bank below the weir has slumped about a metre since July. Can you get a GPS fix on the new edge?",
    { reactions: [{ kind: "heart", people: ["rae"] }] },
  ),
  msg(
    "fo-6-r1",
    "field-ops",
    "rae",
    at(0, "10:02"),
    "Yes. I'll fix both ends and the midpoint.",
    { parent: "fo-6" },
  ),
  msg(
    "fo-6-r2",
    "field-ops",
    "lina",
    at(0, "10:05"),
    "Same post as the July photos, if you can find it.",
    { parent: "fo-6" },
  ),
  msg(
    "fo-6-r3",
    "field-ops",
    "tomas",
    at(0, "10:11"),
    "The July fixes are in `survey/n4/07-14` if you want to compare on site.",
    { parent: "fo-6", reactions: [{ kind: "ack", people: ["rae"] }] },
  ),
  msg(
    "fo-6-r4",
    "field-ops",
    "rae",
    at(0, "10:16"),
    "Found the post. Photos and fixes are going up now.",
    { parent: "fo-6", reactions: [{ kind: "spark", people: ["lina"] }] },
  ),
  msg(
    "fo-7",
    "field-ops",
    "tomas",
    at(0, "10:19"),
    "Logger sync is clean. Two stations were 40 seconds behind; fixed.",
    { reactions: [{ kind: "done", people: ["noor", "lina"] }] },
  ),
  msg(
    "fo-8",
    "field-ops",
    "rae",
    at(0, "10:22"),
    "Flow meter reads 1.76 at N4 against the staff gauge. Calling it confirmed.",
    {
      reactions: [
        { kind: "spark", people: ["lina"] },
        { kind: "ack", people: ["noor"] },
      ],
    },
  ),
  msg(
    "de-1",
    "design",
    "priya",
    at(-1, "15:40"),
    "Pricing page v3 is up for review. The comparison table finally fits a phone.",
    { reactions: [{ kind: "heart", people: ["amara", "rae"] }] },
  ),
  msg(
    "de-2",
    "design",
    "amara",
    at(0, "08:50"),
    "Finance is fine with the annual discount as drawn. One note: the Coldbrook Bank badge has to go, use the plain name.",
  ),
  msg(
    "de-3",
    "design",
    "priya",
    at(0, "09:20"),
    "@Noor could you look before the 14:00 review? Mostly the plan names.",
  ),
  msg(
    "de-4",
    "design",
    "rae",
    at(0, "09:40"),
    "Plan names read well on the phone mock.",
    { reactions: [{ kind: "ack", people: ["priya"] }] },
  ),
  msg(
    "re-1",
    "releases",
    "jun",
    at(-1, "11:00"),
    "Field app 3.0.2 is out: offline maps keep their cache twice as long.",
    { reactions: [{ kind: "spark", people: ["tomas", "priya"] }] },
  ),
  msg(
    "re-2",
    "releases",
    "tomas",
    at(-1, "14:20"),
    "Export retries back off properly now. Fewer duplicate rows in the Basin sheet.",
  ),
  msg(
    "re-3",
    "releases",
    "jun",
    at(0, "08:30"),
    "The 3.1 freeze is next Thursday.",
  ),
  msg(
    "ge-1",
    "general",
    "amara",
    at(-1, "09:00"),
    "Expenses for September close on Monday.",
  ),
  msg(
    "ge-2",
    "general",
    "noor",
    at(-1, "12:10"),
    "Welcome Jun to the releases rota.",
    { reactions: [{ kind: "heart", people: ["jun", "lina", "amara"] }] },
  ),
  msg(
    "dm-1",
    "dm-rae",
    "rae",
    at(0, "08:05"),
    "Heading out at 8:30. Message me if the ford plan changes.",
  ),
  msg("dm-2", "dm-rae", "noor", at(0, "08:07"), "Will do. Safe drive."),
  msg(
    "dm-3",
    "dm-priya",
    "priya",
    at(0, "09:22"),
    "Got ten minutes before the review?",
  ),
  msg(
    "dm-4",
    "dm-amara",
    "amara",
    at(-1, "17:30"),
    "The statement checklist is in the shared notes.",
  ),
];

/* ------------------------------------------------------------------ */
/* Look and helpers                                                     */
/* ------------------------------------------------------------------ */

type Mode = "phone" | "tablet" | "desktop";
type Said = { n: number; text: string };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;
/** Same author within this long reads as one run under one avatar. */
const RUN_GAP = 5 * MIN;

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid";
const TOOL = cn(
  "inline-flex size-8 shrink-0 items-center justify-center rounded-2 text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40",
  FOCUS,
);

type ReactionSpec = {
  kind: ChatReactionKind;
  label: string;
  Icon: LucideIcon;
  ink: string;
};
const REACTIONS: ReactionSpec[] = [
  {
    kind: "ack",
    label: "Thumbs up",
    Icon: ThumbsUp,
    ink: "text-cobalt-bright",
  },
  { kind: "done", label: "Done", Icon: Check, ink: "text-success" },
  { kind: "heart", label: "Heart", Icon: Heart, ink: "text-danger" },
  { kind: "eyes", label: "Looking", Icon: Eye, ink: "text-ink-2" },
  { kind: "spark", label: "Spark", Icon: Sparkles, ink: "text-warn" },
  { kind: "laugh", label: "Laugh", Icon: Laugh, ink: "text-signal" },
];
const ACK: ReactionSpec = {
  kind: "ack",
  label: "Thumbs up",
  Icon: ThumbsUp,
  ink: "text-cobalt-bright",
};
const reactionOf = (kind: ChatReactionKind) =>
  REACTIONS.find((r) => r.kind === kind) ?? ACK;

const PRESENCE_INK: Record<ChatPresence, string> = {
  active: "var(--success)",
  away: "var(--warn)",
  busy: "var(--danger)",
  offline: "var(--ink-3)",
};
const PRESENCE_DOT: Record<ChatPresence, string> = {
  active: "bg-success",
  away: "bg-warn",
  busy: "bg-danger",
  offline: "bg-ink-3/45",
};

type DensitySpec = {
  avatar: number;
  body: string;
  gutter: string;
  run: string;
  row: string;
  inline: boolean;
};
const DENSITY: Record<TeamChatDensity, DensitySpec> = {
  compact: {
    avatar: 20,
    body: "text-[13px] leading-5",
    gutter: "gap-x-2",
    run: "pt-2",
    row: "py-0.5",
    inline: true,
  },
  cozy: {
    avatar: 32,
    body: "text-[14px] leading-[22px]",
    gutter: "gap-x-2.5",
    run: "pt-3",
    row: "py-0.5",
    inline: false,
  },
  roomy: {
    avatar: 36,
    body: "text-[14px] leading-6",
    gutter: "gap-x-3",
    run: "pt-4",
    row: "py-1",
    inline: false,
  },
};

const TINTS = [
  "var(--accent-bright)",
  "var(--success)",
  "var(--warn)",
  "var(--signal)",
  "var(--danger)",
];

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const r2 = (v: number) => Math.round(v * 100) / 100;
const toMs = (v: Date | number) => (typeof v === "number" ? v : v.getTime());
const pad2 = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS =
  "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" ");
const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );
const clock = (ms: number, off: number) => {
  const d = new Date(ms + off * MIN);
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
};
const dayIndex = (ms: number, off: number) =>
  Math.floor((ms + off * MIN) / DAY);
const dayLabel = (ms: number, nowMs: number, off: number) => {
  const diff = dayIndex(nowMs, off) - dayIndex(ms, off);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const d = new Date(ms + off * MIN);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const panOf = (el?: Element | null) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};

/* ------------------------------------------------------------------ */
/* Small parts                                                          */
/* ------------------------------------------------------------------ */

function Avatar({
  person,
  tint,
  size,
  show,
  className,
}: {
  person: ChatPerson;
  /** The face's colour, any CSS colour. */
  tint: string;
  size: number;
  show: TeamChatPresence;
  className?: string;
}) {
  const ring = show === "ring" && person.presence !== "offline";
  const dot = Math.max(6, Math.round(size * 0.3));
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <span
        className="flex size-full items-center justify-center rounded-full leading-none font-semibold text-foreground"
        style={{
          background: `color-mix(in oklab, ${tint} 26%, var(--card))`,
          fontSize: Math.max(8, Math.round(size * 0.38)),
          boxShadow: ring
            ? `0 0 0 1.5px var(--card), 0 0 0 3px ${PRESENCE_INK[person.presence]}`
            : undefined,
        }}
      >
        {size < 20
          ? person.name.charAt(0).toUpperCase()
          : initials(person.name)}
      </span>
      {show === "dot" ? (
        <span
          className={cn(
            "absolute -right-px -bottom-px rounded-full ring-2 ring-card",
            PRESENCE_DOT[person.presence],
          )}
          style={{ width: dot, height: dot }}
        />
      ) : null}
    </span>
  );
}

/** A number whose digits roll: up when it grows, down when it shrinks. */
function Roll({ value, motionSafe }: { value: number; motionSafe: boolean }) {
  const [seen, setSeen] = React.useState({ value, dir: 1 });
  if (seen.value !== value) {
    setSeen({ value, dir: value > seen.value ? 1 : -1 });
  }
  const dir = seen.value === value ? seen.dir : value > seen.value ? 1 : -1;
  const variants = {
    enter: (d: number) => ({ y: motionSafe ? d * 8 : 0, opacity: 0 }),
    rest: { y: 0, opacity: 1 },
    leave: (d: number) => ({
      y: motionSafe ? -d * 8 : 0,
      opacity: 0,
      transition: exitFor(durations.fast),
    }),
  };
  return (
    <span className="relative inline-grid overflow-hidden tabular-nums">
      <AnimatePresence initial={false} custom={dir}>
        <motion.span
          key={value}
          custom={dir}
          variants={variants}
          initial="enter"
          animate="rest"
          exit="leave"
          transition={motionSafe ? springs.snap : { duration: durations.fast }}
          className="[grid-area:1/1]"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** A box whose measured height glides to its content's. */
function Grow({
  motionSafe,
  className,
  children,
}: {
  motionSafe: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const height = useMotionValue<number | "auto">("auto");
  const [inner, setInner] = React.useState<HTMLDivElement | null>(null);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => {
    if (!inner) return;
    const go = () => {
      const target = inner.offsetHeight;
      const from = height.get();
      anim.current?.stop();
      if (from === "auto" || !motionSafe) {
        height.set(target);
        return;
      }
      if (Math.abs(from - target) < 0.5) return;
      anim.current = animate(height, target, springs.glide);
    };
    go();
    const ro = new ResizeObserver(go);
    ro.observe(inner);
    return () => {
      ro.disconnect();
      anim.current?.stop();
    };
  }, [inner, motionSafe, height]);
  return (
    <motion.div style={{ height }} className={cn("overflow-hidden", className)}>
      <div ref={setInner}>{children}</div>
    </motion.div>
  );
}

/** Text with @mentions washed and `code` set in mono. */
function RichText({ text, meName }: { text: string; meName: string }) {
  const parts = text.split(/(`[^`]+`|@[A-Za-z][\w-]*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
          return (
            <code
              key={i}
              className="rounded-1 bg-surface-2 px-1 py-px font-mono text-[0.86em] text-foreground"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("@")) {
          const mine = part.slice(1).toLowerCase() === meName.toLowerCase();
          return (
            <span
              key={i}
              className={cn(
                "rounded-1 px-0.5 font-medium",
                mine
                  ? "bg-[color-mix(in_oklab,var(--warn)_22%,transparent)] text-foreground"
                  : "bg-cobalt-wash text-cobalt-bright",
              )}
            >
              {part}
            </span>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </>
  );
}

function Composer({
  label,
  placeholder,
  disabled,
  motionSafe,
  onSend,
}: {
  label: string;
  placeholder: string;
  disabled: boolean;
  motionSafe: boolean;
  onSend: (text: string, from: Element | null) => void;
}) {
  const [text, setText] = React.useState("");
  const ready = text.trim().length > 0 && !disabled;
  const area = React.useRef<HTMLTextAreaElement | null>(null);
  const submit = () => {
    if (!ready) return;
    onSend(text.trim(), area.current);
    setText("");
  };
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex items-end gap-1.5 rounded-3 border border-hairline bg-surface-1 p-1 transition-colors focus-within:border-hairline-strong"
    >
      <Grow motionSafe={motionSafe} className="min-w-0 flex-1">
        <div className="grid">
          <span
            aria-hidden
            className="invisible col-start-1 row-start-1 max-h-[7.5rem] overflow-hidden px-2 py-1.5 text-[13px] leading-5 break-words whitespace-pre-wrap"
          >
            {`${text} `}
          </span>
          <textarea
            ref={area}
            rows={1}
            aria-label={label}
            placeholder={placeholder}
            value={text}
            readOnly={disabled}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setText(value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
            className={cn(
              "col-start-1 row-start-1 max-h-[7.5rem] resize-none overflow-y-auto rounded-2 bg-transparent px-2 py-1.5 text-[13px] leading-5 break-words text-foreground placeholder:text-ink-3",
              FOCUS_IN,
            )}
          />
        </div>
      </Grow>
      <button
        type="submit"
        aria-label="Send"
        aria-disabled={!ready || undefined}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-2 transition-colors",
          ready
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "text-ink-3",
          FOCUS,
        )}
      >
        <SendHorizontal aria-hidden className="size-4" />
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* The stack (phone, and the "full" thread on wide screens)             */
/* ------------------------------------------------------------------ */

function StackScreen({
  index,
  depth,
  level,
  motionSafe,
  children,
}: {
  index: number;
  depth: MotionValue<number>;
  level: number;
  motionSafe: boolean;
  children: React.ReactNode;
}) {
  // A pushed screen comes in from the right edge; the one beneath slides a
  // little over a quarter of the way left and dims, so a push reads as depth.
  const x = useTransform(depth, (d) =>
    motionSafe ? `${r2((index - d) * (index > d ? 100 : 28))}%` : "0%",
  );
  const dim = useTransform(depth, (d) =>
    r2(Math.min(1, Math.max(0, d - index)) * 0.3),
  );
  const on = index === level;
  return (
    <motion.div
      aria-hidden={!on || undefined}
      inert={!on}
      className="absolute inset-0 overflow-hidden bg-card"
      style={{ x, zIndex: index }}
      animate={motionSafe ? undefined : { opacity: on ? 1 : 0 }}
      transition={{ duration: durations.fast }}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,black_100%,transparent)]"
        style={{ opacity: dim }}
      />
    </motion.div>
  );
}

/** The strip along a pushed screen's left edge that takes a back-swipe. */
function EdgeBack({
  width,
  level,
  depth,
  onGrab,
  onBack,
}: {
  width: number;
  level: number;
  depth: MotionValue<number>;
  onGrab: () => void;
  onBack: () => void;
}) {
  const dx = React.useRef(0);
  const settle = React.useRef<AnimationPlaybackControls | null>(null);
  React.useEffect(() => () => settle.current?.stop(), []);
  const drag = useDrag({
    axis: "x",
    threshold: 6,
    onStart: () => {
      dx.current = 0;
      settle.current?.stop();
      onGrab();
    },
    onMove: ({ offset }) => {
      dx.current = offset.x;
      const w = Math.max(1, width);
      // 1:1 back toward the screen beneath; pulled the other way it resists.
      const d =
        offset.x >= 0
          ? level - Math.min(offset.x, w) / w
          : level + rubberband(-offset.x, w * 0.4) / w;
      depth.set(Math.round(d * 1000) / 1000);
    },
    onEnd: ({ velocity }) => {
      const rest = project(dx.current, velocity.x, 0.99);
      if (rest > width / 2) {
        onBack();
        return;
      }
      settle.current = animate(depth, level, {
        ...springs.glide,
        velocity: -velocity.x / Math.max(1, width),
      });
    },
    onCancel: () => {
      settle.current = animate(depth, level, springs.glide);
    },
    onTap: (event) => {
      // The strip lies over the screen's left edge; a tap is meant for
      // whatever is under it.
      const strip = event.currentTarget as Element;
      const below = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((n) => n !== strip && !strip.contains(n));
      const target = below?.closest<HTMLElement>(
        "button, a[href], textarea, input, [tabindex]",
      );
      if (!target) return;
      if (target.matches("textarea, input")) target.focus();
      else target.click();
    },
  });
  return (
    <div
      aria-hidden
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        // Nothing here is clicked, so the strip may hold the pointer at once:
        // a mouse pull that leaves the 16px strip on its first move is
        // still this drag.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A synthetic pointer cannot be captured; the drag still works.
        }
      }}
      className="absolute inset-y-0 left-0 z-30 w-4 cursor-grab touch-pan-y"
    />
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

type Picker = { id: string; via: "pointer" | "keyboard" };
type Bump = { key: string; n: number; added: boolean };

/**
 * A complete team chat screen: channels and direct messages, the message
 * stream with reactions, a thread panel, composers and presence. The current
 * channel's pill travels on snap; a message's actions rise 4px on snap when
 * the pointer or the focus arrives — React, Reply in thread, and Pin, which
 * is pin-press. Reactions are drawn glyphs: pressing one hops it and lands it
 * on recoil while a ring flares out of the pill and the count rolls; a new
 * one grows in from nothing.
 *
 * Opening a thread washes its message in the stream and draws a rule down
 * its edge while the panel arrives on glide — docked beside the stream,
 * over it, or pushed like a phone screen (`thread`) — with the replies
 * cascading in and follow-knot in its header. The channel header mutes with
 * mute-cone. Below 640px the panes become a stack, Channels → Channel →
 * Thread, with a 1:1 edge swipe back that commits by projection.
 *
 * Messages are a list of articles with a roving focus (Up, Down, Home, End;
 * Enter opens the thread), Alt+Up and Alt+Down switch channel, and Escape
 * closes the thread or goes back. Under reduced motion nothing travels or
 * hops: panels and screens cross-fade, and every count, pin and state still
 * changes.
 */
export function TeamChat({
  thread: threadMode = "dock",
  presence = "dot",
  density = "cozy",
  people = defaultChatPeople,
  me = "noor",
  channels,
  defaultChannels,
  onChannelsChange,
  messages,
  defaultMessages,
  onMessagesChange,
  channel,
  defaultChannel,
  onChannelChange,
  openThread,
  defaultOpenThread = null,
  onOpenThreadChange,
  following,
  defaultFollowing,
  onFollowingChange,
  typing,
  now = defaultTeamChatNow,
  zoneOffset = 0,
  workspace = "Fieldline",
  onSend,
  onReact,
  onPinChange,
  onMuteChange,
  status = "ready",
  onRetry,
  label = "Team chat",
  sound = false,
  disabled = false,
  className,
}: TeamChatProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const nowMs = toMs(now);
  const off = zoneOffset;
  const d = DENSITY[density] ?? DENSITY.cozy;
  const streamHeadId = `${uid}-stream`;
  const threadHeadId = `${uid}-thread`;
  const hintId = `${uid}-hint`;

  /* ------------------------------ the data ------------------------------ */

  const byPerson = React.useMemo(
    () => new Map(people.map((p) => [p.id, p])),
    [people],
  );
  const personOf = (id: string): ChatPerson =>
    byPerson.get(id) ?? { id, name: id, presence: "offline" };
  const meName = firstName(personOf(me).name);
  // Faces take their colour from their place in the team, so neighbours differ.
  const tintFor = (id: string) => {
    const i = people.findIndex((x) => x.id === id);
    return (
      TINTS[(i < 0 ? hash(id) : i) % TINTS.length] ?? "var(--accent-bright)"
    );
  };

  const [ownChannels, setOwnChannels] = React.useState<ChatChannel[]>(
    () => defaultChannels ?? defaultChatChannels,
  );
  const channelList = channels ?? ownChannels;
  const chRef = React.useRef(channelList);
  const [ownMessages, setOwnMessages] = React.useState<ChatMessage[]>(
    () => defaultMessages ?? defaultChatMessages,
  );
  const all = messages ?? ownMessages;
  const msgRef = React.useRef(all);
  React.useEffect(() => {
    chRef.current = channelList;
    msgRef.current = all;
  }, [channelList, all]);
  // Messages already there when the screen arrived do not animate in.
  const [startIds] = React.useState(() => new Set(all.map((m) => m.id)));

  const [ownChannel, setOwnChannel] = React.useState(
    () =>
      defaultChannel ??
      (channelList.find((c) => c.id === "field-ops") ?? channelList[0])?.id ??
      "",
  );
  const currentId = channel ?? ownChannel;
  const current =
    channelList.find((c) => c.id === currentId) ?? channelList[0] ?? null;

  const [ownThread, setOwnThread] = React.useState<string | null>(
    defaultOpenThread,
  );
  const threadId = openThread !== undefined ? openThread : ownThread;
  const parent = threadId
    ? all.find((m) => m.id === threadId && !m.parent)
    : undefined;
  // The thread a stack screen keeps drawing while it slides away.
  const [lastThread, setLastThread] = React.useState(threadId);
  if (threadId && threadId !== lastThread) setLastThread(threadId);
  const shownParent = lastThread
    ? all.find((m) => m.id === lastThread && !m.parent)
    : undefined;

  const [ownFollowing, setOwnFollowing] = React.useState<string[]>(
    () => defaultFollowing ?? [],
  );
  const followed = following ?? ownFollowing;

  const commitMessages = (next: ChatMessage[]) => {
    msgRef.current = next;
    if (messages === undefined) setOwnMessages(next);
    onMessagesChange?.(next);
  };
  const patchMessage = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    commitMessages(msgRef.current.map((m) => (m.id === id ? fn(m) : m)));
  const commitChannels = (next: ChatChannel[]) => {
    chRef.current = next;
    if (channels === undefined) setOwnChannels(next);
    onChannelsChange?.(next);
  };
  const patchChannel = (id: string, fn: (c: ChatChannel) => ChatChannel) =>
    commitChannels(chRef.current.map((c) => (c.id === id ? fn(c) : c)));

  const repliesOf = React.useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of all) {
      if (!m.parent) continue;
      const list = map.get(m.parent) ?? [];
      list.push(m);
      map.set(m.parent, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.at - b.at);
    return map;
  }, [all]);
  const stream = all
    .filter((m) => m.channel === current?.id && !m.parent)
    .sort((a, b) => a.at - b.at);
  const pinnedCount = stream.filter((m) => m.pinned).length;

  const nameOf = (c: ChatChannel) =>
    c.kind === "direct"
      ? personOf(c.members.find((id) => id !== me) ?? c.members[0] ?? "").name
      : c.name;
  const titleOf = (c: ChatChannel) =>
    c.kind === "direct" ? nameOf(c) : `#${c.name}`;
  const otherOf = (c: ChatChannel) =>
    personOf(c.members.find((id) => id !== me) ?? c.members[0] ?? "");

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [width, setWidth] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => setWidth(Math.round(root.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, [root]);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(rootRef, { amount: 0 });

  const W = width ?? 760;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const phone = mode === "phone";
  const layout: TeamChatThread = phone ? "full" : threadMode;
  const railed = mode === "tablet" && layout === "dock" && !!parent;
  const sideW = mode === "desktop" ? 232 : railed ? 56 : 196;
  const dockW = mode === "desktop" ? 340 : 300;
  const overlayW = Math.min(mode === "desktop" ? 360 : 320, W - 48);

  const [phoneStream, setPhoneStream] = React.useState(true);
  const level = phone
    ? parent
      ? 2
      : phoneStream
        ? 1
        : 0
    : layout === "full" && parent
      ? 1
      : 0;
  const stackKey = phone ? "phone" : layout === "full" ? "full" : "none";
  const depth = useMotionValue(level);
  const depthAnim = React.useRef<AnimationPlaybackControls | null>(null);
  const wasKey = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    const arrived = wasKey.current !== stackKey;
    wasKey.current = stackKey;
    depthAnim.current?.stop();
    if (arrived || !motionSafe) depth.jump(level);
    else if (Math.abs(depth.get() - level) > 0.001) {
      depthAnim.current = animate(depth, level, springs.glide);
    }
  }, [level, stackKey, motionSafe, depth]);
  React.useEffect(() => () => depthAnim.current?.stop(), []);

  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  /* ------------------------------- state -------------------------------- */

  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));
  const [hot, setHot] = React.useState<string | null>(null);
  const [picker, setPicker] = React.useState<Picker | null>(null);
  const [bump, setBump] = React.useState<Bump | null>(null);
  const [focusMsg, setFocusMsg] = React.useState<string | null>(null);
  const [focusChannel, setFocusChannel] = React.useState<string | null>(null);

  const seq = React.useRef(0);
  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );
  const opener = React.useRef<HTMLElement | null>(null);
  const articles = React.useRef(new Map<string, HTMLElement>());
  const channelRows = React.useRef(new Map<string, HTMLButtonElement>());
  const reactButtons = React.useRef(new Map<string, HTMLButtonElement>());
  const pickerItems = React.useRef<HTMLButtonElement[]>([]);
  const pickerRef = React.useRef<HTMLDivElement | null>(null);
  const streamScroll = React.useRef<HTMLDivElement | null>(null);
  const threadScroll = React.useRef<HTMLDivElement | null>(null);
  const glides = React.useRef(new Map<string, AnimationPlaybackControls>());

  // Focus that follows a move lands once the render that made it has
  // committed and the screen it goes to is no longer inert.
  React.useEffect(() => {
    const next = focusNext.current;
    if (!next) return;
    focusNext.current = null;
    const node = next();
    if (node?.isConnected && !node.closest("[inert]")) {
      node.focus({ preventScroll: true });
    }
  });

  React.useEffect(() => {
    const running = glides.current;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  /** Glides a scroller to its floor; jumps there under reduced motion. */
  const toFloor = (key: string, el: HTMLElement | null, instant = false) => {
    if (!el) return;
    const target = Math.max(0, el.scrollHeight - el.clientHeight);
    glides.current.get(key)?.stop();
    if (instant || !motionSafe) {
      el.scrollTop = target;
      return;
    }
    glides.current.set(
      key,
      animate(el.scrollTop, target, {
        ...springs.glide,
        onUpdate: (v) => {
          el.scrollTop = Math.round(v);
        },
      }),
    );
  };

  // A channel opens at its newest message.
  const shownChannel = current?.id ?? "";
  React.useLayoutEffect(() => {
    toFloor("stream", streamScroll.current, true);
    // Only a different channel, a layout change or data arriving jumps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownChannel, status, mode, layout]);

  // A message arriving glides the stream to it.
  const streamCount = stream.length;
  const lastStreamCount = React.useRef(streamCount);
  React.useEffect(() => {
    const grew = streamCount > lastStreamCount.current;
    lastStreamCount.current = streamCount;
    if (grew) toFloor("stream", streamScroll.current);
    // Watching the count only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamCount]);

  const threadCount = shownParent
    ? (repliesOf.get(shownParent.id)?.length ?? 0)
    : 0;
  const lastThreadCount = React.useRef({ id: lastThread, n: threadCount });
  React.useEffect(() => {
    const was = lastThreadCount.current;
    lastThreadCount.current = { id: lastThread, n: threadCount };
    if (was.id === lastThread && threadCount > was.n) {
      toFloor("thread", threadScroll.current);
    }
    // Watching the count only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadCount, lastThread]);

  // The picker closes on a press anywhere outside it.
  React.useEffect(() => {
    if (!picker) return;
    const onDown = (event: PointerEvent) => {
      const node = pickerRef.current;
      if (node && event.target instanceof Node && node.contains(event.target))
        return;
      const button = reactButtons.current.get(picker.id);
      if (
        button &&
        event.target instanceof Node &&
        button.contains(event.target)
      )
        return;
      setPicker(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [picker]);

  // The picker takes focus when it arrives: its first glyph for the
  // keyboard, the menu itself for a pointer.
  const pickerKey = picker ? `${picker.id}:${picker.via}` : null;
  React.useEffect(() => {
    if (!picker) return;
    if (picker.via === "keyboard") pickerItems.current[0]?.focus();
    else pickerRef.current?.focus({ preventScroll: true });
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerKey]);

  /* ------------------------------- actions ------------------------------ */

  const swish = (up: boolean, by?: Element | null) =>
    audio.play("swish", { pitch: up ? 1.1 : 0.85, gain: 0.4, pan: panOf(by) });

  const setThread = (id: string | null) => {
    if (openThread === undefined) setOwnThread(id);
    onOpenThreadChange?.(id);
  };

  const openThreadFor = (id: string, by?: HTMLElement | null) => {
    if (status !== "ready") return;
    const p = msgRef.current.find((m) => m.id === id);
    if (!p) return;
    opener.current = by ?? null;
    setPicker(null);
    swish(true, by);
    focusNext.current = () => document.getElementById(threadHeadId);
    setThread(id);
    const n = repliesOf.get(id)?.length ?? 0;
    say(
      `Thread on ${firstName(personOf(p.author).name)}'s message, ${plural(n, "reply", "replies")}.`,
    );
  };

  const closeThread = (by?: Element | null) => {
    if (!threadId) return;
    swish(false, by);
    const back = opener.current;
    const from = threadId;
    opener.current = null;
    focusNext.current = () =>
      back?.isConnected ? back : (articles.current.get(from) ?? null);
    setThread(null);
    say("Thread closed.");
  };

  const chooseChannel = (id: string, by?: Element | null) => {
    const c = chRef.current.find((x) => x.id === id);
    if (!c) return;
    audio.play("pop", { pitch: 1.05, gain: 0.3, pan: panOf(by) });
    if (id !== currentId) {
      if (channel === undefined) setOwnChannel(id);
      onChannelChange?.(id);
      setFocusMsg(null);
      setHot(null);
      setPicker(null);
      if (threadId) {
        const p = msgRef.current.find((m) => m.id === threadId);
        if (p && p.channel !== id) setThread(null);
      }
    }
    if (c.unread || c.mentions) {
      patchChannel(id, (x) => ({ ...x, unread: 0, mentions: 0 }));
    }
    setFocusChannel(id);
    if (phone) {
      setPhoneStream(true);
      swish(true, by);
      focusNext.current = () => document.getElementById(streamHeadId);
    }
    say(
      `${titleOf(c)}${c.unread ? `, ${plural(c.unread, "unread message")}` : ""}.`,
    );
  };

  const stepChannel = (dir: 1 | -1) => {
    const list = chRef.current;
    const i = list.findIndex((c) => c.id === currentId);
    const next = list[(i + dir + list.length) % list.length];
    if (next) chooseChannel(next.id, channelRows.current.get(next.id));
  };

  const back = (by?: Element | null) => {
    if (threadId && (phone || layout === "full")) {
      closeThread(by);
      return;
    }
    if (phone && phoneStream) {
      swish(false, by);
      setPhoneStream(false);
      focusNext.current = () => channelRows.current.get(currentId) ?? null;
    }
  };
  const canBack = phone ? level > 0 : layout === "full" && !!parent;

  const react = (
    messageId: string,
    kind: ChatReactionKind,
    by?: Element | null,
  ) => {
    if (disabled || status !== "ready") return;
    const m = msgRef.current.find((x) => x.id === messageId);
    if (!m) return;
    const list = m.reactions ?? [];
    const has = list.find((r) => r.kind === kind);
    const mine = !!has?.people.includes(me);
    const next: ChatReaction[] = mine
      ? list
          .map((r) =>
            r.kind === kind
              ? { ...r, people: r.people.filter((p) => p !== me) }
              : r,
          )
          .filter((r) => r.people.length > 0)
      : has
        ? list.map((r) =>
            r.kind === kind ? { ...r, people: [...r.people, me] } : r,
          )
        : [...list, { kind, people: [me] }];
    patchMessage(messageId, (x) => ({ ...x, reactions: next }));
    onReact?.(messageId, kind, !mine);
    setBump((b) => ({
      key: `${messageId}:${kind}`,
      n: (b?.n ?? 0) + 1,
      added: !mine,
    }));
    audio.play("pop", {
      pitch: mine ? 0.85 : 1.15,
      gain: 0.45,
      pan: panOf(by),
    });
    const who = firstName(personOf(m.author).name);
    say(
      mine
        ? `Took back ${reactionOf(kind).label} on ${who}'s message.`
        : `Reacted ${reactionOf(kind).label} to ${who}'s message.`,
    );
  };

  const send = (
    text: string,
    parentId: string | undefined,
    by: Element | null,
  ) => {
    if (disabled || status !== "ready" || !current) return;
    seq.current += 1;
    const channelId = parentId
      ? (msgRef.current.find((m) => m.id === parentId)?.channel ?? current.id)
      : current.id;
    const message: ChatMessage = {
      id: `${idBase}-m${seq.current}`,
      channel: channelId,
      author: me,
      at: nowMs,
      text,
      ...(parentId ? { parent: parentId } : {}),
    };
    commitMessages([...msgRef.current, message]);
    onSend?.(message);
    audio.play("pop", { pitch: 1, gain: 0.4, pan: panOf(by) });
    if (parentId && !followed.includes(parentId)) {
      setFollow(parentId, true, false);
    }
    say(parentId ? "Reply sent." : `Sent to ${titleOf(current)}.`);
  };

  const setPinned = (id: string, pinned: boolean) => {
    const m = msgRef.current.find((x) => x.id === id);
    if (!m) return;
    patchMessage(id, (x) => ({ ...x, pinned }));
    onPinChange?.(id, pinned);
    say(
      pinned
        ? `Pinned ${firstName(personOf(m.author).name)}'s message.`
        : "Unpinned.",
    );
  };

  const setMuted = (muted: boolean) => {
    if (!current) return;
    patchChannel(current.id, (c) => ({ ...c, muted }));
    onMuteChange?.(current.id, muted);
    say(muted ? `${titleOf(current)} muted.` : `${titleOf(current)} unmuted.`);
  };

  function setFollow(id: string, on: boolean, speak = true) {
    const next = on
      ? [...followed.filter((x) => x !== id), id]
      : followed.filter((x) => x !== id);
    if (following === undefined) setOwnFollowing(next);
    onFollowingChange?.(next);
    if (speak) say(on ? "Following the thread." : "Stopped following.");
  }

  const openPicker = (id: string, via: Picker["via"]) => {
    if (disabled || status !== "ready") return;
    setHot(id);
    setPicker((p) => (p?.id === id ? null : { id, via }));
  };
  const closePicker = (refocus: boolean) => {
    const p = picker;
    setPicker(null);
    if (refocus && p) reactButtons.current.get(p.id)?.focus();
  };

  /* --------------------------- keyboard paths --------------------------- */

  const onArticleKey = (
    event: React.KeyboardEvent<HTMLElement>,
    m: ChatMessage,
    list: ChatMessage[],
  ) => {
    // Alt with an arrow switches channel; that is the screen's to handle.
    if (event.target !== event.currentTarget || event.altKey) return;
    const i = list.findIndex((x) => x.id === m.id);
    const go = (j: number) => {
      const t = list[Math.min(list.length - 1, Math.max(0, j))];
      if (!t) return;
      setFocusMsg(t.id);
      articles.current.get(t.id)?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        go(i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(list.length - 1);
        return;
      case "Enter":
        event.preventDefault();
        openThreadFor(m.id, event.currentTarget);
        return;
    }
  };

  const onChannelKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    id: string,
  ) => {
    const list = channelList;
    const at = list.findIndex((c) => c.id === id);
    const go = (j: number) => {
      const t = list[Math.min(list.length - 1, Math.max(0, j))];
      if (!t) return;
      setFocusChannel(t.id);
      channelRows.current.get(t.id)?.focus();
    };
    if (event.altKey) return;
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
        go(list.length - 1);
        return;
    }
  };

  const onPickerKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = pickerItems.current.filter(Boolean);
    const i = items.findIndex((n) => n === document.activeElement);
    const go = (j: number) => {
      const n = items[(j + items.length) % items.length];
      n?.focus();
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        go(i + 1);
        return;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        go(i <= 0 ? items.length - 1 : i - 1);
        return;
      case "Home":
        event.preventDefault();
        go(0);
        return;
      case "End":
        event.preventDefault();
        go(items.length - 1);
        return;
      case "Escape":
      case "Tab":
        // Handled where focus is: the screen must not also close the thread.
        event.preventDefault();
        closePicker(true);
        return;
    }
  };

  const trap = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const nodes = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        "button:not([disabled]), textarea, [tabindex='0']",
      ),
    ].filter((n) => !n.closest("[inert]"));
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /* ------------------------------- parts -------------------------------- */

  const reactionsRow = (m: ChatMessage, compactRow = false) => {
    const list = m.reactions ?? [];
    if (list.length === 0) return null;
    const who = firstName(personOf(m.author).name);
    return (
      <ul
        role="list"
        aria-label={`Reactions to ${who}'s message`}
        className={cn("flex flex-wrap gap-1", compactRow ? "mt-0.5" : "mt-1.5")}
      >
        <AnimatePresence initial={false}>
          {list.map((r) => {
            const spec = reactionOf(r.kind);
            const mine = r.people.includes(me);
            const key = `${m.id}:${r.kind}`;
            const bumped = bump?.key === key ? bump : null;
            const fresh = !startIds.has(m.id) || bumped;
            const others = r.people.filter((p) => p !== me).length;
            const name = `${spec.label}, ${plural(r.people.length, "person", "people")}${
              mine ? (others ? ", including you" : ", you") : ""
            }`;
            return (
              <motion.li
                key={r.kind}
                layout={motionSafe ? "position" : false}
                initial={
                  fresh && motionSafe ? { opacity: 0, scale: 0.6 } : false
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={{
                  opacity: 0,
                  scale: motionSafe ? 0.8 : 1,
                  transition: exitFor(durations.fast),
                }}
                transition={
                  motionSafe
                    ? { ...springs.recoil, layout: springs.glide }
                    : { duration: durations.fast }
                }
              >
                <button
                  type="button"
                  aria-pressed={mine}
                  aria-label={name}
                  title={r.people.map((p) => personOf(p).name).join(", ")}
                  disabled={disabled}
                  onClick={(event) => react(m.id, r.kind, event.currentTarget)}
                  className={cn(
                    "relative inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors",
                    mine
                      ? "border-cobalt-bright/50 bg-cobalt-wash text-foreground"
                      : "border-hairline bg-surface-1 text-ink-2 hover:border-hairline-strong hover:text-foreground",
                    "disabled:cursor-not-allowed",
                    FOCUS,
                  )}
                >
                  {bumped && bumped.added && motionSafe ? (
                    <motion.span
                      key={`ring-${bumped.n}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-full border border-cobalt-bright"
                      initial={{ opacity: 0.7, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.4 }}
                      transition={{ duration: 0.42, ease: easings.enter }}
                    />
                  ) : null}
                  <motion.span
                    key={`glyph-${bumped ? bumped.n : 0}`}
                    aria-hidden
                    className={cn("inline-flex", spec.ink)}
                    initial={bumped?.added && motionSafe ? { y: -5 } : false}
                    animate={{ y: 0 }}
                    transition={springs.recoil}
                  >
                    <spec.Icon className="size-3.5" strokeWidth={2.2} />
                  </motion.span>
                  <Roll value={r.people.length} motionSafe={motionSafe} />
                </button>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    );
  };

  const header = (m: ChatMessage, inline: boolean) => {
    const p = personOf(m.author);
    return (
      <span
        className={cn(
          "inline-flex items-baseline gap-1.5",
          inline ? "mr-1.5" : "",
        )}
      >
        <span className="text-[13px] font-semibold text-foreground">
          {p.name}
        </span>
        <span className="font-mono text-[11px] text-ink-3 tabular-nums">
          {clock(m.at, off)}
        </span>
      </span>
    );
  };

  const pickerMenu = (m: ChatMessage) => (
    <motion.div
      ref={pickerRef}
      role="menu"
      tabIndex={-1}
      aria-label="Add a reaction"
      onKeyDown={onPickerKey}
      className="absolute top-full right-0 z-30 mt-1 flex gap-0.5 rounded-3 border border-hairline-strong bg-popover p-1 shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)] outline-none"
      initial={{ opacity: 0, y: motionSafe ? -distances.nudge : 0 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        motionSafe
          ? { ...springs.snap, opacity: { duration: durations.fast } }
          : { duration: durations.fast }
      }
    >
      {REACTIONS.map((r, i) => {
        const mine = !!m.reactions
          ?.find((x) => x.kind === r.kind)
          ?.people.includes(me);
        return (
          <button
            key={r.kind}
            ref={(node) => {
              if (node) pickerItems.current[i] = node;
            }}
            type="button"
            role="menuitem"
            tabIndex={-1}
            aria-label={mine ? `${r.label}, yours` : r.label}
            title={r.label}
            onClick={(event) => {
              react(m.id, r.kind, event.currentTarget);
              closePicker(true);
            }}
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-2 transition-colors hover:bg-surface-2",
              mine && "bg-cobalt-wash",
              r.ink,
              FOCUS_IN,
            )}
          >
            <r.Icon aria-hidden className="size-4" strokeWidth={2.2} />
          </button>
        );
      })}
    </motion.div>
  );

  const actionBar = (m: ChatMessage) => {
    const who = firstName(personOf(m.author).name);
    return (
      <motion.div
        key="bar"
        role="toolbar"
        aria-label={`Actions for ${who}'s message`}
        className="absolute -top-3 right-2 z-20 flex items-center gap-0.5 rounded-3 border border-hairline bg-popover p-0.5 shadow-[0_4px_14px_color-mix(in_oklab,black_12%,transparent)]"
        initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, transition: exitFor(durations.fast) }}
        transition={
          motionSafe
            ? { ...springs.snap, opacity: { duration: durations.fast } }
            : { duration: durations.fast }
        }
      >
        <button
          ref={(node) => {
            if (node) reactButtons.current.set(m.id, node);
            else reactButtons.current.delete(m.id);
          }}
          type="button"
          aria-label="React"
          aria-haspopup="menu"
          aria-expanded={picker?.id === m.id}
          title="React"
          disabled={disabled}
          onClick={(event) =>
            openPicker(m.id, event.detail === 0 ? "keyboard" : "pointer")
          }
          className={cn(TOOL, "size-9")}
        >
          <SmilePlus aria-hidden className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reply in thread"
          title="Reply in thread"
          onClick={(event) => openThreadFor(m.id, event.currentTarget)}
          className={cn(TOOL, "size-9")}
        >
          <MessageSquareText aria-hidden className="size-4" />
        </button>
        <PinPress
          compact
          size="sm"
          name="Pin message"
          tag={false}
          pressed={!!m.pinned}
          onPressedChange={(p) => setPinned(m.id, p)}
          sound={sound}
          disabled={disabled}
        />
        {picker?.id === m.id ? pickerMenu(m) : null}
      </motion.div>
    );
  };

  const threadSummary = (m: ChatMessage) => {
    const replies = repliesOf.get(m.id) ?? [];
    if (replies.length === 0) return null;
    const lastAt = replies[replies.length - 1]?.at ?? m.at;
    const faces = [...new Set(replies.map((r) => r.author))].slice(0, 3);
    const on = followed.includes(m.id);
    return (
      <button
        type="button"
        aria-label={`${plural(replies.length, "reply", "replies")}, last at ${clock(lastAt, off)}${on ? ", following" : ""}. Open thread`}
        onClick={(event) => openThreadFor(m.id, event.currentTarget)}
        className={cn(
          "mt-1 -ml-1 inline-flex h-7 max-w-full items-center gap-2 rounded-2 px-1 text-xs transition-colors hover:bg-surface-2",
          FOCUS,
        )}
      >
        <span className="flex shrink-0 -space-x-1">
          {faces.map((id) => (
            <Avatar
              key={id}
              person={personOf(id)}
              tint={tintFor(id)}
              size={16}
              show="off"
              className="rounded-full ring-1 ring-card"
            />
          ))}
        </span>
        <span className="shrink-0 font-medium text-cobalt-bright">
          {plural(replies.length, "reply", "replies")}
        </span>
        <span className="truncate text-ink-3">
          Last reply {clock(lastAt, off)}
          {on ? " · following" : ""}
        </span>
      </button>
    );
  };

  /* ------------------------------ the panes ----------------------------- */

  const channelRow = (
    c: ChatChannel,
    variant: "side" | "screen",
    roving: string,
  ) => {
    const on = c.id === currentId;
    const direct = c.kind === "direct";
    const other = otherOf(c);
    const unread = c.unread ?? 0;
    const mentions = c.mentions ?? 0;
    const name = `${titleOf(c)}${direct ? `, ${other.presence}` : ""}${
      mentions
        ? `, ${plural(mentions, "mention")}`
        : unread
          ? `, ${plural(unread, "unread message")}`
          : ""
    }${c.muted ? ", muted" : ""}`;
    return (
      <li key={c.id}>
        <button
          ref={(node) => {
            if (node) channelRows.current.set(c.id, node);
            else channelRows.current.delete(c.id);
          }}
          type="button"
          tabIndex={c.id === roving ? 0 : -1}
          aria-current={on ? "page" : undefined}
          aria-label={name}
          title={titleOf(c)}
          onFocus={() => setFocusChannel(c.id)}
          onKeyDown={(event) => onChannelKey(event, c.id)}
          onClick={(event) => chooseChannel(c.id, event.currentTarget)}
          className={cn(
            "relative flex w-full items-center gap-2 rounded-2 px-2 text-left text-[13px] transition-colors",
            variant === "screen" ? "h-10" : "h-8",
            on
              ? "text-foreground"
              : unread
                ? "font-semibold text-foreground hover:bg-surface-2"
                : "text-ink-2 hover:bg-surface-2 hover:text-foreground",
            c.muted && !on && "opacity-60",
            FOCUS_IN,
          )}
        >
          {on ? (
            <motion.span
              aria-hidden
              layoutId={`${idBase}-pill`}
              className="absolute inset-0 rounded-2 bg-cobalt-wash"
              transition={motionSafe ? springs.snap : { duration: 0 }}
            />
          ) : null}
          <span className="relative flex size-5 shrink-0 items-center justify-center">
            {direct ? (
              <Avatar
                person={other}
                tint={tintFor(other.id)}
                size={18}
                show={presence === "off" ? "off" : "dot"}
              />
            ) : (
              <Hash aria-hidden className="size-3.5 text-ink-3" />
            )}
            {unread || mentions ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 hidden size-2 rounded-full bg-cobalt-bright ring-2 ring-surface-1 @max-[7.5rem]/tcside:block"
              />
            ) : null}
          </span>
          <span className="relative min-w-0 flex-1 truncate @max-[7.5rem]/tcside:hidden">
            {direct ? nameOf(c) : c.name}
          </span>
          {c.muted ? (
            <BellOff
              aria-hidden
              className="relative size-3.5 shrink-0 text-ink-3 @max-[7.5rem]/tcside:hidden"
            />
          ) : null}
          {mentions ? (
            <span
              aria-hidden
              className="relative inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-cobalt-bright px-1 font-mono text-[10px] font-semibold text-background tabular-nums @max-[7.5rem]/tcside:hidden"
            >
              {mentions}
            </span>
          ) : unread ? (
            <span
              aria-hidden
              className="relative shrink-0 font-mono text-[10px] text-ink-3 tabular-nums @max-[7.5rem]/tcside:hidden"
            >
              {unread}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  const channelsPane = (variant: "side" | "screen") => {
    const chans = channelList.filter((c) => c.kind === "channel");
    const dms = channelList.filter((c) => c.kind === "direct");
    const roving =
      focusChannel && channelList.some((c) => c.id === focusChannel)
        ? focusChannel
        : currentId;
    const self = personOf(me);
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-hairline px-3">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-primary text-sm font-semibold text-primary-foreground"
          >
            {workspace.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1 @max-[7.5rem]/tcside:hidden">
            <p className="truncate text-sm font-semibold">{workspace}</p>
            <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-3">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  PRESENCE_DOT[self.presence],
                )}
              />
              <span className="truncate">
                {self.name} · {self.presence}
              </span>
            </p>
          </div>
        </div>
        <nav
          aria-label="Channels"
          className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-3"
        >
          {status === "loading" ? (
            <div aria-hidden className="flex flex-col gap-1.5 px-1 pt-4">
              {[72, 58, 80, 64, 52, 70].map((w, i) => (
                <span
                  key={i}
                  className="block h-6 rounded-2 bg-surface-2"
                  style={{ width: `${w}%` }}
                />
              ))}
            </div>
          ) : (
            <>
              {chans.length ? (
                <div className="pt-3">
                  <h3 className="px-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @max-[7.5rem]/tcside:sr-only">
                    Channels
                  </h3>
                  <ul role="list" className="flex flex-col gap-px">
                    {chans.map((c) => channelRow(c, variant, roving))}
                  </ul>
                </div>
              ) : null}
              {dms.length ? (
                <div className="pt-3">
                  <h3 className="px-2 pb-1 font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase @max-[7.5rem]/tcside:sr-only">
                    Direct messages
                  </h3>
                  <ul role="list" className="flex flex-col gap-px">
                    {dms.map((c) => channelRow(c, variant, roving))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </nav>
      </div>
    );
  };

  const typingNames = (typing ?? [])
    .filter((id) => id !== me && byPerson.has(id))
    .map((id) => firstName(personOf(id).name));
  const typingText =
    typingNames.length === 0
      ? ""
      : typingNames.length === 1
        ? `${typingNames[0]} is typing`
        : typingNames.length === 2
          ? `${typingNames[0]} and ${typingNames[1]} are typing`
          : `${typingNames.length} people are typing`;
  const dotsLive = motionSafe && !hidden && inView;

  const streamPane = () => {
    if (!current) {
      return (
        <div className="flex h-full items-center justify-center p-6 text-sm text-ink-3">
          No channels yet.
        </div>
      );
    }
    const active = current.members
      .map(personOf)
      .filter((p) => p.presence === "active");
    const roving =
      focusMsg && stream.some((m) => m.id === focusMsg)
        ? focusMsg
        : (stream[stream.length - 1]?.id ?? null);
    const direct = current.kind === "direct";
    const other = otherOf(current);
    return (
      <section
        aria-labelledby={streamHeadId}
        className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-card"
      >
        <header className="flex h-14 items-center gap-2 border-b border-hairline px-2 @min-[40rem]:px-3">
          {phone ? (
            <button
              type="button"
              aria-label="Channels"
              data-team-chat-back=""
              onClick={(event) => back(event.currentTarget)}
              className={TOOL}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
          ) : null}
          {direct ? (
            <Avatar
              person={other}
              tint={tintFor(other.id)}
              size={28}
              show={presence}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2
              id={streamHeadId}
              tabIndex={-1}
              className="flex items-center gap-1 truncate text-sm font-semibold outline-none"
            >
              {direct ? null : (
                <Hash aria-hidden className="size-3.5 shrink-0 text-ink-3" />
              )}
              <span className="truncate">
                {direct ? nameOf(current) : current.name}
              </span>
            </h2>
            <p className="truncate text-xs text-ink-3">
              {direct
                ? `${other.role ? `${other.role} · ` : ""}${other.status ?? other.presence}`
                : (current.topic ??
                  `${plural(current.members.length, "member")}`)}
            </p>
          </div>
          {pinnedCount ? (
            <span
              className="hidden h-7 shrink-0 items-center gap-1 rounded-full border border-hairline px-2 text-[11px] text-ink-2 @min-[34rem]:inline-flex"
              aria-label={plural(pinnedCount, "pinned message")}
              role="img"
            >
              <Pin aria-hidden className="size-3" />
              <Roll value={pinnedCount} motionSafe={motionSafe} />
            </span>
          ) : null}
          {!phone && !direct ? (
            <span
              className="hidden shrink-0 items-center gap-1.5 @min-[30rem]:flex"
              role="img"
              aria-label={`${active.length} active: ${active.map((p) => p.name).join(", ")}`}
            >
              <span className="flex -space-x-1.5">
                {active.slice(0, 3).map((p) => (
                  <Avatar
                    key={p.id}
                    person={p}
                    tint={tintFor(p.id)}
                    size={22}
                    show="off"
                    className="rounded-full ring-2 ring-card"
                  />
                ))}
              </span>
              <span className="text-[11px] text-ink-3 tabular-nums">
                {active.length} active
              </span>
            </span>
          ) : null}
          <MuteCone
            compact
            size="sm"
            name={`Mute ${titleOf(current)}`}
            label="Notify"
            pressedLabel="Muted"
            pressed={!!current.muted}
            onPressedChange={setMuted}
            sound={sound}
            disabled={disabled || status !== "ready"}
          />
        </header>

        <div
          ref={streamScroll}
          className="[scrollbar-width:thin] overflow-y-auto overscroll-contain"
        >
          {status === "loading" ? (
            <div aria-hidden className="flex flex-col gap-5 px-4 pt-6">
              {[78, 52, 66, 40].map((w, i) => (
                <div key={i} className="flex gap-3">
                  <span className="size-8 shrink-0 rounded-full bg-surface-2" />
                  <div className="flex flex-1 flex-col gap-2">
                    <span className="block h-3 w-24 rounded-1 bg-surface-2" />
                    <span
                      className="block h-3 rounded-1 bg-surface-2"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : status === "error" ? (
            <div className="flex flex-col items-start gap-2 px-4 pt-6">
              <p className="text-[13px] text-foreground">
                Messages did not load.
              </p>
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
          ) : stream.length === 0 ? (
            <div className="flex flex-col gap-1 px-4 pt-6">
              <p className="text-sm font-semibold">
                This is the start of {titleOf(current)}
              </p>
              <p className="text-[13px] text-ink-3">
                {current.topic ?? "Say hello."}
              </p>
            </div>
          ) : (
            <ol
              role="list"
              aria-describedby={hintId}
              className="flex flex-col px-1 pt-2 pb-3 @min-[40rem]:px-2"
            >
              {stream.map((m, i) => {
                const prev = stream[i - 1];
                const newDay =
                  !prev || dayIndex(prev.at, off) !== dayIndex(m.at, off);
                const startsRun =
                  newDay ||
                  !prev ||
                  prev.author !== m.author ||
                  m.at - prev.at > RUN_GAP;
                const p = personOf(m.author);
                const isParent = parent?.id === m.id;
                const showBar = hot === m.id || picker?.id === m.id;
                const fresh = !startIds.has(m.id);
                return (
                  <motion.li
                    key={m.id}
                    className={cn(
                      "group/team-chat-msg relative",
                      startsRun ? d.run : "",
                    )}
                    initial={
                      fresh
                        ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                        : false
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      motionSafe
                        ? {
                            ...springs.snap,
                            opacity: { duration: durations.base },
                          }
                        : { duration: durations.fast }
                    }
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") setHot(m.id);
                    }}
                    onPointerDown={(event) => {
                      if (event.pointerType !== "mouse") setHot(m.id);
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType !== "mouse") return;
                      setHot((h) =>
                        h === m.id && picker?.id !== m.id ? null : h,
                      );
                    }}
                    onFocus={(event) => {
                      // The keyboard's focus opens the actions; focus put
                      // back after a tap does not.
                      if (event.target.matches(":focus-visible")) setHot(m.id);
                    }}
                    onBlur={(event) => {
                      const to = event.relatedTarget;
                      if (
                        to instanceof Node &&
                        event.currentTarget.contains(to)
                      )
                        return;
                      setHot((h) => (h === m.id ? null : h));
                    }}
                  >
                    {newDay ? (
                      <div className="flex items-center gap-3 px-3 pt-2 pb-1">
                        <span className="h-px flex-1 bg-hairline" />
                        <h3 className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
                          {dayLabel(m.at, nowMs, off)}
                        </h3>
                        <span className="h-px flex-1 bg-hairline" />
                      </div>
                    ) : null}
                    <article
                      ref={(node) => {
                        if (node) articles.current.set(m.id, node);
                        else articles.current.delete(m.id);
                      }}
                      tabIndex={m.id === roving ? 0 : -1}
                      aria-label={`${p.name}, ${clock(m.at, off)}${m.pinned ? ", pinned" : ""}`}
                      aria-describedby={`${idBase}-t-${m.id}`}
                      onFocus={(event) => {
                        if (event.target === event.currentTarget)
                          setFocusMsg(m.id);
                      }}
                      onKeyDown={(event) => onArticleKey(event, m, stream)}
                      className={cn(
                        "relative grid grid-cols-[auto_minmax(0,1fr)] rounded-2 px-2 transition-colors",
                        d.gutter,
                        d.row,
                        isParent
                          ? "bg-[color-mix(in_oklab,var(--accent-bright)_9%,transparent)]"
                          : "hover:bg-surface-1",
                        FOCUS_IN,
                      )}
                    >
                      {isParent ? (
                        <motion.span
                          aria-hidden
                          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-cobalt-bright"
                          style={{ originY: 0 }}
                          initial={{ scaleY: motionSafe ? 0 : 1, opacity: 0 }}
                          animate={{ scaleY: 1, opacity: 1 }}
                          transition={
                            motionSafe
                              ? {
                                  ...springs.glide,
                                  opacity: { duration: durations.fast },
                                }
                              : { duration: durations.fast }
                          }
                        />
                      ) : null}
                      <span
                        className="row-span-3 flex justify-center"
                        style={{ width: d.avatar }}
                      >
                        {startsRun ? (
                          <Avatar
                            person={p}
                            tint={tintFor(p.id)}
                            size={d.avatar}
                            show={presence}
                            className={d.inline ? "mt-0.5" : "mt-0.5"}
                          />
                        ) : (
                          <span
                            aria-hidden
                            className="pt-1 font-mono text-[10px] leading-4 text-ink-3 tabular-nums opacity-0 group-hover/team-chat-msg:opacity-100"
                          >
                            {d.avatar >= 32 ? clock(m.at, off) : ""}
                          </span>
                        )}
                      </span>
                      <AnimatePresence initial={false}>
                        {m.pinned ? (
                          <motion.p
                            key="pin"
                            className="col-start-2 flex items-center gap-1 overflow-hidden text-[11px] text-warn"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{
                              height: 0,
                              opacity: 0,
                              transition: exitFor(durations.fast),
                            }}
                            transition={
                              motionSafe
                                ? {
                                    ...springs.glide,
                                    opacity: { duration: durations.fast },
                                  }
                                : { duration: 0 }
                            }
                          >
                            <Pin aria-hidden className="size-3 shrink-0" />
                            Pinned
                          </motion.p>
                        ) : null}
                      </AnimatePresence>
                      <div className={cn("col-start-2 min-w-0", d.body)}>
                        {startsRun && !d.inline ? (
                          <p className="leading-5">{header(m, false)}</p>
                        ) : null}
                        <p
                          id={`${idBase}-t-${m.id}`}
                          className="break-words text-foreground"
                        >
                          {startsRun && d.inline ? header(m, true) : null}
                          <RichText text={m.text} meName={meName} />
                        </p>
                        {reactionsRow(m, d.inline)}
                        {threadSummary(m)}
                      </div>
                      <AnimatePresence>
                        {showBar && status === "ready" ? actionBar(m) : null}
                      </AnimatePresence>
                    </article>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="relative border-t border-hairline px-2 pt-2 pb-2 @min-[40rem]:px-3">
          <AnimatePresence>
            {typingText ? (
              <motion.p
                key="typing"
                className="pointer-events-none absolute bottom-full left-3 mb-1.5 inline-flex h-6 max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full border border-hairline bg-card px-2.5 text-[11px] text-ink-3 shadow-[0_2px_8px_color-mix(in_oklab,black_8%,transparent)]"
                initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? { ...springs.snap, opacity: { duration: durations.fast } }
                    : { duration: durations.fast }
                }
              >
                <span
                  aria-hidden
                  className="flex shrink-0 items-center gap-0.5"
                >
                  {[0, 1, 2].map((k) => (
                    <motion.span
                      key={k}
                      className="size-1 rounded-full bg-ink-3"
                      animate={
                        dotsLive
                          ? { opacity: [0.25, 1, 0.25] }
                          : { opacity: 0.7 }
                      }
                      transition={
                        dotsLive
                          ? {
                              duration: 1.1,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: k * 0.16,
                            }
                          : { duration: 0 }
                      }
                    />
                  ))}
                </span>
                <span className="truncate">{typingText}</span>
              </motion.p>
            ) : null}
          </AnimatePresence>
          <Composer
            label={`Message ${titleOf(current)}`}
            placeholder={`Message ${titleOf(current)}`}
            disabled={disabled || status !== "ready"}
            motionSafe={motionSafe}
            onSend={(text, by) => send(text, undefined, by)}
          />
        </div>
      </section>
    );
  };

  const threadPane = (
    p: ChatMessage,
    variant: "dock" | "overlay" | "screen",
  ) => {
    const replies = repliesOf.get(p.id) ?? [];
    const author = personOf(p.author);
    const ch = channelList.find((c) => c.id === p.channel);
    const on = followed.includes(p.id);
    const step = cascade(replies.length);
    const body = (m: ChatMessage, top: boolean) => {
      const who = personOf(m.author);
      return (
        <div
          className={cn(
            "grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 rounded-2 px-2 py-1.5",
            top && "pb-2",
          )}
        >
          <Avatar
            person={who}
            tint={tintFor(who.id)}
            size={top ? 32 : 28}
            show={presence}
            className="row-span-2 mt-0.5"
          />
          <p className="leading-5">{header(m, false)}</p>
          <div className="col-start-2 min-w-0 text-[13px] leading-5">
            <p className="break-words text-foreground">
              <RichText text={m.text} meName={meName} />
            </p>
            {reactionsRow(m)}
          </div>
        </div>
      );
    };
    return (
      <section
        aria-labelledby={threadHeadId}
        className="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] bg-card"
      >
        <header className="flex h-14 items-center gap-2 border-b border-hairline px-2 @min-[40rem]:px-3">
          {variant === "screen" ? (
            <button
              type="button"
              aria-label={`Back to ${ch ? titleOf(ch) : "the channel"}`}
              onClick={(event) => back(event.currentTarget)}
              className={TOOL}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2
              id={threadHeadId}
              tabIndex={-1}
              className="truncate text-sm font-semibold outline-none"
            >
              Thread
            </h2>
            <p className="truncate text-xs text-ink-3">
              {ch ? titleOf(ch) : ""} · {author.name}
            </p>
          </div>
          <FollowKnot
            size="sm"
            label="Follow"
            pressedLabel="Following"
            releaseLabel="Unfollow"
            target="thread"
            pressed={on}
            onPressedChange={(v) => setFollow(p.id, v)}
            sound={sound}
            disabled={disabled || status !== "ready"}
          />
          {variant !== "screen" ? (
            <button
              type="button"
              aria-label="Close thread"
              onClick={(event) => closeThread(event.currentTarget)}
              className={TOOL}
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </header>
        <div
          ref={threadScroll}
          className="[scrollbar-width:thin] overflow-y-auto overscroll-contain px-1 py-2"
        >
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe
                ? { ...springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
          >
            {body(p, true)}
          </motion.div>
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="text-[11px] text-ink-3">
              {replies.length
                ? plural(replies.length, "reply", "replies")
                : "No replies yet"}
            </span>
            <span className="h-px flex-1 bg-hairline" />
          </div>
          <ol role="list" aria-label="Replies" className="flex flex-col">
            {replies.map((m, i) => {
              const fresh = !startIds.has(m.id);
              return (
                <motion.li
                  key={`${p.id}-${m.id}`}
                  initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    motionSafe
                      ? {
                          ...springs.snap,
                          delay: fresh ? 0 : 0.06 + i * step,
                          opacity: {
                            duration: durations.base,
                            delay: fresh ? 0 : 0.06 + i * step,
                          },
                        }
                      : { duration: durations.fast }
                  }
                >
                  {body(m, false)}
                </motion.li>
              );
            })}
          </ol>
        </div>
        <div className="border-t border-hairline px-2 pt-2 pb-2 @min-[40rem]:px-3">
          <Composer
            label="Reply in thread"
            placeholder="Reply…"
            disabled={disabled || status !== "ready"}
            motionSafe={motionSafe}
            onSend={(text, by) => send(text, p.id, by)}
          />
        </div>
      </section>
    );
  };

  /* ------------------------------ the layout ---------------------------- */

  const overlayOpen = !phone && layout === "overlay" && !!parent;

  const wide = (
    <div className="flex h-full">
      <motion.div
        inert={overlayOpen || undefined}
        className="@container/tcside h-full shrink-0 overflow-hidden border-r border-hairline bg-surface-1"
        initial={false}
        animate={{ width: sideW }}
        transition={motionSafe ? springs.glide : { duration: 0 }}
      >
        {channelsPane("side")}
      </motion.div>
      <div className="relative h-full min-w-0 flex-1">
        {layout === "full" ? (
          <>
            <StackScreen
              index={0}
              depth={depth}
              level={level}
              motionSafe={motionSafe}
            >
              {streamPane()}
            </StackScreen>
            <StackScreen
              index={1}
              depth={depth}
              level={level}
              motionSafe={motionSafe}
            >
              {shownParent ? threadPane(shownParent, "screen") : null}
            </StackScreen>
            {level > 0 && motionSafe ? (
              <EdgeBack
                width={W - sideW}
                level={level}
                depth={depth}
                onGrab={() => depthAnim.current?.stop()}
                onBack={() => back(null)}
              />
            ) : null}
          </>
        ) : (
          <div inert={overlayOpen || undefined} className="h-full">
            {streamPane()}
          </div>
        )}
        {layout === "overlay" ? (
          <AnimatePresence>
            {parent ? (
              <motion.div
                key="scrim"
                aria-hidden
                className="absolute inset-0 z-20 bg-[color-mix(in_oklab,black_28%,transparent)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: exitFor(durations.base) }}
                transition={{ duration: durations.base, ease: easings.enter }}
                onPointerDown={() => closeThread(null)}
              />
            ) : null}
            {parent ? (
              <motion.div
                key="panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={threadHeadId}
                onKeyDown={trap}
                className="absolute inset-y-0 right-0 z-30 border-l border-hairline-strong bg-card shadow-[0_0_36px_color-mix(in_oklab,black_20%,transparent)]"
                style={{ width: overlayW }}
                initial={motionSafe ? { x: "100%" } : { opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={
                  motionSafe
                    ? { x: "100%", transition: exitFor(durations.base) }
                    : { opacity: 0, transition: exitFor(durations.fast) }
                }
                transition={
                  motionSafe ? springs.glide : { duration: durations.fast }
                }
              >
                {threadPane(parent, "overlay")}
              </motion.div>
            ) : null}
          </AnimatePresence>
        ) : null}
      </div>
      {layout === "dock" ? (
        <AnimatePresence initial={false}>
          {parent ? (
            <motion.aside
              key="dock"
              aria-label="Thread"
              className="flex h-full shrink-0 justify-end overflow-hidden border-l border-hairline"
              initial={motionSafe ? { width: 0 } : { width: dockW, opacity: 0 }}
              animate={{ width: dockW, opacity: 1 }}
              exit={
                motionSafe
                  ? { width: 0, transition: exitFor(durations.base) }
                  : { opacity: 0, transition: exitFor(durations.fast) }
              }
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              <div className="h-full shrink-0" style={{ width: dockW }}>
                {threadPane(parent, "dock")}
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      ) : null}
    </div>
  );

  const narrow = (
    <div className="relative h-full">
      <StackScreen
        index={0}
        depth={depth}
        level={level}
        motionSafe={motionSafe}
      >
        {channelsPane("screen")}
      </StackScreen>
      <StackScreen
        index={1}
        depth={depth}
        level={level}
        motionSafe={motionSafe}
      >
        {streamPane()}
      </StackScreen>
      <StackScreen
        index={2}
        depth={depth}
        level={level}
        motionSafe={motionSafe}
      >
        {shownParent ? threadPane(shownParent, "screen") : null}
      </StackScreen>
      {level > 0 && motionSafe ? (
        <EdgeBack
          width={W}
          level={level}
          depth={depth}
          onGrab={() => depthAnim.current?.stop()}
          onBack={() => back(null)}
        />
      ) : null}
    </div>
  );

  return (
    <div
      ref={(node) => {
        rootRef.current = node;
        setRoot(node);
      }}
      role="region"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.defaultPrevented) return;
        if (event.key === "Escape") {
          if (picker) {
            event.preventDefault();
            closePicker(true);
            return;
          }
          const inThread =
            event.target instanceof Element &&
            !!event.target.closest(`[aria-labelledby="${threadHeadId}"]`);
          if (parent && (layout !== "dock" || inThread)) {
            event.preventDefault();
            closeThread(null);
            return;
          }
          if (phone && level > 0) {
            event.preventDefault();
            back(null);
          }
          return;
        }
        if (!event.altKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          stepChannel(event.key === "ArrowDown" ? 1 : -1);
        } else if (event.key === "ArrowLeft" && canBack) {
          event.preventDefault();
          back(null);
        }
      }}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      {phone ? narrow : wide}
      <p id={hintId} className="sr-only">
        Up and Down move between messages, Enter opens a message&apos;s thread,
        Tab reaches its actions. Alt+Up and Alt+Down switch channel.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
