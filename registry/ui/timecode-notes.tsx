"use client";

import * as React from "react";

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  AudioLines,
  Check,
  Film,
  Pause,
  Play,
  Plus,
  RotateCcw,
  TriangleAlert,
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
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type TimecodeScene = {
  /** Where the scene starts, in seconds. */
  at: number;
  /** What the scene is called, shown on the frame. */
  label: string;
};

export type TimecodeMedia = {
  title: string;
  kind: "video" | "audio";
  /** Length of the clip in seconds. */
  duration: number;
  /** Video: the scenes, in order. Drawn procedurally unless `renderFrame` is given. */
  scenes?: TimecodeScene[];
  /** Audio: the waveform, 0 to 1 per bar. Seeded when omitted. */
  peaks?: number[];
};

export type TimecodeNote = {
  id: string;
  /** The moment the note is about, in seconds into the clip. */
  at: number;
  author: string;
  text: string;
  /** When it was written, in ms since the epoch. */
  createdAt: number;
  resolved?: boolean;
};

export type TimecodeMarkerStyle = "tick" | "dot" | "avatar";
export type TimecodeDensity = "compact" | "regular" | "roomy";
export type TimecodeStatus = "ready" | "loading" | "error";

export type TimecodeNotesProps = {
  /** The clip under review. @default defaultTimecodeMedia */
  media?: TimecodeMedia;
  /** Controlled notes. */
  notes?: TimecodeNote[];
  /** Initial notes when uncontrolled. @default defaultTimecodeNotes */
  defaultNotes?: TimecodeNote[];
  /** Fires with every note after an add or a resolve. */
  onNotesChange?: (notes: TimecodeNote[]) => void;
  /** Controlled playhead, in seconds. A change of more than a second seeks. */
  time?: number;
  /** Initial playhead when uncontrolled, in seconds. @default 0 */
  defaultTime?: number;
  /** Fires on every seek and once a second while playing, with whole seconds. */
  onTimeChange?: (time: number) => void;
  /** Controlled playback. */
  playing?: boolean;
  /** Initial playback when uncontrolled. @default false */
  defaultPlaying?: boolean;
  /** Fires from the button, key or end of clip that started or stopped playback. */
  onPlayingChange?: (playing: boolean) => void;
  /** A note was added at the playhead. It is already in the list. */
  onAdd?: (note: TimecodeNote) => void;
  /** The playhead was moved by the visitor; `noteId` when a note was chosen. */
  onSeek?: (time: number, noteId?: string) => void;
  /** A note was resolved (true) or reopened (false). */
  onResolve?: (noteId: string, resolved: boolean) => void;
  /** Draw the frame yourself; called with whole seconds and on every seek. @default a procedural frame per scene */
  renderFrame?: (time: number, media: TimecodeMedia) => React.ReactNode;
  /** A hairline tick with a cap above the track, a dot on the track, or the author's initial on a stem. @default "tick" */
  markerStyle?: TimecodeMarkerStyle;
  /** List type and padding, control sizes. @default "regular" */
  density?: TimecodeDensity;
  /** Playhead, fill, markers and the current note's edge — any CSS colour; fills take its hue at a fixed lightness. @default "var(--accent-bright)" */
  accent?: string;
  /** How long a passed note stays risen over the frame, in ms. @default 2600 */
  holdMs?: number;
  /** The name new notes are written under. @default "Noor Haddad" */
  author?: string;
  /** The moment relative times count from (Date or ms). @default defaultTimecodeNow */
  now?: number | Date;
  /** The heading. @default media.title */
  title?: string;
  /** Whether the clip and its notes have arrived. @default "ready" */
  status?: TimecodeStatus;
  /** "Try again" was pressed after the clip failed to load. */
  onRetry?: () => void;
  /** The surface's height in px; the player and the notes scroll inside it. @default 540 */
  height?: number;
  /** Read only: notes can be read and the clip played, nothing added or resolved. @default false */
  disabled?: boolean;
  className?: string;
};

/* ----------------------------------------------------------------------- */
/*                              Seeded defaults                             */
/* ----------------------------------------------------------------------- */

const MIN = 60_000;

/** A fixed afternoon, so relative times render the same everywhere. */
export const defaultTimecodeNow = Date.UTC(2026, 9, 14, 16, 5);
const N = defaultTimecodeNow;

export const defaultTimecodeMedia: TimecodeMedia = {
  title: "Waylight onboarding cut · v3",
  kind: "video",
  duration: 84,
  scenes: [
    { at: 0, label: "Cold open" },
    { at: 14, label: "Sign in" },
    { at: 31, label: "First trip" },
    { at: 52, label: "Sharing" },
    { at: 70, label: "End card" },
  ],
};

export const defaultTimecodeNotes: TimecodeNote[] = [
  {
    id: "n1",
    at: 6.5,
    author: "Ines Marlow",
    text: "The logo sting lands two frames after the beat.",
    createdAt: N - 4 * 60 * MIN,
  },
  {
    id: "n2",
    at: 19,
    author: "Tomas Brandt",
    text: "The cursor jumps to the field. Ease it in.",
    createdAt: N - 3 * 60 * MIN,
  },
  {
    id: "n3",
    at: 21.5,
    author: "Priya Raman",
    text: "Caption sits on the keyboard here.",
    createdAt: N - 2 * 60 * MIN,
  },
  {
    id: "n4",
    at: 37,
    author: "Kenji Ito",
    text: "Hold the map a second longer before the route draws.",
    createdAt: N - 95 * MIN,
    resolved: true,
  },
  {
    id: "n5",
    at: 55,
    author: "Ines Marlow",
    text: "Use the share sheet from 2.4, not the old one.",
    createdAt: N - 40 * MIN,
  },
  {
    id: "n6",
    at: 73.5,
    author: "Tomas Brandt",
    text: "End card: “Plan less, go more” reads better.",
    createdAt: N - 9 * MIN,
  },
];

/* ----------------------------------------------------------------------- */
/*                                  Helpers                                 */
/* ----------------------------------------------------------------------- */

/** Markers closer than this on the track merge into a counted bubble. */
const CLUSTER_PX = 14;
/** A note stays "current" this many seconds after the playhead passes it. */
const CURRENT_S = 4;
/** Width the track is assumed to have before it is measured. */
const FALLBACK_TRACK = 440;

const FOCUS_RING =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";

const DENSITY: Record<
  TimecodeDensity,
  { text: string; pad: string; ctl: string; h: string; gap: string }
> = {
  compact: {
    text: "text-[12px] leading-[18px]",
    pad: "px-2.5 py-2",
    ctl: "size-7",
    h: "h-7",
    gap: "gap-2",
  },
  regular: {
    text: "text-[13px] leading-5",
    pad: "px-3 py-2.5",
    ctl: "size-8",
    h: "h-8",
    gap: "gap-3",
  },
  roomy: {
    text: "text-[13px] leading-[22px]",
    pad: "px-3.5 py-3",
    ctl: "size-9",
    h: "h-9",
    gap: "gap-3",
  },
};

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Number((v * 100).toFixed(3))}%`;
const toMs = (t: number | Date) => (typeof t === "number" ? t : t.getTime());

/** m:ss from seconds, floored: the clock a player shows. */
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

/** Ends a sentence once, whatever the quoted words already carry. */
const sentence = (text: string) => {
  const t = text.trim();
  return /[.!?”"]$/.test(t) ? t : `${t}.`;
};

/** A seeded waveform, so an audio clip without peaks still has a shape. */
function seededPeaks(count: number, seed: number): number[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out: number[] = [];
  let level = 0.4;
  for (let i = 0; i < count; i += 1) {
    level = clamp(level + (rand() - 0.5) * 0.35, 0.12, 1);
    const swell = 0.55 + 0.45 * Math.sin((i / count) * Math.PI);
    out.push(r3(clamp(level * swell * (0.7 + rand() * 0.3), 0.06, 1)));
  }
  return out;
}

type Cluster = { key: string; x: number; ids: string[] };

/** Greedy left-to-right merge of markers closer than CLUSTER_PX. */
function clusterNotes(
  sorted: TimecodeNote[],
  duration: number,
  width: number,
): Cluster[] {
  const out: Cluster[] = [];
  let run: { start: number; xs: number[]; ids: string[] } | null = null;
  const close = () => {
    if (!run) return;
    const mean = run.xs.reduce((a, b) => a + b, 0) / run.xs.length;
    out.push({ key: run.ids.join("+"), x: mean, ids: run.ids });
    run = null;
  };
  for (const n of sorted) {
    const x = (clamp(n.at, 0, duration) / duration) * width;
    if (run && x - run.start < CLUSTER_PX) {
      run.xs.push(x);
      run.ids.push(n.id);
    } else {
      close();
      run = { start: x, xs: [x], ids: [n.id] };
    }
  }
  close();
  return out;
}

/* ----------------------------------------------------------------------- */
/*                               Frame artwork                              */
/* ----------------------------------------------------------------------- */

const ease = (p: number) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);

/**
 * Five small compositions for the default clip, each moved by `p` — how far
 * the playhead is through its scene — so scrubbing moves the picture as a
 * real frame would. Every per-frame number is rounded.
 */
function SceneArt({
  index,
  p,
  idBase,
}: {
  index: number;
  p: MotionValue<number>;
  idBase: string;
}) {
  const sunY = useTransform(p, (v) => r1(140 - ease(v) * 46));
  const mark = useTransform(p, (v) => r3(clamp((v - 0.3) / 0.3, 0, 1)));
  const typed = useTransform(p, (v) => r1(4 + ease(v * 1.4) * 58));
  const cursorX = useTransform(p, (v) => r1(64 + ease(v * 1.6) * 92));
  const cursorY = useTransform(p, (v) => r1(150 - ease(v * 1.6) * 68));
  const route = useTransform(p, (v) => r1(ease(v * 1.15) * 320));
  const sheet = useTransform(p, (v) => r1((1 - ease(v * 1.5)) * 90));
  const card = useTransform(p, (v) => r3(0.35 + ease(v * 1.6) * 0.65));
  const clip = `${idBase}-route`;
  const sky = `${idBase}-sky`;

  if (index === 0) {
    return (
      <svg aria-hidden viewBox="0 0 320 180" className="block size-full">
        <defs>
          <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0"
              style={{
                stopColor:
                  "color-mix(in oklab, var(--accent-bright) 45%, var(--bg-0))",
              }}
            />
            <stop
              offset="1"
              style={{
                stopColor: "color-mix(in oklab, var(--warn) 55%, var(--bg-1))",
              }}
            />
          </linearGradient>
        </defs>
        <rect width="320" height="180" fill={`url(#${sky})`} />
        <motion.circle
          cx={236}
          cy={sunY}
          r={22}
          style={{ fill: "oklch(from var(--warn) 0.84 0.12 h)" }}
        />
        <path
          d="M0 140 C 60 118 120 128 170 134 S 270 118 320 126 V 180 H 0 Z"
          style={{ fill: "oklch(from var(--signal) 0.5 0.08 h)" }}
        />
        <path
          d="M0 156 C 80 144 160 152 220 150 S 290 144 320 148 V 180 H 0 Z"
          style={{ fill: "oklch(from var(--signal) 0.38 0.06 h)" }}
        />
        <motion.text
          x={160}
          y={66}
          textAnchor="middle"
          fontSize={24}
          fontWeight={650}
          letterSpacing={0.5}
          className="fill-white"
          style={{ opacity: mark }}
        >
          Waylight
        </motion.text>
      </svg>
    );
  }
  if (index === 1) {
    return (
      <svg aria-hidden viewBox="0 0 320 180" className="block size-full">
        <rect
          width="320"
          height="180"
          style={{
            fill: "color-mix(in oklab, var(--accent-bright) 16%, var(--bg-1))",
          }}
        />
        <rect
          x="108"
          y="14"
          width="104"
          height="176"
          rx="14"
          className="fill-card stroke-hairline-strong"
        />
        <text
          x="120"
          y="48"
          fontSize="10"
          fontWeight="650"
          className="fill-foreground"
        >
          Welcome back
        </text>
        <rect
          x="120"
          y="62"
          width="80"
          height="18"
          rx="4"
          className="fill-surface-2"
        />
        <motion.rect
          x={124}
          y={69}
          height={4}
          rx={2}
          width={typed}
          className="fill-ink-3"
        />
        <rect
          x="120"
          y="88"
          width="80"
          height="18"
          rx="4"
          className="fill-surface-2"
        />
        <rect
          x="120"
          y="118"
          width="80"
          height="20"
          rx="5"
          style={{ fill: "oklch(from var(--accent-bright) 0.55 0.15 h)" }}
        />
        <text
          x="160"
          y="131"
          textAnchor="middle"
          fontSize="8"
          fontWeight="650"
          className="fill-white"
        >
          Continue
        </text>
        <motion.g style={{ x: cursorX, y: cursorY }}>
          <path
            d="M0 0 L0 13 L3.6 9.6 L6.4 15.6 L8.6 14.6 L5.8 8.8 L10.4 8.4 Z"
            strokeWidth="1"
            strokeLinejoin="round"
            className="fill-foreground stroke-card"
          />
        </motion.g>
      </svg>
    );
  }
  if (index === 2) {
    return (
      <svg aria-hidden viewBox="0 0 320 180" className="block size-full">
        <defs>
          <clipPath id={clip}>
            <motion.rect x={0} y={0} height={180} width={route} />
          </clipPath>
        </defs>
        <rect
          width="320"
          height="180"
          style={{
            fill: "color-mix(in oklab, var(--signal) 14%, var(--bg-1))",
          }}
        />
        {[
          "M-10 40 C 80 52 160 30 330 48",
          "M-10 112 C 90 100 200 128 330 104",
          "M60 -10 C 70 60 50 120 74 190",
          "M200 -10 C 190 70 230 120 214 190",
          "M260 -10 C 270 60 250 140 280 190",
        ].map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            className="stroke-surface-1"
          />
        ))}
        <path
          d="M40 150 C 90 140 110 96 150 92 S 220 64 262 52"
          fill="none"
          strokeWidth="3"
          strokeDasharray="1 6"
          strokeLinecap="round"
          className="stroke-ink-3"
        />
        <path
          d="M40 150 C 90 140 110 96 150 92 S 220 64 262 52"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          clipPath={`url(#${clip})`}
          style={{ stroke: "oklch(from var(--accent-bright) 0.58 0.17 h)" }}
        />
        <circle
          cx="40"
          cy="150"
          r="5"
          className="fill-card stroke-ink-2"
          strokeWidth="2"
        />
        <path
          d="M262 52 c -7 -9 -11 -13 -11 -19 a 11 11 0 0 1 22 0 c 0 6 -4 10 -11 19 Z"
          style={{ fill: "oklch(from var(--danger) 0.6 0.17 h)" }}
        />
        <circle cx="262" cy="33" r="4" className="fill-white" />
      </svg>
    );
  }
  if (index === 3) {
    return (
      <svg aria-hidden viewBox="0 0 320 180" className="block size-full">
        <rect
          width="320"
          height="180"
          style={{
            fill: "color-mix(in oklab, var(--accent-bright) 8%, var(--bg-1))",
          }}
        />
        <rect
          x="70"
          y="16"
          width="180"
          height="96"
          rx="10"
          style={{ fill: "color-mix(in oklab, var(--warn) 45%, var(--bg-1))" }}
        />
        <path
          d="M70 92 C 120 74 170 86 250 70 V 102 a 10 10 0 0 1 -10 10 H 80 a 10 10 0 0 1 -10 -10 Z"
          style={{ fill: "oklch(from var(--signal) 0.52 0.08 h)" }}
        />
        <motion.g style={{ y: sheet }}>
          <rect
            x="40"
            y="96"
            width="240"
            height="100"
            rx="14"
            className="fill-card stroke-hairline-strong"
          />
          <rect
            x="146"
            y="103"
            width="28"
            height="3"
            rx="1.5"
            className="fill-hairline-strong"
          />
          {["IM", "TB", "PR", "KI"].map((who, i) => (
            <g key={who}>
              <circle
                cx={92 + i * 46}
                cy={136}
                r={14}
                className="fill-surface-2 stroke-hairline-strong"
              />
              <text
                x={92 + i * 46}
                y={140}
                textAnchor="middle"
                fontSize="9"
                fontWeight="650"
                className="fill-ink-2"
              >
                {who}
              </text>
            </g>
          ))}
        </motion.g>
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 320 180" className="block size-full">
      <rect
        width="320"
        height="180"
        style={{ fill: "color-mix(in oklab, var(--accent) 52%, black)" }}
      />
      <motion.g style={{ opacity: card }}>
        <text
          x="160"
          y="88"
          textAnchor="middle"
          fontSize="19"
          fontWeight="650"
          className="fill-white"
        >
          Plan less, go more.
        </text>
        <text
          x="160"
          y="112"
          textAnchor="middle"
          fontSize="10"
          letterSpacing="2"
          className="fill-white"
          opacity="0.7"
        >
          WAYLIGHT
        </text>
      </motion.g>
    </svg>
  );
}

/** An audio clip: its waveform, the played part in the accent. */
function Waveform({
  peaks,
  head,
  idBase,
  title,
}: {
  peaks: number[];
  head: MotionValue<number>;
  idBase: string;
  title: string;
}) {
  const clip = `${idBase}-played`;
  const played = useTransform(head, (v) => r1(clamp(v, 0, 1) * 320));
  const count = Math.max(1, peaks.length);
  const step = 320 / count;
  const w = step >= 2.5 ? r1(step * 0.62) : r1(step);
  const d = peaks
    .map((v, i) => {
      const h = r1(Math.max(2, v * 92));
      return `M${r1(i * step)} ${r1(104 - h / 2)}h${w}v${h}h-${w}Z`;
    })
    .join("");
  return (
    <svg aria-hidden viewBox="0 0 320 180" className="block size-full">
      <defs>
        <clipPath id={clip}>
          <motion.rect x={0} y={0} height={180} width={played} />
        </clipPath>
      </defs>
      <rect width="320" height="180" className="fill-surface-2" />
      <text
        x="16"
        y="30"
        fontSize="11"
        fontWeight="650"
        className="fill-foreground"
      >
        {title}
      </text>
      <path
        d={d}
        shapeRendering="crispEdges"
        className="fill-ink-3"
        opacity="0.45"
      />
      <path
        d={d}
        shapeRendering="crispEdges"
        clipPath={`url(#${clip})`}
        className="fill-(--tn-accent)"
      />
    </svg>
  );
}

/** The scene's picture, with a slow push-in while its scene plays. */
function SceneFrame({
  index,
  start,
  end,
  t,
  motionSafe,
  idBase,
}: {
  index: number;
  start: number;
  end: number;
  t: MotionValue<number>;
  motionSafe: boolean;
  idBase: string;
}) {
  const p = useTransform(t, (v) =>
    r3(clamp((v - start) / Math.max(0.001, end - start), 0, 1)),
  );
  const push = useTransform(p, (v) => (motionSafe ? r3(1.06 - v * 0.06) : 1));
  return (
    <motion.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: exitFor(durations.base) }}
      transition={{ duration: durations.base, ease: easings.enter }}
    >
      <motion.div
        className="size-full"
        style={{ scale: push, originX: 0.5, originY: 0.5 }}
      >
        <SceneArt index={index % 5} p={p} idBase={`${idBase}-${index}`} />
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------- */
/*                                  Markers                                 */
/* ----------------------------------------------------------------------- */

function Marker({
  cluster,
  notes,
  markerStyle,
  current,
  hovered,
  pending,
  fresh,
  delay,
  pulse,
  motionSafe,
}: {
  cluster: Cluster;
  notes: Map<string, TimecodeNote>;
  markerStyle: TimecodeMarkerStyle;
  current: boolean;
  hovered: boolean;
  pending: boolean;
  fresh: boolean;
  /** Arrival delay in seconds, when markers land after a skeleton. */
  delay: number | null;
  pulse: number;
  motionSafe: boolean;
}) {
  const scale = useMotionValue(1);
  const first = notes.get(cluster.ids[0] ?? "");
  const count = cluster.ids.length;
  const allResolved = cluster.ids.every((id) => notes.get(id)?.resolved);

  // Passing a marker pulses it: up on snap, then back on snap — two springs,
  // never a three-keyframe spring.
  React.useEffect(() => {
    if (!pulse || !motionSafe) return;
    let back: AnimationPlaybackControls | null = null;
    const up = animate(scale, 1.4, {
      ...springs.snap,
      onComplete: () => {
        back = animate(scale, 1, springs.snap);
      },
    });
    return () => {
      up.stop();
      back?.stop();
      scale.jump(1);
    };
  }, [pulse, motionSafe, scale]);

  const tone = pending
    ? "border-dashed border-(--tn-accent) bg-card text-(--tn-ink)"
    : allResolved
      ? "border-hairline-strong bg-card text-ink-3"
      : "border-transparent bg-(--tn-accent) text-white";

  const body =
    count > 1 ? (
      <span
        className={cn(
          "flex h-4 min-w-4 items-center justify-center rounded-full border px-1 font-mono text-[9px] leading-none font-semibold tabular-nums",
          tone,
        )}
      >
        {count}
      </span>
    ) : markerStyle === "avatar" ? (
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full border text-[7.5px] leading-none font-bold",
          tone,
        )}
      >
        {first ? initials(first.author) : ""}
      </span>
    ) : markerStyle === "dot" ? (
      <span
        className={cn(
          "block size-2.5 rounded-full border-[1.5px]",
          pending
            ? "border-dashed border-(--tn-accent) bg-card"
            : allResolved
              ? "border-ink-3 bg-card"
              : "border-card bg-(--tn-accent)",
        )}
      />
    ) : (
      <span
        className={cn(
          "block size-[7px] rounded-full border-[1.5px]",
          pending
            ? "border-dashed border-(--tn-accent) bg-card"
            : allResolved
              ? "border-ink-3 bg-card"
              : "border-(--tn-accent) bg-(--tn-accent)",
        )}
      />
    );

  const lane = markerStyle === "dot" && count === 1;
  return (
    <motion.span
      aria-hidden
      data-tn-marker={cluster.key}
      className="absolute flex -translate-x-1/2 flex-col items-center"
      style={{
        left: pct(cluster.x),
        bottom: lane ? 7 : 15,
        zIndex: hovered || current ? 3 : 2,
      }}
      // A new note drops in on recoil; markers that arrive after the
      // skeleton fall in along the track in order; a cluster that splits or
      // merges as the track resizes scales in on snap.
      initial={
        fresh || delay !== null
          ? { y: motionSafe ? -distances.step : 0, scale: 1, opacity: 0 }
          : { y: 0, scale: motionSafe ? 0.6 : 1, opacity: 0 }
      }
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{
        opacity: 0,
        scale: motionSafe ? 0.6 : 1,
        transition: exitFor(durations.fast),
      }}
      transition={
        motionSafe
          ? {
              y: {
                ...(delay !== null ? springs.glide : springs.recoil),
                delay: delay ?? 0,
              },
              scale: springs.snap,
              opacity: { duration: durations.fast, delay: delay ?? 0 },
            }
          : { duration: durations.fast, delay: delay ?? 0 }
      }
    >
      <motion.span
        className={cn(
          "flex flex-col items-center transition-opacity",
          hovered || current
            ? "opacity-100"
            : allResolved
              ? "opacity-70"
              : "opacity-95",
        )}
        style={{ scale, originX: 0.5, originY: 1 }}
      >
        {body}
        {!lane ? (
          <span
            className={cn(
              "block w-px",
              markerStyle === "tick" && count === 1 ? "h-2.5" : "h-1.5",
              allResolved && !pending ? "bg-ink-3/70" : "bg-(--tn-accent)",
            )}
          />
        ) : null}
      </motion.span>
    </motion.span>
  );
}

/* ----------------------------------------------------------------------- */
/*                               The surface                                */
/* ----------------------------------------------------------------------- */

type Risen = { key: string; id: string };

/**
 * Review notes pinned to moments in a clip. The clip plays in the frame
 * (drawn procedurally per scene, or by `renderFrame`), each note is a marker
 * on the timeline, and the notes list beside the player — under it below a
 * 40rem container — reads them in order.
 *
 * As the playhead passes a marker the marker pulses on snap and its note
 * rises out of the timeline into the foot of the frame on recoil, holds for
 * `holdMs` and leaves on the exit ease. Choosing a note, a marker or a
 * cluster seeks there: the playhead glides on glide while the frame cuts to
 * its scene, and the note rises as if passed. Markers closer than 14px merge
 * into a counted bubble that splits as the track widens.
 *
 * Space plays and pauses, M adds a note at the playhead (the clip pauses and
 * the composer takes focus), and the timeline is a slider: arrows step a
 * second (Shift five), Page keys ten, Home and End jump, and [ and ] move to
 * the previous and next note. One animation frame loop runs only while
 * playing, on screen and visible. Under reduced motion seeks jump, notes
 * fade in place and the frame holds still; playback and every count go on.
 */
export function TimecodeNotes({
  media = defaultTimecodeMedia,
  notes,
  defaultNotes,
  onNotesChange,
  time,
  defaultTime = 0,
  onTimeChange,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  onAdd,
  onSeek,
  onResolve,
  renderFrame,
  markerStyle = "tick",
  density = "regular",
  accent = "var(--accent-bright)",
  holdMs = 2600,
  author = "Noor Haddad",
  now = defaultTimecodeNow,
  title,
  status = "ready",
  onRetry,
  height = 540,
  disabled = false,
  className,
}: TimecodeNotesProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const titleId = `${uid}-title`;
  const hintId = `${uid}-hint`;
  const nowMs = toMs(now);
  const ready = status === "ready";
  const locked = disabled || !ready;
  const dens = DENSITY[density] ?? DENSITY.regular;
  const duration = Math.max(1, media.duration);
  const heading = title ?? media.title;

  /* ------------------------------- state -------------------------------- */

  const [ownNotes, setOwnNotes] = React.useState<TimecodeNote[]>(
    () => defaultNotes ?? defaultTimecodeNotes,
  );
  const list = notes ?? ownNotes;
  const sorted = React.useMemo(
    () => [...list].sort((a, b) => a.at - b.at || a.createdAt - b.createdAt),
    [list],
  );
  const byId = React.useMemo(() => new Map(list.map((n) => [n.id, n])), [list]);

  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = (playing ?? ownPlaying) && ready;

  const start = clamp(time ?? defaultTime, 0, duration);
  const t = useMotionValue(start);
  const head = useMotionValue(r3(start / duration));
  const [sec, setSec] = React.useState(Math.floor(start));
  const [risen, setRisen] = React.useState<Risen[]>([]);
  const [pulses, setPulses] = React.useState<Record<string, number>>({});
  const [composer, setComposer] = React.useState<{
    at: number;
    text: string;
  } | null>(null);
  const [trackW, setTrackW] = React.useState(0);
  const [hover, setHover] = React.useState<string | null>(null);
  const [group, setGroup] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [fresh, setFresh] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [inView, setInView] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const [focusAsk, setFocusAsk] = React.useState<{
    key: string;
    n: number;
  } | null>(null);
  const ask = (key: string) =>
    setFocusAsk((f) => ({ key, n: (f?.n ?? 0) + 1 }));
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A list that arrives after its skeleton cascades in; the first paint is still.
  const [arrival, setArrival] = React.useState({ status, n: 0 });
  // Markers fall in along the track only in the moment the clip arrives;
  // later ones (a split cluster, a new note) have motions of their own.
  const [markersArriving, setMarkersArriving] = React.useState(false);
  if (arrival.status !== status) {
    const arrived = ready && arrival.status === "loading";
    setArrival({ status, n: arrived ? arrival.n + 1 : arrival.n });
    if (arrived) setMarkersArriving(true);
  }
  React.useEffect(() => {
    if (!markersArriving) return;
    const t = window.setTimeout(() => setMarkersArriving(false), 1200);
    return () => window.clearTimeout(t);
  }, [markersArriving]);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const sliderRef = React.useRef<HTMLDivElement | null>(null);
  const secRef = React.useRef(Math.floor(start));
  const headRun = React.useRef<AnimationPlaybackControls | null>(null);
  const gliding = React.useRef(false);
  const timers = React.useRef(new Set<number>());
  const riseCount = React.useRef(0);
  const counter = React.useRef(0);
  const opener = React.useRef<HTMLElement | null>(null);
  const scrub = React.useRef<{ wasPlaying: boolean } | null>(null);
  const listRef = React.useRef<HTMLElement | null>(null);
  const listRun = React.useRef<AnimationPlaybackControls | null>(null);

  /* ------------------------------- derived ------------------------------ */

  const scenes = React.useMemo(
    () =>
      (media.scenes && media.scenes.length > 0
        ? [...media.scenes]
        : [{ at: 0, label: media.title }]
      ).sort((a, b) => a.at - b.at),
    [media.scenes, media.title],
  );
  const sceneIndex = Math.max(
    0,
    scenes.reduce((found, s, i) => (s.at <= sec + 0.0001 ? i : found), 0),
  );
  const scene = scenes[sceneIndex];
  const sceneEnd = scenes[sceneIndex + 1]?.at ?? duration;
  const peaks = React.useMemo(
    () =>
      media.peaks && media.peaks.length > 0
        ? media.peaks.map((v) => r3(clamp(v, 0, 1)))
        : seededPeaks(96, 0x5eed + Math.round(duration)),
    [media.peaks, duration],
  );

  const width = trackW || FALLBACK_TRACK;
  const markerNotes = composer
    ? [
        ...sorted,
        {
          id: "__pending",
          at: composer.at,
          author,
          text: composer.text,
          createdAt: nowMs,
        },
      ].sort((a, b) => a.at - b.at)
    : sorted;
  const markerMap = new Map(markerNotes.map((n) => [n.id, n]));
  const clusters = clusterNotes(markerNotes, duration, width).map((c) => ({
    ...c,
    x: r3(c.x / width),
  }));

  const currentId = (() => {
    let found: TimecodeNote | null = null;
    for (const n of sorted) if (n.at <= sec + 0.999) found = n;
    return found && sec - found.at < CURRENT_S ? found.id : null;
  })();
  const openCount = list.filter((n) => !n.resolved).length;

  /* ------------------------------ callbacks ----------------------------- */

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const writeNotes = (next: TimecodeNote[]) => {
    if (notes === undefined) setOwnNotes(next);
    onNotesChange?.(next);
  };

  const setPlay = (on: boolean, why: "user" | "end" = "user") => {
    if (on && !ready) return;
    if (playing === undefined) setOwnPlaying(on);
    onPlayingChange?.(on);
    if (why === "user") {
      say(
        on ? `Playing from ${clock(t.get())}.` : `Paused at ${clock(t.get())}.`,
      );
    } else {
      say("End of clip.");
    }
  };

  const raise = (id: string) => {
    const note = byId.get(id);
    if (!note) return;
    riseCount.current += 1;
    const key = `${id}-${riseCount.current}`;
    setRisen((r) => [...r.filter((x) => x.id !== id), { key, id }].slice(-2));
    setPulses((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
    later(() => setRisen((r) => r.filter((x) => x.key !== key)), holdMs);
    say(`${note.author} at ${clock(note.at)}: ${sentence(note.text)}`);
  };

  const moveHead = (to: number) => {
    headRun.current?.stop();
    const target = r3(to / duration);
    if (!motionSafe) {
      head.jump(target);
      gliding.current = false;
      return;
    }
    gliding.current = true;
    headRun.current = animate(head, target, {
      ...springs.glide,
      onComplete: () => {
        gliding.current = false;
      },
    });
  };

  const seek = (
    to: number,
    opts: { noteId?: string; rise?: boolean; report?: boolean } = {},
  ) => {
    const target = r1(clamp(to, 0, duration));
    t.set(target);
    const whole = Math.floor(target);
    secRef.current = whole;
    setSec(whole);
    moveHead(target);
    if (opts.report !== false) {
      onSeek?.(target, opts.noteId);
      onTimeChange?.(whole);
    }
    if (opts.noteId && opts.rise !== false) raise(opts.noteId);
  };

  const latest = React.useRef({
    sorted,
    raise,
    setPlay,
    onTimeChange,
    duration,
  });
  React.useEffect(() => {
    latest.current = { sorted, raise, setPlay, onTimeChange, duration };
  });

  /* ------------------------------- effects ------------------------------ */

  // A host that moves `time` by more than a second seeks without reporting:
  // the second is taken in render, the motion values once it commits.
  const [seenTime, setSeenTime] = React.useState(time);
  const [hostSeek, setHostSeek] = React.useState<{
    to: number;
    n: number;
  } | null>(null);
  if (seenTime !== time) {
    setSeenTime(time);
    if (time !== undefined && Math.abs(time - sec) > 1.01) {
      const to = r1(clamp(time, 0, duration));
      setSec(Math.floor(to));
      setHostSeek((h) => ({ to, n: (h?.n ?? 0) + 1 }));
    }
  }
  React.useEffect(() => {
    if (!hostSeek) return;
    t.set(hostSeek.to);
    secRef.current = Math.floor(hostSeek.to);
    head.jump(r3(hostSeek.to / duration));
  }, [hostSeek, duration, t, head]);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(([entry]) => {
      setInView(entry?.isIntersecting ?? true);
    });
    io.observe(root);
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  React.useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const ro = new ResizeObserver(() => {
      setTrackW(Math.round(track.clientWidth));
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [status]);

  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
      headRun.current?.stop();
      listRun.current?.stop();
    };
  }, []);

  // The clock: one frame loop, only while playing, on screen and visible.
  React.useEffect(() => {
    if (!isPlaying || !inView || !pageShown) return;
    let raf = 0;
    let last = performance.now();
    const step = (frame: number) => {
      const dt = Math.min(0.1, Math.max(0, (frame - last) / 1000));
      last = frame;
      const L = latest.current;
      const prev = t.get();
      const next = Math.min(L.duration, prev + dt);
      t.set(r3(next));
      if (!gliding.current && !scrub.current) head.set(r3(next / L.duration));
      for (const n of L.sorted) {
        if (!n.resolved && n.at > prev && n.at <= next) L.raise(n.id);
      }
      const whole = Math.floor(next);
      if (whole !== secRef.current) {
        secRef.current = whole;
        setSec(whole);
        L.onTimeChange?.(whole);
      }
      if (next >= L.duration) {
        L.setPlay(false, "end");
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, inView, pageShown, t, head]);

  React.useEffect(() => {
    if (!focusAsk) return;
    const node = rootRef.current?.querySelector<HTMLElement>(
      `[data-tn-focus="${CSS.escape(focusAsk.key)}"]`,
    );
    if (!node) return;
    node.focus({ preventScroll: true });
    if (node instanceof HTMLTextAreaElement) {
      const end = node.value.length;
      node.setSelectionRange(end, end);
    }
  }, [focusAsk]);

  /* ------------------------------- actions ------------------------------ */

  const togglePlay = () => {
    if (!ready) return;
    if (!isPlaying && t.get() >= duration - 0.05) seek(0, { report: true });
    setPlay(!isPlaying);
  };

  const openComposer = () => {
    if (locked) return;
    if (document.activeElement instanceof HTMLElement) {
      opener.current = document.activeElement;
    }
    if (isPlaying) setPlay(false);
    if (!composer) setComposer({ at: r1(t.get()), text: "" });
    ask("composer");
    say(`New note at ${clock(t.get())}.`);
  };

  const closeComposer = () => {
    setComposer(null);
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    else ask("slider");
  };

  const postNote = () => {
    if (!composer || locked) return;
    const text = composer.text.trim();
    if (!text) {
      say("Write the note before posting.");
      return;
    }
    let id = "";
    do {
      counter.current += 1;
      id = `${idBase}-note${counter.current}`;
    } while (byId.has(id));
    const note: TimecodeNote = {
      id,
      at: composer.at,
      author,
      text,
      createdAt: nowMs,
    };
    writeNotes([...list, note]);
    setFresh((f) => new Set(f).add(id));
    setComposer(null);
    say(`Note added at ${clock(note.at)}.`);
    onAdd?.(note);
    const back = opener.current;
    opener.current = null;
    if (back && back.isConnected) back.focus({ preventScroll: true });
    else ask("slider");
  };

  const toggleResolved = (note: TimecodeNote) => {
    if (locked) return;
    const next = !note.resolved;
    writeNotes(
      list.map((n) => (n.id === note.id ? { ...n, resolved: next } : n)),
    );
    say(
      next
        ? `Note at ${clock(note.at)} resolved.`
        : `Note at ${clock(note.at)} reopened.`,
    );
    onResolve?.(note.id, next);
  };

  /** Brings a note into view in the side list; under the player it stays put. */
  const showInList = (id: string) => {
    const box = listRef.current;
    if (!box || getComputedStyle(box).overflowY === "visible") return;
    const row = box.querySelector<HTMLElement>(
      `[data-tn-note="${CSS.escape(id)}"]`,
    );
    if (!row) return;
    const top = row.offsetTop - 8;
    const bottom = row.offsetTop + row.offsetHeight + 8;
    const view = box.scrollTop;
    const to =
      top < view
        ? top
        : bottom > view + box.clientHeight
          ? bottom - box.clientHeight
          : null;
    if (to === null) return;
    listRun.current?.stop();
    const target = Math.max(0, Math.round(to));
    if (!motionSafe) {
      box.scrollTop = target;
      return;
    }
    listRun.current = animate(box.scrollTop, target, {
      ...springs.glide,
      onUpdate: (v) => {
        box.scrollTop = Math.round(v);
      },
    });
  };

  const chooseNote = (note: TimecodeNote) => {
    setGroup(new Set([note.id]));
    seek(note.at, { noteId: note.id });
    showInList(note.id);
  };

  const chooseCluster = (cluster: Cluster) => {
    const ids = cluster.ids.filter((id) => id !== "__pending");
    const first = ids[0] ? byId.get(ids[0]) : undefined;
    if (!first) return;
    setGroup(new Set(ids));
    seek(first.at, { noteId: first.id });
    showInList(first.id);
    if (ids.length > 1) {
      say(
        `${plural(ids.length, "note", "notes")} here, from ${clock(first.at)}.`,
      );
    }
  };

  const neighbour = (dir: 1 | -1) => {
    const now = t.get();
    if (dir > 0) return sorted.find((n) => n.at > now + 0.05) ?? null;
    let found: TimecodeNote | null = null;
    for (const n of sorted) if (n.at < now - 0.6) found = n;
    return found;
  };

  const xToTime = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return null;
    const r = track.getBoundingClientRect();
    if (r.width <= 0) return null;
    return clamp((clientX - r.left) / r.width, 0, 1) * duration;
  };

  const nearestCluster = (clientX: number) => {
    const track = trackRef.current;
    if (!track) return null;
    const r = track.getBoundingClientRect();
    let best: Cluster | null = null;
    let dist = 9;
    for (const c of clusters) {
      const d = Math.abs(r.left + c.x * r.width - clientX);
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return best;
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !ready,
    onStart: ({ point }) => {
      scrub.current = { wasPlaying: isPlaying };
      headRun.current?.stop();
      gliding.current = false;
      const to = xToTime(point.x);
      if (to !== null) {
        t.set(r1(to));
        head.set(r3(to / duration));
      }
    },
    onMove: ({ point }) => {
      const to = xToTime(point.x);
      if (to === null) return;
      t.set(r1(to));
      head.set(r3(to / duration));
      const whole = Math.floor(to);
      if (whole !== secRef.current) {
        secRef.current = whole;
        setSec(whole);
      }
    },
    onEnd: ({ point }) => {
      scrub.current = null;
      const to = xToTime(point.x);
      if (to === null) return;
      t.set(r1(to));
      head.set(r3(to / duration));
      secRef.current = Math.floor(to);
      setSec(Math.floor(to));
      onSeek?.(r1(to));
      onTimeChange?.(Math.floor(to));
      say(`${clock(to)}.`);
    },
    onCancel: () => {
      scrub.current = null;
    },
    onTap: (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const markerKey = target
        ?.closest("[data-tn-marker]")
        ?.getAttribute("data-tn-marker");
      const hit =
        clusters.find((c) => c.key === markerKey) ??
        nearestCluster(event.clientX);
      if (hit && !hit.ids.every((id) => id === "__pending")) {
        chooseCluster(hit);
        return;
      }
      const to = xToTime(event.clientX);
      if (to !== null) seek(to);
    },
  });

  const { onPointerMove: dragMove, ...dragRest } = drag;

  const onSliderKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const k = event.key;
    const step = event.shiftKey ? 5 : 1;
    let to: number | null = null;
    if (k === "ArrowRight" || k === "ArrowUp") to = t.get() + step;
    else if (k === "ArrowLeft" || k === "ArrowDown") to = t.get() - step;
    else if (k === "PageUp") to = t.get() + 10;
    else if (k === "PageDown") to = t.get() - 10;
    else if (k === "Home") to = 0;
    else if (k === "End") to = duration;
    else if (k === "]" || k === "[") {
      event.preventDefault();
      const n = neighbour(k === "]" ? 1 : -1);
      if (n) chooseNote(n);
      else say(k === "]" ? "No later notes." : "No earlier notes.");
      return;
    }
    if (to === null) return;
    event.preventDefault();
    seek(to);
  };

  const onRootKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.closest("textarea, input"))
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      // Buttons answer Space themselves; everywhere else it plays.
      if (target instanceof HTMLElement && target.closest("button, a")) return;
      event.preventDefault();
      togglePlay();
      return;
    }
    if (event.key === "m" || event.key === "M") {
      event.preventDefault();
      openComposer();
    }
  };

  /* -------------------------------- render ------------------------------ */

  const fillW = useTransform(head, (v) => pct(clamp(v, 0, 1)));
  const valueText = (() => {
    const at = currentId ? byId.get(currentId) : undefined;
    return `${clock(sec)} of ${clock(duration)}${at ? `, note by ${at.author} at ${clock(at.at)}` : ""}`;
  })();
  const laneH =
    markerStyle === "avatar" ? 26 : markerStyle === "tick" ? 20 : 16;
  const listStep = cascade(sorted.length);
  const markerStep = cascade(clusters.length);
  const maxRisen = width < 300 ? 1 : 2;
  const shownRisen = risen.slice(-maxRisen);
  const hoverCluster = hover
    ? clusters.find((c) => c.key === hover)
    : undefined;
  const hoverNotes = hoverCluster
    ? hoverCluster.ids
        .map((id) => markerMap.get(id))
        .filter((n): n is TimecodeNote => !!n && n.id !== "__pending")
    : [];

  const frame = (
    <div
      className="relative aspect-video w-full shrink-0 overflow-clip rounded-3 border border-hairline bg-surface-2"
      onClick={() => togglePlay()}
    >
      {status === "loading" ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-surface-2 motion-safe:animate-pulse"
        />
      ) : renderFrame ? (
        <div className="absolute inset-0">{renderFrame(sec, media)}</div>
      ) : media.kind === "audio" ? (
        <div className="absolute inset-0">
          <Waveform
            peaks={peaks}
            head={head}
            idBase={idBase}
            title={media.title}
          />
        </div>
      ) : (
        <AnimatePresence initial={false}>
          <SceneFrame
            key={sceneIndex}
            index={sceneIndex}
            start={scene?.at ?? 0}
            end={sceneEnd}
            t={t}
            motionSafe={motionSafe}
            idBase={idBase}
          />
        </AnimatePresence>
      )}
      {ready && media.kind === "video" && !renderFrame && scene ? (
        <span className="absolute top-2 left-2 inline-flex h-5 items-center rounded-full bg-[color-mix(in_oklab,black_42%,transparent)] px-2 text-[10px] font-medium text-white">
          {scene.label}
        </span>
      ) : null}
      {ready && !isPlaying ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[color-mix(in_oklab,black_38%,transparent)] text-white"
        >
          <Play className="size-5 translate-x-px" fill="currentColor" />
        </span>
      ) : null}
      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-start gap-1.5">
        <AnimatePresence initial={false}>
          {shownRisen.map((r) => {
            const note = byId.get(r.id);
            if (!note) return null;
            return (
              <motion.div
                key={r.key}
                layout={motionSafe ? "position" : false}
                className="flex max-w-[88%] items-start gap-2 rounded-2 border border-[color-mix(in_oklab,white_18%,transparent)] bg-[color-mix(in_oklab,black_62%,transparent)] px-2.5 py-1.5 text-white shadow-[0_6px_18px_color-mix(in_oklab,black_22%,transparent)] backdrop-blur-sm"
                initial={{ opacity: 0, y: motionSafe ? distances.step : 0 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  y: motionSafe ? -distances.nudge : 0,
                  transition: exitFor(),
                }}
                transition={
                  motionSafe
                    ? {
                        y: springs.recoil,
                        opacity: { duration: durations.fast },
                        layout: springs.glide,
                      }
                    : { duration: durations.fast }
                }
              >
                <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-(--tn-accent) text-[7.5px] leading-none font-bold">
                  {initials(note.author)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[10.5px] leading-4 text-white/75">
                    {note.author} · {clock(note.at)}
                  </span>
                  <span className="line-clamp-2 text-[12px] leading-4">
                    {note.text}
                  </span>
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );

  const timeline = (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={ready ? 0 : -1}
      data-tn-focus="slider"
      aria-label={`${heading} timeline`}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={sec}
      aria-valuetext={valueText}
      aria-describedby={hintId}
      aria-disabled={!ready || undefined}
      onKeyDown={onSliderKey}
      {...dragRest}
      onPointerMove={(event) => {
        dragMove(event);
        if (event.pointerType !== "mouse" || scrub.current) return;
        const c = nearestCluster(event.clientX);
        setHover(c ? c.key : null);
      }}
      onPointerLeave={() => setHover(null)}
      className={cn(
        "relative w-full shrink-0 cursor-pointer touch-pan-y rounded-2 px-2 select-none",
        FOCUS_RING,
      )}
      style={{ paddingTop: laneH }}
    >
      <div ref={trackRef} className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-clip rounded-full bg-surface-2 ring-1 ring-hairline ring-inset">
          <motion.div
            className="h-full rounded-full bg-(--tn-accent)"
            style={{ width: fillW }}
          />
        </div>
        <AnimatePresence initial={false}>
          {ready
            ? clusters.map((c, ci) => (
                <Marker
                  key={c.key}
                  cluster={c}
                  notes={markerMap}
                  markerStyle={markerStyle}
                  current={!!currentId && c.ids.includes(currentId)}
                  hovered={hover === c.key}
                  pending={c.ids.includes("__pending")}
                  fresh={c.ids.some(
                    (id) => fresh.has(id) || id === "__pending",
                  )}
                  delay={markersArriving ? r3(ci * markerStep) : null}
                  pulse={Math.max(0, ...c.ids.map((id) => pulses[id] ?? 0))}
                  motionSafe={motionSafe}
                />
              ))
            : null}
        </AnimatePresence>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 z-[4] block size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-(--tn-accent) shadow-[0_1px_4px_color-mix(in_oklab,black_30%,transparent)]"
          style={{ left: fillW }}
        />
        <AnimatePresence>
          {hoverCluster && hoverNotes.length > 0 ? (
            <motion.span
              key={hoverCluster.key}
              aria-hidden
              className="pointer-events-none absolute bottom-full z-[5] mb-7 w-44 rounded-2 border border-hairline-strong bg-popover px-2.5 py-1.5 shadow-[0_8px_22px_color-mix(in_oklab,black_14%,transparent)]"
              style={{
                left: `clamp(0px, calc(${pct(hoverCluster.x)} - 88px), calc(100% - 176px))`,
              }}
              initial={{ opacity: 0, y: motionSafe ? distances.nudge : 0 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: exitFor(durations.fast) }}
              transition={
                motionSafe
                  ? { y: springs.snap, opacity: { duration: durations.fast } }
                  : { duration: durations.fast }
              }
            >
              {hoverNotes.slice(0, 2).map((n) => (
                <span key={n.id} className="block">
                  <span className="block truncate text-[10.5px] text-ink-3">
                    {n.author} · {clock(n.at)}
                  </span>
                  <span className="line-clamp-2 text-[12px] leading-4 text-foreground">
                    {n.text}
                  </span>
                </span>
              ))}
              {hoverNotes.length > 2 ? (
                <span className="block text-[10.5px] text-ink-3">
                  and {hoverNotes.length - 2} more
                </span>
              ) : null}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );

  const controls = (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-2")}>
      <button
        type="button"
        data-tn-focus="play"
        aria-label={isPlaying ? "Pause" : "Play"}
        aria-keyshortcuts="Space"
        disabled={!ready}
        onClick={togglePlay}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full bg-(--tn-button) text-white transition-opacity hover:opacity-90 disabled:opacity-50",
          dens.ctl,
          FOCUS_RING,
        )}
      >
        <span className="relative grid place-items-center">
          <AnimatePresence initial={false}>
            <motion.span
              key={isPlaying ? "pause" : "play"}
              className="[grid-area:1/1]"
              initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{
                opacity: 0,
                scale: motionSafe ? 0.6 : 1,
                transition: exitFor(durations.fast),
              }}
              transition={
                motionSafe
                  ? {
                      scale: springs.flick,
                      opacity: { duration: durations.fast },
                    }
                  : { duration: durations.fast }
              }
            >
              {isPlaying ? (
                <Pause aria-hidden className="size-3.5" fill="currentColor" />
              ) : (
                <Play
                  aria-hidden
                  className="size-3.5 translate-x-px"
                  fill="currentColor"
                />
              )}
            </motion.span>
          </AnimatePresence>
        </span>
      </button>
      <span className="font-mono text-[12px] text-ink-2 tabular-nums">
        <span className="text-foreground">{clock(sec)}</span> /{" "}
        {clock(duration)}
      </span>
      <span className="flex-1" />
      <button
        type="button"
        data-tn-focus="add"
        aria-label="Add note"
        aria-keyshortcuts="M"
        disabled={locked}
        onClick={openComposer}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-2 border border-hairline px-2.5 text-[12px] text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50",
          dens.h,
          FOCUS_RING,
        )}
      >
        <Plus aria-hidden className="size-3.5 shrink-0" />
        Note
        <kbd
          aria-hidden
          className="rounded-1 border border-hairline px-1 font-mono text-[10px] leading-4 text-ink-3"
        >
          M
        </kbd>
      </button>
    </div>
  );

  const composerBox = (
    <AnimatePresence initial={false}>
      {composer ? (
        <motion.div
          key="composer"
          className="shrink-0 overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0, transition: exitFor(durations.fast) }}
          transition={
            motionSafe
              ? { height: springs.glide, opacity: { duration: durations.base } }
              : { duration: durations.fast }
          }
        >
          <div className="flex flex-col gap-2 rounded-3 border border-dashed border-[color-mix(in_oklab,var(--tn-accent)_55%,transparent)] bg-surface-1 p-2.5">
            <p className="flex items-center gap-2 text-[12px] font-medium text-foreground">
              <span className="rounded-1 bg-[color-mix(in_oklab,var(--tn-accent)_14%,transparent)] px-1.5 py-0.5 font-mono text-[11px] text-(--tn-ink) tabular-nums">
                {clock(composer.at)}
              </span>
              New note
            </p>
            <div className="grid rounded-2 border border-hairline-strong bg-card">
              <textarea
                data-tn-focus="composer"
                aria-label={`Note at ${clock(composer.at)}`}
                rows={1}
                value={composer.text}
                placeholder="What should change here?"
                onChange={(event) => {
                  const text = event.currentTarget.value;
                  setComposer((c) => (c ? { ...c, text } : c));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeComposer();
                  } else if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    postNote();
                  }
                }}
                className={cn(
                  "max-h-24 resize-none overflow-y-auto rounded-2 bg-transparent px-2.5 py-1.5 text-foreground [grid-area:1/1] placeholder:text-ink-3",
                  dens.text,
                  FOCUS_RING,
                )}
              />
              <span
                aria-hidden
                className={cn(
                  "invisible max-h-24 overflow-hidden px-2.5 py-1.5 break-words whitespace-pre-wrap [grid-area:1/1]",
                  dens.text,
                )}
              >
                {`${composer.text} `}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={closeComposer}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 border border-hairline px-2.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
                  FOCUS_RING,
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                aria-disabled={!composer.text.trim() || undefined}
                onClick={postNote}
                className={cn(
                  "inline-flex h-7 items-center rounded-2 bg-(--tn-button) px-2.5 text-[12px] font-medium text-white transition-opacity aria-disabled:opacity-45",
                  FOCUS_RING,
                )}
              >
                Post
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  const notesList =
    status === "loading" ? (
      <div aria-hidden className="flex flex-col gap-2 p-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-3 border border-hairline p-2.5"
          >
            <span className="h-4 w-9 rounded-1 bg-surface-2" />
            <span className="h-2.5 flex-1 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          </div>
        ))}
      </div>
    ) : status === "error" ? null : sorted.length === 0 ? (
      <p className="px-4 py-8 text-center text-[13px] text-ink-2">
        {disabled
          ? "No notes on this clip."
          : "No notes yet. Press M to add one at the playhead."}
      </p>
    ) : (
      <ol
        role="list"
        aria-label="Notes"
        className="flex flex-col gap-1.5 p-2.5"
      >
        {sorted.map((note, i) => {
          const current = note.id === currentId;
          const grouped = group.has(note.id);
          const arriving = arrival.n > 0 || fresh.has(note.id);
          return (
            <motion.li
              key={note.id}
              data-tn-note={note.id}
              layout={motionSafe ? "position" : false}
              initial={
                arriving
                  ? { opacity: 0, y: motionSafe ? distances.step : 0 }
                  : false
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                layout: springs.glide,
                y: motionSafe
                  ? {
                      ...springs.glide,
                      delay: fresh.has(note.id) ? 0 : i * listStep,
                    }
                  : { duration: 0 },
                opacity: {
                  duration: durations.base,
                  ease: easings.enter,
                  delay: fresh.has(note.id) ? 0 : i * listStep,
                },
              }}
              className={cn(
                "relative flex items-start gap-1 overflow-clip rounded-3 border transition-colors",
                current
                  ? "border-[color-mix(in_oklab,var(--tn-accent)_40%,transparent)] bg-surface-1"
                  : grouped
                    ? "border-hairline-strong bg-surface-1"
                    : "border-hairline bg-card",
                note.resolved && "opacity-60",
              )}
            >
              {current ? (
                <motion.span
                  layoutId={`${uid}-current`}
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-0.5 bg-(--tn-accent)"
                  transition={motionSafe ? springs.snap : { duration: 0 }}
                />
              ) : null}
              <button
                type="button"
                data-tn-focus={`note:${note.id}`}
                aria-current={current || undefined}
                aria-label={`${clock(note.at)}, ${note.author}: ${note.text}${note.resolved ? " (resolved)" : ""}`}
                onClick={() => chooseNote(note)}
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-1 rounded-3 text-left",
                  dens.pad,
                  FOCUS_IN,
                )}
              >
                <span className="flex w-full min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-1 px-1.5 py-0.5 font-mono text-[11px] leading-4 tabular-nums",
                      current
                        ? "bg-(--tn-accent) text-white"
                        : "bg-surface-2 text-ink-2",
                    )}
                  >
                    {clock(note.at)}
                  </span>
                  <span
                    title={note.author}
                    className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground"
                  >
                    {note.author}
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-ink-3 @max-[40rem]/timecode-notes:inline @min-[70rem]/timecode-notes:inline">
                    {ago(note.createdAt, nowMs)}
                  </span>
                </span>
                <span className={cn("line-clamp-2 text-ink-2", dens.text)}>
                  {note.text}
                </span>
              </button>
              {!disabled ? (
                <button
                  type="button"
                  aria-pressed={!!note.resolved}
                  aria-label={
                    note.resolved
                      ? `Reopen note at ${clock(note.at)}`
                      : `Resolve note at ${clock(note.at)}`
                  }
                  title={note.resolved ? "Reopen" : "Resolve"}
                  disabled={!ready}
                  onClick={() => toggleResolved(note)}
                  className={cn(
                    "mt-2 mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-2 border transition-colors",
                    note.resolved
                      ? "border-transparent bg-[color-mix(in_oklab,var(--success)_16%,transparent)] text-success"
                      : "border-hairline text-ink-3 hover:bg-surface-2 hover:text-foreground",
                    FOCUS_RING,
                  )}
                >
                  {note.resolved ? (
                    <RotateCcw aria-hidden className="size-3.5" />
                  ) : (
                    <Check aria-hidden className="size-3.5" />
                  )}
                </button>
              ) : null}
            </motion.li>
          );
        })}
      </ol>
    );

  return (
    <div
      ref={rootRef}
      role="region"
      aria-labelledby={titleId}
      aria-busy={status === "loading" || undefined}
      onKeyDown={onRootKeyDown}
      className={cn(
        "@container/timecode-notes flex w-full flex-col overflow-hidden rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-80",
        className,
      )}
      style={{
        height,
        ["--tn-accent" as string]: `oklch(from ${accent} 0.6 c h)`,
        ["--tn-button" as string]: `oklch(from ${accent} 0.52 c h)`,
        ["--tn-ink" as string]:
          "color-mix(in oklab, var(--tn-accent) 70%, var(--foreground))",
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-hairline px-4 py-3">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-2 bg-surface-2 text-ink-2"
        >
          {media.kind === "audio" ? (
            <AudioLines className="size-4" />
          ) : (
            <Film className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p
            id={titleId}
            title={heading}
            className="truncate text-sm font-semibold"
          >
            {heading}
          </p>
          <p className="truncate text-[11px] text-ink-3">
            {ready
              ? `${clock(duration)} · ${plural(list.length, "note", "notes")} · ${openCount} open`
              : status === "loading"
                ? "Loading the clip"
                : "Clip unavailable"}
          </p>
        </div>
      </header>

      <p id={hintId} className="sr-only">
        Space plays and pauses, M adds a note at the playhead. Arrows step a
        second, Shift with an arrow five, Page Up and Page Down ten. Left and
        right bracket move to the previous and next note.
      </p>

      {status === "error" ? (
        <div className="flex flex-1 flex-col items-center-safe justify-center-safe gap-3 p-6 text-center">
          <TriangleAlert aria-hidden className="size-5 text-danger" />
          <p className="text-sm text-foreground">This clip didn&apos;t load.</p>
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
      ) : (
        <motion.div
          layoutScroll
          className="flex flex-1 [scrollbar-width:thin] flex-col overflow-y-auto overscroll-contain @min-[40rem]/timecode-notes:flex-row @min-[40rem]/timecode-notes:overflow-hidden"
        >
          <div
            className={cn(
              "flex shrink-0 flex-col p-3 @min-[40rem]/timecode-notes:flex-1 @min-[40rem]/timecode-notes:shrink @min-[40rem]/timecode-notes:overflow-y-auto",
              dens.gap,
            )}
          >
            {frame}
            {timeline}
            {controls}
            {composerBox}
          </div>
          <motion.section
            ref={listRef}
            layoutScroll
            aria-label="Notes"
            className="shrink-0 border-t border-hairline @min-[40rem]/timecode-notes:w-60 @min-[40rem]/timecode-notes:overflow-y-auto @min-[40rem]/timecode-notes:overscroll-contain @min-[40rem]/timecode-notes:border-t-0 @min-[40rem]/timecode-notes:border-l @min-[70rem]/timecode-notes:w-75"
          >
            {notesList}
          </motion.section>
        </motion.div>
      )}

      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
