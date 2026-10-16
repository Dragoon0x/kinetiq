"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  Check,
  CircleHelp,
  Heart,
  Lightbulb,
  Pause,
  Play,
  Reply,
  RotateCcw,
  ThumbsUp,
  TriangleAlert,
  Video,
  type LucideIcon,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  distances,
  durations,
  easings,
  exitFor,
  springs,
} from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ClipReactionKind = "agree" | "love" | "idea" | "question";
export type ClipScene = "flow" | "settings" | "empty" | "pricing" | "mobile";

export type ClipSegment = {
  /** Where the line starts, in seconds into the clip. */
  at: number;
  text: string;
};

export type ClipReaction = {
  kind: ClipReactionKind;
  count: number;
  /** The viewer's own reaction is among them. */
  mine?: boolean;
  /** Moments (seconds) people reacted at, drawn on the track. */
  marks?: number[];
};

export type ClipThreadClip = {
  id: string;
  author: string;
  role?: string;
  /** When it was recorded, in ms since the epoch. */
  at: number;
  /** Length in seconds. */
  duration: number;
  title?: string;
  /** What the procedural screen share shows. @default "flow" */
  scene?: ClipScene;
  transcript: ClipSegment[];
  reactions?: ClipReaction[];
  /** The clip this one answers. */
  replyTo?: string;
  /** 0 to 1 while the clip is still processing; omit when it is ready. */
  processing?: number;
};

export type ClipThumbShape = "wide" | "square" | "round";
export type ClipDensity = "compact" | "regular" | "roomy";
export type ClipStatus = "ready" | "loading" | "error";

export type ClipThreadProps = {
  /** The thread, oldest first. @default defaultClips */
  clips?: ClipThreadClip[];
  /** Controlled selected clip id. */
  selected?: string;
  /** Initial selected clip when uncontrolled. @default the first ready clip */
  defaultSelected?: string;
  /** Fires from the strip, or an auto-advance, that changed the clip. */
  onSelectedChange?: (clipId: string) => void;
  /** Controlled playback. */
  playing?: boolean;
  /** Initial playback when uncontrolled. @default false */
  defaultPlaying?: boolean;
  /** Fires from the press, key or end of clip that started or stopped playback. */
  onPlayingChange?: (playing: boolean) => void;
  /** "Record" was pressed. Add the new clip (with `processing`) to `clips`. */
  onRecord?: () => void;
  /** "Reply with a clip" was pressed on a clip. */
  onReply?: (clipId: string) => void;
  /** A reaction was toggled at a moment of the clip (seconds). */
  onReact?: (
    clipId: string,
    kind: ClipReactionKind,
    at: number,
    on: boolean,
  ) => void;
  /** The moment relative times count from, in ms (never read from the clock). @default defaultClipNow */
  now?: number;
  /** The thread's heading. @default "Onboarding flow review" */
  title?: string;
  /** Seconds the arrow keys skip. @default 5 */
  skip?: number;
  /** Play the next ready clip when one ends. @default true */
  autoAdvance?: boolean;
  /** Where in a clip its poster frame sits, 0 to 1. @default 0.3 */
  posterAt?: number;
  /** Strip thumbnails: 16:9 cards, squares, or circular video notes. @default "wide" */
  thumbShape?: ClipThumbShape;
  /** Strip card size, transcript type and gaps. @default "regular" */
  density?: ClipDensity;
  /** Word capsule, playhead, fill, markers and the chosen card — any CSS colour. @default "var(--accent-bright)" */
  accent?: string;
  /** Whether the thread has loaded. @default "ready" */
  status?: ClipStatus;
  /** "Try again" was pressed after the thread failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the parts scroll inside it. @default 540 */
  height?: number;
  /** Watch only: no recording, replying or reacting. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** A fixed afternoon, so relative times render the same everywhere. */
export const defaultClipNow = Date.UTC(2026, 9, 15, 15, 0);
const N = defaultClipNow;

export const defaultClips: ClipThreadClip[] = [
  {
    id: "k1",
    author: "Ana Reyes",
    role: "Design lead",
    at: N - 5 * 60 * MIN,
    duration: 36,
    title: "New onboarding flow",
    scene: "flow",
    transcript: [
      {
        at: 0,
        text: "Here's the new onboarding flow: three steps instead of five.",
      },
      { at: 7, text: "Step one asks for the workspace name and nothing else." },
      { at: 14, text: "Step two is invites, and you can skip it." },
      {
        at: 21,
        text: "The last step picks a template, with a preview beside it.",
      },
      { at: 30, text: "Tell me what still feels slow." },
    ],
    reactions: [
      { kind: "agree", count: 3, marks: [9, 24] },
      { kind: "love", count: 1, marks: [4] },
      { kind: "idea", count: 0 },
      { kind: "question", count: 1, marks: [16] },
    ],
  },
  {
    id: "k2",
    author: "Tomas Brandt",
    role: "Engineering",
    at: N - 4 * 60 * MIN,
    duration: 24,
    title: "Invites in the background",
    scene: "settings",
    replyTo: "k1",
    transcript: [
      { at: 0, text: "Step two worries me a little." },
      {
        at: 5,
        text: "Invites wait on the mail service, which can lag on a new workspace.",
      },
      {
        at: 13,
        text: "Could we send them in the background and let people move on?",
      },
      { at: 20, text: "Otherwise this looks great." },
    ],
    reactions: [
      { kind: "agree", count: 2, marks: [15] },
      { kind: "love", count: 0 },
      { kind: "idea", count: 1, marks: [14] },
      { kind: "question", count: 0 },
    ],
  },
  {
    id: "k3",
    author: "Priya Raman",
    role: "Research",
    at: N - 3 * 60 * MIN,
    duration: 30,
    title: "Empty board first",
    scene: "empty",
    replyTo: "k1",
    transcript: [
      {
        at: 0,
        text: "From the last round of interviews: people skipped templates.",
      },
      { at: 8, text: "They wanted an empty board first and templates later." },
      {
        at: 16,
        text: "Maybe the third step offers both, with empty as the default.",
      },
      { at: 25, text: "I can share the session recordings." },
    ],
    reactions: [
      { kind: "agree", count: 4, marks: [10, 18] },
      { kind: "love", count: 2, marks: [12] },
      { kind: "idea", count: 1, marks: [17] },
      { kind: "question", count: 0 },
    ],
  },
  {
    id: "k4",
    author: "Kenji Ito",
    role: "Product",
    at: N - 90 * MIN,
    duration: 19,
    title: "Plans can wait",
    scene: "pricing",
    transcript: [
      { at: 0, text: "Quick one on the plan picker." },
      { at: 4, text: "Let's keep it out of onboarding entirely." },
      { at: 10, text: "Billing can wait until the second week." },
      { at: 15, text: "And agreed with Priya on empty first." },
    ],
    reactions: [
      { kind: "agree", count: 1, marks: [7] },
      { kind: "love", count: 0 },
      { kind: "idea", count: 0 },
      { kind: "question", count: 0 },
    ],
  },
  {
    id: "k5",
    author: "Ana Reyes",
    role: "Design lead",
    at: N - 6 * MIN,
    duration: 27,
    title: "Flow, take two",
    scene: "mobile",
    replyTo: "k3",
    processing: 0.62,
    transcript: [
      { at: 0, text: "Take two, with the empty board as the default." },
      { at: 8, text: "Templates move to a panel you can open any time." },
      { at: 17, text: "And invites now send in the background." },
    ],
    reactions: [],
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";

const REACTIONS: { kind: ClipReactionKind; label: string; Icon: LucideIcon }[] =
  [
    { kind: "agree", label: "Agree", Icon: ThumbsUp },
    { kind: "love", label: "Love", Icon: Heart },
    { kind: "idea", label: "Idea", Icon: Lightbulb },
    { kind: "question", label: "Question", Icon: CircleHelp },
  ];

const DENSITY: Record<
  ClipDensity,
  { thumb: number; text: string; gap: string; seg: string }
> = {
  compact: {
    thumb: 52,
    text: "text-[12px] leading-5",
    gap: "gap-2",
    seg: "px-2 py-1",
  },
  regular: {
    thumb: 60,
    text: "text-[13px] leading-[22px]",
    gap: "gap-3",
    seg: "px-2 py-1.5",
  },
  roomy: {
    thumb: 72,
    text: "text-[14px] leading-6",
    gap: "gap-3",
    seg: "px-2.5 py-2",
  },
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${r3(clamp(v, 0, 1) * 100)}%`;
const easeInOut = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

/** m:ss, floored: the clock a player shows. */
const clock = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

function ago(at: number, now: number): string {
  const m = Math.max(0, Math.round((now - at) / MIN));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");

const plural = (n: number, one: string, other: string) =>
  `${n} ${n === 1 ? one : other}`;

/** FNV-1a, unsigned. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};

type Word = { text: string; start: number; seg: number };

/**
 * Times every word: a line's span (to the next line, or the end) is shared
 * among its words by length, so long words take longer, as speech does.
 */
function timeWords(clip: ClipThreadClip): Word[] {
  const out: Word[] = [];
  const lines = [...clip.transcript].sort((a, b) => a.at - b.at);
  lines.forEach((line, seg) => {
    const end = lines[seg + 1]?.at ?? clip.duration;
    const words = line.text.split(/\s+/).filter(Boolean);
    const weights = words.map((w) => w.length + 2);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const span = Math.max(0.5, (end - line.at) * 0.92);
    let t = line.at;
    words.forEach((text, i) => {
      out.push({ text, start: r3(t), seg });
      t += (span * (weights[i] ?? 1)) / total;
    });
  });
  return out;
}

/** The last word whose start has passed, or -1 before the first. */
const wordAt = (words: Word[], t: number) => {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((words[mid]?.start ?? 0) <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
};

/* ----------------------------------------------------------------------- */
/*                               Frame artwork                              */
/* ----------------------------------------------------------------------- */

type Box = { x: number; y: number; w: number; h: number };
type SceneArt = {
  /** Muted blocks of the screen being shared. */
  blocks: Box[];
  /** Lines of text, as thin bars. */
  lines: Box[];
  /** Accent-filled elements: a primary button, a chosen card. */
  accents: Box[];
  /** What the speaker points at, visited in turn line by line. */
  targets: Box[];
};

/** Five small screens of a Fernworks app, in a 320 × 180 frame. */
const SCENES: Record<ClipScene, SceneArt> = {
  flow: {
    blocks: [
      { x: 28, y: 56, w: 78, h: 70 },
      { x: 121, y: 56, w: 78, h: 70 },
      { x: 214, y: 56, w: 78, h: 70 },
    ],
    lines: [
      { x: 28, y: 36, w: 96, h: 6 },
      { x: 36, y: 66, w: 40, h: 4 },
      { x: 36, y: 76, w: 56, h: 3 },
      { x: 129, y: 66, w: 40, h: 4 },
      { x: 129, y: 76, w: 52, h: 3 },
      { x: 222, y: 66, w: 40, h: 4 },
      { x: 222, y: 76, w: 58, h: 3 },
    ],
    accents: [{ x: 230, y: 138, w: 62, h: 16 }],
    targets: [
      { x: 28, y: 56, w: 78, h: 70 },
      { x: 28, y: 56, w: 78, h: 70 },
      { x: 121, y: 56, w: 78, h: 70 },
      { x: 214, y: 56, w: 78, h: 70 },
      { x: 230, y: 138, w: 62, h: 16 },
    ],
  },
  settings: {
    blocks: [
      { x: 10, y: 24, w: 62, h: 146 },
      { x: 88, y: 50, w: 200, h: 16 },
      { x: 88, y: 84, w: 200, h: 16 },
      { x: 88, y: 116, w: 28, h: 14 },
    ],
    lines: [
      { x: 18, y: 36, w: 40, h: 4 },
      { x: 18, y: 48, w: 34, h: 4 },
      { x: 18, y: 60, w: 44, h: 4 },
      { x: 18, y: 72, w: 30, h: 4 },
      { x: 88, y: 40, w: 50, h: 4 },
      { x: 88, y: 74, w: 64, h: 4 },
      { x: 124, y: 120, w: 70, h: 4 },
    ],
    accents: [{ x: 228, y: 144, w: 60, h: 16 }],
    targets: [
      { x: 88, y: 50, w: 200, h: 16 },
      { x: 88, y: 84, w: 200, h: 16 },
      { x: 88, y: 116, w: 106, h: 14 },
      { x: 228, y: 144, w: 60, h: 16 },
    ],
  },
  empty: {
    blocks: [{ x: 128, y: 44, w: 64, h: 52 }],
    lines: [
      { x: 118, y: 106, w: 84, h: 5 },
      { x: 126, y: 116, w: 68, h: 3 },
      { x: 236, y: 34, w: 52, h: 4 },
    ],
    accents: [{ x: 130, y: 130, w: 60, h: 16 }],
    targets: [
      { x: 228, y: 28, w: 66, h: 16 },
      { x: 128, y: 44, w: 64, h: 52 },
      { x: 130, y: 130, w: 60, h: 16 },
      { x: 118, y: 102, w: 84, h: 18 },
    ],
  },
  pricing: {
    blocks: [
      { x: 30, y: 52, w: 78, h: 102 },
      { x: 121, y: 46, w: 78, h: 112 },
      { x: 212, y: 52, w: 78, h: 102 },
    ],
    lines: [
      { x: 130, y: 32, w: 60, h: 6 },
      { x: 40, y: 64, w: 30, h: 4 },
      { x: 40, y: 76, w: 46, h: 8 },
      { x: 131, y: 58, w: 30, h: 4 },
      { x: 131, y: 70, w: 46, h: 8 },
      { x: 222, y: 64, w: 30, h: 4 },
      { x: 222, y: 76, w: 46, h: 8 },
    ],
    accents: [{ x: 131, y: 134, w: 58, h: 14 }],
    targets: [
      { x: 121, y: 46, w: 78, h: 112 },
      { x: 30, y: 52, w: 78, h: 102 },
      { x: 212, y: 52, w: 78, h: 102 },
      { x: 131, y: 134, w: 58, h: 14 },
    ],
  },
  mobile: {
    blocks: [
      { x: 124, y: 30, w: 72, h: 136 },
      { x: 132, y: 52, w: 56, h: 18 },
      { x: 132, y: 76, w: 56, h: 18 },
      { x: 132, y: 100, w: 56, h: 18 },
    ],
    lines: [
      { x: 132, y: 40, w: 32, h: 4 },
      { x: 30, y: 60, w: 70, h: 5 },
      { x: 30, y: 72, w: 56, h: 3 },
      { x: 220, y: 60, w: 70, h: 5 },
      { x: 220, y: 72, w: 50, h: 3 },
    ],
    accents: [{ x: 172, y: 142, w: 16, h: 16 }],
    targets: [
      { x: 132, y: 52, w: 56, h: 18 },
      { x: 132, y: 100, w: 56, h: 18 },
      { x: 172, y: 142, w: 16, h: 16 },
    ],
  },
};

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Which target a moment points at, and how far the cursor has travelled there. */
function pointer(
  starts: number[],
  duration: number,
  targets: Box[],
  t: number,
) {
  let seg = 0;
  for (let i = 0; i < starts.length; i += 1) {
    if ((starts[i] ?? 0) <= t) seg = i;
  }
  const n = Math.max(1, targets.length);
  const target = targets[seg % n] ?? { x: 160, y: 90, w: 0, h: 0 };
  const from =
    seg === 0
      ? { x: 160, y: 96, w: 0, h: 0 }
      : (targets[(seg - 1) % n] ?? target);
  const start = starts[seg] ?? 0;
  const end = starts[seg + 1] ?? duration;
  const travel = Math.min(1.2, (end - start) * 0.35);
  const p = clamp((t - start) / Math.max(0.01, travel), 0, 1);
  return { seg: seg % n, target, from, p, settled: (t - start - travel) / 0.3 };
}

function FrameArt({
  clip,
  time,
  uid,
}: {
  clip: ClipThreadClip;
  time: MotionValue<number>;
  uid: string;
}) {
  const art = SCENES[clip.scene ?? "flow"];
  const starts = React.useMemo(
    () => [...clip.transcript].map((l) => l.at).sort((a, b) => a - b),
    [clip.transcript],
  );
  const where = React.useCallback(
    (t: number) => pointer(starts, clip.duration, art.targets, t),
    [starts, clip.duration, art.targets],
  );
  const cursorX = useTransform(time, (t) => {
    const { from, target, p } = where(t);
    const a = centre(from);
    const b = centre(target);
    const e = easeInOut(p);
    return r2(a.x + (b.x - a.x) * e + Math.sin(p * Math.PI) * 6);
  });
  const cursorY = useTransform(time, (t) => {
    const { from, target, p } = where(t);
    const a = centre(from);
    const b = centre(target);
    const e = easeInOut(p);
    return r2(a.y + (b.y - a.y) * e - Math.sin(p * Math.PI) * 10);
  });
  const hue = hash(clip.author) % 360;
  const clipId = `${uid}-frame-${clip.id}`;

  return (
    <svg
      aria-hidden
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 size-full"
    >
      <defs>
        <clipPath id={clipId}>
          <rect x="10" y="10" width="300" height="160" rx="6" />
        </clipPath>
      </defs>
      <rect width="320" height="180" className="fill-surface-2" />
      <g clipPath={`url(#${clipId})`}>
        <rect x="10" y="10" width="300" height="160" className="fill-card" />
        <rect
          x="10"
          y="10"
          width="300"
          height="14"
          className="fill-surface-1"
        />
        <circle cx="19" cy="17" r="2" className="fill-hairline-strong" />
        <circle cx="26" cy="17" r="2" className="fill-hairline-strong" />
        <circle cx="33" cy="17" r="2" className="fill-hairline-strong" />
        <text
          x="160"
          y="20"
          textAnchor="middle"
          className="fill-ink-3 font-sans"
          style={{ fontSize: 6.5 }}
        >
          {clip.title ?? "Fernworks"}
        </text>
        {art.blocks.map((b, i) => (
          <rect
            key={`b${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="4"
            className="fill-surface-2 stroke-hairline-strong"
            strokeWidth="0.75"
          />
        ))}
        {art.lines.map((b, i) => (
          <rect
            key={`l${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={b.h / 2}
            className="fill-ink-3"
            opacity="0.45"
          />
        ))}
        {art.accents.map((b, i) => (
          <rect
            key={`a${i}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="4"
            fill="var(--ct-button)"
          />
        ))}
        {art.targets.map((b, i) => (
          <TargetRing
            key={`t${i}`}
            box={b}
            index={i % Math.max(1, art.targets.length)}
            time={time}
            where={where}
          />
        ))}
        <motion.g style={{ x: cursorX, y: cursorY }}>
          <path
            d="M0 0 L0 11 L3 8.4 L5.2 13 L7.2 12.1 L5 7.6 L8.8 7.6 Z"
            className="fill-foreground stroke-card"
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
        </motion.g>
        <circle
          cx="290"
          cy="150"
          r="15"
          fill={`oklch(0.66 0.11 ${hue})`}
          className="stroke-card"
          strokeWidth="2"
        />
        <text
          x="290"
          y="153"
          textAnchor="middle"
          fill="white"
          className="font-sans"
          style={{ fontSize: 9, fontWeight: 600 }}
        >
          {initials(clip.author)}
        </text>
      </g>
    </svg>
  );
}

function TargetRing({
  box,
  index,
  time,
  where,
}: {
  box: Box;
  index: number;
  time: MotionValue<number>;
  where: (t: number) => { seg: number; settled: number };
}) {
  const opacity = useTransform(time, (t) => {
    const w = where(t);
    return w.seg === index ? r2(clamp(w.settled, 0, 1)) : 0;
  });
  return (
    <motion.rect
      x={box.x - 3}
      y={box.y - 3}
      width={box.w + 6}
      height={box.h + 6}
      rx="6"
      fill="none"
      stroke="var(--ct-accent)"
      strokeWidth="1.5"
      style={{ opacity }}
    />
  );
}

/* ----------------------------------------------------------------------- */
/*                                Small parts                               */
/* ----------------------------------------------------------------------- */

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

function StripCard({
  clip,
  selected,
  focused,
  shape,
  size,
  posterAt,
  now,
  uid,
  replyName,
  ready,
  motionSafe,
  onChoose,
  onFocusCard,
  register,
}: {
  clip: ClipThreadClip;
  selected: boolean;
  focused: boolean;
  shape: ClipThumbShape;
  size: number;
  posterAt: number;
  now: number;
  uid: string;
  replyName?: string;
  ready: boolean;
  motionSafe: boolean;
  onChoose: (id: string) => void;
  onFocusCard: (id: string) => void;
  register: (id: string, node: HTMLDivElement | null) => void;
}) {
  const poster = r3(clip.duration * posterAt);
  const preview = useMotionValue(poster);
  const scrubX = useMotionValue(0);
  const scrubOpacity = useMotionValue(0);
  const chip = useTransform(preview, (t) => clock(t));
  const chipLeft = useTransform(scrubX, (x) => `${r3(x * 100)}%`);
  const back = React.useRef<AnimationPlaybackControls | null>(null);
  const processing = clip.processing !== undefined;
  const w = shape === "wide" ? Math.round(size * (16 / 9)) : size;
  const h = size;
  const total = (clip.reactions ?? []).reduce((a, r) => a + r.count, 0);
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => register(clip.id, node),
    [clip.id, register],
  );
  React.useEffect(() => () => back.current?.stop(), []);

  return (
    <div
      ref={ref}
      role="option"
      id={`${uid}-opt-${clip.id}`}
      aria-selected={selected}
      aria-disabled={processing || undefined}
      aria-label={`${clip.author}, ${clip.title ?? "clip"}, ${clock(clip.duration)}${processing ? `, processing ${Math.round((clip.processing ?? 0) * 100)}%` : ""}${replyName ? `, reply to ${replyName}` : ""}`}
      tabIndex={focused ? 0 : -1}
      onClick={() => onChoose(clip.id)}
      onFocus={() => onFocusCard(clip.id)}
      className={cn(
        "group/clip-thread-card flex shrink-0 cursor-pointer flex-col gap-1.5 rounded-3 p-1.5 transition-colors select-none",
        selected ? "bg-surface-2" : "hover:bg-surface-2",
        processing && "cursor-default",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
      )}
      style={{ width: Math.max(w, 72) + 12 }}
    >
      <div
        className={cn(
          "relative mx-auto overflow-hidden bg-surface-2",
          shape === "round" ? "rounded-full" : "rounded-2",
          selected
            ? "ring-2 ring-[var(--ct-accent)] ring-offset-1 ring-offset-card"
            : "ring-1 ring-hairline",
        )}
        style={{ width: w, height: h }}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse" || processing) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const f = clamp((event.clientX - rect.left) / rect.width, 0, 1);
          back.current?.stop();
          preview.set(r3(f * clip.duration));
          scrubX.set(r3(f));
          scrubOpacity.set(1);
        }}
        onPointerLeave={() => {
          back.current?.stop();
          scrubOpacity.set(0);
          back.current = animate(preview, poster, {
            duration: motionSafe ? durations.base : 0,
            ease: easings.enter,
          });
        }}
      >
        <div
          className="absolute inset-0 transition-[filter] duration-500"
          style={{ filter: processing ? "blur(3px) saturate(0.6)" : "none" }}
        >
          <FrameArt clip={clip} time={preview} uid={`${uid}-s`} />
        </div>
        {processing ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[color-mix(in_oklab,var(--card)_45%,transparent)]">
            <svg aria-hidden viewBox="0 0 36 36" className="size-9 -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                strokeWidth="3"
                className="stroke-hairline-strong"
              />
              <motion.circle
                cx="18"
                cy="18"
                r="14"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                stroke="var(--ct-accent)"
                initial={false}
                animate={{ pathLength: clamp(clip.processing ?? 0, 0, 1) }}
                transition={{ duration: durations.slow, ease: easings.enter }}
              />
            </svg>
            <span className="absolute font-mono text-[9px] font-semibold text-foreground tabular-nums">
              {Math.round((clip.processing ?? 0) * 100)}
            </span>
          </div>
        ) : null}
        <AnimatePresence>
          {ready ? (
            <motion.span
              key="ready"
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 1 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: durations.slow } }}
            >
              <motion.span
                className="flex size-7 items-center justify-center rounded-full bg-[var(--ct-button)] text-white shadow-md"
                initial={motionSafe ? { scale: 0.6 } : false}
                animate={{ scale: 1 }}
                transition={springs.flick}
              >
                <Check aria-hidden className="size-4" strokeWidth={2.6} />
              </motion.span>
            </motion.span>
          ) : null}
        </AnimatePresence>
        {!processing ? (
          <>
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-[var(--ct-accent)]"
              style={{ left: chipLeft, opacity: scrubOpacity }}
            />
            <motion.span
              aria-hidden
              className={cn(
                "pointer-events-none absolute rounded-1 bg-[color-mix(in_oklab,var(--card)_85%,transparent)] px-1 font-mono text-[9px] text-foreground tabular-nums",
                shape === "round"
                  ? "bottom-2 left-1/2 -translate-x-1/2"
                  : "bottom-1 left-1",
              )}
              style={{ opacity: scrubOpacity }}
            >
              {chip}
            </motion.span>
            <span
              aria-hidden
              className={cn(
                "absolute rounded-1 bg-[color-mix(in_oklab,var(--card)_85%,transparent)] px-1 font-mono text-[9px] text-ink-2 tabular-nums group-hover/clip-thread-card:opacity-0",
                shape === "round"
                  ? "bottom-2 left-1/2 -translate-x-1/2"
                  : "right-1 bottom-1",
              )}
            >
              {clock(clip.duration)}
            </span>
          </>
        ) : null}
      </div>
      <div className="min-w-0 px-0.5">
        <p className="truncate text-[11px] font-medium text-foreground">
          {clip.author.split(" ")[0]}
        </p>
        <p className="truncate text-[10px] text-ink-3">
          {processing
            ? "Processing"
            : replyName
              ? `↳ ${replyName}`
              : total > 0
                ? plural(total, "reaction", "reactions")
                : ago(clip.at, now)}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                 Component                                */
/* ----------------------------------------------------------------------- */

/**
 * An asynchronous video thread you can skim. Every clip is a procedural
 * screen share drawn in SVG from one time motion value — the cursor glides
 * between what the speaker points at and rings it — so scrubbing a strip
 * thumbnail with the pointer moves the picture at frame rate, without a
 * render. The chosen clip plays in the frame; its track fills linearly (a
 * spring would overshoot the present) and carries everyone's reactions.
 *
 * While it plays, the transcript lights up word by word: a soft capsule
 * glides from word to word on `springs.flick` and across a line break on
 * `springs.snap`, spoken words settle to ink and the rest wait in grey; any
 * word can be clicked to jump there. The active word is React state only when
 * it changes, a few times a second. Reactions land on `springs.recoil`, a
 * finished clip's ring closes into a tick on `springs.snap`, and choosing a
 * clip slides the frame in from the side it came from on `springs.glide`.
 */
export function ClipThread({
  clips = defaultClips,
  selected,
  defaultSelected,
  onSelectedChange,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  onRecord,
  onReply,
  onReact,
  now = defaultClipNow,
  title = "Onboarding flow review",
  skip = 5,
  autoAdvance = true,
  posterAt = 0.3,
  thumbShape = "wide",
  density = "regular",
  accent = "var(--accent-bright)",
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: ClipThreadProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, "");
  const titleId = `${uid}-title`;
  const d = DENSITY[density];

  const readyClips = clips.filter((c) => c.processing === undefined);
  const [ownSelected, setOwnSelected] = React.useState<string | undefined>(
    () => defaultSelected ?? readyClips[0]?.id,
  );
  const currentId = selected ?? ownSelected ?? readyClips[0]?.id;
  const clip = clips.find((c) => c.id === currentId) ?? readyClips[0];
  const duration = clip?.duration ?? 1;

  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = (playing ?? ownPlaying) && Boolean(clip);

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  /* ------------------------------- clock --------------------------------- */

  const time = useMotionValue(0);
  const run = React.useRef<AnimationPlaybackControls | null>(null);
  const words = React.useMemo(() => (clip ? timeWords(clip) : []), [clip]);
  const [active, setActive] = React.useState(-1);
  const [second, setSecond] = React.useState(0);
  const activeRef = React.useRef(-1);
  const secondRef = React.useRef(0);

  useMotionValueEvent(time, "change", (t) => {
    // At the very start nothing has been said yet, even though the first
    // word starts at zero: a fresh clip shows its transcript unlit.
    const i = t < 0.005 ? -1 : wordAt(words, t);
    if (i !== activeRef.current) {
      activeRef.current = i;
      setActive(i);
    }
    const s = Math.floor(t);
    if (s !== secondRef.current) {
      secondRef.current = s;
      setSecond(s);
    }
  });

  const readout = useTransform(time, (t) => `${clock(t)} / ${clock(duration)}`);
  const fill = useTransform(time, (t) => pct(t / duration));

  const setPlay = (on: boolean) => {
    if (playing === undefined) setOwnPlaying(on);
    onPlayingChange?.(on);
  };

  const select = React.useCallback(
    (id: string) => {
      if (selected === undefined) setOwnSelected(id);
      onSelectedChange?.(id);
    },
    [onSelectedChange, selected],
  );

  const [seekCount, setSeekCount] = React.useState(0);
  const [dir, setDir] = React.useState<1 | -1>(1);

  // What happens when a clip plays out: the next ready one, or a stop. Kept
  // current every render so the running clock never calls a stale host.
  const ended = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    ended.current = () => {
      const at = clips.findIndex((c) => c.id === clip?.id);
      const next = autoAdvance
        ? clips.find((c, i) => i > at && c.processing === undefined)
        : undefined;
      if (next) {
        setDir(1);
        select(next.id);
      } else {
        if (playing === undefined) setOwnPlaying(false);
        onPlayingChange?.(false);
      }
    };
  });

  // The clock runs only while playing: one linear run to the end of the clip,
  // restarted on play, on a new clip and after every seek. A new clip starts
  // from its beginning.
  const shownId = React.useRef<string | undefined>(clip?.id);
  const wasPlaying = React.useRef(false);
  const clipKey = clip?.id;
  React.useEffect(() => {
    if (shownId.current !== clipKey) {
      shownId.current = clipKey;
      time.jump(0);
    }
    if (!isPlaying || !clipKey) {
      wasPlaying.current = false;
      return;
    }
    const justStarted = !wasPlaying.current;
    wasPlaying.current = true;
    let from = time.get();
    if (from >= duration - 0.05) {
      // Play at the end starts over; a seek to the end while playing ends it.
      if (justStarted) from = 0;
      else {
        const raf = requestAnimationFrame(() => ended.current());
        return () => cancelAnimationFrame(raf);
      }
    }
    if (from !== time.get()) time.jump(from);
    const controls = animate(time, duration, {
      duration: Math.max(0.05, duration - from),
      ease: "linear",
      onComplete: () => ended.current(),
    });
    run.current = controls;
    return () => controls.stop();
  }, [isPlaying, clipKey, duration, seekCount, time]);

  const seek = (t: number, keepPlaying = isPlaying) => {
    const at = r3(clamp(t, 0, duration));
    run.current?.stop();
    time.jump(at);
    setSeekCount((n) => n + 1);
    if (keepPlaying && !isPlaying) setPlay(true);
  };

  const choose = (id: string) => {
    const target = clips.find((c) => c.id === id);
    if (!target || target.processing !== undefined) return;
    if (id === clip?.id) {
      setPlay(!isPlaying);
      return;
    }
    const from = clips.findIndex((c) => c.id === clip?.id);
    const to = clips.findIndex((c) => c.id === id);
    setDir(to >= from ? 1 : -1);
    select(id);
    if (!isPlaying) setPlay(true);
    say(`Playing ${target.author}: ${target.title ?? "clip"}.`);
  };

  /* --------------------------- processing done --------------------------- */

  const [readyFlash, setReadyFlash] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const processingIds = React.useRef(
    new Set(clips.filter((c) => c.processing !== undefined).map((c) => c.id)),
  );
  React.useEffect(() => {
    const done: string[] = [];
    for (const c of clips) {
      if (c.processing !== undefined) processingIds.current.add(c.id);
      else if (processingIds.current.has(c.id)) {
        processingIds.current.delete(c.id);
        done.push(c.id);
      }
    }
    if (!done.length) return;
    const raf = requestAnimationFrame(() => {
      setReadyFlash((s) => new Set([...s, ...done]));
      const names = done
        .map((id) => clips.find((c) => c.id === id)?.author.split(" ")[0])
        .filter(Boolean);
      setSaid((s) => ({
        n: s.n + 1,
        text: `${names.join(" and ")}'s clip is ready.`,
      }));
    });
    const t = window.setTimeout(
      () =>
        setReadyFlash((s) => {
          const next = new Set(s);
          for (const id of done) next.delete(id);
          return next;
        }),
      1600,
    );
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
  }, [clips]);

  /* ------------------------------ reactions ------------------------------ */

  const [mine, setMine] = React.useState<Record<string, boolean>>({});
  const [myMarks, setMyMarks] = React.useState<
    { clip: string; kind: ClipReactionKind; at: number }[]
  >([]);
  const [pops, setPops] = React.useState<Record<string, number>>({});

  const reaction = (kind: ClipReactionKind) => {
    const base = clip?.reactions?.find((r) => r.kind === kind);
    const key = `${clip?.id}:${kind}`;
    const on = mine[key] ?? base?.mine ?? false;
    const count = (base?.count ?? 0) - (base?.mine ? 1 : 0) + (on ? 1 : 0);
    return { on, count, key, base };
  };

  const toggleReaction = (kind: ClipReactionKind) => {
    if (!clip || disabled) return;
    const r = reaction(kind);
    const next = !r.on;
    const at = r3(time.get());
    setMine((m) => ({ ...m, [r.key]: next }));
    setPops((p) => ({ ...p, [r.key]: (p[r.key] ?? 0) + 1 }));
    if (next) setMyMarks((list) => [...list, { clip: clip.id, kind, at }]);
    else
      setMyMarks((list) =>
        list.filter((m) => !(m.clip === clip.id && m.kind === kind)),
      );
    onReact?.(clip.id, kind, at, next);
    const label = REACTIONS.find((x) => x.kind === kind)?.label ?? kind;
    say(next ? `${label} at ${clock(at)}.` : `${label} removed.`);
  };

  const marks: { kind: ClipReactionKind; at: number; mine: boolean }[] = [];
  for (const r of clip?.reactions ?? []) {
    for (const at of r.marks ?? [])
      marks.push({ kind: r.kind, at, mine: false });
  }
  for (const m of myMarks) {
    if (m.clip === clip?.id) marks.push({ kind: m.kind, at: m.at, mine: true });
  }

  /* ------------------------------ transcript ----------------------------- */

  const listRef = React.useRef<HTMLOListElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const wordRefs = React.useRef(new Map<number, HTMLSpanElement>());
  const segRefs = React.useRef(new Map<number, HTMLButtonElement>());
  const [segFocus, setSegFocus] = React.useState(0);
  const [capsule, setCapsule] = React.useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    line: number;
  } | null>(null);
  const readingUntil = React.useRef(0);
  const transcriptRun = React.useRef<AnimationPlaybackControls | null>(null);
  const activeSeg = words[active]?.seg ?? -1;

  // The capsule follows the word once the word is laid out.
  React.useLayoutEffect(() => {
    const node = wordRefs.current.get(active);
    const next = node
      ? {
          x: node.offsetLeft - 3,
          y: node.offsetTop - 1,
          w: node.offsetWidth + 6,
          h: node.offsetHeight + 2,
          line: node.offsetTop,
        }
      : null;
    const raf = requestAnimationFrame(() => setCapsule(next));
    return () => cancelAnimationFrame(raf);
  }, [active, clipKey, density]);

  // Keep the spoken line in view unless the reader is looking elsewhere.
  React.useEffect(() => {
    const el = scrollerRef.current;
    const seg = segRefs.current.get(activeSeg);
    if (!el || !seg || performance.now() < readingUntil.current) return;
    const top = seg.offsetTop - 8;
    const bottom = seg.offsetTop + seg.offsetHeight + 8;
    let target = el.scrollTop;
    if (top < el.scrollTop) target = top;
    else if (bottom > el.scrollTop + el.clientHeight)
      target = bottom - el.clientHeight;
    if (Math.abs(target - el.scrollTop) < 1) return;
    transcriptRun.current?.stop();
    if (!motionSafe) {
      el.scrollTop = target;
      return;
    }
    transcriptRun.current = animate(el.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        el.scrollTop = v;
      },
    });
  }, [activeSeg, motionSafe]);

  React.useEffect(
    () => () => {
      run.current?.stop();
      transcriptRun.current?.stop();
    },
    [],
  );

  /* ------------------------------ the track ------------------------------ */

  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const resumeAfter = React.useRef(false);
  const fractionAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };
  const drag = useDrag({
    axis: "x",
    threshold: 2,
    disabled: !clip,
    onStart: () => {
      resumeAfter.current = isPlaying;
      run.current?.stop();
      if (isPlaying) setPlay(false);
    },
    onMove: ({ point }) => {
      time.set(r3(fractionAt(point.x) * duration));
    },
    onEnd: ({ point }) => {
      seek(fractionAt(point.x) * duration, resumeAfter.current);
    },
    onCancel: () => {
      if (resumeAfter.current) setPlay(true);
    },
    onTap: (event) => seek(fractionAt(event.clientX) * duration),
  });

  const onSeekKey = (event: React.KeyboardEvent) => {
    const t = time.get();
    const step = (s: number) => {
      event.preventDefault();
      seek(t + s);
      say(`${clock(clamp(t + s, 0, duration))} of ${clock(duration)}.`);
    };
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        step(-skip);
        break;
      case "ArrowRight":
      case "ArrowUp":
        step(skip);
        break;
      case "PageDown":
        step(-skip * 2);
        break;
      case "PageUp":
        step(skip * 2);
        break;
      case "Home":
        step(-t);
        break;
      case "End":
        step(duration - t);
        break;
      case " ":
        event.preventDefault();
        togglePlay();
        break;
      default:
        break;
    }
  };

  const togglePlay = () => {
    if (!clip) return;
    const next = !isPlaying;
    setPlay(next);
    say(next ? `Playing ${clip.author}.` : `Paused at ${clock(time.get())}.`);
  };

  /* ------------------------------- the strip ----------------------------- */

  const cardRefs = React.useRef(new Map<string, HTMLDivElement>());
  const register = React.useCallback(
    (id: string, node: HTMLDivElement | null) => {
      if (node) cardRefs.current.set(id, node);
      else cardRefs.current.delete(id);
    },
    [],
  );
  const [stripFocus, setStripFocus] = React.useState<string | undefined>(
    undefined,
  );
  const focusId =
    stripFocus && clips.some((c) => c.id === stripFocus)
      ? stripFocus
      : clip?.id;

  const onStripKey = (event: React.KeyboardEvent) => {
    const at = clips.findIndex((c) => c.id === focusId);
    let next = -1;
    if (event.key === "ArrowRight") next = Math.min(clips.length - 1, at + 1);
    else if (event.key === "ArrowLeft") next = Math.max(0, at - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = clips.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (focusId) choose(focusId);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    const id = clips[next]?.id;
    if (!id) return;
    setStripFocus(id);
    const node = cardRefs.current.get(id);
    node?.focus({ preventScroll: true });
    node?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  /* -------------------------------- render ------------------------------- */

  const processingCount = clips.filter(
    (c) => c.processing !== undefined,
  ).length;
  const names = (id?: string) =>
    id ? clips.find((c) => c.id === id)?.author.split(" ")[0] : undefined;

  const header = (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-4 py-3">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2"
      >
        <Video className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-36">
        <p
          id={titleId}
          title={title}
          className="truncate text-sm font-semibold"
        >
          {title}
        </p>
        <p className="truncate text-[11px] text-ink-3">
          Fernworks · {plural(clips.length, "clip", "clips")}
          {processingCount ? ` · ${processingCount} processing` : ""}
        </p>
      </div>
      {disabled ? null : (
        <button
          type="button"
          onClick={() => {
            onRecord?.();
            say("Recording a new clip.");
          }}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-3 text-[12px] text-foreground transition-colors hover:bg-surface-2",
            FOCUS_RING,
          )}
        >
          <span
            aria-hidden
            className="size-2 rounded-full bg-[oklch(from_var(--danger)_0.62_c_h)]"
          />
          <span className="sr-only @min-[30rem]/clip-thread:not-sr-only">
            Record
          </span>
        </button>
      )}
    </header>
  );

  const frame = clip ? (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-label={`${isPlaying ? "Pause" : "Play"} ${clip.author}: ${clip.title ?? "clip"}`}
        onClick={togglePlay}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            seek(time.get() + (event.key === "ArrowLeft" ? -skip : skip));
          }
        }}
        className={cn(
          "group/clip-thread-frame relative aspect-video w-full overflow-hidden rounded-3 border border-hairline bg-surface-2",
          FOCUS_RING,
        )}
      >
        <AnimatePresence initial={false}>
          <motion.div
            key={clip.id}
            className="absolute inset-0"
            initial={
              motionSafe
                ? { opacity: 0, x: dir * distances.shift }
                : { opacity: 0 }
            }
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? { x: springs.glide, opacity: { duration: durations.base } }
                : { duration: durations.fast }
            }
          >
            <FrameArt clip={clip} time={time} uid={safeUid} />
          </motion.div>
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {!isPlaying ? (
            <motion.span
              key="play"
              aria-hidden
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={{ duration: durations.fast }}
            >
              <motion.span
                className="flex size-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--card)_88%,transparent)] text-foreground shadow-md"
                initial={motionSafe ? { scale: 0.85 } : false}
                animate={{ scale: 1 }}
                transition={springs.snap}
              >
                <Play className="size-5 translate-x-px" />
              </motion.span>
            </motion.span>
          ) : null}
        </AnimatePresence>
        <span className="absolute bottom-2 left-2 rounded-1 bg-[color-mix(in_oklab,var(--card)_85%,transparent)] px-1.5 py-0.5 text-[10px] text-foreground">
          {clip.author} · {ago(clip.at, now)}
        </span>
      </button>

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          onClick={togglePlay}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--ct-button)] text-white",
            FOCUS_RING,
          )}
        >
          {isPlaying ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5 translate-x-px" />
          )}
        </button>
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={`Seek in ${clip.author}'s clip`}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.min(second, Math.round(duration))}
          aria-valuetext={`${clock(second)} of ${clock(duration)}`}
          onKeyDown={onSeekKey}
          {...drag}
          className={cn(
            "relative h-7 min-w-0 flex-1 cursor-pointer touch-pan-y rounded-2",
            FOCUS_RING,
          )}
        >
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-2" />
          <motion.span
            className="absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full bg-[var(--ct-accent)]"
            style={{ width: fill }}
          />
          <motion.span
            aria-hidden
            className="absolute top-1/2 -ml-1.5 size-3 -translate-y-1/2 rounded-full border-2 border-card bg-[var(--ct-accent)] shadow-sm"
            style={{ left: fill }}
          />
          {marks.map((m, i) => {
            const meta = REACTIONS.find((r) => r.kind === m.kind);
            if (!meta) return null;
            return (
              <motion.span
                key={`${m.kind}-${m.at}-${i}`}
                aria-hidden
                className={cn(
                  "absolute top-0 -ml-1.5 flex size-3 items-center justify-center rounded-full",
                  m.mine
                    ? "bg-[var(--ct-button)] text-white"
                    : "bg-surface-2 text-ink-2",
                )}
                style={{ left: pct(m.at / duration) }}
                initial={m.mine && motionSafe ? { scale: 0, y: -4 } : false}
                animate={{ scale: 1, y: 0 }}
                transition={springs.recoil}
              >
                <meta.Icon className="size-2" strokeWidth={2.6} />
              </motion.span>
            );
          })}
        </div>
        <motion.span
          aria-hidden
          className="shrink-0 font-mono text-[11px] text-ink-2 tabular-nums"
        >
          {readout}
        </motion.span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {REACTIONS.map(({ kind, label, Icon }) => {
          const r = reaction(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={r.on}
              aria-label={`${label}, ${r.count}`}
              disabled={disabled}
              onClick={() => toggleReaction(kind)}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors disabled:opacity-60",
                r.on
                  ? "border-[color-mix(in_oklab,var(--ct-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--ct-accent)_12%,transparent)] text-[var(--ct-ink)]"
                  : "border-hairline text-ink-2 hover:bg-surface-2",
                FOCUS_RING,
              )}
            >
              <motion.span
                key={pops[r.key] ?? 0}
                aria-hidden
                className="inline-flex"
                initial={
                  (pops[r.key] ?? 0) > 0 && motionSafe ? { scale: 0.55 } : false
                }
                animate={{ scale: 1 }}
                transition={springs.recoil}
              >
                <Icon className="size-3.5" />
              </motion.span>
              <RollingCount value={r.count} motionSafe={motionSafe} />
            </button>
          );
        })}
        {disabled ? null : (
          <button
            type="button"
            onClick={() => {
              onReply?.(clip.id);
              say(`Replying to ${clip.author}.`);
            }}
            className={cn(
              "ml-auto inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline px-2.5 text-[11px] text-foreground transition-colors hover:bg-surface-2",
              FOCUS_RING,
            )}
          >
            <Reply aria-hidden className="size-3.5" />
            Reply with a clip
          </button>
        )}
      </div>
    </div>
  ) : (
    <div className="flex aspect-video w-full flex-col items-center-safe justify-center-safe gap-1 rounded-3 border border-dashed border-hairline-strong text-center">
      <p className="text-sm text-foreground">No clips yet.</p>
      <p className="text-[12px] text-ink-3">Record the first one.</p>
    </div>
  );

  const transcript = clip ? (
    <div className="flex flex-col @min-[44rem]/clip-thread:overflow-hidden">
      <p className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
        <span className="font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase">
          Transcript
        </span>
        <span className="truncate text-[11px] text-ink-3">
          {clip.author}
          {clip.role ? ` · ${clip.role}` : ""}
        </span>
      </p>
      <div
        ref={scrollerRef}
        onWheel={() => {
          readingUntil.current = performance.now() + 3000;
        }}
        onTouchMove={() => {
          readingUntil.current = performance.now() + 3000;
        }}
        className="relative max-h-36 [scrollbar-width:thin] overflow-y-auto overscroll-contain @min-[44rem]/clip-thread:max-h-none @min-[44rem]/clip-thread:flex-1"
      >
        <ol
          ref={listRef}
          role="list"
          aria-label={`Transcript of ${clip.author}'s clip`}
          className={cn("relative flex flex-col pb-1", d.text)}
        >
          <AnimatePresence>
            {capsule && active >= 0 ? (
              <motion.span
                key={clip.id}
                aria-hidden
                className="pointer-events-none absolute top-0 left-0 rounded-1 bg-[color-mix(in_oklab,var(--ct-accent)_20%,transparent)]"
                initial={{
                  opacity: 0,
                  x: capsule.x,
                  y: capsule.y,
                  width: capsule.w,
                  height: capsule.h,
                }}
                animate={{
                  opacity: 1,
                  x: capsule.x,
                  y: capsule.y,
                  width: capsule.w,
                  height: capsule.h,
                }}
                exit={{ opacity: 0, transition: exitFor(durations.fast) }}
                transition={
                  motionSafe
                    ? {
                        x: springs.flick,
                        y: springs.snap,
                        width: springs.flick,
                        height: springs.flick,
                        opacity: { duration: durations.fast },
                      }
                    : { duration: 0 }
                }
              />
            ) : null}
          </AnimatePresence>
          {[...clip.transcript]
            .sort((a, b) => a.at - b.at)
            .map((line, seg) => (
              <li key={`${clip.id}-${seg}`}>
                <button
                  ref={(node) => {
                    if (node) segRefs.current.set(seg, node);
                    else segRefs.current.delete(seg);
                  }}
                  type="button"
                  tabIndex={seg === segFocus ? 0 : -1}
                  aria-label={`${clock(line.at)}: ${line.text}`}
                  aria-current={seg === activeSeg ? "true" : undefined}
                  onFocus={() => setSegFocus(seg)}
                  onClick={(event) => {
                    const w = (
                      event.target as HTMLElement
                    ).closest<HTMLElement>("[data-ct-w]");
                    const index = w ? Number(w.dataset.ctW) : -1;
                    const at =
                      event.detail !== 0 && index >= 0
                        ? (words[index]?.start ?? line.at)
                        : line.at;
                    seek(at + 0.01, true);
                    say(`Jumped to ${clock(at)}.`);
                  }}
                  onKeyDown={(event) => {
                    const count = clip.transcript.length;
                    let next = -1;
                    if (event.key === "ArrowDown")
                      next = Math.min(count - 1, seg + 1);
                    else if (event.key === "ArrowUp")
                      next = Math.max(0, seg - 1);
                    else if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = count - 1;
                    if (next < 0) return;
                    event.preventDefault();
                    readingUntil.current = performance.now() + 3000;
                    setSegFocus(next);
                    segRefs.current.get(next)?.focus();
                  }}
                  className={cn(
                    "flex w-full gap-2 rounded-2 text-left",
                    d.seg,
                    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-[3px] shrink-0 font-mono text-[10px] tabular-nums",
                      seg === activeSeg ? "text-[var(--ct-ink)]" : "text-ink-3",
                    )}
                  >
                    {clock(line.at)}
                  </span>
                  <span aria-hidden className="min-w-0">
                    {words.map((w, i) =>
                      w.seg === seg ? (
                        <React.Fragment key={i}>
                          <span
                            ref={(node) => {
                              if (node) wordRefs.current.set(i, node);
                              else wordRefs.current.delete(i);
                            }}
                            data-ct-w={i}
                            className={cn(
                              "relative cursor-pointer transition-colors duration-150 hover:underline hover:decoration-[var(--ct-accent)] hover:underline-offset-2",
                              active < 0
                                ? "text-ink-2"
                                : i < active
                                  ? "text-foreground"
                                  : i === active
                                    ? cn(
                                        "text-[var(--ct-ink)]",
                                        !motionSafe &&
                                          "underline decoration-[var(--ct-accent)] underline-offset-2",
                                      )
                                    : "text-ink-3",
                            )}
                          >
                            {w.text}
                          </span>{" "}
                        </React.Fragment>
                      ) : null,
                    )}
                  </span>
                </button>
              </li>
            ))}
        </ol>
      </div>
    </div>
  ) : null;

  const strip = (
    <div className="relative shrink-0 border-t border-hairline">
      <div
        role="listbox"
        aria-orientation="horizontal"
        aria-label="Clips in this thread"
        onKeyDown={onStripKey}
        className={cn(
          "flex [scrollbar-width:thin] overflow-x-auto overscroll-x-contain px-3 py-2",
          "[mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)]",
          d.gap,
        )}
      >
        {clips.map((c) => (
          <StripCard
            key={c.id}
            clip={c}
            selected={c.id === clip?.id}
            focused={c.id === focusId}
            shape={thumbShape}
            size={d.thumb}
            posterAt={posterAt}
            now={now}
            uid={safeUid}
            replyName={names(c.replyTo)}
            ready={readyFlash.has(c.id)}
            motionSafe={motionSafe}
            onChoose={choose}
            onFocusCard={setStripFocus}
            register={register}
          />
        ))}
      </div>
    </div>
  );

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      onKeyDown={(event) => {
        if (event.key !== " ") return;
        const target = event.target as HTMLElement;
        if (
          target.closest(
            "button, input, textarea, [role=slider], [role=option], [role=listbox]",
          )
        )
          return;
        event.preventDefault();
        togglePlay();
      }}
      className={cn(
        "@container/clip-thread flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        className,
      )}
      style={{
        height,
        ["--ct-accent" as string]: `oklch(from ${accent} 0.62 c h)`,
        ["--ct-button" as string]: `oklch(from ${accent} 0.54 c h)`,
        ["--ct-ink" as string]:
          "color-mix(in oklab, var(--ct-accent) 72%, var(--foreground))",
      }}
    >
      {header}
      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">
            This thread didn&apos;t load.
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
        <div aria-hidden className="flex flex-1 flex-col gap-3 p-4">
          <div
            className={cn(
              "aspect-video w-full max-w-md rounded-3 bg-surface-2",
              motionSafe && "animate-pulse",
            )}
          />
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-14 w-24 rounded-2 bg-surface-2",
                  motionSafe && "animate-pulse",
                )}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain p-3 @min-[44rem]/clip-thread:overflow-hidden">
            <div className="flex flex-col gap-3 @min-[44rem]/clip-thread:grid @min-[44rem]/clip-thread:h-full @min-[44rem]/clip-thread:grid-cols-[1.45fr_1fr] @min-[44rem]/clip-thread:grid-rows-[minmax(0,1fr)] @min-[44rem]/clip-thread:gap-4">
              {frame}
              {transcript}
            </div>
          </div>
          {strip}
        </>
      )}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </section>
  );
}
