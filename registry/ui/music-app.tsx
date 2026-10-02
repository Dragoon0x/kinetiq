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
  ChevronDown,
  ChevronLeft,
  GripVertical,
  ListMusic,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
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
import { RepeatCoil, type RepeatMode } from "@/registry/ui/repeat-coil";

export type MusicDisc = "vinyl" | "cd" | "cover";
export type MusicQueue = "panel" | "sheet";
export type MusicMini = "bar" | "pill" | "card";
export type MusicAppStatus = "ready" | "loading" | "error";

/** Procedural cover art: a hue turned from the accent's, and a pattern. */
export type MusicCover = {
  /** Degrees to turn from the accent colour's hue, so the art reads in both themes. */
  hue: number;
  pattern: "rings" | "bands" | "grid" | "sun";
};

export type MusicTrack = {
  id: string;
  title: string;
  /** Length in seconds. */
  duration: number;
};

export type MusicAlbum = {
  id: string;
  title: string;
  artist: string;
  year: number;
  cover: MusicCover;
  /** The artist's followers, without the viewer. */
  followers?: number;
  tracks: MusicTrack[];
};

export type MusicAppProps = {
  /** The turning artwork in the player: a record under a fixed sheen, a silver disc, or the sleeve with the record sliding out of it. @default "vinyl" */
  disc?: MusicDisc;
  /** Where Up next lives: a panel beside the library on desktop and beside the player on tablet, or a sheet behind a button. A phone always uses the sheet. @default "panel" */
  queue?: MusicQueue;
  /** The mini player's shape, and the shape the full player grows from: a bar along the bottom, a floating pill, or a card in the corner. @default "bar" */
  mini?: MusicMini;
  /** The library. @default defaultMusicAlbums */
  albums?: MusicAlbum[];
  /** Controlled current track id. */
  track?: string;
  /** Initial track when uncontrolled. @default the first album's first track */
  defaultTrack?: string;
  /** Fires from the press, the queue or the end of a track that moved to another. */
  onTrackChange?: (id: string) => void;
  /** Controlled: playing. */
  playing?: boolean;
  /** Initial state when uncontrolled. Nothing plays until asked. @default false */
  defaultPlaying?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Controlled queue, as track ids after the current one. */
  upNext?: string[];
  /** Initial queue when uncontrolled. @default defaultMusicUpNext */
  defaultUpNext?: string[];
  /** Fires from the drag, key, remove, shuffle or track change that changed the queue. */
  onUpNextChange?: (ids: string[]) => void;
  /** Controlled: the full player is open. */
  expanded?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Controlled repeat mode. */
  repeat?: RepeatMode;
  /** Initial repeat mode when uncontrolled. @default "off" */
  defaultRepeat?: RepeatMode;
  onRepeatChange?: (mode: RepeatMode) => void;
  /** Controlled volume, 0 to 100. */
  volume?: number;
  /** Initial volume when uncontrolled. @default 70 */
  defaultVolume?: number;
  onVolumeChange?: (volume: number) => void;
  /** Controlled: muted. */
  muted?: boolean;
  /** Initial mute when uncontrolled. @default false */
  defaultMuted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  /** Controlled followed artists, by name. */
  following?: string[];
  /** Initial followed artists when uncontrolled. @default ["Coldbrook Quartet"] */
  defaultFollowing?: string[];
  onFollowingChange?: (artists: string[]) => void;
  /** Where the first track starts, in seconds. @default 0 */
  defaultPosition?: number;
  /** The visitor moved the playhead: a scrub, a press on the track, a key, or Previous. */
  onSeek?: (seconds: number) => void;
  /** Loading draws placeholder covers; error offers Try again. @default "ready" */
  status?: MusicAppStatus;
  onRetry?: () => void;
  /** The screen's accessible name. @default "Music" */
  label?: string;
  /** Play the presses, the ticks of a scrub and the queue. Off unless asked for. @default false */
  sound?: boolean;
  /** Nothing plays, moves or opens. */
  disabled?: boolean;
  /** Classes for the root. It is 560px tall by default; pass a height class to change it. */
  className?: string;
};

/* ------------------------------------------------------------------ */
/* Defaults: a Waylight Radio library                                   */
/* ------------------------------------------------------------------ */

const album = (
  id: string,
  title: string,
  artist: string,
  year: number,
  cover: MusicCover,
  followers: number,
  tracks: [string, number][],
): MusicAlbum => ({
  id,
  title,
  artist,
  year,
  cover,
  followers,
  tracks: tracks.map(([t, d], i) => ({
    id: `${id}-${i + 1}`,
    title: t,
    duration: d,
  })),
});

export const defaultMusicAlbums: MusicAlbum[] = [
  album(
    "tidewater",
    "Tidewater",
    "Coldbrook Quartet",
    2025,
    { hue: -60, pattern: "rings" },
    48210,
    [
      ["Low Tide", 228],
      ["Harbour Lights", 252],
      ["Salt Line", 185],
      ["Undertow", 320],
      ["Breakwater", 241],
    ],
  ),
  album(
    "field-notes",
    "Field Notes",
    "Fernworks Ensemble",
    2024,
    { hue: 80, pattern: "bands" },
    12940,
    [
      ["First Light", 196],
      ["Hedgerow", 233],
      ["Long Grass", 274],
      ["Evening Field", 301],
    ],
  ),
  album(
    "night-freight",
    "Night Freight",
    "Basin Lights",
    2026,
    { hue: 0, pattern: "grid" },
    30577,
    [
      ["Depot", 212],
      ["Route 14", 247],
      ["Signal Box", 199],
      ["Last Manifest", 286],
    ],
  ),
  album(
    "long-haul",
    "Long Haul",
    "Gauge & Field",
    2023,
    { hue: 150, pattern: "sun" },
    8122,
    [
      ["Mile Marker", 238],
      ["Overpass", 205],
      ["Headlights", 267],
    ],
  ),
  album(
    "coastal-hours",
    "Coastal Hours",
    "Ines Calder",
    2022,
    { hue: -110, pattern: "rings" },
    21456,
    [
      ["Shoreline", 219],
      ["Gulls", 176],
      ["Sea Wall", 254],
      ["Ferry", 231],
    ],
  ),
  album(
    "copper-wire",
    "Copper Wire",
    "The Fieldline Five",
    2021,
    { hue: 120, pattern: "bands" },
    5389,
    [
      ["Live Wire", 188],
      ["Switchboard", 224],
      ["Long Distance", 263],
    ],
  ),
];

/** Tidewater after its first track, then two from Night Freight. */
export const defaultMusicUpNext: string[] = [
  "tidewater-2",
  "tidewater-3",
  "tidewater-4",
  "night-freight-2",
  "field-notes-1",
];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const r2 = (v: number) => Math.round(v * 100) / 100;
const clampN = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const timeOf = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const spoken = (s: number) => {
  const t = Math.max(0, Math.floor(s));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return m ? `${m} min ${sec} s` : `${sec} s`;
};
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
const panOf = (el: Element | null | undefined) => {
  const rect = el?.getBoundingClientRect();
  return rect ? panFrom(rect.left + rect.width / 2, null) : 0;
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A pigment from the accent's hue, turned and set at a fixed lightness. */
const pigment = (turn: number, l: number, c: number) =>
  `oklch(from var(--accent-bright) ${l} ${c} calc(h + ${turn}))`;

/** Degrees a second: 33⅓ rpm for a record, a faster spin for a disc. */
const SPIN: Record<MusicDisc, number> = { vinyl: 200, cover: 200, cd: 420 };

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring";
const FOCUS_IN =
  "outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring";
const ICON_BTN = cn(
  "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors",
  "hover:bg-surface-2 hover:text-foreground aria-disabled:opacity-40",
  FOCUS,
);

/** Runs a controlled-or-uncontrolled value with one setter. */
function useControlled<T>(
  value: T | undefined,
  initial: T,
  onChange?: (v: T) => void,
) {
  const [own, setOwn] = React.useState<T>(initial);
  const current = value !== undefined ? value : own;
  const set = (next: T) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  return [current, set] as const;
}

/* ------------------------------------------------------------------ */
/* Cover art                                                            */
/* ------------------------------------------------------------------ */

function CoverArt({
  cover,
  seed,
  className,
}: {
  cover: MusicCover;
  seed: string;
  className?: string;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = `${uid}-${seed}`;
  const h = cover.hue;
  const n = hash(seed);
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      className={cn("block size-full", className)}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: pigment(h, 0.62, 0.15) }} />
          <stop offset="1" style={{ stopColor: pigment(h + 40, 0.3, 0.1) }} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      <g
        fill="none"
        strokeWidth="1.4"
        style={{ stroke: pigment(h - 30, 0.88, 0.06) }}
      >
        {cover.pattern === "rings"
          ? [12, 20, 28, 36, 44].map((r, i) => (
              <circle
                key={r}
                cx={30 + (n % 40)}
                cy={60}
                r={r}
                opacity={r2(0.75 - i * 0.12)}
              />
            ))
          : cover.pattern === "bands"
            ? [0, 1, 2, 3, 4, 5].map((i) => (
                <path
                  key={i}
                  d={`M ${-20 + i * 22} 110 L ${30 + i * 22} -10`}
                  strokeWidth={i % 2 ? 7 : 2}
                  opacity={i % 2 ? 0.28 : 0.6}
                />
              ))
            : cover.pattern === "grid"
              ? Array.from({ length: 36 }, (_, i) => (
                  <circle
                    key={i}
                    cx={15 + (i % 6) * 14}
                    cy={15 + Math.floor(i / 6) * 14}
                    r={(i + n) % 7 === 0 ? 3.2 : 1.2}
                    style={{ fill: pigment(h - 30, 0.88, 0.06) }}
                    stroke="none"
                  />
                ))
              : [
                  <circle
                    key="sun"
                    cx="50"
                    cy="58"
                    r="22"
                    stroke="none"
                    style={{ fill: pigment(h - 60, 0.82, 0.13) }}
                  />,
                  ...[68, 74, 80, 86].map((y) => (
                    <path
                      key={y}
                      d={`M 0 ${y} L 100 ${y}`}
                      strokeWidth="2.6"
                      style={{ stroke: pigment(h + 40, 0.3, 0.1) }}
                    />
                  )),
                ]}
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The turning disc                                                     */
/* ------------------------------------------------------------------ */

const GROOVES = Array.from({ length: 12 }, (_, i) => 23 + i * 2.2);

function Disc({
  kind,
  album: a,
  size,
  angle,
  out,
  artId,
}: {
  kind: MusicDisc;
  album: MusicAlbum;
  size: number;
  angle: MotionValue<number>;
  /** How far the record has slid out of its sleeve, 0 to 1. */
  out: MotionValue<number>;
  artId?: string;
}) {
  const recordX = useTransform(out, (o) => `${r2(o * 42)}%`);
  const record = (labelId?: string) => (
    <div className="relative size-full">
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{ rotate: angle }}
      >
        <svg aria-hidden viewBox="0 0 100 100" className="block size-full">
          <circle
            cx="50"
            cy="50"
            r="50"
            style={{ fill: "oklch(from var(--accent) 0.17 0.015 h)" }}
          />
          {GROOVES.map((r, i) => (
            <circle
              key={r}
              cx="50"
              cy="50"
              r={r}
              fill="none"
              strokeWidth="0.5"
              opacity={i % 3 === 0 ? 0.55 : 0.28}
              style={{ stroke: "oklch(from var(--accent) 0.36 0.02 h)" }}
            />
          ))}
          {/* A mark on the groove, so the turn reads even under the sheen. */}
          <path
            d="M 50 3 L 50 20"
            strokeWidth="0.8"
            opacity="0.35"
            style={{ stroke: "oklch(from var(--accent) 0.5 0.02 h)" }}
          />
        </svg>
      </motion.div>
      <motion.div
        layoutId={labelId}
        className="absolute top-[31%] left-[31%] size-[38%] overflow-hidden rounded-full"
        style={{ rotate: angle, borderRadius: 999 }}
      >
        <CoverArt cover={a.cover} seed={a.id} />
        <span className="absolute top-1/2 left-1/2 size-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background" />
      </motion.div>
      {/* The sheen is the room's light: it stays put while the record turns. */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        className="pointer-events-none absolute inset-0 size-full"
      >
        <path
          d="M 50 50 L 78 8 A 50 50 0 0 1 92 22 Z"
          fill="white"
          opacity="0.07"
        />
        <path
          d="M 50 50 L 22 92 A 50 50 0 0 1 8 78 Z"
          fill="white"
          opacity="0.05"
        />
      </svg>
    </div>
  );

  if (kind === "cd") {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <motion.div
          layoutId={artId}
          className="absolute inset-0 overflow-hidden rounded-full shadow-[0_10px_30px_color-mix(in_oklab,black_22%,transparent)]"
          style={{ rotate: angle, borderRadius: 999 }}
        >
          <CoverArt cover={a.cover} seed={a.id} />
        </motion.div>
        <span
          aria-hidden
          className="absolute inset-0 rounded-full opacity-35 mix-blend-screen"
          style={{
            background: `conic-gradient(from 20deg, ${pigment(0, 0.9, 0.1)}, transparent 18%, ${pigment(120, 0.9, 0.1)} 30%, transparent 45%, ${pigment(240, 0.9, 0.1)} 62%, transparent 78%, ${pigment(0, 0.9, 0.1)})`,
          }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 size-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color-mix(in_oklab,white_55%,transparent)] bg-[color-mix(in_oklab,var(--card)_70%,transparent)]"
        />
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 size-[8%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background"
        />
      </div>
    );
  }

  if (kind === "cover") {
    // The record sits behind the sleeve and slides half out of it to play.
    return (
      <div
        className="relative"
        style={{ width: Math.round(size * 1.18), height: size }}
      >
        <motion.div
          className="absolute top-[4%] left-0 aspect-square h-[92%]"
          style={{ x: recordX }}
        >
          {record()}
        </motion.div>
        <motion.div
          layoutId={artId}
          className="absolute top-0 left-0 overflow-hidden rounded-2 shadow-[0_10px_30px_color-mix(in_oklab,black_26%,transparent)]"
          style={{ width: size, height: size, borderRadius: 6 }}
        >
          <CoverArt cover={a.cover} seed={a.id} />
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="relative rounded-full shadow-[0_12px_32px_color-mix(in_oklab,black_26%,transparent)]"
      style={{ width: size, height: size }}
    >
      {record(artId)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The scrubber                                                         */
/* ------------------------------------------------------------------ */

function Scrubber({
  pos,
  duration,
  secs,
  motionSafe,
  disabled,
  onGrab,
  onScrub,
  onSeek,
}: {
  pos: MotionValue<number>;
  duration: number;
  secs: number;
  motionSafe: boolean;
  disabled: boolean;
  onGrab: (held: boolean) => void;
  onScrub: (seconds: number) => void;
  onSeek: (seconds: number, by: "key" | "pointer") => void;
}) {
  const track = React.useRef<HTMLDivElement | null>(null);
  const [held, setHeld] = React.useState(false);
  const total = Math.max(1, duration);
  const fill = useTransform(pos, (p) => r2(clampN(p / total, 0, 1)));
  const left = useTransform(
    pos,
    (p) => `${r2(clampN(p / total, 0, 1) * 100)}%`,
  );
  const at = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return pos.get();
    return clampN(((clientX - rect.left) / rect.width) * total, 0, total);
  };
  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: ({ point }) => {
      setHeld(true);
      onGrab(true);
      onScrub(at(point.x));
    },
    onMove: ({ point }) => onScrub(at(point.x)),
    onEnd: ({ point }) => {
      setHeld(false);
      onGrab(false);
      onSeek(at(point.x), "pointer");
    },
    onCancel: () => {
      setHeld(false);
      onGrab(false);
    },
    onTap: (event) => onSeek(at(event.clientX), "pointer"),
  });

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Position"
        aria-valuemin={0}
        aria-valuemax={Math.floor(total)}
        aria-valuenow={Math.floor(secs)}
        aria-valuetext={`${spoken(secs)} of ${spoken(total)}`}
        aria-disabled={disabled || undefined}
        {...drag}
        onKeyDown={(event) => {
          const step = {
            ArrowRight: 5,
            ArrowUp: 5,
            ArrowLeft: -5,
            ArrowDown: -5,
            PageUp: 30,
            PageDown: -30,
          }[event.key];
          const to =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? total - 1
                : step === undefined
                  ? null
                  : pos.get() + step;
          if (to === null || disabled) return;
          event.preventDefault();
          onSeek(clampN(to, 0, total - 1), "key");
        }}
        className={cn(
          "relative flex h-6 cursor-pointer touch-pan-y items-center rounded-full select-none",
          FOCUS,
        )}
      >
        <div
          ref={track}
          className="relative h-1 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <motion.div
            className="absolute inset-0 origin-left rounded-full bg-cobalt-bright"
            style={{ scaleX: fill }}
          />
        </div>
        <motion.span
          aria-hidden
          className="pointer-events-none absolute top-1/2 -mt-1.5 -ml-1.5 size-3 rounded-full bg-foreground shadow-[0_1px_4px_color-mix(in_oklab,black_30%,transparent)]"
          style={{ left }}
          animate={{ scale: held ? 1.45 : 1 }}
          transition={motionSafe ? springs.flick : { duration: 0 }}
        />
      </div>
      <div className="flex justify-between font-mono text-[11px] text-ink-3 tabular-nums">
        <span>{timeOf(secs)}</span>
        <span>-{timeOf(total - secs)}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The queue                                                            */
/* ------------------------------------------------------------------ */

const ROW_H = 52;

type Entry = { track: MusicTrack; album: MusicAlbum };

function QueueRow({
  entry,
  slot,
  count,
  focused,
  motionSafe,
  disabled,
  bind,
  onFocusRow,
  onKey,
  onPlay,
  onRemove,
  onDragSlot,
  onDragEnd,
}: {
  entry: Entry;
  slot: number;
  count: number;
  focused: boolean;
  motionSafe: boolean;
  disabled: boolean;
  bind: (node: HTMLDivElement | null) => void;
  onFocusRow: () => void;
  onKey: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPlay: () => void;
  onRemove: () => void;
  onDragSlot: (to: number) => void;
  onDragEnd: () => void;
}) {
  const y = useMotionValue(slot * ROW_H);
  const lift = useMotionValue(0);
  const drag = React.useRef<{ from: number; slot: number } | null>(null);
  const anim = React.useRef<AnimationPlaybackControls | null>(null);
  const goal = React.useRef(slot * ROW_H);
  const shown = React.useRef(slot);
  const [held, setHeld] = React.useState(false);

  // Rows glide to a new slot; the dragged one stays under the finger.
  React.useEffect(() => {
    if (shown.current === slot && Math.abs(y.get() - slot * ROW_H) < 0.5) {
      return;
    }
    shown.current = slot;
    // The dragged row stays under the finger, and a row already settling
    // into this slot with its release velocity keeps that flight.
    if (drag.current) return;
    if (goal.current === slot * ROW_H && y.isAnimating()) return;
    goal.current = slot * ROW_H;
    anim.current?.stop();
    if (!motionSafe) y.jump(slot * ROW_H);
    else anim.current = animate(y, slot * ROW_H, springs.glide);
    return () => anim.current?.stop();
  }, [slot, motionSafe, y]);

  const gesture = useDrag({
    axis: "y",
    threshold: 4,
    disabled: disabled || count < 2,
    onStart: () => {
      anim.current?.stop();
      drag.current = { from: y.get(), slot };
      setHeld(true);
      if (motionSafe) animate(lift, 1, springs.flick);
    },
    onMove: ({ offset }) => {
      const d = drag.current;
      if (!d) return;
      const max = (count - 1) * ROW_H;
      const raw = d.from + offset.y;
      const at =
        raw < 0
          ? rubberband(raw, ROW_H)
          : raw > max
            ? max + rubberband(raw - max, ROW_H)
            : raw;
      y.set(r2(at));
      const to = clampN(Math.round(at / ROW_H), 0, count - 1);
      if (to !== d.slot) {
        d.slot = to;
        onDragSlot(to);
      }
    },
    onEnd: ({ velocity }) => {
      const d = drag.current;
      drag.current = null;
      setHeld(false);
      if (!d) return;
      animate(lift, 0, springs.glide);
      goal.current = d.slot * ROW_H;
      anim.current = animate(
        y,
        d.slot * ROW_H,
        motionSafe
          ? { ...springs.glide, velocity: velocity.y }
          : { duration: 0 },
      );
      onDragEnd();
    },
    onCancel: () => {
      drag.current = null;
      setHeld(false);
      lift.jump(0);
      anim.current = animate(y, slot * ROW_H, springs.glide);
      onDragEnd();
    },
  });

  const scale = useTransform(lift, (l) => r2(1 + l * 0.02));
  const shadow = useTransform(lift, (l) =>
    l < 0.01
      ? "none"
      : `0 ${r2(6 * l)}px ${r2(18 * l)}px color-mix(in oklab, black ${Math.round(24 * l)}%, transparent)`,
  );

  return (
    <motion.div
      ref={bind}
      role="listitem"
      tabIndex={focused ? 0 : -1}
      aria-label={`${entry.track.title}, ${entry.album.artist}, ${timeOf(entry.track.duration)}, ${slot + 1} of ${count}`}
      onFocus={onFocusRow}
      onKeyDown={onKey}
      onDoubleClick={onPlay}
      className={cn(
        "group/music-app-row absolute inset-x-0 top-0 flex items-center gap-2.5 rounded-2 bg-card pr-1 pl-0.5",
        held ? "z-10" : "z-0",
        FOCUS_IN,
      )}
      style={{ y, height: ROW_H, scale, boxShadow: shadow }}
    >
      <span
        aria-hidden
        {...gesture}
        className="flex h-full w-6 shrink-0 cursor-grab touch-pan-x items-center justify-center text-ink-3 active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </span>
      <span className="size-9 shrink-0 overflow-hidden rounded-1">
        <CoverArt cover={entry.album.cover} seed={entry.album.id} />
      </span>
      <button
        type="button"
        tabIndex={-1}
        onClick={onPlay}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-[13px] font-medium text-foreground">
          {entry.track.title}
        </span>
        <span className="block truncate text-[11px] text-ink-3">
          {entry.album.artist}
        </span>
      </button>
      <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
        {timeOf(entry.track.duration)}
      </span>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Remove ${entry.track.title}`}
        onClick={onRemove}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 opacity-0 transition-opacity group-focus-within/music-app-row:opacity-100 group-hover/music-app-row:opacity-100 hover:bg-surface-2 hover:text-foreground"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

type Mode = "phone" | "tablet" | "desktop";
type Said = { n: number; text: string };

const PHONE_MAX = 640;
const DESKTOP_MIN = 1040;

/**
 * A complete music screen: the library, a mini player that grows into the
 * full player, a turning disc, a scrubber and a queue you can reorder.
 *
 * The mini player — a bar, a floating pill or a corner card — is one shared
 * surface with the full player: pressed, the surface grows from the mini's
 * box to the whole screen while the cover grows into the disc's label and
 * the title and Play travel to their places, all on the glide spring, and
 * a downward drag on the grab bar (1:1, projected on release) or Escape
 * folds it back. The platter has inertia: Play spins it up like a motor,
 * Pause lets it coast down under friction, and one frame loop integrates
 * its angle and the playing position — only while something moves, the
 * screen is visible and the page is shown.
 *
 * The scrubber is a slider you press, drag or key; repeat is repeat-coil,
 * volume is mute-cone and following an artist is follow-knot. Up next
 * follows a dragged row 1:1 while the others glide out of its way, and is
 * one tab stop whose arrows move, Alt+arrows reorder, Enter plays and
 * Delete removes. Under reduced motion the player cross-fades, the disc
 * stands still and rows swap at once, while time, bars and counts move on.
 */
export function MusicApp({
  disc = "vinyl",
  queue = "panel",
  mini = "bar",
  albums = defaultMusicAlbums,
  track,
  defaultTrack,
  onTrackChange,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  upNext,
  defaultUpNext = defaultMusicUpNext,
  onUpNextChange,
  expanded,
  defaultExpanded = false,
  onExpandedChange,
  repeat,
  defaultRepeat = "off",
  onRepeatChange,
  volume,
  defaultVolume = 70,
  onVolumeChange,
  muted,
  defaultMuted = false,
  onMutedChange,
  following,
  defaultFollowing = ["Coldbrook Quartet"],
  onFollowingChange,
  defaultPosition = 0,
  onSeek,
  status = "ready",
  onRetry,
  label = "Music",
  sound = false,
  disabled = false,
  className,
}: MusicAppProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const idBase = uid.replace(/[^a-zA-Z0-9]/g, "");
  const playerTitleId = `${uid}-player`;
  const sheetTitleId = `${uid}-sheet`;
  const hintId = `${uid}-queue-hint`;

  const byId = React.useMemo(() => {
    const map = new Map<string, Entry>();
    for (const a of albums)
      for (const t of a.tracks) map.set(t.id, { track: t, album: a });
    return map;
  }, [albums]);
  const firstId = albums[0]?.tracks[0]?.id ?? "";

  const [trackId, setTrackId] = useControlled(
    track,
    defaultTrack ?? firstId,
    onTrackChange,
  );
  const [isPlaying, setPlaying] = useControlled(
    playing,
    defaultPlaying,
    onPlayingChange,
  );
  const [queueIds, setQueue] = useControlled(
    upNext,
    defaultUpNext,
    onUpNextChange,
  );
  const [isOpen, setOpenState] = useControlled(
    expanded,
    defaultExpanded,
    onExpandedChange,
  );
  const [repeatMode, setRepeat] = useControlled(
    repeat,
    defaultRepeat,
    onRepeatChange,
  );
  const [vol, setVol] = useControlled(volume, defaultVolume, onVolumeChange);
  const [isMuted, setMuted] = useControlled(muted, defaultMuted, onMutedChange);
  const [follows, setFollows] = useControlled(
    following,
    defaultFollowing,
    onFollowingChange,
  );

  const now = byId.get(trackId);
  const queueEntries = queueIds
    .map((id) => byId.get(id))
    .filter((e): e is Entry => !!e);
  const duration = now?.track.duration ?? 1;
  const live = isPlaying && !disabled && status === "ready" && !!now;

  const [history, setHistory] = React.useState<string[]>([]);
  const [tab, setTab] = React.useState<"albums" | "songs">("albums");
  const [albumId, setAlbumId] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState(false);
  const [shuffle, setShuffle] = React.useState(false);
  const [order, setOrder] = React.useState<string[] | null>(null);
  const [focusRow, setFocusRow] = React.useState<string | null>(null);
  const [secs, setSecs] = React.useState(() => Math.floor(defaultPosition));
  const [shownTrack, setShownTrack] = React.useState(trackId);
  const [hidden, setHidden] = React.useState(false);
  const [onScreen, setOnScreen] = React.useState(true);
  const [said, setSaid] = React.useState<Said>({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  // A new track starts from its top; the readout says so from this render.
  if (shownTrack !== trackId) {
    setShownTrack(trackId);
    setSecs(0);
  }

  const pos = useMotionValue(clampN(defaultPosition, 0, duration));
  const angle = useMotionValue(0);
  const omega = useMotionValue(0);
  const out = useMotionValue(0);
  const pull = useMotionValue(0);
  const grabbing = React.useRef(false);
  const rows = React.useRef(new Map<string, HTMLDivElement>());
  const opener = React.useRef<HTMLElement | null>(null);
  const focusNext = React.useRef<(() => HTMLElement | null | undefined) | null>(
    null,
  );
  const api = React.useRef<{ ended: () => void } | null>(null);
  const lastTick = React.useRef(Math.floor(defaultPosition));

  /* ------------------------------ the frame ----------------------------- */

  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<{ w: number; h: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!root) return;
    const read = () => {
      const r = root.getBoundingClientRect();
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    const io = new IntersectionObserver((entries) =>
      setOnScreen(entries.some((e) => e.isIntersecting)),
    );
    io.observe(root);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, [root]);
  const W = size?.w ?? 760;
  const H = size?.h ?? 560;
  const mode: Mode =
    W < PHONE_MAX ? "phone" : W >= DESKTOP_MIN ? "desktop" : "tablet";
  const panelBeside = queue === "panel" && mode !== "phone";

  React.useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // A changed track starts at its top; the first one starts where it was
  // asked to.
  const wasTrack = React.useRef(trackId);
  React.useEffect(() => {
    if (wasTrack.current === trackId) return;
    wasTrack.current = trackId;
    pos.jump(0);
    lastTick.current = 0;
  }, [trackId, pos]);

  /* --------------------------- the motor and clock ---------------------- */

  // Play spins the platter up like a motor; pause lets it coast down.
  React.useEffect(() => {
    if (!motionSafe) {
      omega.jump(0);
      out.jump(live ? 1 : 0);
      return;
    }
    const spin = animate(omega, live ? SPIN[disc] : 0, {
      duration: live ? 0.7 : 1.6,
      ease: live ? easings.enter : [0.2, 0.6, 0.4, 1],
    });
    const slide = animate(out, live ? 1 : 0, springs.glide);
    return () => {
      spin.stop();
      slide.stop();
    };
  }, [live, disc, motionSafe, omega, out]);

  // One frame loop for the turn and the clock, running only while something
  // moves, the screen is on screen and the page is shown.
  React.useEffect(() => {
    if (hidden || !onScreen) return;
    if (!live && omega.get() < 0.5) return;
    let frame = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (live && !grabbing.current) {
        const p = pos.get() + dt;
        if (p >= duration) {
          // The track ran out: the next one (or the same, on repeat one)
          // starts from zero and the loop runs on into it.
          pos.set(duration);
          api.current?.ended();
        } else pos.set(p);
        const whole = Math.floor(pos.get());
        if (whole !== lastTick.current) {
          lastTick.current = whole;
          setSecs(whole);
        }
      }
      const w = omega.get();
      if (motionSafe && w > 0.01) angle.set(r2((angle.get() + w * dt) % 360));
      if (live || w > 0.5) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [live, hidden, onScreen, duration, motionSafe, pos, angle, omega]);

  /* ------------------------------ transport ----------------------------- */

  const goTo = (id: string, rest: string[], fromHistory = false) => {
    if (!byId.has(id)) return;
    if (!fromHistory && trackId) setHistory((h) => [...h, trackId]);
    setTrackId(id);
    setQueue(rest);
    pos.jump(0);
    lastTick.current = 0;
    setSecs(0);
    say(`Playing ${byId.get(id)?.track.title ?? ""}.`);
  };

  const next = (by?: Element | null) => {
    if (by) audio.play("tick", { pitch: 1.2, gain: 0.4, pan: panOf(by) });
    const [first, ...rest] = queueIds;
    if (first) {
      goTo(first, rest);
      return;
    }
    if (repeatMode === "all" && history.length) {
      const [h0, ...hr] = [...history, trackId];
      setHistory([]);
      if (h0) goTo(h0, hr, true);
      return;
    }
    setPlaying(false);
    pos.jump(0);
    setSecs(0);
    say("End of the queue.");
  };

  const prev = (by?: Element | null) => {
    if (by) audio.play("tick", { pitch: 0.9, gain: 0.4, pan: panOf(by) });
    const back = history[history.length - 1];
    if (pos.get() > 3 || !back) {
      pos.jump(0);
      setSecs(0);
      onSeek?.(0);
      return;
    }
    setHistory((h) => h.slice(0, -1));
    goTo(back, [trackId, ...queueIds], true);
  };

  const toggle = (by?: Element | null) => {
    if (disabled || status !== "ready" || !now) return;
    const to = !isPlaying;
    audio.play("blup", { pitch: to ? 1.15 : 0.85, gain: 0.55, pan: panOf(by) });
    setPlaying(to);
    say(to ? `Playing ${now.track.title}.` : "Paused.");
  };

  const seek = (to: number, how: "key" | "pointer") => {
    const s = clampN(to, 0, Math.max(0, duration - 0.5));
    pos.set(s);
    lastTick.current = Math.floor(s);
    setSecs(Math.floor(s));
    if (how === "key") audio.play("tick", { pitch: 1.1, gain: 0.35 });
    onSeek?.(s);
  };

  const scrub = (to: number) => {
    const s = clampN(to, 0, duration);
    const before = Math.floor(pos.get() / 10);
    pos.set(r2(s));
    if (Math.floor(s / 10) !== before) {
      audio.play("tick", { pitch: r2(0.8 + (s / duration) * 0.6), gain: 0.3 });
    }
    if (Math.floor(s) !== secs) setSecs(Math.floor(s));
  };

  React.useEffect(() => {
    api.current = {
      ended: () => {
        if (repeatMode === "one") {
          pos.jump(0);
          lastTick.current = 0;
          setSecs(0);
          return;
        }
        next();
      },
    };
  });

  const playAlbum = (a: MusicAlbum, from = 0, mixed = false) => {
    const ids = a.tracks.map((t) => t.id);
    const list = mixed
      ? [...ids].sort((x, y) => hash(`${x}~`) - hash(`${y}~`))
      : ids.slice(from);
    const [first, ...rest] = list;
    if (!first) return;
    goTo(first, rest);
    if (!isPlaying) setPlaying(true);
    audio.play("blup", { pitch: 1.15, gain: 0.5 });
  };

  /* -------------------------------- player ------------------------------ */

  const openPlayer = (by: HTMLElement) => {
    if (disabled || !now) return;
    opener.current = by;
    audio.play("blup", { pitch: 1.3, gain: 0.35, pan: panOf(by) });
    pull.jump(0);
    setOpenState(true);
    focusNext.current = () =>
      root?.querySelector<HTMLElement>("[data-music-close]");
  };

  const closePlayer = () => {
    if (!isOpen) return;
    audio.play("blup", { pitch: 0.8, gain: 0.3 });
    setSheet(false);
    setOpenState(false);
    const back = opener.current;
    opener.current = null;
    focusNext.current = () =>
      back?.isConnected
        ? back
        : root?.querySelector<HTMLElement>("[data-music-mini]");
  };

  const grab = useDrag({
    axis: "y",
    threshold: 4,
    disabled,
    onMove: ({ offset }) => {
      pull.set(r2(offset.y >= 0 ? offset.y : rubberband(offset.y, H * 0.25)));
    },
    onEnd: ({ offset, velocity }) => {
      if (project(offset.y, velocity.y, 0.99) > H / 3) {
        closePlayer();
        animate(pull, 0, { duration: 0 });
      } else animate(pull, 0, { ...springs.glide, velocity: velocity.y });
    },
    onCancel: () => animate(pull, 0, springs.glide),
    onTap: () => {},
  });

  React.useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const node = target();
    if (node?.isConnected && !node.closest("[inert]")) {
      node.focus({ preventScroll: true });
    }
  });

  /* -------------------------------- queue ------------------------------- */

  const shownOrder = order ?? queueIds;
  const moveRow = (id: string, to: number) => {
    const list = queueIds.filter((x) => x !== id);
    list.splice(clampN(to, 0, list.length), 0, id);
    setQueue(list);
    return list;
  };

  const onQueueKey = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    const i = queueIds.indexOf(id);
    const focusAt = (j: number) => {
      const target = queueIds[clampN(j, 0, queueIds.length - 1)];
      if (!target) return;
      setFocusRow(target);
      rows.current.get(target)?.focus();
    };
    if (
      event.altKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      const to = i + (event.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= queueIds.length) return;
      moveRow(id, to);
      audio.play("tick", { pitch: to < i ? 1.15 : 0.9, gain: 0.35 });
      say(
        `${byId.get(id)?.track.title ?? ""} moved to ${to + 1} of ${queueIds.length}.`,
      );
      return;
    }
    const move = {
      ArrowDown: i + 1,
      ArrowUp: i - 1,
      Home: 0,
      End: queueIds.length - 1,
    }[event.key];
    if (move !== undefined) {
      event.preventDefault();
      focusAt(move);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      goTo(id, queueIds.slice(i + 1));
      if (!isPlaying) setPlaying(true);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      setQueue(queueIds.filter((x) => x !== id));
      say(`Removed ${byId.get(id)?.track.title ?? ""}.`);
      focusAt(i < queueIds.length - 1 ? i + 1 : i - 1);
    }
  };

  const queueTotal = queueEntries.reduce((s, e) => s + e.track.duration, 0);
  const rovingRow =
    (focusRow && queueIds.includes(focusRow) && focusRow) || queueIds[0];

  const queueList = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-hairline px-3">
        <h2
          id={sheetTitleId}
          tabIndex={-1}
          className="text-sm font-semibold outline-none"
        >
          Up next
        </h2>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-3 tabular-nums">
          {plural(queueEntries.length, "song")} · {Math.round(queueTotal / 60)}{" "}
          min
        </span>
        {queueEntries.length ? (
          <button
            type="button"
            onClick={() => {
              setQueue([]);
              say("Queue cleared.");
            }}
            className={cn(
              "inline-flex h-7 items-center rounded-2 px-2 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            Clear
          </button>
        ) : null}
        {sheet ? (
          <button
            type="button"
            aria-label="Close Up next"
            onClick={() => {
              setSheet(false);
              focusNext.current = () =>
                root?.querySelector<HTMLElement>("[data-music-queue]");
            }}
            className={cn(ICON_BTN, "size-8")}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <div className="flex-1 [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 py-2">
        {now ? (
          <div className="mb-2 flex items-center gap-2.5 rounded-2 bg-cobalt-wash py-1.5 pr-2 pl-2">
            <span className="size-9 shrink-0 overflow-hidden rounded-1">
              <CoverArt cover={now.album.cover} seed={now.album.id} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                {now.track.title}
              </span>
              <span className="block truncate text-[11px] text-ink-3">
                Now playing · {now.album.artist}
              </span>
            </span>
          </div>
        ) : null}
        {queueEntries.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-ink-3">
            Nothing up next. Play an album to fill the queue.
          </p>
        ) : (
          <div
            role="list"
            aria-label="Up next"
            aria-describedby={hintId}
            className="relative"
            style={{ height: queueEntries.length * ROW_H }}
          >
            {/* Rows keep one document order and take their places by y: a
                row React moved in the document would have its effects re-run
                mid-flight and freeze. Each row's name says where it is. */}
            {[...queueEntries]
              .sort((a, b) => (a.track.id < b.track.id ? -1 : 1))
              .map((e) => (
                <QueueRow
                  key={e.track.id}
                  entry={e}
                  slot={Math.max(0, shownOrder.indexOf(e.track.id))}
                  count={queueEntries.length}
                  focused={e.track.id === rovingRow}
                  motionSafe={motionSafe}
                  disabled={disabled}
                  bind={(node) => {
                    if (node) rows.current.set(e.track.id, node);
                    else rows.current.delete(e.track.id);
                  }}
                  onFocusRow={() => setFocusRow(e.track.id)}
                  onKey={(event) => onQueueKey(event, e.track.id)}
                  onPlay={() => {
                    const i = queueIds.indexOf(e.track.id);
                    goTo(e.track.id, queueIds.slice(i + 1));
                    if (!isPlaying) setPlaying(true);
                  }}
                  onRemove={() => {
                    setQueue(queueIds.filter((x) => x !== e.track.id));
                    say(`Removed ${e.track.title}.`);
                  }}
                  onDragSlot={(to) => {
                    const list = (order ?? queueIds).filter(
                      (x) => x !== e.track.id,
                    );
                    list.splice(to, 0, e.track.id);
                    setOrder(list);
                    audio.play("tick", {
                      pitch: r2(1.2 - to * 0.05),
                      gain: 0.3,
                    });
                  }}
                  onDragEnd={() => {
                    if (order) {
                      setQueue(order);
                      const at = order.indexOf(e.track.id);
                      say(
                        `${e.track.title} moved to ${at + 1} of ${order.length}.`,
                      );
                    }
                    setOrder(null);
                  }}
                />
              ))}
          </div>
        )}
        <p id={hintId} className="sr-only">
          Up and Down move, Alt with Up or Down moves the song, Enter plays it,
          Delete removes it.
        </p>
      </div>
    </div>
  );

  /* ------------------------------- library ------------------------------ */

  const openAlbum = albumId ? albums.find((a) => a.id === albumId) : undefined;
  const miniPad = !now ? 12 : mini === "card" ? 112 : mini === "pill" ? 80 : 72;
  // Three bars that move with the playing position: no loop of their own.
  const bar = (p: number, k: number) =>
    live && motionSafe
      ? r2(0.35 + 0.65 * Math.abs(Math.sin(p * (3.1 + k) + k)))
      : 0.45;
  const bar0 = useTransform(pos, (p) => bar(p, 0));
  const bar1 = useTransform(pos, (p) => bar(p, 1));
  const bar2 = useTransform(pos, (p) => bar(p, 2));
  const bars = [bar0, bar1, bar2];
  const eq = (
    <span
      aria-hidden
      className="flex h-3.5 w-4 items-end justify-center gap-0.5"
    >
      {bars.map((b, k) => (
        <motion.span
          key={k}
          className="h-full w-[3px] origin-bottom rounded-full bg-cobalt-bright"
          style={{ scaleY: b }}
        />
      ))}
    </span>
  );

  const trackRow = (t: MusicTrack, a: MusicAlbum, i: number, wide: boolean) => {
    const on = t.id === trackId;
    return (
      <li key={t.id}>
        <button
          type="button"
          aria-current={on ? "true" : undefined}
          aria-label={`${t.title}, ${a.artist}, ${timeOf(t.duration)}${on ? (live ? ", playing" : ", paused") : ""}`}
          onClick={() => {
            const from = a.tracks.findIndex((x) => x.id === t.id);
            playAlbum(a, from);
          }}
          disabled={disabled}
          className={cn(
            "flex h-11 w-full items-center gap-3 rounded-2 px-2 text-left transition-colors hover:bg-surface-2",
            on && "bg-cobalt-wash hover:bg-cobalt-wash",
            FOCUS_IN,
          )}
        >
          <span className="flex w-5 shrink-0 justify-center font-mono text-[11px] text-ink-3 tabular-nums">
            {on ? eq : i + 1}
          </span>
          {wide ? (
            <span className="size-8 shrink-0 overflow-hidden rounded-1">
              <CoverArt cover={a.cover} seed={a.id} />
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "block truncate text-[13px]",
                on ? "font-medium text-foreground" : "text-foreground",
              )}
            >
              {t.title}
            </span>
            {wide ? (
              <span className="block truncate text-[11px] text-ink-3">
                {a.artist} · {a.title}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 font-mono text-[11px] text-ink-3 tabular-nums">
            {timeOf(t.duration)}
          </span>
        </button>
      </li>
    );
  };

  const library = (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex h-12 items-center gap-3 border-b border-hairline px-3">
        {openAlbum ? (
          <button
            type="button"
            onClick={() => {
              setAlbumId(null);
              focusNext.current = () =>
                root?.querySelector<HTMLElement>(
                  `[data-music-album="${openAlbum.id}"]`,
                );
            }}
            className={cn(
              "inline-flex h-8 items-center gap-0.5 rounded-2 pr-2 pl-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-foreground",
              FOCUS,
            )}
          >
            <ChevronLeft aria-hidden className="size-4" />
            Albums
          </button>
        ) : (
          <h2 className="text-sm font-semibold">Library</h2>
        )}
        <span className="flex-1" />
        {openAlbum ? null : (
          <div
            role="tablist"
            aria-label="Library"
            className="relative flex h-8 items-center gap-1 rounded-full bg-surface-2 p-0.5"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return;
              event.preventDefault();
              const to = tab === "albums" ? "songs" : "albums";
              setTab(to);
              audio.play("tick", { pitch: 1.1, gain: 0.3 });
              event.currentTarget
                .querySelector<HTMLElement>(`[data-tab="${to}"]`)
                ?.focus();
            }}
          >
            {(["albums", "songs"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                data-tab={t}
                aria-selected={tab === t}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => {
                  if (tab === t) return;
                  setTab(t);
                  audio.play("tick", { pitch: 1.1, gain: 0.3 });
                }}
                className={cn(
                  "relative inline-flex h-7 items-center rounded-full px-3 text-xs transition-colors",
                  tab === t
                    ? "text-foreground"
                    : "text-ink-2 hover:text-foreground",
                  FOCUS_IN,
                )}
              >
                {tab === t ? (
                  <motion.span
                    aria-hidden
                    layoutId={motionSafe ? `${idBase}-tab` : undefined}
                    transition={springs.snap}
                    className="absolute inset-0 rounded-full bg-card shadow-[0_1px_3px_color-mix(in_oklab,black_14%,transparent)]"
                  />
                ) : null}
                <span className="relative">
                  {t === "albums" ? "Albums" : "Songs"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        role={openAlbum ? undefined : "tabpanel"}
        aria-label={
          openAlbum ? openAlbum.title : tab === "albums" ? "Albums" : "Songs"
        }
        className="@container [scrollbar-width:thin] overflow-y-auto overscroll-contain"
        style={{ paddingBottom: miniPad }}
      >
        {status === "loading" ? (
          <div
            aria-busy="true"
            className="grid grid-cols-2 gap-3 p-3 @min-[30rem]:grid-cols-4"
          >
            <p className="sr-only">Loading the library.</p>
            {Array.from({ length: 8 }, (_, i) => (
              <span
                key={i}
                className="block aspect-square rounded-3 bg-surface-2"
              />
            ))}
          </div>
        ) : status === "error" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-sm text-foreground">The library did not load.</p>
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
        ) : openAlbum ? (
          <motion.div
            key={openAlbum.id}
            className="flex flex-col gap-4 p-3"
            initial={{ opacity: 0, x: motionSafe ? distances.shift : 0 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              opacity: { duration: durations.base, ease: easings.enter },
              x: motionSafe ? springs.glide : { duration: 0 },
            }}
          >
            <div className="flex flex-wrap items-end gap-4">
              <span className="size-28 shrink-0 overflow-hidden rounded-3 shadow-[0_8px_24px_color-mix(in_oklab,black_18%,transparent)]">
                <CoverArt cover={openAlbum.cover} seed={openAlbum.id} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-lg leading-6 font-semibold">
                    {openAlbum.title}
                  </h3>
                  <p className="truncate text-[13px] text-ink-2">
                    {openAlbum.artist}
                  </p>
                  <p className="font-mono text-[11px] text-ink-3 tabular-nums">
                    {openAlbum.year} · {plural(openAlbum.tracks.length, "song")}{" "}
                    ·{" "}
                    {Math.round(
                      openAlbum.tracks.reduce((s, t) => s + t.duration, 0) / 60,
                    )}{" "}
                    min
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => playAlbum(openAlbum)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    <Play aria-hidden className="size-3.5 fill-current" />
                    Play
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => playAlbum(openAlbum, 0, true)}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border border-hairline px-3.5 text-xs text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50",
                      FOCUS,
                    )}
                  >
                    <Shuffle aria-hidden className="size-3.5" />
                    Shuffle
                  </button>
                  <FollowKnot
                    size="sm"
                    target={openAlbum.artist}
                    count={openAlbum.followers}
                    pressed={follows.includes(openAlbum.artist)}
                    onPressedChange={(on) => {
                      const a = openAlbum.artist;
                      setFollows(
                        on ? [...follows, a] : follows.filter((x) => x !== a),
                      );
                    }}
                    sound={sound}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
            <ol role="list" className="flex flex-col">
              {openAlbum.tracks.map((t, i) => trackRow(t, openAlbum, i, false))}
            </ol>
          </motion.div>
        ) : tab === "songs" ? (
          <ol role="list" className="flex flex-col p-2">
            {albums
              .flatMap((a) => a.tracks.map((t) => ({ t, a })))
              .map(({ t, a }, i) => trackRow(t, a, i, true))}
          </ol>
        ) : (
          <ul
            role="list"
            className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-x-3 gap-y-4 p-3"
          >
            {albums.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  data-music-album={a.id}
                  aria-label={`${a.title}, ${a.artist}`}
                  onClick={() => {
                    setAlbumId(a.id);
                    audio.play("tick", { pitch: 1, gain: 0.3 });
                  }}
                  className={cn(
                    "group/music-app-cover flex w-full flex-col gap-2 rounded-3 text-left",
                    FOCUS,
                  )}
                >
                  <span className="relative block aspect-square w-full overflow-hidden rounded-3 shadow-[0_4px_14px_color-mix(in_oklab,black_12%,transparent)] transition-transform duration-200 group-hover/music-app-cover:-translate-y-0.5">
                    <CoverArt cover={a.cover} seed={a.id} />
                    {now?.album.id === a.id ? (
                      <span className="absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-full bg-card/90">
                        {eq}
                      </span>
                    ) : null}
                  </span>
                  <span className="min-w-0 px-0.5">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {a.title}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {a.artist}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  /* ------------------------------ the players --------------------------- */

  const artId = motionSafe ? `${idBase}-art` : undefined;
  const surfaceId = motionSafe ? `${idBase}-surface` : undefined;
  const titleId = motionSafe ? `${idBase}-title` : undefined;
  const playId = motionSafe ? `${idBase}-play` : undefined;
  const progress = useTransform(pos, (p) => r2(clampN(p / duration, 0, 1)));
  const ring = useTransform(progress, (p) => r2((1 - p) * 113.1));

  const playButton = (big: boolean) => (
    <motion.button
      layoutId={playId}
      type="button"
      aria-label={isPlaying ? "Pause" : "Play"}
      aria-disabled={disabled || !now || undefined}
      onClick={(event) => toggle(event.currentTarget)}
      transition={springs.glide}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        big
          ? "size-14 bg-primary text-primary-foreground shadow-[0_6px_18px_color-mix(in_oklab,var(--accent)_35%,transparent)]"
          : "size-9 text-foreground hover:bg-surface-2",
        FOCUS,
      )}
      style={{ borderRadius: 999 }}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={isPlaying ? "pause" : "play"}
          className="flex"
          initial={{ opacity: 0, scale: motionSafe ? 0.6 : 1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{
            opacity: 0,
            scale: motionSafe ? 0.6 : 1,
            transition: exitFor(durations.fast),
          }}
          transition={motionSafe ? springs.flick : { duration: durations.fast }}
        >
          {isPlaying ? (
            <Pause
              aria-hidden
              className={cn("fill-current", big ? "size-6" : "size-4")}
            />
          ) : (
            <Play
              aria-hidden
              className={cn(
                "fill-current",
                big ? "ml-0.5 size-6" : "ml-0.5 size-4",
              )}
            />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );

  const miniPlayer =
    now && !isOpen && status === "ready" ? (
      <div
        className={cn(
          "pointer-events-none absolute z-20",
          mini === "bar"
            ? "inset-x-0 bottom-0"
            : mini === "pill"
              ? "inset-x-0 bottom-3 flex justify-center px-3"
              : "right-3 bottom-3",
        )}
      >
        <motion.div
          layoutId={surfaceId}
          transition={springs.glide}
          className={cn(
            "pointer-events-auto relative flex items-center gap-2 overflow-hidden border-hairline-strong bg-popover",
            mini === "bar"
              ? "h-16 border-t px-3"
              : mini === "pill"
                ? "h-14 w-full max-w-[22rem] border pr-2 pl-2 shadow-[0_10px_30px_color-mix(in_oklab,black_20%,transparent)]"
                : "w-56 flex-col items-stretch gap-2 border p-2 shadow-[0_10px_30px_color-mix(in_oklab,black_20%,transparent)]",
          )}
          style={{
            borderRadius: mini === "bar" ? 0 : mini === "pill" ? 999 : 12,
          }}
        >
          {mini === "bar" ? (
            <motion.span
              aria-hidden
              className="absolute inset-x-0 top-0 h-0.5 origin-left bg-cobalt-bright"
              style={{ scaleX: progress }}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <button
              type="button"
              data-music-mini=""
              aria-label={`Open player, ${now.track.title} by ${now.album.artist}`}
              aria-haspopup="dialog"
              onClick={(event) => openPlayer(event.currentTarget)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2.5 rounded-2 text-left",
                FOCUS,
              )}
            >
              <span className="relative shrink-0">
                <motion.span
                  layoutId={artId}
                  transition={springs.glide}
                  className={cn(
                    "block overflow-hidden",
                    mini === "pill"
                      ? "size-10 rounded-full"
                      : "size-10 rounded-2",
                  )}
                  style={{ borderRadius: mini === "pill" ? 999 : 6 }}
                >
                  <CoverArt cover={now.album.cover} seed={now.album.id} />
                </motion.span>
                {mini === "pill" ? (
                  <svg
                    aria-hidden
                    viewBox="0 0 44 44"
                    className="pointer-events-none absolute -inset-0.5 size-11 -rotate-90"
                  >
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      strokeWidth="2"
                      className="stroke-hairline-strong"
                    />
                    <motion.circle
                      cx="22"
                      cy="22"
                      r="18"
                      fill="none"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="113.1"
                      className="stroke-cobalt-bright"
                      style={{ strokeDashoffset: ring }}
                    />
                  </svg>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <motion.span
                  layoutId={titleId}
                  transition={springs.glide}
                  className="block truncate text-[13px] font-medium text-foreground"
                >
                  {now.track.title}
                </motion.span>
                <span className="block truncate text-[11px] text-ink-3">
                  {now.album.artist}
                </span>
              </span>
            </button>
            {mini === "bar" && mode !== "phone" ? (
              <button
                type="button"
                aria-label="Previous"
                onClick={(event) => prev(event.currentTarget)}
                className={ICON_BTN}
              >
                <SkipBack aria-hidden className="size-4 fill-current" />
              </button>
            ) : null}
            {playButton(false)}
            {mini !== "pill" ? (
              <button
                type="button"
                aria-label="Next"
                aria-disabled={!queueIds.length || undefined}
                onClick={(event) => next(event.currentTarget)}
                className={ICON_BTN}
              >
                <SkipForward aria-hidden className="size-4 fill-current" />
              </button>
            ) : null}
          </div>
          {mini === "card" ? (
            <span className="block h-1 overflow-hidden rounded-full bg-surface-2">
              <motion.span
                className="block h-full origin-left rounded-full bg-cobalt-bright"
                style={{ scaleX: progress }}
              />
            </span>
          ) : null}
        </motion.div>
      </div>
    ) : null;

  // The player lays its disc beside the controls when there is room for
  // both at a size worth turning, and stacks them otherwise.
  const playerW = W - (panelBeside ? 300 : 0);
  const sideBySide = mode !== "phone" && playerW >= 560;
  const discSize = Math.round(
    sideBySide
      ? clampN(Math.min(H - 150, playerW / 2 - 64), 140, 320)
      : clampN(Math.min(W - 112, H - 360), 120, 300),
  );

  const fullPlayer =
    now && isOpen ? (
      <motion.div
        layoutId={surfaceId}
        key="player"
        role="dialog"
        aria-modal="true"
        aria-labelledby={playerTitleId}
        transition={springs.glide}
        initial={motionSafe ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={motionSafe ? undefined : { opacity: 0, transition: exitFor() }}
        className="absolute inset-0 z-30 overflow-hidden bg-card"
        style={{ borderRadius: 0, y: pull }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (sheet) {
              setSheet(false);
              focusNext.current = () =>
                root?.querySelector<HTMLElement>("[data-music-queue]");
            } else closePlayer();
            return;
          }
          if (event.key !== "Tab") return;
          const nodes = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not([tabindex='-1']), [role=slider], [role=listitem][tabindex='0']",
            ),
          ].filter((n) => !n.closest("[inert]"));
          const first = nodes[0];
          const last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        {/* Laid out with the surface, so its content keeps its size while
            the surface grows around it instead of stretching with it. */}
        <motion.div
          layout={motionSafe}
          transition={springs.glide}
          className={cn(
            "grid h-full",
            panelBeside
              ? "grid-cols-[minmax(0,1fr)_minmax(0,300px)]"
              : "grid-cols-1",
          )}
        >
          <div
            className="grid h-full grid-rows-[auto_minmax(0,1fr)]"
            inert={sheet}
          >
            <div
              {...grab}
              className="relative flex h-12 cursor-grab touch-pan-x items-center gap-2 px-2 select-none"
            >
              <span
                aria-hidden
                className="absolute top-1.5 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-hairline-strong"
              />
              <button
                type="button"
                data-music-close=""
                aria-label="Close player"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={closePlayer}
                className={ICON_BTN}
              >
                <ChevronDown aria-hidden className="size-5" />
              </button>
              <p className="min-w-0 flex-1 truncate text-center text-[11px] text-ink-3">
                Playing from{" "}
                <span className="font-medium text-ink-2">
                  {now.album.title}
                </span>
              </p>
              {panelBeside ? (
                <span className="size-9" />
              ) : (
                <button
                  type="button"
                  data-music-queue=""
                  aria-label="Up next"
                  aria-expanded={sheet}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setSheet(true);
                    audio.play("tick", { pitch: 1.1, gain: 0.3 });
                    focusNext.current = () =>
                      document.getElementById(sheetTitleId);
                  }}
                  className={ICON_BTN}
                >
                  <ListMusic aria-hidden className="size-4" />
                </button>
              )}
            </div>
            <div
              className={cn(
                "@container overflow-y-auto overscroll-contain px-6 pb-6",
                sideBySide
                  ? "grid grid-cols-2 items-center-safe gap-8"
                  : "flex flex-col items-center-safe justify-center-safe gap-5",
              )}
            >
              <div className="flex justify-center">
                <Disc
                  kind={disc}
                  album={now.album}
                  size={discSize}
                  angle={angle}
                  out={out}
                  artId={artId}
                />
              </div>
              <div className="flex w-full flex-col items-center gap-5">
                <div className="w-full max-w-sm text-center">
                  <motion.h2
                    id={playerTitleId}
                    layoutId={titleId}
                    transition={springs.glide}
                    className="truncate text-lg leading-7 font-semibold"
                  >
                    {now.track.title}
                  </motion.h2>
                  <p className="truncate text-[13px] text-ink-2">
                    {now.album.artist} · {now.album.title}
                  </p>
                </div>
                <div className="w-full max-w-sm">
                  <Scrubber
                    pos={pos}
                    duration={duration}
                    secs={secs}
                    motionSafe={motionSafe}
                    disabled={disabled}
                    onGrab={(held) => {
                      grabbing.current = held;
                    }}
                    onScrub={scrub}
                    onSeek={seek}
                  />
                </div>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    aria-label="Previous"
                    onClick={(event) => prev(event.currentTarget)}
                    className={cn(ICON_BTN, "size-11")}
                  >
                    <SkipBack aria-hidden className="size-5 fill-current" />
                  </button>
                  {playButton(true)}
                  <button
                    type="button"
                    aria-label="Next"
                    aria-disabled={!queueIds.length || undefined}
                    onClick={(event) => next(event.currentTarget)}
                    className={cn(ICON_BTN, "size-11")}
                  >
                    <SkipForward aria-hidden className="size-5 fill-current" />
                  </button>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    aria-label="Shuffle"
                    aria-pressed={shuffle}
                    onClick={(event) => {
                      const on = !shuffle;
                      setShuffle(on);
                      audio.play("tick", {
                        pitch: on ? 1.2 : 0.9,
                        gain: 0.35,
                        pan: panOf(event.currentTarget),
                      });
                      if (on) {
                        setQueue(
                          [...queueIds].sort(
                            (x, y) =>
                              hash(`${x}|${trackId}`) - hash(`${y}|${trackId}`),
                          ),
                        );
                      }
                      say(
                        on ? "Shuffle on. Up next is mixed." : "Shuffle off.",
                      );
                    }}
                    className={cn(
                      ICON_BTN,
                      "size-8",
                      shuffle &&
                        "bg-cobalt-wash text-cobalt-bright hover:bg-cobalt-wash",
                    )}
                  >
                    <Shuffle aria-hidden className="size-4" />
                  </button>
                  <RepeatCoil
                    compact
                    size="sm"
                    value={repeatMode}
                    onValueChange={setRepeat}
                    sound={sound}
                    disabled={disabled}
                  />
                  <MuteCone
                    compact
                    size="sm"
                    pressed={isMuted}
                    onPressedChange={setMuted}
                    level={vol}
                    onLevelChange={setVol}
                    name="Mute music"
                    sound={sound}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          </div>
          {panelBeside ? (
            <div className="border-l border-hairline">{queueList}</div>
          ) : null}
        </motion.div>
        <AnimatePresence>
          {sheet && !panelBeside ? (
            <motion.div
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby={sheetTitleId}
              className="absolute inset-x-0 bottom-0 z-10 h-[72%] overflow-hidden rounded-t-4 border-t border-hairline-strong bg-popover shadow-[0_-12px_32px_color-mix(in_oklab,black_20%,transparent)]"
              initial={motionSafe ? { y: "100%" } : { opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={
                motionSafe
                  ? { y: "100%", transition: exitFor(durations.slow) }
                  : { opacity: 0, transition: exitFor() }
              }
              transition={
                motionSafe ? springs.glide : { duration: durations.fast }
              }
            >
              {queueList}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.div>
    ) : null;

  return (
    <div
      ref={setRoot}
      role="region"
      aria-label={label}
      className={cn(
        "@container relative isolate h-[560px] w-full overflow-clip rounded-4 border border-hairline bg-card text-foreground",
        disabled && "opacity-70",
        className,
      )}
    >
      <div
        className={cn(
          "grid h-full",
          panelBeside && mode === "desktop"
            ? "grid-cols-[minmax(0,1fr)_300px]"
            : "grid-cols-1",
        )}
        inert={isOpen && !!now}
      >
        {library}
        {panelBeside && mode === "desktop" ? (
          <div
            className="border-l border-hairline"
            style={{ paddingBottom: mini === "bar" ? 64 : 0 }}
          >
            {queueList}
          </div>
        ) : null}
      </div>
      {miniPlayer}
      <AnimatePresence>{fullPlayer}</AnimatePresence>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
